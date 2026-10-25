// Real Auth + PostgREST + browser, against a newly-created disposable project.
// No target overrides, .env files, business credentials or RPC mocks.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'
import { FiscalEnvironment, api, ports, closeFiscalTestResources } from './lib/fiscal-integration-environment.mjs'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.dirname(frontend)
const environment = new FiscalEnvironment(root)
const evidence = { integration: [], responses: [], browser: [], unexpectedRequests: [], pageErrors: [] }
const check = (label, condition) => {
  assert.ok(condition, label)
  evidence.integration.push(label)
}
const checked = async request => {
  const { data, error } = await request
  if (error) throw new Error(`FISCAL_TEST_API:${error.code ?? error.status ?? 'UNKNOWN'}`)
  return data
}
const sqlLiteral = value => `'${String(value).replaceAll("'", "''")}'`
const clients = []
let server, browser
let releaseDelayedResponse = () => {}
let phase = 'prepare'
try {
  await environment.prepare()
  console.log(JSON.stringify({ project: environment.project, migrations: 151,
    api, postgres: ports.db, identity: 'verified-exclusive-new-volume' }))
  phase = 'sql-minimum-privilege-regression'
  const privilegeTest = path.join(root,
    'backend/supabase/tests/database/electronic_fiscal_minimum_privilege.test.sql')
  assert.ok(fs.statSync(privilegeTest).isFile())
  const tapOutput = environment.testDatabase(privilegeTest)
  const tapLines = tapOutput.split(/\r?\n/).map(line => line.trim())
  const tapPlan = tapLines.find(line => /^1\.\.\d+$/.test(line))
  const tapCount = tapPlan ? Number(tapPlan.slice(3))
    : Number(tapOutput.match(/\bTests\s*[=:]\s*(\d+)/i)?.[1] ?? 0)
  const tapFailed = tapLines.filter(line => /^not ok \d+(?:\s|$)/.test(line)).length
  check('pgTAP proves the six-table direct privilege contract',
    tapCount === 32 && tapFailed === 0 && !/\bResult:\s*FAIL\b/i.test(tapOutput))
  evidence.sqlAssertions = { planned: 32, passed: tapCount - tapFailed, failed: tapFailed,
    summary: tapLines.filter(line => /^(?:All tests|Files=|Result:|1\.\.\d+|not ok )/i.test(line)) }
  phase = 'fixtures'
  const helpers = fs.readFileSync(path.join(root, 'backend/scripts/fixtures/electronic_document_persistence.sql'), 'utf8')
    .split('-- SERIAL_TESTS_START:')[0]
  // Reuse only fixture constructors, not the serial tests, cleanup or races.
  // This sentinel is the historical helper contract, never an identity check.
  // The new physical identity is verified before EVERY SQL call by environment.
  const fixture = JSON.parse(environment.sql(`
    begin;
    set local silsan.sunat_phase2a_test='verified-silsanplexp2c2';
    ${helpers}
    create function pg_temp.read_fixture() returns jsonb language plpgsql as $$
    declare a jsonb:=pg_temp.cpe_tenant(); b jsonb:=pg_temp.cpe_tenant();
      sale uuid; operation_sale uuid; operation_payload jsonb; p jsonb; prepared jsonb; frozen jsonb; otherdoc jsonb;
    begin
      update public.organizations set name='SANDBOX organización A' where id=(a->>'org')::uuid;
      update public.organizations set name='SANDBOX organización B' where id=(b->>'org')::uuid;
      sale:=pg_temp.cpe_sale(a,'[{"quantity":"1.000","price":"118.0000","affectation":"gravado"}]');
      p:=pg_temp.cpe_prepare(a,sale);
      prepared:=pg_temp.cpe_ok('prepare_electronic_document',p,(a->>'actor')::uuid,(a->>'sid')::uuid);
      sale:=pg_temp.cpe_sale(a,'[{"quantity":"1.000","price":"118.0000","affectation":"gravado"}]');
      p:=pg_temp.cpe_prepare(a,sale)||jsonb_build_object('payment',jsonb_build_object(
        'kind','credito','outstanding','118.00','installments',jsonb_build_array(
          jsonb_build_object('id','Cuota001','amount','118.00','dueDate',current_date+30))));
      frozen:=pg_temp.cpe_ok('prepare_electronic_document',p,(a->>'actor')::uuid,(a->>'sid')::uuid);
      frozen:=pg_temp.cpe_ok('confirm_electronic_document',pg_temp.cpe_confirm(a,frozen),(a->>'actor')::uuid,(a->>'sid')::uuid);
      sale:=pg_temp.cpe_sale(b);
      otherdoc:=pg_temp.cpe_ok('prepare_electronic_document',pg_temp.cpe_prepare(b,sale),(b->>'actor')::uuid,(b->>'sid')::uuid);
      operation_sale:=pg_temp.cpe_sale(a);
      operation_payload:=pg_temp.cpe_prepare(a,operation_sale);
      return jsonb_build_object('a',a,'b',b,'prepared',prepared->>'documentId',
        'frozen',frozen->>'documentId','other',otherdoc->>'documentId',
        'operationSale',operation_sale,'operationPayload',operation_payload);
    end $$;
    select pg_temp.read_fixture();
    commit;
  `))
  const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  const admin = createClient(api, environment.status.SERVICE_ROLE_KEY, authOptions)
  const identities = {}
  const access = {
    viewer: ['BILLING_VIEW'],
    manager: ['BILLING_VIEW', 'BILLING_PREPARE', 'BILLING_ISSUE'],
    denied: [],
    other: ['BILLING_VIEW'],
  }
  for (const [name, org] of [['viewer', fixture.a.org], ['manager', fixture.a.org], ['denied', fixture.a.org], ['other', fixture.b.org]]) {
    const email = `${name}.${randomUUID()}@example.invalid`
    const password = randomBytes(32).toString('base64url')
    const { user } = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: `SANDBOX lector ${name}` } }))
    environment.sql(`begin;
      insert into public.organization_memberships(organization_id,user_id,is_active)
      values(${sqlLiteral(org)},${sqlLiteral(user.id)},true);
      ${access[name].map(permission => `insert into public.organization_user_permissions(organization_id,user_id,permission_code)
      values(${sqlLiteral(org)},${sqlLiteral(user.id)},${sqlLiteral(permission)});`).join('\n      ')}
      commit;`)
    const client = createClient(api, environment.status.ANON_KEY, authOptions)
    await checked(client.auth.signInWithPassword({ email, password }))
    clients.push(client)
    identities[name] = { email, password, id: user.id, org, client }
  }
  // Fixed-scale numeric strings must satisfy the actual first-block TS decoder.
  const { leerComprobanteSandbox } = await import(pathToFileURL(path.join(frontend,
    'src/modulos/facturacion/modelo/comprobanteSandbox.ts')).href)
  const fingerprint = () => JSON.parse(environment.sql(`select jsonb_object_agg(name,value) from (
    ${['electronic_issuer_profiles','electronic_document_series','electronic_documents',
      'electronic_document_items','electronic_document_commands','electronic_document_outbox',
      'sales','sale_items','orders','order_items','inventory_movements','inventory_reservations',
      'distribution_deliveries'].map(table => `select '${table}' name,
        (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t) value`).join(' union all ')}
    union all select 'fiscal_audits', (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]')
      from public.audit_events t where action like 'CPE_%')) x`))
  let before = fingerprint()
  evidence.persistence = {
    documents: before.electronic_documents.length, items: before.electronic_document_items.length,
    commands: before.electronic_document_commands.length, outbox: before.electronic_document_outbox.length,
    seriesNext: before.electronic_document_series.map(s => String(s.next_number)).sort(),
  }
  check('fixtures have exactly three documents and one blocked job', before.electronic_documents.length === 3
    && before.electronic_document_outbox.length === 1 && before.electronic_document_outbox[0].state === 'blocked')
  phase = 'postgrest'
  const fiscalTables = [
    'electronic_issuer_profiles', 'electronic_document_series', 'electronic_documents',
    'electronic_document_items', 'electronic_document_commands', 'electronic_document_outbox',
  ]
  const privileges = JSON.parse(environment.sql(`select jsonb_object_agg(name, value) from (
    ${fiscalTables.map(table => `select '${table}' name, jsonb_build_object(
      'effectiveTableSelect', has_table_privilege('authenticated', 'public.${table}', 'SELECT'),
      'effectiveColumnSelect', exists(select 1 from pg_attribute a where a.attrelid='public.${table}'::regclass
        and a.attnum>0 and not a.attisdropped and has_column_privilege('authenticated',a.attrelid,a.attnum,'SELECT')),
      'effectiveAnonSelect', has_table_privilege('anon', 'public.${table}', 'SELECT'),
      'effectiveAnonColumnSelect', exists(select 1 from pg_attribute a where a.attrelid='public.${table}'::regclass
        and a.attnum>0 and not a.attisdropped and has_column_privilege('anon',a.attrelid,a.attnum,'SELECT')),
      'clientAclSelect', exists(select 1 from pg_class c cross join lateral aclexplode(
        coalesce(c.relacl,acldefault('r',c.relowner))) acl where c.oid='public.${table}'::regclass
        and acl.privilege_type='SELECT' and acl.grantee in (0,'anon'::regrole::oid,'authenticated'::regrole::oid)),
      'rls', (select relrowsecurity from pg_class where oid='public.${table}'::regclass),
      'readPolicy', exists(select 1 from pg_policy p where p.polrelid='public.${table}'::regclass
        and p.polname='fiscal_read' and p.polqual is not null
        and pg_get_expr(p.polqual,p.polrelid) like '%can_view_electronic_documents%')) value`).join(' union all ')}
  ) fiscal_privileges`))
  evidence.effectivePrivileges = privileges
  check('PostgreSQL denies effective table and column SELECT for authenticated on all six tables',
    Object.keys(privileges).length === fiscalTables.length && fiscalTables.every(table =>
      privileges[table]?.effectiveTableSelect === false
      && privileges[table]?.effectiveColumnSelect === false
      && privileges[table]?.effectiveAnonSelect === false
      && privileges[table]?.effectiveAnonColumnSelect === false
      && privileges[table]?.clientAclSelect === false))
  check('all six fiscal RLS policies remain enabled', fiscalTables.every(table =>
    privileges[table]?.rls === true && privileges[table]?.readPolicy === true))
  const rpcPrivileges = JSON.parse(environment.sql(`select jsonb_object_agg(signature, jsonb_build_object(
    'authenticated', has_function_privilege('authenticated', signature, 'EXECUTE'),
    'anon', has_function_privilege('anon', signature, 'EXECUTE')))
    from unnest(array[
      'public.save_electronic_issuer_profile(jsonb)', 'public.configure_electronic_series(jsonb)',
      'public.prepare_electronic_document(jsonb)', 'public.revise_electronic_document(jsonb)',
      'public.confirm_electronic_document(jsonb)', 'public.get_electronic_document(uuid,uuid)',
      'public.can_view_electronic_documents(uuid)']) signature`))
  evidence.rpcPrivileges = rpcPrivileges
  check('authorized fiscal RPC EXECUTE remains available only to authenticated',
    Object.keys(rpcPrivileges).length === 7 && Object.values(rpcPrivileges).every(value =>
      value.authenticated === true && value.anon === false))
  const rpc = (who, org, doc) => identities[who].client.rpc('get_electronic_document', { organization_id: org, document_id: doc })
  for (const [state, id] of [['prepared', fixture.prepared], ['frozen', fixture.frozen]]) {
    const data = await checked(rpc('viewer', fixture.a.org, id))
    const decoded = leerComprobanteSandbox(data, fixture.a.org, id)
    check(`JWT ordinary viewer reads ${state} and TS decoder accepts real DTO`, decoded.state === state)
    check(`${state} exact total/base/tax/quantity strings`, decoded.snapshot.totals.total === '118.00'
      && decoded.snapshot.totals.taxableBase === '100.00' && decoded.snapshot.totals.tax === '18.00'
      && decoded.snapshot.items[0].quantity === '1.000')
    check(`${state} fiscal identity`, state === 'prepared' ? decoded.fiscalIdentity === null
      : decoded.fiscalIdentity.number === '1' && decoded.snapshot.number === '1'
        && decoded.snapshot.taxValidity === 'NONE_SANDBOX' && decoded.snapshot.payment.outstanding === '118.00')
  }
  for (const [label, who, org, doc, code, message] of [
    ['no BILLING_VIEW', 'denied', fixture.a.org, fixture.prepared, '42501'],
    ['foreign organization argument', 'other', fixture.a.org, fixture.prepared, '42501'],
    ['foreign document within own org', 'other', fixture.b.org, fixture.prepared, 'P0001', 'CPE_DOCUMENT_NOT_FOUND'],
    ['nonexistent document', 'viewer', fixture.a.org, randomUUID(), 'P0001', 'CPE_DOCUMENT_NOT_FOUND'],
  ]) {
    const { data, error, status } = await rpc(who, org, doc)
    check(label, data === null && error?.code === code && (!message || error.message === message))
    evidence.responses.push({ label, status, code: error.code })
  }
  for (const [label, authorization] of [['absent session', environment.status.ANON_KEY], ['invalid JWT', 'invalid.test.token']]) {
    const response = await fetch(`${api}/rest/v1/rpc/get_electronic_document`, { method: 'POST',
      headers: { apikey: environment.status.ANON_KEY, Authorization: `Bearer ${authorization}`, 'content-type': 'application/json' },
      body: JSON.stringify({ organization_id: fixture.a.org, document_id: fixture.prepared }) })
    const body = await response.json()
    check(label, [401, 403].includes(response.status) && ['42501', 'PGRST301', 'PGRST303'].includes(body.code))
    evidence.responses.push({ label, status: response.status, code: body.code })
  }
  for (const table of fiscalTables) {
    const { data, error, status } = await identities.viewer.client.from(table).select('*').limit(1)
    check(`BILLING_VIEW direct PostgREST SELECT denied for ${table}`,
      data === null && error?.code === '42501')
    evidence.responses.push({ table, directReadStatus: status, code: error?.code })
  }
  const deniedDirectRead = await identities.denied.client.from('electronic_documents').select('*').limit(1)
  check('PostgREST denies direct fiscal SELECT without BILLING_VIEW',
    deniedDirectRead.data === null && deniedDirectRead.error?.code === '42501')
  check('independent organization B reads its own DTO', leerComprobanteSandbox(
    await checked(rpc('other', fixture.b.org, fixture.other)), fixture.b.org, fixture.other).state === 'prepared')
  check('PostgREST reads conserve fiscal/commercial rows, numbers, jobs and audits', JSON.stringify(before) === JSON.stringify(fingerprint()))

  phase = 'authorized-mutating-rpc'
  const manager = identities.manager.client
  const preparedByRpc = await checked(manager.rpc('prepare_electronic_document', { payload: fixture.operationPayload }))
  check('JWT manager prepares a document through the real PostgREST RPC',
    preparedByRpc.state === 'prepared' && typeof preparedByRpc.documentId === 'string')
  const revisedByRpc = await checked(manager.rpc('revise_electronic_document', { payload: {
    organizationId: fixture.a.org,
    environment: 'sandbox',
    operationKey: randomUUID(),
    documentId: preparedByRpc.documentId,
    expectedVersion: preparedByRpc.version,
    request: fixture.operationPayload,
  } }))
  check('JWT manager revises a document through the real PostgREST RPC',
    revisedByRpc.state === 'prepared' && revisedByRpc.version !== preparedByRpc.version)
  const confirmCommand = {
    organizationId: fixture.a.org,
    environment: 'sandbox',
    operationKey: randomUUID(),
    documentId: revisedByRpc.documentId,
    expectedVersion: revisedByRpc.version,
  }
  const confirmedByRpc = await checked(manager.rpc('confirm_electronic_document', { payload: confirmCommand }))
  check('JWT manager confirms a document through the real PostgREST RPC',
    confirmedByRpc.state === 'frozen' && confirmedByRpc.fiscalIdentity?.number)
  const beforeReplay = fingerprint()
  const replayedConfirmation = await checked(manager.rpc('confirm_electronic_document', { payload: confirmCommand }))
  check('same confirmation operation key replays the original result',
    JSON.stringify(replayedConfirmation) === JSON.stringify(confirmedByRpc))
  check('confirmation replay creates no duplicate commands, audit, outbox or number',
    JSON.stringify(beforeReplay) === JSON.stringify(fingerprint()))
  const confirmedDto = leerComprobanteSandbox(
    await checked(rpc('viewer', fixture.a.org, confirmedByRpc.documentId)), fixture.a.org, confirmedByRpc.documentId)
  check('BILLING_VIEW can read the confirmed snapshot only through the projected RPC',
    confirmedDto.state === 'frozen' && confirmedDto.fiscalIdentity.number === confirmedByRpc.fiscalIdentity.number)
  const afterAuthorizedOperations = fingerprint()
  check('authorized prepare/revise/confirm persist one document, three commands and one outbox job',
    afterAuthorizedOperations.electronic_documents.length === before.electronic_documents.length + 1
      && afterAuthorizedOperations.electronic_document_items.length === before.electronic_document_items.length + 1
      && afterAuthorizedOperations.electronic_document_commands.length === before.electronic_document_commands.length + 3
      && afterAuthorizedOperations.electronic_document_outbox.length === before.electronic_document_outbox.length + 1)
  before = afterAuthorizedOperations

  phase = 'browser'
  // Use the real application entry/router/AuthProvider, not a fixture entrypoint.
  server = await createServer({ root: frontend, envDir: false,
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(api),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(environment.status.ANON_KEY) },
    server: { host: '127.0.0.1', port: ports.web, strictPort: true, hmr: false } })
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' })
  const web = `http://127.0.0.1:${ports.web}`
  const observed = []
  let failNextPermissionRpc = false
  let delayNextDocumentRpc = false
  let delayedResponseReady = Promise.resolve()
  let resolveDelayedResponseReady = () => {}
  let delayedResponseReleased = Promise.resolve()
  // Allow only the ephemeral web/API origins. Delayed RPCs are fetched from the real API.
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === web || url.origin === api) {
      if (url.origin === api) {
        observed.push({ path: url.pathname, method: request.method() })
        if (url.pathname === '/rest/v1/rpc/has_organization_permission' && failNextPermissionRpc) {
          failNextPermissionRpc = false
          await route.abort('failed')
          return
        }
        if (url.pathname === '/rest/v1/rpc/get_electronic_document' && delayNextDocumentRpc) {
          delayNextDocumentRpc = false
          const response = await route.fetch()
          resolveDelayedResponseReady()
          await delayedResponseReleased
          try { await route.fulfill({ response }) } catch {
            evidence.browser.push('late real RPC response discarded after authorization loss')
          }
          return
        }
      }
      await route.continue()
    } else {
      evidence.unexpectedRequests.push(url.origin)
      await route.abort()
    }
  })
  await context.routeWebSocket(/.*/, socket => {
    // Vite's client can open its own loopback websocket even with hmr:false.
    // Throwing from an event callback would bypass the runner's finally block.
    if (new URL(socket.url()).origin === web.replace('http:', 'ws:')) socket.connectToServer()
    else {
      evidence.unexpectedRequests.push(new URL(socket.url()).origin)
      socket.close()
    }
  })
  const page = await context.newPage()
  page.on('pageerror', () => evidence.pageErrors.push('browser-runtime-error'))
  const login = async who => {
    await page.goto(`${web}/iniciar-sesion`)
    await page.getByLabel('Correo', { exact: true }).fill(identities[who].email)
    await page.getByLabel('Contraseña', { exact: true }).fill(identities[who].password)
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible()
  }
  const logout = async () => {
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await expect(page.getByLabel('Correo', { exact: true })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toHaveCount(0)
    await expect(page.getByText('SANDBOX comprador ficticio', { exact: true })).toHaveCount(0)
  }
  const search = async id => {
    await page.getByRole('textbox', { name: 'UUID del comprobante' }).fill(id)
    await page.getByRole('textbox', { name: 'UUID del comprobante' }).press('Enter')
  }
  await login('viewer')
  await page.getByRole('link', { name: /Fiscal sandbox/ }).first().click()
  await expect(page).toHaveURL(`${web}/facturacion-sandbox`)
  await expect(page.getByRole('note')).toHaveText('Prueba local, sin envío y sin validez tributaria')
  const fiscalReadsBefore = observed.filter(r => r.path === '/rest/v1/rpc/get_electronic_document').length
  await search('UUID-invalido')
  await expect(page.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  assert.equal(observed.filter(r => r.path === '/rest/v1/rpc/get_electronic_document').length, fiscalReadsBefore)
  await search(fixture.prepared)
  await expect(page.getByText('Preparado · sin número', { exact: true })).toBeVisible()
  await expect(page.getByText('SANDBOX comprador ficticio', { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '118.0000', exact: true })).toBeVisible()
  evidence.browser.push('real login/menu/UUID/prepared/exact decimals/sandbox warning')

  assert.equal(await page.evaluate(() => document.hasFocus()), true)
  delayedResponseReady = new Promise(resolve => { resolveDelayedResponseReady = resolve })
  delayedResponseReleased = new Promise(resolve => { releaseDelayedResponse = resolve })
  delayNextDocumentRpc = true
  await search(fixture.prepared)
  await Promise.race([
    delayedResponseReady,
    new Promise((_, reject) => setTimeout(() => reject(new Error('FISCAL_TEST_DELAYED_RPC_NOT_CAPTURED')), 5_000)),
  ])
  const revocationStartedAt = Date.now()
  const permissionRevocation = await admin.from('organization_user_permissions')
    .delete().eq('organization_id', fixture.a.org).eq('user_id', identities.viewer.id)
    .eq('permission_code', 'BILLING_VIEW').select('user_id')
  if (permissionRevocation.error) throw new Error('FISCAL_TEST_PERMISSION_REVOCATION_FAILED')
  check('separate admin session revoked exactly the viewer BILLING_VIEW grant', permissionRevocation.data.length === 1)
  const documentReadsAtRevocation = observed.filter(r => r.path === '/rest/v1/rpc/get_electronic_document').length
  await expect(page.getByRole('heading', { name: 'Consulta fiscal bloqueada' })).toBeVisible({ timeout: 5_500 })
  const revocationPropagationMs = Date.now() - revocationStartedAt
  check('focused browser hides snapshot within the five-second authorization lease', revocationPropagationMs <= 5_000
    && await page.evaluate(() => document.hasFocus()))
  await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toHaveCount(0)
  releaseDelayedResponse()
  await page.waitForTimeout(250)
  await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toHaveCount(0)
  const deniedAfterRevocation = await rpc('viewer', fixture.a.org, fixture.prepared)
  check('PostgreSQL denies a new JWT read after remote permission revocation', deniedAfterRevocation.data === null
    && deniedAfterRevocation.error?.code === '42501')
  await page.waitForTimeout(3_100)
  assert.equal(observed.filter(r => r.path === '/rest/v1/rpc/get_electronic_document').length, documentReadsAtRevocation)
  await expect(page.getByRole('textbox', { name: 'UUID del comprobante' })).toHaveCount(0)
  evidence.browser.push(`remote revocation/late response/denied JWT read/no retry (${revocationPropagationMs}ms)`)

  const permissionRestoration = await admin.from('organization_user_permissions').insert({
    organization_id: fixture.a.org, user_id: identities.viewer.id, permission_code: 'BILLING_VIEW',
  }).select('user_id')
  if (permissionRestoration.error) throw new Error('FISCAL_TEST_PERMISSION_RESTORATION_FAILED')
  check('admin restored the original viewer grant without replacing its identity', permissionRestoration.data.length === 1)
  await expect.poll(() => observed.filter(r => r.path === '/rest/v1/rpc/get_electronic_document').length,
    { timeout: 6_000 }).toBeGreaterThan(documentReadsAtRevocation)
  check('restored authorization causes a fresh real document RPC',
    observed.filter(r => r.path === '/rest/v1/rpc/get_electronic_document').length > documentReadsAtRevocation)
  await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toBeVisible({ timeout: 6_000 })
  evidence.browser.push('legitimate grant restoration reverified and fetched a fresh snapshot')

  const permissionChecksBeforeNetworkFailure = observed.filter(r => r.path === '/rest/v1/rpc/has_organization_permission').length
  failNextPermissionRpc = true
  await expect.poll(() => observed.filter(r => r.path === '/rest/v1/rpc/has_organization_permission').length,
    { timeout: 5_000 }).toBeGreaterThan(permissionChecksBeforeNetworkFailure)
  await expect(page.getByRole('heading', { name: 'Consulta fiscal bloqueada' })).toBeVisible({ timeout: 1_000 })
  await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toBeVisible({ timeout: 6_000 })
  evidence.browser.push('permission network failure fails closed and a later real check recovers')

  await search(fixture.frozen)
  await expect(page.getByText('Congelado · confirmación interna', { exact: true })).toBeVisible()
  await expect(page.getByText('Crédito', { exact: true })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'Cuota001' })).toBeVisible()
  evidence.browser.push('real frozen identity/snapshot/credit')
  // Native keyboard actions, no forced clicks or DOM changes.
  await page.getByRole('textbox').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Consultar', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Limpiar consulta' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox')).toBeFocused()
  await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toHaveCount(0)
  await search(randomUUID())
  await expect(page.getByRole('heading', { name: 'Documento no disponible' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toHaveCount(0)
  evidence.browser.push('keyboard/clear/focus/real nonexistent RPC error')
  await page.setViewportSize({ width: 390, height: 844 })
  await search(fixture.frozen)
  await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toBeVisible()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  const region = page.getByRole('region', { name: 'Productos del comprobante' })
  await region.focus()
  await region.press('ArrowRight')
  await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  evidence.browser.push('mobile 390x844/table native keyboard scroll/no global overflow')
  await page.setViewportSize({ width: 1280, height: 720 })
  await logout()
  await login('other')
  await page.getByRole('link', { name: /Fiscal sandbox/ }).first().click()
  await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveValue('')
  await search(fixture.prepared)
  await expect(page.getByRole('heading', { name: 'Documento no disponible' })).toBeVisible()
  await search(fixture.other)
  await expect(page.getByText('Preparado · sin número', { exact: true })).toBeVisible()
  evidence.browser.push('real A logout/B login/no residual A/cross-tenant denied/B own document')
  await logout()
  await login('denied')
  await expect(page.getByRole('link', { name: /Fiscal sandbox/ })).toHaveCount(0)
  await page.goto(`${web}/facturacion-sandbox`)
  await expect(page).toHaveURL(`${web}/`)
  await expect(page.getByRole('textbox', { name: 'UUID del comprobante' })).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'Detalle fiscal sandbox' })).toHaveCount(0)
  evidence.browser.push('real no-permission login/menu hidden/direct URL guard')
  await logout()
  assert.equal(evidence.unexpectedRequests.length, 0)
  assert.equal(evidence.pageErrors.length, 0)
  assert.ok(observed.some(r => r.path === '/auth/v1/token'))
  assert.ok(observed.filter(r => r.path === '/rest/v1/rpc/get_electronic_document').length >= 6)
  evidence.realFiscalRpcRequests = observed.filter(r => r.path === '/rest/v1/rpc/get_electronic_document').length
  check('browser reads conserve fiscal/commercial rows, numbers, jobs and audits', JSON.stringify(before) === JSON.stringify(fingerprint()))
  await context.close()
  evidence.project = environment.project
  evidence.ports = ports
  evidence.migrations = 151
  evidence.documentIds = { prepared: fixture.prepared, frozen: fixture.frozen, other: fixture.other }
} catch (error) {
  // Never print raw Auth/CLI payloads, assertions containing credentials or JWTs.
  console.error(JSON.stringify({ phase, failed: true, type: error?.name,
    reason: String(error?.message ?? '').split('\n')[0].slice(0, 180),
    location: error?.stack?.split('\n').find(l => l.trim().startsWith('at ')
      && l.includes('test-fiscal-sandbox-integration'))?.trim() }))
  process.exitCode = 1
} finally {
  releaseDelayedResponse()
  const closeFailures = await closeFiscalTestResources({ clients, browser, server, environment })
  evidence.cleanup = closeFailures.includes('environment')
    ? 'FAIL: stopped before unverified cleanup; manual inspection required'
    : 'PASS: own containers, volumes and directory removed; previous resources preserved'
  evidence.closeFailures = closeFailures
  if (closeFailures.length) process.exitCode = 1
  console.log(JSON.stringify(evidence, null, 2))
}
