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

async function provisionClientAdministrator() {
  const { url, secretKey } = loadSupabaseEnvironment()
  const identity = administratorIdentityFromEnvironment()
  const organizationName = requiredEnvironment('INITIAL_ORGANIZATION_NAME')
  const organizationSlug = requiredEnvironment('INITIAL_ORGANIZATION_SLUG')
  const appUrl = requiredEnvironment('PUBLIC_APP_URL').replace(/\/$/, '')

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug)) {
    throw new Error('INITIAL_ORGANIZATION_SLUG debe usar minúsculas, números y guiones.')
  }

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: organizationError } = await admin.from('organizations').upsert(
    { name: organizationName, slug: organizationSlug, is_active: true },
    { onConflict: 'slug', ignoreDuplicates: true },
  )
  if (organizationError) throw new Error(organizationError.message)

  const existingUser = await findUserByEmail(admin, identity.email)
  if (existingUser) {
    throw new Error('El correo ya existe. El alta inicial exige un correo que todavía no esté registrado.')
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(identity.email, {
    data: { full_name: identity.fullName, phone: identity.phone },
    redirectTo: `${appUrl}/establecer-contrasena`,
  })
  if (error || !data.user) throw new Error(error?.message || 'No se pudo invitar al administrador.')

  try {
    const organizationId = await assignInitialAdministrator(admin, organizationSlug, data.user)
    console.info(`Cliente preparado: ${organizationName} (${organizationId})`)
    console.info(`Invitación enviada a: ${identity.email}`)
  } catch (assignmentError) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw assignmentError
  }
}

provisionClientAdministrator().catch((error: unknown) => {
  console.error(`No se pudo provisionar el cliente: ${error instanceof Error ? error.message : 'Error desconocido'}`)
  process.exitCode = 1
})
