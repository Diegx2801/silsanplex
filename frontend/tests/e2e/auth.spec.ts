import { expect, test } from '@playwright/test'

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
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
  const email = process.env.E2E_ADMIN_EMAIL
  const password = process.env.E2E_ADMIN_PASSWORD

  test.skip(!email || !password, 'Configura E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD.')

  test('mantiene el acceso al regresar de otra pestaña', async ({ page, context }) => {
    await signIn(page, email!, password!)
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
    await signIn(page, email!, password!)
    await page.goto('/usuarios')

    const ownRow = page.getByRole('row').filter({ hasText: email! })
    await expect(ownRow.getByRole('button', { name: /Desactivar/ })).toBeDisabled()
  })
})

test.describe('sesión sin administración', () => {
  const email = process.env.E2E_MEMBER_EMAIL
  const password = process.env.E2E_MEMBER_PASSWORD

  test.skip(!email || !password, 'Configura E2E_MEMBER_EMAIL y E2E_MEMBER_PASSWORD.')

  test('impide acceder al control de usuarios', async ({ page }) => {
    await signIn(page, email!, password!)
    await page.goto('/usuarios')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
  })
})
