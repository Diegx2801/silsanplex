import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConsultaExistenciasInventario } from '@/modulos/inventario/modelo/inventario'
import { listarExistenciasInventario, listarMovimientosInventario } from './inventarioService'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { from, rpc: vi.fn() },
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
  beforeEach(() => from.mockReset())

  it('consulta la primera página con rango inclusivo', async () => {
    const query = crearQuery({ data: [fila], error: null, count: 80 })
    const resultado = await listarExistenciasInventario('org-1', consultaBase)
    expect(query.range).toHaveBeenCalledWith(0, 24)
    expect(resultado.pagina).toBe(1)
    expect(resultado.totalPaginas).toBe(4)
  })

  it('consulta una página intermedia', async () => {
    const query = crearQuery({ data: [fila], error: null, count: 80 })
    await listarExistenciasInventario('org-1', { ...consultaBase, pagina: 3 })
    expect(query.range).toHaveBeenCalledWith(50, 74)
  })

  it('representa correctamente la última página', async () => {
    crearQuery({ data: [fila], error: null, count: 51 })
    const resultado = await listarExistenciasInventario('org-1', { ...consultaBase, pagina: 3 })
    expect(resultado.elementos).toHaveLength(1)
    expect(resultado.totalPaginas).toBe(3)
  })

  it('cambia el tamaño de página sin descargar el conjunto completo', async () => {
    const query = crearQuery({ data: [fila], error: null, count: 201 })
    await listarExistenciasInventario('org-1', { ...consultaBase, tamanioPagina: 100 })
    expect(query.range).toHaveBeenCalledWith(0, 99)
  })

  it('conserva el conteo exacto superior al max_rows de 1000', async () => {
    crearQuery({ data: [fila], error: null, count: 1_501 })
    const resultado = await listarExistenciasInventario('org-1', consultaBase)
    expect(resultado.total).toBe(1_501)
    expect(resultado.totalPaginas).toBe(61)
  })

  it('combina filtro con stock y paginación', async () => {
    const query = crearQuery({ data: [fila], error: null, count: 30 })
    await listarExistenciasInventario('org-1', { ...consultaBase, pagina: 2, filtroStock: 'con-stock' })
    expect(query.gt).toHaveBeenCalledWith('assignable_quantity', 0)
    expect(query.range).toHaveBeenCalledWith(25, 49)
  })

  it('filtra productos sin stock en PostgreSQL', async () => {
    const query = crearQuery({ data: [], error: null, count: 0 })
    await listarExistenciasInventario('org-1', { ...consultaBase, filtroStock: 'sin-stock' })
    expect(query.lte).toHaveBeenCalledWith('assignable_quantity', 0)
  })

  it('combina búsqueda server-side y paginación', async () => {
    const query = crearQuery({ data: [fila], error: null, count: 1 })
    await listarExistenciasInventario('org-1', { ...consultaBase, busqueda: 'SKU 001' })
    expect(query.or).toHaveBeenCalledWith(expect.stringContaining('laboratory.ilike.%SKU 001%'))
    expect(query.range).toHaveBeenCalledWith(0, 24)
  })

  it('ordena por producto con desempate determinista', async () => {
    const query = crearQuery({ data: [fila], error: null, count: 1 })
    await listarExistenciasInventario('org-1', consultaBase)
    expect(query.order).toHaveBeenNthCalledWith(1, 'product_description', { ascending: true })
    expect(query.order).toHaveBeenNthCalledWith(2, 'product_id', { ascending: true })
  })

  it('ordena por código server-side', async () => {
    const query = crearQuery({ data: [fila], error: null, count: 1 })
    await listarExistenciasInventario('org-1', { ...consultaBase, orden: 'codigo-desc' })
    expect(query.order).toHaveBeenNthCalledWith(1, 'product_code', { ascending: false })
  })

  it('ordena por stock server-side', async () => {
    const query = crearQuery({ data: [fila], error: null, count: 1 })
    await listarExistenciasInventario('org-1', { ...consultaBase, orden: 'stock-desc' })
    expect(query.order).toHaveBeenNthCalledWith(1, 'assignable_quantity', { ascending: false })
  })

  it('devuelve resultado vacío sin inventar registros', async () => {
    crearQuery({ data: [], error: null, count: 0 })
    const resultado = await listarExistenciasInventario('org-1', consultaBase)
    expect(resultado.elementos).toEqual([])
    expect(resultado.total).toBe(0)
  })

  it('acepta menos registros que el tamaño solicitado', async () => {
    crearQuery({ data: [fila], error: null, count: 1 })
    const resultado = await listarExistenciasInventario('org-1', consultaBase)
    expect(resultado.elementos).toHaveLength(1)
    expect(resultado.tamanioPagina).toBe(25)
  })

  it('propaga un error legible de Supabase', async () => {
    crearQuery({ data: null, error: { code: 'XX000', message: 'fallo' }, count: null })
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
