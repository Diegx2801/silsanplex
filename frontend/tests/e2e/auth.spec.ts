import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { test } from './fixtures/test.js'

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
const parsedSupabaseUrl = new URL(supabaseUrl)
const localSupabaseHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
if (
  parsedSupabaseUrl.protocol !== 'http:'
  || !localSupabaseHosts.has(parsedSupabaseUrl.hostname)
) {
  throw new Error('Las pruebas Auth E2E solo pueden ejecutarse contra una instancia local de Supabase.')
}

const mailpitUrl = new URL(process.env.E2E_MAILPIT_URL || 'http://127.0.0.1:54324')
if (
  mailpitUrl.protocol !== 'http:'
  || !localSupabaseHosts.has(mailpitUrl.hostname)
) {
  throw new Error('Las pruebas Auth E2E solo pueden consultar Mailpit local.')
}

type MailpitMessageSummary = {
  ID: string
  To?: Array<{ Address?: string }>
}

type MailpitMessage = {
  HTML?: string
  Text?: string
}

async function requestRecoveryLink(
  request: APIRequestContext,
  email: string,
  redirectTo: string,
) {
  const initialResponse = await request.get(
    new URL('/api/v1/messages?start=0&limit=50', mailpitUrl).toString(),
  )
  expect(initialResponse.ok(), 'Mailpit local debe estar iniciado para E2E Auth').toBe(true)
  const initialMailbox = await initialResponse.json() as {
    messages?: MailpitMessageSummary[]
  }
  const initialIds = new Set((initialMailbox.messages ?? []).map(({ ID }) => ID))

  const adminClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: adminSession, error: loginError } = await adminClient.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  })
  if (loginError || !adminSession.session) {
    throw loginError ?? new Error('La sesión administradora E2E no se creó.')
  }
  const headers = {
    apikey: supabasePublishableKey,
    authorization: `Bearer ${adminSession.session.access_token}`,
  }
  const listResponse = await request.post(`${supabaseUrl}/functions/v1/admin-users`, {
    headers,
    data: { action: 'list' },
  })
  expect(listResponse.ok()).toBe(true)
  const userList = await listResponse.json() as {
    data?: { users?: Array<{ user_id: string; email: string }> }
  }
  const recoveryUser = userList.data?.users?.find(
    (user) => user.email.toLowerCase() === email.toLowerCase(),
  )
  expect(recoveryUser, 'El usuario E2E de recuperación debe pertenecer a la organización').toBeDefined()

  const resetResponse = await request.post(`${supabaseUrl}/functions/v1/admin-users`, {
    headers,
    data: { action: 'send-password-reset', userId: recoveryUser!.user_id },
  })
  const resetBody = await resetResponse.json() as unknown
  expect(resetResponse.ok(), JSON.stringify(resetBody)).toBe(true)
  await adminClient.auth.signOut({ scope: 'local' })

  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const mailboxResponse = await request.get(
      new URL('/api/v1/messages?start=0&limit=50', mailpitUrl).toString(),
    )
    expect(mailboxResponse.ok(), 'Mailpit local dejó de responder durante la prueba').toBe(true)
    const mailbox = await mailboxResponse.json() as {
      messages?: MailpitMessageSummary[]
    }
    const messageSummary = mailbox.messages?.find((message) =>
      !initialIds.has(message.ID)
      && message.To?.some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase()),
    )

    if (messageSummary) {
      const messageResponse = await request.get(
        new URL(`/api/v1/message/${encodeURIComponent(messageSummary.ID)}`, mailpitUrl).toString(),
      )
      expect(messageResponse.ok(), 'Mailpit no pudo leer el correo de recuperación').toBe(true)
      const message = await messageResponse.json() as MailpitMessage
      const html = (message.HTML ?? '').replace(/&amp;/g, '&')
      const links = [
        ...Array.from(html.matchAll(/href\s*=\s*["']([^"']+)["']/gi), (match) => match[1]),
        ...Array.from((message.Text ?? '').matchAll(/https?:\/\/[^\s<>"']+/g), (match) => match[0]),
      ]
      const actionLink = links.find((link) => {
        try {
          const candidate = new URL(link)
          return candidate.origin === parsedSupabaseUrl.origin
            && candidate.pathname === '/auth/v1/verify'
            && candidate.searchParams.get('type') === 'recovery'
            && candidate.searchParams.get('redirect_to') === redirectTo
        } catch {
          return false
        }
      })

      if (actionLink) return actionLink
      throw new Error('El correo local llegó, pero no contiene un enlace válido de recuperación.')
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Supabase no entregó a Mailpit el correo de recuperación para ${email}.`)
}

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

test('solo cambia la contraseña con un enlace real de recuperación', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)
  const changedPassword = `${recoveryPassword}-nueva`
  await signIn(page, recoveryEmail, recoveryPassword)
  const previousAccessToken = await page.evaluate(() => {
    const sessionKey = Object.keys(window.localStorage).find(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
    )
    const session = JSON.parse(
      window.localStorage.getItem(sessionKey ?? '') ?? 'null',
    ) as { access_token?: string } | null
    if (!session?.access_token) throw new Error('Falta la sesión previa de recuperación.')
    return session.access_token
  })
  await page.goto('/establecer-contrasena')
  await page.getByLabel('Nueva contraseña').fill(changedPassword)
  await page.getByLabel('Confirmar contraseña').fill(changedPassword)
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'No hay una invitación ni una recuperación pendiente para esta sesión.',
  )

  const recoveryUrl = new URL('/establecer-contrasena', page.url()).toString()
  const actionLink = await requestRecoveryLink(request, recoveryEmail, recoveryUrl)
  await page.goto(actionLink)
  await expect(page).toHaveURL(/\/establecer-contrasena/)
  await expect(page.getByLabel('Nueva contraseña')).toBeVisible()
  const recoveryMethods = await page.evaluate(() => {
    const sessionKey = Object.keys(window.localStorage).find(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
    )
    const session = JSON.parse(
      window.localStorage.getItem(sessionKey ?? '') ?? 'null',
    ) as { access_token?: string } | null
    if (!session?.access_token) throw new Error('El enlace no creó una sesión Auth.')

    const payloadSegment = session.access_token.split('.')[1]
    if (!payloadSegment) throw new Error('La sesión Auth no contiene un JWT válido.')
    const normalizedPayload = payloadSegment
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=')
    const payload = JSON.parse(atob(normalizedPayload)) as {
      amr?: Array<{ method?: unknown }>
    }
    return (payload.amr ?? []).flatMap((entry) =>
      typeof entry.method === 'string' ? [entry.method] : [],
    )
  })
  // Supabase's server-side implicit email flow marks these verified links as
  // otp, not recovery. The database request marker must disambiguate a reset.
  expect(recoveryMethods).toContain('otp')
  await page.getByLabel('Nueva contraseña').fill(changedPassword)
  await page.getByLabel('Confirmar contraseña').fill(changedPassword)
  const passwordUpdateResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/functions/v1/complete-account-setup'),
  )
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  const passwordUpdateResponse = await passwordUpdateResponsePromise
  const passwordUpdateBody = await passwordUpdateResponse.json() as unknown
  expect(passwordUpdateResponse.ok(), JSON.stringify(passwordUpdateBody)).toBe(true)

  const previousSessionResponse = await request.post(
    `${supabaseUrl}/functions/v1/admin-users`,
    {
      headers: {
        apikey: supabasePublishableKey,
        authorization: `Bearer ${previousAccessToken}`,
      },
      data: { action: 'list' },
    },
  )
  expect(previousSessionResponse.status()).toBe(401)

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
    const currentUserId = await page.evaluate(() => {
      const sessionKey = Object.keys(window.localStorage).find(
        (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
      )
      const session = JSON.parse(window.localStorage.getItem(sessionKey ?? '') ?? 'null') as {
        user?: { id?: unknown }
      } | null
      if (typeof session?.user?.id !== 'string') throw new Error('Sesión E2E sin usuario.')
      return session.user.id
    })
    await page.route('**/functions/v1/admin-users**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            users: [{
              user_id: currentUserId,
              organization_id: '00000000-0000-4000-8000-000000000001',
              email: adminEmail,
              full_name: 'Administrador E2E',
              phone: null,
              is_active: true,
              auth_confirmed_at: new Date().toISOString(),
              permission_codes: [],
              is_admin: true,
              access_version: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }],
          },
        }),
      })
    })
    await page.goto('/usuarios')

    const ownRow = page.getByRole('row').filter({ hasText: adminEmail })
    await expect(ownRow.getByRole('button', { name: /Desactivar/ })).toBeDisabled()
  })

  test('expulsa la sesión cuando una función protegida responde 401', async ({
    page,
  }) => {
    await signIn(page, adminEmail, adminPassword)
    await page.route('**/functions/v1/admin-users**', async (route) => {
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
  test('rechaza invitaciones por API antes de llamar a Auth Admin', async ({ page, request }) => {
    await signIn(page, memberEmail, memberPassword)
    const accessToken = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(
        (name) => name.startsWith('sb-') && name.endsWith('-auth-token'),
      )
      const session = JSON.parse(localStorage.getItem(key ?? '') ?? 'null') as {
        access_token?: string
      } | null
      if (!session?.access_token) throw new Error('Falta la sesión ficticia E2E.')
      return session.access_token
    })
    const response = await request.post(`${supabaseUrl}/functions/v1/admin-users`, {
      headers: { apikey: supabasePublishableKey, authorization: `Bearer ${accessToken}` },
      data: {
        action: 'create', email: 'blocked-invitation@example.invalid',
        fullName: 'Blocked fictional invitation', phone: '',
        isAdmin: false, permissionCodes: ['CUSTOMERS_VIEW'],
      },
    })
    expect(response.status()).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: 'ADMIN_ACCESS_REQUIRED' } })
  })

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
