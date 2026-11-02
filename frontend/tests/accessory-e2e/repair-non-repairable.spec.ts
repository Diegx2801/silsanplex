import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

type Identity = { id: string; email: string; password: string; organizationId: string }
const identities = JSON.parse(process.env.E2E_ACCESSORY_IDENTITIES || '{}') as Record<string, Identity>
const contexts: BrowserContext[] = []
test.setTimeout(150_000)
async function checked<T>(request: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}
async function login(page: Page, who: string) {
  await page.context().route('**/*', async route => {
    const url = new URL(route.request().url())
    expect(['http://127.0.0.1:59321', 'http://127.0.0.1:59325']).toContain(url.origin)
    await route.fallback()
  })
  const identity = identities[who]
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo', { exact: true }).fill(identity.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(identity.password)
  const authentication = page.waitForResponse('**/auth/v1/token?grant_type=password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  const session = await (await authentication).json()
  await page.waitForURL(/\/$/)
  return { identity, api: createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  }) }
}
type Actor = Awaited<ReturnType<typeof login>>
async function order(actor: Actor, reference: string) {
  return checked(actor.api.from('repairs').select('id,status,lock_version,assigned_technician_id,non_repairable_decision_event_id,returned_unrepaired_at,delivered_at,notes')
    .eq('organization_id', actor.identity.organizationId).eq('customer_reference', reference).single())
}
async function open(page: Page, reference: string) {
  await page.goto('/reparaciones')
  await page.getByLabel('Buscar reparación', { exact: true }).fill(reference)
  await expect(page.getByText('1 de 1 órdenes visibles')).toBeVisible()
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Resultado No reparable', exact: true })).toBeVisible()
}
async function prepare(page: Page, browser: Browser, withAccessories = false) {
  const admin = await login(page, 'admin')
  const reference = `B1-${randomUUID().slice(0, 8).toUpperCase()}`
  await page.goto('/reparaciones')
  await page.getByRole('button', { name: 'Registrar reparación', exact: true }).first().click()
  const form = page.getByRole('dialog', { name: 'Registrar reparación', exact: true })
  await form.getByLabel('Solicitante *', { exact: true }).selectOption('internal')
  await form.getByLabel('Área solicitante *', { exact: true }).fill('Laboratorio B1')
  await form.getByLabel('Identificación del equipo *', { exact: true }).selectOption('external')
  await form.getByLabel('Equipo recibido *', { exact: true }).fill('Monitor B1 no inventariable')
  await form.getByLabel('Problema reportado *', { exact: true }).fill('No enciende')
  await form.getByText('Datos adicionales de recepción', { exact: true }).click()
  await form.getByLabel('Referencia del cliente', { exact: true }).fill(reference)
  if (withAccessories) {
    await form.getByRole('button', { name: 'Agregar accesorio', exact: true }).click()
    await form.getByLabel('Accesorio 1 · Nombre *', { exact: true }).fill('Cable B1')
    await form.getByLabel('Accesorio 1 · Cantidad *', { exact: true }).fill('2')
  }
  await form.getByRole('button', { name: 'Registrar reparación', exact: true }).click()
  await expect(form).toBeHidden()
  let r = await order(admin, reference)
  await checked(admin.api.rpc('assign_repair', { requested_organization_id: admin.identity.organizationId,
    requested_repair_id: r.id, requested_technician_id: identities.technician.id, requested_expected_lock_version: r.lock_version }))
  r = await order(admin, reference)
  await checked(admin.api.rpc('change_repair_status', { requested_organization_id: admin.identity.organizationId,
    requested_repair_id: r.id, requested_status: 'diagnosis', requested_observation: null, requested_expected_lock_version: r.lock_version }))
  const context = await browser.newContext(); contexts.push(context)
  const technicalPage = await context.newPage()
  const tech = await login(technicalPage, 'technician')
  await open(technicalPage, reference)
  await technicalPage.getByRole('button', { name: 'Registrar diagnóstico', exact: true }).click()
  const diagnosisForm = technicalPage.getByRole('dialog', { name: 'Registrar diagnóstico', exact: true })
  await diagnosisForm.getByLabel('Síntomas observados *', { exact: true }).fill('Placa destruida B1')
  await diagnosisForm.getByLabel('Causa encontrada', { exact: true }).fill('Daño irreversible')
  await diagnosisForm.getByRole('button', { name: 'Guardar diagnóstico', exact: true }).click()
  await expect(diagnosisForm).toBeHidden()
  const diagnosis = await checked(tech.api.from('repair_diagnostics').select('id').eq('repair_id', r.id).single())
  return { admin, tech, technicalPage, reference, id: r.id, diagnosisId: diagnosis.id }
}
type Fixture = Awaited<ReturnType<typeof prepare>>
async function declare(f: Fixture) {
  await f.technicalPage.getByRole('button', { name: 'Declarar No reparable', exact: true }).click()
  const dialog = f.technicalPage.getByRole('dialog', { name: 'Confirmar No reparable', exact: true })
  await dialog.getByLabel('Motivo técnico *', { exact: true }).fill('Circuito principal destruido sin reparación posible')
  await dialog.getByRole('button', { name: 'Confirmar decisión No reparable', exact: true }).click()
  return dialog
}
async function returnDialog(page: Page, f: Fixture) {
  await open(page, f.reference)
  await page.getByRole('button', { name: 'Devolver sin reparar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Devolver sin reparar', exact: true })
  await expect(dialog.getByText('Consultando accesorios antes de devolver sin reparar…')).toBeHidden()
  return dialog
}
async function noPendingRecovery(page: Page) {
  await page.getByRole('button', { name: 'Recuperar decisión pendiente', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Decisión técnica No reparable', exact: true }).getByRole('alert')).toContainText('No hay una decisión pendiente')
  await expect(page.getByRole('dialog', { name: 'Confirmar No reparable', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Reabrir evaluación técnica', exact: true })).toHaveCount(0)
}
async function loseResponse(page: Page, rpc: string) {
  const payloads: unknown[] = []
  await page.route(`**/rest/v1/rpc/${rpc}`, async route => {
    payloads.push(route.request().postDataJSON())
    const response = await route.fetch(); expect(response.ok()).toBeTruthy()
    if (payloads.length === 1) await route.fulfill({ status: 504, contentType: 'application/json', body: '{"message":"Response lost after commit"}' })
    else await route.fulfill({ response })
  })
  return payloads
}
test.beforeEach(() => {
  const project = process.env.E2E_ACCESSORY_PROJECT
  expect(project).toMatch(/^silsanacc[0-9a-f]{10}$/)
  const [container] = JSON.parse(execFileSync('docker', ['inspect', `supabase_db_${project}`], { encoding: 'utf8' }))
  expect(container.Config.Labels['com.supabase.cli.project']).toBe(project)
  expect(container.Config.Labels['com.supabase.cli.workdir']).toContain('silsan-accessories-')
  expect(process.env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:59321')
})
test.afterEach(async () => { for (const context of contexts.splice(0)) await context.close() })

test('B1: recepción, técnico, decisión y devolución con accesorios, historial y filtros', async ({ page, browser }) => {
  const f = await prepare(page, browser, true)
  await expect(await declare(f)).toBeHidden()
  const declared = await order(f.admin, f.reference)
  await noPendingRecovery(f.technicalPage)
  expect((await order(f.admin, f.reference)).lock_version).toBe(declared.lock_version)
  await expect(f.technicalPage.getByRole('button', { name: 'Devolver sin reparar', exact: true })).toHaveCount(0)
  await open(page, f.reference)
  await expect(page.getByRole('button', { name: 'Reabrir evaluación técnica', exact: true })).toHaveCount(0)
  let dialog = await returnDialog(page, f)
  await dialog.getByRole('button', { name: 'Confirmar devolución sin reparar', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('accesorios pendientes')
  expect((await order(f.admin, f.reference)).status).toBe('non_repairable')
  await dialog.getByLabel('Devolver ahora · Cable B1', { exact: true }).fill('1')
  await dialog.getByRole('button', { name: 'Confirmar devolución sin reparar', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('accesorios pendientes')
  const rolledBack = await checked(f.admin.api.rpc('get_repair_accessories', { requested_organization_id: f.admin.identity.organizationId, requested_repair_id: f.id }))
  expect(rolledBack.accessories[0].quantity_returned).toBe(0)
  expect((await order(f.admin, f.reference)).lock_version).toBe(declared.lock_version)
  await dialog.getByRole('button', { name: 'Devolver todos los accesorios junto al equipo sin reparar', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirmar devolución sin reparar', exact: true }).click()
  await expect(dialog).toBeHidden()
  const r = await order(f.admin, f.reference)
  expect(r.status).toBe('returned_unrepaired'); expect(r.delivered_at).toBeNull(); expect(r.returned_unrepaired_at).toBeTruthy()
  await open(f.technicalPage, f.reference); await noPendingRecovery(f.technicalPage)
  expect((await order(f.admin, f.reference)).lock_version).toBe(r.lock_version)
  expect(await checked(f.admin.api.from('repair_tests').select('id').eq('repair_id', r.id))).toHaveLength(0)
  await page.reload(); await open(page, f.reference)
  await expect(page.getByRole('region', { name: 'Decisión técnica No reparable', exact: true }).getByText('Circuito principal destruido sin reparación posible', { exact: true })).toBeVisible()
  await page.getByText(/Historial de la orden ·/).click()
  await expect(page.getByText('Equipo devuelto sin reparar', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar detalle de reparación', exact: true }).click()
  await page.getByLabel('Estado', { exact: true }).selectOption('returned_unrepaired')
  await expect(page.getByText('1 de 1 órdenes visibles')).toBeVisible()
  const events = await checked(f.admin.api.from('repair_events').select('event_type,actor_user_id').eq('repair_id', r.id))
  expect(events.find(e => e.event_type === 'NON_REPAIRABLE_DECLARED')?.actor_user_id).toBe(identities.technician.id)
  expect(events.find(e => e.event_type === 'RETURNED_UNREPAIRED')?.actor_user_id).toBe(identities.admin.id)
  await page.screenshot({ path: test.info().outputPath('returned-unrepaired-filter.png'), fullPage: true })
})

test('B1: excepción autorizada y regularización posterior sin reapertura ni garantía', async ({ page, browser }) => {
  const f = await prepare(page, browser, true); await expect(await declare(f)).toBeHidden()
  const context = await browser.newContext(); contexts.push(context)
  const ordinaryPage = await context.newPage(); await login(ordinaryPage, 'ordinary')
  let dialog = await returnDialog(ordinaryPage, f)
  await expect(dialog.getByRole('button', { name: 'Autorizar devolución sin reparar con accesorios pendientes', exact: true })).toHaveCount(0)
  dialog = await returnDialog(page, f)
  await dialog.getByRole('button', { name: 'Autorizar devolución sin reparar con accesorios pendientes', exact: true }).click()
  await dialog.getByLabel('Motivo de excepción *', { exact: true }).fill('Recogerá el cable posteriormente')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Confirmar devolución excepcional sin reparar', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.reload(); await open(page, f.reference)
  const record = page.locator('details').filter({ has: page.getByText('Registro de Cable B1', { exact: true }) })
  await record.getByText('Registro de Cable B1', { exact: true }).click()
  await record.getByRole('button', { name: 'Registrar devolución de Cable B1', exact: true }).click()
  await page.getByRole('form', { name: 'Operación de accesorios' }).getByRole('button', { name: 'Confirmar devolución', exact: true }).click()
  await expect(page.getByRole('form', { name: 'Operación de accesorios' })).toBeHidden()
  const r = await order(f.admin, f.reference)
  expect(r.status).toBe('returned_unrepaired'); expect(r.delivered_at).toBeNull()
  expect(await checked(f.admin.api.from('repair_service_warranty_details').select('*').eq('repair_id', r.id))).toEqual([])
  const accessories = await checked(f.admin.api.rpc('get_repair_accessories', { requested_organization_id: f.admin.identity.organizationId, requested_repair_id: r.id }))
  expect(accessories.accessories[0].quantity_pending).toBe(0)
  await expect(page.getByRole('button', { name: 'Reabrir evaluación técnica', exact: true })).toHaveCount(0)
})

test('B1: proveedor confirma daño, técnico adopta y devolución espera el retorno real', async ({ page, browser }) => {
  const f = await prepare(page, browser)
  const supplier = await checked(f.admin.api.from('suppliers').insert({ organization_id: f.admin.identity.organizationId,
    created_by: f.admin.identity.id, updated_by: f.admin.identity.id,
    code: f.reference, document_type: 'otro', document_number: f.reference, business_name: `Proveedor ${f.reference}` }).select('id').single())
  let r = await order(f.admin, f.reference)
  const service = await checked(f.admin.api.rpc('send_repair_external_service', { payload: { organization_id: f.admin.identity.organizationId,
    repair_id: r.id, expected_lock_version: r.lock_version, operation_key: randomUUID(), supplier_id: supplier.id, description: 'Evaluar daño irreversible' } }))
  await open(f.technicalPage, f.reference); await expect(await declare(f)).toBeHidden()
  let dialog = await returnDialog(page, f)
  await dialog.getByRole('button', { name: 'Confirmar devolución sin reparar', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('proveedor')
  r = await order(f.admin, f.reference)
  await checked(f.admin.api.rpc('receive_repair_external_service', { payload: { organization_id: f.admin.identity.organizationId,
    repair_id: r.id, expected_lock_version: r.lock_version, operation_key: randomUUID(), external_service_id: service, cost_amount: 45, currency: 'PEN' } }))
  expect((await order(f.admin, f.reference)).status).toBe('non_repairable')
  dialog = await returnDialog(page, f)
  await dialog.getByRole('button', { name: 'Confirmar devolución sin reparar', exact: true }).click(); await expect(dialog).toBeHidden()
  expect((await checked(f.admin.api.from('repair_external_services').select('cost_amount').eq('id', service).single())).cost_amount).toBe(45)
})

test('B1: reservas requieren autoridad y los consumos históricos no reponen stock', async ({ page, browser }) => {
  const f = await prepare(page, browser)
  const org = f.admin.identity.organizationId
  const product = await checked(f.admin.api.from('products').insert({ organization_id: org, code: f.reference, description: 'Repuesto B1',
    created_by: f.admin.identity.id, updated_by: f.admin.identity.id,
    unit_of_measure: 'UND', cost: 5, sale_price: 10, batch_control: false, expiration_control: false }).select('id').single())
  const warehouse = await checked(f.admin.api.rpc('save_warehouse', { payload: { organization_id: org, operation_key: randomUUID(), code: f.reference, name: f.reference, address: 'Fixture aislado' } }))
  const location = await checked(f.admin.api.from('warehouse_locations').select('id').eq('warehouse_id', warehouse).eq('code', 'GENERAL').single())
  await checked(f.admin.api.rpc('record_inventory_movement', { payload: { organization_id: org, product_id: product.id,
    warehouse_id: warehouse, location_id: location.id, movement_type: 'entrada', quantity: 10, unit_cost: 5,
    stock_status: 'available', operation_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()), reason: 'Stock B1', document_reference: f.reference } }))
  let r = await order(f.admin, f.reference)
  await checked(f.admin.api.rpc('change_repair_status', { requested_organization_id: org, requested_repair_id: r.id, requested_status: 'in_repair', requested_observation: null, requested_expected_lock_version: r.lock_version }))
  r = await order(f.admin, f.reference)
  const part = await checked(f.admin.api.rpc('reserve_repair_part', { payload: { organization_id: org, repair_id: r.id, expected_lock_version: r.lock_version,
    operation_key: randomUUID(), product_id: product.id, warehouse_id: warehouse, location_id: location.id, stock_status: 'available', quantity_requested: 2 } }))
  await open(f.technicalPage, f.reference)
  await expect(f.technicalPage.getByRole('button', { name: 'Declarar No reparable', exact: true })).toBeDisabled()
  r = await order(f.admin, f.reference)
  const denied = await f.tech.api.rpc('declare_repair_non_repairable', { payload: { organization_id: org, repair_id: r.id, diagnosis_id: f.diagnosisId,
    operation_key: randomUUID(), expected_lock_version: r.lock_version, reason: 'Daño irreversible' } })
  expect(denied.error?.message).toBe('REPAIR_PENDING_PARTS')
  await checked(f.admin.api.rpc('consume_repair_part', { payload: { organization_id: org, repair_part_id: part, expected_lock_version: r.lock_version, operation_key: randomUUID(), quantity: 1 } }))
  r = await order(f.admin, f.reference)
  await checked(f.admin.api.rpc('cancel_repair_part', { requested_organization_id: org, requested_repair_part_id: part,
    requested_observation: 'Liberar solo saldo pendiente', requested_expected_lock_version: r.lock_version }))
  await open(f.technicalPage, f.reference); await expect(await declare(f)).toBeHidden()
  const dialog = await returnDialog(page, f)
  await dialog.getByRole('button', { name: 'Confirmar devolución sin reparar', exact: true }).click(); await expect(dialog).toBeHidden()
  const stock = await checked(f.admin.api.from('inventory_product_stock_summary').select('physical_quantity,reserved_quantity').eq('product_id', product.id).single())
  expect(Number(stock.physical_quantity)).toBe(9); expect(Number(stock.reserved_quantity)).toBe(0)
  expect(await checked(f.admin.api.from('repair_part_consumptions').select('id').eq('repair_part_id', part))).toHaveLength(1)
})

test('B1: reevaluación motivada conserva decisiones y diagnósticos anteriores', async ({ page, browser }) => {
  const f = await prepare(page, browser); await expect(await declare(f)).toBeHidden()
  const original = await checked(f.admin.api.from('repair_list').select('non_repairable_decision_id').eq('id', f.id).single())
  let r = await order(f.admin, f.reference)
  await checked(f.admin.api.rpc('assign_repair', { requested_organization_id: f.admin.identity.organizationId, requested_repair_id: f.id,
    requested_technician_id: identities.admin.id, requested_expected_lock_version: r.lock_version }))
  await open(page, f.reference)
  await page.getByRole('button', { name: 'Reabrir evaluación técnica', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Reabrir evaluación técnica', exact: true })
  await dialog.getByLabel('Motivo de reevaluación *', { exact: true }).fill('Solicitada segunda evaluación técnica')
  await dialog.getByRole('button', { name: 'Confirmar reevaluación', exact: true }).click(); await expect(dialog).toBeHidden()
  r = await order(f.admin, f.reference)
  expect(r.status).toBe('diagnosis'); expect(r.non_repairable_decision_event_id).toBeNull()
  expect(r.assigned_technician_id).toBe(identities.admin.id)
  await page.reload(); await open(page, f.reference)
  await page.getByText(/Historial de la orden ·/).click()
  await expect(page.getByText('Decisión No reparable revocada para reevaluación', { exact: true })).toBeVisible()
  const history = page.locator('[data-event-type="NON_REPAIRABLE_DECLARED"]')
  await expect(history).toHaveAttribute('data-event-id', original.non_repairable_decision_id)
  await expect(history).toContainText('Técnico que confirmó la decisión: Accessory E2E technician')
  await expect(history).toContainText(identities.technician.id)
  await expect(history).toContainText(`Diagnóstico utilizado: ${f.diagnosisId}`)
  await expect(history).toContainText('Síntomas históricos: Placa destruida B1')
  await expect(history).toContainText('Causa histórica: Daño irreversible')
  await expect(history).toContainText('Motivo de no reparabilidad: Circuito principal destruido sin reparación posible')
  const revoked = page.locator('[data-event-type="NON_REPAIRABLE_REOPENED"]')
  await expect(revoked).toContainText('Actor de la operación: Accessory E2E admin')
  await expect(revoked).toContainText('Técnico que confirmó la decisión: Accessory E2E technician')
  await expect(revoked).toContainText(`Decisión revocada: ${original.non_repairable_decision_id}`)
  await expect(revoked).toContainText('Motivo de reevaluación: Solicitada segunda evaluación técnica')
  await expect(revoked.getByRole('link', { name: 'Ver decisión original' })).toHaveAttribute('href', `#repair-event-${original.non_repairable_decision_id}`)
  await expect(history.locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}T/)
  expect(await checked(f.admin.api.from('repair_diagnostics').select('id').eq('repair_id', r.id))).toHaveLength(1)
  await page.screenshot({ path: test.info().outputPath('revoked-decision-historical-snapshot.png'), fullPage: true })
})

test('B1: recuperación de decisión y devolución confirmadas con respuesta perdida', async ({ page, browser }) => {
  const f = await prepare(page, browser)
  const declarations = await loseResponse(f.technicalPage, 'declare_repair_non_repairable')
  let decisionDialog = await declare(f)
  await expect(decisionDialog.getByRole('alert')).toBeVisible()
  const committed = await order(f.admin, f.reference)
  await checked(f.admin.api.rpc('assign_repair', { requested_organization_id: f.admin.identity.organizationId, requested_repair_id: f.id,
    requested_technician_id: identities.admin.id, requested_expected_lock_version: committed.lock_version }))
  await f.technicalPage.reload(); await open(f.technicalPage, f.reference)
  await f.technicalPage.getByRole('button', { name: 'Recuperar decisión pendiente', exact: true }).click()
  decisionDialog = f.technicalPage.getByRole('dialog', { name: 'Confirmar No reparable', exact: true })
  await decisionDialog.getByRole('button', { name: 'Reintentar decisión', exact: true }).click(); await expect(decisionDialog).toBeHidden()
  expect(declarations).toHaveLength(2); expect(declarations[1]).toEqual(declarations[0])
  expect((await order(f.admin, f.reference)).lock_version).toBe(committed.lock_version + 1)
  const returns = await loseResponse(page, 'return_unrepaired_repair')
  let dialog = await returnDialog(page, f)
  await dialog.getByRole('button', { name: 'Confirmar devolución sin reparar', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await page.reload(); await open(page, f.reference)
  await page.getByRole('button', { name: 'Recuperar devolución sin reparar pendiente', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Devolver sin reparar', exact: true })
  await dialog.getByRole('button', { name: 'Reintentar devolución sin reparar', exact: true }).click(); await expect(dialog).toBeHidden()
  expect(returns).toHaveLength(2); expect(returns[1]).toEqual(returns[0])
  const events = await checked(f.admin.api.from('repair_events').select('event_type').eq('repair_id', f.id))
  expect(events.filter(e => e.event_type === 'NON_REPAIRABLE_DECLARED')).toHaveLength(1)
  expect(events.filter(e => e.event_type === 'RETURNED_UNREPAIRED')).toHaveLength(1)
})

for (const state of ['delivered', 'cancelled', 'rejected'] as const) {
  test(`B1: recuperar sin pendiente en ${state} no abre declaraciones nuevas`, async ({ page, browser }) => {
    const f = await prepare(page, browser)
    const org = f.admin.identity.organizationId
    let r = await order(f.admin, f.reference)
    if (state === 'cancelled') {
      await checked(f.admin.api.rpc('cancel_repair', { requested_organization_id: org, requested_repair_id: f.id,
        requested_observation: 'Cancelación administrativa de prueba', requested_expected_lock_version: r.lock_version }))
    } else if (state === 'rejected') {
      const quote = await checked(f.admin.api.rpc('save_repair_quote', { payload: { organization_id: org, repair_id: f.id,
        expected_lock_version: r.lock_version, operation_key: randomUUID(), currency: 'PEN', exchange_rate_to_pen: 1,
        prices_include_tax: false, tax_rate: 0, submit: true, items: [{ line_type: 'labor', description: 'Evaluación', quantity: 1, unit_price: 10, taxable: false }] } }))
      r = await order(f.admin, f.reference)
      await checked(f.admin.api.rpc('reject_repair_quote', { requested_organization_id: org, requested_repair_id: f.id,
        requested_quote_id: quote, requested_observation: 'Cliente no acepta presupuesto', requested_expected_lock_version: r.lock_version }))
    } else {
      for (const status of ['in_repair', 'testing']) {
        r = await order(f.admin, f.reference)
        await checked(f.admin.api.rpc('change_repair_status', { requested_organization_id: org, requested_repair_id: f.id,
          requested_status: status, requested_observation: null, requested_expected_lock_version: r.lock_version }))
      }
      r = await order(f.admin, f.reference)
      await checked(f.admin.api.rpc('record_repair_test', { payload: { organization_id: org, repair_id: f.id,
        expected_lock_version: r.lock_version, test_type: 'Encendido', result: 'Prueba vigente aprobada', passed: true } }))
      r = await order(f.admin, f.reference)
      await checked(f.admin.api.rpc('change_repair_status', { requested_organization_id: org, requested_repair_id: f.id,
        requested_status: 'ready_for_delivery', requested_observation: null, requested_expected_lock_version: r.lock_version }))
      r = await order(f.admin, f.reference)
      await checked(f.admin.api.rpc('deliver_repair_with_accessories', { payload: { organization_id: org, repair_id: f.id,
        expected_lock_version: r.lock_version, operation_key: randomUUID(), returns: [] } }))
    }
    const before = await order(f.admin, f.reference)
    expect(before.status).toBe(state)
    await open(f.technicalPage, f.reference); await noPendingRecovery(f.technicalPage)
    expect((await order(f.admin, f.reference)).lock_version).toBe(before.lock_version)
    expect(await checked(f.admin.api.from('repair_events').select('id').eq('repair_id', f.id).eq('event_type', 'NON_REPAIRABLE_DECLARED'))).toHaveLength(0)
  })
}
