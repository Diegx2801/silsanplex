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
const recoveryEmail = requiredE2eEnvironment('E2E_RECOVERY_EMAIL')
const recoveryPassword = requiredE2eEnvironment('E2E_RECOVERY_PASSWORD')
const supabaseUrl = requiredE2eEnvironment('VITE_SUPABASE_URL')
const supabasePublishableKey = requiredE2eEnvironment(
  'VITE_SUPABASE_PUBLISHABLE_KEY',
)

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

test('cambiar la contraseña termina la sesión y exige un nuevo ingreso', async ({
  page,
}) => {
  const changedPassword = `${recoveryPassword}-nueva`
  await signIn(page, recoveryEmail, recoveryPassword)
  await page.goto('/establecer-contrasena')
  await page.getByLabel('Nueva contraseña').fill(changedPassword)
  await page.getByLabel('Confirmar contraseña').fill(changedPassword)
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()

  await expect(page).toHaveURL(/\/iniciar-sesion$/)
  await expect(page.getByText('Contraseña actualizada.')).toBeVisible()

  await page.getByLabel('Correo').fill(recoveryEmail)
  await page.getByLabel('Contraseña').fill(changedPassword)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/$/)
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

  test('conserva abierta la invitación al regresar de otra pestaña', async ({
    page,
    context,
  }) => {
    await signIn(page, adminEmail, adminPassword)
    await page.goto('/usuarios')
    await page.getByRole('button', { name: 'Invitar usuario' }).click()
    await page.getByLabel('Nombre completo').fill('Borrador sin enviar')

    const otherPage = await context.newPage()
    await otherPage.goto('about:blank')
    await otherPage.bringToFront()
    await page.bringToFront()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByLabel('Nombre completo')).toHaveValue(
      'Borrador sin enviar',
    )
  })

  test('no permite que el administrador se desactive a sí mismo', async ({ page }) => {
    await signIn(page, adminEmail, adminPassword)
    await page.goto('/usuarios')

    const ownRow = page.getByRole('row').filter({ hasText: adminEmail })
    await expect(ownRow.getByRole('button', { name: /Desactivar/ })).toBeDisabled()
  })

  test('expulsa la sesión cuando una función protegida responde 401', async ({
    page,
  }) => {
    await signIn(page, adminEmail, adminPassword)
    await page.route('**/functions/v1/admin-users', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'La sesión expiró.' },
        }),
      })
    })
    await page.goto('/usuarios')

    await expect(page).toHaveURL(/\/iniciar-sesion$/)
    await expect(page.getByText('Tu sesión expiró.')).toBeVisible()
  })
})

test.describe('sesión sin administración', () => {
  test('impide acceder al control de usuarios', async ({ page }) => {
    await signIn(page, memberEmail, memberPassword)
    await page.goto('/usuarios')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
  })

  test('detecta una sesión revocada al recuperar el foco', async ({
    page,
    context,
    request,
  }) => {
    await signIn(page, memberEmail, memberPassword)
    const accessToken = await page.evaluate(() => {
      const sessionKey = Object.keys(window.localStorage).find(
        (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
      )
      if (!sessionKey) throw new Error('No se encontró la sesión de Supabase.')

      const storedSession = JSON.parse(
        window.localStorage.getItem(sessionKey) ?? 'null',
      ) as { access_token?: unknown } | null
      if (typeof storedSession?.access_token !== 'string') {
        throw new Error('La sesión almacenada no contiene un access token.')
      }

      return storedSession.access_token
    })

    const revocationResponse = await request.post(
      `${supabaseUrl}/auth/v1/logout?scope=local`,
      {
        headers: {
          apikey: supabasePublishableKey,
          authorization: `Bearer ${accessToken}`,
        },
      },
    )
    expect(revocationResponse.ok()).toBe(true)

    const otherPage = await context.newPage()
    await otherPage.goto('about:blank')
    await otherPage.bringToFront()
    await page.bringToFront()
    // Chromium headless no garantiza que bringToFront() emita el evento DOM
    // focus. Disparamos el evento explícitamente para probar la revalidación
    // que ejecuta la aplicación al recuperar el foco en un navegador real.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))

    await expect(page).toHaveURL(/\/iniciar-sesion$/)
    await expect(page.getByText('Tu sesión expiró.')).toBeVisible()
  })
})
