import { expect, test, type Locator, type Page } from '@playwright/test'

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} en el entorno E2E.`)
  return value
}

const productCode = requiredEnvironment('E2E_INVENTORY_PRODUCT_CODE')
const productDescription = requiredEnvironment('E2E_INVENTORY_PRODUCT_DESCRIPTION')
const sourceWarehouseCode = requiredEnvironment('E2E_INVENTORY_SOURCE_WAREHOUSE_CODE')
const sourceWarehouseName = requiredEnvironment('E2E_INVENTORY_SOURCE_WAREHOUSE_NAME')
const destinationWarehouseName = requiredEnvironment('E2E_INVENTORY_DESTINATION_WAREHOUSE_NAME')
const transferReference = requiredEnvironment('E2E_INVENTORY_TRANSFER_REFERENCE')

async function signIn(page: Page) {
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo').fill(requiredEnvironment('E2E_ADMIN_EMAIL'))
  await page.getByLabel('Contraseña').fill(requiredEnvironment('E2E_ADMIN_PASSWORD'))
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(/\/$/, { timeout: 10_000 })
}

function stockRow(stockRegion: Locator, warehouse: string, lot: string) {
  return stockRegion.getByRole('row').filter({ hasText: productCode }).filter({ hasText: warehouse }).filter({ hasText: lot })
}

async function expectStock(
  stockRegion: Locator,
  warehouse: string,
  lot: string,
  quantity: string,
  value: string,
) {
  const cells = stockRow(stockRegion, warehouse, lot).getByRole('cell')
  await expect(cells.nth(4)).toHaveText(quantity)
  await expect(cells.nth(5)).toContainText(value)
}

function kardexRow(kardexRegion: Locator, reason: string, warehouse: string, lot: string) {
  return kardexRegion.getByRole('row').filter({ hasText: reason }).filter({ hasText: warehouse }).filter({ hasText: lot })
}

async function expectKardex(
  kardexRegion: Locator,
  reason: string,
  warehouse: string,
  lot: string,
  inbound: string,
  outbound: string,
  cost: string,
  balance: string,
  balanceValue: string,
) {
  const cells = kardexRow(kardexRegion, reason, warehouse, lot).getByRole('cell')
  await expect(cells.nth(3)).toHaveText(inbound)
  await expect(cells.nth(4)).toHaveText(outbound)
  await expect(cells.nth(5)).toContainText(cost)
  await expect(cells.nth(6)).toHaveText(balance)
  await expect(cells.nth(7)).toContainText(balanceValue)
}

test('aplica FEFO multilote y conserva kardex y valorización por almacén', async ({ page }) => {
  await signIn(page)
  await page.goto('/inventario')
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible()

  const productLabel = `${productCode} · ${productDescription}`
  const sourceWarehouseLabel = `${sourceWarehouseCode} · ${sourceWarehouseName}`
  const stockRegion = page.getByRole('region', { name: 'Stock por almacén, ubicación y lote' })
  const kardexRegion = page.getByRole('region', { name: 'Kardex valorizado' })

  await expectStock(stockRegion, sourceWarehouseName, 'LOTE-E2E-A', '3', '30.00')
  await expectStock(stockRegion, sourceWarehouseName, 'LOTE-E2E-B', '6', '120.00')
  await expectStock(stockRegion, sourceWarehouseName, 'LOTE-E2E-C', '4', '120.00')

  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click()
  const movementDialog = page.getByRole('dialog', { name: 'Registrar movimiento' })
  await movementDialog.getByLabel('Tipo de movimiento *').selectOption({ label: 'Salida' })
  await movementDialog.getByLabel('Producto *').selectOption({ label: productLabel })
  await movementDialog.getByLabel('Almacén *').selectOption({ label: sourceWarehouseLabel })
  await expect(movementDialog.getByText(/13 asignables en 3 buckets/)).toBeVisible()
  await movementDialog.getByLabel('Cantidad *').fill('5')
  await movementDialog.getByLabel('Motivo o referencia *').fill('Salida E2E FEFO multilote')
  await movementDialog.getByRole('button', { name: 'Registrar movimiento', exact: true }).click()
  await expect(movementDialog).toBeHidden()

  await expect(stockRow(stockRegion, sourceWarehouseName, 'LOTE-E2E-A')).toHaveCount(0)
  await expectStock(stockRegion, sourceWarehouseName, 'LOTE-E2E-B', '4', '80.00')
  await expectStock(stockRegion, sourceWarehouseName, 'LOTE-E2E-C', '4', '120.00')
  await expectKardex(kardexRegion, 'Salida E2E FEFO multilote', sourceWarehouseName, 'LOTE-E2E-A', '—', '3', '10.00', '10', '240.00')
  await expectKardex(kardexRegion, 'Salida E2E FEFO multilote', sourceWarehouseName, 'LOTE-E2E-B', '—', '2', '20.00', '8', '200.00')

  const operationsRegion = page.getByRole('region', { name: 'Operaciones de almacén' })
  await operationsRegion.getByLabel('Referencia', { exact: true }).fill(transferReference)
  await operationsRegion.getByLabel('Producto', { exact: true }).first().selectOption({ label: productLabel })
  await operationsRegion.getByLabel('Almacén origen', { exact: true }).selectOption({ label: sourceWarehouseName })
  await operationsRegion.getByLabel('Almacén destino', { exact: true }).selectOption({ label: destinationWarehouseName })
  await operationsRegion.getByLabel('Cantidad', { exact: true }).first().fill('6')
  await operationsRegion.getByLabel('Notas', { exact: true }).fill('Transferencia E2E FEFO multilote')
  await operationsRegion.getByRole('button', { name: 'Confirmar transferencia' }).click()
  await expect(page.getByText('Transferencia completada y trazada en el kardex.')).toBeVisible()

  await expectStock(stockRegion, sourceWarehouseName, 'LOTE-E2E-C', '2', '60.00')
  await expectStock(stockRegion, destinationWarehouseName, 'LOTE-E2E-B', '4', '80.00')
  await expectStock(stockRegion, destinationWarehouseName, 'LOTE-E2E-C', '2', '60.00')

  const transferReason = `Transferencia ${transferReference}`
  await expectKardex(kardexRegion, transferReason, sourceWarehouseName, 'LOTE-E2E-B', '—', '4', '20.00', '4', '120.00')
  await expectKardex(kardexRegion, transferReason, destinationWarehouseName, 'LOTE-E2E-B', '4', '—', '20.00', '4', '80.00')
  await expectKardex(kardexRegion, transferReason, sourceWarehouseName, 'LOTE-E2E-C', '—', '2', '30.00', '2', '60.00')
  await expectKardex(kardexRegion, transferReason, destinationWarehouseName, 'LOTE-E2E-C', '2', '—', '30.00', '6', '140.00')
  await expect(page.getByRole('region', { name: 'Historial de transferencias' })).toContainText(transferReference)
})
