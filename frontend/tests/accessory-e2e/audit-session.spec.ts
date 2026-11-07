import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

type Identity = { id: string; email: string; password: string; organizationId: string }
type Claims = { sub: string; session_id: string; exp: number; role: string }
const identities = JSON.parse(process.env.E2E_ACCESSORY_IDENTITIES || '{}') as Record<string, Identity>
const apiURL = 'http://127.0.0.1:59321'
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
test.setTimeout(90_000)

function verifyDisposable() {
  const project = process.env.E2E_ACCESSORY_PROJECT
  expect(project).toMatch(/^silsanacc[0-9a-f]{10}$/)
  expect(process.env.VITE_SUPABASE_URL).toBe(apiURL)
  const [container] = JSON.parse(execFileSync('docker', ['inspect', `supabase_db_${project}`], { encoding: 'utf8' }))
  expect(container.Config.Labels['com.supabase.cli.project']).toBe(project)
  expect(path.resolve(container.Config.Labels['com.supabase.cli.workdir'])).toBe(path.resolve(process.env.E2E_ACCESSORY_WORKDIR!))
  expect(container.NetworkSettings.Ports['5432/tcp']).toEqual(expect.arrayContaining([expect.objectContaining({ HostPort: '59322' })]))
  expect(container.Mounts).toEqual(expect.arrayContaining([expect.objectContaining({ Type: 'volume', Name: `supabase_db_${project}` })]))
}
function sql(input: string) {
  verifyDisposable()
  return execFileSync('docker', ['exec', '-i', `supabase_db_${process.env.E2E_ACCESSORY_PROJECT}`,
    'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], { input, encoding: 'utf8' }).trim()
}
async function login(name: string) {
  const identity = identities[name]
  expect(identity).toBeTruthy()
  const client = createClient(apiURL, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await client.auth.signInWithPassword({ email: identity.email, password: identity.password })
  if (result.error) throw new Error(result.error.message)
  const token = result.data.session!.access_token
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Claims
  expect(claims.sub).toBe(identity.id)
  expect(claims.role).toBe('authenticated')
  expect(claims.exp).toBeGreaterThan(Date.now() / 1000)
  return { client, identity, token, claims }
}
async function rest(token: string, endpoint: string, body?: object) {
  const response = await fetch(`${apiURL}/rest/v1/${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, data: await response.json() }
}
async function createRepair(actor: Awaited<ReturnType<typeof login>>) {
  const result = await actor.client.rpc('create_repair', { payload: {
    organization_id: actor.identity.organizationId, operation_key: randomUUID(), requester_type: 'internal',
    requesting_area: 'D01 test laboratory', equipment_type: 'external',
    external_equipment_description: 'D01 disposable equipment', problem_description: 'D01 audit-session regression',
  } })
  if (result.error) throw new Error(result.error.message)
  return result.data as string
}
const audit = (org: string, repair: string) => `audit_events?select=id&organization_id=eq.${org}&entity_id=eq.${repair}`
const projections = [
  { name: 'list_distribution_delivery_status_history', args: (org: string) => ({ requested_organization_id: org, requested_delivery_id: randomUUID() }) },
  { name: 'list_distribution_inventory_movements', args: (org: string) => ({ requested_organization_id: org, requested_order_id: randomUUID() }) },
  { name: 'list_distribution_delivery_inventory_trace', args: (org: string) => ({ requested_organization_id: org }) },
]

test.beforeEach(verifyDisposable)

test('D01: the same signed unexpired JWT loses SQL and REST audit reads after Auth revocation', async () => {
  const actor = await login('admin')
  const org = actor.identity.organizationId
  const repair = await createRepair(actor)
  const readSQL = () => JSON.parse(sql(`begin; set local role authenticated;
    select set_config('request.jwt.claims','${JSON.stringify(actor.claims).replaceAll("'", "''")}',true);
    select jsonb_build_object('active',current_auth_session_is_active(),
      'audits',(select count(*) from audit_events where organization_id='${org}' and entity_id='${repair}'),
      'repairs',(select count(*) from repair_list where organization_id='${org}' and id='${repair}'));
    rollback;`).split(/\r?\n/).at(-1)!)
  expect(readSQL()).toEqual({ active: true, audits: 1, repairs: 1 })
  const active = await rest(actor.token, audit(org, repair))
  expect(active.status).toBe(200)
  expect(active.data).toHaveLength(1)

  const signout = await actor.client.auth.signOut({ scope: 'local' })
  expect(signout.error).toBeNull()
  expect(sql(`select count(*) from auth.sessions where id='${actor.claims.session_id}' and user_id='${actor.identity.id}'`)).toBe('0')
  expect(actor.claims.exp).toBeGreaterThan(Date.now() / 1000)
  // Keep the original JWT, not the signed-out client's now-empty auth storage.
  // HTTP 200 + false/[] proves PostgREST accepted it and RLS enforced revocation.
  const session = await rest(actor.token, 'rpc/current_auth_session_is_active', {})
  expect(session).toEqual({ status: 200, data: false })
  expect(readSQL()).toEqual({ active: false, audits: 0, repairs: 0 })
  const retries = []
  for (let i = 0; i < 3; i++) {
    const response = await rest(actor.token, audit(org, repair))
    expect(response).toEqual({ status: 200, data: [] })
    retries.push(response)
  }
  expect(await rest(actor.token, `repair_list?select=id&organization_id=eq.${org}&id=eq.${repair}`)).toEqual({ status: 200, data: [] })
  const rpcResults = []
  for (const projection of projections) {
    const response = await rest(actor.token, `rpc/${projection.name}`, projection.args(org))
    expect(response.status).toBe(403)
    expect(response.data.code).toBe('42501')
    expect(response.data.message).toBe('DISTRIBUTION_FORBIDDEN')
    rpcResults.push({ rpc: projection.name, status: response.status, code: response.data.code })
  }
  const fresh = await login('admin')
  try {
    const response = await rest(fresh.token, audit(org, repair))
    expect(response.status).toBe(200)
    expect(response.data).toHaveLength(1)
    expect(await rest(actor.token, audit(org, repair))).toEqual({ status: 200, data: [] })
  } finally { await fresh.client.auth.signOut({ scope: 'local' }) }
  await test.info().attach('d01-signed-jwt-sql-and-http.json', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
    tokenSha256: createHash('sha256').update(actor.token).digest('hex'), expiresAt: actor.claims.exp,
    revokedSessionId: actor.claims.session_id, activeStatus: active.status, session, retries, rpcResults,
    sqlAfter: readSQL(), freshSessionDoesNotReviveOldJWT: true,
  }, null, 2)) })
})

test('D01: active audit reads retain tenant and administrator checks, including revoked authority', async () => {
  const admin = await login('admin'), ordinary = await login('ordinary'), foreign = await login('foreign')
  const org = admin.identity.organizationId
  let authorityRemoved = false
  try {
    const repair = await createRepair(admin)
    const foreignRepair = await createRepair(foreign)
    expect((await rest(admin.token, audit(org, repair))).data).toHaveLength(1)
    expect(await rest(ordinary.token, audit(org, repair))).toEqual({ status: 200, data: [] })
    expect(await rest(foreign.token, audit(org, repair))).toEqual({ status: 200, data: [] })
    expect((await rest(foreign.token, audit(foreign.identity.organizationId, foreignRepair))).data).toHaveLength(1)
    sql(`delete from user_roles where organization_id='${org}' and user_id='${admin.identity.id}' and role_code='ADMIN'`)
    authorityRemoved = true
    expect(await rest(admin.token, 'rpc/current_auth_session_is_active', {})).toEqual({ status: 200, data: true })
    expect(await rest(admin.token, audit(org, repair))).toEqual({ status: 200, data: [] })
    for (const projection of projections) {
      const response = await rest(admin.token, `rpc/${projection.name}`, projection.args(org))
      expect(response.status).toBe(403)
    }
  } finally {
    if (authorityRemoved) sql(`insert into user_roles(organization_id,user_id,role_code) values('${org}','${admin.identity.id}','ADMIN') on conflict do nothing`)
    await Promise.all([admin, ordinary, foreign].map(actor => actor.client.auth.signOut({ scope: 'local' })))
  }
})
