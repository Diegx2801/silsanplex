import type { SupabaseClient, User } from '@supabase/supabase-js'

export type AdministratorIdentity = {
  email: string
  fullName: string
  phone: string | null
}

export function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} en backend/.env.local.`)
  return value
}

export function administratorIdentityFromEnvironment(): AdministratorIdentity {
  const email = requiredEnvironment('INITIAL_ADMIN_EMAIL').toLowerCase()
  const fullName = requiredEnvironment('INITIAL_ADMIN_FULL_NAME')
  const phone = process.env.INITIAL_ADMIN_PHONE?.trim() || null

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('INITIAL_ADMIN_EMAIL no es válido.')
  if (fullName.length < 2) throw new Error('INITIAL_ADMIN_FULL_NAME no es válido.')

  return { email, fullName, phone }
}

export async function findUserByEmail(admin: SupabaseClient, email: string) {
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email)
    if (user) return user
    if (data.users.length < 100) return null
    page += 1
  }
}

export async function assignInitialAdministrator(
  admin: SupabaseClient,
  organizationSlug: string,
  user: User,
) {
  const { data, error } = await admin.rpc('platform_bootstrap_organization_admin', {
    organization_slug: organizationSlug,
    target_user_id: user.id,
  })
  if (error) throw new Error(error.message)
  return data as string
}
