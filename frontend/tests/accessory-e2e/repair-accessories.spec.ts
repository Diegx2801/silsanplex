import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

type Identity = { email: string; password: string; id: string; organizationId: string }
type Accessory = { id: string; name: string; quantity_received: number; quantity_returned: number; quantity_pending: number }
type Fixture = { api: SupabaseClient; org: string; actor: string; reference: string }
const identities = JSON.parse(process.env.E2E_ACCESSORY_IDENTITIES || '{}') as Record<string, Identity>
test.setTimeout(90_000)
async function checked<T>(request: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const result = await request
  if (result.error) throw new Error(result.error.message)
  return result.data as NonNullable<T>
}
test.beforeEach(async ({ context }) => {
  const project = process.env.E2E_ACCESSORY_PROJECT
  expect(project).toMatch(/^silsanacc[0-9a-f]{10}$/)
  const [container] = JSON.parse(execFileSync('docker',['inspect',`supabase_db_${project}`],{encoding:'utf8'}))
  expect(container.Config.Labels['com.supabase.cli.project']).toBe(project)
  expect(container.Config.Labels['com.supabase.cli.workdir']).toContain('silsan-accessories-')
  expect(process.env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:59321')
  const forbidden: string[] = []
  await context.route('**/*',async route => {
    const url = new URL(route.request().url())
    if (['http://127.0.0.1:59321','http://127.0.0.1:59325'].includes(url.origin)) await route.fallback()
    else { forbidden.push(url.origin); await route.abort() }
  })
  context.on('close',() => expect(forbidden).toEqual([]))
})
async function login(page: Page, who = 'admin'): Promise<Fixture> {
  const identity = identities[who]
  expect(identity).toBeTruthy()
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo',{exact:true}).fill(identity.email)
  await page.getByLabel('Contraseña',{exact:true}).fill(identity.password)
  const token = page.waitForResponse('**/auth/v1/token?grant_type=password')
  await page.getByRole('button',{name:'Ingresar',exact:true}).click()
  const session = await (await token).json()
  expect(session.access_token).toBeTruthy()
  await page.waitForURL(/\/$/)
  const api = createClient(process.env.VITE_SUPABASE_URL!,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${session.access_token}`}},
  })
  return { api,org:identity.organizationId,actor:identity.id,reference:`ACC-${randomUUID().slice(0,8)}` }
}
async function order(f: Fixture) {
  return checked(f.api.from('repairs').select('id,status,lock_version,notes,delivered_at').eq('organization_id',f.org).eq('customer_reference',f.reference).single())
}
async function accessories(f: Fixture, id?: string): Promise<Accessory[]> {
  const repairId = id ?? (await order(f)).id
  const data = await checked(f.api.rpc('get_repair_accessories',{requested_organization_id:f.org,requested_repair_id:repairId}))
  return data.accessories as Accessory[]
}
async function open(page: Page, f: Fixture) {
  await page.goto('/reparaciones')
  await page.getByLabel('Buscar reparación').fill(f.reference)
  await expect(page.getByText('1 de 1 órdenes visibles')).toBeVisible()
  await page.getByRole('button',{name:'Ver detalle',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Accesorios recibidos y devolución'})).toBeVisible()
  await expect(page.getByText('Consultando accesorios…',{exact:true})).toBeHidden()
}
async function create(page: Page, f: Fixture, withAccessories = true) {
  await page.goto('/reparaciones')
  await page.getByRole('button',{name:'Registrar reparación',exact:true}).first().click()
  const dialog = page.getByRole('dialog',{name:'Registrar reparación',exact:true})
  await dialog.getByLabel('Solicitante *',{exact:true}).selectOption('internal')
  await dialog.getByLabel('Área solicitante *',{exact:true}).fill('Laboratorio de prueba')
  await dialog.getByLabel('Identificación del equipo *',{exact:true}).selectOption('external')
  await dialog.getByLabel('Equipo recibido *',{exact:true}).fill('Monitor de prueba aislado')
  await dialog.getByLabel('Problema reportado *',{exact:true}).fill('No enciende')
  await dialog.getByText('Datos adicionales de recepción',{exact:true}).click()
  await dialog.getByLabel('Referencia del cliente',{exact:true}).fill(f.reference)
  await dialog.getByLabel('Notas de recepción',{exact:true}).fill('Condición general del equipo intacta')
  if (withAccessories) {
    for (const [index,name] of ['Cable','Sensor','Estuche'].entries()) {
      const n=index+1
      await dialog.getByRole('button',{name:'Agregar accesorio',exact:true}).click()
      await dialog.getByLabel(`Accesorio ${n} · Nombre *`,{exact:true}).fill(name)
      await dialog.getByLabel(`Accesorio ${n} · Cantidad *`,{exact:true}).fill(name==='Sensor'?'2':'1')
      await dialog.getByLabel(`Accesorio ${n} · Condición`,{exact:true}).fill(name==='Sensor'?'Regular':'Bueno')
    }
  }
  await dialog.getByRole('button',{name:'Registrar reparación',exact:true}).click()
  await expect(dialog).toBeHidden()
  await open(page,f)
}
async function record(page: Page,name: string) {
  const details=page.locator('details').filter({has:page.getByText(`Registro de ${name}`,{exact:true})})
  if (await details.getAttribute('open')===null) await details.getByText(`Registro de ${name}`,{exact:true}).click()
  return details
}
async function giveBack(page: Page,name: string,quantity: number) {
  await (await record(page,name)).getByRole('button',{name:`Registrar devolución de ${name}`,exact:true}).click()
  const form=page.getByRole('form',{name:'Operación de accesorios'})
  await form.getByLabel('Cantidad a devolver *',{exact:true}).fill(String(quantity))
  await form.getByLabel('Observación de devolución',{exact:true}).fill('Devuelto al cliente de prueba')
  return form
}
async function ready(f: Fixture) {
  const initial=await order(f), id=initial.id
  const version=async()=> (await order(f)).lock_version
  await checked(f.api.rpc('assign_repair',{requested_organization_id:f.org,requested_repair_id:id,requested_technician_id:f.actor,requested_expected_lock_version:await version()}))
  for (const status of ['diagnosis','in_repair','testing']) await checked(f.api.rpc('change_repair_status',{
    requested_organization_id:f.org,requested_repair_id:id,requested_status:status,requested_observation:null,requested_expected_lock_version:await version(),
  }))
  await checked(f.api.rpc('record_repair_test',{payload:{organization_id:f.org,repair_id:id,expected_lock_version:await version(),test_type:'Encendido',result:'Estable',passed:true}}))
  await checked(f.api.rpc('change_repair_status',{requested_organization_id:f.org,requested_repair_id:id,requested_status:'ready_for_delivery',requested_observation:null,requested_expected_lock_version:await version()}))
}
async function delivery(page: Page,f: Fixture) {
  await open(page,f)
  await page.getByRole('button',{name:'Registrar entrega',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Entregar reparación',exact:true})
  await expect(dialog.getByText('Consultando accesorios antes de entregar…')).toBeHidden()
  return dialog
}
async function loseResponse(page: Page,rpc: string) {
  const payloads: unknown[]=[]
  await page.route(`**/rest/v1/rpc/${rpc}`,async route=>{
    payloads.push(route.request().postDataJSON())
    const response=await route.fetch(); expect(response.ok()).toBeTruthy()
    if(payloads.length===1) await route.fulfill({status:504,contentType:'application/json',body:JSON.stringify({message:'Lost response after commit'})})
    else await route.fulfill({response})
  })
  return payloads
}

test('R06: recepción múltiple, recarga y corrección persistente auditada',async({page})=>{
  const f=await login(page); await create(page,f)
  let rows=await accessories(f)
  expect(rows.map(a=>[a.name,a.quantity_received]).sort()).toEqual([['Cable',1],['Estuche',1],['Sensor',2]])
  const cable=rows.find(a=>a.name==='Cable')!
  expect((await order(f)).notes).toBe('Condición general del equipo intacta')
  await page.reload(); await open(page,f)
  await (await record(page,'Cable')).getByRole('button',{name:'Corregir Cable',exact:true}).click()
  const form=page.getByRole('form',{name:'Operación de accesorios'})
  await form.getByLabel('Nombre del accesorio *',{exact:true}).fill('Cable original')
  await form.getByLabel('Cantidad recibida *',{exact:true}).fill('3')
  await form.getByRole('button',{name:'Guardar accesorio',exact:true}).click()
  await expect(form).toBeHidden()
  rows=await accessories(f)
  expect(rows.find(a=>a.id===cable.id)).toMatchObject({name:'Cable original',quantity_received:3})
  const event=await checked(f.api.from('repair_events').select('actor_user_id,metadata').eq('repair_id',(await order(f)).id).eq('event_type','ACCESSORY_UPDATED').single())
  expect(event.actor_user_id).toBe(f.actor); expect(event.metadata.old_values.name).toBe('Cable'); expect(event.metadata.new_values.quantity_received).toBe(3)
  await page.screenshot({path:test.info().outputPath('reception-correction.png'),fullPage:true})
})
test('R06: sin accesorios conserva el flujo tradicional y entrega',async({page})=>{
  const f=await login(page); await create(page,f,false)
  expect(await accessories(f)).toEqual([])
  await ready(f)
  const dialog=await delivery(page,f)
  await dialog.getByRole('button',{name:'Confirmar entrega',exact:true}).click()
  await expect(dialog).toBeHidden(); expect((await order(f)).status).toBe('delivered')
})
test('R33: devolución parcial y completa persisten y bloquean correcciones posteriores',async({page})=>{
  const f=await login(page); await create(page,f)
  let form=await giveBack(page,'Sensor',1)
  await form.getByRole('button',{name:'Confirmar devolución',exact:true}).click(); await expect(form).toBeHidden()
  expect((await accessories(f)).find(a=>a.name==='Sensor')).toMatchObject({quantity_received:2,quantity_returned:1,quantity_pending:1})
  await page.reload(); await open(page,f)
  const sensor=await record(page,'Sensor')
  await expect(sensor.getByRole('button',{name:'Corregir Sensor'})).toHaveCount(0)
  form=await giveBack(page,'Sensor',1)
  await form.getByRole('button',{name:'Confirmar devolución',exact:true}).click(); await expect(form).toBeHidden()
  expect((await accessories(f)).find(a=>a.name==='Sensor')).toMatchObject({quantity_returned:2,quantity_pending:0})
})
test('R33: entrega bloqueada en UI y ambas RPC; devolución y entrega atómicas',async({page})=>{
  const f=await login(page); await create(page,f); await ready(f)
  const r=await order(f)
  const old=await f.api.rpc('deliver_repair',{requested_organization_id:f.org,requested_repair_id:r.id,requested_observation:null,requested_expected_lock_version:r.lock_version})
  expect(old.error?.message).toBe('REPAIR_ACCESSORIES_PENDING')
  const dialog=await delivery(page,f)
  await dialog.getByRole('button',{name:'Confirmar entrega',exact:true}).click()
  await expect(dialog.getByRole('alert')).toContainText('accesorios pendientes')
  expect((await order(f)).status).toBe('ready_for_delivery')
  await dialog.getByRole('button',{name:'Devolver todos los pendientes en esta entrega',exact:true}).click()
  await dialog.getByRole('button',{name:'Confirmar entrega',exact:true}).click(); await expect(dialog).toBeHidden()
  expect((await order(f)).status).toBe('delivered'); expect((await accessories(f)).every(a=>a.quantity_pending===0)).toBe(true)
  expect((await order(f)).lock_version).toBe(r.lock_version+1)
})
test('R33: excepción auditada, pendientes reales y regularización sin reabrir',async({page})=>{
  const f=await login(page); await create(page,f); await ready(f)
  const dialog=await delivery(page,f)
  await dialog.getByRole('button',{name:'Autorizar entrega con accesorios pendientes',exact:true}).click()
  await dialog.getByLabel('Motivo de excepción *',{exact:true}).fill('Cliente recogerá accesorios posteriormente')
  await dialog.getByRole('checkbox',{name:'Confirmo la entrega con los accesorios pendientes indicados'}).check()
  await dialog.getByRole('button',{name:'Confirmar entrega excepcional',exact:true}).click(); await expect(dialog).toBeHidden()
  const r=await order(f); expect(r.status).toBe('delivered')
  expect((await accessories(f)).reduce((n,a)=>n+a.quantity_pending,0)).toBe(4)
  const exception=await checked(f.api.from('repair_events').select('actor_user_id,observation,metadata').eq('repair_id',r.id).eq('event_type','ACCESSORY_DELIVERY_EXCEPTION').single())
  expect(exception.actor_user_id).toBe(f.actor); expect(exception.observation).toBe('Cliente recogerá accesorios posteriormente'); expect(exception.metadata.pending_accessories).toHaveLength(3)
  const audit=await checked(f.api.from('audit_events').select('actor_user_id,metadata').eq('entity_id',r.id).eq('action','REPAIR_ACCESSORY_DELIVERY_EXCEPTION').single())
  expect(audit.actor_user_id).toBe(f.actor); expect(audit.metadata.reason).toBe(exception.observation)
  for (const [name,quantity] of [['Cable',1],['Sensor',2],['Estuche',1]] as const) {
    const form=await giveBack(page,name,quantity); await form.getByRole('button',{name:'Confirmar devolución',exact:true}).click(); await expect(form).toBeHidden()
  }
  expect((await order(f)).status).toBe('delivered'); expect((await accessories(f)).every(a=>a.quantity_pending===0)).toBe(true)
  const delivered=await checked(f.api.from('repair_events').select('id').eq('repair_id',r.id).eq('event_type','DELIVERED'))
  expect(delivered).toHaveLength(1)
  await page.getByText(/Historial de la orden ·/).click()
  await expect(page.getByText('Entrega autorizada con accesorios pendientes',{exact:true})).toBeVisible()
  await expect(page.getByText('Cliente recogerá accesorios posteriormente',{exact:true})).toBeVisible()
  await page.screenshot({path:test.info().outputPath('exception-regularization-history.png'),fullPage:true})
})
test('R33: usuario con entrega ordinaria no puede autorizar excepción',async({page,browser})=>{
  const admin=await login(page); await create(page,admin); await ready(admin)
  const context=await browser.newContext(); const ordinaryPage=await context.newPage()
  try {
    const ordinary=await login(ordinaryPage,'ordinary'); ordinary.reference=admin.reference
    const dialog=await delivery(ordinaryPage,ordinary)
    await expect(dialog.getByRole('button',{name:'Autorizar entrega con accesorios pendientes',exact:true})).toHaveCount(0)
    const r=await order(ordinary)
    const denied=await ordinary.api.rpc('deliver_repair_with_accessories',{payload:{organization_id:ordinary.org,repair_id:r.id,expected_lock_version:r.lock_version,operation_key:randomUUID(),authorize_exception:true,exception_reason:'Attempt without special permission'}})
    expect(denied.error?.code).toBe('42501'); expect((await order(admin)).status).toBe('ready_for_delivery')
  } finally { await context.close() }
})
test('R06: notas históricas intactas y pertenencias no inferidas; aislamiento multiempresa',async({page,browser})=>{
  const f=await login(page)
  const id=await checked(f.api.rpc('create_repair',{payload:{organization_id:f.org,operation_key:randomUUID(),requester_type:'internal',requesting_area:'Área histórica',equipment_type:'external',external_equipment_description:'Equipo histórico',problem_description:'No enciende',customer_reference:f.reference,notes:'Accesorios históricos: cable y estuche'}}))
  await open(page,f); await expect(page.getByText(/Recepción histórica sin revisión estructurada/)).toBeVisible()
  expect(await accessories(f,id)).toEqual([]); expect((await order(f)).notes).toBe('Accesorios históricos: cable y estuche')
  const structured=await checked(f.api.rpc('create_repair',{payload:{organization_id:f.org,operation_key:randomUUID(),requester_type:'internal',requesting_area:'Área estructurada',equipment_type:'external',external_equipment_description:'Equipo con pertenencias',problem_description:'No enciende',accessories:[{name:'Cable privado',quantity_received:1}]}}))
  expect(await accessories(f,structured)).toHaveLength(1)
  const context=await browser.newContext(); const foreignPage=await context.newPage()
  try {
    const foreign=await login(foreignPage,'foreign')
    const result=await foreign.api.rpc('get_repair_accessories',{requested_organization_id:f.org,requested_repair_id:structured})
    expect(result.error?.code).toBe('42501')
    const table=await checked(foreign.api.from('repair_accessories').select('id').eq('repair_id',structured)); expect(table).toEqual([])
  } finally { await context.close() }
})
test('R33: dos sesiones rechazan devolución obsoleta sin pérdida silenciosa',async({page,browser})=>{
  const f=await login(page); await create(page,f)
  const first=await giveBack(page,'Sensor',1)
  const context=await browser.newContext(); const other=await context.newPage()
  try {
    const otherFixture=await login(other,'ordinary'); otherFixture.reference=f.reference
    await open(other,otherFixture)
    const second=await giveBack(other,'Sensor',1)
    await first.getByRole('button',{name:'Confirmar devolución',exact:true}).click(); await expect(first).toBeHidden()
    await second.getByRole('button',{name:'Confirmar devolución',exact:true}).click()
    await expect(other.getByRole('alert')).toContainText('cambió mientras')
    expect((await accessories(f)).find(a=>a.name==='Sensor')).toMatchObject({quantity_returned:1,quantity_pending:1})
  } finally { await context.close() }
})
test('R33: respuesta perdida de devolución se recupera tras recargar sin duplicados',async({page})=>{
  const f=await login(page); await create(page,f)
  const payloads=await loseResponse(page,'record_repair_accessory_return')
  const form=await giveBack(page,'Sensor',1)
  await form.getByRole('button',{name:'Confirmar devolución',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('No se pudo guardar')
  await page.reload(); await open(page,f)
  await page.getByRole('button',{name:'Recuperar operación de accesorios pendiente',exact:true}).click()
  await page.getByRole('button',{name:'Reintentar operación de accesorios',exact:true}).click()
  await expect(page.getByRole('form',{name:'Operación de accesorios'})).toBeHidden()
  expect(payloads).toHaveLength(2); expect(payloads[1]).toEqual(payloads[0])
  expect((await accessories(f)).find(a=>a.name==='Sensor')).toMatchObject({quantity_returned:1,quantity_pending:1})
})
test('R33: entrega excepcional confirmada con respuesta perdida se recupera estando entregada',async({page})=>{
  const f=await login(page); await create(page,f); await ready(f)
  const payloads=await loseResponse(page,'deliver_repair_with_accessories')
  const dialog=await delivery(page,f)
  await dialog.getByRole('button',{name:'Autorizar entrega con accesorios pendientes',exact:true}).click()
  await dialog.getByLabel('Motivo de excepción *',{exact:true}).fill('Acuerdo con cliente conservado')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button',{name:'Confirmar entrega excepcional',exact:true}).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await page.reload(); await open(page,f)
  await page.getByRole('button',{name:'Recuperar entrega pendiente',exact:true}).click()
  const recovered=page.getByRole('dialog',{name:'Entregar reparación',exact:true})
  await expect(recovered.getByLabel('Motivo de excepción *',{exact:true})).toHaveValue('Acuerdo con cliente conservado')
  await recovered.getByRole('button',{name:'Reintentar entrega',exact:true}).click(); await expect(recovered).toBeHidden()
  expect(payloads).toHaveLength(2); expect(payloads[1]).toEqual(payloads[0])
  const r=await order(f); expect(r.status).toBe('delivered')
  expect(await checked(f.api.from('repair_events').select('id').eq('repair_id',r.id).eq('event_type','DELIVERED'))).toHaveLength(1)
})
