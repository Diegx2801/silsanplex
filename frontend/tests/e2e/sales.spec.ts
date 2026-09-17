import { expect, test } from '@playwright/test'

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} en el entorno E2E.`)
  return value
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo').fill(requiredEnvironment('E2E_ADMIN_EMAIL'))
  await page.getByLabel('Contraseña').fill(requiredEnvironment('E2E_ADMIN_PASSWORD'))
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(/\/$/, { timeout: 10_000 })
}

function firstInventoryFixture() {
  const encoded = requiredEnvironment('E2E_INVENTORY_FIXTURES_BASE64')
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8')
  const fixtures = JSON.parse(decoded) as Array<{ productCode: string }>
  const fixture = fixtures[0]
  if (!fixture?.productCode) throw new Error('No existe un producto E2E disponible.')
  return fixture
}

test('busca cliente y producto en la cotización y marca los campos requeridos', async ({ page }) => {
  await signIn(page)
  await page.goto('/ventas')
  await page.getByRole('button', { name: 'Nueva cotización' }).click()

  const dialog = page.getByRole('dialog', { name: 'Nueva cotización' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveClass(/start-1\/2/)

  const cliente = dialog.getByRole('combobox', { name: 'Cliente' })
  await cliente.fill('E2ECAT0001')
  await expect(dialog.getByRole('option', { name: /E2E Cliente catálogo 0001/i })).toBeVisible()
  await dialog.getByRole('option', { name: /E2E Cliente catálogo 0001/i }).click()

  const producto = dialog.getByRole('combobox', { name: 'Producto 1' })
  await producto.fill(firstInventoryFixture().productCode)
  await expect(dialog.getByRole('option', { name: new RegExp(firstInventoryFixture().productCode) })).toBeVisible()
  await dialog.getByRole('option', { name: new RegExp(firstInventoryFixture().productCode) }).click()

  await cliente.click()
  await cliente.press('ControlOrMeta+A')
  await cliente.press('Backspace')
  await expect(cliente).toHaveValue('')
  await producto.click()
  await producto.press('ControlOrMeta+A')
  await producto.press('Backspace')
  await expect(producto).toHaveValue('')
  await dialog.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(dialog.getByText('Selecciona un cliente')).toBeVisible()
  await expect(dialog.getByText('Selecciona un producto')).toBeVisible()
})
