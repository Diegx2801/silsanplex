import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConsultaExistenciasInventario } from '@/modulos/inventario/modelo/inventario'
import { listarExistenciasInventario, listarMovimientosInventario } from './inventarioService'

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { from, rpc },
}))

interface RespuestaSupabase {
  data: unknown[] | null
  error: { code?: string; message?: string } | null
  count: number | null
}

function crearQuery(respuesta: RespuestaSupabase) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const metodo of ['select', 'eq', 'or', 'gt', 'lte', 'gte', 'ilike', 'order']) {
    query[metodo] = vi.fn(() => query)
  }
  query.range = vi.fn(() => Promise.resolve(respuesta))
  from.mockReturnValue(query)
  return query
}

const fila = {
  product_id: '00000000-0000-4000-8000-000000000001',
  product_code: 'SKU-001',
  product_description: 'Producto uno',
  laboratory: 'Laboratorio uno',
  unit_of_measure: 'UND',
  physical_quantity: 12,
  sanitary_available_quantity: 12,
  reserved_quantity: 4,
  assignable_quantity: 8,
  quarantine_quantity: 0,
  damaged_quantity: 0,
  expired_quantity: 0,
  inventory_value: 220,
  warehouse_count: 2,
  bucket_count: 3,
  lot_count: 3,
}

const consultaBase: ConsultaExistenciasInventario = {
  pagina: 1,
  tamanioPagina: 25,
  busqueda: '',
  filtroStock: 'todos',
  orden: 'producto-asc',
}

describe('listarExistenciasInventario', () => {
  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
  })

  function responderExistencias(items: unknown[] = [fila], totalCount = items.length) {
    rpc.mockResolvedValue({ data: { items, total_count: totalCount }, error: null })
  }

  it('consulta la primera página mediante el read model autorizado', async () => {
    responderExistencias([fila], 80)
    const resultado = await listarExistenciasInventario('org-1', consultaBase)
    expect(rpc).toHaveBeenCalledWith('inventory_product_stock_summary_read', {
      requested_organization_id: 'org-1',
      search_term: '',
      requested_stock_filter: 'todos',
      requested_sort: 'producto-asc',
      requested_limit: 25,
      requested_offset: 0,
    })
    expect(resultado.pagina).toBe(1)
    expect(resultado.totalPaginas).toBe(4)
  })

  it('consulta una página intermedia', async () => {
    responderExistencias([fila], 80)
    await listarExistenciasInventario('org-1', { ...consultaBase, pagina: 3 })
    expect(rpc).toHaveBeenCalledWith(
      'inventory_product_stock_summary_read',
      expect.objectContaining({ requested_limit: 25, requested_offset: 50 }),
    )
  })

  it('representa correctamente la última página', async () => {
    responderExistencias([fila], 51)
    const resultado = await listarExistenciasInventario('org-1', { ...consultaBase, pagina: 3 })
    expect(resultado.elementos).toHaveLength(1)
    expect(resultado.totalPaginas).toBe(3)
  })

  it('cambia el tamaño de página sin descargar el conjunto completo', async () => {
    responderExistencias([fila], 201)
    await listarExistenciasInventario('org-1', { ...consultaBase, tamanioPagina: 100 })
    expect(rpc).toHaveBeenCalledWith(
      'inventory_product_stock_summary_read',
      expect.objectContaining({ requested_limit: 100, requested_offset: 0 }),
    )
  })

  it('conserva el conteo exacto superior al max_rows de 1000', async () => {
    responderExistencias([fila], 1_501)
    const resultado = await listarExistenciasInventario('org-1', consultaBase)
    expect(resultado.total).toBe(1_501)
    expect(resultado.totalPaginas).toBe(61)
  })

  it('combina filtro con stock y paginación', async () => {
    responderExistencias([fila], 30)
    await listarExistenciasInventario('org-1', { ...consultaBase, pagina: 2, filtroStock: 'con-stock' })
    expect(rpc).toHaveBeenCalledWith(
      'inventory_product_stock_summary_read',
      expect.objectContaining({ requested_stock_filter: 'con-stock', requested_offset: 25 }),
    )
  })

  it('filtra productos sin stock en PostgreSQL', async () => {
    responderExistencias([], 0)
    await listarExistenciasInventario('org-1', { ...consultaBase, filtroStock: 'sin-stock' })
    expect(rpc).toHaveBeenCalledWith(
      'inventory_product_stock_summary_read',
      expect.objectContaining({ requested_stock_filter: 'sin-stock' }),
    )
  })

  it('combina búsqueda server-side y paginación', async () => {
    responderExistencias([fila], 1)
    await listarExistenciasInventario('org-1', { ...consultaBase, busqueda: 'SKU 001' })
    expect(rpc).toHaveBeenCalledWith(
      'inventory_product_stock_summary_read',
      expect.objectContaining({ search_term: 'SKU 001', requested_offset: 0 }),
    )
  })

  it('delega el orden determinista por producto al read model', async () => {
    responderExistencias([fila], 1)
    await listarExistenciasInventario('org-1', consultaBase)
    expect(rpc).toHaveBeenCalledWith(
      'inventory_product_stock_summary_read',
      expect.objectContaining({ requested_sort: 'producto-asc' }),
    )
  })

  it('ordena por código server-side', async () => {
    responderExistencias([fila], 1)
    await listarExistenciasInventario('org-1', { ...consultaBase, orden: 'codigo-desc' })
    expect(rpc).toHaveBeenCalledWith(
      'inventory_product_stock_summary_read',
      expect.objectContaining({ requested_sort: 'codigo-desc' }),
    )
  })

  it('ordena por stock server-side', async () => {
    responderExistencias([fila], 1)
    await listarExistenciasInventario('org-1', { ...consultaBase, orden: 'stock-desc' })
    expect(rpc).toHaveBeenCalledWith(
      'inventory_product_stock_summary_read',
      expect.objectContaining({ requested_sort: 'stock-desc' }),
    )
  })

  it('devuelve resultado vacío sin inventar registros', async () => {
    responderExistencias([], 0)
    const resultado = await listarExistenciasInventario('org-1', consultaBase)
    expect(resultado.elementos).toEqual([])
    expect(resultado.total).toBe(0)
  })

  it('acepta menos registros que el tamaño solicitado', async () => {
    responderExistencias([fila], 1)
    const resultado = await listarExistenciasInventario('org-1', consultaBase)
    expect(resultado.elementos).toHaveLength(1)
    expect(resultado.tamanioPagina).toBe(25)
  })

  it('propaga un error legible de Supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'fallo' } })
    await expect(listarExistenciasInventario('org-1', consultaBase)).rejects.toThrow(
      'No se pudieron consultar las existencias',
    )
  })
})

describe('listarMovimientosInventario', () => {
  beforeEach(() => from.mockReset())

  it('pagina, filtra y ordena movimientos completamente en Supabase', async () => {
    const query = crearQuery({ data: [], error: null, count: 1_250 })
    const resultado = await listarMovimientosInventario('org-1', {
      pagina: 4,
      tamanioPagina: 100,
      busqueda: 'LOTE-1',
      almacenId: 'almacen-1',
      tipo: 'salida',
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-12-31',
      orden: 'fecha-desc',
    })
    expect(query.eq).toHaveBeenCalledWith('warehouse_id', 'almacen-1')
    expect(query.eq).toHaveBeenCalledWith('movement_type', 'salida')
    expect(query.gte).toHaveBeenCalledWith('operation_date', '2026-01-01')
    expect(query.lte).toHaveBeenCalledWith('operation_date', '2026-12-31')
    expect(query.order).toHaveBeenNthCalledWith(1, 'operation_date', { ascending: false })
    expect(query.range).toHaveBeenCalledWith(300, 399)
    expect(resultado.total).toBe(1_250)
  })
})
