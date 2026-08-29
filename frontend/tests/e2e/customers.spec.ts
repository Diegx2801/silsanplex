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
          source: 'DECOLECTA',
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

test('previsualiza e importa clientes desde un archivo de Codeplex', async ({ page }) => {
  const uniqueDocument = `20${String(Date.now()).slice(-8)}1`
  const uniqueName = `CLIENTE E2E IMPORTADO ${uniqueDocument}`
  await signIn(page)
  await page.goto('/clientes')
  await page.getByRole('button', { name: 'Importar' }).click()
  const importDialog = page.getByRole('dialog', { name: 'Importar clientes' })

  await importDialog.locator('input[type="file"]').setInputFiles({
    name: 'clientes-codeplex.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`RUC_DNI,RAZON_SOCIAL,NOMBRE_COMERCIAL,TELEFONO,DIRECCION,EMAIL\n${uniqueDocument},${uniqueName},IMPORTADO,999888111,AV. E2E 123,cliente.importado@example.com`),
  })

  await expect(importDialog.getByText(uniqueName)).toBeVisible()
  await importDialog.getByRole('button', { name: 'Importar 1 filas' }).click()
  await expect(importDialog.getByText(/Importación finalizada: 1 creados/)).toBeVisible()
  await importDialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByText(uniqueName)).toBeVisible()
})
