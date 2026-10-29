import { expect } from '@playwright/test'
import { test } from './fixtures/test.js'

import { checked, expectStock, mutate, operationalFixture, operationalTargetFromEnvironment, selectRemote } from './fixtures/operational.js'

test('recibe, reserva, despacha y entrega dos lotes mediante FEFO', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  page.on('pageerror', (error) => console.error(`Error de navegador: ${error.message}`))

  const f = await operationalFixture(page, operationalTargetFromEnvironment())
  const rows = (table: string) => f.api.from(table).select('*').eq('organization_id', f.organizationId)
  const lotA = `A-${f.reference}`
  const lotB = `B-${f.reference}`
  const expirationA = f.expiration
  const expirationBDate = new Date(`${expirationA}T12:00:00.000Z`)
  expirationBDate.setUTCDate(expirationBDate.getUTCDate() + 30)
  const expirationB = expirationBDate.toISOString().slice(0, 10)
  let movementIdsBeforeDelivery: string[] = []

  expect(new Date(`${expirationA}T00:00:00.000Z`).getTime()).toBeGreaterThan(Date.now())
  expect(Date.parse(`${expirationB}T00:00:00.000Z`)).toBeGreaterThan(Date.parse(`${expirationA}T00:00:00.000Z`))
  expect(await checked(rows('inventory_movements').eq('product_id', f.productId))).toHaveLength(0)

  await test.step('Compra de diez y recepción inspeccionada dividida en dos lotes', async () => {
    await page.goto('/compras')
    await page.getByRole('button', { name: 'Registrar compra', exact: true }).click()
    const purchaseDialog = page.getByRole('dialog', { name: 'Registrar compra', exact: true })
    await selectRemote(purchaseDialog, 'Proveedor', f.reference)
    await purchaseDialog.getByLabel('Serie', { exact: false }).fill('F001')
    await purchaseDialog.getByLabel('Número', { exact: false }).fill(f.documentNumber)
    await selectRemote(purchaseDialog, 'Almacén de recepción', f.reference)
    await selectRemote(purchaseDialog, 'Producto 1', f.reference)
    await purchaseDialog.getByLabel(/^Cantidad del producto 1/).fill('10')
    await purchaseDialog.getByLabel('Costo unitario del producto 1', { exact: true }).fill('10')
    await purchaseDialog.getByLabel('Lote del producto 1', { exact: true }).fill(lotA)
    await purchaseDialog.getByLabel('Vencimiento del producto 1', { exact: true }).fill(expirationA)
    await mutate(page, 'save_purchase_order', () => purchaseDialog.getByRole('button', { name: 'Guardar borrador' }).click())
    await expect(purchaseDialog).toBeHidden()

    const purchaseOrders = await checked(rows('purchase_orders').eq('supplier_id', f.supplierId))
    expect(purchaseOrders).toHaveLength(1)
    const purchase = purchaseOrders[0]
    const purchaseItems = await checked(rows('purchase_order_items').eq('purchase_order_id', purchase.id))
    expect(purchaseItems).toHaveLength(1)
    expect(purchaseItems[0].product_id).toBe(f.productId)
    expect(Number(purchaseItems[0].quantity)).toBe(10)
    const purchaseRow = page.getByRole('row').filter({ hasText: f.name })
    await purchaseRow.getByRole('button', { name: /^Emitir / }).click()
    const issueDialog = page.getByRole('alertdialog', { name: 'Emitir orden de compra' })
    await mutate(page, 'issue_purchase_order', () => issueDialog.getByRole('button', { name: 'Confirmar emisión' }).click())
    await expect(issueDialog).toBeHidden()
    expect((await checked(rows('purchase_orders').eq('id', purchase.id).single())).status).toBe('issued')

    await purchaseRow.getByRole('button', { name: /^Recibir / }).click()
    const receiptDialog = page.getByRole('dialog', { name: 'Registrar recepción' })
    await expect(receiptDialog.getByRole('button', { name: 'Dividir lote', exact: true })).toBeVisible()
    await receiptDialog.getByRole('button', { name: 'Dividir lote', exact: true }).click()

    const quantities = receiptDialog.getByRole('spinbutton', { name: /^Cantidad en / })
    const locations = receiptDialog.getByRole('combobox', { name: 'Ubicación', exact: true })
    const lots = receiptDialog.getByRole('textbox', { name: /^Lote/ })
    const expirations = receiptDialog.getByRole('textbox', { name: /^Vencimiento/ })
    const accepted = receiptDialog.getByRole('spinbutton', { name: 'Cantidad aceptada', exact: true })
    const rejected = receiptDialog.getByRole('spinbutton', { name: 'Cantidad rechazada', exact: true })
    await expect(quantities).toHaveCount(2)
    await expect(locations).toHaveCount(2)
    await expect(lots).toHaveCount(2)
    await expect(expirations).toHaveCount(2)
    await expect(accepted).toHaveCount(2)
    await expect(rejected).toHaveCount(2)

    await quantities.nth(0).fill('3')
    await quantities.nth(1).fill('7')
    await locations.nth(0).selectOption(f.locationId)
    await locations.nth(1).selectOption(f.locationId)
    await lots.nth(0).fill(lotA)
    await lots.nth(1).fill(lotB)
    await expirations.nth(0).fill(expirationA)
    await expirations.nth(1).fill(expirationB)
    await accepted.nth(0).fill('3')
    await accepted.nth(1).fill('7')
    await expect(rejected.nth(0)).toHaveValue('0')
    await expect(rejected.nth(1)).toHaveValue('0')
    await expect(accepted.nth(0)).toHaveValue('3')
    await expect(accepted.nth(1)).toHaveValue('7')

    await mutate(page, 'receive_purchase_order_partial_inspected', () => receiptDialog.getByRole('button', { name: 'Confirmar recepción' }).click())
    await expect(receiptDialog).toBeHidden()
    expect((await checked(rows('purchase_orders').eq('id', purchase.id).single())).status).toBe('received')

    const receipts = await checked(rows('purchase_receipts').eq('purchase_order_id', purchase.id))
    expect(receipts).toHaveLength(1)
    const receipt = receipts[0]
    const receiptItems = await checked(rows('purchase_receipt_items').eq('receipt_id', receipt.id))
    expect(receiptItems).toHaveLength(2)
    const receivedByLot = new Map(receiptItems.map((item) => [item.lot, item]))
    expect(receivedByLot.get(lotA)).toMatchObject({
      organization_id: f.organizationId,
      purchase_order_item_id: purchaseItems[0].id,
      product_id: f.productId,
      warehouse_id: f.warehouseId,
      location_id: f.locationId,
      lot: lotA,
      expiration_date: expirationA,
    })
    expect(receivedByLot.get(lotB)).toMatchObject({
      organization_id: f.organizationId,
      purchase_order_item_id: purchaseItems[0].id,
      product_id: f.productId,
      warehouse_id: f.warehouseId,
      location_id: f.locationId,
      lot: lotB,
      expiration_date: expirationB,
    })
    expect(Number(receivedByLot.get(lotA)?.quantity)).toBe(3)
    expect(Number(receivedByLot.get(lotB)?.quantity)).toBe(7)

    const inspections = await checked(rows('purchase_receipt_inspections').eq('purchase_receipt_id', receipt.id))
    expect(inspections).toHaveLength(2)
    for (const item of receiptItems) {
      const inspection = inspections.find((candidate) => candidate.purchase_receipt_item_id === item.id)
      expect(inspection).toMatchObject({
        organization_id: f.organizationId,
        purchase_order_id: purchase.id,
        purchase_order_item_id: purchaseItems[0].id,
        product_id: f.productId,
        status: 'completed',
      })
      expect(Number(inspection?.inspected_quantity)).toBe(Number(item.quantity))
      expect(Number(inspection?.accepted_quantity)).toBe(Number(item.quantity))
      expect(Number(inspection?.rejected_quantity)).toBe(0)
    }

    const entries = await checked(rows('inventory_movements').eq('product_id', f.productId).eq('movement_type', 'entrada'))
    expect(entries).toHaveLength(2)
    for (const [lot, expiration, quantity] of [[lotA, expirationA, 3], [lotB, expirationB, 7]] as const) {
      const item = receivedByLot.get(lot)!
      const movement = entries.find((candidate) => candidate.lot === lot)
      expect(movement).toMatchObject({
        organization_id: f.organizationId,
        source_type: 'purchase-receipt',
        source_id: item.id,
        product_id: f.productId,
        warehouse_id: f.warehouseId,
        location_id: f.locationId,
        stock_status: 'available',
        lot,
        expiration_date: expiration,
      })
      expect(Number(movement?.quantity)).toBe(quantity)
    }
    await expectStock(f, 10, 0, 10)
  })

  await test.step('Cotización de seis y reserva FEFO por bucket completo', async () => {
    await page.goto('/ventas')
    await page.getByRole('button', { name: 'Nueva cotización', exact: true }).click()
    const quoteDialog = page.getByRole('dialog', { name: 'Nueva cotización' })
    await selectRemote(quoteDialog, 'Cliente', f.reference)
    await selectRemote(quoteDialog, 'Producto 1', f.reference)
    await quoteDialog.getByLabel('Cantidad del producto 1', { exact: true }).fill('6')
    await quoteDialog.getByLabel('Precio unitario del producto 1', { exact: true }).fill('25')
    await mutate(page, 'save_sales_quote', () => quoteDialog.getByRole('button', { name: 'Guardar borrador' }).click())
    await expect(quoteDialog).toBeHidden()
    await page.getByRole('row').filter({ hasText: f.name }).getByRole('button', { name: /^Emitir / }).click()
    const issueQuoteDialog = page.getByRole('alertdialog')
    await mutate(page, 'issue_sales_quote', () => issueQuoteDialog.getByRole('button', { name: 'Emitir cotización', exact: true }).click())
    await expect(issueQuoteDialog).toBeHidden()

    const quotes = await checked(rows('sales_quotes').eq('customer_id', f.customerId))
    expect(quotes).toHaveLength(1)
    const quote = quotes[0]
    expect(quote.status).toBe('emitida')
    const trigger = page.getByRole('row').filter({ hasText: f.name }).getByRole('button', { name: 'Crear pedido', exact: true })
    await trigger.click()
    const orderDialog = page.getByRole('dialog', { name: `Crear pedido ${quote.quote_number}` })
    await selectRemote(orderDialog, 'Almacén de preparación', f.reference)
    await orderDialog.getByRole('textbox', { name: 'Dirección', exact: true }).fill('Av. Pruebas SILSAN 123, Lima')
    await mutate(page, 'create_order_with_fulfillment', () => orderDialog.getByRole('button', { name: 'Confirmar pedido', exact: true }).click())
    await expect(orderDialog).toBeHidden()

    const orders = await checked(rows('orders').eq('source_quote_id', quote.id))
    expect(orders).toHaveLength(1)
    const order = orders[0]
    expect(order).toMatchObject({ status: 'confirmado', fulfillment_mode: 'delivery', warehouse_id: f.warehouseId })
    const orderItems = await checked(rows('order_items').eq('order_id', order.id))
    expect(orderItems).toHaveLength(1)
    const orderItem = orderItems[0]
    expect(Number(orderItem.quantity)).toBe(6)
    expect((await checked(rows('sales_quotes').eq('id', quote.id).single())).status).toBe('aceptada')

    const reservations = await checked(rows('inventory_reservations').eq('source_type', 'order-item').eq('source_id', orderItem.id))
    expect(reservations).toHaveLength(2)
    const reservedByLot = new Map(reservations.map((reservation) => [reservation.lot, reservation]))
    for (const [lot, expiration, quantity] of [[lotA, expirationA, 3], [lotB, expirationB, 3]] as const) {
      const reservation = reservedByLot.get(lot)
      expect(reservation).toMatchObject({
        organization_id: f.organizationId,
        source_type: 'order-item',
        source_id: orderItem.id,
        product_id: f.productId,
        warehouse_id: f.warehouseId,
        location_id: f.locationId,
        stock_status: 'available',
        lot,
        expiration_date: expiration,
        status: 'active',
      })
      expect(Number(reservation?.quantity)).toBe(quantity)
      expect(Number(reservation?.quantity_consumed)).toBe(0)
    }
    expect(Number(reservations.reduce((sum, reservation) => sum + Number(reservation.quantity), 0))).toBe(6)
    await expectStock(f, 10, 6, 4)
  })

  const order = await checked(rows('orders').eq('source_quote_id', (await checked(rows('sales_quotes').eq('customer_id', f.customerId).single())).id).single())
  const orderItem = await checked(rows('order_items').eq('order_id', order.id).single())
  const reservations = await checked(rows('inventory_reservations').eq('source_type', 'order-item').eq('source_id', orderItem.id))
  const reservedByLot = new Map(reservations.map((reservation) => [reservation.lot, reservation]))

  let saleId = ''
  let dispatchedMovements: Array<Record<string, unknown>> = []
  await test.step('Venta y despacho consumen una reserva por lote', async () => {
    await page.goto('/ventas?vista=ejecucion')
    await page.getByLabel('Buscar', { exact: true }).fill(f.reference)
    await page.getByRole('article').filter({ hasText: order.order_number }).getByRole('button', { name: 'Registrar venta' }).click()
    const saleDialog = page.getByRole('dialog', { name: 'Registrar venta' })
    await saleDialog.getByLabel(/^Comprobante/).selectOption('nota-venta')
    await saleDialog.getByLabel(/^Serie/).fill('NV01')
    await saleDialog.getByLabel(/^Número/).fill(f.documentNumber)
    await mutate(page, 'create_sale_from_order', () => saleDialog.getByRole('button', { name: 'Registrar venta' }).click())
    await expect(saleDialog).toBeHidden()
    await expectStock(f, 10, 6, 4)

    const sales = await checked(rows('sales').eq('order_id', order.id))
    expect(sales).toHaveLength(1)
    const sale = sales[0]
    saleId = sale.id
    await page.getByRole('article').filter({ hasText: order.order_number }).getByRole('button', { name: 'Despachar bienes' }).click()
    const dispatchDialog = page.getByRole('dialog', { name: 'Despachar venta' })
    await expect(dispatchDialog.getByLabel('Cantidad de esta entrega')).toHaveValue('6')
    await mutate(page, 'dispatch_order_from_reservations', () => dispatchDialog.getByRole('button', { name: 'Confirmar despacho' }).click())
    await expect(dispatchDialog).toBeHidden()
    await expectStock(f, 4, 0, 4)

    const dispatchedSale = await checked(rows('sales').eq('id', sale.id).single())
    expect(dispatchedSale.status).toBe('despachada')
    expect((await checked(rows('orders').eq('id', order.id).single())).fulfillment_status).toBe('dispatched')
    const consumedReservations = await checked(rows('inventory_reservations').eq('source_type', 'order-item').eq('source_id', orderItem.id))
    expect(consumedReservations).toHaveLength(2)
    for (const [lot, expiration] of [[lotA, expirationA], [lotB, expirationB]] as const) {
      const reservation = consumedReservations.find((candidate) => candidate.lot === lot)
      expect(reservation).toMatchObject({
        organization_id: f.organizationId,
        source_id: orderItem.id,
        product_id: f.productId,
        warehouse_id: f.warehouseId,
        location_id: f.locationId,
        lot,
        expiration_date: expiration,
        status: 'consumed',
      })
      expect(Number(reservation?.quantity)).toBe(3)
      expect(Number(reservation?.quantity_consumed)).toBe(3)
    }
    const pendingQuantity = consumedReservations
      .filter((reservation) => reservation.status === 'active')
      .reduce((sum, reservation) => sum + Number(reservation.quantity) - Number(reservation.quantity_consumed), 0)
    expect(pendingQuantity).toBe(0)
    expect(consumedReservations.reduce((sum, reservation) => sum + Number(reservation.quantity), 0)).toBe(6)

    const movements = await checked(rows('inventory_movements').eq('product_id', f.productId))
    expect(movements).toHaveLength(4)
    movementIdsBeforeDelivery = movements.map((movement) => movement.id).sort()
    const entries = movements.filter((movement) => movement.movement_type === 'entrada')
    dispatchedMovements = movements.filter((movement) => movement.source_type === 'order-dispatch')
    expect(entries).toHaveLength(2)
    expect(dispatchedMovements).toHaveLength(2)
    const dispatchedByLot = new Map(dispatchedMovements.map((movement) => [movement.lot, movement]))
    for (const [lot, expiration] of [[lotA, expirationA], [lotB, expirationB]] as const) {
      const reservation = reservedByLot.get(lot)!
      const movement = dispatchedByLot.get(lot)
      expect(movement).toMatchObject({
        organization_id: f.organizationId,
        source_type: 'order-dispatch',
        source_id: orderItem.id,
        reservation_id: reservation.id,
        product_id: f.productId,
        warehouse_id: f.warehouseId,
        location_id: f.locationId,
        lot,
        expiration_date: expiration,
        movement_type: 'salida',
      })
      expect(Number(movement?.quantity)).toBe(3)
    }

    const physicalBalance = (lot: string, expiration: string) => movements
      .filter((movement) => movement.organization_id === f.organizationId
        && movement.product_id === f.productId
        && movement.warehouse_id === f.warehouseId
        && movement.location_id === f.locationId
        && movement.lot === lot
        && movement.expiration_date === expiration)
      .reduce((balance, movement) => balance
        + (movement.movement_type === 'entrada' ? 1 : -1) * Number(movement.quantity), 0)
    expect(physicalBalance(lotA, expirationA)).toBe(0)
    expect(physicalBalance(lotB, expirationB)).toBe(4)
  })

  let deliveryId = ''
  await test.step('Programación asigna explícitamente tres unidades de cada movimiento', async () => {
    await page.goto('/distribucion')
    await page.getByRole('region', { name: 'Pedidos por programar' }).getByLabel('Buscar', { exact: true }).fill(f.reference)
    await page.getByRole('row').filter({ hasText: order.order_number }).getByRole('button', { name: 'Programar envío' }).click()
    const deliveryDialog = page.getByRole('dialog', { name: 'Programar entrega', exact: true })
    await expect(deliveryDialog).toBeVisible()
    const lotAInput = deliveryDialog.getByRole('spinbutton', { name: `Cantidad del lote ${lotA}`, exact: true })
    const lotBInput = deliveryDialog.getByRole('spinbutton', { name: `Cantidad del lote ${lotB}`, exact: true })
    await expect(lotAInput).toBeVisible()
    await expect(lotBInput).toBeVisible()
    await lotAInput.fill('3')
    await lotBInput.fill('3')
    await deliveryDialog.getByLabel(/^Referencia interna de despacho/).fill(f.reference)
    await deliveryDialog.getByLabel(/^Número de guía de remisión/).fill(`T001-${f.documentNumber}`)
    await deliveryDialog.locator('summary').filter({ hasText: 'Datos de ruta' }).click()
    await deliveryDialog.getByLabel(/^Conductor/).fill('Conductor E2E SILSAN')
    await deliveryDialog.getByLabel(/^Vehículo/).fill('Vehículo E2E')
    await deliveryDialog.getByLabel(/^Placa/).fill('E2E-123')
    await mutate(page, 'save_distribution_delivery', () => deliveryDialog.getByRole('button', { name: 'Programar entrega' }).click())
    await expect(deliveryDialog).toBeHidden()
    await expectStock(f, 4, 0, 4)

    const deliveries = await checked(rows('distribution_deliveries').eq('order_id', order.id))
    expect(deliveries).toHaveLength(1)
    const delivery = deliveries[0]
    deliveryId = delivery.id
    expect(delivery.delivery_status).toBe('programado')
    const deliveryItems = await checked(rows('distribution_delivery_items').eq('delivery_id', delivery.id))
    expect(deliveryItems).toHaveLength(1)
    const deliveryItem = deliveryItems[0]
    expect(deliveryItem.order_line_id).toBe(orderItem.id)
    expect(Number(deliveryItem.quantity)).toBe(6)

    const allocations = await checked(rows('distribution_delivery_inventory_allocations').eq('delivery_id', delivery.id))
    expect(allocations).toHaveLength(2)
    const allocationByMovement = new Map(allocations.map((allocation) => [allocation.inventory_movement_id, allocation]))
    for (const movement of dispatchedMovements) {
      const allocation = allocationByMovement.get(movement.id)
      expect(allocation).toMatchObject({
        organization_id: f.organizationId,
        delivery_id: delivery.id,
        order_id: order.id,
        order_line_id: orderItem.id,
        inventory_movement_id: movement.id,
      })
      expect(Number(allocation?.quantity)).toBe(3)
    }
    expect(allocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0)).toBe(6)
    const movementsAfterScheduling = await checked(rows('inventory_movements').eq('product_id', f.productId))
    expect(movementsAfterScheduling.map((movement) => movement.id).sort()).toEqual(movementIdsBeforeDelivery)

    const trace = await checked(f.api.rpc('list_distribution_delivery_inventory_trace', {
      requested_organization_id: f.organizationId,
      requested_delivery_id: delivery.id,
    })) as Array<Record<string, unknown>>
    expect(trace).toHaveLength(2)
    const traceByMovement = new Map(trace.map((line) => [line.inventory_movement_id, line]))
    for (const movement of dispatchedMovements) {
      expect(traceByMovement.get(movement.id)).toMatchObject({
        delivery_id: delivery.id,
        order_id: order.id,
        order_item_id: orderItem.id,
        inventory_movement_id: movement.id,
        allocated_quantity: 3,
        lot: movement.lot,
        expiration_date: movement.expiration_date,
        warehouse_id: f.warehouseId,
        location_id: f.locationId,
        reservation_id: movement.reservation_id,
      })
    }
  })

  await test.step('Entrega completa conserva lotes, reservas y ledger', async () => {
    await page.goto('/distribucion?vista=seguimiento')
    await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(order.order_number)
    const article = page.getByRole('article').filter({ hasText: order.order_number }).filter({ hasText: f.name })
    await expect(article).toHaveCount(1)
    for (const [action, status] of [
      ['Iniciar preparación', 'preparando'],
      ['Iniciar traslado', 'en_curso'],
      ['Marcar en destino', 'en_destino'],
    ]) {
      await mutate(page, 'save_distribution_delivery', () => article.getByRole('button', { name: action, exact: true }).click())
      await expect.poll(async () => (await checked(rows('distribution_deliveries').eq('id', deliveryId).single())).delivery_status)
        .toBe(status)
    }
    await article.getByRole('button', { name: 'Registrar resultado', exact: true }).click()
    const outcomeDialog = page.getByRole('dialog', { name: 'Registrar resultado de entrega' })
    await outcomeDialog.getByLabel('Recibido ahora', { exact: true }).fill('6')
    await outcomeDialog.getByLabel(/^Evidencia o constancia/).fill(`Conformidad completa ${f.reference}`)
    await mutate(page, 'record_distribution_delivery_outcome', () => outcomeDialog.getByRole('button', { name: 'Confirmar entrega completa' }).click())
    await expect(outcomeDialog).toBeHidden()

    await page.reload()
    await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(order.order_number)
    await expect(article).toContainText(/entregado/i)
    const delivery = await checked(rows('distribution_deliveries').eq('id', deliveryId).single())
    expect(delivery.delivery_status).toBe('entregado')
    expect((await checked(rows('orders').eq('id', order.id).single())).fulfillment_status).toBe('delivered')
    expect((await checked(rows('sales').eq('id', saleId).single())).status).toBe('despachada')

    const outcomes = await checked(rows('distribution_delivery_outcomes').eq('delivery_id', deliveryId))
    expect(outcomes).toHaveLength(1)
    const outcome = outcomes[0]
    expect(outcome).toMatchObject({
      organization_id: f.organizationId,
      delivery_id: deliveryId,
      result_status: 'entregado',
      evidence: `Conformidad completa ${f.reference}`,
    })
    const outcomeLines = await checked(rows('distribution_delivery_outcome_lines').eq('outcome_id', outcome.id))
    expect(outcomeLines).toHaveLength(1)
    expect(outcomeLines[0].order_line_id).toBe(orderItem.id)
    expect(Number(outcomeLines[0].quantity_delivered)).toBe(6)

    const movementsAfterDelivery = await checked(rows('inventory_movements').eq('product_id', f.productId))
    expect(movementsAfterDelivery).toHaveLength(4)
    expect(movementsAfterDelivery.map((movement) => movement.id).sort()).toEqual(movementIdsBeforeDelivery)
    const entries = movementsAfterDelivery.filter((movement) => movement.movement_type === 'entrada')
    const exits = movementsAfterDelivery.filter((movement) => movement.movement_type === 'salida')
    expect(entries).toHaveLength(2)
    expect(exits).toHaveLength(2)
    expect(exits.reduce((sum, movement) => sum + Number(movement.quantity), 0)).toBe(6)
    expect(entries.reduce((sum, movement) => sum + Number(movement.quantity), 0)).toBe(10)
    await expectStock(f, 4, 0, 4)

    const physicalBalance = (lot: string, expiration: string) => movementsAfterDelivery
      .filter((movement) => movement.organization_id === f.organizationId
        && movement.product_id === f.productId
        && movement.warehouse_id === f.warehouseId
        && movement.location_id === f.locationId
        && movement.lot === lot
        && movement.expiration_date === expiration)
      .reduce((balance, movement) => balance
        + (movement.movement_type === 'entrada' ? 1 : -1) * Number(movement.quantity), 0)
    expect(physicalBalance(lotA, expirationA)).toBe(0)
    expect(physicalBalance(lotB, expirationB)).toBe(4)
    const finalReservations = await checked(rows('inventory_reservations')
      .eq('source_type', 'order-item').eq('source_id', orderItem.id))
    expect(finalReservations).toHaveLength(2)
    expect(finalReservations.reduce((sum, reservation) => sum + Number(reservation.quantity), 0)).toBe(6)
    expect(finalReservations.reduce((sum, reservation) => sum + Number(reservation.quantity_consumed), 0)).toBe(6)
    expect(finalReservations.filter((reservation) => reservation.status === 'active')).toHaveLength(0)

    const finalCounts = {
      purchaseOrders: (await checked(rows('purchase_orders').eq('supplier_id', f.supplierId))).length,
      purchaseOrderLines: (await checked(rows('purchase_order_items').eq('purchase_order_id', (await checked(rows('purchase_orders').eq('supplier_id', f.supplierId).single())).id))).length,
      receipts: (await checked(rows('purchase_receipts').eq('purchase_order_id', (await checked(rows('purchase_orders').eq('supplier_id', f.supplierId).single())).id))).length,
      receiptItems: (await checked(rows('purchase_receipt_items').eq('receipt_id', (await checked(rows('purchase_receipts').eq('purchase_order_id', (await checked(rows('purchase_orders').eq('supplier_id', f.supplierId).single())).id).single())).id))).length,
      reservations: (await checked(rows('inventory_reservations').eq('source_id', orderItem.id).eq('source_type', 'order-item'))).length,
      deliveries: (await checked(rows('distribution_deliveries').eq('order_id', order.id))).length,
      deliveryItems: (await checked(rows('distribution_delivery_items').eq('delivery_id', deliveryId))).length,
      allocations: (await checked(rows('distribution_delivery_inventory_allocations').eq('delivery_id', deliveryId))).length,
      outcomes: (await checked(rows('distribution_delivery_outcomes').eq('delivery_id', deliveryId))).length,
    }
    expect(finalCounts).toEqual({
      purchaseOrders: 1,
      purchaseOrderLines: 1,
      receipts: 1,
      receiptItems: 2,
      reservations: 2,
      deliveries: 1,
      deliveryItems: 1,
      allocations: 2,
      outcomes: 1,
    })
    const finalAllocations = await checked(rows('distribution_delivery_inventory_allocations').eq('delivery_id', deliveryId))
    expect(finalAllocations).toHaveLength(2)
    const allocationByMovement = new Map(finalAllocations.map((allocation) => [allocation.inventory_movement_id, allocation]))
    const allocationQuantityForLot = (lot: string) => {
      const movement = dispatchedMovements.find((candidate) => candidate.lot === lot)
      expect(movement).toBeDefined()
      const allocation = allocationByMovement.get(movement!.id)
      expect(allocation).toBeDefined()
      return Number(allocation!.quantity)
    }
    expect(allocationQuantityForLot(lotA)).toBe(3)
    expect(allocationQuantityForLot(lotB)).toBe(3)
    const allocatedLineQuantity = finalAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0)
    expect(allocatedLineQuantity).toBe(6)
    const traceEvidence = {
      reference: f.reference,
      organizationId: f.organizationId,
      productId: f.productId,
      warehouseId: f.warehouseId,
      locationId: f.locationId,
      lots: [
        { lot: lotA, expiration: expirationA, received: 3, reserved: 3, dispatched: 3, allocatedToDelivery: allocationQuantityForLot(lotA), finalPhysical: 0 },
        { lot: lotB, expiration: expirationB, received: 7, reserved: 3, dispatched: 3, allocatedToDelivery: allocationQuantityForLot(lotB), finalPhysical: 4 },
      ],
      deliveryLineOutcome: {
        orderLineId: orderItem.id,
        orderedQuantity: Number(orderItem.quantity),
        allocatedQuantity: allocatedLineQuantity,
        resultStatus: outcome.result_status,
        quantityDelivered: Number(outcomeLines[0].quantity_delivered),
      },
      finalCounts,
      purchaseId: (await checked(rows('purchase_orders').eq('supplier_id', f.supplierId).single())).id,
      orderId: order.id,
      deliveryId,
      outcomeId: outcome.id,
    }
    expect(traceEvidence.lots.map(({ lot, allocatedToDelivery }) => ({ lot, allocatedToDelivery }))).toEqual([
      { lot: lotA, allocatedToDelivery: 3 },
      { lot: lotB, allocatedToDelivery: 3 },
    ])
    expect(traceEvidence.deliveryLineOutcome).toMatchObject({
      orderLineId: orderItem.id,
      orderedQuantity: 6,
      allocatedQuantity: 6,
      resultStatus: 'entregado',
      quantityDelivered: 6,
    })
    await testInfo.attach('trazabilidad-fefo-multilote', {
      body: JSON.stringify(traceEvidence, null, 2),
      contentType: 'application/json',
    })
  })
})
