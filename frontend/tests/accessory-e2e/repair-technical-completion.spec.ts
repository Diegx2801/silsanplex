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
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Finalización técnica y entrega' })).toBeVisible()
}
async function change(page: Page, status: string) {
  await page.getByRole('button', { name: /^(Cambiar estado|Revisar siguiente estado)$/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Cambiar estado', exact: true })
  await dialog.getByLabel('Nuevo estado *', { exact: true }).selectOption(status)
  return dialog
}
async function finalize(page: Page) {
  const dialog = await change(page, 'ready_for_delivery')
  await dialog.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await expect(dialog).toBeHidden()
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
  const diagnosis = await checked(actor.api.rpc('record_repair_diagnosis', { payload: { organization_id: org, repair_id: id,
    expected_lock_version: r.lock_version, symptoms: 'Placa R13 dañada' } }))
  await state(actor, id, 'in_repair'); await state(actor, id, 'testing')
  if (passed) await recordTest(actor, id)
  await open(page, reference)
  return { ...actor, id, reference, diagnosis }
}
type Fixture = Awaited<ReturnType<typeof prepare>>
async function declare(a: Actor, f: Fixture) {
  const r = await row(a, f.id)
  await checked(a.api.rpc('declare_repair_non_repairable', { payload: { organization_id: a.identity.organizationId, repair_id: f.id,
    expected_lock_version: r.lock_version, operation_key: randomUUID(), diagnosis_id: f.diagnosis, reason: 'Daño irreversible R13' } }))
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
  await page.getByRole('button', { name: 'Recuperar cambio de estado pendiente', exact: true }).click()
  await expect(page.getByText('No hay un cambio de estado pendiente de confirmar en esta pestaña.')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Cambiar estado', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cerrar detalle de reparación', exact: true }).click()
  await expect(page.getByText(/^Técnica:/)).toBeVisible()
})

test('R13: fallo y aprobado no borran fallo; retrabajo, ciclo nuevo y primera finalización intacta', async ({ page }) => {
  const f = await prepare(page, false)
  await recordTest(f, f.id, false); await recordTest(f, f.id, true); await open(page, f.reference)
  let dialog = await change(page, 'ready_for_delivery')
  await dialog.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('prueba fallida')
  expect((await row(f, f.id)).technical_completion).toBeNull()
  await dialog.getByRole('button', { name: 'Cerrar cambio de estado', exact: true }).click()
  await state(f, f.id, 'in_repair'); await state(f, f.id, 'testing'); await recordTest(f, f.id); await open(page, f.reference)
  await finalize(page)
  const first = (await row(f, f.id)).technical_completion
  dialog = await change(page, 'in_repair')
  await dialog.getByRole('button', { name: 'Cambiar estado', exact: true }).click(); await expect(dialog).toBeHidden()
  await expect(page.getByText('Sin finalización vigente — requiere nueva validación técnica.')).toBeVisible()
  await state(f, f.id, 'testing'); await open(page, f.reference)
  dialog = await change(page, 'ready_for_delivery')
  await dialog.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('prueba aprobada')
  await dialog.getByRole('button', { name: 'Cerrar cambio de estado', exact: true }).click()
  await recordTest(f, f.id); await open(page, f.reference); await finalize(page)
  const current = await row(f, f.id)
  expect(current.first_technical_completion).toEqual(first)
  expect(current.technical_completion.event_id).not.toBe(first.event_id)
  expect(current.technical_completion.test_cycle_number).toBe(3)
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
  let dialog = await change(page, 'ready_for_delivery')
  await dialog.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  const committed = await row(f, f.id)
  await state(f, f.id, 'in_repair')
  await page.reload(); await open(page, f.reference)
  await page.getByRole('button', { name: 'Recuperar cambio de estado pendiente', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Cambiar estado', exact: true })
  await dialog.getByRole('button', { name: 'Reintentar cambio de estado', exact: true }).click(); await expect(dialog).toBeHidden()
  expect(payloads).toHaveLength(2); expect(payloads[1]).toEqual(payloads[0])
  const after = await row(f, f.id)
  expect(after.status).toBe('in_repair'); expect(after.technical_completion).toBeNull()
  expect(after.lock_version).toBe(committed.lock_version + 1)
  expect(await checked(f.api.from('repair_events').select('id::text').eq('repair_id', f.id).eq('to_status', 'ready_for_delivery'))).toHaveLength(1)
})

test('R13: dos pestañas rechazan finalización obsoleta sin duplicar evento', async ({ page, context }) => {
  const f = await prepare(page)
  const second = await context.newPage(); await open(second, f.reference)
  const a = await change(page, 'ready_for_delivery'), b = await change(second, 'ready_for_delivery')
  await a.getByRole('button', { name: 'Cambiar estado', exact: true }).click(); await expect(a).toBeHidden()
  await b.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await expect(b.getByRole('alert')).toContainText('cambió')
  expect(await checked(f.api.from('repair_events').select('id::text').eq('repair_id', f.id).eq('to_status', 'ready_for_delivery'))).toHaveLength(1)
  await second.close()
})

test('R13: No reparable y devolución sin reparar no finalizan ni activan garantía', async ({ page, browser }) => {
  const f = await prepare(page)
  const context = await browser.newContext()
  try {
    const techPage = await context.newPage(); const tech = await login(techPage, 'technician')
    await declare(tech, f); await open(page, f.reference)
    await expect(page.getByText('No aplica como reparación completada.', { exact: true })).toBeVisible()
    const declared = await row(f, f.id)
    await checked(f.api.rpc('return_unrepaired_repair', { payload: { organization_id: f.identity.organizationId, repair_id: f.id,
      expected_lock_version: declared.lock_version, operation_key: randomUUID(), decision_event_id: declared.non_repairable_decision_id, returns: [] } }))
    await page.reload(); await open(page, f.reference)
    const returned = await row(f, f.id)
    expect(returned.technical_completion).toBeNull(); expect(returned.first_technical_completion).toBeNull()
    expect(returned.returned_unrepaired_at).toBeTruthy(); expect(returned.delivered_at).toBeNull()
    expect(await checked(f.api.from('repair_service_warranty_details').select('id').eq('repair_id', f.id))).toHaveLength(0)
  } finally { await context.close() }
})

test('R13: reevaluación R28 requiere pruebas del ciclo nuevo antes de finalizar', async ({ page, browser }) => {
  const f = await prepare(page)
  const context = await browser.newContext()
  try {
    const techPage = await context.newPage(); const tech = await login(techPage, 'technician')
    await declare(tech, f)
    const declared = await row(f, f.id)
    await checked(tech.api.rpc('reopen_repair_non_repairable_assessment', { payload: { organization_id: f.identity.organizationId, repair_id: f.id,
      expected_lock_version: declared.lock_version, operation_key: randomUUID(), decision_event_id: declared.non_repairable_decision_id, reason: 'Nueva evaluación R13' } }))
    await state(f, f.id, 'in_repair'); await state(f, f.id, 'testing'); await open(page, f.reference)
    const dialog = await change(page, 'ready_for_delivery')
    await dialog.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('prueba aprobada')
    await dialog.getByRole('button', { name: 'Cerrar cambio de estado', exact: true }).click()
    await recordTest(f, f.id); await open(page, f.reference); await finalize(page)
    expect((await row(f, f.id)).technical_completion.test_cycle_number).toBe(2)
    await page.getByText(/Historial de la orden ·/).click()
    await expect(page.getByText('Decisión No reparable revocada para reevaluación', { exact: true })).toBeVisible()
  } finally { await context.close() }
})

test('R13: histórico verificable conserva finalización cinco días antes de la entrega real', async ({ page }) => {
  const a = await login(page)
  const reference = `R13-old-valid-${randomUUID().slice(0, 8)}`, id = randomUUID(), testId = randomUUID()
  const org = a.identity.organizationId, technician = identities.technician.id
  // Seed an imported pre-R13 history, with no completion metadata certificate.
  execFileSync('docker', ['exec', '-i', `supabase_db_${process.env.E2E_ACCESSORY_PROJECT}`, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], {
    input: `begin;
      insert into repairs(id,organization_id,requester_type,requesting_area,equipment_type,external_equipment_description,received_at,status,current_test_cycle_number,
        assigned_technician_id,problem_description,customer_name_snapshot,customer_document_snapshot,product_code_snapshot,product_description_snapshot,customer_reference)
        values('${id}','${org}','internal','Legacy R13','external','Legacy equipment',now()-interval '10 days','testing',1,
        '${technician}','Legacy problem','Legacy R13','INTERNO','EXTERNO','Legacy equipment','${reference}');
      insert into repair_tests(id,organization_id,repair_id,test_cycle_number,test_type,result,passed,performed_by,completed_at)
        values('${testId}','${org}','${id}',1,'Legacy test','Approved',true,'${technician}',now()-interval '5 days');
      insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata,created_at)
        values('${org}','${id}','STATUS_CHANGED','in_repair','testing','{"test_cycle_number":1}',now()-interval '5 days');
      insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata,created_at)
        values('${org}','${id}','TEST_COMPLETED','testing','testing','{"test_cycle_number":1,"passed":true,"test_id":"${testId}"}',now()-interval '5 days');
      insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,actor_user_id,created_at)
        values('${org}','${id}','STATUS_CHANGED','testing','ready_for_delivery','${a.identity.id}',now()-interval '5 days');
      select set_config('app.repairs_status_write','true',true);
      update repairs set status='ready_for_delivery' where id='${id}'; commit;`, encoding: 'utf8',
  })
  await open(page, reference)
  const ready = await row(a, id), evidence = ready.technical_completion
  expect(evidence).toBeTruthy(); expect(evidence.assigned_technician_id).toBeNull()
  await expect(page.getByRole('region', { name: 'Finalización técnica y entrega' }).getByText('No registrado', { exact: true })).toBeVisible()
  await page.getByText(/Historial de la orden ·/).click()
  await expect(page.getByText(/Finalización técnica verificable · ciclo 1/)).toBeVisible()
  await page.getByRole('button', { name: /^(Entregar|Registrar entrega)$/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Entregar reparación', exact: true })
  await dialog.getByRole('button', { name: 'Confirmar entrega', exact: true }).click(); await expect(dialog).toBeHidden()
  await page.reload(); await open(page, reference)
  const delivered = await row(a, id)
  expect(delivered.technical_completion).toEqual(evidence)
  expect(new Date(delivered.delivered_at).getTime() - new Date(evidence.completed_at).getTime()).toBeGreaterThanOrEqual(5 * 86_400_000)
  await expect(page.getByRole('region', { name: 'Finalización técnica y entrega' }).locator('time')).toHaveCount(2)
})

test('R13: historial visual solo certifica evidencia validada por SQL, conserva transiciones rechazadas', async ({ page }) => {
  const a = await login(page), org = a.identity.organizationId, technician = identities.technician.id
  for (const kind of ['gap', 'orphan', 'negative', 'missing', 'unknown']) {
    const id = randomUUID(), testId = randomUUID(), reference = `R13-${kind}-${randomUUID().slice(0,8)}`
    const metadata: Record<string, unknown> = ['gap', 'orphan'].includes(kind) ? {} : {
      technical_completion_version: kind === 'unknown' ? 2 : 1, assigned_technician_id: technician,
      assigned_technician_name: 'Imported technician', actor_name: 'Imported actor',
      ...(kind === 'missing' ? {} : { test_cycle_number: kind === 'negative' ? -1 : 1 }),
    }
    execFileSync('docker', ['exec', '-i', `supabase_db_${process.env.E2E_ACCESSORY_PROJECT}`, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], {
      input: `begin;
        insert into repairs(id,organization_id,requester_type,requesting_area,equipment_type,external_equipment_description,status,current_test_cycle_number,
          assigned_technician_id,problem_description,customer_name_snapshot,customer_document_snapshot,product_code_snapshot,product_description_snapshot,customer_reference)
          values('${id}','${org}','internal','Imported','external','Imported equipment','testing',1,'${technician}',
          'Imported problem','Imported','INTERNO','EXTERNO','Imported equipment','${reference}');
        ${kind === 'gap' ? `insert into repair_events(organization_id,repair_id,event_type,from_status,to_status) values('${org}','${id}','CREATED',null,'received');` : ''}
        insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata)
          values('${org}','${id}','STATUS_CHANGED','${kind === 'gap' ? 'diagnosis' : 'in_repair'}','testing','{"test_cycle_number":1}');
        insert into repair_tests(id,organization_id,repair_id,test_cycle_number,test_type,result,passed,performed_by)
          values('${testId}','${org}','${id}',1,'Imported test','Approved',true,'${technician}');
        ${kind === 'orphan' ? `insert into repair_tests(organization_id,repair_id,test_cycle_number,test_type,result,passed,performed_by)
          values('${org}','${id}',1,'Unlogged failed test','Failed',false,'${technician}');` : ''}
        insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata)
          values('${org}','${id}','TEST_COMPLETED','testing','testing','{"test_cycle_number":1,"passed":true,"test_id":"${testId}"}');
        insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,observation,metadata)
          values('${org}','${id}','STATUS_CHANGED','testing','ready_for_delivery','Transición histórica ${kind}','${JSON.stringify(metadata)}');
        select set_config('app.repairs_status_write','true',true);
        update repairs set status='ready_for_delivery' where id='${id}'; commit;`, encoding: 'utf8',
    })
    const r = await row(a,id)
    expect(r.technical_completion).toBeNull(); expect(r.first_technical_completion).toBeNull()
    expect(r.technical_completion_summary.verified_technical_completions).toEqual([])
    await open(page,reference)
    await page.getByText(/Historial de la orden ·/).click()
    await expect(page.getByText(`Transición histórica ${kind}`, { exact: true })).toBeVisible()
    await expect(page.getByText(/Finalización técnica verificable · ciclo/)).toHaveCount(0)
    await expect(page.getByText('Primera finalización histórica verificable: No registrada')).toBeVisible()
  }
})

test('R13: importados sin evidencia no inventan fecha ni responsable y no ofrecen recuperar sin permiso', async ({ page, browser }) => {
  const a = await login(page)
  const reference = `R13-legacy-${randomUUID().slice(0, 8)}`
  const org = a.identity.organizationId, id = randomUUID()
  // Only this verified disposable project is used for the historical import fixture.
  execFileSync('docker', ['exec', '-i', `supabase_db_${process.env.E2E_ACCESSORY_PROJECT}`, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], {
    input: `insert into repairs(id,organization_id,requester_type,requesting_area,equipment_type,external_equipment_description,received_at,status,delivered_at,
      problem_description,customer_name_snapshot,customer_document_snapshot,product_code_snapshot,product_description_snapshot,customer_reference)
      values('${id}','${org}','internal','Legacy R13','external','Legacy equipment',now()-interval '10 days','delivered',now(),
      'Legacy problem','Legacy R13','INTERNO','EXTERNO','Legacy equipment','${reference}');`, encoding: 'utf8',
  })
  await open(page, reference)
  await expect(page.getByRole('region', { name: 'Finalización técnica y entrega' }).getByText('No registrada', { exact: true })).toBeVisible()
  await page.getByText(/Historial de la orden ·/).click()
  await expect(page.getByText('Primera finalización histórica verificable: No registrada')).toBeVisible()
  const context = await browser.newContext()
  try {
    const ordinary = await context.newPage(); await login(ordinary, 'ordinary'); await open(ordinary, reference)
    await expect(ordinary.getByRole('button', { name: 'Recuperar cambio de estado pendiente', exact: true })).toHaveCount(0)
  } finally { await context.close() }
})
