import { randomInt } from 'node:crypto'
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

function uniqueRuc() {
  return `20${randomInt(10_000_000, 100_000_000)}1`
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

test('registra y edita un cliente con varias direcciones y una principal', async ({ page }) => {
  const documentNumber = uniqueRuc()
  const legalName = `CLIENTE E2E DIRECCIONES ${documentNumber}`

  await signIn(page)
  await page.goto('/clientes')
  await page.getByRole('button', { name: 'Registrar cliente' }).click()
  const dialog = page.getByRole('dialog', { name: 'Registrar cliente' })

  await dialog.getByLabel('Número de documento *').fill(documentNumber)
  await dialog.getByLabel('Nombre o razón social *').fill(legalName)
  await dialog.getByRole('button', { name: 'Agregar' }).click()
  const firstAddress = dialog.locator('[data-address-index="0"]')
  await firstAddress.getByLabel('Etiqueta').fill('Almacén principal')
  await firstAddress.getByLabel('Ubigeo').fill('150101')
  await firstAddress.getByLabel('Dirección *').fill('Av. Principal 100')
  await firstAddress.getByLabel('Referencia').fill('Puerta azul')

  await dialog.getByRole('button', { name: 'Agregar' }).click()
  const secondAddress = dialog.locator('[data-address-index="1"]')
  await secondAddress.getByLabel('Etiqueta').fill('Almacén secundario')
  await secondAddress.getByLabel('Ubigeo').fill('150102')
  await secondAddress.getByLabel('Dirección *').fill('Jr. Secundario 200')
  await secondAddress.getByLabel('Referencia').fill('Ingreso lateral')
  await secondAddress.getByLabel('Dirección principal').check()

  await expect(firstAddress.getByLabel('Dirección principal')).not.toBeChecked()
  await expect(secondAddress.getByLabel('Dirección principal')).toBeChecked()
  await dialog.getByRole('button', { name: 'Registrar cliente' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('searchbox', { name: 'Buscar' }).fill(documentNumber)
  await expect(page.getByText(legalName)).toBeVisible()
  await page.getByRole('button', { name: `Editar ${legalName}` }).click()
  const editDialog = page.getByRole('dialog', { name: 'Editar cliente' })
  const persistedSecondAddress = editDialog.locator('[data-address-index="1"]')
  await editDialog.getByRole('button', { name: 'Almacén secundario' }).click()
  await expect(persistedSecondAddress.getByLabel('Dirección *')).toHaveValue('Jr. Secundario 200')
  await expect(persistedSecondAddress.getByLabel('Dirección principal')).toBeChecked()
  await editDialog.getByLabel('Nombre comercial').fill('Cliente E2E actualizado')
  await editDialog.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(editDialog).toBeHidden()
  await expect(page.getByText('Cliente E2E actualizado')).toBeVisible()
})

test('muestra los errores de cliente y mantiene abierta la dirección inválida', async ({ page }) => {
  await signIn(page)
  await page.goto('/clientes')
  await page.getByRole('button', { name: 'Registrar cliente' }).click()
  const dialog = page.getByRole('dialog', { name: 'Registrar cliente' })

  await dialog.getByLabel('Número de documento *').fill(uniqueRuc())
  await dialog.getByRole('button', { name: 'Agregar' }).click()
  await dialog.getByRole('button', { name: 'Registrar cliente' }).click()

  await expect(dialog.getByText('Ingresa el nombre o razón social')).toBeVisible()
  await expect(dialog.getByText('Ingresa la dirección', { exact: true })).toBeVisible()
  await expect(dialog.locator('[data-address-index="0"] > button')).toHaveAttribute('aria-expanded', 'true')
  await expect(dialog.getByRole('button', { name: 'Registrar cliente' })).toBeEnabled()
})

test('previsualiza e importa clientes desde un archivo de Codeplex', async ({ page }) => {
  const uniqueDocument = uniqueRuc()
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
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(uniqueDocument)
  await expect(page.getByText(uniqueName)).toBeVisible()
})

test('rechaza un archivo de clientes sin columnas obligatorias', async ({ page }) => {
  await signIn(page)
  await page.goto('/clientes')
  await page.getByRole('button', { name: 'Importar' }).click()
  const importDialog = page.getByRole('dialog', { name: 'Importar clientes' })
  const mode = importDialog.getByLabel('Si el documento ya existe')
  await expect(importDialog.getByText('Las filas existentes se omiten y no se modifican.')).toBeVisible()
  await mode.selectOption('UPDATE')
  await expect(importDialog.getByText('Solo se actualizan los datos presentes; los campos vacíos conservan su valor.')).toBeVisible()
  await mode.selectOption('SKIP')

  await importDialog.locator('input[type="file"]').setInputFiles({
    name: 'archivo-incompleto.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('TELEFONO,CORREO\n999888111,cliente@example.com'),
  })

  await expect(importDialog.getByRole('alert')).toHaveText(
    'El archivo debe incluir las columnas RUC_DNI (o documento) y RAZON_SOCIAL (o cliente).',
  )
  await expect(importDialog.getByRole('button', { name: /Importar/ })).toBeDisabled()
})
