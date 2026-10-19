import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAlmacenes } from './useAlmacenes'

const servicios = vi.hoisted(() => ({
  cargarMaestrosAlmacen: vi.fn(), transferirInventario: vi.fn(),
  cambiarEstadoAlmacen: vi.fn(), cambiarEstadoUbicacion: vi.fn(), configurarAlertas: vi.fn(),
  crearAlmacen: vi.fn(), crearUbicacion: vi.fn(), editarAlmacen: vi.fn(), editarUbicacion: vi.fn(),
  reclasificarInventario: vi.fn(),
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ access: { organizationId: 'org-1' }, user: { id: 'user-1' } }),
}))
vi.mock('@/modulos/inventario/servicios/almacenService', () => servicios)

const datos = {
  productoId: 'producto-1', almacenOrigenId: 'almacen-1', ubicacionOrigenId: 'anaquel-1',
  almacenDestinoId: 'almacen-1', ubicacionDestinoId: 'anaquel-2', cantidad: '2',
  lote: 'L-01', fechaVencimiento: '', estado: 'available' as const,
}

function preparar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidar = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { ...renderHook(() => useAlmacenes(), { wrapper }), invalidar }
}

describe('useAlmacenes: transferencias y reubicaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    servicios.cargarMaestrosAlmacen.mockResolvedValue({ almacenes: [], ubicaciones: [] })
    servicios.transferirInventario.mockResolvedValue(undefined)
  })

  it('propaga la clave estable e invalida stock, Kardex, historial y selectores tras confirmar', async () => {
    const { result, invalidar } = preparar()
    await waitFor(() => expect(result.current.cargando).toBe(false))
    await act(async () => { expect(await result.current.transferir(datos, 'intento-1')).toBeUndefined() })
    expect(servicios.transferirInventario).toHaveBeenCalledWith('org-1', datos, 'intento-1')
    for (const prefijo of [
      'warehouse-management', 'inventory', 'inventory-fefo', 'inventory-movement-warehouses',
      'inventory-adjustment-warehouses', 'inventory-adjustment-buckets',
      'inventory-transfer-warehouses', 'inventory-transfer-buckets',
    ]) {
      expect(invalidar).toHaveBeenCalledWith({ queryKey: [prefijo, 'org-1'] })
    }
  })

  it('devuelve el error sin invalidar y conserva la misma clave al reintentar', async () => {
    servicios.transferirInventario.mockRejectedValueOnce(new Error('No hay stock suficiente.'))
    const { result, invalidar } = preparar()
    await waitFor(() => expect(result.current.cargando).toBe(false))
    await act(async () => {
      expect(await result.current.transferir(datos, 'intento-estable')).toBe('No hay stock suficiente.')
    })
    expect(invalidar).not.toHaveBeenCalled()
    await act(async () => { await result.current.transferir(datos, 'intento-estable') })
    expect(servicios.transferirInventario).toHaveBeenNthCalledWith(1, 'org-1', datos, 'intento-estable')
    expect(servicios.transferirInventario).toHaveBeenNthCalledWith(2, 'org-1', datos, 'intento-estable')
  })

  it('propaga la misma clave de reclasificación y actualiza alertas, Kardex y posiciones tras el éxito', async () => {
    const reclasificacion = {
      productoId: 'producto-1', almacenId: 'almacen-1', ubicacionId: 'anaquel-1',
      cantidad: '2', estadoOrigen: 'available' as const, estadoDestino: 'quarantine' as const,
      lote: 'L-01', fechaVencimiento: '', motivo: 'Inspección pendiente',
    }
    servicios.reclasificarInventario.mockRejectedValueOnce(new Error('La conexión se interrumpió.'))
      .mockResolvedValue(undefined)
    const { result, invalidar } = preparar()
    await waitFor(() => expect(result.current.cargando).toBe(false))
    await act(async () => {
      expect(await result.current.reclasificar(reclasificacion, 'cambio-estable')).toBe('La conexión se interrumpió.')
    })
    expect(invalidar).not.toHaveBeenCalled()
    await act(async () => { expect(await result.current.reclasificar(reclasificacion, 'cambio-estable')).toBeUndefined() })
    expect(servicios.reclasificarInventario).toHaveBeenNthCalledWith(1, 'org-1', reclasificacion, 'cambio-estable')
    expect(servicios.reclasificarInventario).toHaveBeenNthCalledWith(2, 'org-1', reclasificacion, 'cambio-estable')
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['warehouse-management', 'org-1'] })
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['inventory-adjustment-buckets', 'org-1'] })
  })
})
