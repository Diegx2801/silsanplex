import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { loadSupabaseEnvironment } from './lib/supabase-environment.ts'
import { findUserByEmail, requiredEnvironment } from './lib/provisioning.ts'

type E2eIdentity = {
  email: string
  password: string
  fullName: string
  roleCodes: string[]
}

type InventoryE2eFixture = {
  productCode: string
  productDescription: string
  sourceWarehouseCode: string
  sourceWarehouseName: string
  destinationWarehouseCode: string
  destinationWarehouseName: string
  transferReference: string
}

config({ path: '.env.local', quiet: true })
config({ path: resolve(process.cwd(), '..', 'frontend', '.env.local'), quiet: true })

function assertStrictlyLocalSupabase(url: string) {
  const parsedUrl = new URL(url)
  const isLocalHost = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(
    parsedUrl.hostname,
  )

  if (parsedUrl.protocol !== 'http:' || !isLocalHost || parsedUrl.port !== '54321') {
    throw new Error(
      'e2e:prepare solo admite Supabase local por HTTP en localhost:54321.',
    )
  }
}

function loadIdentity(
  prefix: 'E2E_ADMIN' | 'E2E_MEMBER' | 'E2E_RECOVERY' | 'E2E_REPAIRS',
  fullName: string,
  roleCodes: string[],
): E2eIdentity {
  const defaultEmails = {
    E2E_ADMIN: 'e2e.admin@silsan.local',
    E2E_MEMBER: 'e2e.ventas@silsan.local',
    E2E_RECOVERY: 'e2e.recuperacion@silsan.local',
    E2E_REPAIRS: 'e2e.reparaciones@silsan.local',
  } as const
  const email = (process.env[`${prefix}_EMAIL`]?.trim() || defaultEmails[prefix]).toLowerCase()
  const password = process.env[`${prefix}_PASSWORD`]?.trim() || randomBytes(24).toString('base64url')

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error(`${prefix}_EMAIL no es válido.`)
  }
  if (password.length < 8) {
    throw new Error(`${prefix}_PASSWORD debe tener al menos 8 caracteres.`)
  }

  return { email, password, fullName, roleCodes }
}

async function upsertAuthIdentity(
  admin: SupabaseClient,
  identity: E2eIdentity,
): Promise<User> {
  const existingUser = await findUserByEmail(admin, identity.email)

  if (existingUser) {
    const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
      password: identity.password,
      email_confirm: true,
      user_metadata: { full_name: identity.fullName, phone: null },
    })
    if (error || !data.user) {
      throw new Error(error?.message || 'No se pudo actualizar una identidad E2E.')
    }
    return data.user
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: identity.email,
    password: identity.password,
    email_confirm: true,
    user_metadata: { full_name: identity.fullName, phone: null },
  })
  if (error || !data.user) {
    throw new Error(error?.message || 'No se pudo crear una identidad E2E.')
  }
  return data.user
}

async function assignFixtureMembership(
  admin: SupabaseClient,
  organizationId: string,
  user: User,
  roleCodes: string[],
) {
  const { data: memberships, error: membershipReadError } = await admin
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)

  if (membershipReadError) throw membershipReadError
  if ((memberships ?? []).some((membership) => membership.organization_id !== organizationId)) {
    throw new Error(
      `La identidad E2E ${user.email ?? user.id} ya pertenece a otra organización local.`,
    )
  }

  const { error: membershipError } = await admin
    .from('organization_memberships')
    .upsert(
      {
        organization_id: organizationId,
        user_id: user.id,
        is_active: true,
        deactivated_at: null,
      },
      { onConflict: 'organization_id,user_id' },
    )
  if (membershipError) throw membershipError

  const { error: deleteRolesError } = await admin
    .from('user_roles')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
  if (deleteRolesError) throw deleteRolesError

  const { error: rolesError } = await admin.from('user_roles').insert(
    roleCodes.map((roleCode) => ({
      organization_id: organizationId,
      user_id: user.id,
      role_code: roleCode,
      assigned_by: null,
    })),
  )
  if (rolesError) throw rolesError
}

function writePlaywrightEnvironment(
  admin: E2eIdentity,
  member: E2eIdentity,
  recovery: E2eIdentity,
  inventory: InventoryE2eFixture,
  repairs: E2eIdentity,
) {
  const target = resolve(process.cwd(), '..', 'frontend', '.env.e2e.local')
  const contents = [
    '# Generado por backend/npm run e2e:prepare. No versionar.',
    `E2E_ADMIN_EMAIL=${JSON.stringify(admin.email)}`,
    `E2E_ADMIN_PASSWORD=${JSON.stringify(admin.password)}`,
    `E2E_MEMBER_EMAIL=${JSON.stringify(member.email)}`,
    `E2E_MEMBER_PASSWORD=${JSON.stringify(member.password)}`,
    `E2E_RECOVERY_EMAIL=${JSON.stringify(recovery.email)}`,
    `E2E_RECOVERY_PASSWORD=${JSON.stringify(recovery.password)}`,
    `E2E_REPAIRS_EMAIL=${JSON.stringify(repairs.email)}`,
    `E2E_REPAIRS_PASSWORD=${JSON.stringify(repairs.password)}`,
    `E2E_INVENTORY_PRODUCT_CODE=${JSON.stringify(inventory.productCode)}`,
    `E2E_INVENTORY_PRODUCT_DESCRIPTION=${JSON.stringify(inventory.productDescription)}`,
    `E2E_INVENTORY_SOURCE_WAREHOUSE_CODE=${JSON.stringify(inventory.sourceWarehouseCode)}`,
    `E2E_INVENTORY_SOURCE_WAREHOUSE_NAME=${JSON.stringify(inventory.sourceWarehouseName)}`,
    `E2E_INVENTORY_DESTINATION_WAREHOUSE_CODE=${JSON.stringify(inventory.destinationWarehouseCode)}`,
    `E2E_INVENTORY_DESTINATION_WAREHOUSE_NAME=${JSON.stringify(inventory.destinationWarehouseName)}`,
    `E2E_INVENTORY_TRANSFER_REFERENCE=${JSON.stringify(inventory.transferReference)}`,
    '',
  ].join('\n')

  writeFileSync(target, contents, { encoding: 'utf8', mode: 0o600 })
}

function futureDate(monthsAhead: number) {
  const date = new Date()
  date.setUTCDate(15)
  date.setUTCMonth(date.getUTCMonth() + monthsAhead)
  return date.toISOString().slice(0, 10)
}

async function createInventoryFixture(
  admin: SupabaseClient,
  organizationId: string,
  actorId: string,
): Promise<InventoryE2eFixture> {
  const suffix = `${Date.now()}`.slice(-10)
  const productCode = `E2E-FEFO-${suffix}`
  const productDescription = `Producto control E2E FEFO ${suffix}`
  const sourceWarehouseCode = `E2O-${suffix.slice(-8)}`
  const destinationWarehouseCode = `E2D-${suffix.slice(-8)}`
  const sourceWarehouseName = `E2E Origen ${suffix}`
  const destinationWarehouseName = `E2E Destino ${suffix}`

  const { data: product, error: productError } = await admin
    .from('products')
    .insert({
      organization_id: organizationId,
      code: productCode,
      description: productDescription,
      unit_of_measure: 'UND',
      batch_control: true,
      expiration_control: true,
      cost: 10,
      sale_price: 25,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('id')
    .single()
  if (productError || !product) throw productError ?? new Error('No se creó el producto E2E.')

  const { data: warehouses, error: warehousesError } = await admin
    .from('warehouses')
    .insert([
      {
        organization_id: organizationId,
        code: sourceWarehouseCode,
        name: sourceWarehouseName,
        address: 'Fixture E2E FEFO',
        created_by: actorId,
        updated_by: actorId,
      },
      {
        organization_id: organizationId,
        code: destinationWarehouseCode,
        name: destinationWarehouseName,
        address: 'Fixture E2E FEFO',
        created_by: actorId,
        updated_by: actorId,
      },
    ])
    .select('id,code')
  if (warehousesError || warehouses?.length !== 2) {
    throw warehousesError ?? new Error('No se crearon los almacenes E2E.')
  }
  const sourceWarehouse = warehouses.find((warehouse) => warehouse.code === sourceWarehouseCode)
  const destinationWarehouse = warehouses.find((warehouse) => warehouse.code === destinationWarehouseCode)
  if (!sourceWarehouse || !destinationWarehouse) throw new Error('Almacenes E2E incompletos.')

  const { data: locations, error: locationsError } = await admin
    .from('warehouse_locations')
    .insert([
      {
        organization_id: organizationId,
        warehouse_id: sourceWarehouse.id,
        code: 'A-01',
        name: 'Anaquel origen E2E',
        created_by: actorId,
        updated_by: actorId,
      },
      {
        organization_id: organizationId,
        warehouse_id: destinationWarehouse.id,
        code: 'B-01',
        name: 'Anaquel destino E2E',
        created_by: actorId,
        updated_by: actorId,
      },
    ])
    .select('id,warehouse_id')
  if (locationsError || locations?.length !== 2) {
    throw locationsError ?? new Error('No se crearon las ubicaciones E2E.')
  }
  const sourceLocation = locations.find((location) => location.warehouse_id === sourceWarehouse.id)
  if (!sourceLocation) throw new Error('Ubicación origen E2E incompleta.')

  const operationDate = new Date().toISOString().slice(0, 10)
  const movementResults = await Promise.all([
    { lot: 'LOTE-E2E-A', quantity: 3, unit_cost: 10, expiration_date: futureDate(12) },
    { lot: 'LOTE-E2E-B', quantity: 6, unit_cost: 20, expiration_date: futureDate(13) },
    { lot: 'LOTE-E2E-C', quantity: 4, unit_cost: 30, expiration_date: futureDate(14) },
  ].map((lot) => admin.rpc('record_inventory_movement', {
    payload: {
      organization_id: organizationId,
      product_id: product.id,
      movement_type: 'entrada',
      quantity: lot.quantity,
      warehouse_id: sourceWarehouse.id,
      location_id: sourceLocation.id,
      stock_status: 'available',
      unit_cost: lot.unit_cost,
      lot: lot.lot,
      expiration_date: lot.expiration_date,
      operation_date: operationDate,
      reason: `Preparación E2E FEFO ${lot.lot}`,
    },
  })))
  const failedMovement = movementResults.find((result) => result.error)
  if (failedMovement?.error) throw failedMovement.error

  return {
    productCode,
    productDescription,
    sourceWarehouseCode,
    sourceWarehouseName,
    destinationWarehouseCode,
    destinationWarehouseName,
    transferReference: `TR-${suffix}`,
  }
}

async function prepareRepairCatalogFixture(
  admin: SupabaseClient,
  organizationId: string,
  actorId: string,
) {
  const customers = Array.from({ length: 1001 }, (_, offset) => {
    const index = offset + 1
    const suffix = index.toString().padStart(4, '0')
    return {
      id: `e0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
      organization_id: organizationId,
      document_type: 'OTHER',
      document_number: `E2ECAT${suffix}`,
      legal_name: `ZZZZ E2E Cliente catálogo ${suffix}`,
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    }
  })
  const products = Array.from({ length: 1001 }, (_, offset) => {
    const index = offset + 1
    const suffix = index.toString().padStart(4, '0')
    return {
      id: `f0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
      organization_id: organizationId,
      code: `E2ECAT${suffix}`,
      description: `ZZZZ E2E Producto catálogo ${suffix}`,
      unit_of_measure: 'UND',
      batch_control: false,
      expiration_control: false,
      serial_control: false,
      sale_price: 10,
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    }
  })
  for (let inicio = 0; inicio < customers.length; inicio += 250) {
    const { error: customersError } = await admin.from('customers')
      .upsert(customers.slice(inicio, inicio + 250), { onConflict: 'id' })
    if (customersError) throw customersError
    const { error: productsError } = await admin.from('products')
      .upsert(products.slice(inicio, inicio + 250), { onConflict: 'id' })
    if (productsError) throw productsError
  }
}

async function prepareLocalE2e() {
  const { url, secretKey } = loadSupabaseEnvironment()
  assertStrictlyLocalSupabase(url)

  const adminIdentity = loadIdentity('E2E_ADMIN', 'Administrador E2E', ['ADMIN'])
  const memberIdentity = loadIdentity('E2E_MEMBER', 'Miembro de Ventas E2E', ['VENTAS'])
  const repairsIdentity = loadIdentity('E2E_REPAIRS', 'Técnico Reparaciones E2E', ['ADMIN'])
  const recoveryIdentity = loadIdentity(
    'E2E_RECOVERY',
    'Usuario de Recuperación E2E',
    ['VENTAS'],
  )
  if (
    new Set([
      adminIdentity.email,
      memberIdentity.email,
      recoveryIdentity.email,
      repairsIdentity.email,
    ]).size !== 4
  ) {
    throw new Error('Las identidades E2E deben utilizar correos diferentes.')
  }

  const organizationSlug = process.env.INITIAL_ORGANIZATION_SLUG?.trim() || 'drogueria-silsan'
  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', organizationSlug)
    .eq('is_active', true)
    .maybeSingle()
  if (organizationError) throw organizationError
  if (!organization) {
    throw new Error(`No existe la organización local activa ${organizationSlug}.`)
  }

  const adminUser = await upsertAuthIdentity(supabase, adminIdentity)
  const memberUser = await upsertAuthIdentity(supabase, memberIdentity)
  const recoveryUser = await upsertAuthIdentity(supabase, recoveryIdentity)
  const repairsUser = await upsertAuthIdentity(supabase, repairsIdentity)
  await assignFixtureMembership(supabase, organization.id, repairsUser, repairsIdentity.roleCodes)

  await assignFixtureMembership(
    supabase,
    organization.id,
    adminUser,
    adminIdentity.roleCodes,
  )
  await assignFixtureMembership(
    supabase,
    organization.id,
    memberUser,
    memberIdentity.roleCodes,
  )
  await assignFixtureMembership(
    supabase,
    organization.id,
    recoveryUser,
    recoveryIdentity.roleCodes,
  )
  await prepareRepairCatalogFixture(supabase, organization.id, repairsUser.id)

  const publishableKey = requiredEnvironment('VITE_SUPABASE_PUBLISHABLE_KEY')
  const inventoryClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await inventoryClient.auth.signInWithPassword({
    email: adminIdentity.email,
    password: adminIdentity.password,
  })
  if (signInError) throw signInError
  const inventoryFixture = await createInventoryFixture(
    inventoryClient,
    organization.id,
    adminUser.id,
  )
  writePlaywrightEnvironment(
    adminIdentity,
    memberIdentity,
    recoveryIdentity,
    inventoryFixture,
    repairsIdentity,
  )

  console.info('Usuarios E2E locales preparados y frontend/.env.e2e.local actualizado.')
  console.info('No se enviaron correos ni se mostraron contraseñas.')
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }

  try {
    return JSON.stringify(error)
  } catch {
    return 'Error desconocido'
  }
}

prepareLocalE2e().catch((error: unknown) => {
  console.error(
    `No se pudo preparar E2E local: ${describeError(error)}`,
  )
  process.exitCode = 1
})
