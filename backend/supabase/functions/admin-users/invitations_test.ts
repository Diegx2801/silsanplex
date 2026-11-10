import type { SupabaseClient, User } from '@supabase/supabase-js'
import { InvitationAccessError, inviteUserForAdministrator } from './invitations.ts'

const actor = { id: '11111111-1111-4111-8111-111111111111' } as User

function fixture(authorization: { data: string | null; error: { message: string } | null }) {
  const calls: unknown[] = []
  const invitation = { data: { user: { id: 'new-user' } }, error: null }
  const client = {
    rpc(name: string, args: unknown) {
      calls.push([name, args])
      return Promise.resolve(authorization)
    },
    auth: { admin: { inviteUserByEmail(email: string, options: unknown) {
      calls.push(['invite', email, options])
      return Promise.resolve(invitation)
    } } },
  } as unknown as SupabaseClient
  return { client, calls, invitation }
}

for (const authorization of [
  { data: null, error: { message: 'ADMIN_ACCESS_REQUIRED' } },
  { data: null, error: { message: 'ADMIN_ORGANIZATION_AMBIGUOUS' } },
  { data: null, error: { message: 'database unavailable' } },
  { data: null, error: null },
]) {
  Deno.test(`no crea identidad ni envía correo sin autorización: ${authorization.error?.message ?? 'empty'}`, async () => {
    const { client, calls } = fixture(authorization)
    let rejected = false
    try {
      await inviteUserForAdministrator(client, actor, 'fixture@example.invalid', {})
    } catch (error) {
      if (!(error instanceof InvitationAccessError)) throw error
      rejected = true
    }
    if (!rejected || calls.length !== 1) throw new Error('Invitation was not blocked before its side effect')
  })
}

Deno.test('autoriza al actor antes de enviar exactamente la invitación solicitada', async () => {
  const { client, calls, invitation } = fixture({ data: 'organization-id', error: null })
  const options = { data: { full_name: 'Fixture' }, redirectTo: 'http://127.0.0.1/establecer-contrasena' }
  const result = await inviteUserForAdministrator(client, actor, 'fixture@example.invalid', options)
  const expected = [
    ['resolve_admin_organization', { actor_user_id: actor.id }],
    ['invite', 'fixture@example.invalid', options],
  ]
  if (result !== invitation || JSON.stringify(calls) !== JSON.stringify(expected)) {
    throw new Error('Authorization must precede the unchanged invitation')
  }
})
