// Visual repair-module check with in-memory fixtures; never loads .env or starts Supabase.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'silsanplex-repairs-ui-entry-'))
const artifactsRoot = path.join(frontend, 'playwright-report')
fs.mkdirSync(artifactsRoot, { recursive: true })
const artifactsDirectory = fs.mkdtempSync(path.join(artifactsRoot, 'reparaciones-ux-'))
const entryPath = path.join(entryDirectory, 'entry.tsx')
fs.writeFileSync(entryPath, `import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthContext } from '@/features/auth/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ReparacionesPage } from '@/app/paginas/ReparacionesPage';
import '@/index.css';
const user={id:'44444444-4444-4444-8444-444444444444',email:'fixture@example.invalid'};
const auth={user,session:{user},access:{organizationId:'11111111-1111-4111-8111-111111111111',organizationName:'Organización ficticia',roles:['PRUEBA'],permissions:[]},isAdmin:false,isLoading:false,sessionError:null,accessError:null,hasPermission:()=>true,signOut:async()=>{},reintentarAcceso:()=>{}};
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={auth as any}><MemoryRouter initialEntries={['/reparaciones']}><Routes><Route element={<AppLayout />}><Route path='/reparaciones' element={<ReparacionesPage />} /></Route></Routes></MemoryRouter></AuthContext.Provider>);
`)

const fixtureModules = new Map([
  ['@/modulos/reparaciones/estado/useReparaciones', '\0repair-ui-reparaciones'],
  ['@/modulos/reparaciones/estado/useReparacionOpciones', '\0repair-ui-opciones'],
  ['@/modulos/reparaciones/estado/useReparacionDetalle', '\0repair-ui-detalle'],
])

const fixtureCode = new Map([
  ['\0repair-ui-reparaciones', `
const reparaciones = Array.from({ length: 12 }, (_, index) => ({
  id: 'fixture-repair-' + index,
  organizationId: 'fixture-org',
  lockVersion: 1,
  codigo: 'REP-FX-' + String(index + 1).padStart(4, '0'),
  clienteNombreSnapshot: index === 0 ? 'Cliente de prueba con nombre extenso para validar el ajuste en tarjetas' : 'Cliente ficticio ' + (index + 1),
  clienteDocumentoSnapshot: 'DNI 00000000',
  productoCodigoSnapshot: 'EQ-FX-' + String(index + 1).padStart(3, '0'),
  productoDescripcionSnapshot: index === 0 ? 'Equipo de demostración con descripción suficientemente larga para dos líneas' : 'Equipo ficticio ' + (index + 1),
  numeroSerie: 'SERIE-FX-' + index,
  estado: index % 2 ? 'diagnosis' : 'received',
  prioridad: index === 0 ? 'urgent' : 'normal',
  recibidaEn: '2026-10-15T12:00:00.000Z',
  fechaEntregaEstimada: '2026-11-20',
  finalizacionTecnica: null,
}))
window.__repairUiFixture = { createCalls: 0, resolveCreate: null }
export function useReparaciones({ pagina = 1 } = {}) {
  return {
    reparaciones: reparaciones.slice((pagina - 1) * 10, pagina * 10),
    totalFiltrado: reparaciones.length,
    resumen: { total: 12, abiertas: 9, esperandoAprobacion: 2, listasParaEntrega: 1 },
    cargando: false, error: null, cargandoResumen: false, errorResumen: null,
    recuperarCreacionPendiente: () => undefined,
    reintentar: async () => undefined,
    crear: async () => {
      window.__repairUiFixture.createCalls += 1
      return await new Promise((resolve) => { window.__repairUiFixture.resolveCreate = resolve })
    },
    actualizar: async () => undefined,
  }
}`],
  ['\0repair-ui-opciones', `export function useReparacionOpciones() {
  return { clientes: [], productos: [], almacenes: [], ubicaciones: [], cargando: false }
}
export function useTecnicosReparacion() { return { tecnicos: [], cargando: false, error: null } }`],
  ['\0repair-ui-detalle', `export function useReparacionDetalle() { return { detalle: undefined, cargando: false, error: null } }`],
])

const require = createRequire(path.join(frontend, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const { chromium, expect } = require('@playwright/test')
const server = await createServer({
  root: frontend,
  envDir: false,
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:1'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('fixture-no-credential'),
  },
  plugins: [{
    name: 'repairs-ui-isolated-fixtures',
    enforce: 'pre',
    resolveId(source) {
      const normalized = source.replaceAll('\\', '/')
      return [...fixtureModules].find(([alias]) =>
        normalized === alias || normalized.endsWith(alias.slice(1)) || normalized.endsWith(`${alias.slice(1)}.ts`),
      )?.[1]
    },
    load(id) { return fixtureCode.get(id) },
    configureServer(vite) {
      vite.middlewares.use('/__repairs_ui_fixture', async (_request, response, next) => {
        try {
          const html = await vite.transformIndexHtml(
            '/__repairs_ui_fixture',
            '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/' + entryPath.replaceAll('\\', '/') + '"></script></body></html>',
          )
          response.setHeader('Content-Type', 'text/html')
          response.end(html)
        } catch (error) {
          next(error)
        }
      })
    },
  }],
  server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [frontend, entryDirectory] } },
})

let browser
const results = []
const blockedRequests = []
const pageErrors = []
try {
  await server.listen()
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('No se pudo obtener el puerto local de Vite.')
  const origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true })

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1600, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: true })
    const page = await context.newPage()
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin === origin) return route.continue()
      blockedRequests.push(url.origin)
      return route.abort()
    })
    await page.goto(`${origin}/__repairs_ui_fixture`)
    await expect(page.getByRole('heading', { level: 1, name: 'Reparaciones' })).toBeVisible()

    const cardLayout = viewport.width < 1536
    const touchLayout = viewport.width < 1024
    if (cardLayout) {
      await expect(page.locator('.ledger-sheet article').first()).toBeVisible()
      await expect(page.getByRole('table')).toBeHidden()
    } else {
      await expect(page.getByRole('table')).toBeVisible()
    }

    const pageLayout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    if (pageLayout.scrollWidth > pageLayout.width) throw new Error(`Desbordamiento de página en ${viewport.width}px.`)

    if (touchLayout) {
      const undersizedFields = await page.locator('[data-reparaciones-touch-target] .field-control:visible').evaluateAll((fields) =>
        fields.map((field) => ({ height: field.getBoundingClientRect().height, label: field.getAttribute('aria-label') || field.getAttribute('id') }))
          .filter((field) => field.height < 44),
      )
      if (undersizedFields.length) throw new Error(`Campos táctiles menores de 44px en ${viewport.width}px: ${JSON.stringify(undersizedFields)}`)
      const undersizedButtons = await page.locator('[data-reparaciones-touch-target] button:visible').evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect()
          return { width: rect.width, height: rect.height, label: button.getAttribute('aria-label') || button.textContent?.trim() }
        }).filter((button) => button.width < 44 || button.height < 44),
      )
      if (undersizedButtons.length) throw new Error(`Botones táctiles menores de 44px en ${viewport.width}px: ${JSON.stringify(undersizedButtons)}`)
    }

    const search = page.getByRole('searchbox', { name: 'Buscar reparación' })
    await search.focus()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Estado')).toBeFocused()
    const focusIndicator = await page.getByLabel('Estado').evaluate((element) => {
      const style = getComputedStyle(element)
      return style.outlineStyle !== 'none' && style.outlineWidth !== '0px' || style.boxShadow !== 'none'
    })
    if (!focusIndicator) throw new Error(`El foco de teclado no es visible en ${viewport.width}px.`)
    const listName = `${viewport.width}x${viewport.height}-listado.png`
    await page.screenshot({ path: path.join(artifactsDirectory, listName), fullPage: true })

    await page.getByRole('button', { name: 'Registrar reparación' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Registrar reparación' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Solicitante *').selectOption('internal')
    await dialog.getByLabel('Área solicitante *').fill('Área de pruebas ficticia')
    await dialog.getByLabel('Identificación del equipo *').selectOption('external')
    await dialog.getByLabel('Equipo recibido *').fill('Equipo ficticio para prueba visual')
    await dialog.getByLabel('Problema reportado *').fill('Falla ficticia usada para validar la conservación del formulario.')

    const submit = dialog.getByRole('button', { name: 'Registrar reparación' })
    await submit.click()
    await page.waitForFunction(() => window.__repairUiFixture.createCalls === 1)
    await expect(submit).toBeDisabled()
    await submit.evaluate((button) => button.click())
    const callsBeforeResolve = await page.evaluate(() => window.__repairUiFixture.createCalls)
    await page.evaluate(() => window.__repairUiFixture.resolveCreate('No se pudo guardar la orden. Vuelve a intentarlo.'))
    await expect(dialog.getByRole('alert')).toContainText('Vuelve a intentarlo')
    await expect(dialog.getByLabel('Área solicitante *')).toHaveValue('Área de pruebas ficticia')
    await expect(dialog.getByLabel('Equipo recibido *')).toHaveValue('Equipo ficticio para prueba visual')
    await expect(dialog.getByLabel('Problema reportado *')).toHaveValue('Falla ficticia usada para validar la conservación del formulario.')
    if (callsBeforeResolve !== 1) throw new Error('Un envío bloqueado produjo una segunda operación.')

    const dialogBounds = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    })
    if (dialogBounds.left < 0 || dialogBounds.right > viewport.width || dialogBounds.top < 0 || dialogBounds.bottom > viewport.height) {
      throw new Error(`El formulario queda recortado en ${viewport.width}px: ${JSON.stringify(dialogBounds)}`)
    }
    const dialogUndersized = await dialog.locator('button:visible').evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect()
        return { width: rect.width, height: rect.height, label: button.getAttribute('aria-label') || button.textContent?.trim() }
      }).filter((button) => button.width < 44 || button.height < 44),
    )
    const dialogFieldsUndersized = await dialog.locator('.field-control:visible').evaluateAll((fields) =>
      fields.map((field) => ({ height: field.getBoundingClientRect().height, label: field.getAttribute('aria-label') || field.getAttribute('id') }))
        .filter((field) => field.height < 44),
    )
    if (dialogFieldsUndersized.length && touchLayout) throw new Error(`Campo de formulario menor de 44px en ${viewport.width}px: ${JSON.stringify(dialogFieldsUndersized)}`)
    if (dialogUndersized.length && touchLayout) {
      const touchScope = await dialog.evaluate((element) => ({
        attribute: element.hasAttribute('data-reparaciones-touch-target'),
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        selectorMatches: Boolean(element.querySelector('button')?.closest('[data-reparaciones-touch-target]')),
        buttonMinHeight: getComputedStyle(element.querySelector('button')).minHeight,
      }))
      throw new Error(`Botón de formulario menor de 44px en ${viewport.width}px: ${JSON.stringify({ dialogUndersized, touchScope })}`)
    }

    const formName = `${viewport.width}x${viewport.height}-recepcion.png`
    await page.screenshot({ path: path.join(artifactsDirectory, formName), fullPage: true })
    results.push({ viewport, layout: cardLayout ? 'cards' : 'table', pageOverflow: false, touchTargets: touchLayout ? '44px+' : 'not required for mouse-first desktop', keyboard: true, recoverableErrorKeepsData: true, duplicateSubmit: false })
    await context.close()
  }

  if (blockedRequests.length) throw new Error(`Se intentaron solicitudes fuera del entorno local: ${JSON.stringify(blockedRequests)}`)
  if (pageErrors.length) throw new Error(`Errores de navegador: ${JSON.stringify(pageErrors)}`)
  fs.writeFileSync(path.join(artifactsDirectory, 'results.json'), JSON.stringify({ results, blockedRequests, pageErrors }, null, 2))
  console.log(JSON.stringify({ results, blockedRequests, pageErrors, artifactsDirectory }, null, 2))
} finally {
  try {
    if (browser) await browser.close()
  } finally {
    try {
      await server.close()
    } finally {
      fs.rmSync(entryDirectory, { recursive: true, force: true })
    }
  }
}
