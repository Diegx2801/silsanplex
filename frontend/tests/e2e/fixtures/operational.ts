import { execFileSync } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { expect, type Locator, type Page } from '@playwright/test'

function env(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name}`)
  return value
}

/** Fail closed before login/setup if the local ports belong to another project. */
export type OperationalTarget = 'persistent-silsan' | 'isolated-phase2c2' | 'isolated-accessory-ci'

export function operationalTargetFromEnvironment(): OperationalTarget {
  if (process.env.SILSAN_ACCESSORY_CI_E2E === '1') return 'isolated-accessory-ci'
  return process.env.SILSAN_PHASE2C2_E2E === '1' ? 'isolated-phase2c2' : 'persistent-silsan'
}

export function assertSilsanInstance(target: OperationalTarget = 'persistent-silsan') {
  const isolatedPhase2c2 = target === 'isolated-phase2c2'
  const isolatedAccessoryCi = target === 'isolated-accessory-ci'
  const isolated = isolatedPhase2c2 || isolatedAccessoryCi
  if (isolatedPhase2c2 && env('SILSAN_PHASE2C2_E2E') !== '1') {
    throw new Error('La instancia 2C-2 solo se admite con SILSAN_PHASE2C2_E2E=1.')
  }
  if (isolatedAccessoryCi && env('SILSAN_ACCESSORY_CI_E2E') !== '1') {
    throw new Error('La instancia E2E desechable solo se admite con SILSAN_ACCESSORY_CI_E2E=1.')
  }

  const url = new URL(env('VITE_SUPABASE_URL'))
  const projectId = isolatedPhase2c2 ? 'silsanplexp2c2' : isolatedAccessoryCi ? env('E2E_ACCESSORY_PROJECT') : 'backend'
  const apiPort = isolatedPhase2c2 ? '58121' : isolatedAccessoryCi ? new URL(env('E2E_ACCESSORY_API_URL')).port : '54321'
  const databasePort = isolatedPhase2c2 ? '58122' : isolatedAccessoryCi ? env('E2E_ACCESSORY_DB_PORT') : '54322'
  if (isolatedAccessoryCi && !/^silsanacc[0-9a-f]{10}$/.test(projectId)) {
    throw new Error('El proyecto E2E desechable no tiene un identificador permitido.')
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== apiPort) {
    throw new Error(`El escenario operativo ${target} requiere Supabase local en localhost:${apiPort}.`)
  }
  const expectedDirectory = isolatedPhase2c2
    ? resolve(env('E2E_PHASE2C2_WORKDIR'))
    : isolatedAccessoryCi ? resolve(env('E2E_ACCESSORY_WORKDIR'))
    : resolve(import.meta.dirname, '../../../../backend')
  const databaseContainerName = `supabase_db_${projectId}`
  if (isolatedPhase2c2) {
    const authorizedDirectory = resolve(env('LOCALAPPDATA'), 'Temp/silsanplex-phase2c2-20261021')
    if (expectedDirectory !== authorizedDirectory) throw new Error('Directorio temporal 2C-2 no autorizado.')
    const config = readFileSync(resolve(expectedDirectory, 'supabase', 'config.toml'), 'utf8')
    if (!config.includes('project_id = "silsanplexp2c2"')
      || !/^\[api\][\s\S]*?^port = 58121$/m.test(config)
      || !/^\[db\][\s\S]*?^port = 58122$/m.test(config)) {
      throw new Error('La configuración local no coincide con el proyecto y puertos aislados 2C-2.')
    }
    const [volume] = JSON.parse(execFileSync('docker', ['volume', 'inspect', 'supabase_db_silsanplexp2c2'], {
      encoding: 'utf8',
    })) as Array<{ Labels: Record<string, string> }>
    if (volume?.Labels['com.supabase.cli.project'] !== 'silsanplexp2c2') {
      throw new Error('El volumen de PostgreSQL no está etiquetado para SILSAN 2C-2.')
    }
  }
  if (isolatedAccessoryCi) {
    if (!expectedDirectory.includes('silsan-accessories-') || !expectedDirectory.endsWith('backend')) {
      throw new Error('El backend no corresponde a un proyecto accesorio temporal autorizado.')
    }
    const config = readFileSync(resolve(expectedDirectory, 'supabase', 'config.toml'), 'utf8')
    if (!config.includes(`project_id = "${projectId}"`)
      || !new RegExp(`^\\[api\\][\\s\\S]*?^port = ${apiPort}$`, 'm').test(config)
      || !new RegExp(`^\\[db\\][\\s\\S]*?^port = ${databasePort}$`, 'm').test(config)) {
      throw new Error('La configuración local no coincide con el proyecto operativo desechable.')
    }
    const [volume] = JSON.parse(execFileSync('docker', ['volume', 'inspect', `supabase_db_${projectId}`], { encoding: 'utf8' })) as Array<{
      Name: string; Labels: Record<string, string>
    }>
    if (volume?.Name !== `supabase_db_${projectId}` || volume.Labels['com.supabase.cli.project'] !== projectId) {
      throw new Error('El volumen PostgreSQL no pertenece al proyecto operativo desechable.')
    }
  }
  for (const [name, port, hostPort] of [
    [databaseContainerName, '5432/tcp', databasePort],
    [`supabase_kong_${projectId}`, '8000/tcp', apiPort],
  ]) {
    const [container] = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' })) as Array<{
      Config: { Labels: Record<string, string> }
      State: { Running: boolean }
      NetworkSettings: { Ports: Record<string, Array<{ HostPort: string }> | null> }
      Mounts?: Array<{ Type: string; Name?: string }>
    }>
    if (!container?.State.Running || container.Config.Labels['com.supabase.cli.project'] !== projectId
       || (container.Config.Labels['com.supabase.cli.workdir']
         ? resolve(container.Config.Labels['com.supabase.cli.workdir']) !== expectedDirectory
          : !isolated)
      || !container.NetworkSettings.Ports[port]?.some((binding) => binding.HostPort === hostPort)) {
      throw new Error(`La identidad o los puertos de ${name} no corresponden a SILSAN.`)
    }
    if (isolated && name === databaseContainerName) {
      const expectedVolume = `supabase_db_${projectId}`
      if (!container.Mounts?.some((mount) => mount.Type === 'volume' && mount.Name === expectedVolume)) {
        throw new Error('La base aislada no utiliza el volumen esperado.')
      }
    }
  }

  if (isolatedPhase2c2) {
    const installedDefinition = execFileSync('docker', ['exec', databaseContainerName, 'psql',
      '-U', 'postgres', '-d', 'postgres', '-Atc',
      "select pg_get_functiondef('public.record_distribution_delivery_outcome(jsonb)'::regprocedure)",
    ], { encoding: 'utf8' })
    if (!installedDefinition.includes('DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED')
      || !installedDefinition.includes('pg_advisory_xact_lock')
      || !installedDefinition.includes('distribution_delivery_outcomes_operation_key')) {
      throw new Error('La instancia aislada no contiene la corrección SQL de idempotencia 2C-2.')
    }
  }

  const organizations = JSON.parse(execFileSync('docker', ['exec', databaseContainerName, 'psql',
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

export async function operationalFixture(page: Page, target: OperationalTarget = 'persistent-silsan') {
  const organizationId = assertSilsanInstance(target)
  if (target !== 'persistent-silsan') {
    const isolatedApi = target === 'isolated-phase2c2' ? 'http://127.0.0.1:58121' : env('E2E_ACCESSORY_API_URL')
    const isolatedWeb = target === 'isolated-phase2c2' ? 'http://127.0.0.1:5173' : env('E2E_ACCESSORY_WEB_URL')
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (['54321', '54322'].includes(url.port)
        || ((url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/functions/v1/') || url.pathname.startsWith('/storage/v1/'))
          && url.origin !== isolatedApi)
        || (/^https?:$/.test(url.protocol) && ![isolatedWeb, isolatedApi].includes(url.origin))) {
        await route.abort('blockedbyclient')
        throw new Error(`Destino Supabase prohibido: ${url.origin}`)
      }
      await route.fallback()
    })
    await contextWebsocketGuard(page, isolatedWeb)
  }
  await page.goto('/iniciar-sesion')
  if (target !== 'persistent-silsan') {
    const clientModule = await page.request.get('/src/lib/supabase.ts')
    expect(await clientModule.text()).toContain(target === 'isolated-phase2c2' ? 'http://127.0.0.1:58121' : env('E2E_ACCESSORY_API_URL'))
    expect(await clientModule.text()).not.toContain('http://127.0.0.1:54321')
  }
  await page.getByLabel('Correo').fill(env('E2E_ADMIN_EMAIL'))
  await page.getByLabel('Contraseña').fill(env('E2E_ADMIN_PASSWORD'))
  const authentication = page.waitForResponse('**/auth/v1/token?grant_type=password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  const session = await (await authentication).json() as { access_token: string; user: { id: string; email?: string } }
  if (target === 'isolated-phase2c2') {
    const expectedEmail = env('E2E_ADMIN_EMAIL')
    expect(expectedEmail).toMatch(/^(phase2c3\.runner|regression\.[0-9a-f]+\.admin)@example\.invalid$/)
    expect(session.user.email).toBe(expectedEmail)
  }
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

async function contextWebsocketGuard(page: Page, allowedWeb: string) {
  await page.context().routeWebSocket(/.*/, (socket) => {
    const address = new URL(socket.url())
    if (address.origin === allowedWeb.replace('http:', 'ws:')) socket.connectToServer()
    else socket.close()
  })
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
