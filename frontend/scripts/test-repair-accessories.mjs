// Exclusive disposable Supabase: never reads application .env files or reuses a project.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { assertSupabaseDbLintSucceeded } from './lib/supabase-db-lint.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cli = path.join(root, 'backend/node_modules', process.platform === 'win32'
  ? '@supabase/cli-windows-x64/bin/supabase.exe' : `@supabase/cli-${process.platform}-${process.arch}/bin/supabase`)
const tempParent = process.env.SILSAN_AUDIT_TEMP || path.join(os.tmpdir(), 'opencode')
fs.mkdirSync(tempParent, { recursive: true })
const directory = fs.mkdtempSync(path.join(tempParent, 'silsan-accessories-'))
const backend = path.join(directory, 'backend')
const frontend = path.join(directory, 'frontend')
const evidence = path.join(directory, 'evidence')
fs.mkdirSync(evidence)
const project = `silsanacc${randomBytes(5).toString('hex')}`
const ports = { api: 59321, db: 59322, web: 59325 }
const api = `http://127.0.0.1:${ports.api}`
const upgradeNonRepairable = process.argv.includes('--upgrade-non-repairable')
const upgrade = process.argv.includes('--upgrade') || upgradeNonRepairable
const sqlOnly = process.argv.includes('--sql-only')
const nonRepairableOnly = process.argv.includes('--non-repairable-only')
const evidenceOnly = process.argv.includes('--e2e-only') || nonRepairableOnly
const checksOnly = process.argv.includes('--checks-only')
const workflowE2e = process.argv.includes('--workflow-e2e')
const runLog = []
let started = false
function runCaptured(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 600_000, ...options })
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  const output = stdout + stderr
  const redact = value => value.replace(/("(?:SECRET_KEY|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY)"\s*:\s*")[^"]*"/g, '$1[REDACTED]"')
  if (options.log) fs.writeFileSync(path.join(evidence, options.log), redact(output))
  if (options.print !== false) process.stdout.write(output)
  return { status: result.status, stdout, stderr, error: result.error }
}
function run(executable, args, options = {}) {
  const result = runCaptured(executable, args, options)
  assert.equal(result.status, 0,
    `${path.basename(executable)} ${args[0]} failed; ${options.log || ''}${result.error ? `; ${result.error.message}` : ''}`)
  return result.stdout
}
function verify() {
  const [container] = JSON.parse(execFileSync('docker', ['inspect', `supabase_db_${project}`], { encoding: 'utf8' }))
  assert.equal(container.Config.Labels['com.supabase.cli.project'], project)
  assert.equal(path.resolve(container.Config.Labels['com.supabase.cli.workdir']), backend)
  assert.ok(container.NetworkSettings.Ports['5432/tcp'].some(p => p.HostPort === String(ports.db)))
  assert.ok(container.Mounts.some(m => m.Type === 'volume' && m.Name === `supabase_db_${project}`))
}
function sql(input) {
  verify()
  return execFileSync('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], { input, encoding: 'utf8' }).trim()
}
const available = port => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(port, '127.0.0.1', () => server.close(resolve))
})
function peruDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = type => parts.find(part => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
function futureDate(monthsAhead) {
  const date = new Date()
  date.setUTCDate(15)
  date.setUTCMonth(date.getUTCMonth() + monthsAhead)
  return date.toISOString().slice(0,10)
}
// Business RPCs require an ordinary authenticated session, including fixture setup.
async function createInventoryE2eFixture(authenticatedClient, organizationId, actorId) {
  const suffix=randomBytes(5).toString('hex').toUpperCase()
  const fixture={productCode:`E2E-FEFO-${suffix}`,productDescription:`Producto control E2E FEFO ${suffix}`,
    sourceWarehouseCode:`E2O-${suffix.slice(-8)}`,sourceWarehouseName:`E2E Origen ${suffix}`,
    destinationWarehouseCode:`E2D-${suffix.slice(-8)}`,destinationWarehouseName:`E2E Destino ${suffix}`}
  const checked=async request=>{const result=await request;if(result.error)throw result.error;return result.data}
  const product=await checked(authenticatedClient.from('products').insert({organization_id:organizationId,code:fixture.productCode,
    description:fixture.productDescription,unit_of_measure:'UND',batch_control:true,expiration_control:true,
    cost:10,sale_price:25,created_by:actorId,updated_by:actorId}).select('id').single())
  const warehouseResults=await Promise.all([fixture.sourceWarehouseCode,fixture.destinationWarehouseCode].map((code,index)=>
    authenticatedClient.rpc('save_warehouse',{payload:{organization_id:organizationId,operation_key:randomUUID(),code,
      name:index===0?fixture.sourceWarehouseName:fixture.destinationWarehouseName,address:'Fixture E2E operational'}})))
  const failed=warehouseResults.find(result=>result.error);if(failed?.error)throw failed.error
  const [source,destination]=warehouseResults.map(result=>result.data)
  const locations=await checked(authenticatedClient.from('warehouse_locations').select('id,warehouse_id').in('warehouse_id',[source,destination]).eq('code','GENERAL'))
  const sourceLocation=locations.find(location=>location.warehouse_id===source),destinationLocation=locations.find(location=>location.warehouse_id===destination)
  assert(sourceLocation&&destinationLocation,'Operational fixtures require both GENERAL locations')
  for(const [lot,quantity,unitCost,months] of [['LOTE-E2E-A',3,10,12],['LOTE-E2E-B',6,20,13],['LOTE-E2E-C',4,30,14]]) {
    await checked(authenticatedClient.rpc('record_inventory_movement',{payload:{document_reference:`E2E-STOCK-${suffix}`,organization_id:organizationId,
      product_id:product.id,movement_type:'entrada',quantity,warehouse_id:source,location_id:sourceLocation.id,stock_status:'available',unit_cost:unitCost,
      lot,expiration_date:futureDate(months),operation_date:peruDate(),reason:`Preparación operativa ${lot}`}}))
  }
  return fixture
}
try {
  if (!checksOnly) {
  await Promise.all([59320, 59321, 59322, 59323, 59324, 59325, 59327, 59328, 59329].map(available))
  for (const name of ['backend/supabase/migrations', 'backend/supabase/tests', 'backend/supabase/seed.sql', 'backend/supabase/config.toml',
    'frontend/src', 'frontend/tests', 'frontend/index.html', 'frontend/package.json', 'frontend/tsconfig.json',
    'frontend/tsconfig.app.json', 'frontend/tsconfig.node.json', 'frontend/vite.config.ts', 'frontend/playwright.config.ts']) {
    const target = path.join(directory, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.cpSync(path.join(root, name), target, { recursive: true })
  }
  fs.symlinkSync(path.join(root, 'frontend/node_modules'), path.join(frontend, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  const configPath = path.join(backend, 'supabase/config.toml')
  let config = fs.readFileSync(configPath, 'utf8').replace('project_id = "backend"', `project_id = "${project}"`)
  for (const [from, to] of [[54320,59320],[54321,59321],[54322,59322],[54323,59323],[54324,59324],[54327,59327],[54329,59329],[8083,59328]]) {
    config = config.replaceAll(`= ${from}`, `= ${to}`)
  }
  fs.writeFileSync(configPath, config)
  const migrationDirectory = path.join(backend, 'supabase/migrations')
  const candidates = fs.readdirSync(migrationDirectory).filter(n => n.includes(upgradeNonRepairable ? 'repair_non_repairable' : 'repair_accessory_control'))
  assert.equal(candidates.length, 1)
  const candidate = candidates[0]
  // Postpone the candidate AND later dependent migrations, only in this copy.
  const upgradeSources = fs.readdirSync(migrationDirectory).filter(n => n >= candidate)
    .map(name => [name, fs.readFileSync(path.join(migrationDirectory, name))])
  const manifest = Object.fromEntries(fs.readdirSync(migrationDirectory).map(n => [n,
    createHash('sha256').update(fs.readFileSync(path.join(migrationDirectory, n))).digest('hex')]))
  fs.writeFileSync(path.join(evidence, 'migration-manifest.json'), JSON.stringify(manifest, null, 2))
  if (upgrade) for (const [name] of upgradeSources) fs.unlinkSync(path.join(migrationDirectory, name))
  // start may fail after creating resources; cleanup still verifies exclusive identity.
  started = true
  run(cli, ['start', '-x', 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'],
    { cwd: backend, log: 'migrations-start.log', print: false })
  verify()
  if (upgrade) {
    const historical = sql(`begin;
      insert into auth.users(id,email,raw_user_meta_data) values('a6290000-0000-4000-8000-000000000001','historical@example.invalid','{"full_name":"Historical fixture"}');
      insert into organizations(id,name,slug) values('a6290000-0000-4000-8000-000000000002','Historical fixtures','historical-accessories');
      insert into repairs(organization_id,requester_type,requesting_area,equipment_type,external_equipment_description,status,
        problem_description,customer_name_snapshot,customer_document_snapshot,product_code_snapshot,product_description_snapshot,notes,delivered_at)
      select 'a6290000-0000-4000-8000-000000000002','internal','Fixture area','external','Fixture equipment',s,
        'Historical problem','Fixture area','INTERNO','EXTERNO','Fixture equipment','Accesorios: cable y estuche',
        case when s='delivered' then now() else null end
      from unnest(array['received','delivered','cancelled','rejected']) s;
       select jsonb_agg(to_jsonb(r) order by id) from repairs r where organization_id='a6290000-0000-4000-8000-000000000002'; commit;`)
    const historicalWarranty = sql(`insert into repair_service_warranties(organization_id,repair_id,warranty_days,coverage)
      select organization_id,id,90,'Cobertura histórica original' from repairs
      where organization_id='a6290000-0000-4000-8000-000000000002' and status='delivered';
      select jsonb_agg(to_jsonb(w) order by id) from repair_service_warranty_details w
      where organization_id='a6290000-0000-4000-8000-000000000002';`)
    for (const [name, source] of upgradeSources) fs.writeFileSync(path.join(migrationDirectory, name), source)
    run(cli, ['migration', 'up'], { cwd: backend, log: 'migrations-upgrade.log' })
    const after = JSON.parse(sql(`select jsonb_agg(to_jsonb(r) order by id) from repairs r where organization_id='a6290000-0000-4000-8000-000000000002'`))
    const before = JSON.parse(historical)
    assert.deepEqual(after.map(row => Object.fromEntries(Object.keys(before[0]).map(key => [key, row[key]]))), before,
      'Every pre-existing historical field remains unchanged')
    assert.ok(after.every(row => row.non_repairable_decision_event_id === null && row.returned_unrepaired_at === null))
    assert.equal(sql(`select jsonb_agg(to_jsonb(w) order by id) from repair_service_warranty_details w
      where organization_id='a6290000-0000-4000-8000-000000000002'`), historicalWarranty,
    'Historical delivered warranty, including start/end dates, remains unchanged')
    assert.equal(sql('select count(*) from repair_accessories'), '0')
    fs.writeFileSync(path.join(evidence, 'historical-upgrade.json'), JSON.stringify({ candidate, unchanged: true, historicalRepairs: 4,
      unchangedDeliveredWarranties: 1, inferredAccessories: 0, inferredDecisions: 0 }))
  }
  const organizationsBeforeSql = JSON.parse(sql("select coalesce(json_agg(json_build_object('id',id,'slug',slug,'name',name) order by slug),'[]'::json) from public.organizations"))
  if (!upgrade) {
    assert.equal(organizationsBeforeSql.length, 1, 'Disposable E2E preflight starts with only the seeded SILSAN organization')
    assert.equal(organizationsBeforeSql[0].slug, 'drogueria-silsan')
    assert.equal(organizationsBeforeSql[0].name, 'Droguería SILSAN S.A.C.')
  }
  // Original concurrency suites use a fixed hostname. Alias ONLY this new DB on an exclusive network.
  const network = `${project}-race`
  run('docker', ['network', 'create', network], { print: false })
  run('docker', ['network', 'connect', '--alias', 'supabase_db_backend', network, `supabase_db_${project}`], { print: false })
  if (!evidenceOnly) {
    const tests = fs.readdirSync(path.join(backend, 'supabase/tests/database')).filter(n => process.argv.includes('--all-sql') || /^repairs?[_.].*\.sql$/.test(n) || n === 'authorization_permissions.test.sql')
      .filter(n => n.endsWith('.test.sql')).sort()
    // Check the migrated application before installing test-only pgTAP routines.
    const lintArgs = ['db', 'lint', '--level', 'warning', '--fail-on', 'warning', '--output-format', 'json']
    const lintProbe = `ci_lint_probe_${randomBytes(5).toString('hex')}`
    const missingColumn = `ci_lint_missing_${randomBytes(5).toString('hex')}`
    sql(`create function public.${lintProbe}() returns integer language plpgsql as $lint$
      begin return (select ${missingColumn} from public.organizations limit 1); end
      $lint$;`)
    const lintFailureProbe = runCaptured(cli, lintArgs, { cwd: backend, log: 'sql-lint-failure-probe.log', print: false })
    fs.writeFileSync(path.join(evidence, 'sql-lint-failure-probe-streams.json'), JSON.stringify({
      executable: 'supabase', args: lintArgs, expectedFinding: { function: lintProbe, missingColumn },
      status: lintFailureProbe.status, stdout: lintFailureProbe.stdout, stderr: lintFailureProbe.stderr,
      spawnError: lintFailureProbe.error?.message ?? null,
    }, null, 2))
    assert.notEqual(lintFailureProbe.status, 0,
      'db lint --fail-on warning must fail for a real PL/pgSQL function referencing a missing column')
    assert.ok(`${lintFailureProbe.stdout}\n${lintFailureProbe.stderr}`.includes(lintProbe)
      || `${lintFailureProbe.stdout}\n${lintFailureProbe.stderr}`.includes(missingColumn),
    'The lint failure evidence must identify the deliberately invalid function or missing column')
    assert.throws(() => assertSupabaseDbLintSucceeded(lintFailureProbe), /SUPABASE_DB_LINT_EXIT/)
    sql(`drop function public.${lintProbe}()`)

    const lintResult = runCaptured(cli, lintArgs, { cwd: backend, log: 'sql-lint.log' })
    fs.writeFileSync(path.join(evidence, 'sql-lint-streams.json'), JSON.stringify({
      executable: 'supabase', args: lintArgs, status: lintResult.status,
      stdout: lintResult.stdout, stderr: lintResult.stderr, spawnError: lintResult.error?.message ?? null,
    }, null, 2))
    assertSupabaseDbLintSucceeded(lintResult)
    sql('create extension if not exists pgtap with schema extensions;')
    const tap = run('docker', ['run','--rm','--network',`supabase_network_${project}`,
      '--mount',`type=bind,source=${path.join(backend,'supabase/tests/database')},target=/tests,readonly`,
      '-e','PGPASSWORD=postgres','public.ecr.aws/supabase/pg_prove:3.36','pg_prove','--nocolor','--verbose',
      '-h',`supabase_db_${project}`,'-U','postgres','-d','postgres',...tests.map(n => `/tests/${n}`)],
    { log: 'sql-tests.log', print: false })
    const suites = []
    let active
    for (const line of tap.split('\n')) {
      const header = /^\/tests\/(\S+\.test\.sql)/.exec(line)
      if (header) { active = { suite: header[1], assertions: 0, plan: null }; suites.push(active) }
      else if (active && /^ok\s+\d+/.test(line)) active.assertions++
      else if (active && /^1\.\.(\d+)/.test(line)) active.plan = Number(/^1\.\.(\d+)/.exec(line)[1])
    }
    assert.equal(suites.length, tests.length, 'Every SQL suite must have evidence')
    for (const suite of suites) assert.equal(suite.assertions, suite.plan, `Incomplete TAP: ${suite.suite}`)
    fs.writeFileSync(path.join(evidence,'sql-tests.json'),JSON.stringify(suites,null,2))
    const organizationsAfterSql = JSON.parse(sql("select coalesce(json_agg(json_build_object('id',id,'slug',slug,'name',name) order by slug),'[]'::json) from public.organizations"))
    fs.writeFileSync(path.join(evidence,'organizations-after-sql.json'),JSON.stringify({before:organizationsBeforeSql,after:organizationsAfterSql},null,2))
    if (!upgrade) assert.deepEqual(organizationsAfterSql, organizationsBeforeSql, 'SQL suites must not contaminate organizations used by subsequent operational E2E')
    console.log(`SQL: ${suites.length} suites, ${suites.reduce((n,s) => n+s.assertions,0)} assertions passed.`)
    runLog.push({ sqlSuites: suites })
  }
  if (!sqlOnly) {
    const status = JSON.parse(execFileSync(cli, ['status', '-o', 'json'], { cwd: backend, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }))
    assert.equal(status.API_URL, api)
    const admin = createClient(api, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const checked = async request => { const result = await request; if (result.error) throw result.error; return result.data }
    const organizations = await checked(admin.from('organizations').select('id,name,slug'))
    assert.equal(organizations.length,1,'The disposable E2E project is seeded with exactly SILSAN before fixtures')
    assert.deepEqual({slug:organizations[0].slug,name:organizations[0].name},{slug:'drogueria-silsan',name:'Droguería SILSAN S.A.C.'})
    const organizationId = organizations[0].id
    const identities = {}
    for (const [name, role] of [['admin','ADMIN'], ['ordinary','VENTAS'], ['member','VENTAS'],
      ['recovery','VENTAS'], ['repairs','ADMIN'], ['technician','TECNICO_REPARACIONES'], ['foreign','ADMIN']]) {
      const org = name === 'foreign' ? randomUUID() : organizationId
      const email = `${name}.${randomUUID()}@example.invalid`, password = randomBytes(24).toString('base64url')
      const { user } = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Accessory E2E ${name}` } }))
      if (name !== 'foreign') {
        await checked(admin.from('organization_memberships').insert({ organization_id: org, user_id: user.id }))
        await checked(admin.from('user_roles').insert({ organization_id: org, user_id: user.id, role_code: role }))
      }
      if (name === 'ordinary') sql(`insert into organization_user_permissions(organization_id,user_id,permission_code) values('${org}','${user.id}','REPAIRS_DELIVER');`)
      identities[name] = { email, password, id: user.id, organizationId: org }
    }
    const inventoryClient = createClient(api,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const inventoryLogin = await inventoryClient.auth.signInWithPassword({email:identities.admin.email,password:identities.admin.password})
    if (inventoryLogin.error) throw inventoryLogin.error
    for (let base = 1; base <= 1001; base += 250) {
      const customers = [], products = []
      for (let i = base; i <= Math.min(base + 249, 1001); i++) {
        const tail = i.toString(16).padStart(12, '0'), suffix = String(i).padStart(4, '0')
        const common = { organization_id: organizationId, created_by: identities.admin.id, updated_by: identities.admin.id }
        customers.push({ ...common, id: `e0000000-0000-4000-8000-${tail}`, document_type: 'OTHER', document_number: `E2ECAT${suffix}`, legal_name: `ZZZZ E2E Cliente catálogo ${suffix}` })
        products.push({ ...common, id: `f0000000-0000-4000-8000-${tail}`, code: `E2ECAT${suffix}`, description: `ZZZZ E2E Producto catálogo ${suffix}`, unit_of_measure: 'UND', batch_control: false, expiration_control: false, serial_control: false, sale_price: 10 })
      }
      await checked(admin.from('customers').insert(customers)); await checked(admin.from('products').insert(products))
    }
    const inventoryFixtures = await Promise.all(Array.from({length:3},()=>createInventoryE2eFixture(inventoryClient,organizationId,identities.admin.id)))
    let playwright = fs.readFileSync(path.join(frontend, 'playwright.config.ts'), 'utf8')
      .replace("testDir: './tests/e2e'", "testDir: './tests'")
      .replaceAll('127.0.0.1:5173', `127.0.0.1:${ports.web}`)
      .replace("command: 'npm run dev -- --host 127.0.0.1'", `command: 'npm run dev -- --host 127.0.0.1 --port ${ports.web} --strictPort'`)
      .replace('reuseExistingServer: !isCI', 'reuseExistingServer: false')
      .replace("reporter: 'list'", `reporter: [['list'], ['json', { outputFile: process.env.E2E_RESULTS_FILE || ${JSON.stringify(path.join(evidence, 'e2e-results.json'))} }]],\n  outputDir: ${JSON.stringify(path.join(evidence, 'playwright'))}`)
      .replace("trace: 'on-first-retry'", "trace: 'retain-on-failure', screenshot: 'only-on-failure', timezoneId: 'America/Lima'")
      .replace('baseURL:', 'actionTimeout: 15000, navigationTimeout: 20000, baseURL:')
    fs.writeFileSync(path.join(frontend, 'playwright.config.ts'), playwright)
    // Explicit Vite root allowlist only includes this snapshot and installed dependencies.
    const viteConfig = path.join(frontend, 'vite.config.ts')
    fs.writeFileSync(viteConfig, fs.readFileSync(viteConfig, 'utf8').replace('server: {', `server: { fs: { allow: [${JSON.stringify(frontend)}, ${JSON.stringify(path.join(root, 'frontend/node_modules'))}] },`))
    const env = { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
      E2E_INVENTORY_FIXTURES_BASE64: Buffer.from(JSON.stringify(inventoryFixtures)).toString('base64url'),
      E2E_ACCESSORY_IDENTITIES: JSON.stringify(identities), E2E_ACCESSORY_PROJECT: project,
      E2E_ACCESSORY_WORKDIR: backend, E2E_ACCESSORY_API_URL: api, E2E_ACCESSORY_DB_PORT: String(ports.db),
      E2E_ACCESSORY_WEB_URL: `http://127.0.0.1:${ports.web}` }
    delete env.SILSAN_PHASE2C2_E2E
    env.SILSAN_ACCESSORY_CI_E2E = '1'
    for (const [prefix,name] of [['E2E_ADMIN','admin'],['E2E_MEMBER','member'],['E2E_RECOVERY','recovery'],['E2E_REPAIRS','repairs']]) {
      env[`${prefix}_EMAIL`] = identities[name].email; env[`${prefix}_PASSWORD`] = identities[name].password
    }
    const createForeignTenant = async () => {
      const foreignId = identities.foreign.organizationId
      const foreignSlug = `acc-${foreignId}`
      const actorId = identities.foreign.id
      sql(`begin;
        insert into public.organizations(id,name,slug) values('${foreignId}','Other disposable tenant','${foreignSlug}');
        insert into public.organization_memberships(organization_id,user_id) values('${foreignId}','${actorId}');
        insert into public.user_roles(organization_id,user_id,role_code) values('${foreignId}','${actorId}','ADMIN');
        commit;`)
    }
    const playwrightCommand = ['node_modules/@playwright/test/cli.js','test','--max-failures=3']
    if (workflowE2e) {
      // Run the exact workflow test files first while the operational fixture
      // still verifies that only the seeded SILSAN tenant exists.
      playwrightCommand.push(...['auth','customers','inventory-fefo','operational-flow','operational-fefo-multilot',
        'operational-partial-deliveries','repairs','sales'].map(name=>`e2e/${name}.spec.ts`))
    } else {
      playwrightCommand.push('tests/e2e/repairs.spec.ts')
    }
    if (!nonRepairableOnly) run(process.execPath, playwrightCommand,
      { cwd: frontend, env, log: 'e2e.log' })
    // Both modes keep SILSAN exclusive until the strict operational preflight
    // has finished; only the accessory suite needs a second organization.
    await createForeignTenant()
    if (!nonRepairableOnly) run(process.execPath,['node_modules/@playwright/test/cli.js','test','--max-failures=1',
      'accessory-e2e/repair-accessories.spec.ts'],
    {cwd:frontend,env:{...env,E2E_RESULTS_FILE:path.join(evidence,'e2e-accessories-results.json')},log:'e2e-accessory-multitenant.log'})
    run(process.execPath,['node_modules/@playwright/test/cli.js','test','--max-failures=1',
      'accessory-e2e/repair-non-repairable.spec.ts'],
    {cwd:frontend,env:{...env,E2E_RESULTS_FILE:path.join(evidence,'e2e-non-repairable-results.json')},log:'e2e-non-repairable.log'})
    runLog.push({ e2e: 'passed', suite: nonRepairableOnly ? 'non-repairable only' : workflowE2e ? 'all workflow E2E, accessories and non-repairable' : 'repairs, accessories and non-repairable', api, web: ports.web })
  }
  }
  if (checksOnly || process.argv.includes('--checks')) {
    const options = { cwd: path.join(root, 'frontend'),
      env: { ...process.env, VITE_SUPABASE_URL: 'http://127.0.0.1:1', VITE_SUPABASE_PUBLISHABLE_KEY: 'unit-placeholder' } }
    const commands = [
      ['vitest/vitest.mjs',['run','--reporter=default','--reporter=json',`--outputFile=${path.join(evidence,'unit-results.json')}`],'unit-tests.log'],
      ['oxlint/bin/oxlint',['--deny-warnings'],'lint.log'],
      ['typescript/bin/tsc',['-b'],'typecheck.log'],
      ['vite/bin/vite.js',['build'],'build.log'],
      ['typescript/bin/tsc',['--project','tsconfig.e2e.json'],'test-e2e-typecheck.log'],
    ]
    for (const [script,args,log] of commands) {
      run(process.execPath,[path.join(root,'frontend/node_modules',script),...args],{...options,log})
    }
    run(process.execPath,[path.join(root,'backend/node_modules/typescript/bin/tsc'),'--project','tsconfig.scripts.json'], {cwd:path.join(root,'backend'),log:'backend-typecheck.log'})
  }
  fs.writeFileSync(path.join(evidence, 'summary.json'), JSON.stringify({ project, base: execFileSync('git', ['rev-parse','HEAD'], { cwd: root, encoding: 'utf8' }).trim(), upgrade, runLog }, null, 2))
} finally {
  fs.writeFileSync(path.join(evidence,'git-status.txt'),execFileSync('git',['status','--short','--branch'],{cwd:root,encoding:'utf8'}))
  fs.writeFileSync(path.join(evidence,'git-diff-stat.txt'),execFileSync('git',['diff','--stat'],{cwd:root,encoding:'utf8'}))
  if (started) {
    const exists = spawnSync('docker', ['inspect', `supabase_db_${project}`], { encoding: 'utf8' })
    if (exists.status === 0) {
      verify()
      run(cli, ['stop', '--no-backup'], { cwd: backend, log: 'cleanup.log', print: false })
    }
    spawnSync('docker', ['network','rm', `${project}-race`], { encoding: 'utf8' })
  }
  console.log(`EVIDENCE_DIRECTORY=${evidence}`)
}
