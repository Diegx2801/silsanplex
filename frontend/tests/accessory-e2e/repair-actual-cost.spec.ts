import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

type Identity = { id: string; email: string; password: string; organizationId: string }
const identities=JSON.parse(process.env.E2E_ACCESSORY_IDENTITIES||'{}') as Record<string,Identity>
test.setTimeout(150_000)
async function checked<T>(request: PromiseLike<{data:T;error:{message:string}|null}>):Promise<NonNullable<T>> {
 const {data,error}=await request;if(error)throw new Error(error.message);return data as NonNullable<T>
}
async function login(page:Page,who='costs') {
 await page.context().route('**/*',async route=>{expect(['http://127.0.0.1:59321','http://127.0.0.1:59325']).toContain(new URL(route.request().url()).origin);await route.fallback()})
 const identity=identities[who];await page.goto('/iniciar-sesion');await page.getByLabel('Correo',{exact:true}).fill(identity.email)
 await page.getByLabel('Contraseña',{exact:true}).fill(identity.password)
 const response=page.waitForResponse('**/auth/v1/token?grant_type=password');await page.getByRole('button',{name:'Ingresar',exact:true}).click()
 const session=await(await response).json();await page.waitForURL(/\/$/)
 return {identity,api:createClient(process.env.VITE_SUPABASE_URL!,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${session.access_token}`}},
 })}
}
type Actor=Awaited<ReturnType<typeof login>>
async function row(a:Actor,id:string) {return checked(a.api.from('repair_list').select('*').eq('organization_id',a.identity.organizationId).eq('id',id).single())}
async function state(a:Actor,id:string,status:string) {const r=await row(a,id);await checked(a.api.rpc('change_repair_status',{
 requested_organization_id:a.identity.organizationId,requested_repair_id:id,requested_status:status,requested_observation:null,requested_expected_lock_version:r.lock_version}))}
async function open(page:Page,reference:string) {
 await page.goto('/reparaciones');await page.getByLabel('Buscar reparación',{exact:true}).fill(reference)
 await expect(page.getByText('1 de 1 órdenes visibles')).toBeVisible();await page.getByRole('button',{name:'Ver detalle',exact:true}).click()
 await page.getByText('Costo real de reparación',{exact:true}).click()
 await expect(page.getByRole('region',{name:'Consulta de costo real'}).getByText(/Costo (real confirmado|parcial registrado|no determinado)/).first()).toBeVisible()
}
async function prepare(page:Page) {
 const a=await login(page),org=a.identity.organizationId,reference=`R14-${randomUUID().slice(0,8)}`
 const id=await checked(a.api.rpc('create_repair',{payload:{organization_id:org,operation_key:randomUUID(),requester_type:'internal',requesting_area:'Laboratorio R14',
 equipment_type:'external',external_equipment_description:'Monitor R14',problem_description:'No enciende',customer_reference:reference,accessories:[]}})) as string
 await checked(a.api.rpc('assign_repair',{requested_organization_id:org,requested_repair_id:id,requested_technician_id:identities.technician.id,requested_expected_lock_version:1}))
 await state(a,id,'diagnosis');const r=await row(a,id)
 const diagnosis=await checked(a.api.rpc('record_repair_diagnosis',{payload:{organization_id:org,repair_id:id,expected_lock_version:r.lock_version,symptoms:'Placa R14 dañada'}}))
 await state(a,id,'in_repair');await open(page,reference)
 return {...a,id,reference,diagnosis}
}
type Fixture=Awaited<ReturnType<typeof prepare>>
async function detail(f:Fixture) {return checked(f.api.rpc('get_repair_actual_cost_detail',{requested_organization_id:f.identity.organizationId,requested_repair_id:f.id,requested_offset:0,requested_limit:50}))}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
async function evidence(form:ReturnType<Page['getByRole']>,ref=`DOC-${randomUUID().slice(0,8)}`) {
 await form.getByLabel('Evidencia o referencia de respaldo *',{exact:true}).fill(ref)
 await form.getByLabel('Motivo / justificación *',{exact:true}).fill('Trabajo y costo efectivamente documentados')
}
async function labor(page:Page,amount='12.50',currency='PEN',other=false) {
 await page.getByRole('button',{name:other?'Registrar otro gasto':'Registrar mano de obra real',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'})
 await form.getByLabel('Concepto real *',{exact:true}).fill(other?'Transporte documentado':'Diagnóstico y reparación reales')
 await form.getByLabel('Fecha de incurrencia declarada *',{exact:true}).fill(today())
 await form.getByLabel(/^Importe real/).fill(amount);await form.getByLabel('Moneda documentada *',{exact:true}).selectOption(currency)
 await evidence(form);await form.getByRole('button',{name:'Guardar costo o evidencia',exact:true}).click()
 await expect(form).toBeHidden();await expect(page.getByRole('region',{name:'Consulta de costo real'}).getByText('Costo parcial registrado',{exact:true})).toBeVisible()
}
async function confirm(page:Page) {
 await page.getByRole('button',{name:'Revisar y confirmar costo',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'});await evidence(form)
 await form.getByRole('checkbox',{name:/Revisé fuentes/}).check()
 await form.getByRole('button',{name:'Confirmar revisión económica',exact:true}).click();await expect(form).toBeHidden()
 await expect(page.getByRole('region',{name:'Consulta de costo real'}).getByText('Costo real confirmado',{exact:true})).toBeVisible()
}
async function external(f:Fixture,amount=30,currency='USD') {
 const org=f.identity.organizationId,suffix=randomUUID().slice(0,8).toUpperCase()
 const supplier=await checked(f.api.from('suppliers').insert({organization_id:org,code:`R14-${suffix}`,document_type:'otro',document_number:suffix,
 business_name:`Proveedor ${suffix}`,created_by:f.identity.id,updated_by:f.identity.id}).select('id').single())
 let r=await row(f,f.id)
 const service=await checked(f.api.rpc('send_repair_external_service',{payload:{organization_id:org,repair_id:f.id,expected_lock_version:r.lock_version,operation_key:randomUUID(),supplier_id:supplier.id,description:'Servicio externo real R14'}}))
 r=await row(f,f.id);await checked(f.api.rpc('receive_repair_external_service',{payload:{organization_id:org,repair_id:f.id,expected_lock_version:r.lock_version,
 operation_key:randomUUID(),external_service_id:service,cost_amount:amount,currency}}))
 return service
}
async function verifyExternal(page:Page,currency='USD') {
 const article=page.getByRole('article').filter({has:page.getByRole('heading',{name:/Servicios externos ·/})}).first()
 await article.getByRole('button',{name:'Verificar fuente económica',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'});await form.getByLabel('Moneda documentada *',{exact:true}).selectOption(currency)
 await form.getByLabel('Tratamiento económico *',{exact:true}).selectOption('not_applicable');await evidence(form)
 await form.getByRole('button',{name:'Guardar costo o evidencia',exact:true}).click();await expect(form).toBeHidden()
}
async function stock(f:Fixture,purchase=true) {
 const org=f.identity.organizationId,suffix=randomUUID().slice(0,8).toUpperCase()
 const product=await checked(f.api.from('products').insert({organization_id:org,code:`R14-${suffix}`,description:'Repuesto real R14',unit_of_measure:'UND',
 product_type:'good',tax_affectation:'gravado',batch_control:false,expiration_control:false,created_by:f.identity.id,updated_by:f.identity.id}).select('id').single())
 const warehouse=await checked(f.api.rpc('save_warehouse',{payload:{organization_id:org,operation_key:randomUUID(),code:`R14-${suffix}`,name:`R14 ${suffix}`,address:'Disposable R14'}}))
 const location=await checked(f.api.from('warehouse_locations').select('id').eq('organization_id',org).eq('warehouse_id',warehouse).eq('code','GENERAL').single())
 if(purchase) {
  const supplier=await checked(f.api.from('suppliers').insert({organization_id:org,code:`RP-${suffix}`,document_type:'otro',document_number:`RP-${suffix}`,business_name:`Compra ${suffix}`,created_by:f.identity.id,updated_by:f.identity.id}).select('id').single())
  const po=await checked(f.api.rpc('save_purchase_order',{payload:{organization_id:org,supplier_id:supplier.id,document_type:'factura',series:'R14',document_number:suffix,
   issue_date:today(),warehouse_id:warehouse,warehouse:`R14 ${suffix}`,currency:'PEN',prices_include_tax:false,items:[{product_id:product.id,quantity:10,unit_cost:5}]}}))
  await checked(f.api.rpc('issue_purchase_order',{requested_organization_id:org,requested_order_id:po}))
  const item=await checked(f.api.from('purchase_order_items').select('id').eq('organization_id',org).eq('purchase_order_id',po).single())
  await checked(f.api.rpc('receive_purchase_order_partial_inspected',{payload:{organization_id:org,purchase_order_id:po,operation_key:randomUUID(),items:[{purchase_order_item_id:item.id,quantity:10,location_id:location.id,fulfillment_mode:'physical'}]}}))
 } else await checked(f.api.rpc('record_inventory_movement',{payload:{organization_id:org,product_id:product.id,warehouse_id:warehouse,location_id:location.id,movement_type:'entrada',quantity:10,unit_cost:5,
  stock_status:'available',operation_date:today(),reason:'Stock manual sin moneda acreditada',document_reference:'R14 manual'}}))
 let r=await row(f,f.id)
 const part=await checked(f.api.rpc('reserve_repair_part',{payload:{organization_id:org,repair_id:f.id,expected_lock_version:r.lock_version,operation_key:randomUUID(),product_id:product.id,
 warehouse_id:warehouse,location_id:location.id,quantity_requested:1,stock_status:'available'}}))
 r=await row(f,f.id);await checked(f.api.rpc('consume_repair_part',{payload:{organization_id:org,repair_part_id:part,expected_lock_version:r.lock_version,operation_key:randomUUID(),quantity:1}}))
}
test.beforeEach(()=>{
 const project=process.env.E2E_ACCESSORY_PROJECT;expect(project).toMatch(/^silsanacc[0-9a-f]{10}$/)
 const [container]=JSON.parse(execFileSync('docker',['inspect',`supabase_db_${project}`],{encoding:'utf8'}))
 expect(container.Config.Labels['com.supabase.cli.project']).toBe(project);expect(container.Config.Labels['com.supabase.cli.workdir']).toContain('silsan-accessories-')
 expect(process.env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:59321')
})

test('R14: consumo real inicia pendiente y solo una procedencia de compra homogénea lo acredita',async({page})=>{
 const f=await prepare(page);await stock(f);await open(page,f.reference)
 const article=page.getByRole('article').filter({has:page.getByRole('heading',{name:/Repuestos consumidos ·/})}).first()
 await expect(article.getByText(/moneda no acreditada/)).toBeVisible()
 await article.getByRole('button',{name:'Verificar fuente económica',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'});await evidence(form)
 await form.getByRole('button',{name:'Guardar costo o evidencia',exact:true}).click();await expect(form).toBeHidden()
 await expect(article.getByText(/Fuente acreditada/)).toBeVisible();await confirm(page)
 expect((await detail(f)).summary.total.amount).toBe('5.0000000')
})
test('R14: moneda y nota no certifican stock manual sin procedencia monetaria',async({page})=>{
 const f=await prepare(page);await stock(f,false);await open(page,f.reference)
 await page.getByRole('button',{name:'Verificar fuente económica',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'});await evidence(form)
 await form.getByRole('button',{name:'Guardar costo o evidencia',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('No se acredita una valoración homogénea')
 expect((await detail(f)).summary.total).toBeNull()
})
test('R14: mano de obra exacta, sin salarios ni tiempos inferidos, persiste al recargar',async({page})=>{
 const f=await prepare(page);await labor(page,'9999999999999999.99');await page.reload();await open(page,f.reference)
 await expect(page.getByText(/Importe efectivo registrado: 9,999,999,999,999,999.99 PEN/)).toBeVisible()
 expect((await detail(f)).summary.subtotals[0].amount).toBe('9999999999999999.99')
})
test('R14: costo de proveedor requiere base documentada y conserva importe original',async({page})=>{
 const f=await prepare(page);await external(f);await open(page,f.reference)
 await expect(page.getByRole('list',{name:'Pendientes económicos'}).getByText(/falta verificar su base económica/)).toBeVisible();await verifyExternal(page)
 await confirm(page);expect((await detail(f)).summary.total.currency).toBe('USD')
 await expect(page.getByText(/Declarado originalmente al retorno: 30.00 USD/)).toBeVisible()
})
test('R14: PEN y USD confirmados por separado nunca se presentan como un solo total',async({page})=>{
 const f=await prepare(page);await labor(page,'1.25','PEN');await labor(page,'2.50','USD');await confirm(page)
 await expect(page.getByText('Hay PEN y USD: se muestran por separado, sin conversión automática.')).toBeVisible()
 const d=await detail(f);expect(d.summary.subtotals).toHaveLength(2);expect(d.summary.total).toBeNull()
})
test('R14: confirmación rechazada con fuentes pendientes no crea una revisión',async({page})=>{
 const f=await prepare(page);await external(f);await open(page,f.reference)
 await page.getByRole('button',{name:'Revisar y confirmar costo',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'});await evidence(form);await form.getByRole('checkbox',{name:/Revisé fuentes/}).check()
 await form.getByRole('button',{name:'Confirmar revisión económica',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('Hay fuentes pendientes')
 expect((await detail(f)).summary.latest_review).toBeNull()
})
test('R14: corrección y anulación son revisiones, no sumas ni borrados',async({page})=>{
 const f=await prepare(page);await labor(page,'10');await confirm(page)
 await page.getByRole('button',{name:'Revisar línea económica',exact:true}).click()
  let form=page.getByRole('form',{name:'Operación económica'});await form.getByLabel(/^Importe real/).fill('8.25');await evidence(form)
  await form.getByLabel('Tratamiento económico *',{exact:true}).selectOption('tax_inclusive')
 await form.getByRole('button',{name:'Guardar costo o evidencia',exact:true}).click();await expect(form).toBeHidden()
  expect((await detail(f)).summary.subtotals[0].amount).toBe('8.25');await confirm(page)
  await expect(page.getByText('Base anterior: No afecto / no aplica · Base de esta revisión: Incluye impuestos')).toBeVisible()
  await expect(page.getByText('Importe anterior: 10.00 PEN')).toBeVisible()
  await expect(page.getByText('Confirmación histórica; no vigente')).toBeVisible()
  await expect(page.getByText('Confirmación económica vigente')).toBeVisible()
 await page.getByRole('button',{name:'Revisar línea económica',exact:true}).click();form=page.getByRole('form',{name:'Operación económica'})
 await form.getByRole('checkbox',{name:/Anular esta línea/}).check();await evidence(form)
 await form.getByRole('button',{name:'Guardar costo o evidencia',exact:true}).click();await expect(form).toBeHidden()
 await expect(page.getByText('Línea anulada explícitamente; original conservado.')).toBeVisible()
 expect((await detail(f)).history.filter((h:{kind:string})=>h.kind==='entry')).toHaveLength(3)
})
test('R14: otros gastos se registran separados y una fuente nueva vuelve histórica la confirmación',async({page})=>{
 const f=await prepare(page);await labor(page,'4');await confirm(page);await labor(page,'2','PEN',true)
 const d=await detail(f);expect(d.summary.latest_review.is_current).toBe(false);expect(d.summary.state).toBe('partial')
 expect(d.summary.components.map((c:{component:string})=>c.component)).toEqual(['labor','other'])
 await expect(page.getByText(/Las fuentes económicas cambiaron/)).toBeVisible()
})
test('R14: No reparable devuelto conserva costos y permite gastos documentados sin reapertura',async({page,browser})=>{
 const f=await prepare(page);await labor(page,'7')
 const context=await browser.newContext()
 try {const techPage=await context.newPage(),tech=await login(techPage,'technician');let r=await row(f,f.id)
 await checked(tech.api.rpc('declare_repair_non_repairable',{payload:{organization_id:f.identity.organizationId,repair_id:f.id,expected_lock_version:r.lock_version,operation_key:randomUUID(),diagnosis_id:f.diagnosis,reason:'Daño irreversible'}}))
 r=await row(f,f.id);await checked(f.api.rpc('return_unrepaired_repair',{payload:{organization_id:f.identity.organizationId,repair_id:f.id,expected_lock_version:r.lock_version,operation_key:randomUUID(),decision_event_id:r.non_repairable_decision_id,returns:[]}}))
 const before=await row(f,f.id);await open(page,f.reference);await labor(page,'2','PEN',true);await confirm(page)
 const after=await row(f,f.id);expect(after.status).toBe('returned_unrepaired');expect(after.returned_unrepaired_at).toBe(before.returned_unrepaired_at)
 expect(after.technical_completion).toBeNull();expect((await detail(f)).summary.total.amount).toBe('9.00')
 } finally {await context.close()}
})
test('R14: corrección después de entrega no altera finalización R13 ni garantía',async({page})=>{
 const f=await prepare(page);await labor(page,'10');await confirm(page);await state(f,f.id,'testing')
 let r=await row(f,f.id);await checked(f.api.rpc('record_repair_test',{payload:{organization_id:f.identity.organizationId,repair_id:f.id,expected_lock_version:r.lock_version,test_type:'Encendido',result:'Approved',passed:true}}))
 await state(f,f.id,'ready_for_delivery');r=await row(f,f.id)
 await checked(f.api.rpc('configure_repair_service_warranty',{payload:{organization_id:f.identity.organizationId,repair_id:f.id,expected_lock_version:r.lock_version,operation_key:randomUUID(),warranty_days:30,coverage:'Cobertura R14'}}))
 r=await row(f,f.id);await checked(f.api.rpc('deliver_repair_with_accessories',{payload:{organization_id:f.identity.organizationId,repair_id:f.id,expected_lock_version:r.lock_version,operation_key:randomUUID(),returns:[]}}))
 const before=await row(f,f.id),warranty=await checked(f.api.from('repair_service_warranty_details').select('*').eq('repair_id',f.id).single())
 await open(page,f.reference);await page.getByRole('button',{name:'Revisar línea económica',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'});await form.getByLabel(/^Importe real/).fill('9.90');await evidence(form)
 await form.getByRole('button',{name:'Guardar costo o evidencia',exact:true}).click();await expect(form).toBeHidden();await confirm(page)
 const after=await row(f,f.id);expect(after.technical_completion).toEqual(before.technical_completion);expect(after.delivered_at).toBe(before.delivered_at)
 expect(await checked(f.api.from('repair_service_warranty_details').select('*').eq('repair_id',f.id).single())).toEqual(warranty)
})
test('R14: respuesta perdida recupera intención, clave y versión sin duplicar costos',async({page})=>{
 const f=await prepare(page),payloads:unknown[]=[]
 await page.route('**/rest/v1/rpc/record_repair_actual_cost',async route=>{payloads.push(route.request().postDataJSON());const response=await route.fetch();expect(response.ok()).toBeTruthy()
 if(payloads.length===1)await route.fulfill({status:504,contentType:'application/json',body:'{"message":"Response lost after commit"}'});else await route.fulfill({response})})
 await page.getByRole('button',{name:'Registrar mano de obra real',exact:true}).click();let form=page.getByRole('form',{name:'Operación económica'})
 await form.getByLabel('Concepto real *',{exact:true}).fill('Trabajo recuperable');await form.getByLabel('Fecha de incurrencia declarada *',{exact:true}).fill(today())
 await form.getByLabel(/^Importe real/).fill('4.10');await evidence(form);await form.getByRole('button',{name:'Guardar costo o evidencia',exact:true}).click()
 await expect(page.getByRole('alert')).toBeVisible();const committed=await row(f,f.id)
 await page.reload();await open(page,f.reference);await page.getByRole('button',{name:'Recuperar operación económica pendiente',exact:true}).click()
 form=page.getByRole('form',{name:'Operación económica'});await form.getByRole('button',{name:'Reintentar operación económica',exact:true}).click();await expect(form).toBeHidden()
 expect(payloads).toHaveLength(2);expect(payloads[1]).toEqual(payloads[0]);expect((await row(f,f.id)).lock_version).toBe(committed.lock_version)
 expect((await detail(f)).total_items).toBe(1)
 await page.getByRole('button',{name:'Recuperar operación económica pendiente',exact:true}).click()
 await expect(page.getByText('No hay una operación económica pendiente de confirmar en esta pestaña.')).toBeVisible()
 await expect(page.getByRole('form',{name:'Operación económica'})).toHaveCount(0)
})
test('R14: permisos efectivos, historial paginado y lote de listado sin N+1',async({page,browser})=>{
 const f=await prepare(page)
 for(let i=0;i<30;i++){const r=await row(f,f.id);await checked(f.api.rpc('record_repair_actual_cost',{payload:{organization_id:f.identity.organizationId,repair_id:f.id,expected_lock_version:r.lock_version,
 operation_key:randomUUID(),category:'labor',description:`Trabajo ${i}`,amount:'1.01',currency:'PEN',cost_basis:'not_applicable',incurred_on:today(),evidence_reference:`R14 documento ${i}`,reason:'Trabajo documentado'}}))}
 await open(page,f.reference);await expect(page.getByText('Historial económico · 30 registros')).toBeVisible()
 await page.getByRole('button',{name:'Página económica siguiente',exact:true}).click()
 await expect(page.getByRole('heading',{name:/^Mano de obra interna · Trabajo /})).toHaveCount(5)
 const context=await browser.newContext()
 try{const readonly=await context.newPage();await login(readonly,'admin');await open(readonly,f.reference)
 await expect(readonly.getByRole('button',{name:'Registrar mano de obra real',exact:true})).toHaveCount(0)
 await expect(readonly.getByRole('button',{name:'Revisar y confirmar costo',exact:true})).toHaveCount(0)
 }finally{await context.close()}
 const batches:unknown[]=[];await page.route('**/rest/v1/rpc/get_repair_actual_cost_summaries',async route=>{batches.push(route.request().postDataJSON());await route.continue()})
 await page.getByRole('button',{name:'Cerrar detalle de reparación',exact:true}).click();await page.getByText('Costos de las órdenes visibles',{exact:true}).click()
 await expect(page.getByText(/30.30 PEN/)).toBeVisible();expect(batches).toHaveLength(1)
})

test('R14: Administración asigna capacidades a una cuenta operativa real y esta registra y confirma',async({page,browser})=>{
 const f=await prepare(page),operator=identities.economicoperator
 const deniedContext=await browser.newContext(),adminContext=await browser.newContext(),financeContext=await browser.newContext()
 try {
  const deniedPage=await deniedContext.newPage(),denied=await login(deniedPage,'economicoperator')
  const permissions=await checked(denied.api.rpc('current_user_permissions'))
  expect(permissions).not.toContain('REPAIRS_MANAGE_ACTUAL_COST');expect(permissions).not.toContain('REPAIRS_CONFIRM_ACTUAL_COST')
  const r=await row(f,f.id)
  const forbidden=await denied.api.rpc('record_repair_actual_cost',{payload:{organization_id:f.identity.organizationId,repair_id:f.id,
   expected_lock_version:r.lock_version,operation_key:randomUUID(),category:'labor',description:'Unauthorized attempt',amount:'1.00',currency:'PEN',
   cost_basis:'not_applicable',incurred_on:today(),evidence_reference:'Denied operator',reason:'Must not record'}})
  expect(forbidden.error?.message).toBe('REPAIR_FORBIDDEN')
  const forbiddenReview=await denied.api.rpc('confirm_repair_actual_cost_review',{payload:{organization_id:f.identity.organizationId,repair_id:f.id,
   expected_lock_version:r.lock_version,operation_key:randomUUID()}})
  expect(forbiddenReview.error?.message).toBe('REPAIR_FORBIDDEN')
  const adminPage=await adminContext.newPage();await login(adminPage,'admin');await adminPage.goto('/usuarios')
  await expect(adminPage.getByRole('heading',{name:'Control de usuarios',exact:true})).toBeVisible()
  await adminPage.getByLabel('Buscar usuarios',{exact:true}).fill(operator.email)
  await adminPage.getByRole('row').filter({hasText:operator.email}).getByRole('button',{name:/Editar/}).click()
  const dialog=adminPage.getByRole('dialog',{name:'Editar usuario'})
  await expect(dialog.getByRole('radio',{name:/Acceso operativo personalizado/})).toBeChecked()
  await dialog.getByRole('checkbox',{name:'Reparaciones: Registrar y revisar costos reales',exact:true}).check()
  await dialog.getByRole('checkbox',{name:'Reparaciones: Confirmar revisión económica',exact:true}).check()
  await expect(dialog.getByRole('checkbox',{name:'Reparaciones: Consultar',exact:true})).toBeChecked()
  const update=adminPage.waitForResponse(response=>response.url().includes('/functions/v1/admin-users')&&response.request().postDataJSON()?.action==='update')
  await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click()
  const updated=await update;expect(updated.ok()).toBeTruthy()
  const request=updated.request().postDataJSON()
  expect(request.isAdmin).toBe(false);expect(request.permissionCodes).toEqual(expect.arrayContaining(['REPAIRS_VIEW','REPAIRS_MANAGE_ACTUAL_COST','REPAIRS_CONFIRM_ACTUAL_COST']))
  await expect(dialog).toBeHidden()
  const financePage=await financeContext.newPage(),finance=await login(financePage,'economicoperator')
  expect(await checked(finance.api.rpc('current_user_permissions'))).toEqual(expect.arrayContaining(['REPAIRS_VIEW','REPAIRS_MANAGE_ACTUAL_COST','REPAIRS_CONFIRM_ACTUAL_COST']))
  expect(await checked(finance.api.from('user_roles').select('role_code').eq('organization_id',operator.organizationId).eq('user_id',operator.id))).not.toEqual(expect.arrayContaining([{role_code:'ADMIN'}]))
  await open(financePage,f.reference);await labor(financePage,'3.25');await confirm(financePage)
  const result=await detail(f);expect(result.summary.total.amount).toBe('3.25');expect(result.summary.latest_review.reviewed_by).toBe(operator.id)
  expect(result.history.find((h:{kind:string})=>h.kind==='entry').actor_name).toBe('Accessory E2E economicoperator')
 } finally {await deniedContext.close();await adminContext.close();await financeContext.close()}
})
