import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { loadSupabaseEnvironment } from './lib/supabase-environment.ts'
import { findUserByEmail, requiredEnvironment } from './lib/provisioning.ts'

type E2eIdentity = {
  email: string
  password: string
  fullName: string
  roleCodes: string[]
}

config({ path: '.env.local', quiet: true })

function assertStrictlyLocalSupabase(url: string) {
  const parsedUrl = new URL(url)
  const isLocalHost = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(
    parsedUrl.hostname,
  )

  if (parsedUrl.protocol !== 'http:' || !isLocalHost || parsedUrl.port !== '54321') {
    throw new Error(
      'e2e:prepare solo admite Supabase local por HTTP en localhost:54321.',
    )
  }
}

function loadIdentity(
  prefix: 'E2E_ADMIN' | 'E2E_MEMBER',
  fullName: string,
  roleCodes: string[],
): E2eIdentity {
  const email = requiredEnvironment(`${prefix}_EMAIL`).toLowerCase()
  const password = requiredEnvironment(`${prefix}_PASSWORD`)

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error(`${prefix}_EMAIL no es válido.`)
  }
  if (password.length < 8) {
    throw new Error(`${prefix}_PASSWORD debe tener al menos 8 caracteres.`)
  }

  return { email, password, fullName, roleCodes }
}

async function upsertAuthIdentity(
  admin: SupabaseClient,
  identity: E2eIdentity,
): Promise<User> {
  const existingUser = await findUserByEmail(admin, identity.email)

  if (existingUser) {
    const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
      password: identity.password,
      email_confirm: true,
      user_metadata: { full_name: identity.fullName, phone: null },
    })
    if (error || !data.user) {
      throw new Error(error?.message || 'No se pudo actualizar una identidad E2E.')
    }
    return data.user
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: identity.email,
    password: identity.password,
    email_confirm: true,
    user_metadata: { full_name: identity.fullName, phone: null },
  })
  if (error || !data.user) {
    throw new Error(error?.message || 'No se pudo crear una identidad E2E.')
  }
  return data.user
}

async function assignFixtureMembership(
  admin: SupabaseClient,
  organizationId: string,
  user: User,
  roleCodes: string[],
) {
  const { data: memberships, error: membershipReadError } = await admin
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)

  if (membershipReadError) throw membershipReadError
  if ((memberships ?? []).some((membership) => membership.organization_id !== organizationId)) {
    throw new Error(
      `La identidad E2E ${user.email ?? user.id} ya pertenece a otra organización local.`,
    )
  }

  const { error: membershipError } = await admin
    .from('organization_memberships')
    .upsert(
      {
        organization_id: organizationId,
        user_id: user.id,
        is_active: true,
        deactivated_at: null,
      },
      { onConflict: 'organization_id,user_id' },
    )
  if (membershipError) throw membershipError

  const { error: deleteRolesError } = await admin
    .from('user_roles')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
  if (deleteRolesError) throw deleteRolesError

  const { error: rolesError } = await admin.from('user_roles').insert(
    roleCodes.map((roleCode) => ({
      organization_id: organizationId,
      user_id: user.id,
      role_code: roleCode,
      assigned_by: null,
    })),
  )
  if (rolesError) throw rolesError
}

function writePlaywrightEnvironment(admin: E2eIdentity, member: E2eIdentity) {
  const target = resolve(process.cwd(), '..', 'frontend', '.env.e2e.local')
  const contents = [
    '# Generado por backend/npm run e2e:prepare. No versionar.',
    `E2E_ADMIN_EMAIL=${JSON.stringify(admin.email)}`,
    `E2E_ADMIN_PASSWORD=${JSON.stringify(admin.password)}`,
    `E2E_MEMBER_EMAIL=${JSON.stringify(member.email)}`,
    `E2E_MEMBER_PASSWORD=${JSON.stringify(member.password)}`,
    '',
  ].join('\n')

  writeFileSync(target, contents, { encoding: 'utf8', mode: 0o600 })
}

async function prepareLocalE2e() {
  const { url, secretKey } = loadSupabaseEnvironment()
  assertStrictlyLocalSupabase(url)

  const adminIdentity = loadIdentity('E2E_ADMIN', 'Administrador E2E', ['ADMIN'])
  const memberIdentity = loadIdentity('E2E_MEMBER', 'Miembro de Ventas E2E', ['VENTAS'])
  if (adminIdentity.email === memberIdentity.email) {
    throw new Error('E2E_ADMIN_EMAIL y E2E_MEMBER_EMAIL deben ser diferentes.')
  }

  const organizationSlug = process.env.INITIAL_ORGANIZATION_SLUG?.trim() || 'drogueria-silsan'
  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', organizationSlug)
    .eq('is_active', true)
    .maybeSingle()
  if (organizationError) throw organizationError
  if (!organization) {
    throw new Error(`No existe la organización local activa ${organizationSlug}.`)
  }

  const adminUser = await upsertAuthIdentity(supabase, adminIdentity)
  const memberUser = await upsertAuthIdentity(supabase, memberIdentity)

  await assignFixtureMembership(
    supabase,
    organization.id,
    adminUser,
    adminIdentity.roleCodes,
  )
  await assignFixtureMembership(
    supabase,
    organization.id,
    memberUser,
    memberIdentity.roleCodes,
  )
  writePlaywrightEnvironment(adminIdentity, memberIdentity)

  console.info('Usuarios E2E locales preparados y frontend/.env.e2e.local actualizado.')
  console.info('No se enviaron correos ni se mostraron contraseñas.')
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }

  try {
    return JSON.stringify(error)
  } catch {
    return 'Error desconocido'
  }
}

prepareLocalE2e().catch((error: unknown) => {
  console.error(
    `No se pudo preparar E2E local: ${describeError(error)}`,
  )
  process.exitCode = 1
})
