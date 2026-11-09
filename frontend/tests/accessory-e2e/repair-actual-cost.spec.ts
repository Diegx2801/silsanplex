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
 await expect(page.getByText('1 de 1 órdenes visibles')).toBeVisible();await page.getByRole('button',{name:/^(Ver detalle|Ver reparación)$/i}).click()
 await page.getByRole('tab',{name:'Presupuesto y repuestos',exact:true}).click()
 await page.getByText('Costo real de reparación',{exact:true}).click()
 const summary=page.getByRole('region',{name:'Consulta de costo real'})
 await expect(summary.getByRole('heading',{name:/^(Sin costos registrados|Costo revisado|Costo parcial|Pendiente de revisión)$/})).toBeVisible()
 const breakdown=page.getByText(/^Ver desglose \(\d+\)$/)
 if(await breakdown.count())await breakdown.click()
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
 await form.getByLabel(/^(Documento o referencia de respaldo|Referencia de revisión) \*$/).fill(ref)
}
async function labor(page:Page,amount='12.50',currency='PEN',other=false) {
 await page.getByRole('button',{name:'Registrar costo',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'})
 await form.getByLabel('Tipo de costo').selectOption(other?'other':'labor')
 await form.getByLabel('Concepto *',{exact:true}).fill(other?'Transporte documentado':'Diagnóstico y reparación reales')
 await form.getByLabel('Fecha del costo *',{exact:true}).fill(today())
 await form.getByLabel('Monto *').fill(amount);await form.getByLabel('Moneda *',{exact:true}).selectOption(currency)
 await evidence(form);await form.getByRole('button',{name:'Guardar costo',exact:true}).click()
 await expect(form).toBeHidden();await expect(page.getByRole('region',{name:'Consulta de costo real'}).getByRole('heading',{name:'Costo parcial',exact:true})).toBeVisible()
}
async function confirm(page:Page) {
 await page.getByRole('button',{name:'Revisar costo',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'});await evidence(form)
 await form.getByRole('checkbox',{name:/Confirmo que revisé importes y respaldos/}).check()
 await form.getByRole('button',{name:'Confirmar costo',exact:true}).click();await expect(form).toBeHidden()
 await expect(page.getByRole('region',{name:'Consulta de costo real'}).getByRole('heading',{name:'Costo revisado',exact:true})).toBeVisible()
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
 await article.getByRole('button',{name:'Revisar origen',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'});await form.getByLabel('Moneda *',{exact:true}).selectOption(currency)
 await form.getByLabel('¿El importe incluye impuestos? *',{exact:true}).selectOption('not_applicable');await evidence(form)
 await form.getByRole('button',{name:'Guardar costo',exact:true}).click();await expect(form).toBeHidden()
}
async function stock(f:Fixture) {
 const org=f.identity.organizationId,suffix=randomUUID().slice(0,8).toUpperCase()
 const product=await checked(f.api.from('products').insert({organization_id:org,code:`R14-${suffix}`,description:'Repuesto real R14',unit_of_measure:'UND',
 product_type:'good',tax_affectation:'gravado',batch_control:false,expiration_control:false,created_by:f.identity.id,updated_by:f.identity.id}).select('id').single())
 const warehouse=await checked(f.api.rpc('save_warehouse',{payload:{organization_id:org,operation_key:randomUUID(),code:`R14-${suffix}`,name:`R14 ${suffix}`,address:'Disposable R14'}}))
 const location=await checked(f.api.from('warehouse_locations').select('id').eq('organization_id',org).eq('warehouse_id',warehouse).eq('code','GENERAL').single())
 const supplier=await checked(f.api.from('suppliers').insert({organization_id:org,code:`RP-${suffix}`,document_type:'otro',document_number:`RP-${suffix}`,business_name:`Compra ${suffix}`,created_by:f.identity.id,updated_by:f.identity.id}).select('id').single())
 const po=await checked(f.api.rpc('save_purchase_order',{payload:{organization_id:org,supplier_id:supplier.id,document_type:'factura',series:'R14',document_number:suffix,
  issue_date:today(),warehouse_id:warehouse,warehouse:`R14 ${suffix}`,currency:'PEN',prices_include_tax:false,items:[{product_id:product.id,quantity:10,unit_cost:5}]}}))
 await checked(f.api.rpc('issue_purchase_order',{requested_organization_id:org,requested_order_id:po}))
 const item=await checked(f.api.from('purchase_order_items').select('id').eq('organization_id',org).eq('purchase_order_id',po).single())
 await checked(f.api.rpc('receive_purchase_order_partial_inspected',{payload:{organization_id:org,purchase_order_id:po,operation_key:randomUUID(),items:[{purchase_order_item_id:item.id,quantity:10,location_id:location.id,fulfillment_mode:'physical'}]}}))
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
 await expect(article.getByText(/Moneda y base de inventario no acreditadas/)).toBeVisible()
 await article.getByRole('button',{name:'Revisar origen',exact:true}).click()
 const form=page.getByRole('form',{name:'Operación económica'});await evidence(form)
 await form.getByRole('button',{name:'Guardar costo',exact:true}).click();await expect(form).toBeHidden()
 await expect(article.getByText('Origen revisado',{exact:true})).toBeVisible();await confirm(page)
 expect((await detail(f)).summary.total.amount).toBe('5.0000000')
})
test('R14: costo de proveedor requiere base documentada y conserva importe original',async({page})=>{
 const f=await prepare(page);await external(f);await open(page,f.reference)
 const article=page.getByRole('article').filter({has:page.getByRole('heading',{name:/Servicios externos ·/})}).first()
 await expect(article.getByText(/falta verificar su base económica/)).toBeVisible();await verifyExternal(page)
 await confirm(page);expect((await detail(f)).summary.total.currency).toBe('USD')
 await expect(page.getByText(/Costo declarado al retorno: US\$ 30\.00\./)).toBeVisible()
})
test('R14: fuentes pendientes bloquean la confirmación y no crean una revisión',async({page})=>{
 const f=await prepare(page);await external(f);await open(page,f.reference)
 await expect(page.getByRole('button',{name:'Revisar costo',exact:true})).toHaveCount(0)
 expect((await detail(f)).summary.latest_review).toBeNull()
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
