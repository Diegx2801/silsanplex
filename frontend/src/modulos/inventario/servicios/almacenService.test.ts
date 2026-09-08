import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cambiarEstadoAlmacen,
  cambiarEstadoUbicacion,
  crearAlmacen,
  crearUbicacion,
  editarAlmacen,
  editarUbicacion,
  listarAlertasStock,
  listarKardex,
  listarStockDetallado,
  listarTransferencias,
  listarVencimientos,
} from './almacenService'

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { from, rpc } }))

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
  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
  })

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

describe('comandos del mantenedor de almacenes', () => {
  beforeEach(() => rpc.mockReset())

  it('crea almacenes mediante el RPC autoritativo e idempotente', async () => {
    rpc.mockResolvedValue({ data: 'almacen-1', error: null })

    await crearAlmacen(
      'organizacion-1',
      { codigo: 'CENTRAL', nombre: 'Almacén central', direccion: 'Trujillo' },
      '00000000-0000-4000-8000-000000000001',
    )

    expect(rpc).toHaveBeenCalledWith('save_warehouse', { payload: {
      organization_id: 'organizacion-1',
      operation_key: '00000000-0000-4000-8000-000000000001',
      code: 'CENTRAL',
      name: 'Almacén central',
      address: 'Trujillo',
    } })
  })

  it('crea ubicaciones mediante el RPC autoritativo e idempotente', async () => {
    rpc.mockResolvedValue({ data: 'ubicacion-1', error: null })

    await crearUbicacion(
      'organizacion-1',
      { almacenId: 'almacen-1', codigo: 'A-01', nombre: 'Anaquel 1', descripcion: '' },
      '00000000-0000-4000-8000-000000000002',
    )

    expect(rpc).toHaveBeenCalledWith('save_warehouse_location', { payload: {
      organization_id: 'organizacion-1',
      operation_key: '00000000-0000-4000-8000-000000000002',
      warehouse_id: 'almacen-1',
      code: 'A-01',
      name: 'Anaquel 1',
      description: '',
    } })
  })

  it('edita un almacén con control optimista de concurrencia', async () => {
    rpc.mockResolvedValue({ data: 'almacen-1', error: null })

    await editarAlmacen(
      'organizacion-1',
      { id: 'almacen-1', codigo: 'CENTRAL', nombre: 'Anterior', direccion: '', activo: true, version: 4 },
      { codigo: 'IGNORADO', nombre: 'Almacén principal', direccion: 'Trujillo' },
      '00000000-0000-4000-8000-000000000003',
    )

    expect(rpc).toHaveBeenCalledWith('save_warehouse', { payload: {
      id: 'almacen-1',
      organization_id: 'organizacion-1',
      operation_key: '00000000-0000-4000-8000-000000000003',
      expected_lock_version: 4,
      code: 'CENTRAL',
      name: 'Almacén principal',
      address: 'Trujillo',
    } })
  })

  it('edita una ubicación sin permitir cambiar su identidad física', async () => {
    rpc.mockResolvedValue({ data: 'ubicacion-1', error: null })

    await editarUbicacion(
      'organizacion-1',
      { id: 'ubicacion-1', almacenId: 'almacen-1', codigo: 'A-01', nombre: 'Anterior', descripcion: '', activa: true, version: 2 },
      { almacenId: 'otro-almacen', codigo: 'OTRO', nombre: 'Anaquel frío', descripcion: 'Segundo nivel' },
      '00000000-0000-4000-8000-000000000004',
    )

    expect(rpc).toHaveBeenCalledWith('save_warehouse_location', { payload: {
      id: 'ubicacion-1',
      organization_id: 'organizacion-1',
      operation_key: '00000000-0000-4000-8000-000000000004',
      expected_lock_version: 2,
      warehouse_id: 'almacen-1',
      code: 'A-01',
      name: 'Anaquel frío',
      description: 'Segundo nivel',
    } })
  })

  it('activa o desactiva maestros conservando versión y operación', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    await cambiarEstadoAlmacen(
      'organizacion-1',
      { id: 'almacen-1', codigo: 'CENTRAL', nombre: 'Central', direccion: '', activo: true, version: 7 },
      '00000000-0000-4000-8000-000000000005',
    )
    await cambiarEstadoUbicacion(
      'organizacion-1',
      { id: 'ubicacion-1', almacenId: 'almacen-1', codigo: 'A-01', nombre: 'Anaquel', descripcion: '', activa: false, version: 3 },
      '00000000-0000-4000-8000-000000000006',
    )

    expect(rpc).toHaveBeenNthCalledWith(1, 'set_warehouse_status', { payload: {
      id: 'almacen-1',
      organization_id: 'organizacion-1',
      operation_key: '00000000-0000-4000-8000-000000000005',
      expected_lock_version: 7,
      is_active: false,
    } })
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_warehouse_location_status', { payload: {
      id: 'ubicacion-1',
      organization_id: 'organizacion-1',
      operation_key: '00000000-0000-4000-8000-000000000006',
      expected_lock_version: 3,
      is_active: true,
    } })
  })
})
