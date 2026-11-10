import type { SupabaseClient, User } from '@supabase/supabase-js'

export class InvitationAccessError extends Error {}

/** Authorize before Auth Admin creates an identity or sends irreversible email. */
export async function inviteUserForAdministrator(
  adminClient: SupabaseClient,
  actor: User,
  email: string,
  options: Parameters<SupabaseClient['auth']['admin']['inviteUserByEmail']>[1],
) {
  const { data: organizationId, error } = await adminClient.rpc(
    'resolve_admin_organization',
    { actor_user_id: actor.id },
  )

  if (error || !organizationId) {
    throw new InvitationAccessError(
      error?.message ?? 'ADMIN_ACCESS_REQUIRED',
    )
  }

  return adminClient.auth.admin.inviteUserByEmail(email, options)
}
