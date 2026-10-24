import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { assignablePermissionCodes, expandPermissionDependencies } from '@/features/users/userTypes'
import { actorFiscalPrueba, crearComprobanteSandbox, documentoFiscalPrueba, organizacionFiscalPrueba, otraOrganizacionFiscal } from '../__fixtures__/comprobanteSandbox'
import { ErrorConsultaFiscal } from '../servicios/comprobantesSandboxService'
import { useComprobanteSandbox } from './useComprobanteSandbox'

const mocks = vi.hoisted(() => ({
  consultar: vi.fn(),
  auth: { organizationId: '', userId: '', sesion: true, permiso: true, cargando: false },
}))
vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    access: { organizationId: mocks.auth.organizationId },
    user: mocks.auth.userId ? { id: mocks.auth.userId } : null,
    session: mocks.auth.sesion ? {} : null,
    isLoading: mocks.auth.cargando,
    isAdmin: true,
    hasPermission: (permission: string) => mocks.auth.permiso && permission === 'BILLING_VIEW',
  }),
}))
vi.mock('../servicios/comprobantesSandboxService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../servicios/comprobantesSandboxService')>(),
  consultarComprobanteSandbox: mocks.consultar,
}))
// El cliente real no se inicializa en esta suite unitaria.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

let cliente: QueryClient
function contexto() {
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
}

describe('consulta React de comprobantes sandbox', () => {
  beforeEach(() => {
    cliente = new QueryClient()
    mocks.consultar.mockReset().mockResolvedValue(crearComprobanteSandbox())
    Object.assign(mocks.auth, { organizationId: organizacionFiscalPrueba, userId: actorFiscalPrueba,
      sesion: true, permiso: true, cargando: false })
  })
  afterEach(() => cliente.clear())

  it('registrar BILLING_VIEW no lo concede a Ventas ni lo incorpora al selector general de usuarios', () => {
    expect(expandPermissionDependencies(['SALES_MANAGE'])).not.toContain('BILLING_VIEW')
    expect(assignablePermissionCodes).not.toContain('BILLING_VIEW')
  })

  it('consulta por organización activa y requiere BILLING_VIEW, no SALES_MANAGE ni ADMIN', async () => {
    const { result } = renderHook(() => useComprobanteSandbox(documentoFiscalPrueba), { wrapper: contexto() })
    await waitFor(() => expect(result.current.comprobante?.documentId).toBe(documentoFiscalPrueba))
    expect(mocks.consultar).toHaveBeenCalledExactlyOnceWith(organizacionFiscalPrueba, documentoFiscalPrueba, expect.any(AbortSignal))
    expect(cliente.getQueryCache().getAll()[0].queryKey).toEqual([
      'electronic-document', organizacionFiscalPrueba, 'sandbox', documentoFiscalPrueba, actorFiscalPrueba,
    ])
  })

  it.each(['sin permiso', 'sin sesión', 'sin usuario', 'sin organización', 'cargando acceso'])('no consulta ni permite refetch: %s', async (caso) => {
    if (caso === 'sin permiso') mocks.auth.permiso = false
    if (caso === 'sin sesión') mocks.auth.sesion = false
    if (caso === 'sin usuario') mocks.auth.userId = ''
    if (caso === 'sin organización') mocks.auth.organizationId = ''
    if (caso === 'cargando acceso') mocks.auth.cargando = true
    const { result } = renderHook(() => useComprobanteSandbox(documentoFiscalPrueba), { wrapper: contexto() })
    await act(async () => { await result.current.reintentar() })
    expect(result.current.puedeConsultar).toBe(false)
    expect(result.current.comprobante).toBeUndefined()
    expect(mocks.consultar).not.toHaveBeenCalled()
  })

  it('no consulta una UUID de documento inválida', () => {
    const { result } = renderHook(() => useComprobanteSandbox('invalida'), { wrapper: contexto() })
    expect(result.current.puedeConsultar).toBe(false)
    expect(mocks.consultar).not.toHaveBeenCalled()
  })

  it('oculta datos y bloquea el reintento al revocar el permiso visible', async () => {
    const { result, rerender } = renderHook(() => useComprobanteSandbox(documentoFiscalPrueba), { wrapper: contexto() })
    await waitFor(() => expect(result.current.comprobante).toBeDefined())
    mocks.auth.permiso = false
    rerender()
    expect(result.current.comprobante).toBeUndefined()
    await act(async () => { await result.current.reintentar() })
    expect(mocks.consultar).toHaveBeenCalledTimes(1)
  })

  it('no conserva el snapshot visible tras cerrar la sesión', async () => {
    const { result, rerender } = renderHook(() => useComprobanteSandbox(documentoFiscalPrueba), { wrapper: contexto() })
    await waitFor(() => expect(result.current.comprobante).toBeDefined())
    mocks.auth.sesion = false
    mocks.auth.userId = ''
    rerender()
    expect(result.current.comprobante).toBeUndefined()
  })

  it('cancela la consulta anterior y no mezcla una respuesta tardía de otro tenant', async () => {
    let resolverAnterior!: (valor: ReturnType<typeof crearComprobanteSandbox>) => void
    mocks.consultar.mockReturnValueOnce(new Promise((resolve) => { resolverAnterior = resolve }))
    const { result, rerender } = renderHook(() => useComprobanteSandbox(documentoFiscalPrueba), { wrapper: contexto() })
    await waitFor(() => expect(mocks.consultar).toHaveBeenCalledTimes(1))
    const signalAnterior = mocks.consultar.mock.calls[0][2] as AbortSignal
    const nuevo = crearComprobanteSandbox()
    nuevo.snapshot.organizationId = otraOrganizacionFiscal
    mocks.consultar.mockResolvedValue(nuevo)
    mocks.auth.organizationId = otraOrganizacionFiscal
    rerender()
    await waitFor(() => expect(result.current.comprobante?.snapshot.organizationId).toBe(otraOrganizacionFiscal))
    expect(signalAnterior.aborted).toBe(true)
    await act(async () => { resolverAnterior(crearComprobanteSandbox()) })
    expect(result.current.comprobante?.snapshot.organizationId).toBe(otraOrganizacionFiscal)
  })

  it('separa la caché por usuario aunque pertenezcan al mismo tenant', async () => {
    const { result, rerender } = renderHook(() => useComprobanteSandbox(documentoFiscalPrueba), { wrapper: contexto() })
    await waitFor(() => expect(result.current.comprobante).toBeDefined())
    mocks.auth.userId = otraOrganizacionFiscal
    rerender()
    await waitFor(() => expect(mocks.consultar).toHaveBeenCalledTimes(2))
    expect(cliente.getQueryCache().getAll().some((query) => query.queryKey[4] === otraOrganizacionFiscal)).toBe(true)
  })

  it('no reintenta automáticamente denegaciones y oculta datos previos ante revocación backend', async () => {
    const { result } = renderHook(() => useComprobanteSandbox(documentoFiscalPrueba), { wrapper: contexto() })
    await waitFor(() => expect(result.current.comprobante).toBeDefined())
    mocks.consultar.mockRejectedValue(new ErrorConsultaFiscal('SIN_ACCESO'))
    await act(async () => { await result.current.reintentar() })
    await waitFor(() => expect(result.current.error).toMatchObject({ codigo: 'SIN_ACCESO' }))
    expect(result.current.comprobante).toBeUndefined()
    expect(mocks.consultar).toHaveBeenCalledTimes(2)
  })

  it('elimina la caché sin observadores al desmontar', async () => {
    const { result, unmount } = renderHook(() => useComprobanteSandbox(documentoFiscalPrueba), { wrapper: contexto() })
    await waitFor(() => expect(result.current.comprobante).toBeDefined())
    unmount()
    await waitFor(() => expect(cliente.getQueryCache().getAll()).toHaveLength(0))
  })
})
