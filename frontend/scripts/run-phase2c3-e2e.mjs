import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const workdir = resolve(process.env.LOCALAPPDATA, 'Temp/silsanplex-phase2c2-20261021')
const project = 'silsanplexp2c2'
const url = 'http://127.0.0.1:58121'
const config = readFileSync(resolve(workdir, 'supabase/config.toml'), 'utf8')
if (!config.includes(`project_id = "${project}"`) || !/^port = 58121$/m.test(config)
  || !/^port = 58122$/m.test(config)) throw new Error('Unexpected temporary configuration')
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' })
const [volume] = JSON.parse(docker('volume', 'inspect', `supabase_db_${project}`))
if (volume.Name !== `supabase_db_${project}` || volume.Labels['com.supabase.cli.project'] !== project) throw new Error('Unexpected volume')
for (const [name, port, host] of [['db', '5432/tcp', '58122'], ['kong', '8000/tcp', '58121']]) {
  const [c] = JSON.parse(docker('inspect', `supabase_${name}_${project}`))
  if (!c.State.Running || c.Config.Labels['com.supabase.cli.project'] !== project
    || !c.NetworkSettings.Ports[port]?.some((p) => p.HostPort === host)
    || (c.Config.Labels['com.supabase.cli.workdir'] && resolve(c.Config.Labels['com.supabase.cli.workdir']) !== workdir)
    || (name === 'db' && !c.Mounts.some((m) => m.Type === 'volume' && m.Name === volume.Name))) throw new Error('Unexpected container')
}
const sql = (query) => docker('exec', `supabase_db_${project}`, 'psql', '-U', 'postgres', '-Atc', query).trim()
const def = sql("select pg_get_functiondef('public.record_distribution_delivery_outcome(jsonb)'::regprocedure)")
for (const marker of ['DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED', 'pg_advisory_xact_lock', 'distribution_delivery_outcomes_operation_key']) {
  if (!def.includes(marker)) throw new Error('Missing 2C-2 correction')
}
const orgs = JSON.parse(sql('select json_agg(o) from (select id,name,slug from public.organizations) o'))
if (orgs.length !== 1 || orgs[0].slug !== 'drogueria-silsan' || orgs[0].name !== 'Droguería SILSAN S.A.C.') throw new Error('Unexpected organization')
const status = JSON.parse(execFileSync('cmd.exe', ['/c', 'supabase', 'status', '--workdir', workdir, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
if (status.API_URL !== url || !status.DB_URL.includes(':58122/')) throw new Error('Unexpected API configuration')
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const checked = async (request) => { const { data, error } = await request; if (error) throw error; return data }
const email = 'phase2c3.runner@example.invalid'
const password = randomBytes(32).toString('base64url')
const { users } = await checked(admin.auth.admin.listUsers())
if (users.some((u) => u.email !== email)) throw new Error('Unexpected Auth identity in temporary database')
const existing = users.find((u) => u.email === email)
const { user } = await checked(existing
  ? admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
  : admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'E2E temporal Fase 2C-3' } }))
const organization_id = orgs[0].id
const memberships = await checked(admin.from('organization_memberships').select('organization_id').eq('user_id', user.id))
if (memberships.some((m) => m.organization_id !== organization_id)) throw new Error('Unexpected membership')
const role_code = 'E2E_PHASE2C3'
await checked(admin.from('roles').upsert({ code: role_code, name: 'Fixture temporal 2C-3', is_active: true }))
const permissions = ['CUSTOMERS_VIEW','CUSTOMERS_MANAGE','SUPPLIERS_VIEW','SUPPLIERS_MANAGE','PRODUCTS_VIEW','PRODUCTS_MANAGE','PURCHASES_VIEW','PURCHASES_MANAGE','PURCHASES_RECEIVE','INVENTORY_VIEW','INVENTORY_MANAGE','SALES_VIEW','SALES_MANAGE','DISTRIBUTION_VIEW','DISTRIBUTION_MANAGE']
await checked(admin.from('role_permissions').upsert(permissions.map((permission_code) => ({ role_code, permission_code }))))
await checked(admin.from('organization_memberships').upsert({ organization_id, user_id: user.id, is_active: true }, { onConflict: 'organization_id,user_id' }))
await checked(admin.from('user_roles').upsert({ organization_id, user_id: user.id, role_code }))
console.log('Prepared one fictional identity and scoped role; no credentials written to disk.')
const env = { ...process.env, CI: 'true', SILSAN_PHASE2C2_E2E: '1', E2E_PHASE2C2_WORKDIR: workdir, VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY, E2E_INVENTORY_FIXTURES_BASE64: 'e30=' }
for (const prefix of ['ADMIN', 'MEMBER', 'RECOVERY', 'REPAIRS']) { env[`E2E_${prefix}_EMAIL`] = email; env[`E2E_${prefix}_PASSWORD`] = password }
const result = spawnSync('cmd.exe', ['/c', 'node_modules\\.bin\\playwright.cmd', 'test', 'tests/e2e/operational-partial-deliveries.spec.ts', '--retries=0'], { env, stdio: 'inherit' })
process.exitCode = result.status ?? 1
