import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

type Identity = { id: string; email: string; password: string; organizationId: string }
const identities = JSON.parse(process.env.E2E_ACCESSORY_IDENTITIES || '{}') as Record<string, Identity>
test.setTimeout(150_000)
async function checked<T>(request: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}
async function login(page: Page, who = 'admin') {
  await page.context().route('**/*', async route => {
    expect(['http://127.0.0.1:59321', 'http://127.0.0.1:59325']).toContain(new URL(route.request().url()).origin)
    await route.fallback()
  })
  const identity = identities[who]
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo', { exact: true }).fill(identity.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(identity.password)
  const response = page.waitForResponse('**/auth/v1/token?grant_type=password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  const session = await (await response).json()
  await page.waitForURL(/\/$/)
  const api = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  })
  return { identity, api }
}
type Actor = Awaited<ReturnType<typeof login>>
async function row(a: Actor, id: string) {
  return checked(a.api.from('repair_list').select('*').eq('organization_id', a.identity.organizationId).eq('id', id).single())
}
async function state(a: Actor, id: string, status: string) {
  const r = await row(a, id)
  // Legacy PostgREST contract is exercised as well as the new UI RPC.
  await checked(a.api.rpc('change_repair_status', { requested_organization_id: a.identity.organizationId, requested_repair_id: id,
    requested_status: status, requested_observation: null, requested_expected_lock_version: r.lock_version }))
}
async function recordTest(a: Actor, id: string, passed = true) {
  const r = await row(a, id)
  await checked(a.api.rpc('record_repair_test', { payload: { organization_id: a.identity.organizationId, repair_id: id,
    expected_lock_version: r.lock_version, test_type: 'Encendido R13', result: passed ? 'Validada' : 'Falla R13', passed } }))
}
async function open(page: Page, reference: string) {
  await page.goto('/reparaciones')
  await page.getByLabel('Buscar reparación', { exact: true }).fill(reference)
  await expect(page.getByText('1 de 1 órdenes visibles')).toBeVisible()
  await page.getByRole('button', { name: /^(Ver detalle|Ver reparación)$/i }).click()
  await page.getByRole('tab', { name: 'Resumen', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Finalización técnica y entrega' })).toBeVisible()
}
async function advance(page: Page, action: string) {
  await page.getByRole('button', { name: action, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirmar avance', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}
async function finalize(page: Page) {
  const dialog = await advance(page, 'Preparar entrega')
  await dialog.getByRole('button', { name: 'Preparar entrega', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('tab', { name: 'Resumen', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Finalización técnica y entrega' }).locator('time')).toHaveCount(1)
}
async function prepare(page: Page, passed = true) {
  const actor = await login(page)
  const reference = `R13-${randomUUID().slice(0, 8)}`
  const org = actor.identity.organizationId
  const id = await checked(actor.api.rpc('create_repair', { payload: { organization_id: org, operation_key: randomUUID(),
    requester_type: 'internal', requesting_area: 'Laboratorio R13', equipment_type: 'external', external_equipment_description: 'Monitor R13',
    problem_description: 'No enciende', customer_reference: reference, accessories: [] } })) as string
  await checked(actor.api.rpc('assign_repair', { requested_organization_id: org, requested_repair_id: id,
    requested_technician_id: identities.technician.id, requested_expected_lock_version: 1 }))
  await state(actor, id, 'diagnosis')
  const r = await row(actor, id)
  await checked(actor.api.rpc('record_repair_diagnosis', { payload: { organization_id: org, repair_id: id,
    expected_lock_version: r.lock_version, symptoms: 'Placa R13 dañada' } }))
  await state(actor, id, 'in_repair'); await state(actor, id, 'testing')
  if (passed) await recordTest(actor, id)
  await open(page, reference)
  return { ...actor, id, reference }
}
test.beforeEach(() => {
  const project = process.env.E2E_ACCESSORY_PROJECT
  expect(project).toMatch(/^silsanacc[0-9a-f]{10}$/)
  const [container] = JSON.parse(execFileSync('docker', ['inspect', `supabase_db_${project}`], { encoding: 'utf8' }))
  expect(container.Config.Labels['com.supabase.cli.project']).toBe(project)
  expect(container.Config.Labels['com.supabase.cli.workdir']).toContain('silsan-accessories-')
  expect(process.env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:59321')
})

test('R13: finalización servidor, actores históricos, listado y garantía solo al entregar', async ({ page }) => {
  const f = await prepare(page)
  const section = page.getByRole('region', { name: 'Finalización técnica y entrega' })
  await expect(section.getByText('No registrada', { exact: true })).toBeVisible()
  await finalize(page)
  const completed = await row(f, f.id)
  expect(completed.technical_completion).toEqual(completed.first_technical_completion)
  expect(completed.technical_completion.actor_user_id).toBe(identities.admin.id)
  expect(completed.technical_completion.assigned_technician_id).toBe(identities.technician.id)
  await expect(section.getByText('Accessory E2E technician', { exact: true })).toBeVisible()
  await checked(f.api.rpc('configure_repair_service_warranty', { payload: { organization_id: f.identity.organizationId, repair_id: f.id,
    expected_lock_version: completed.lock_version, operation_key: randomUUID(), warranty_days: 30, coverage: 'Garantía R13' } }))
  expect((await checked(f.api.from('repair_service_warranty_details').select('starts_at').eq('repair_id', f.id).single())).starts_at).toBeNull()
  const ready = await row(f, f.id)
  await checked(f.api.rpc('assign_repair', { requested_organization_id: f.identity.organizationId, requested_repair_id: f.id,
    requested_technician_id: identities.admin.id, requested_expected_lock_version: ready.lock_version }))
  await open(page, f.reference)
  await expect(section.getByText('Accessory E2E technician', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^(Entregar|Registrar entrega)$/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Entregar reparación', exact: true })
  // The existing accessory dialog keeps its own delivery terminology.
  await dialog.getByRole('button', { name: 'Confirmar entrega', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.reload(); await open(page, f.reference)
  const delivered = await row(f, f.id)
  expect(delivered.technical_completion).toEqual(completed.technical_completion)
  await expect(section.locator('time')).toHaveCount(2)
  expect((await checked(f.api.from('repair_service_warranty_details').select('starts_at').eq('repair_id', f.id).single())).starts_at).toBe(delivered.delivered_at)
  await expect(page.getByRole('button', { name: 'Reintentar avance pendiente', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Confirmar avance', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cerrar detalle de reparación', exact: true }).click()
  const fechaFinalizacionVisible = new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(completed.technical_completion.completed_at))
  const valorFinalizacionTecnica = page.locator('.ledger-sheet article:visible dt')
    .filter({ hasText: /^Finalización técnica$/ })
    .locator('xpath=following-sibling::dd[1]')
  await expect(valorFinalizacionTecnica).toHaveText(fechaFinalizacionVisible)
})

test('R13: fallo y aprobado no borran fallo; retrabajo, ciclo nuevo y primera finalización intacta', async ({ page }) => {
  const f = await prepare(page, false)
  await recordTest(f, f.id, false); await recordTest(f, f.id, true); await open(page, f.reference)
  await expect(page.getByRole('button', { name: 'Volver a reparación', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preparar entrega', exact: true })).toHaveCount(0)
  const failedCycle = await row(f, f.id)
  expect(failedCycle.status).toBe('testing')
  expect(failedCycle.technical_completion).toBeNull()
  const rework = await advance(page, 'Volver a reparación')
  await rework.getByRole('button', { name: 'Volver a reparación', exact: true }).click(); await expect(rework).toBeHidden()
  await page.getByRole('tab', { name: 'Resumen', exact: true }).click()
  await state(f, f.id, 'testing'); await recordTest(f, f.id); await open(page, f.reference)
  await finalize(page)
  const first = (await row(f, f.id)).technical_completion
  const dialog = await advance(page, 'Reabrir reparación')
  await dialog.getByRole('button', { name: 'Reabrir reparación', exact: true }).click(); await expect(dialog).toBeHidden()
  await page.getByRole('tab', { name: 'Resumen', exact: true }).click()
  await expect(page.getByText('Sin finalización vigente — requiere nueva validación técnica.')).toBeVisible()
  await state(f, f.id, 'testing'); await open(page, f.reference)
  await expect(page.getByRole('button', { name: 'Registrar pruebas', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preparar entrega', exact: true })).toHaveCount(0)
  expect((await row(f, f.id)).technical_completion).toBeNull()
  await recordTest(f, f.id); await open(page, f.reference); await finalize(page)
  const current = await row(f, f.id)
  expect(current.first_technical_completion).toEqual(first)
  expect(current.technical_completion.event_id).not.toBe(first.event_id)
  expect(current.technical_completion.test_cycle_number).toBe(3)
  await page.getByRole('tab', { name: 'Entrega y trazabilidad', exact: true }).click()
  await page.getByText(/Historial de la orden ·/).click()
  await expect(page.getByText(/Primera finalización histórica verificable:/)).toContainText(first.event_id)
  await expect(page.getByText(/Finalización técnica verificable · ciclo/)).toHaveCount(2)
})
test('R13: respuesta perdida se recupera con payload original incluso después de retrabajo', async ({ page }) => {
  const f = await prepare(page)
  const payloads: unknown[] = []
  await page.route('**/rest/v1/rpc/change_repair_status_idempotent', async route => {
    payloads.push(route.request().postDataJSON())
    const response = await route.fetch(); expect(response.ok()).toBeTruthy()
    if (payloads.length === 1) await route.fulfill({ status: 504, contentType: 'application/json', body: '{"message":"Response lost after commit"}' })
    else await route.fulfill({ response })
  })
  let dialog = await advance(page, 'Preparar entrega')
  await dialog.getByRole('button', { name: 'Preparar entrega', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  const committed = await row(f, f.id)
  await state(f, f.id, 'in_repair')
  await page.reload(); await open(page, f.reference)
  await page.getByRole('button', { name: 'Reintentar avance pendiente', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Reintentar avance', exact: true })
  await dialog.getByRole('button', { name: 'Reintentar avance', exact: true }).click(); await expect(dialog).toBeHidden()
  expect(payloads).toHaveLength(2); expect(payloads[1]).toEqual(payloads[0])
  const after = await row(f, f.id)
  expect(after.status).toBe('in_repair'); expect(after.technical_completion).toBeNull()
  expect(after.lock_version).toBe(committed.lock_version + 1)
  expect(await checked(f.api.from('repair_events').select('id::text').eq('repair_id', f.id).eq('to_status', 'ready_for_delivery'))).toHaveLength(1)
})
