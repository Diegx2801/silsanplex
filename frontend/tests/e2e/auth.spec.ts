import { expect, test } from '@playwright/test'

function requiredE2eEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} en el entorno E2E.`)
  return value
}

const adminEmail = requiredE2eEnvironment('E2E_ADMIN_EMAIL')
const adminPassword = requiredE2eEnvironment('E2E_ADMIN_PASSWORD')
const memberEmail = requiredE2eEnvironment('E2E_MEMBER_EMAIL')
const memberPassword = requiredE2eEnvironment('E2E_MEMBER_PASSWORD')

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  // Espera a que AuthProvider termine de hidratar la sesión y permisos antes
  // de navegar a una ruta protegida; evita una carrera propia del E2E.
  await page.waitForURL(/\/$/, { timeout: 10_000 })
}

test('muestra el formulario de inicio de sesión', async ({ page }) => {
  await page.goto('/iniciar-sesion')

  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await expect(page.getByLabel('Correo')).toBeVisible()
  await expect(page.getByLabel('Contraseña')).toBeVisible()
})

test('protege la pantalla de usuarios sin sesión', async ({ page }) => {
  await page.goto('/usuarios')

  await expect(page).toHaveURL(/\/iniciar-sesion$/)
})

test.describe('sesión del administrador', () => {
  test('mantiene el acceso al regresar de otra pestaña', async ({ page, context }) => {
    await signIn(page, adminEmail, adminPassword)
    await page.goto('/usuarios')
    await expect(page.getByRole('heading', { name: 'Control de usuarios' })).toBeVisible()

    const otherPage = await context.newPage()
    await otherPage.goto('about:blank')
    await otherPage.bringToFront()
    await page.bringToFront()

    await expect(page.getByText('Verificando acceso…')).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Control de usuarios' })).toBeVisible()
  })

  test('no permite que el administrador se desactive a sí mismo', async ({ page }) => {
    await signIn(page, adminEmail, adminPassword)
    await page.goto('/usuarios')

    const ownRow = page.getByRole('row').filter({ hasText: adminEmail })
    await expect(ownRow.getByRole('button', { name: /Desactivar/ })).toBeDisabled()
  })
})

test.describe('sesión sin administración', () => {
  test('impide acceder al control de usuarios', async ({ page }) => {
    await signIn(page, memberEmail, memberPassword)
    await page.goto('/usuarios')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
  })
})
