import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// No .env loading, password updates, resets, migrations or cleanup.
const project = 'silsanplexp2c2'
const workdir = resolve(process.env.LOCALAPPDATA, 'Temp/silsanplex-phase2c2-20261021')
const url = 'http://127.0.0.1:58121'
const root = resolve(import.meta.dirname, '../..')
const frontend = resolve(root, 'frontend')
const run = (...args) => {
  try {
    return execFileSync(args[0], args.slice(1), {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    // Never print status output (keys) or database row contents on command errors.
    throw new Error('Isolated preflight/read failed: ' + args[0] + ' (' + String(error.code ?? error.status) + ')')
  }
}
const docker = (...args) => run('docker', ...args)
const sql = (query) => docker('exec', 'supabase_db_' + project, 'psql', '-U', 'postgres',
  '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', query).trim()
const checked = async (promise) => {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}
const config = readFileSync(resolve(workdir, 'supabase/config.toml'), 'utf8')
assert(config.includes('project_id = "silsanplexp2c2"'))
assert(/^\[api\][\s\S]*?^port = 58121$/m.test(config))
assert(/^\[db\][\s\S]*?^port = 58122$/m.test(config))
const [volume] = JSON.parse(docker('volume', 'inspect', 'supabase_db_' + project))
assert.equal(volume.Name, 'supabase_db_' + project)
assert.equal(volume.Labels['com.supabase.cli.project'], project)
for (const [name, port, host] of [['db', '5432/tcp', '58122'], ['kong', '8000/tcp', '58121'],
  ['auth'], ['rest'], ['edge_runtime']]) {
  const [container] = JSON.parse(docker('inspect', 'supabase_' + name + '_' + project))
  assert(container.State.Running)
  assert.equal(container.Config.Labels['com.supabase.cli.project'], project)
  assert.equal(container.Config.Labels['com.docker.compose.project'], project)
  if (container.Config.Labels['com.supabase.cli.workdir']) {
    assert.equal(resolve(container.Config.Labels['com.supabase.cli.workdir']), workdir)
  }
  if (port) assert(container.NetworkSettings.Ports[port]?.some((binding) => binding.HostPort === host))
  if (name === 'db') assert(container.Mounts.some((mount) => mount.Type === 'volume'
    && mount.Name === volume.Name && mount.Destination === '/var/lib/postgresql/data'))
  if (name === 'edge_runtime') {
    const functionsPath = resolve(workdir, 'supabase/functions').replaceAll('\\', '/')
    assert(container.Mounts.some((mount) => mount.Type === 'bind' && !mount.RW
      && mount.Source.toLowerCase().endsWith(functionsPath.slice(2).toLowerCase())))
    assert.deepEqual(Object.keys(container.NetworkSettings.Networks), ['supabase_network_' + project])
    const env = Object.fromEntries(container.Config.Env.map((item) => {
      const separator = item.indexOf('=')
      return [item.slice(0, separator), item.slice(separator + 1)]
    }))
    assert.equal(env.SUPABASE_URL, 'http://kong:8000')
    const routes = JSON.parse(env.SUPABASE_INTERNAL_FUNCTIONS_CONFIG)
    for (const fn of ['admin-users', 'ruc-lookup', 'dni-lookup']) assert.equal(routes[fn]?.verifyJWT, true)
  }
}
const migration = readFileSync(resolve(root,
  'backend/supabase/migrations/20261021120000_fix_distribution_outcome_idempotency.sql'), 'utf8')
const definition = sql("select pg_get_functiondef('public.record_distribution_delivery_outcome(jsonb)'::regprocedure)")
for (const marker of ['DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED', 'pg_advisory_xact_lock',
  'distribution_delivery_outcomes_operation_key']) assert(definition.includes(marker))
const normalize = (text) => text.replaceAll('\r\n', '\n').trim()
const body = migration.match(/as \$\$([\s\S]*?)\$\$/i)
assert(body, 'Versioned SQL function body must be identifiable')
assert.equal(normalize(sql("select prosrc from pg_proc where oid='public.record_distribution_delivery_outcome(jsonb)'::regprocedure")),
  normalize(body[1]))
assert.equal(sql('select count(*) from supabase_migrations.schema_migrations'), '148')
const organizations = JSON.parse(sql('select json_agg(o) from (select id,name,slug,is_active from organizations) o'))
assert.equal(organizations.length, 1)
const organization = organizations[0]
assert.equal(organization.slug, 'drogueria-silsan')
assert.equal(organization.name, 'Droguería SILSAN S.A.C.')
assert.equal(organization.is_active, true)
const status = JSON.parse(run('cmd.exe', '/c', 'supabase', 'status', '--workdir', workdir, '-o', 'json'))
assert.equal(status.API_URL, url)
assert(new URL(status.DB_URL).port === '58122')
assert.equal(sql('select current_database()'), 'postgres')
const admin = createClient(url, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const users = (await checked(admin.auth.admin.listUsers({ perPage: 1000 }))).users
assert(users.every((user) => user.email === 'phase2c3.runner@example.invalid'
  || /^regression\.[0-9a-f]+\.(admin|member|recovery|repairs)@example\.invalid$/.test(user.email)))
assert(users.length < 1000)

// Preserve all pre-existing rows, not only their counts. No content is printed.
const protectedTables = ['products', 'customers', 'orders', 'order_items', 'sales', 'purchase_orders',
  'distribution_deliveries', 'distribution_delivery_items', 'distribution_delivery_inventory_allocations',
  'distribution_delivery_outcomes', 'distribution_delivery_outcome_lines', 'inventory_movements',
  'inventory_reservations', 'organization_memberships', 'user_roles', 'roles', 'role_permissions']
const snapshots = new Map(protectedTables.map((table) => [table,
  JSON.parse(sql("select coalesce(json_agg(t), '[]'::json) from public." + table + ' t'))]))
const digest = (row) => createHash('sha256').update(JSON.stringify(row)).digest('hex')
const baseline = new Map([...snapshots].map(([table, rows]) => [table, rows.map(digest)]))
console.log('Identity PASS: project/ports/volume/network, 148 installed migrations, exact 2C-2 SQL, unique organization.')
console.log('Preserving ' + users.length + ' prior fictional identities and all pre-existing fixture rows.')

// Copy only tracked function sources into the existing temporary read-only bind.
// Do not restart/reconfigure containers or overwrite divergent temporary files.
const tracked = run('git', '-C', root, 'ls-files', 'backend/supabase/functions').trim().split(/\r?\n/)
for (const file of tracked) {
  if (!/\.(ts|json|lock)$/.test(file) || file.includes('node_modules/')) continue
  const relative = file.slice('backend/supabase/functions/'.length)
  const destination = resolve(workdir, 'supabase/functions', relative)
  const content = readFileSync(resolve(root, file))
  if (existsSync(destination)) assert(readFileSync(destination).equals(content), 'Divergent temporary Edge source: ' + relative)
  else {
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, content, { flag: 'wx' })
  }
}
for (const fn of ['admin-users', 'ruc-lookup', 'dni-lookup']) {
  const response = await fetch(url + '/functions/v1/' + fn)
  assert.equal(response.status, 401, 'Edge JWT gate: ' + fn)
}

const runId = randomBytes(6).toString('hex')
const catalogPrefix = 'E2ECAT' + runId.slice(0, 8).toUpperCase() + '-'
assert(catalogPrefix.length + 4 <= 20)
assert(!snapshots.get('customers').some((row) => row.document_number.startsWith(catalogPrefix)))
assert(!snapshots.get('products').some((row) => row.code.startsWith(catalogPrefix)))
const catalogCustomers = Array.from({ length: 1001 }, () => randomUUID())
const catalogProducts = Array.from({ length: 1001 }, () => randomUUID())
const catalogCustomerName = 'ZZZZZ E2E Cliente catálogo ' + runId + ' 1001'
const catalogProductName = 'ZZZZZ E2E Producto catálogo ' + runId + ' 1001'
const identities = {}
const repairsRole = 'E2E_REG_REPAIRS_' + runId.toUpperCase()
await checked(admin.from('roles').insert({ code: repairsRole, name: 'Reparaciones regresión ' + runId, is_active: true }))
const repairPermissions = ['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE', 'PRODUCTS_VIEW', 'PRODUCTS_MANAGE',
  'INVENTORY_VIEW', 'INVENTORY_MANAGE', 'REPAIRS_VIEW', 'REPAIRS_CREATE', 'REPAIRS_UPDATE', 'REPAIRS_ASSIGN',
  'REPAIRS_CHANGE_STATUS', 'REPAIRS_APPROVE_QUOTE', 'REPAIRS_USE_PARTS', 'REPAIRS_DELIVER', 'REPAIRS_PERFORM_TECHNICAL']
await checked(admin.from('role_permissions').insert(repairPermissions.map((permission_code) => ({
  role_code: repairsRole, permission_code,
}))))
for (const [name, role] of [['admin', 'ADMIN'], ['member', 'VENTAS'], ['recovery', 'VENTAS'], ['repairs', repairsRole]]) {
  const email = 'regression.' + runId + '.' + name + '@example.invalid'
  const password = randomBytes(32).toString('base64url')
  const { user } = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: 'E2E aislado ' + name + ' ' + runId } }))
  await checked(admin.from('organization_memberships').insert({ organization_id: organization.id,
    user_id: user.id, is_active: true }))
  await checked(admin.from('user_roles').insert({ organization_id: organization.id,
    user_id: user.id, role_code: role }))
  identities[name] = { email, password, id: user.id }
}
const actor = identities.admin.id
const catalogInserted = {}
for (const table of ['customers', 'products']) {
  const nameColumn = table === 'customers' ? 'legal_name' : 'description'
  const name = table === 'customers' ? catalogCustomerName : catalogProductName
  const prior = await admin.from(table).select('id', { count: 'exact', head: true })
    .eq('organization_id', organization.id).eq('is_active', true).lt(nameColumn, name)
  if (prior.error) throw new Error(prior.error.message)
  // Reuse earlier catalog rows read-only for the >1000-position assertion.
  // Only the search target and the customer for sales must belong to this run.
  const offsets = prior.count >= 1000 ? [0, 1000] : Array.from({ length: 1001 }, (_, index) => index)
  const rows = offsets.map((offset) => {
    const index = offset + 1
    const suffix = String(index).padStart(4, '0')
    const common = { organization_id: organization.id, created_by: actor, updated_by: actor, is_active: true }
    const id = (table === 'customers' ? catalogCustomers : catalogProducts)[offset]
    return table === 'customers'
      ? { ...common, id, document_type: 'OTHER', document_number: catalogPrefix + suffix,
        legal_name: 'ZZZZZ E2E Cliente catálogo ' + runId + ' ' + suffix }
      : { ...common, id, code: catalogPrefix + suffix, description: 'ZZZZZ E2E Producto catálogo ' + runId + ' ' + suffix,
        unit_of_measure: 'UND', batch_control: false, expiration_control: false, serial_control: false, sale_price: 10 }
  })
  for (let start = 0; start < rows.length; start += 250) await checked(admin.from(table).insert(rows.slice(start, start + 250)))
  catalogInserted[table] = rows.length
}
const api = createClient(url, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
await checked(api.auth.signInWithPassword(identities.admin))
const edge = await checked(api.functions.invoke('admin-users', { body: { action: 'list' } }))
assert(edge.data?.users?.some((user) => user.user_id === actor), 'Real admin-users must execute successfully')
const productCode = 'E2E-FEFO-' + runId.toUpperCase()
const productDescription = 'Producto control E2E FEFO ' + runId
const product = await checked(api.from('products').insert({ organization_id: organization.id,
  code: productCode, description: productDescription, unit_of_measure: 'UND', batch_control: true,
  expiration_control: true, cost: 10, sale_price: 25, created_by: actor, updated_by: actor }).select('id').single())
const warehouses = []
for (const type of ['Origen', 'Destino']) {
  const code = 'E2' + type[0] + '-' + runId.toUpperCase()
  const name = 'E2E ' + type + ' ' + runId
  const id = await checked(api.rpc('save_warehouse', { payload: { organization_id: organization.id,
    operation_key: randomUUID(), code, name, address: 'Fixture aislado FEFO' } }))
  const location = await checked(api.from('warehouse_locations').select('id')
    .eq('organization_id', organization.id).eq('warehouse_id', id).eq('code', 'GENERAL').single())
  const persisted = await checked(api.from('warehouses').select('code,name').eq('id', id).single())
  warehouses.push({ id, code: persisted.code, name: persisted.name, locationId: location.id })
}
for (const [offset, quantity, cost] of [[0, 3, 10], [1, 6, 20], [2, 4, 30]]) {
  const expiration = new Date()
  expiration.setUTCDate(15)
  expiration.setUTCMonth(expiration.getUTCMonth() + 12 + offset)
  await checked(api.rpc('record_inventory_movement', { payload: { organization_id: organization.id,
    product_id: product.id, warehouse_id: warehouses[0].id, location_id: warehouses[0].locationId,
    movement_type: 'entrada', quantity, unit_cost: cost, stock_status: 'available',
    lot: 'LOTE-E2E-' + String.fromCharCode(65 + offset), expiration_date: expiration.toISOString().slice(0, 10),
    operation_date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
    reason: 'Preparación E2E FEFO ' + offset,
    document_reference: 'E2E-STOCK-SETUP-' + runId } }))
}
const inventory = [{ productCode, productDescription, sourceWarehouseCode: warehouses[0].code,
  sourceWarehouseName: warehouses[0].name, destinationWarehouseCode: warehouses[1].code,
  destinationWarehouseName: warehouses[1].name, transferReference: 'TR-' + runId }]
await api.auth.signOut()
console.log('Prepared new fictional users: ' + Object.values(identities).map((i) => i.email).join(', '))
console.log('New catalog rows: ' + JSON.stringify(catalogInserted) + '; new FEFO 3/6/4 fixture. Real Edge admin-users PASS.')
const env = { ...process.env, CI: 'true', SILSAN_PHASE2C2_E2E: '1', E2E_PHASE2C2_WORKDIR: workdir,
  VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  E2E_CATALOG_PREFIX: catalogPrefix, E2E_CATALOG_CUSTOMER_ID: catalogCustomers[1000],
  E2E_CATALOG_PRODUCT_ID: catalogProducts[1000], E2E_CATALOG_CUSTOMER_NAME: catalogCustomerName,
  E2E_CATALOG_PRODUCT_NAME: catalogProductName,
  E2E_INVENTORY_FIXTURES_BASE64: Buffer.from(JSON.stringify(inventory)).toString('base64url') }
// Never pass a privileged key inherited from a parent to Vite/Playwright.
for (const key of Object.keys(env)) {
  if (/SERVICE_ROLE|SECRET_KEY|ADMIN_PASSWORD|DB_URL|DATABASE_URL/.test(key)) delete env[key]
}
for (const [name, identity] of Object.entries(identities)) {
  env['E2E_' + name.toUpperCase() + '_EMAIL'] = identity.email
  env['E2E_' + name.toUpperCase() + '_PASSWORD'] = identity.password
}
const resultsDirectory = resolve(root, 'output/isolated-regression-' + runId)
mkdirSync(resultsDirectory)
env.PLAYWRIGHT_JSON_OUTPUT_FILE = resolve(resultsDirectory, 'results.json')
const args = ['test', '--retries=0', '--reporter=list,json', '--output=../output/isolated-regression-' + runId + '/artifacts']
const listed = spawnSync('cmd.exe', ['/c', 'node_modules\\.bin\\playwright.cmd', 'test', '--list'],
  { cwd: frontend, env, encoding: 'utf8' })
process.stdout.write(listed.stdout ?? '')
assert.equal(listed.status, 0, 'Discovery must succeed before execution')
const started = Date.now()
const result = spawnSync('cmd.exe', ['/c', 'node_modules\\.bin\\playwright.cmd', ...args],
  { cwd: frontend, env, stdio: 'inherit' })
let preserved = true
for (const [table, fingerprints] of baseline) {
  const current = JSON.parse(sql("select coalesce(json_agg(t), '[]'::json) from public." + table + ' t'))
  const hashes = new Set(current.map(digest))
  if (!fingerprints.every((fingerprint) => hashes.has(fingerprint))) {
    console.error('Prior fixture changed in ' + table)
    preserved = false
  }
}
for (const user of users) {
  const current = await checked(admin.auth.admin.getUserById(user.id))
  assert.equal(current.user.email, user.email)
  assert.equal(current.user.updated_at, user.updated_at)
}
console.log('Prior fixture rows preserved: ' + preserved + '. Duration ms: ' + (Date.now() - started))
console.log('Evidence: ' + resultsDirectory)
assert(preserved, 'Preserve previous fixtures')
process.exitCode = result.status ?? 1
