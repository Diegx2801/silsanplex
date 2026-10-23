import { expect, type Page, type Route } from '@playwright/test'
import { test } from './fixtures/test.js'
import { execFileSync } from 'node:child_process'

import { checked, expectStock, mutate, operationalFixture, selectRemote } from './fixtures/operational.js'

interface ResultadoRpcEntrega {
  operationKey: string
  payload: Record<string, unknown>
  status: number
  body: string
  outcomeId?: string
}

function idResultadoRpc(body: string) {
  try {
    const parsed = JSON.parse(body) as unknown
    if (typeof parsed === 'string') return parsed
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
  } catch {
    return undefined
  }
  return undefined
}

async function interceptarPerdidaDeRespuesta(page: Page, deliveryId: string) {
  const attempts: ResultadoRpcEntrega[] = []
  let resolveFirst!: (attempt: ResultadoRpcEntrega) => void
  let resolveSecond!: (attempt: ResultadoRpcEntrega) => void
  const firstAttempt = new Promise<ResultadoRpcEntrega>((resolve) => { resolveFirst = resolve })
  const secondAttempt = new Promise<ResultadoRpcEntrega>((resolve) => { resolveSecond = resolve })
  const pattern = '**/rest/v1/rpc/record_distribution_delivery_outcome'
  const handler = async (route: Route) => {
    const envelope = route.request().postDataJSON() as { payload?: Record<string, unknown> }
    const payload = envelope.payload ?? {}
    if (payload.entregaId !== deliveryId) {
      await route.continue()
      return
    }

    // route.fetch executes the real RPC. Only after its committed response is
    // received do we abort the browser-facing request to model a lost response.
    const response = await route.fetch()
    const body = await response.text()
    const attempt: ResultadoRpcEntrega = {
      operationKey: String(payload.operationKey ?? ''),
      payload,
      status: response.status(),
      body,
      outcomeId: response.ok() ? idResultadoRpc(body) : undefined,
    }
    attempts.push(attempt)

    if (attempts.length === 1) {
      resolveFirst(attempt)
      if (response.ok()) await route.abort('connectionreset')
      else await route.fulfill({ response, body })
      return
    }
    if (attempts.length === 2) resolveSecond(attempt)
    await route.fulfill({ response, body })
  }

  await page.route(pattern, handler)
  return {
    attempts,
    firstAttempt,
    secondAttempt,
    close: () => page.unroute(pattern, handler),
  }
}

test('divide dos entregas y recupera una respuesta perdida del resultado', async ({ page }) => {
  test.setTimeout(180_000)
  page.on('pageerror', (error) => console.error('Error de navegador: ' + error.message))

  const phase2c2E2E = process.env.SILSAN_PHASE2C2_E2E === '1'
  const f = await operationalFixture(page, phase2c2E2E ? 'isolated-phase2c2' : 'persistent-silsan')
  const rows = (table: string) => f.api.from(table).select('*').eq('organization_id', f.organizationId)
  const outcomeAudits = async (deliveryIds: string[]): Promise<Array<{ entity_id: string }>> => {
    if (!phase2c2E2E) return checked(rows('audit_events')
      .eq('entity_type', 'distribution_delivery').in('entity_id', deliveryIds)
      .eq('action', 'DISTRIBUTION_OUTCOME_RECORDED'))
    // Read-only server-side evidence avoids granting ADMIN to the browser identity.
    for (const id of [f.organizationId, ...deliveryIds]) expect(id).toMatch(/^[0-9a-f-]{36}$/i)
    return JSON.parse(execFileSync('docker', ['exec', 'supabase_db_silsanplexp2c2',
      'psql', '-U', 'postgres', '-Atc',
      `select coalesce(json_agg(a), '[]'::json) from (select entity_id from public.audit_events where organization_id='${f.organizationId}' and entity_type='distribution_delivery' and action='DISTRIBUTION_OUTCOME_RECORDED' and entity_id in (${deliveryIds.map((id) => `'${id}'`).join(',')})) a`,
    ], { encoding: 'utf8' }))
  }
  const auditEventsForDelivery = (deliveryId: string) => outcomeAudits([deliveryId])
  const guia1 = 'T001-' + f.documentNumber
  const guia2 = 'T002-' + f.documentNumber
  const referencia1 = f.reference + '-ENVIO-1'
  const referencia2 = f.reference + '-ENVIO-2'

  expect(Date.parse(f.expiration + 'T00:00:00.000Z')).toBeGreaterThan(Date.now())
  expect(await checked(rows('inventory_movements').eq('product_id', f.productId))).toHaveLength(0)

  let purchaseId = ''
  let receiptId = ''
  let quoteId = ''
  let orderId = ''
  let orderNumber = ''
  let orderItemId = ''
  let saleId = ''
  let reservationId = ''
  let inboundMovementId = ''
  let outboundMovementId = ''
  let dispatchedQuantity = 0
  let movementIdsBeforeDeliveries: string[] = []

  await test.step('Comprar y recibir diez unidades; emitir pedido y despachar seis', async () => {
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
    await purchaseDialog.getByLabel('Lote del producto 1', { exact: true }).fill(f.lot)
    await purchaseDialog.getByLabel('Vencimiento del producto 1', { exact: true }).fill(f.expiration)
    await mutate(page, 'save_purchase_order', () => purchaseDialog.getByRole('button', { name: 'Guardar borrador' }).click())
    await expect(purchaseDialog).toBeHidden()

    const purchases = await checked(rows('purchase_orders').eq('supplier_id', f.supplierId))
    expect(purchases).toHaveLength(1)
    const purchase = purchases[0]
    purchaseId = purchase.id
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
    await receiptDialog.getByRole('combobox', { name: 'Ubicación', exact: true }).selectOption(f.locationId)
    await receiptDialog.getByLabel(/^Lote/).fill(f.lot)
    await receiptDialog.getByLabel(/^Vencimiento/).fill(f.expiration)
    await expect(receiptDialog.getByLabel('Cantidad aceptada', { exact: true })).toHaveValue('10')
    await expect(receiptDialog.getByLabel('Cantidad rechazada', { exact: true })).toHaveValue('0')
    await mutate(page, 'receive_purchase_order_partial_inspected', () => receiptDialog.getByRole('button', { name: 'Confirmar recepción' }).click())
    await expect(receiptDialog).toBeHidden()
    expect((await checked(rows('purchase_orders').eq('id', purchase.id).single())).status).toBe('received')

    const receipts = await checked(rows('purchase_receipts').eq('purchase_order_id', purchase.id))
    expect(receipts).toHaveLength(1)
    const receipt = receipts[0]
    receiptId = receipt.id
    const receiptItems = await checked(rows('purchase_receipt_items').eq('receipt_id', receipt.id))
    expect(receiptItems).toHaveLength(1)
    const receiptItem = receiptItems[0]
    expect(receiptItem).toMatchObject({
      organization_id: f.organizationId,
      purchase_order_item_id: purchaseItems[0].id,
      product_id: f.productId,
      warehouse_id: f.warehouseId,
      location_id: f.locationId,
      lot: f.lot,
      expiration_date: f.expiration,
    })
    expect(Number(receiptItem.quantity)).toBe(10)
    const inspections = await checked(rows('purchase_receipt_inspections').eq('purchase_receipt_id', receipt.id))
    expect(inspections).toHaveLength(1)
    expect(inspections[0]).toMatchObject({
      organization_id: f.organizationId,
      purchase_order_id: purchase.id,
      purchase_order_item_id: purchaseItems[0].id,
      product_id: f.productId,
      status: 'completed',
    })
    expect(Number(inspections[0].inspected_quantity)).toBe(10)
    expect(Number(inspections[0].accepted_quantity)).toBe(10)
    expect(Number(inspections[0].rejected_quantity)).toBe(0)

    const entries = await checked(rows('inventory_movements').eq('product_id', f.productId).eq('movement_type', 'entrada'))
    expect(entries).toHaveLength(1)
    const entry = entries[0]
    inboundMovementId = entry.id
    expect(entry).toMatchObject({
      organization_id: f.organizationId,
      source_type: 'purchase-receipt',
      source_id: receiptItem.id,
      product_id: f.productId,
      warehouse_id: f.warehouseId,
      location_id: f.locationId,
      stock_status: 'available',
      lot: f.lot,
      expiration_date: f.expiration,
    })
    expect(Number(entry.quantity)).toBe(10)
    await expectStock(f, 10, 0, 10)

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
    quoteId = quote.id
    expect(quote.status).toBe('emitida')
    await page.getByRole('row').filter({ hasText: f.name }).getByRole('button', { name: 'Crear pedido', exact: true }).click()
    const orderDialog = page.getByRole('dialog', { name: 'Crear pedido ' + quote.quote_number })
    await selectRemote(orderDialog, 'Almacén de preparación', f.reference)
    await orderDialog.getByRole('textbox', { name: 'Dirección', exact: true }).fill('Av. Pruebas SILSAN 123, Lima')
    await mutate(page, 'create_order_with_fulfillment', () => orderDialog.getByRole('button', { name: 'Confirmar pedido', exact: true }).click())
    await expect(orderDialog).toBeHidden()

    const orders = await checked(rows('orders').eq('source_quote_id', quote.id))
    expect(orders).toHaveLength(1)
    const order = orders[0]
    orderId = order.id
    orderNumber = order.order_number
    expect(order).toMatchObject({ status: 'confirmado', fulfillment_mode: 'delivery', warehouse_id: f.warehouseId })
    const orderItems = await checked(rows('order_items').eq('order_id', order.id))
    expect(orderItems).toHaveLength(1)
    const orderItem = orderItems[0]
    orderItemId = orderItem.id
    expect(Number(orderItem.quantity)).toBe(6)
    expect((await checked(rows('sales_quotes').eq('id', quote.id).single())).status).toBe('aceptada')

    const reservations = await checked(rows('inventory_reservations').eq('source_type', 'order-item').eq('source_id', orderItem.id))
    expect(reservations).toHaveLength(1)
    const reservation = reservations[0]
    reservationId = reservation.id
    expect(reservation).toMatchObject({
      organization_id: f.organizationId,
      source_type: 'order-item',
      source_id: orderItem.id,
      product_id: f.productId,
      warehouse_id: f.warehouseId,
      location_id: f.locationId,
      stock_status: 'available',
      lot: f.lot,
      expiration_date: f.expiration,
      status: 'active',
    })
    expect(Number(reservation.quantity)).toBe(6)
    expect(Number(reservation.quantity_consumed)).toBe(0)
    await expectStock(f, 10, 6, 4)

    await page.goto('/ventas?vista=ejecucion')
    await page.getByLabel('Buscar', { exact: true }).fill(f.reference)
    const orderArticle = page.getByRole('article').filter({ hasText: order.order_number })
    await orderArticle.getByRole('button', { name: 'Registrar venta' }).click()
    const saleDialog = page.getByRole('dialog', { name: 'Registrar venta' })
    await saleDialog.getByLabel(/^Comprobante/).selectOption('nota-venta')
    await saleDialog.getByLabel(/^Serie/).fill('NV01')
    await saleDialog.getByLabel(/^Número/).fill(f.documentNumber)
    await mutate(page, 'create_sale_from_order', () => saleDialog.getByRole('button', { name: 'Registrar venta' }).click())
    await expect(saleDialog).toBeHidden()

    const sales = await checked(rows('sales').eq('order_id', order.id))
    expect(sales).toHaveLength(1)
    const sale = sales[0]
    saleId = sale.id
    expect(sale.status).toBe('registrada')
    await orderArticle.getByRole('button', { name: 'Despachar bienes' }).click()
    const dispatchDialog = page.getByRole('dialog', { name: 'Despachar venta' })
    await expect(dispatchDialog.getByLabel('Cantidad de esta entrega')).toHaveValue('6')
    await mutate(page, 'dispatch_order_from_reservations', () => dispatchDialog.getByRole('button', { name: 'Confirmar despacho' }).click())
    await expect(dispatchDialog).toBeHidden()

    const dispatchedReservations = await checked(rows('inventory_reservations').eq('source_type', 'order-item').eq('source_id', orderItem.id))
    expect(dispatchedReservations).toHaveLength(1)
    expect(dispatchedReservations[0]).toMatchObject({ id: reservation.id, status: 'consumed' })
    expect(Number(dispatchedReservations[0].quantity)).toBe(6)
    expect(Number(dispatchedReservations[0].quantity_consumed)).toBe(6)
    const pendingReservations = dispatchedReservations
      .filter((item) => item.status === 'active')
      .reduce((sum, item) => sum + Number(item.quantity) - Number(item.quantity_consumed), 0)
    expect(pendingReservations).toBe(0)

    const dispatchedOrder = await checked(rows('orders').eq('id', order.id).single())
    expect(dispatchedOrder.fulfillment_status).toBe('dispatched')
    expect(dispatchedOrder.status).toBe('atendido')
    expect((await checked(rows('sales').eq('id', sale.id).single())).status).toBe('despachada')
    await expectStock(f, 4, 0, 4)

    const movements = await checked(rows('inventory_movements').eq('product_id', f.productId))
    expect(movements).toHaveLength(2)
    const exits = movements.filter((item) => item.movement_type === 'salida')
    expect(exits).toHaveLength(1)
    const exit = exits[0]
    outboundMovementId = exit.id
    dispatchedQuantity = Number(exit.quantity)
    expect(exit).toMatchObject({
      organization_id: f.organizationId,
      source_type: 'order-dispatch',
      source_id: orderItem.id,
      reservation_id: reservation.id,
      product_id: f.productId,
      warehouse_id: f.warehouseId,
      location_id: f.locationId,
      lot: f.lot,
      expiration_date: f.expiration,
      movement_type: 'salida',
    })
    expect(Number(exit.quantity)).toBe(6)
    expect(movements.find((item) => item.id === inboundMovementId)).toBeDefined()
    movementIdsBeforeDeliveries = movements.map((item) => item.id).sort()
  })

  async function programarEntrega(cantidad: number, guia: string, referencia: string) {
    await page.goto('/distribucion')
    const pendientes = page.getByRole('region', { name: 'Pedidos por programar' })
    await pendientes.getByLabel('Buscar', { exact: true }).fill(f.reference)
    const orderRow = pendientes.getByRole('row').filter({ hasText: orderNumber })
    await expect(orderRow).toHaveCount(1)
    await orderRow.getByRole('button', { name: 'Programar envío', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Programar entrega', exact: true })
    await expect(dialog).toBeVisible()
    const quantityField = dialog.getByRole('spinbutton', { name: 'Cantidad de ' + f.name + ' para este envío', exact: true })
    await expect(quantityField).toHaveAttribute('max', String(cantidad === 2 ? 6 : 4))
    await quantityField.fill(String(cantidad))
    const lotAllocation = dialog.getByRole('spinbutton', { name: 'Cantidad del lote ' + f.lot, exact: true })
    await expect(lotAllocation).toBeVisible()
    await expect(lotAllocation).toHaveAttribute('max', String(cantidad === 2 ? 6 : 4))
    await lotAllocation.fill(String(cantidad))
    await dialog.getByLabel(/^Referencia interna de despacho/).fill(referencia)
    await dialog.getByLabel(/^Número de guía de remisión/).fill(guia)
    await dialog.locator('summary').filter({ hasText: 'Datos de ruta' }).click()
    await dialog.getByLabel(/^Conductor/).fill('Conductor E2E SILSAN')
    await dialog.getByLabel(/^Vehículo/).fill('Vehículo E2E')
    await dialog.getByLabel(/^Placa/).fill('E2E-123')
    await mutate(page, 'save_distribution_delivery', () => dialog.getByRole('button', { name: 'Programar entrega', exact: true }).click())
    await expect(dialog).toBeHidden()
  }

  type ModoResultadoE2E = 'normal' | 'retry-identical' | 'change-after-loss'
  type EvidenciaRecuperacion = {
    first: ResultadoRpcEntrega
    replay?: ResultadoRpcEntrega
    changedAttempt?: ResultadoRpcEntrega
  }
  let primeraRecuperacion: EvidenciaRecuperacion | undefined
  let segundaRecuperacion: EvidenciaRecuperacion | undefined

  async function completarEntrega(
    deliveryId: string,
    guide: string,
    cantidad: number,
    evidence: string,
    mode: ModoResultadoE2E = 'normal',
  ): Promise<EvidenciaRecuperacion | undefined> {
    await page.goto('/distribucion?vista=seguimiento')
    await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(orderNumber)
    const article = page.getByRole('article').filter({ hasText: guide })
    await expect(article).toHaveCount(1)
    await expect(article).toContainText(orderNumber)
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
    await outcomeDialog.getByLabel('Recibido ahora', { exact: true }).fill(String(cantidad))
    await outcomeDialog.getByLabel(/^Evidencia o constancia/).fill(evidence)

    if (mode === 'normal') {
      await mutate(page, 'record_distribution_delivery_outcome', () => outcomeDialog.getByRole('button', { name: 'Confirmar entrega completa' }).click())
      await expect(outcomeDialog).toBeHidden()
      return undefined
    }

    const interception = await interceptarPerdidaDeRespuesta(page, deliveryId)
    const confirmButton = outcomeDialog.getByRole('button', { name: 'Confirmar entrega completa' })
    try {
      await confirmButton.click()
      const first = await interception.firstAttempt
      expect(first.status, 'La primera RPC real debe confirmar en PostgreSQL antes de perderse su respuesta').toBe(200)
      expect(first.outcomeId).toMatch(/^[0-9a-f-]{36}$/i)
      await expect(outcomeDialog.getByRole('alert')).toBeVisible()
      await expect(outcomeDialog.getByRole('alert')).toContainText(/\S/)

      const persistedAfterLostResponse = await checked(rows('distribution_delivery_outcomes').eq('delivery_id', deliveryId))
      expect(persistedAfterLostResponse).toHaveLength(1)
      expect(persistedAfterLostResponse[0].id).toBe(first.outcomeId)
      expect(await auditEventsForDelivery(deliveryId)).toHaveLength(1)
      const versionAfterCommit = Number((await checked(rows('distribution_deliveries').eq('id', deliveryId).single())).lock_version)
      await expectStock(f, 4, 0, 4)

      if (mode === 'retry-identical') {
        await mutate(page, 'record_distribution_delivery_outcome', () => confirmButton.click())
        const replay = await interception.secondAttempt
        expect(replay.status).toBe(200)
        expect(replay.operationKey).toBe(first.operationKey)
        expect(replay.payload).toEqual(first.payload)
        expect(replay.outcomeId).toBe(first.outcomeId)
        await expect(outcomeDialog).toBeHidden()

        const outcomesAfterReplay = await checked(rows('distribution_delivery_outcomes').eq('delivery_id', deliveryId))
        expect(outcomesAfterReplay).toHaveLength(1)
        const linesAfterReplay = await checked(rows('distribution_delivery_outcome_lines').eq('outcome_id', first.outcomeId!))
        expect(linesAfterReplay).toHaveLength(1)
        expect(Number(linesAfterReplay[0].quantity_delivered)).toBe(cantidad)
        expect(await auditEventsForDelivery(deliveryId)).toHaveLength(1)
        expect(Number((await checked(rows('distribution_deliveries').eq('id', deliveryId).single())).lock_version))
          .toBe(versionAfterCommit)
        await expectStock(f, 4, 0, 4)
        return { first, replay }
      }

      const evidenciaModificada = `${evidence} (referencia corregida)`
      await outcomeDialog.getByLabel(/^Evidencia o constancia/).fill(evidenciaModificada)
      const rejectedResponsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname === '/rest/v1/rpc/record_distribution_delivery_outcome'
        && response.request().method() === 'POST', { timeout: 15_000 })
      await confirmButton.click()
      const rejectedResponse = await rejectedResponsePromise
      const changedAttempt = await interception.secondAttempt
      expect(changedAttempt.operationKey).not.toBe(first.operationKey)
      expect(changedAttempt.payload.evidencia).toBe(evidenciaModificada)
      expect(changedAttempt.status).not.toBe(200)
      expect(rejectedResponse.ok(), 'Un comando nuevo sobre la entrega ya confirmada debe mostrarse como conflicto, no como éxito').toBe(false)
      await expect(outcomeDialog).toBeVisible()
      await expect(outcomeDialog.getByRole('alert')).toBeVisible()

      await outcomeDialog.getByLabel('Recibido ahora').fill(String(cantidad - 1))
      const quantityResponsePromise = page.waitForResponse('**/rest/v1/rpc/record_distribution_delivery_outcome')
      await outcomeDialog.getByRole('button', { name: 'Confirmar entrega parcial', exact: true }).click()
      const quantityResponse = await quantityResponsePromise
      const quantityCommand = quantityResponse.request().postDataJSON() as { payload: { operationKey: string } }
      expect(quantityCommand.payload.operationKey).not.toBe(changedAttempt.operationKey)
      expect(quantityCommand.payload.operationKey).not.toBe(first.operationKey)
      expect(quantityResponse.ok()).toBe(false)
      await expect(outcomeDialog).toBeVisible()
      await expect(outcomeDialog.getByRole('alert')).toBeVisible()

      const outcomesAfterChangedPayload = await checked(rows('distribution_delivery_outcomes').eq('delivery_id', deliveryId))
      expect(outcomesAfterChangedPayload).toHaveLength(1)
      const linesAfterChangedPayload = await checked(rows('distribution_delivery_outcome_lines').eq('outcome_id', first.outcomeId!))
      expect(linesAfterChangedPayload).toHaveLength(1)
      expect(await auditEventsForDelivery(deliveryId)).toHaveLength(1)
      expect(Number((await checked(rows('distribution_deliveries').eq('id', deliveryId).single())).lock_version))
        .toBe(versionAfterCommit)
      await expectStock(f, 4, 0, 4)
      await outcomeDialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
      await expect(outcomeDialog).toBeHidden()
      return { first, changedAttempt }
    } finally {
      await interception.close()
    }
  }

  let firstDeliveryId = ''
  await test.step('Programar, asignar y conformar la primera entrega de dos unidades', async () => {
    await programarEntrega(2, guia1, referencia1)
    const firstDeliveries = await checked(rows('distribution_deliveries').eq('order_id', orderId).eq('guide_number', guia1))
    expect(firstDeliveries).toHaveLength(1)
    const delivery = firstDeliveries[0]
    firstDeliveryId = delivery.id
    expect(delivery.delivery_status).toBe('programado')

    const items = await checked(rows('distribution_delivery_items').eq('delivery_id', delivery.id))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ order_id: orderId, order_line_id: orderItemId })
    expect(Number(items[0].quantity)).toBe(2)
    const allocations = await checked(rows('distribution_delivery_inventory_allocations').eq('delivery_id', delivery.id))
    expect(allocations).toHaveLength(1)
    expect(allocations[0]).toMatchObject({
      delivery_id: delivery.id,
      order_id: orderId,
      order_line_id: orderItemId,
      inventory_movement_id: outboundMovementId,
    })
    expect(Number(allocations[0].quantity)).toBe(2)
    expect(await checked(rows('inventory_movements').eq('product_id', f.productId))).toHaveLength(2)
    expect((await checked(rows('inventory_movements').eq('product_id', f.productId))).map((item) => item.id).sort())
      .toEqual(movementIdsBeforeDeliveries)
    await expectStock(f, 4, 0, 4)

    const trace = await checked(f.api.rpc('list_distribution_delivery_inventory_trace', {
      requested_organization_id: f.organizationId,
      requested_delivery_id: delivery.id,
    })) as Array<Record<string, unknown>>
    expect(trace).toHaveLength(1)
    expect(trace[0]).toMatchObject({
      delivery_id: delivery.id,
      order_id: orderId,
      order_item_id: orderItemId,
      inventory_movement_id: outboundMovementId,
      allocated_quantity: 2,
      lot: f.lot,
      expiration_date: f.expiration,
      warehouse_id: f.warehouseId,
      location_id: f.locationId,
      reservation_id: reservationId,
    })

    primeraRecuperacion = await completarEntrega(
      delivery.id,
      guia1,
      2,
      'Conformidad parcial de línea, primer envío ' + f.reference,
      phase2c2E2E ? 'retry-identical' : 'normal',
    )
    if (phase2c2E2E) {
      expect(primeraRecuperacion).toBeDefined()
      const originalPayload = primeraRecuperacion!.first.payload
      const versionBeforeConflicts = Number((await checked(rows('distribution_deliveries').eq('id', delivery.id).single())).lock_version)
      const conflictPayloads: Array<{ tipo: string; payload: Record<string, unknown> }> = [
        {
          tipo: 'evidencia',
          payload: { ...originalPayload, evidencia: `${String(originalPayload.evidencia)} modificada` },
        },
        {
          tipo: 'cantidad',
          payload: {
            ...originalPayload,
            lineas: (originalPayload.lineas as Array<Record<string, unknown>>).map((line) => ({
              ...line,
              cantidad: Number(line.cantidad) + 1,
            })),
          },
        },
      ]
      for (const conflict of conflictPayloads) {
        const response = await f.api.rpc('record_distribution_delivery_outcome', { payload: conflict.payload })
        expect(response.error?.message, `La misma operationKey con ${conflict.tipo} distinta debe rechazarse`)
          .toContain('DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED')
        expect(response.data).toBeNull()
      }
      const outcomesAfterConflicts = await checked(rows('distribution_delivery_outcomes').eq('delivery_id', delivery.id))
      expect(outcomesAfterConflicts).toHaveLength(1)
      const linesAfterConflicts = await checked(rows('distribution_delivery_outcome_lines')
        .eq('outcome_id', primeraRecuperacion!.first.outcomeId!))
      expect(linesAfterConflicts).toHaveLength(1)
      expect(await auditEventsForDelivery(delivery.id)).toHaveLength(1)
      expect(Number((await checked(rows('distribution_deliveries').eq('id', delivery.id).single())).lock_version))
        .toBe(versionBeforeConflicts)
      await expectStock(f, 4, 0, 4)
    }
    expect((await checked(rows('distribution_deliveries').eq('id', delivery.id).single())).delivery_status).toBe('entregado')
    const firstOutcomeRows = await checked(rows('distribution_delivery_outcomes').eq('delivery_id', delivery.id))
    expect(firstOutcomeRows).toHaveLength(1)
    expect(firstOutcomeRows[0]).toMatchObject({ delivery_id: delivery.id, result_status: 'entregado' })
    const firstOutcomeLines = await checked(rows('distribution_delivery_outcome_lines').eq('outcome_id', firstOutcomeRows[0].id))
    expect(firstOutcomeLines).toHaveLength(1)
    expect(firstOutcomeLines[0].order_line_id).toBe(orderItemId)
    expect(Number(firstOutcomeLines[0].quantity_delivered)).toBe(2)
    const partiallyFulfilled = await checked(rows('orders').eq('id', orderId).single())
    expect(partiallyFulfilled.fulfillment_status).toBe('partially_fulfilled')
    expect(partiallyFulfilled.status).toBe('atendido')
    expect((await checked(rows('sales').eq('id', saleId).single())).status).toBe('despachada')
    await expectStock(f, 4, 0, 4)
    expect((await checked(rows('inventory_movements').eq('product_id', f.productId))).map((item) => item.id).sort())
      .toEqual(movementIdsBeforeDeliveries)

    const firstScheduledTotal = items.reduce((sum, item) => sum + Number(item.quantity), 0)
    const firstAllocatedTotal = allocations.reduce((sum, item) => sum + Number(item.quantity), 0)
    const firstConfirmedTotal = firstOutcomeLines.reduce((sum, line) => sum + Number(line.quantity_delivered), 0)
    const firstTotals = {
      dispatched: dispatchedQuantity,
      scheduled: Number(items[0].quantity),
      confirmed: Number(firstConfirmedTotal),
      remainingToSchedule: Math.max(0, dispatchedQuantity - firstScheduledTotal),
      remainingToDeliver: Math.max(0, dispatchedQuantity - firstConfirmedTotal),
    }
    expect(firstTotals).toEqual({ dispatched: 6, scheduled: 2, confirmed: 2, remainingToSchedule: 4, remainingToDeliver: 4 })
    expect(firstAllocatedTotal).toBe(2)
  })

  let secondDeliveryId = ''
  await test.step('El pedido parcialmente cumplido conserva cuatro unidades programables', async () => {
    await programarEntrega(4, guia2, referencia2)
    const secondDeliveries = await checked(rows('distribution_deliveries').eq('order_id', orderId).eq('guide_number', guia2))
    expect(secondDeliveries).toHaveLength(1)
    const delivery = secondDeliveries[0]
    secondDeliveryId = delivery.id
    expect(delivery.id).not.toBe(firstDeliveryId)
    expect(delivery.delivery_status).toBe('programado')

    const items = await checked(rows('distribution_delivery_items').eq('delivery_id', delivery.id))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ order_id: orderId, order_line_id: orderItemId })
    expect(Number(items[0].quantity)).toBe(4)
    const allocations = await checked(rows('distribution_delivery_inventory_allocations').eq('delivery_id', delivery.id))
    expect(allocations).toHaveLength(1)
    expect(allocations[0]).toMatchObject({
      delivery_id: delivery.id,
      order_id: orderId,
      order_line_id: orderItemId,
      inventory_movement_id: outboundMovementId,
    })
    expect(Number(allocations[0].quantity)).toBe(4)

    const allAllocations = await checked(rows('distribution_delivery_inventory_allocations').eq('order_id', orderId))
    expect(allAllocations).toHaveLength(2)
    expect(allAllocations.map((item) => item.inventory_movement_id)).toEqual([outboundMovementId, outboundMovementId])
    expect(allAllocations.reduce((sum, item) => sum + Number(item.quantity), 0)).toBe(6)
    expect(allAllocations.reduce((sum, item) => sum + Number(item.quantity), 0)).toBeLessThanOrEqual(dispatchedQuantity)

    const trace = await checked(f.api.rpc('list_distribution_delivery_inventory_trace', {
      requested_organization_id: f.organizationId,
      requested_delivery_id: delivery.id,
    })) as Array<Record<string, unknown>>
    expect(trace).toHaveLength(1)
    expect(trace[0]).toMatchObject({
      delivery_id: delivery.id,
      order_id: orderId,
      order_item_id: orderItemId,
      inventory_movement_id: outboundMovementId,
      allocated_quantity: 4,
      lot: f.lot,
      expiration_date: f.expiration,
      warehouse_id: f.warehouseId,
      location_id: f.locationId,
      reservation_id: reservationId,
    })
    expect((await checked(rows('inventory_movements').eq('product_id', f.productId))).map((item) => item.id).sort())
      .toEqual(movementIdsBeforeDeliveries)
    await expectStock(f, 4, 0, 4)
  })

  await test.step('Completar segunda entrega y comprobar conservación, estados y trazabilidad', async () => {
    segundaRecuperacion = await completarEntrega(
      secondDeliveryId,
      guia2,
      4,
      'Conformidad final de línea, segundo envío ' + f.reference,
      phase2c2E2E ? 'change-after-loss' : 'normal',
    )

    const deliveries = await checked(rows('distribution_deliveries').eq('order_id', orderId))
    expect(deliveries).toHaveLength(2)
    const deliveryByGuide = new Map(deliveries.map((delivery) => [delivery.guide_number, delivery]))
    const first = deliveryByGuide.get(guia1)
    const second = deliveryByGuide.get(guia2)
    expect(first?.id).toBe(firstDeliveryId)
    expect(second?.id).toBe(secondDeliveryId)
    expect(first?.id).not.toBe(second?.id)
    expect(first?.delivery_status).toBe('entregado')
    expect(second?.delivery_status).toBe('entregado')

    const order = await checked(rows('orders').eq('id', orderId).single())
    expect(order.fulfillment_status).toBe('delivered')
    expect(order.status).toBe('atendido')
    expect((await checked(rows('sales').eq('id', saleId).single())).status).toBe('despachada')

    const deliveryItems = (await Promise.all(deliveries.map((delivery) => checked(
      rows('distribution_delivery_items').eq('delivery_id', delivery.id),
    )))).flat()
    expect(deliveryItems).toHaveLength(2)
    expect(deliveryItems.reduce((sum, item) => sum + Number(item.quantity), 0)).toBe(6)
    expect(deliveryItems.find((item) => item.delivery_id === firstDeliveryId)?.quantity).toBe(2)
    expect(deliveryItems.find((item) => item.delivery_id === secondDeliveryId)?.quantity).toBe(4)

    const allocations = (await Promise.all(deliveries.map((delivery) => checked(
      rows('distribution_delivery_inventory_allocations').eq('delivery_id', delivery.id),
    )))).flat()
    expect(allocations).toHaveLength(2)
    expect(allocations.every((item) => item.inventory_movement_id === outboundMovementId)).toBe(true)
    expect(allocations.reduce((sum, item) => sum + Number(item.quantity), 0)).toBe(6)
    expect(allocations.reduce((sum, item) => sum + Number(item.quantity), 0)).toBeLessThanOrEqual(dispatchedQuantity)
    expect(Number(allocations.find((item) => item.delivery_id === firstDeliveryId)?.quantity)).toBe(2)
    expect(Number(allocations.find((item) => item.delivery_id === secondDeliveryId)?.quantity)).toBe(4)

    const outcomeRowsByDelivery = await Promise.all(deliveries.map((delivery) => checked(
      rows('distribution_delivery_outcomes').eq('delivery_id', delivery.id),
    )))
    const outcomes = outcomeRowsByDelivery.flat()
    expect(outcomes).toHaveLength(2)
    expect(outcomes.every((item) => item.result_status === 'entregado')).toBe(true)
    const outcomeLinesByDelivery = await Promise.all(deliveries.map(async (delivery, index) => {
      const deliveryOutcomes = outcomeRowsByDelivery[index]
      expect(deliveryOutcomes).toHaveLength(1)
      expect(deliveryOutcomes[0]).toMatchObject({
        organization_id: f.organizationId,
        delivery_id: delivery.id,
        result_status: 'entregado',
      })
      const lines = await checked(rows('distribution_delivery_outcome_lines').eq('outcome_id', deliveryOutcomes[0].id))
      expect(lines).toHaveLength(1)
      expect(lines[0].order_line_id).toBe(orderItemId)
      return { deliveryId: delivery.id, quantity: Number(lines[0].quantity_delivered) }
    }))
    expect(outcomeLinesByDelivery).toHaveLength(2)
    expect(outcomeLinesByDelivery.find((item) => item.deliveryId === firstDeliveryId)?.quantity).toBe(2)
    expect(outcomeLinesByDelivery.find((item) => item.deliveryId === secondDeliveryId)?.quantity).toBe(4)
    expect(outcomeLinesByDelivery.reduce((sum, item) => sum + item.quantity, 0)).toBe(6)
    const outcomeAuditEvents = await outcomeAudits([firstDeliveryId, secondDeliveryId])
    expect(outcomeAuditEvents).toHaveLength(2)
    expect(outcomeAuditEvents.map((event) => event.entity_id).sort()).toEqual([firstDeliveryId, secondDeliveryId].sort())

    const reservation = await checked(rows('inventory_reservations').eq('id', reservationId).single())
    expect(reservation.status).toBe('consumed')
    expect(Number(reservation.quantity)).toBe(6)
    expect(Number(reservation.quantity_consumed)).toBe(6)
    const activeReservationQuantity = [reservation]
      .filter((item) => item.status === 'active')
      .reduce((sum, item) => sum + Number(item.quantity) - Number(item.quantity_consumed), 0)
    expect(activeReservationQuantity).toBe(0)

    const finalMovements = await checked(rows('inventory_movements').eq('product_id', f.productId))
    expect(finalMovements).toHaveLength(2)
    expect(finalMovements.map((item) => item.id).sort()).toEqual(movementIdsBeforeDeliveries)
    const finalEntries = finalMovements.filter((item) => item.movement_type === 'entrada')
    const finalExits = finalMovements.filter((item) => item.movement_type === 'salida')
    expect(finalEntries).toHaveLength(1)
    expect(finalExits).toHaveLength(1)
    expect(Number(finalEntries[0].quantity)).toBe(10)
    expect(Number(finalExits[0].quantity)).toBe(6)
    const physicalBalance = finalMovements.reduce((balance, item) => balance
      + (item.movement_type === 'entrada' ? 1 : -1) * Number(item.quantity), 0)
    expect(physicalBalance).toBe(4)
    await expectStock(f, 4, 0, 4)

    const purchases = await checked(rows('purchase_orders').eq('id', purchaseId))
    const purchaseItems = await checked(rows('purchase_order_items').eq('purchase_order_id', purchaseId))
    const receipts = await checked(rows('purchase_receipts').eq('id', receiptId))
    const receiptItems = await checked(rows('purchase_receipt_items').eq('receipt_id', receiptId))
    const quotes = await checked(rows('sales_quotes').eq('id', quoteId))
    const orders = await checked(rows('orders').eq('id', orderId))
    const orderItems = await checked(rows('order_items').eq('order_id', orderId))
    const sales = await checked(rows('sales').eq('id', saleId))
    const reservations = await checked(rows('inventory_reservations').eq('source_id', orderItemId).eq('source_type', 'order-item'))
    const receivedQuantity = finalEntries.reduce((sum, item) => sum + Number(item.quantity), 0)
    const reservedHistoricalQuantity = reservations.reduce((sum, item) => sum + Number(item.quantity), 0)
    const dispatchedQuantityFinal = finalExits.reduce((sum, item) => sum + Number(item.quantity), 0)
    const scheduledQuantity = deliveryItems.reduce((sum, item) => sum + Number(item.quantity), 0)
    const allocatedQuantity = allocations.reduce((sum, item) => sum + Number(item.quantity), 0)
    const confirmedQuantity = outcomeLinesByDelivery.reduce((sum, item) => sum + item.quantity, 0)
    const finalSummary = {
      received: receivedQuantity,
      reservedHistorically: reservedHistoricalQuantity,
      dispatched: dispatchedQuantityFinal,
      scheduled: scheduledQuantity,
      allocated: allocatedQuantity,
      confirmed: confirmedQuantity,
      pendingDelivery: Math.max(0, dispatchedQuantityFinal - confirmedQuantity),
      physicalFinal: physicalBalance,
      pendingReservation: activeReservationQuantity,
    }
    expect(finalSummary).toEqual({
      received: 10,
      reservedHistorically: 6,
      dispatched: 6,
      scheduled: 6,
      allocated: 6,
      confirmed: 6,
      pendingDelivery: 0,
      physicalFinal: 4,
      pendingReservation: 0,
    })
    expect({
      purchases: purchases.length,
      purchaseItems: purchaseItems.length,
      receipts: receipts.length,
      receiptItems: receiptItems.length,
      quotes: quotes.length,
      orders: orders.length,
      orderItems: orderItems.length,
      sales: sales.length,
      reservations: reservations.length,
      movements: finalMovements.length,
      deliveries: deliveries.length,
      deliveryItems: deliveryItems.length,
      allocations: allocations.length,
      outcomes: outcomes.length,
      outcomeLines: outcomeLinesByDelivery.length,
    }).toEqual({
      purchases: 1,
      purchaseItems: 1,
      receipts: 1,
      receiptItems: 1,
      quotes: 1,
      orders: 1,
      orderItems: 1,
      sales: 1,
      reservations: 1,
      movements: 2,
      deliveries: 2,
      deliveryItems: 2,
      allocations: 2,
      outcomes: 2,
      outcomeLines: 2,
    })

    const evidence = {
      reference: f.reference,
      organizationId: f.organizationId,
      productId: f.productId,
      purchaseId,
      receiptId,
      quoteId,
      orderId,
      orderNumber,
      orderItemId,
      saleId,
      reservationId,
      inboundMovementId,
      outboundMovementId,
      deliveries: [
        { id: firstDeliveryId, guide: guia1, reference: referencia1, scheduled: 2, allocated: 2, confirmed: 2, status: first?.delivery_status },
        { id: secondDeliveryId, guide: guia2, reference: referencia2, scheduled: 4, allocated: 4, confirmed: 4, status: second?.delivery_status },
      ],
      totals: finalSummary,
      counts: { purchases: 1, purchaseItems: 1, receipts: 1, receiptItems: 1, quotes: 1, orders: 1, orderItems: 1, sales: 1, reservations: 1, movements: 2, deliveries: 2, deliveryItems: 2, allocations: 2, outcomes: 2, outcomeLines: 2 },
    }
    console.info('EVIDENCIA_FASE2B ' + JSON.stringify(evidence))
    if (phase2c2E2E) {
      console.info('EVIDENCIA_FASE2C3 ' + JSON.stringify({
        unchangedReplay: {
          operationKey: primeraRecuperacion?.first.operationKey,
          firstOutcomeId: primeraRecuperacion?.first.outcomeId,
          replayOperationKey: primeraRecuperacion?.replay?.operationKey,
          replayOutcomeId: primeraRecuperacion?.replay?.outcomeId,
          persistedOutcomesAfterReplay: 1,
          persistedLinesAfterReplay: 1,
        },
        incompatiblePayload: {
          rejectedVariants: ['evidencia', 'cantidad'],
          persistedOutcomesAfterRejections: 1,
          persistedLinesAfterRejections: 1,
        },
        changedEvidence: {
          originalOperationKey: segundaRecuperacion?.first.operationKey,
          changedOperationKey: segundaRecuperacion?.changedAttempt?.operationKey,
          firstBackendStatus: segundaRecuperacion?.first.status,
          changedBackendStatus: segundaRecuperacion?.changedAttempt?.status,
          persistedOutcomes: 1,
          persistedLines: 1,
        },
      }))
    }
  })
})
