import { expect, test } from '@playwright/test'

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} en el entorno E2E.`)
  return value
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo').fill(requiredEnvironment('E2E_ADMIN_EMAIL'))
  await page.getByLabel('Contraseña').fill(requiredEnvironment('E2E_ADMIN_PASSWORD'))
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(/\/$/, { timeout: 10_000 })
}

test('autocompleta el maestro de clientes mediante la Edge Function RUC', async ({ page }) => {
  await signIn(page)
  await page.route('**/functions/v1/ruc-lookup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          lookupId: '11111111-1111-4111-8111-111111111111',
          ruc: '20550154065',
          legalName: 'EMPRESA E2E S.A.C.',
          taxpayerStatus: 'ACTIVO',
          domicileCondition: 'HABIDO',
          ubigeoCode: '150140',
          fiscalAddress: 'AV. PRUEBA E2E 123',
          source: 'APISPERU',
          checkedAt: '2026-08-21T12:00:00.000Z',
          cacheHit: false,
        },
      }),
    })
  })

  await page.goto('/clientes')
  await page.getByRole('button', { name: 'Registrar cliente' }).click()
  await page.getByLabel('Número de documento *').fill('20550154065')
  await page.getByRole('button', { name: 'Consultar RUC' }).click()

  await expect(page.getByLabel('Nombre o razón social *')).toHaveValue('EMPRESA E2E S.A.C.')
  await expect(page.getByLabel('Dirección fiscal')).toHaveValue('AV. PRUEBA E2E 123')
  await expect(page.getByLabel('Ubigeo fiscal')).toHaveValue('150140')
  await expect(page.getByLabel('Condición de domicilio')).toHaveValue('HABIDO')
})
