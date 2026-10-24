import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentType } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { elementosNavegacion } from '@/app/navegacion'
import { actorFiscalPrueba, crearComprobanteSandbox, documentoFiscalPrueba, organizacionFiscalPrueba, otraOrganizacionFiscal } from '@/modulos/facturacion/__fixtures__/comprobanteSandbox'
import { AVISO_FISCAL_SANDBOX } from '@/modulos/facturacion/modelo/comprobanteSandbox'
import { ErrorConsultaFiscal } from '@/modulos/facturacion/servicios/comprobantesSandboxService'
import { ComprobanteSandboxPage } from './ComprobanteSandboxPage'

const mocks = vi.hoisted(() => ({
  consultar: vi.fn(),
  auth: { organizationId: '', userId: '', sesion: true, permiso: true, cargando: false },
}))
vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    access: { organizationId: mocks.auth.organizationId, organizationName: 'Organización ficticia', roles: [] },
    user: mocks.auth.userId ? { id: mocks.auth.userId, email: 'ficticio@example.invalid' } : null,
    session: mocks.auth.sesion ? {} : null,
    isLoading: mocks.auth.cargando,
    hasPermission: (permiso: string) => mocks.auth.permiso && permiso === 'BILLING_VIEW',
  }),
}))
vi.mock('@/modulos/facturacion/servicios/comprobantesSandboxService', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/modulos/facturacion/servicios/comprobantesSandboxService')>(),
  consultarComprobanteSandbox: mocks.consultar,
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

let cliente: QueryClient
function pantalla(Contenido: ComponentType = ComprobanteSandboxPage) {
  return <QueryClientProvider client={cliente}><MemoryRouter><Contenido /></MemoryRouter></QueryClientProvider>
}
function buscar(uuid = documentoFiscalPrueba) {
  fireEvent.change(screen.getByRole('textbox', { name: 'UUID del comprobante' }), { target: { value: uuid } })
  fireEvent.submit(screen.getByRole('form', { name: 'Consultar comprobante sandbox' }))
}

describe('pantalla de consulta fiscal sandbox', () => {
  beforeEach(() => {
    cliente = new QueryClient()
    Object.assign(mocks.auth, { organizationId: organizacionFiscalPrueba, userId: actorFiscalPrueba,
      sesion: true, permiso: true, cargando: false })
    mocks.consultar.mockReset().mockResolvedValue(crearComprobanteSandbox())
  })
  afterEach(() => cliente.clear())

  it('muestra el aviso, formulario asociado y estado inicial sin consultar datos automáticamente', () => {
    render(pantalla())
    expect(screen.getByRole('heading', { level: 1, name: 'Consulta fiscal sandbox' })).toBeVisible()
    expect(screen.getByRole('note', { name: 'Aviso de entorno sandbox' })).toHaveTextContent(AVISO_FISCAL_SANDBOX)
    expect(screen.getByRole('textbox', { name: 'UUID del comprobante' })).toHaveAccessibleDescription(/tu organización/)
    expect(screen.getByRole('heading', { name: 'Ningún comprobante seleccionado' })).toBeVisible()
    expect(mocks.consultar).not.toHaveBeenCalled()
  })

  it.each([false, true])('presenta el snapshot %s sin recalcular ni redondear sus importes', async (congelado) => {
    const dto = crearComprobanteSandbox(congelado)
    mocks.consultar.mockResolvedValue(dto)
    render(pantalla())
    buscar()
    await screen.findByRole('heading', { name: 'Detalle fiscal sandbox' })
    expect(screen.getByText(congelado ? 'Congelado · confirmación interna' : 'Preparado · sin número')).toBeVisible()
    expect(screen.getByText('SANDBOX EMISOR FICTICIO')).toBeVisible()
    expect(screen.getByText('RECEPTOR FICTICIO')).toBeVisible()
    expect(screen.getByText('Factura (01)')).toBeVisible()
    expect(screen.getByText('F001', { exact: true })).toBeVisible()
    expect(screen.getByText(congelado ? '1' : 'Sin asignar', { exact: true })).toBeVisible()
    const productos = within(screen.getByRole('region', { name: 'Productos del comprobante' }))
    expect(productos.getByRole('cell', { name: '118.0000' })).toBeVisible()
    expect(productos.getByRole('cell', { name: '1.000' })).toBeVisible()
    expect(productos.getByText('100.0000000000', { exact: true })).toBeVisible()
    expect(productos.getByText('118.0000000000', { exact: true })).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'Totales en PEN' })).getByText('118.00', { exact: true })).toBeVisible()
    expect(screen.queryByRole('button', { name: /emitir|firmar|confirmar|preparar/i })).not.toBeInTheDocument()
  })

  it('muestra boleta, pago a crédito y cuotas con sus strings originales', async () => {
    const dto = crearComprobanteSandbox()
    Object.assign(dto.snapshot, { documentType: '03', series: 'B001' })
    Object.assign(dto.snapshot.buyer, { type: '1', number: '00000000', address: null })
    dto.snapshot.payment = { kind: 'credito', outstanding: '118.00', paidAtIssue: '0.00',
      installments: [{ id: 'Cuota001', amount: '118.00', dueDate: '2026-11-24' }] }
    mocks.consultar.mockResolvedValue(dto)
    render(pantalla())
    buscar()
    await screen.findByText('Boleta (03)')
    expect(screen.getByText('Crédito')).toBeVisible()
    expect(screen.getByText('No consignada en este snapshot')).toBeVisible()
    const cuotas = within(screen.getByRole('table', { name: 'Cuotas declaradas en PEN' }))
    expect(cuotas.getByRole('rowheader', { name: 'Cuota001' })).toBeVisible()
    expect(cuotas.getByRole('cell', { name: '118.00' })).toBeVisible()
    expect(cuotas.getByText('2026-11-24')).toBeVisible()
  })

  it('conserva valores grandes y ceros decimales sin convertirlos a Number', async () => {
    const dto = crearComprobanteSandbox()
    dto.snapshot.totals.total = '999999999999.99'
    dto.snapshot.items[0].unitNet = '999999999999.1234567890'
    mocks.consultar.mockResolvedValue(dto)
    render(pantalla())
    buscar()
    expect(await screen.findByText('999999999999.99', { exact: true })).toBeVisible()
    expect(screen.getByText('999999999999.1234567890', { exact: true })).toBeVisible()
  })

  it('informa la carga y permite limpiar para cancelar la consulta pendiente', async () => {
    mocks.consultar.mockReturnValue(new Promise(() => {}))
    render(pantalla())
    buscar()
    expect(await screen.findByRole('status')).toHaveTextContent('Consultando comprobante sandbox')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    const signal = mocks.consultar.mock.calls[0][2] as AbortSignal
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar consulta' }))
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(screen.getByRole('textbox')).toHaveValue('')
    await waitFor(() => expect(signal.aborted).toBe(true))
    expect(screen.getByRole('heading', { name: 'Ningún comprobante seleccionado' })).toBeVisible()
  })

  it('asocia el error del UUID al campo y devuelve el foco sin invocar la RPC', () => {
    render(pantalla())
    buscar('uuid-invalida')
    const campo = screen.getByRole('textbox', { name: 'UUID del comprobante' })
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription(/Ingresa un UUID de comprobante válido/)
    expect(campo).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('UUID de comprobante válido')
    expect(mocks.consultar).not.toHaveBeenCalled()
  })

  it.each(['NO_ENCONTRADO', 'NO_DISPONIBLE', 'SIN_ACCESO', 'CONSULTA_FALLIDA'] as const)('presenta %s sin documento previo y permite reintentar lectura', async (codigo) => {
    mocks.consultar.mockRejectedValueOnce(new ErrorConsultaFiscal(codigo)).mockResolvedValue(crearComprobanteSandbox())
    render(pantalla())
    buscar()
    await screen.findByRole('alert')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    if (codigo === 'NO_ENCONTRADO') expect(screen.getByRole('heading', { name: 'Documento no disponible' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }))
    expect(await screen.findByRole('heading', { name: 'Detalle fiscal sandbox' })).toBeVisible()
    expect(mocks.consultar).toHaveBeenCalledTimes(2)
  })

  it('no presenta diagnósticos arbitrarios ni interpreta HTML del snapshot', async () => {
    mocks.consultar.mockRejectedValueOnce(new Error('DIAGNOSTICO_INTERNO_PRIVADO'))
    const dto = crearComprobanteSandbox()
    dto.snapshot.buyer.name = '<img src=x onerror=alert(1)>'
    mocks.consultar.mockResolvedValueOnce(dto)
    render(pantalla())
    buscar()
    await screen.findByRole('alert')
    expect(screen.queryByText('DIAGNOSTICO_INTERNO_PRIVADO')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }))
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeVisible()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it.each(['organización', 'usuario', 'sesión', 'permiso'])('elimina el detalle anterior al cambiar %s', async (cambio) => {
    const { rerender } = render(pantalla())
    buscar()
    await screen.findByText('RECEPTOR FICTICIO')
    if (cambio === 'organización') mocks.auth.organizationId = otraOrganizacionFiscal
    if (cambio === 'usuario') mocks.auth.userId = otraOrganizacionFiscal
    if (cambio === 'sesión') mocks.auth.sesion = false
    if (cambio === 'permiso') mocks.auth.permiso = false
    rerender(pantalla())
    expect(screen.queryByText('RECEPTOR FICTICIO')).not.toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(mocks.consultar).toHaveBeenCalledTimes(1)
    if (cambio === 'sesión' || cambio === 'permiso') expect(screen.queryByRole('form')).not.toBeInTheDocument()
    else expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it.each(['permiso', 'sesión', 'cargando'])('no monta el formulario sin acceso disponible: %s', (caso) => {
    if (caso === 'permiso') mocks.auth.permiso = false
    if (caso === 'sesión') mocks.auth.sesion = false
    if (caso === 'cargando') mocks.auth.cargando = true
    render(pantalla())
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(AVISO_FISCAL_SANDBOX)
    expect(mocks.consultar).not.toHaveBeenCalled()
  })

  it('la ruta real y su entrada de navegación exigen BILLING_VIEW', async () => {
    expect(elementosNavegacion.find((item) => item.ruta === '/facturacion-sandbox')?.permission).toBe('BILLING_VIEW')
    const { router } = await import('@/app/router/router')
    const ruta = router.routes.find((item) => item.path === '/')?.children?.find((item) => item.path === 'facturacion-sandbox')
    expect(ruta).toBeDefined()
    const modulo = await (ruta!.lazy as () => Promise<{ Component: ComponentType }>)()
    router.dispose()
    mocks.auth.permiso = false
    render(<MemoryRouter initialEntries={['/facturacion-sandbox']}><Routes>
      <Route path="/facturacion-sandbox" Component={modulo.Component} />
      <Route path="/" element={<p>Inicio protegido</p>} />
    </Routes></MemoryRouter>)
    expect(await screen.findByText('Inicio protegido')).toBeVisible()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(mocks.consultar).not.toHaveBeenCalled()
  })
})
