// Compras UI smoke test with fictitious in-memory fixtures; never loads .env or starts Supabase.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'silsanplex-compras-ui-'))
const entryPath = path.join(temporary, 'entry.tsx')
fs.writeFileSync(entryPath, `import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AuthContext } from '@/features/auth/AuthContext';
import { ComprasPage } from '@/app/paginas/ComprasPage';
import '@/index.css';
const user={id:'44444444-4444-4444-8444-444444444444',email:'fixture@example.invalid'};
const auth={user,session:{user},access:{organizationId:'11111111-1111-4111-8111-111111111111',organizationName:'Organización ficticia',roles:['PRUEBA'],permissions:[]},isAdmin:false,isLoading:false,sessionError:null,accessError:null,hasPermission:()=>true,signOut:async()=>{},reintentarAcceso:()=>{}};
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><AuthContext.Provider value={auth as any}><MemoryRouter><ComprasPage/></MemoryRouter></AuthContext.Provider></QueryClientProvider>);
`)

const fixtureIds = new Map([
  ['@/modulos/compras/estado/useCompras', '\0compras-ui-hook'],
  ['@/modulos/productos/estado/useProductos', '\0compras-ui-productos'],
  ['@/modulos/proveedores/servicios/proveedorService', '\0compras-ui-proveedores'],
  ['@/modulos/compras/servicios/compraService', '\0compras-ui-almacenes'],
  ['@/modulos/productos/servicios/productosService', '\0compras-ui-busqueda-productos'],
])

const fixtures = [
  ['\0compras-ui-hook', `
const compras = [
  { id:'draft-1', proveedorId:'provider-1', proveedorDocumento:'20123456789', proveedorNombre:'Proveedor ficticio con razón social extensa para revisar el ajuste de tarjetas móviles', tipoDocumento:'factura', serie:'F001', numero:'000001', fechaEmision:'2026-10-01', almacenId:'warehouse-1', almacen:'Almacén central', estado:'borrador', fechaRegistro:'2026-10-01T12:00:00.000Z', lineas:[{id:'item-draft', productoId:'product-1', productoCodigo:'SKU-001', productoDescripcion:'Producto de prueba', unidadMedida:'UND', cantidad:1, cantidadRecibida:0, cantidadPendiente:1}], total:999999999.99 },
  { id:'partial-1', proveedorId:'provider-1', proveedorDocumento:'20123456789', proveedorNombre:'Proveedor ficticio', tipoDocumento:'factura', serie:'F001', numero:'000002', fechaEmision:'2026-10-02', fechaVencimientoPago:'', fechaEntregaEsperada:'', almacenId:'warehouse-1', almacen:'Almacén central', preciosIncluyenIgv:true, observacion:'', estado:'parcialmente-recibida', fechaRegistro:'2026-10-02T12:00:00.000Z', fechaEmisionOrden:'2026-10-02T12:00:00.000Z', fechaRecepcion:null, lineas:[{id:'item-partial', productoId:'product-1', productoCodigo:'SKU-001', productoDescripcion:'Producto físico ficticio con descripción larga para la tarjeta de recepción', unidadMedida:'UND', controlLote:true, controlVencimiento:true, tipoProducto:'good', productoActivo:true, cantidad:6, cantidadRecibida:4, cantidadPendiente:2, costoUnitario:10, lote:'', fechaVencimiento:''}], total:60 },
  { id:'received-1', proveedorId:'provider-1', proveedorDocumento:'20123456789', proveedorNombre:'Proveedor ficticio', tipoDocumento:'factura', serie:'F001', numero:'000003', fechaEmision:'2026-10-03', estado:'recibida', fechaRegistro:'2026-10-03T12:00:00.000Z', lineas:[], total:25 },
]
window.__comprasUiFixture = { calls: { guardar:0, emitir:0, recibir:0, anular:0 }, resolveRecepcion:null }
export function useCompras() { return { compras, cargando:false, actualizando:false, error:null, reintentar:async()=>{}, accionando:false,
  guardarCompra:async()=>{ window.__comprasUiFixture.calls.guardar++; return undefined },
  emitirCompra:async()=>{ window.__comprasUiFixture.calls.emitir++; return undefined },
  recibirCompra:async()=>{ window.__comprasUiFixture.calls.recibir++; return await new Promise(resolve=>{ window.__comprasUiFixture.resolveRecepcion=resolve }) },
  anularCompra:async()=>{ window.__comprasUiFixture.calls.anular++; return undefined },
} }`],
  ['\0compras-ui-productos', `export function useProductos(){ return { productos:[{id:'product-1',codigo:'SKU-001',descripcion:'Producto ficticio',descripcionAmpliada:'',codigoBarras:'',categoria:'',sublinea:'',laboratorio:'',presentacion:'Caja',tipo:'good',unidadBaseId:'unit-1',unidadMedida:'UND',afectacionIgv:'gravado',precioVenta:'15',precioMinimo:'',stockMaximo:'',anchoCm:'',altoCm:'',largoCm:'',pesoKg:'',registroSanitario:'',controlLote:true,controlVencimiento:true,serialControl:false,ventaReceta:false,activo:true,unidadesAlternativas:[]} ]} }`],
  ['\0compras-ui-proveedores', `const proveedor={id:'provider-1',organizationId:'org-1',codigo:'PROV-001',tipoDocumento:'ruc',numeroDocumento:'20123456789',razonSocial:'Proveedor ficticio',nombreComercial:'Proveedor ficticio',contacto:'',cargoContacto:'',email:'',telefono:'',direccion:'',ubigeo:'',estadoContribuyente:'ACTIVO',condicionDomicilio:'HABIDO',fuenteDatosFiscales:'',fechaConsultaSunat:null,condicionCredito:'contado',diasCredito:0,observaciones:'',activo:true,fechaRegistro:'2026-10-01T00:00:00.000Z',fechaActualizacion:'2026-10-01T00:00:00.000Z'}; export async function listarProveedores(){return [proveedor]} export async function buscarProveedores(){return [proveedor]}`],
  ['\0compras-ui-almacenes', `const almacen={id:'warehouse-1',codigo:'CENTRAL',nombre:'Almacén central',direccion:'Av. Ficticia 123',activo:true}; const ubicacion={id:'location-1',almacenId:'warehouse-1',codigo:'GEN',nombre:'General',descripcion:'',activa:true}; export async function listarAlmacenesCompra(){return [almacen]} export async function buscarAlmacenesCompra(){return [almacen]} export async function listarUbicacionesCompra(){return [ubicacion]}`],
  ['\0compras-ui-busqueda-productos', `export async function buscarProductos(){return []}`],
]
const fixtureCode = new Map(fixtures)

const require = createRequire(path.join(frontend, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const { chromium, expect } = require('@playwright/test')
const server = await createServer({
  root: frontend,
  envDir: false,
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:1'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('fixture-sin-credencial'),
  },
  resolve: { dedupe: ['react', 'react-dom', 'react-router', '@tanstack/react-query'] },
  plugins: [{
    name: 'purchases-ui-isolated-fixtures',
    enforce: 'pre',
    resolveId(source) {
      const normalized = source.replaceAll('\\', '/')
      return [...fixtureIds].find(([alias]) => normalized === alias || normalized.endsWith(alias.slice(1)))?.[1]
    },
    load(id) { return fixtureCode.get(id) },
    configureServer(vite) {
      vite.middlewares.use('/__compras_ui_fixture', async (_request, response, next) => {
        try {
          const html = await vite.transformIndexHtml('/__compras_ui_fixture', '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/' + entryPath.replaceAll('\\', '/') + '"></script></body></html>')
          response.setHeader('Content-Type', 'text/html')
          response.end(html)
        } catch (error) { next(error) }
      })
    },
  }],
  server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [frontend, temporary] } },
})

let browser
const results = []
const externalRequests = []
const pageErrors = []
try {
  await server.listen()
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('No se pudo iniciar Vite en localhost.')
  const origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true })

  for (const viewport of [
    { width: 360, height: 800 }, { width: 390, height: 844 },
    { width: 768, height: 1024 }, { width: 1280, height: 720 },
    { width: 1440, height: 900 }, { width: 1600, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1024 })
    const page = await context.newPage()
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === origin) return route.continue()
      externalRequests.push(url.origin)
      return route.abort()
    })
    await page.goto(`${origin}/__compras_ui_fixture`)
    await expect(page.getByRole('heading', { level: 1, name: 'Compras' })).toBeVisible()
    const mobile = viewport.width < 768
    if (mobile) {
      await expect(page.locator('[aria-labelledby="compras-title"] .md\\:hidden article').first()).toBeVisible()
      await expect(page.locator('[aria-labelledby="compras-title"] .md\\:hidden article').filter({ hasText: 'F001-000001' }).getByRole('heading', { name: /Proveedor ficticio con razón social extensa/ })).toBeVisible()
      await expect(page.getByRole('table')).toBeHidden()
    } else {
      await expect(page.getByRole('table')).toBeVisible()
      await expect(page.getByRole('cell', { name: /Proveedor ficticio con razón social extensa/ })).toBeVisible()
    }
    const pageBounds = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))
    const mobileCards = await page.locator('[aria-labelledby="compras-title"] article').evaluateAll(cards => cards.map(card => ({ width: card.getBoundingClientRect().width, scrollWidth: card.scrollWidth })))
    const touch = viewport.width < 1024
    const shortButtons = touch ? await page.locator('[data-compras-touch-target] [data-slot="button"]:visible, [data-compras-touch-target] button:visible').evaluateAll(buttons => buttons.map(button => ({ label: button.getAttribute('aria-label') || button.textContent?.trim(), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })).filter(button => button.width < 44 || button.height < 44)) : []
    const search = page.getByRole('searchbox', { name: 'Buscar' })
    await search.focus()
    const filterFocus = await search.evaluate(element => document.activeElement === element && (getComputedStyle(element).outlineWidth !== '0px' || getComputedStyle(element).boxShadow !== 'none'))
    if (!filterFocus) throw new Error(`Búsqueda sin foco visible a ${viewport.width}px.`)
    await page.keyboard.press('Tab')
    if (!await page.getByLabel('Estado').evaluate(element => document.activeElement === element)) throw new Error(`El foco de teclado no avanza del buscador al filtro a ${viewport.width}px.`)
    await page.keyboard.press('Enter')
    if (pageBounds.scrollWidth > pageBounds.width) throw new Error(`Desbordamiento horizontal de página a ${viewport.width}px: ${JSON.stringify(pageBounds)}`)
    const overflowingCards = mobileCards.filter(card => card.scrollWidth > card.width)
    if (overflowingCards.length) throw new Error(`Tarjeta móvil desbordada a ${viewport.width}px: ${JSON.stringify(overflowingCards)}`)
    if (shortButtons.length) throw new Error(`Acciones táctiles menores de 44px a ${viewport.width}px: ${JSON.stringify(shortButtons)}`)
    await page.screenshot({ path: path.join(temporary, `${viewport.width}x${viewport.height}-listado.png`), fullPage: true })

    await page.getByRole('button', { name: 'Registrar compra' }).click()
    const purchaseDialog = page.getByRole('dialog', { name: 'Registrar compra' })
    await expect(purchaseDialog).toBeVisible()
    await expect(purchaseDialog.getByRole('button', { name: 'Guardar borrador' })).toBeVisible()
    const purchaseDialogBounds = await purchaseDialog.evaluate(element => { const r = element.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, height:r.height, clientHeight:element.clientHeight, scrollHeight:element.scrollHeight } })
    await expect(purchaseDialog.getByLabel('Proveedor')).toBeVisible()
    if (purchaseDialogBounds.left < 0 || purchaseDialogBounds.right > viewport.width || purchaseDialogBounds.top < 0 || purchaseDialogBounds.bottom > viewport.height) throw new Error(`Formulario de compra recortado a ${viewport.width}px: ${JSON.stringify(purchaseDialogBounds)}`)
    const shortPurchaseFields = touch ? await purchaseDialog.locator('.field-control:visible').evaluateAll(fields => fields.map(field => ({ label: field.getAttribute('aria-label') || field.id, height: field.getBoundingClientRect().height })).filter(field => field.height < 44)) : []
    const shortPurchaseButtons = touch ? await purchaseDialog.locator('button:visible').evaluateAll(buttons => buttons.map(button => ({ label: button.getAttribute('aria-label') || button.textContent?.trim(), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })).filter(button => button.width < 44 || button.height < 44)) : []
    if (shortPurchaseFields.length || shortPurchaseButtons.length) throw new Error(`Objetivos táctiles insuficientes en formulario a ${viewport.width}px: ${JSON.stringify({ shortPurchaseFields, shortPurchaseButtons })}`)
    await page.screenshot({ path: path.join(temporary, `${viewport.width}x${viewport.height}-formulario.png`), fullPage: true })
    await purchaseDialog.getByRole('button', { name: 'Cancelar' }).click()

    await page.getByRole('button', { name: /Recibir/ }).first().click()
    const receiptDialog = page.getByRole('dialog', { name: 'Registrar recepción' })
    await expect(receiptDialog).toBeVisible()
    await expect(receiptDialog.getByText(/pendiente 2/)).toBeVisible()
    await expect(receiptDialog.getByLabel(/Lote/)).toBeVisible()
    const receiptDialogBounds = await receiptDialog.evaluate(element => { const r = element.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, height:r.height, clientHeight:element.clientHeight, scrollHeight:element.scrollHeight } })
    const shortReceiptFields = touch ? await receiptDialog.locator('.field-control:visible').evaluateAll(fields => fields.map(field => ({ label: field.getAttribute('aria-label') || field.id, height: field.getBoundingClientRect().height })).filter(field => field.height < 44)) : []
    const shortReceiptButtons = touch ? await receiptDialog.locator('button:visible').evaluateAll(buttons => buttons.map(button => ({ label: button.getAttribute('aria-label') || button.textContent?.trim(), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })).filter(button => button.width < 44 || button.height < 44)) : []
    if (receiptDialogBounds.left < 0 || receiptDialogBounds.right > viewport.width || receiptDialogBounds.top < 0 || receiptDialogBounds.bottom > viewport.height) throw new Error(`Formulario de recepción recortado a ${viewport.width}px: ${JSON.stringify(receiptDialogBounds)}`)
    if (shortReceiptFields.length || shortReceiptButtons.length) throw new Error(`Objetivos táctiles insuficientes en recepción a ${viewport.width}px: ${JSON.stringify({ shortReceiptFields, shortReceiptButtons })}`)
    await page.screenshot({ path: path.join(temporary, `${viewport.width}x${viewport.height}-recepcion.png`), fullPage: true })

    if (viewport.width === 390) {
      const lote = receiptDialog.getByLabel(/Lote/)
      const vencimiento = receiptDialog.getByLabel(/Vencimiento/)
      await lote.fill('LOTE-FICTICIO')
      await vencimiento.fill('2027-10-31')
      const confirmar = receiptDialog.getByRole('button', { name: 'Confirmar recepción' })
      await confirmar.click()
      await page.waitForFunction(() => window.__comprasUiFixture.calls.recibir === 1)
      const procesando = receiptDialog.getByRole('button', { name: 'Procesando…' })
      await expect(procesando).toBeDisabled()
      await procesando.evaluate(button => button.click())
      const llamadasDuranteProceso = await page.evaluate(() => window.__comprasUiFixture.calls.recibir)
      await page.evaluate(() => window.__comprasUiFixture.resolveRecepcion('Error ficticio: recepción no disponible; vuelve a intentarlo.'))
      await expect(receiptDialog.getByRole('alert')).toContainText('vuelve a intentarlo')
      await expect(lote).toHaveValue('LOTE-FICTICIO')
      await expect(vencimiento).toHaveValue('2027-10-31')
      if (llamadasDuranteProceso !== 1) throw new Error('Una recepción bloqueada durante el envío generó una operación duplicada.')
    }

    results.push({ viewport, layout: mobile ? 'cards' : 'table', pageBounds, mobileCards, shortButtons, purchaseDialogBounds, receiptDialogBounds, shortPurchaseFields, shortPurchaseButtons, shortReceiptFields, shortReceiptButtons, keyboardFocusVisible:filterFocus })
    await context.close()
  }

  if (externalRequests.length) throw new Error(`Se intentaron solicitudes externas: ${JSON.stringify(externalRequests)}`)
  if (pageErrors.length) throw new Error(`Errores del navegador: ${JSON.stringify(pageErrors)}`)
  console.log(JSON.stringify({ results, externalRequests, pageErrors }, null, 2))
} finally {
  if (browser) await browser.close()
  await server.close()
  fs.rmSync(temporary, { recursive: true, force: true })
}
