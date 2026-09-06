import { expect, test, type Locator, type Page, type Response } from '@playwright/test'

interface InventoryE2eFixture {
  productCode: string
  productDescription: string
  sourceWarehouseCode: string
  sourceWarehouseName: string
  destinationWarehouseCode: string
  destinationWarehouseName: string
  transferReference: string
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} en el entorno E2E.`)
  return value
}

const inventoryFixtures = JSON.parse(
  Buffer.from(requiredEnvironment('E2E_INVENTORY_FIXTURES_BASE64'), 'base64url').toString(),
) as InventoryE2eFixture[]

function inventoryFixtureForAttempt(retry: number) {
  const fixture = inventoryFixtures[retry]
  if (!fixture || Object.values(fixture).some((value) => !value)) {
    throw new Error(`Falta el fixture de inventario para el intento ${retry}.`)
  }
  return fixture
}

async function signIn(page: Page) {
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo').fill(requiredEnvironment('E2E_ADMIN_EMAIL'))
  await page.getByLabel('Contraseña').fill(requiredEnvironment('E2E_ADMIN_PASSWORD'))
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(/\/$/, { timeout: 10_000 })
}

function stockRow(stockRegion: Locator, productCode: string, warehouse: string, lot: string) {
  return stockRegion.getByRole('row').filter({ hasText: productCode }).filter({ hasText: warehouse }).filter({ hasText: lot })
}

async function expectStock(
  stockRegion: Locator,
  productCode: string,
  warehouse: string,
  lot: string,
  quantity: string,
  value: string,
) {
  const cells = stockRow(stockRegion, productCode, warehouse, lot).getByRole('cell')
  await expect(cells.nth(4)).toHaveText(quantity)
  await expect(cells.nth(5)).toContainText(value)
}

function kardexRow(kardexRegion: Locator, productCode: string, reason: string, warehouse: string, lot: string) {
  return kardexRegion.getByRole('row').filter({ hasText: productCode }).filter({ hasText: reason }).filter({ hasText: warehouse }).filter({ hasText: lot })
}

async function expectKardex(
  kardexRegion: Locator,
  productCode: string,
  reason: string,
  warehouse: string,
  lot: string,
  inbound: string,
  outbound: string,
  cost: string,
  balance: string,
  balanceValue: string,
) {
  const cells = kardexRow(kardexRegion, productCode, reason, warehouse, lot).getByRole('cell')
  await expect(cells.nth(3)).toHaveText(inbound)
  await expect(cells.nth(4)).toHaveText(outbound)
  await expect(cells.nth(5)).toContainText(cost)
  await expect(cells.nth(6)).toHaveText(balance)
  await expect(cells.nth(7)).toContainText(balanceValue)
}

function waitForRestResponse(
  page: Page,
  resource: string,
  method: 'GET' | 'POST',
  searchTerm?: string | null,
) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    const search = url.searchParams.get('or') ?? ''
    return response.request().method() === method
      && url.pathname === `/rest/v1/${resource}`
      && (searchTerm === undefined
        || (searchTerm === null ? !url.searchParams.has('or') : search.includes(searchTerm)))
  })
}

async function expectSuccessful(responsePromise: Promise<Response>) {
  const response = await responsePromise
  expect(await response.finished()).toBeNull()
  expect(
    response.ok(),
    `${response.request().method()} ${response.url()} respondió ${response.status()}`,
  ).toBeTruthy()
}

async function searchAndWait(
  page: Page,
  region: Locator,
  resource: string,
  searchTerm: string,
) {
  const response = waitForRestResponse(page, resource, 'GET', searchTerm)
  await region.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(searchTerm)
  await expectSuccessful(response)
}

function waitForInventoryRefresh(page: Page, productCode: string) {
  return Promise.all([
    waitForRestResponse(page, 'inventory_balances', 'GET', productCode),
    waitForRestResponse(page, 'inventory_kardex', 'GET', productCode),
    waitForRestResponse(page, 'warehouse_transfers', 'GET', null),
  ].map(expectSuccessful))
}

test('aplica FEFO multilote y conserva kardex y valorización por almacén', async ({ page }, testInfo) => {
  const {
    productCode,
    productDescription,
    sourceWarehouseCode,
    sourceWarehouseName,
    destinationWarehouseName,
    transferReference,
  } = inventoryFixtureForAttempt(testInfo.retry)

  await signIn(page)
  const initialInventoryLoad = Promise.all([
    waitForRestResponse(page, 'inventory_balances', 'GET', null),
    waitForRestResponse(page, 'inventory_kardex', 'GET', null),
    waitForRestResponse(page, 'warehouse_transfers', 'GET', null),
  ].map(expectSuccessful))
  await page.goto('/inventario')
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible()
  await initialInventoryLoad

  const productLabel = `${productCode} · ${productDescription}`
  const sourceWarehouseLabel = `${sourceWarehouseCode} · ${sourceWarehouseName}`
  const stockRegion = page.getByRole('region', { name: 'Stock por almacén, ubicación y lote' })
  const kardexRegion = page.getByRole('region', { name: 'Kardex valorizado' })

  await searchAndWait(page, stockRegion, 'inventory_balances', productCode)
  await searchAndWait(page, kardexRegion, 'inventory_kardex', productCode)

  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-A', '3', '30.00')
  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-B', '6', '120.00')
  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-C', '4', '120.00')

  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click()
  const movementDialog = page.getByRole('dialog', { name: 'Registrar movimiento' })
  await movementDialog.getByLabel('Tipo de movimiento *').selectOption({ label: 'Salida' })
  await movementDialog.getByLabel('Producto *').selectOption({ label: productLabel })
  await movementDialog.getByLabel('Almacén *').selectOption({ label: sourceWarehouseLabel })
  await expect(movementDialog.getByText(/13 asignables en 3 buckets/)).toBeVisible()
  await movementDialog.getByLabel('Cantidad *').fill('5')
  await movementDialog.getByLabel('Motivo o referencia *').fill('Salida E2E FEFO multilote')
  const movementResponse = waitForRestResponse(page, 'rpc/record_inventory_fefo_outbound', 'POST')
  const movementRefresh = waitForInventoryRefresh(page, productCode)
  await movementDialog.getByRole('button', { name: 'Registrar movimiento', exact: true }).click()
  await expectSuccessful(movementResponse)
  await movementRefresh
  await expect(movementDialog).toBeHidden()

  await expect(stockRow(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-A')).toHaveCount(0)
  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-B', '4', '80.00')
  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-C', '4', '120.00')
  await expectKardex(kardexRegion, productCode, 'Salida E2E FEFO multilote', sourceWarehouseName, 'LOTE-E2E-A', '—', '3', '10.00', '10', '240.00')
  await expectKardex(kardexRegion, productCode, 'Salida E2E FEFO multilote', sourceWarehouseName, 'LOTE-E2E-B', '—', '2', '20.00', '8', '200.00')

  const operationsRegion = page.getByRole('region', { name: 'Operaciones de almacén' })
  await operationsRegion.getByLabel('Referencia', { exact: true }).fill(transferReference)
  await operationsRegion.getByLabel('Producto', { exact: true }).first().selectOption({ label: productLabel })
  await operationsRegion.getByLabel('Almacén origen', { exact: true }).selectOption({ label: sourceWarehouseName })
  await operationsRegion.getByLabel('Almacén destino', { exact: true }).selectOption({ label: destinationWarehouseName })
  await operationsRegion.getByLabel('Cantidad', { exact: true }).first().fill('6')
  await operationsRegion.getByLabel('Notas', { exact: true }).fill('Transferencia E2E FEFO multilote')
  const transferResponse = waitForRestResponse(page, 'rpc/transfer_inventory_fefo', 'POST')
  const transferRefresh = waitForInventoryRefresh(page, productCode)
  await operationsRegion.getByRole('button', { name: 'Confirmar transferencia' }).click()
  await expectSuccessful(transferResponse)
  await transferRefresh

  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-C', '2', '60.00')
  await expectStock(stockRegion, productCode, destinationWarehouseName, 'LOTE-E2E-B', '4', '80.00')
  await expectStock(stockRegion, productCode, destinationWarehouseName, 'LOTE-E2E-C', '2', '60.00')

  const transferReason = `Transferencia ${transferReference}`
  await expectKardex(kardexRegion, productCode, transferReason, sourceWarehouseName, 'LOTE-E2E-B', '—', '4', '20.00', '4', '120.00')
  await expectKardex(kardexRegion, productCode, transferReason, destinationWarehouseName, 'LOTE-E2E-B', '4', '—', '20.00', '4', '80.00')
  await expectKardex(kardexRegion, productCode, transferReason, sourceWarehouseName, 'LOTE-E2E-C', '—', '2', '30.00', '2', '60.00')
  await expectKardex(kardexRegion, productCode, transferReason, destinationWarehouseName, 'LOTE-E2E-C', '2', '—', '30.00', '6', '140.00')
  const transfersRegion = page.getByRole('region', { name: 'Historial de transferencias' })
  await searchAndWait(page, transfersRegion, 'warehouse_transfers', transferReference)
  await expect(transfersRegion.getByRole('article').filter({ hasText: transferReference })).toHaveCount(1)
})
