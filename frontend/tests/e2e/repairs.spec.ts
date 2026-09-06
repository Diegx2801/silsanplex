import { randomUUID, randomInt } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Locator, type Page } from '@playwright/test'

// A dedicated identity avoids auth/recovery tests revoking our session.
test.describe.configure({ mode: 'default' })
test.setTimeout(120_000)
const catalogCustomerId = 'e0000000-0000-4000-8000-0000000003e9'
const catalogProductId = 'f0000000-0000-4000-8000-0000000003e9'
const catalogCustomerName = 'ZZZZ E2E Cliente catálogo 1001'
const catalogProductName = 'ZZZZ E2E Producto catálogo 1001'

function env(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name}`)
  return value
}

async function checked<T>(result: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await result
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

async function fixture(page: Page) {
  const url = env('VITE_SUPABASE_URL')
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('Las pruebas de Reparaciones solo admiten Supabase local.')
  }
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo').fill(env('E2E_REPAIRS_EMAIL'))
  await page.getByLabel('Contraseña').fill(env('E2E_REPAIRS_PASSWORD'))
  const authentication = page.waitForResponse('**/auth/v1/token?grant_type=password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  const session = await (await authentication).json()
  await page.waitForURL(/\/$/)
  const api = createClient(url, env('VITE_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  })
  const membership = await checked(api.from('organization_memberships').select('organization_id')
    .eq('user_id', session.user.id).eq('is_active', true).single())
  const organizationId = membership.organization_id as string
  const reference = `E2E-REP-${randomUUID().slice(0, 8).toUpperCase()}`
  const customerId = await checked(api.rpc('save_customer', { payload: {
    documentType: 'DNI', documentNumber: String(randomInt(10000000, 99999999)),
    legalName: reference, isActive: true, addresses: [], contacts: [],
  } })) as string
  const product = await checked(api.from('products').insert({ organization_id: organizationId,
    created_by: session.user.id, updated_by: session.user.id,
    code: reference, description: `000 ${reference}`, unit_of_measure: 'UND', sale_price: 25,
    batch_control: false, expiration_control: false, serial_control: false,
  }).select('id').single())
  const warehouse = await checked(api.from('warehouses').insert({ organization_id: organizationId,
    created_by: session.user.id, updated_by: session.user.id,
    code: reference, name: reference,
  }).select('id').single())
  const location = await checked(api.from('warehouse_locations').insert({ organization_id: organizationId,
    created_by: session.user.id, updated_by: session.user.id,
    warehouse_id: warehouse.id, code: 'A1', name: 'Reparaciones E2E',
  }).select('id').single())
  await checked(api.rpc('record_inventory_movement', { payload: {
    organization_id: organizationId, product_id: product.id, warehouse_id: warehouse.id,
    location_id: location.id, movement_type: 'entrada', quantity: 2, unit_cost: 10,
    stock_status: 'available', operation_date: new Date().toISOString().slice(0, 10), reason: reference,
  } }))
  return { api, organizationId, customerId, productId: product.id as string,
    warehouseId: warehouse.id as string, locationId: location.id as string,
    reference, userId: session.user.id as string }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

async function openRepair(page: Page, reference: string) {
  await page.goto('/reparaciones')
  await page.getByLabel('Buscar reparación').fill(reference)
  await expect(page.getByText('1 de 1 órdenes visibles')).toBeVisible()
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cerrar detalle de reparación' })).toBeVisible()
}

async function repair(f: Fixture) {
  return checked(f.api.from('repairs').select('*').eq('organization_id', f.organizationId)
    .eq('customer_reference', f.reference).single())
}

async function createRepair(page: Page, f: Fixture) {
  await page.goto('/reparaciones')
  await page.getByRole('button', { name: 'Registrar reparación', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Registrar reparación', exact: true })
  await dialog.getByLabel('Buscar cliente').fill(f.reference)
  await expect(dialog.getByLabel('Cliente *', { exact: true }).locator(`option[value="${f.customerId}"]`)).toHaveCount(1)
  await dialog.getByLabel('Cliente *', { exact: true }).selectOption(f.customerId)
  await dialog.getByLabel('Buscar producto o equipo').fill(f.reference)
  await expect(dialog.getByLabel('Producto o equipo *').locator(`option[value="${f.productId}"]`)).toHaveCount(1)
  await dialog.getByLabel('Producto o equipo *').selectOption(f.productId)
  await dialog.getByLabel('Problema reportado *').fill('Equipo no enciende')
  await dialog.getByLabel('Referencia del cliente').fill(f.reference)
  return dialog
}

// Forward to real PostgreSQL, then lose the successful response. Never mock a
// successful mutation: the second request must replay the committed operation.
async function submitWithLostResponse(page: Page, dialog: Locator, rpc: string, button: string) {
  const requests: unknown[] = []
  const pattern = `**/rest/v1/rpc/${rpc}`
  await page.route(pattern, async (route) => {
    requests.push(route.request().postDataJSON())
    const response = await route.fetch()
    expect(response.ok()).toBeTruthy()
    if (requests.length === 1) {
      await route.fulfill({ status: 504, contentType: 'application/json',
        body: JSON.stringify({ message: 'Tiempo de espera agotado E2E' }) })
    } else await route.fulfill({ response })
  })
  await dialog.getByRole('button', { name: button, exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await dialog.getByRole('button', { name: button, exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  await page.unroute(pattern)
}

async function changeState(page: Page, state: string) {
  await page.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Cambiar estado', exact: true })
  await dialog.getByLabel('Nuevo estado *').selectOption(state)
  await dialog.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await expect(dialog).toBeHidden()
}

async function prepareDiagnosis(page: Page, f: Fixture) {
  const dialog = await createRepair(page, f)
  await dialog.getByRole('button', { name: 'Registrar reparación', exact: true }).click()
  await expect(dialog).toBeHidden()
  await openRepair(page, f.reference)
  await changeState(page, 'diagnosis')
}

async function quote(page: Page, action = 'Crear cotización') {
  await page.getByRole('button', { name: action, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /Crear cotización|Crear revisión|Editar cotización/ })
  await dialog.getByLabel('Descripción *', { exact: true }).fill('Reparación de fuente')
  await dialog.getByLabel('Precio unitario *').fill('50')
  return dialog
}

async function stock(api: SupabaseClient, productId: string) {
  return checked(api.from('inventory_product_stock_summary')
    .select('physical_quantity,reserved_quantity,assignable_quantity').eq('product_id', productId).single())
}

test('flujo completo con reintentos reales: creación, cotización, reserva, consumo, prueba y entrega', async ({ page }) => {
  const f = await fixture(page)
  const creation = await createRepair(page, f)
  await submitWithLostResponse(page, creation, 'create_repair', 'Registrar reparación')
  await openRepair(page, f.reference)
  await page.getByRole('button', { name: 'Asignar técnico', exact: true }).click()
  const assignment = page.getByRole('dialog', { name: 'Asignar técnico', exact: true })
  await assignment.getByLabel('Técnico *').selectOption(f.userId)
  await assignment.getByRole('button', { name: 'Guardar asignación' }).click()
  await expect(assignment).toBeHidden()
  await changeState(page, 'diagnosis')
  await page.getByRole('button', { name: 'Registrar diagnóstico', exact: true }).click()
  const diagnosis = page.getByRole('dialog', { name: 'Registrar diagnóstico' })
  await diagnosis.getByLabel('Síntomas observados *').fill('Fuente sin salida')
  await diagnosis.getByRole('button', { name: 'Guardar diagnóstico' }).click()
  await expect(diagnosis).toBeHidden()
  const draft = await quote(page)
  await submitWithLostResponse(page, draft, 'save_repair_quote', 'Guardar borrador')
  const submission = await quote(page, 'Editar borrador')
  await submission.getByRole('button', { name: 'Enviar a aprobación' }).click()
  await expect(submission).toBeHidden()
  await page.getByRole('button', { name: 'Aprobar cotización', exact: true }).click()
  const approval = page.getByRole('dialog', { name: 'Aprobar cotización', exact: true })
  await approval.getByRole('button', { name: 'Aprobar cotización', exact: true }).click()
  await expect(approval).toBeHidden()
  await changeState(page, 'in_repair')
  await page.getByRole('button', { name: 'Reservar repuesto', exact: true }).click()
  const reservation = page.getByRole('dialog', { name: 'Reservar repuesto' })
  await reservation.getByLabel('Buscar repuesto').fill(f.reference)
  await expect(reservation.getByLabel('Producto *').locator(`option[value="${f.productId}"]`)).toHaveCount(1)
  await reservation.getByLabel('Producto *', { exact: true }).selectOption(f.productId)
  await reservation.getByLabel('Almacén *', { exact: true }).selectOption(f.warehouseId)
  await expect(reservation.getByText(/2 asignables/)).toBeVisible()
  await reservation.getByLabel('Cantidad solicitada *').fill('2')
  await submitWithLostResponse(page, reservation, 'reserve_repair_part', 'Reservar repuesto')
  expect(await stock(f.api, f.productId)).toMatchObject({ physical_quantity: 2, reserved_quantity: 2, assignable_quantity: 0 })
  await page.getByRole('button', { name: 'Consumir saldo' }).click()
  const consumption = page.getByRole('dialog', { name: 'Consumir repuesto' })
  await submitWithLostResponse(page, consumption, 'consume_repair_part', 'Confirmar consumo')
  expect(await stock(f.api, f.productId)).toMatchObject({ physical_quantity: 0, reserved_quantity: 0, assignable_quantity: 0 })
  await page.getByRole('button', { name: 'Registrar solución', exact: true }).click()
  const solution = page.getByRole('dialog', { name: 'Registrar solución aplicada' })
  await solution.getByLabel('Solución aplicada *').fill('Fuente reemplazada y calibrada')
  await solution.getByRole('button', { name: 'Guardar solución' }).click()
  await expect(solution).toBeHidden()
  await changeState(page, 'testing')
  await page.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  const premature = page.getByRole('dialog', { name: 'Cambiar estado', exact: true })
  await premature.getByLabel('Nuevo estado *').selectOption('ready_for_delivery')
  await premature.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await expect(premature.getByRole('alert')).toContainText('prueba aprobada')
  await premature.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('button', { name: 'Registrar prueba', exact: true }).click()
  const testing = page.getByRole('dialog', { name: 'Registrar prueba' })
  await testing.getByLabel('Tipo de prueba *').fill('Encendido')
  await testing.getByLabel('Resultado *', { exact: true }).fill('Equipo estable')
  await testing.getByRole('checkbox').check()
  await testing.getByRole('button', { name: 'Guardar prueba' }).click()
  await expect(testing).toBeHidden()
  await page.getByRole('button', { name: 'Registrar prueba', exact: true }).click()
  await testing.getByLabel('Tipo de prueba *').fill('Carga prolongada')
  await testing.getByLabel('Resultado *', { exact: true }).fill('Falla bajo carga')
  await testing.getByRole('checkbox').uncheck()
  await testing.getByRole('button', { name: 'Guardar prueba' }).click()
  await expect(testing).toBeHidden()
  await page.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await premature.getByLabel('Nuevo estado *').selectOption('ready_for_delivery')
  await premature.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await expect(premature.getByRole('alert')).toContainText('prueba fallida')
  await premature.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await changeState(page, 'in_repair')
  await changeState(page, 'testing')
  const currentTests = page.getByRole('region', { name: 'Resultados del ciclo vigente' })
  const historicalTests = page.getByRole('region', { name: 'Historial de pruebas' })
  await expect(currentTests).toContainText('Ciclo vigente: 2')
  await expect(currentTests).toContainText('No hay pruebas registradas')
  await expect(historicalTests).toContainText('Falla bajo carga')
  await expect(historicalTests).toContainText('Equipo estable')
  await page.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await premature.getByLabel('Nuevo estado *').selectOption('ready_for_delivery')
  await premature.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await expect(premature.getByRole('alert')).toContainText('prueba aprobada')
  await premature.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('button', { name: 'Registrar prueba', exact: true }).click()
  await testing.getByLabel('Tipo de prueba *').fill('Carga tras retrabajo')
  await testing.getByLabel('Resultado *', { exact: true }).fill('Carga estable tras ajuste')
  await testing.getByRole('checkbox').check()
  await testing.getByRole('button', { name: 'Guardar prueba' }).click()
  await expect(testing).toBeHidden()
  await expect(currentTests).toContainText('Carga estable tras ajuste')
  await expect(currentTests).not.toContainText('Falla bajo carga')
  await changeState(page, 'ready_for_delivery')
  await page.getByRole('button', { name: 'Entregar', exact: true }).click()
  const delivery = page.getByRole('dialog', { name: 'Entregar reparación' })
  await delivery.getByRole('button', { name: 'Confirmar entrega' }).click()
  await expect(delivery).toBeHidden()
  const persisted = await repair(f)
  expect(persisted.status).toBe('delivered')
  expect(persisted.delivered_at).toBeTruthy()
  const parts = await checked(f.api.from('repair_parts').select('id').eq('repair_id', persisted.id))
  expect(parts).toHaveLength(1)
  expect(await checked(f.api.from('repair_part_consumptions').select('id').eq('repair_part_id', parts[0].id))).toHaveLength(1)
  expect(await checked(f.api.from('repair_quotes').select('id').eq('repair_id', persisted.id))).toHaveLength(1)
})

test('catálogos remotos permiten seleccionar después del registro 1000 y resolver históricos', async ({ page }) => {
  const f = await fixture(page)
  const customerPosition = await f.api.from('customers').select('id', { count: 'exact', head: true })
    .eq('organization_id', f.organizationId).eq('is_active', true).lt('legal_name', catalogCustomerName)
  const productPosition = await f.api.from('products').select('id', { count: 'exact', head: true })
    .eq('organization_id', f.organizationId).eq('is_active', true).lt('description', catalogProductName)
  expect(customerPosition.error).toBeNull()
  expect(productPosition.error).toBeNull()
  expect(customerPosition.count).toBeGreaterThanOrEqual(1000)
  expect(productPosition.count).toBeGreaterThanOrEqual(1000)

  await page.goto('/reparaciones')
  await page.getByRole('button', { name: 'Registrar reparación', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Registrar reparación', exact: true })
  expect(await dialog.getByLabel('Cliente *').getByRole('option').count()).toBeLessThanOrEqual(26)
  expect(await dialog.getByLabel('Producto o equipo *').getByRole('option').count()).toBeLessThanOrEqual(26)
  await dialog.getByRole('button', { name: 'Siguiente', exact: true }).first().click()
  await expect(dialog.getByText(/página 2 de/).first()).toBeVisible()
  await dialog.getByLabel('Buscar cliente').fill('E2ECAT1001')
  await expect(dialog.getByLabel('Cliente *').locator(`option[value="${catalogCustomerId}"]`)).toHaveCount(1)
  await dialog.getByLabel('Cliente *').selectOption(catalogCustomerId)
  await dialog.getByLabel('Buscar producto o equipo').fill('E2ECAT1001')
  await expect(dialog.getByLabel('Producto o equipo *').locator(`option[value="${catalogProductId}"]`)).toHaveCount(1)
  await dialog.getByLabel('Producto o equipo *').selectOption(catalogProductId)
  await dialog.getByLabel('Problema reportado *').fill('Catálogo remoto verificable')
  await dialog.getByLabel('Referencia del cliente').fill(f.reference)
  await dialog.getByRole('button', { name: 'Registrar reparación', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(await repair(f)).toMatchObject({ customer_id: catalogCustomerId, product_id: catalogProductId })

  await checked(f.api.rpc('set_customer_status', {
    requested_customer_id: catalogCustomerId, requested_active: false,
  }))
  await openRepair(page, f.reference)
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  const edit = page.getByRole('dialog', { name: /Editar REP-/ })
  await expect(edit.getByLabel('Cliente *')).toHaveValue(catalogCustomerId)
  await expect(edit.getByLabel('Cliente *').locator(`option[value="${catalogCustomerId}"]`))
    .toContainText('referencia histórica')
  await expect(edit.getByLabel('Producto o equipo *')).toHaveValue(catalogProductId)
  await edit.getByRole('button', { name: 'Cancelar', exact: true }).click()

  await checked(f.api.rpc('record_inventory_movement', { payload: {
    organization_id: f.organizationId, product_id: catalogProductId,
    warehouse_id: f.warehouseId, location_id: f.locationId, movement_type: 'entrada',
    quantity: 2, unit_cost: 10, stock_status: 'available',
    operation_date: new Date().toISOString().slice(0, 10), reason: f.reference,
  } }))
  await openRepair(page, f.reference)
  await page.getByRole('button', { name: 'Asignar técnico', exact: true }).click()
  const assignment = page.getByRole('dialog', { name: 'Asignar técnico', exact: true })
  await assignment.getByLabel('Técnico *').selectOption(f.userId)
  await assignment.getByRole('button', { name: 'Guardar asignación' }).click()
  await expect(assignment).toBeHidden()
  await changeState(page, 'diagnosis')
  await page.getByRole('button', { name: 'Registrar diagnóstico', exact: true }).click()
  const diagnosis = page.getByRole('dialog', { name: 'Registrar diagnóstico' })
  await diagnosis.getByLabel('Síntomas observados *').fill('Prueba de catálogo remoto')
  await diagnosis.getByRole('button', { name: 'Guardar diagnóstico' }).click()
  await expect(diagnosis).toBeHidden()
  const quotation = await quote(page)
  await quotation.getByRole('button', { name: 'Enviar a aprobación' }).click()
  await expect(quotation).toBeHidden()
  await page.getByRole('button', { name: 'Aprobar cotización', exact: true }).click()
  const approval = page.getByRole('dialog', { name: 'Aprobar cotización', exact: true })
  await approval.getByRole('button', { name: 'Aprobar cotización', exact: true }).click()
  await expect(approval).toBeHidden()
  await changeState(page, 'in_repair')
  await page.getByRole('button', { name: 'Reservar repuesto', exact: true }).click()
  const reservation = page.getByRole('dialog', { name: 'Reservar repuesto' })
  await reservation.getByLabel('Buscar repuesto').fill('E2ECAT1001')
  await expect(reservation.getByLabel('Producto *').locator(`option[value="${catalogProductId}"]`)).toHaveCount(1)
  await reservation.getByLabel('Producto *').selectOption(catalogProductId)
  await reservation.getByLabel('Almacén *').selectOption(f.warehouseId)
  await expect(reservation.getByText(/2 asignables/)).toBeVisible()
  await reservation.getByRole('button', { name: 'Cancelar', exact: true }).click()
})

for (const recovery of ['reabrir', 'recargar'] as const) {
  test(`creación confirmada con respuesta perdida: ${recovery} recupera la misma operación`, async ({ page }) => {
    const f = await fixture(page)
    const dialog = await createRepair(page, f)
    const requests: unknown[] = []
    const ids: unknown[] = []
    await page.route('**/rest/v1/rpc/create_repair', async (route) => {
      requests.push(route.request().postDataJSON())
      const response = await route.fetch()
      expect(response.ok()).toBeTruthy()
      ids.push(await response.json())
      if (requests.length === 1) {
        await route.fulfill({ status: 504, contentType: 'application/json',
          body: JSON.stringify({ message: 'Tiempo de espera agotado E2E' }) })
      } else await route.fulfill({ response })
    })
    await dialog.getByRole('button', { name: 'Registrar reparación', exact: true }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    if (recovery === 'recargar') await page.reload()
    else await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page.getByRole('button', { name: 'Registrar reparación', exact: true }).first().click()
    await expect(dialog.getByRole('status')).toContainText('registro pendiente')
    await expect(dialog.getByLabel('Referencia del cliente')).toHaveValue(f.reference)
    await expect(dialog.getByLabel('Problema reportado *')).toHaveValue('Equipo no enciende')
    await dialog.getByRole('button', { name: 'Registrar reparación', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(ids[1]).toEqual(ids[0])
    expect(await checked(f.api.from('repairs').select('id').eq('organization_id', f.organizationId)
      .eq('customer_reference', f.reference))).toHaveLength(1)
  })
}

test('dos pestañas: una acción obsoleta se rechaza sin sobrescribir el cambio confirmado', async ({ page, context }) => {
  const f = await fixture(page)
  await prepareDiagnosis(page, f)
  await page.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  const stale = page.getByRole('dialog', { name: 'Cambiar estado', exact: true })
  const other = await context.newPage()
  await openRepair(other, f.reference)
  await changeState(other, 'quote_pending')
  await stale.getByLabel('Nuevo estado *').selectOption('quote_pending')
  await stale.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await expect(stale.getByRole('alert')).toContainText('cambió mientras')
  expect((await repair(f)).status).toBe('quote_pending')
  await other.close()
})

test('rechazo y revisión conservan una sola cotización vigente y el actor de decisión', async ({ page }) => {
  const f = await fixture(page)
  await prepareDiagnosis(page, f)
  const first = await quote(page)
  await first.getByRole('button', { name: 'Enviar a aprobación' }).click()
  await expect(first).toBeHidden()
  await page.getByRole('button', { name: 'Rechazar cotización', exact: true }).click()
  const rejection = page.getByRole('dialog', { name: 'Rechazar cotización', exact: true })
  await rejection.getByLabel('Observación *', { exact: true }).fill('Ajustar presupuesto')
  await rejection.getByRole('button', { name: 'Rechazar cotización', exact: true }).click()
  await expect(rejection).toBeHidden()
  const revision = await quote(page, 'Crear revisión')
  await submitWithLostResponse(page, revision, 'revise_repair_quote', 'Guardar borrador')
  const quotes = await checked(f.api.from('repair_quotes').select('version_number,status,is_current,rejected_by')
    .eq('repair_id', (await repair(f)).id).order('version_number'))
  expect(quotes).toEqual([
    { version_number: 1, status: 'rejected', is_current: false, rejected_by: f.userId },
    { version_number: 2, status: 'draft', is_current: true, rejected_by: null },
  ])
})
