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
const upgrade = process.argv.includes('--upgrade')
const sqlOnly = process.argv.includes('--sql-only')
const evidenceOnly = process.argv.includes('--e2e-only')
const checksOnly = process.argv.includes('--checks-only')
const runLog = []
let started = false
function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 600_000, ...options })
  const output = (result.stdout || '') + (result.stderr || '')
  if (options.log) fs.writeFileSync(path.join(evidence, options.log), output.replace(/("(?:SECRET_KEY|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY)"\s*:\s*")[^"]*"/g, '$1[REDACTED]"'))
  if (options.print !== false) process.stdout.write(output)
  assert.equal(result.status, 0, `${path.basename(executable)} ${args[0]} failed; ${options.log || ''}`)
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
  const candidates = fs.readdirSync(migrationDirectory).filter(n => n.includes('repair_accessory_control'))
  assert.equal(candidates.length, 1)
  const candidate = candidates[0]
  const candidateSource = fs.readFileSync(path.join(migrationDirectory, candidate))
  const manifest = Object.fromEntries(fs.readdirSync(migrationDirectory).map(n => [n,
    createHash('sha256').update(fs.readFileSync(path.join(migrationDirectory, n))).digest('hex')]))
  fs.writeFileSync(path.join(evidence, 'migration-manifest.json'), JSON.stringify(manifest, null, 2))
  if (upgrade) fs.unlinkSync(path.join(migrationDirectory, candidate))
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
    fs.writeFileSync(path.join(migrationDirectory, candidate), candidateSource)
    run(cli, ['migration', 'up'], { cwd: backend, log: 'migrations-upgrade.log' })
    const after = sql(`select jsonb_agg(to_jsonb(r)-'accessories_reviewed_at' order by id) from repairs r where organization_id='a6290000-0000-4000-8000-000000000002'`)
    assert.equal(after, historical)
    assert.equal(sql('select count(*) from repair_accessories'), '0')
    fs.writeFileSync(path.join(evidence, 'historical-upgrade.json'), JSON.stringify({ unchanged: true, historicalRepairs: 4, inferredAccessories: 0 }))
  }
  // Original concurrency suites use a fixed hostname. Alias ONLY this new DB on an exclusive network.
  const network = `${project}-race`
  run('docker', ['network', 'create', network], { print: false })
  run('docker', ['network', 'connect', '--alias', 'supabase_db_backend', network, `supabase_db_${project}`], { print: false })
  if (!evidenceOnly) {
    const tests = fs.readdirSync(path.join(backend, 'supabase/tests/database')).filter(n => process.argv.includes('--all-sql') || /^repairs?[_.].*\.sql$/.test(n) || n === 'authorization_permissions.test.sql')
      .filter(n => n.endsWith('.test.sql')).sort()
    // Check the migrated application before installing test-only pgTAP routines.
    const lint = JSON.parse(run(cli, ['db', 'lint', '--level', 'warning'], { cwd: backend, log: 'sql-lint.log' }))
    assert.deepEqual(lint.results, [], 'Database lint must have no warnings/errors')
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
    console.log(`SQL: ${suites.length} suites, ${suites.reduce((n,s) => n+s.assertions,0)} assertions passed.`)
    runLog.push({ sqlSuites: suites })
  }
  if (!sqlOnly) {
    const status = JSON.parse(execFileSync(cli, ['status', '-o', 'json'], { cwd: backend, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }))
    assert.equal(status.API_URL, api)
    const admin = createClient(api, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const checked = async request => { const result = await request; if (result.error) throw result.error; return result.data }
    const organizationId = randomUUID()
    await checked(admin.from('organizations').insert({ id: organizationId, name: 'Disposable accessory E2E', slug: `acc-${organizationId}` }))
    const identities = {}
    for (const [name, role] of [['admin','ADMIN'], ['ordinary','VENTAS'], ['foreign','ADMIN']]) {
      const org = name === 'foreign' ? randomUUID() : organizationId
      if (name === 'foreign') await checked(admin.from('organizations').insert({ id: org, name: 'Other disposable tenant', slug: `acc-${org}` }))
      const email = `${name}.${randomUUID()}@example.invalid`, password = randomBytes(24).toString('base64url')
      const { user } = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Accessory E2E ${name}` } }))
      await checked(admin.from('organization_memberships').insert({ organization_id: org, user_id: user.id }))
      await checked(admin.from('user_roles').insert({ organization_id: org, user_id: user.id, role_code: role }))
      if (name === 'ordinary') sql(`insert into organization_user_permissions(organization_id,user_id,permission_code) values('${org}','${user.id}','REPAIRS_DELIVER');`)
      identities[name] = { email, password, id: user.id, organizationId: org }
    }
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
    let playwright = fs.readFileSync(path.join(frontend, 'playwright.config.ts'), 'utf8')
      .replace("testDir: './tests/e2e'", "testDir: './tests'")
      .replaceAll('127.0.0.1:5173', `127.0.0.1:${ports.web}`)
      .replace("command: 'npm run dev -- --host 127.0.0.1'", `command: 'npm run dev -- --host 127.0.0.1 --port ${ports.web} --strictPort'`)
      .replace('reuseExistingServer: !isCI', 'reuseExistingServer: false')
      .replace("reporter: 'list'", `reporter: [['list'], ['json', { outputFile: ${JSON.stringify(path.join(evidence, 'e2e-results.json'))} }]],\n  outputDir: ${JSON.stringify(path.join(evidence, 'playwright'))}`)
      .replace("trace: 'on-first-retry'", "trace: 'retain-on-failure', screenshot: 'only-on-failure', timezoneId: 'America/Lima'")
      .replace('baseURL:', 'actionTimeout: 15000, navigationTimeout: 20000, baseURL:')
    fs.writeFileSync(path.join(frontend, 'playwright.config.ts'), playwright)
    // Explicit Vite root allowlist only includes this snapshot and installed dependencies.
    const viteConfig = path.join(frontend, 'vite.config.ts')
    fs.writeFileSync(viteConfig, fs.readFileSync(viteConfig, 'utf8').replace('server: {', `server: { fs: { allow: [${JSON.stringify(frontend)}, ${JSON.stringify(path.join(root, 'frontend/node_modules'))}] },`))
    const env = { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
      E2E_INVENTORY_FIXTURES_BASE64: 'W10=', E2E_ACCESSORY_IDENTITIES: JSON.stringify(identities), E2E_ACCESSORY_PROJECT: project }
    delete env.SILSAN_PHASE2C2_E2E
    for (const prefix of ['E2E_ADMIN','E2E_MEMBER','E2E_RECOVERY','E2E_REPAIRS']) {
      env[`${prefix}_EMAIL`] = identities.admin.email; env[`${prefix}_PASSWORD`] = identities.admin.password
    }
    run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--max-failures=3', 'tests/e2e/repairs.spec.ts', 'tests/accessory-e2e/repair-accessories.spec.ts'],
      { cwd: frontend, env, log: 'e2e.log' })
    runLog.push({ e2e: 'passed', api, web: ports.web })
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
