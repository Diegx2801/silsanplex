import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { loadSupabaseEnvironment } from './lib/supabase-environment.ts'
import {
  administratorIdentityFromEnvironment,
  assignInitialAdministrator,
  findUserByEmail,
  requiredEnvironment,
} from './lib/provisioning.ts'

config({ path: '.env.local', quiet: true })

async function createLocalAdmin() {
  const { url, secretKey } = loadSupabaseEnvironment()
  if (!/^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    throw new Error('dev:create-admin solo puede ejecutarse contra Supabase local.')
  }

  const identity = administratorIdentityFromEnvironment()
  const password = requiredEnvironment('INITIAL_ADMIN_PASSWORD')
  if (password.length < 8) throw new Error('INITIAL_ADMIN_PASSWORD debe tener al menos 8 caracteres.')

  const organizationSlug = process.env.INITIAL_ORGANIZATION_SLUG?.trim() || 'drogueria-silsan'
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let user = await findUserByEmail(admin, identity.email)
  let created = false

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: identity.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: identity.fullName, phone: identity.phone },
    })
    if (error || !data.user) throw new Error(error?.message || 'No se pudo crear el administrador local.')
    user = data.user
    created = true
  } else {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: identity.fullName, phone: identity.phone },
    })
    if (error || !data.user) throw new Error(error?.message || 'No se pudo preparar el administrador local.')
    user = data.user
  }

  try {
    const organizationId = await assignInitialAdministrator(admin, organizationSlug, user)
    console.info(`Administrador local listo: ${identity.email}`)
    console.info(`Organización: ${organizationId}`)
    console.info('No se envió correo: la cuenta local quedó confirmada y puede iniciar sesión.')
  } catch (error) {
    if (created) await admin.auth.admin.deleteUser(user.id)
    throw error
  }
}

createLocalAdmin().catch((error: unknown) => {
  console.error(`No se pudo crear el administrador local: ${error instanceof Error ? error.message : 'Error desconocido'}`)
  process.exitCode = 1
})
