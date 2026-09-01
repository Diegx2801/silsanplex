import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  listarAlertasStock,
  listarKardex,
  listarStockDetallado,
  listarTransferencias,
  listarVencimientos,
} from './almacenService'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { from, rpc: vi.fn() } }))

function crearQuery(data: Record<string, unknown>[] = [], count = data.length) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const metodo of ['select', 'eq', 'neq', 'or', 'ilike', 'gte', 'lte', 'order']) {
    query[metodo] = vi.fn(() => query)
  }
  query.range = vi.fn(() => Promise.resolve({ data, count, error: null }))
  from.mockReturnValue(query)
  return query
}

const base = { pagina: 2, tamanioPagina: 50 as const, busqueda: '', almacenId: '' }

describe('listados paginados de almacén', () => {
  beforeEach(() => from.mockReset())

  it('pagina stock detallado con filtros persistentes', async () => {
    const query = crearQuery()
    await listarStockDetallado('org-1', {
      ...base,
      ubicacionId: 'ubicacion-1', lote: 'L-01', estado: 'available',
      vencimientoDesde: '2026-01-01', vencimientoHasta: '2026-12-31', orden: 'vencimiento-asc',
    })
    expect(query.eq).toHaveBeenCalledWith('location_id', 'ubicacion-1')
    expect(query.ilike).toHaveBeenCalledWith('lot', '%L-01%')
    expect(query.range).toHaveBeenCalledWith(50, 99)
  })

  it('pagina alertas con conteo exacto', async () => {
    const query = crearQuery([], 1_205)
    const resultado = await listarAlertasStock('org-1', { ...base, orden: 'stock-asc' })
    expect(query.order).toHaveBeenNthCalledWith(1, 'assignable_quantity', { ascending: true })
    expect(resultado.total).toBe(1_205)
    expect(resultado.totalPaginas).toBe(25)
  })

  it('pagina vencimientos por fecha en PostgreSQL', async () => {
    const query = crearQuery()
    await listarVencimientos('org-1', {
      ...base,
      estadoVencimiento: 'urgent', fechaDesde: '2026-09-01', fechaHasta: '2026-12-01', orden: 'vencimiento-desc',
    })
    expect(query.eq).toHaveBeenCalledWith('expiration_state', 'urgent')
    expect(query.order).toHaveBeenNthCalledWith(1, 'expiration_date', { ascending: false })
    expect(query.range).toHaveBeenCalledWith(50, 99)
  })

  it('conserva operation_date y ledger_sequence en Kardex', async () => {
    const query = crearQuery()
    await listarKardex('org-1', {
      ...base, fechaDesde: '', fechaHasta: '', orden: 'fecha-desc',
    })
    expect(query.order).toHaveBeenNthCalledWith(1, 'operation_date', { ascending: false })
    expect(query.order).toHaveBeenNthCalledWith(2, 'ledger_sequence', { ascending: false })
    expect(query.range).toHaveBeenCalledWith(50, 99)
  })

  it('pagina y filtra transferencias por cualquiera de sus almacenes', async () => {
    const query = crearQuery()
    await listarTransferencias('org-1', {
      ...base, almacenId: 'almacen-1', fechaDesde: '', fechaHasta: '', orden: 'fecha-desc',
    })
    expect(query.or).toHaveBeenCalledWith(
      'source_warehouse_id.eq.almacen-1,destination_warehouse_id.eq.almacen-1',
    )
    expect(query.range).toHaveBeenCalledWith(50, 99)
  })
})
