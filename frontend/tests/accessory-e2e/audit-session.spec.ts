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
async function rest(token: string, endpoint: string, body?: object, method = body ? 'POST' : 'GET', apiKey = key) {
  const response = await fetch(`${apiURL}/rest/v1/${endpoint}`, {
    method,
    headers: { apikey: apiKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(body ? { Prefer: 'return=representation' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let data: unknown = text
  try { data = text ? JSON.parse(text) : null } catch { /* retain a plain-text Storage/PostgREST error */ }
  return { status: response.status, data }
}
async function storageRequest(token: string, endpoint: string, method: string, body?: object | Uint8Array, contentType = 'application/json', apiKey = key) {
  const requestBody: BodyInit | undefined = body instanceof Uint8Array
    ? Uint8Array.from(body).buffer as ArrayBuffer
    : body ? JSON.stringify(body) : undefined
  const response = await fetch(`${apiURL}/storage/v1/${endpoint}`, {
    method,
    headers: { apikey: apiKey, Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: requestBody,
  })
  const text = await response.text()
  let data: unknown = text
  try { data = text ? JSON.parse(text) : null } catch { /* binary reads are validated by status and byte length */ }
  return { status: response.status, data, bytes: Buffer.byteLength(text) }
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
  const repairAttachmentId = randomUUID()
  const repairAttachmentPath = `${org}/${repair}/${repairAttachmentId}`
  const repairAttachmentBytes = new TextEncoder().encode('S01 repair attachment fixture')
  const repairAttachmentUpload = await storageRequest(actor.token,
    `object/repair-attachments/${repairAttachmentPath}`, 'POST', repairAttachmentBytes, 'image/png')
  expect(repairAttachmentUpload.status).toBe(200)
  const repairAttachment = await actor.client.from('repair_attachments').insert({
    id: repairAttachmentId, organization_id: org, repair_id: repair, storage_path: repairAttachmentPath,
    file_name: 's01-repair.png', mime_type: 'image/png', byte_size: repairAttachmentBytes.byteLength,
    created_by: actor.identity.id,
  }).select('id').single()
  if (repairAttachment.error) throw new Error(repairAttachment.error.message)
  const productCode = `S01-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`
  const productResult = await actor.client.from('products').insert({
    organization_id: org, code: productCode, description: 'S01 active-session fixture',
    unit_of_measure: 'UND', tax_affectation: 'gravado', batch_control: false,
    expiration_control: false, cost: 10, sale_price: 25,
    created_by: actor.identity.id, updated_by: actor.identity.id,
  }).select('id').single()
  if (productResult.error) throw new Error(productResult.error.message)
  const productId = productResult.data.id as string
  const image = new TextEncoder().encode('S01 disposable Storage object')
  const storagePath = `${org}/${productId}/s01-${randomUUID()}.png`
  const upload = await storageRequest(actor.token, `object/product-files/${storagePath}`, 'POST', image, 'image/png')
  expect(upload.status).toBe(200)
  const fileRecord = await actor.client.from('product_files').insert({
    organization_id: org, product_id: productId, kind: 'image', storage_path: storagePath,
    file_name: 's01-fixture.png', mime_type: 'image/png', byte_size: image.byteLength,
    created_by: actor.identity.id,
  }).select('id').single()
  if (fileRecord.error) throw new Error(fileRecord.error.message)
  const signedUrlResult = await actor.client.storage.from('product-files').createSignedUrl(storagePath, 60)
  if (signedUrlResult.error) throw new Error(signedUrlResult.error.message)
  const signedUrl = signedUrlResult.data.signedUrl
  const foreign = await login('foreign')
  const readSQL = () => JSON.parse(sql(`begin; set local role authenticated;
    select set_config('request.jwt.claims','${JSON.stringify(actor.claims).replaceAll("'", "''")}',true);
    select jsonb_build_object('active',current_auth_session_is_active(),
      'audits',(select count(*) from audit_events where organization_id='${org}' and entity_id='${repair}'),
      'repairs',(select count(*) from repair_list where organization_id='${org}' and id='${repair}'));
    rollback;`).split(/\r?\n/).at(-1)!)
  expect(readSQL()).toEqual({ active: true, audits: 2, repairs: 1 })
  expect(await rest(actor.token, `repair_attachments?select=id&id=eq.${repairAttachmentId}`)).toEqual({
    status: 200, data: [{ id: repairAttachmentId }],
  })
  const active = await rest(actor.token, audit(org, repair))
  expect(active.status).toBe(200)
  expect(active.data).toHaveLength(2)
  expect(await rest(actor.token, `products?select=id&id=eq.${productId}`)).toEqual({ status: 200, data: [{ id: productId }] })
  expect(await rest(foreign.token, `products?select=id&id=eq.${productId}`)).toEqual({ status: 200, data: [] })
  expect(await rest(actor.token, 'rpc/has_organization_permission', {
    requested_organization_id: org, requested_permission_code: 'PRODUCTS_MANAGE',
  })).toEqual({ status: 200, data: true })
  const update = await rest(actor.token, `products?id=eq.${productId}`, {
    description: 'S01 active write verified', updated_by: actor.identity.id,
  }, 'PATCH')
  expect(update.status).toBe(200)
  expect(update.data).toHaveLength(1)
  expect((await storageRequest(actor.token, `object/authenticated/product-files/${storagePath}`, 'GET')).status).toBe(200)
  const repairStorageRead = await storageRequest(actor.token,
    `object/authenticated/repair-attachments/${repairAttachmentPath}`, 'GET')
  expect(repairStorageRead.status).toBe(200)
  const storageList = await storageRequest(actor.token, 'object/list/product-files', 'POST', {
    prefix: `${org}/${productId}`, limit: 100, offset: 0,
  })
  expect(storageList.status).toBe(200)
  const activeDispatchProbe = await rest(actor.token, 'rpc/dispatch_order_from_reservations', {
    payload: { organization_id: org, order_id: randomUUID(), operation_key: randomUUID(), items: [] },
  })
  expect(activeDispatchProbe.status).toBe(400)
  expect(activeDispatchProbe.data).toMatchObject({ code: '22023', message: 'ORDER_DISPATCH_ITEMS_REQUIRED' })

  const signout = await actor.client.auth.signOut({ scope: 'local' })
  expect(signout.error).toBeNull()
  expect(sql(`select count(*) from auth.sessions where id='${actor.claims.session_id}' and user_id='${actor.identity.id}'`)).toBe('0')
  expect(actor.claims.exp).toBeGreaterThan(Date.now() / 1000)
  // Keep the original JWT, not the signed-out client's now-empty auth storage.
  // HTTP 200 + false/[] proves PostgREST accepted it and RLS enforced revocation.
  const session = await rest(actor.token, 'rpc/current_auth_session_is_active', {})
  expect(session).toEqual({ status: 200, data: false })
  expect(await rest(actor.token, 'rpc/current_user_permissions', {})).toEqual({ status: 200, data: [] })
  expect(await rest(actor.token, 'rpc/current_user_organization_ids_with_permission', {
    requested_permission_code: 'PRODUCTS_VIEW',
  })).toEqual({ status: 200, data: [] })
  expect(await rest(actor.token, 'rpc/has_organization_permission', {
    requested_organization_id: org, requested_permission_code: 'PRODUCTS_MANAGE',
  })).toEqual({ status: 200, data: false })
  expect(readSQL()).toEqual({ active: false, audits: 0, repairs: 0 })
  expect(await rest(actor.token, `repair_attachments?select=id&id=eq.${repairAttachmentId}`)).toEqual({ status: 200, data: [] })
  expect(await rest(actor.token, `products?select=id&id=eq.${productId}`)).toEqual({ status: 200, data: [] })
  expect(await rest(actor.token, `products?id=eq.${productId}`, {
    description: 'S01 revoked write must fail', updated_by: actor.identity.id,
  }, 'PATCH')).toEqual({ status: 200, data: [] })
  const deniedInsert = await rest(actor.token, 'products', {
    organization_id: org, code: `${productCode}-REVOKED`, description: 'must not persist',
    unit_of_measure: 'UND', tax_affectation: 'gravado', batch_control: false,
    expiration_control: false, cost: 10, sale_price: 25,
    created_by: actor.identity.id, updated_by: actor.identity.id,
  })
  expect(deniedInsert.status).toBe(403)
  expect(sql(`select count(*) from public.products where code='${productCode}-REVOKED'`)).toBe('0')
  expect(await rest(actor.token, `product_files?select=id&id=eq.${fileRecord.data.id}`)).toEqual({ status: 200, data: [] })
  const storageDeniedDownload = await storageRequest(actor.token, `object/authenticated/product-files/${storagePath}`, 'GET')
  const repairStorageDeniedDownload = await storageRequest(actor.token,
    `object/authenticated/repair-attachments/${repairAttachmentPath}`, 'GET')
  const storageDeniedList = await storageRequest(actor.token, 'object/list/product-files', 'POST', {
    prefix: `${org}/${productId}`, limit: 100, offset: 0,
  })
  const storageDeniedUpload = await storageRequest(actor.token,
    `object/product-files/${org}/${productId}/revoked-${randomUUID()}.png`, 'POST', image, 'image/png')
  const storageDelete = await storageRequest(actor.token, 'object/product-files', 'DELETE', { prefixes: [storagePath] })
  expect(storageDeniedDownload.status).toBeGreaterThanOrEqual(400)
  expect(storageDeniedList.status).toBe(200)
  expect(storageDeniedList.data).toEqual([])
  expect(repairStorageDeniedDownload.status).toBeGreaterThanOrEqual(400)
  expect(storageDeniedUpload.status).toBeGreaterThanOrEqual(400)
  expect(sql(`select count(*) from storage.objects where bucket_id='product-files' and name='${storagePath}'`)).toBe('1')
  expect(sql(`select count(*) from storage.objects where bucket_id='product-files' and name like '${org}/${productId}/revoked-%'`)).toBe('0')
  expect(sql(`select description from public.products where id='${productId}'`)).toBe('S01 active write verified')
  const serviceRoleKey = process.env.E2E_SERVICE_ROLE_KEY!
  expect(serviceRoleKey).toBeTruthy()
  const serviceRoleRead = await rest(serviceRoleKey, `products?select=id&id=eq.${productId}`, undefined, 'GET', serviceRoleKey)
  expect(serviceRoleRead).toEqual({ status: 200, data: [{ id: productId }] })
  const serviceRoleUpdate = await rest(serviceRoleKey, `products?id=eq.${productId}`, {
    description: 'S01 service_role write remains trusted', updated_by: actor.identity.id,
  }, 'PATCH', serviceRoleKey)
  expect(serviceRoleUpdate.status).toBe(200)
  expect(serviceRoleUpdate.data).toHaveLength(1)
  const serviceRoleStorageRead = await storageRequest(serviceRoleKey,
    `object/authenticated/product-files/${storagePath}`, 'GET', undefined, 'application/json', serviceRoleKey)
  expect(serviceRoleStorageRead.status).toBe(200)
  const deniedDispatch = await rest(actor.token, 'rpc/dispatch_order_from_reservations', {
    payload: { organization_id: org, order_id: randomUUID(), operation_key: randomUUID(), items: [] },
  })
  expect(deniedDispatch.status).toBe(403)
  expect(deniedDispatch.data).toMatchObject({ code: '42501', message: 'ORDER_DISPATCH_FORBIDDEN' })
  const deniedRepair = await rest(actor.token, 'rpc/create_repair', { payload: {
    organization_id: org, operation_key: randomUUID(), requester_type: 'internal',
    requesting_area: 'D01 test laboratory', equipment_type: 'external',
    external_equipment_description: 'D01 disposable equipment', problem_description: 'must be denied after revocation',
  } })
  expect(deniedRepair.status).toBeGreaterThanOrEqual(400)
  expect(sql(`begin; set local role service_role;
    select set_config('request.jwt.claims','{"role":"service_role"}',true);
    select public.user_has_organization_permission('${org}'::uuid,'${actor.identity.id}'::uuid,'PRODUCTS_MANAGE');
    rollback;`).split(/\r?\n/).at(-1)).toBe('t')
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
    const error = response.data as { code?: string; message?: string }
    expect(error.code).toBe('42501')
    expect(error.message).toBe('DISTRIBUTION_FORBIDDEN')
    rpcResults.push({ rpc: projection.name, status: response.status, code: error.code })
  }
  const fresh = await login('admin')
  try {
    const response = await rest(fresh.token, audit(org, repair))
    expect(response.status).toBe(200)
    expect(response.data).toHaveLength(2)
    expect(await rest(actor.token, audit(org, repair))).toEqual({ status: 200, data: [] })
  } finally { await fresh.client.auth.signOut({ scope: 'local' }) }
  const signedUrlRead = await fetch(signedUrl)
  expect(signedUrlRead.status).toBe(200)
  await foreign.client.auth.signOut({ scope: 'local' })
  await test.info().attach('d01-signed-jwt-sql-and-http.json', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
    tokenSha256: createHash('sha256').update(actor.token).digest('hex'), expiresAt: actor.claims.exp,
    revokedSessionId: actor.claims.session_id, activeStatus: active.status, session, retries, rpcResults,
    sqlAfter: readSQL(), freshSessionDoesNotReviveOldJWT: true,
    product: { id: productId, activeWrite: update.status, revokedInsert: deniedInsert.status, revokedReadRows: 0 },
    storage: { activeUpload: upload.status, activeRead: 200, revokedJwtRead: storageDeniedDownload.status,
      revokedJwtList: storageDeniedList.status, revokedJwtUpload: storageDeniedUpload.status,
      repairAttachmentActiveUpload: repairAttachmentUpload.status,
      repairAttachmentActiveRead: repairStorageRead.status,
      repairAttachmentRevokedRead: repairStorageDeniedDownload.status,
      revokedJwtDelete: storageDelete.status, signedUrlReadAfterRevocation: signedUrlRead.status },
    rpc: { activeDispatchProbe: activeDispatchProbe.status, revokedPermission: false,
      revokedDispatch: deniedDispatch.status, revokedRepair: deniedRepair.status },
    serviceRole: { read: serviceRoleRead.status, write: serviceRoleUpdate.status, storageRead: serviceRoleStorageRead.status },
    tenantIsolation: 'foreign JWT cannot read the test product', serviceRoleExplicitSubjectPermission: true,
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
