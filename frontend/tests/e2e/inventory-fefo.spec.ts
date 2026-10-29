import { expect, type Locator, type Page, type Response } from '@playwright/test'
import { test } from './fixtures/test.js'

interface InventoryE2eFixture {
  productCode: string
  productDescription: string
  sourceWarehouseCode: string
  sourceWarehouseName: string
  destinationWarehouseCode: string
  destinationWarehouseName: string
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
  await expect(cells.nth(5)).toHaveText('0')
  await expect(cells.nth(6)).toHaveText(quantity)
  await expect(cells.nth(7)).toContainText(value)
}

function kardexRow(kardexRegion: Locator, productCode: string, reason: string | RegExp, warehouse: string, lot: string) {
  return kardexRegion.getByRole('row').filter({ hasText: productCode }).filter({ hasText: reason }).filter({ hasText: warehouse }).filter({ hasText: lot })
}

async function expectKardex(
  kardexRegion: Locator,
  productCode: string,
  reason: string | RegExp,
  warehouse: string,
  lot: string,
  inbound: string,
  outbound: string,
  cost: string,
  balance: string,
  balanceValue: string,
) {
  const cells = kardexRow(kardexRegion, productCode, reason, warehouse, lot).getByRole('cell')
  await expect(cells.nth(3)).toContainText(inbound)
  await expect(cells.nth(4)).toContainText(outbound)
  await expect(cells.nth(5)).toContainText(cost)
  await expect(cells.nth(6)).toContainText(balance)
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
    const request = response.request()
    let search = url.searchParams.get('or') ?? ''
    if (request.method() === 'POST') {
      try {
        search = request.postDataJSON()?.search_term ?? search
      } catch {
        // Some POST requests do not carry a JSON search term.
      }
    }
    return request.method() === method
      && url.pathname === `/rest/v1/${resource}`
      && (searchTerm === undefined
        || (searchTerm === null ? !search : search.includes(searchTerm)))
  })
}

async function expectSuccessful(responsePromise: Promise<Response>) {
  const response = await responsePromise
  expect(await response.finished()).toBeNull()
  const failureBody = response.ok()
    ? ''
    : await response.text().catch(() => '')
  const diagnostic = failureBody.trim() ? `\n${failureBody}` : ''
  expect(
    response.ok(),
    `${response.request().method()} ${response.url()} respondió ${response.status()}${diagnostic}`,
  ).toBeTruthy()
}

async function selectRemoteComboboxOption(
  page: Page,
  scope: Locator,
  label: string,
  resource: string,
  searchTerm: string,
  optionName: string | RegExp,
) {
  const response = waitForRestResponse(page, resource, 'POST', searchTerm)
  await scope.getByRole('combobox', { name: label, exact: true }).fill(searchTerm)
  await expectSuccessful(response)
  const option = scope.getByRole('option', { name: optionName })
  await expect(option).toBeVisible()
  await option.click()
}

async function selectStaticComboboxOption(
  scope: Locator,
  label: string,
  searchTerm: string,
  optionName: string | RegExp,
) {
  await scope.getByRole('combobox', { name: label, exact: true }).fill(searchTerm)
  const option = scope.getByRole('option', { name: optionName })
  await expect(option).toBeVisible()
  await option.click()
}

async function searchAndWait(
  page: Page,
  region: Locator,
  resource: string,
  searchTerm: string,
) {
  const response = waitForRestResponse(page, resource, resource.startsWith('rpc/') ? 'POST' : 'GET', searchTerm)
  await region.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(searchTerm)
  await expectSuccessful(response)
}

test('aplica FEFO multilote y conserva kardex y valorización por almacén', async ({ page }, testInfo) => {
  const {
    productCode,
    productDescription,
    sourceWarehouseCode,
    sourceWarehouseName,
    destinationWarehouseCode,
    destinationWarehouseName,
  } = inventoryFixtureForAttempt(testInfo.retry)

  await signIn(page)
  await page.goto('/inventario?vista=lotes')
  await expect(page.getByRole('heading', { name: 'Existencias y lotes' })).toBeVisible()

  const productLabel = `${productCode} · ${productDescription}`
  const sourceWarehouseLabel = `${sourceWarehouseCode} · ${sourceWarehouseName}`
  const stockRegion = page.getByRole('region', { name: 'Stock por almacén, ubicación y lote' })
  const kardexRegion = page.getByRole('region', { name: 'Kardex valorizado' })

  const openStock = async () => {
    await page.goto('/inventario?vista=lotes')
    await searchAndWait(page, stockRegion, 'rpc/inventory_stock_detail_read', productCode)
  }
  const openKardex = async () => {
    await page.goto('/inventario/movimientos?vista=kardex')
    await searchAndWait(page, kardexRegion, 'inventory_kardex', productCode)
  }
  await searchAndWait(page, stockRegion, 'rpc/inventory_stock_detail_read', productCode)

  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-A', '3', '30.00')
  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-B', '6', '120.00')
  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-C', '4', '120.00')

  await page.goto('/inventario/movimientos')
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click()
  const movementDialog = page.getByRole('dialog', { name: 'Registrar movimiento' })
  await movementDialog.getByLabel('Tipo de movimiento *').selectOption({ label: 'Salida' })
  await selectRemoteComboboxOption(
    page,
    movementDialog,
    'Producto',
    'rpc/inventory_product_options',
    productCode,
    productLabel,
  )
  await selectRemoteComboboxOption(
    page,
    movementDialog,
    'Almacén',
    'rpc/inventory_movement_warehouses_read',
    sourceWarehouseCode,
    sourceWarehouseLabel,
  )
  await expect(movementDialog.getByText(/13 .*disponibles en 3 posiciones/)).toBeVisible()
  await movementDialog.getByLabel('Cantidad *').fill('5')
  await movementDialog.getByLabel('Motivo del movimiento *').selectOption('Otro')
  await movementDialog.getByLabel('Detalle del motivo *').fill('Salida E2E FEFO multilote')
  const movementResponse = waitForRestResponse(page, 'rpc/record_inventory_fefo_outbound', 'POST')
  await movementDialog.getByRole('button', { name: 'Registrar movimiento', exact: true }).click()
  await expectSuccessful(movementResponse)
  await expect(movementDialog).toBeHidden()

  await openStock()
  await expect(stockRow(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-A')).toHaveCount(0)
  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-B', '4', '80.00')
  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-C', '4', '120.00')
  await openKardex()
  await expectKardex(kardexRegion, productCode, 'Otro: Salida E2E FEFO multilote', sourceWarehouseName, 'LOTE-E2E-A', '—', '3', '10.00', '0', '0.00')
  await expectKardex(kardexRegion, productCode, 'Otro: Salida E2E FEFO multilote', sourceWarehouseName, 'LOTE-E2E-B', '—', '2', '20.00', '4', '80.00')

  await page.goto('/inventario/movimientos?vista=transferencias')
  const operationsRegion = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Transferir stock', exact: true }) })
  await selectRemoteComboboxOption(
    page,
    operationsRegion,
    'Producto',
    'rpc/inventory_product_options',
    productCode,
    productLabel,
  )
  const bucketsResponse = waitForRestResponse(page, 'inventory_bucket_availability', 'GET')
  await selectRemoteComboboxOption(
    page,
    operationsRegion,
    'Almacén de origen',
    'rpc/inventory_adjustment_warehouses_read',
    sourceWarehouseCode,
    sourceWarehouseLabel,
  )
  await expectSuccessful(bucketsResponse)
  const sourcePosition = operationsRegion.getByRole('combobox', { name: 'Ubicación y lote de origen', exact: true })
  await expect(sourcePosition).toBeEnabled()
  await sourcePosition.click()
  const sourceLot = operationsRegion.getByRole('option').filter({ hasText: 'LOTE-E2E-C' })
  await expect(sourceLot).toBeVisible()
  await sourceLot.click()
  await selectStaticComboboxOption(
    operationsRegion,
    'Almacén de destino',
    destinationWarehouseCode,
    new RegExp(`${destinationWarehouseCode} · ${destinationWarehouseName}`),
  )
  await selectStaticComboboxOption(operationsRegion, 'Ubicación de destino', 'GENERAL', /^GENERAL · /)
  await operationsRegion.getByLabel('Cantidad a transferir *', { exact: true }).fill('2')
  await operationsRegion.getByRole('button', { name: 'Revisar transferencia', exact: true }).click()
  await expect(operationsRegion.getByRole('heading', { name: 'Revisar transferencia', exact: true })).toBeVisible()
  const transferResponse = waitForRestResponse(page, 'rpc/transfer_inventory_position', 'POST')
  await operationsRegion.getByRole('button', { name: 'Confirmar transferencia' }).click()
  await expectSuccessful(transferResponse)
  await expect(operationsRegion.getByText(/Transferencia registrada\./)).toBeVisible()
  await openStock()

  await expectStock(stockRegion, productCode, sourceWarehouseName, 'LOTE-E2E-C', '2', '60.00')
  await expectStock(stockRegion, productCode, destinationWarehouseName, 'LOTE-E2E-C', '2', '60.00')

  await openKardex()
  await expectKardex(kardexRegion, productCode, /Transferencia TR-/, sourceWarehouseName, 'LOTE-E2E-C', '—', '2', '30.00', '2', '60.00')
  await expectKardex(kardexRegion, productCode, /Transferencia TR-/, destinationWarehouseName, 'LOTE-E2E-C', '2', '—', '30.00', '2', '60.00')
  await page.goto('/inventario/movimientos?vista=transferencias')
  const transfersRegion = page.getByRole('region', { name: 'Historial de transferencias' })
  await expect(transfersRegion.getByRole('article')
    .filter({ hasText: sourceWarehouseName })
    .filter({ hasText: destinationWarehouseName })).toHaveCount(1)
  await expect(transfersRegion.getByRole('article')
    .filter({ hasText: sourceWarehouseName })
    .filter({ hasText: destinationWarehouseName })
    .locator('p').first()).toContainText(/^TR-/)
})
