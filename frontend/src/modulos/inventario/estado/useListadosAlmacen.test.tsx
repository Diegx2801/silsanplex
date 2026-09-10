import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConsultaKardex } from '@/modulos/inventario/modelo/almacen'
import { inventoryQueryKeys } from './inventoryQueryKeys'
import { useListadosAlmacen } from './useListadosAlmacen'

const mocks = vi.hoisted(() => ({
  listarAlertasStock: vi.fn().mockResolvedValue(undefined),
  listarKardex: vi.fn().mockResolvedValue(undefined),
  listarStockDetallado: vi.fn().mockResolvedValue(undefined),
  listarTransferencias: vi.fn().mockResolvedValue(undefined),
  listarVencimientos: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ access: { organizationId: 'org-1' } }),
}))
vi.mock('@/modulos/inventario/servicios/almacenService', () => mocks)

const kardex = {
  pagina: 1,
  tamanioPagina: 25,
  busqueda: 'HIST-C4',
  almacenId: 'warehouse-1',
  fechaDesde: '2026-09-01',
  fechaHasta: '2026-09-30',
  orden: 'fecha-desc',
} satisfies ConsultaKardex

describe('inventoryQueryKeys', () => {
  beforeEach(() => vi.clearAllMocks())

  it('useListadosAlmacen registra Kardex con la key canónica filtrada', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useListadosAlmacen({
      stock: {
        pagina: 1, tamanioPagina: 25, busqueda: '', almacenId: '', ubicacionId: '',
        lote: '', estado: '', vencimientoDesde: '', vencimientoHasta: '',
        orden: 'vencimiento-asc',
      },
      alertas: { pagina: 1, tamanioPagina: 25, busqueda: '', almacenId: '', orden: 'producto-asc' },
      vencimientos: {
        pagina: 1, tamanioPagina: 25, busqueda: '', almacenId: '',
        estadoVencimiento: '', fechaDesde: '', fechaHasta: '', orden: 'vencimiento-asc',
      },
      kardex,
      transferencias: {
        pagina: 1, tamanioPagina: 25, busqueda: '', almacenId: '',
        fechaDesde: '', fechaHasta: '', orden: 'fecha-desc',
      },
    }), { wrapper })

    expect(queryClient.getQueryCache().find({
      queryKey: inventoryQueryKeys.kardex('org-1', kardex),
      exact: true,
    })).toBeDefined()
  })
})
