import { execFileSync } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { expect, type Locator, type Page } from '@playwright/test'

function env(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name}`)
  return value
}

/** Fail closed before login/setup if the local ports belong to another project. */
function assertSilsanInstance() {
  const url = new URL(env('VITE_SUPABASE_URL'))
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '54321') {
    throw new Error('El escenario operativo solo admite Supabase local en localhost:54321.')
  }
  const expectedDirectory = resolve(import.meta.dirname, '../../../../backend')
  for (const [name, port, hostPort] of [
    ['supabase_db_backend', '5432/tcp', '54322'],
    ['supabase_kong_backend', '8000/tcp', '54321'],
  ]) {
    const [container] = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' })) as Array<{
      Config: { Labels: Record<string, string> }
      State: { Running: boolean }
      NetworkSettings: { Ports: Record<string, Array<{ HostPort: string }> | null> }
    }>
    if (!container?.State.Running || container.Config.Labels['com.supabase.cli.project'] !== 'backend'
      || resolve(container.Config.Labels['com.supabase.cli.workdir'] ?? '') !== expectedDirectory
      || !container.NetworkSettings.Ports[port]?.some((binding) => binding.HostPort === hostPort)) {
      throw new Error(`La identidad o los puertos de ${name} no corresponden a SILSAN.`)
    }
  }
  const organizations = JSON.parse(execFileSync('docker', ['exec', 'supabase_db_backend', 'psql',
    '-U', 'postgres', '-d', 'postgres', '-Atc',
    'select coalesce(json_agg(o), \'[]\'::json) from (select id,name,slug from public.organizations) o',
  ], { encoding: 'utf8' })) as Array<{ id: string; name: string; slug: string }>
  if (organizations.length !== 1 || organizations[0].slug !== 'drogueria-silsan'
    || organizations[0].name !== 'Droguería SILSAN S.A.C.') {
    throw new Error('La instancia no contiene exclusivamente la organización SILSAN esperada.')
  }
  return organizations[0].id
}

export async function checked<T>(result: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await result
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

export async function selectRemote(dialog: Locator, label: string, search: string) {
  const field = dialog.getByRole('combobox', { name: new RegExp(`^${label}`) })
  await field.fill(search)
  await dialog.getByRole('option').filter({ hasText: search }).click()
}

/** Observe a real UI mutation; never fulfill or mock a business request. */
export async function mutate(page: Page, rpc: string, action: () => Promise<unknown>) {
  const [result] = await Promise.all([
    page.waitForResponse((item) => new URL(item.url()).pathname === `/rest/v1/rpc/${rpc}`
      && item.request().method() === 'POST', { timeout: 15_000 }),
    action(),
  ])
  expect(result.ok(), `${rpc}: ${result.status()} ${await result.text()}`).toBeTruthy()
  console.info(`Operación UI real: ${rpc} → ${result.status()}`)
}

export async function operationalFixture(page: Page) {
  const organizationId = assertSilsanInstance()
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo').fill(env('E2E_ADMIN_EMAIL'))
  await page.getByLabel('Contraseña').fill(env('E2E_ADMIN_PASSWORD'))
  const authentication = page.waitForResponse('**/auth/v1/token?grant_type=password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  const session = await (await authentication).json() as { access_token: string; user: { id: string } }
  await page.waitForURL(/\/$/)
  // Ordinary authenticated token from this browser, never a service-role key.
  const api = createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  })
  const membership = await checked(api.from('organization_memberships').select('organization_id')
    .eq('user_id', session.user.id).eq('is_active', true).single())
  expect(membership.organization_id).toBe(organizationId)
  const reference = `E2E-OPS-${randomUUID().slice(0, 8).toUpperCase()}`
  const name = `000 ${reference}`
  const product = await checked(api.from('products').insert({ organization_id: organizationId,
    code: reference, description: name, unit_of_measure: 'UND', product_type: 'good',
    tax_affectation: 'gravado', cost: 10, sale_price: 25,
    batch_control: true, expiration_control: true, serial_control: false,
    created_by: session.user.id, updated_by: session.user.id,
  }).select('id').single())
  const supplier = await checked(api.from('suppliers').insert({ organization_id: organizationId,
    code: reference, document_type: 'otro', document_number: reference, business_name: name,
    created_by: session.user.id, updated_by: session.user.id,
  }).select('id').single())
  const customerId = await checked(api.rpc('save_customer', { payload: {
    documentType: 'DNI', documentNumber: String(randomInt(10000000, 99999999)),
    legalName: name, isActive: true, addresses: [], contacts: [],
  } })) as string
  const warehouseId = await checked(api.rpc('save_warehouse', { payload: {
    organization_id: organizationId, operation_key: randomUUID(), code: reference,
    name, address: 'Almacén de pruebas operativas SILSAN',
  } })) as string
  const location = await checked(api.from('warehouse_locations').select('id')
    .eq('organization_id', organizationId).eq('warehouse_id', warehouseId).eq('code', 'GENERAL').single())
  const expiration = new Date()
  expiration.setUTCFullYear(expiration.getUTCFullYear() + 1)
  return { api, organizationId, reference, name, productId: product.id as string,
    supplierId: supplier.id as string, customerId, warehouseId, locationId: location.id as string,
    lot: `LOT-${reference}`, expiration: expiration.toISOString().slice(0, 10),
    documentNumber: String(randomInt(10000000, 99999999)) }
}

export type OperationalFixture = Awaited<ReturnType<typeof operationalFixture>>

export async function expectStock(f: OperationalFixture, physical: number, reserved: number, available: number) {
  await expect.poll(async () => {
    const row = await checked(f.api.from('inventory_product_stock_summary')
      .select('physical_quantity,reserved_quantity,assignable_quantity')
      .eq('organization_id', f.organizationId).eq('product_id', f.productId).single())
    return [Number(row.physical_quantity), Number(row.reserved_quantity), Number(row.assignable_quantity)]
  }).toEqual([physical, reserved, available])
}
