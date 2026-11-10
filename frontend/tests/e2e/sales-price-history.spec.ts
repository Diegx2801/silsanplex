import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect } from '@playwright/test'
import { test } from './fixtures/test.js'
import { checked, operationalFixture, selectRemote } from './fixtures/operational.js'

// This suite writes only to the identity-checked disposable project made by
// test-repair-accessories.mjs. Never run against the user's local databases.
test('historial real: ventas, cliente, consulta y aplicación voluntaria; JWT revocado', async ({ page, request }, testInfo) => {
  test.setTimeout(150_000)
  expect(process.env.SILSAN_ACCESSORY_CI_E2E).toBe('1')
  const f = await operationalFixture(page, 'isolated-accessory-ci')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
  await checked(f.api.rpc('record_inventory_movement', { payload: {
    organization_id: f.organizationId, product_id: f.productId, warehouse_id: f.warehouseId,
    location_id: f.locationId, movement_type: 'entrada', quantity: 30, unit_cost: 10,
    stock_status: 'available', lot: f.lot, expiration_date: f.expiration, operation_date: today,
    reason: 'Historial de precios, entorno desechable', document_reference: f.reference,
  } }))
  const history = () => checked(f.api.rpc('get_customer_sale_price_history', {
    requested_organization_id: f.organizationId, requested_customer_id: f.customerId, requested_product_id: f.productId,
  })) as Promise<Array<{ unit_price: number; sale_id: string }>>
  expect(await history()).toEqual([])
  const sell = async (price: number) => {
    const order = await checked(f.api.rpc('create_order_with_fulfillment', { payload: {
      organization_id: f.organizationId, operation_key: randomUUID(), customer_id: f.customerId,
      warehouse_id: f.warehouseId, order_date: today, prices_include_tax: true, fulfillment_mode: 'pickup',
      items: [{ product_id: f.productId, quantity: 2, unit_price: price }],
    } }))
    return await checked(f.api.rpc('create_sale_from_order', {
      requested_organization_id: f.organizationId, requested_order_id: order,
      payload: { operation_key: randomUUID(), document_type: 'nota-venta', series: 'HIST',
        document_number: randomUUID().slice(0, 18), sale_date: today, warehouse: f.name },
    }))
  }
  await sell(11.8)
  const lastSale = await sell(17.7)
  expect((await history()).map(r => Number(r.unit_price))).toEqual([17.7, 11.8])

  await page.goto('/ventas')
  await page.getByRole('button', { name: 'Nueva cotización' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva cotización' })
  await selectRemote(dialog, 'Cliente', f.reference)
  await selectRemote(dialog, 'Producto 1', f.reference)
  await expect(dialog.getByText(/Último precio vendido:/)).toContainText('17.7000')
  const price = dialog.getByLabel('Precio unitario del producto 1', { exact: true })
  await expect(price).toHaveValue('25')
  await price.fill('29')
  await dialog.getByRole('button', { name: 'Ver historial completo' }).click()
  const detail = dialog.getByRole('region', { name: 'Historial de precios de venta' })
  await expect(detail.getByRole('row')).toHaveCount(3)
  await expect(price).toHaveValue('29')
  await dialog.getByRole('button', { name: 'Utilizar último precio' }).click()
  await expect(price).toHaveValue('17.7')
  await dialog.getByLabel('Precios incluyen IGV').uncheck()
  await expect(dialog.getByRole('button', { name: 'Utilizar último precio' })).toBeDisabled()
  await expect(price).toHaveValue('17.7')
  await dialog.getByRole('button', { name: 'Cerrar cotización' }).click()

  await page.goto('/clientes')
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(f.reference)
  const row = page.getByRole('row').filter({ hasText: f.name })
  await row.getByRole('button', { name: /detalle/i }).click()
  const customer = page.getByRole('dialog', { name: 'Detalle del cliente' })
  await expect(customer.getByRole('heading', { name: 'Cotizaciones', exact: true })).toBeVisible()
  const customerHistory = customer.getByRole('region', { name: 'Historial de precios de venta' })
  await customerHistory.getByLabel('Buscar producto').fill(f.reference)
  await expect(customerHistory.getByRole('row')).toHaveCount(3)
  await testInfo.attach('historial-cliente', { body: await page.screenshot(), contentType: 'image/png' })
  await customer.getByRole('button', { name: 'Cerrar detalle del cliente' }).click()
  await sell(19.99)
  expect(Number((await history())[0].unit_price)).toBe(19.99)
  expect((await history())[1].sale_id).toBe(lastSale)
  await page.goto('/ventas')
  await page.getByRole('button', { name: 'Nueva cotización' }).click()
  await selectRemote(dialog, 'Cliente', f.reference)
  await selectRemote(dialog, 'Producto 1', f.reference)
  await expect(dialog.getByText(/Último precio vendido:/)).toContainText('19.9900')

  // A fresh real member JWT, re-used verbatim after server-side logout.
  const url = process.env.VITE_SUPABASE_URL!
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
  const actor = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const login = await actor.auth.signInWithPassword({ email: process.env.E2E_MEMBER_EMAIL!, password: process.env.E2E_MEMBER_PASSWORD! })
  expect(login.error).toBeNull()
  const jwt = login.data.session!.access_token
  const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as { exp: number }
  expect(claims.exp).toBeGreaterThan(Date.now() / 1000)
  const query = () => request.post(url + '/rest/v1/rpc/get_customer_sale_price_history', {
    headers: { apikey: anon, Authorization: 'Bearer ' + jwt },
    data: { requested_organization_id: f.organizationId, requested_customer_id: f.customerId, requested_product_id: f.productId },
  })
  const before = await query()
  expect(before.status()).toBe(200)
  expect(await before.json()).toHaveLength(3)
  expect((await actor.auth.signOut({ scope: 'local' })).error).toBeNull()
  const after = await query()
  expect(after.status()).toBe(403)
  expect(await after.json()).toMatchObject({ code: '42501', message: 'CUSTOMER_SALE_HISTORY_FORBIDDEN' })
  await testInfo.attach('jwt-revocado', { body: JSON.stringify({ before: before.status(), after: after.status(), tokenUnexpired: claims.exp > Date.now() / 1000 }), contentType: 'application/json' })
})
