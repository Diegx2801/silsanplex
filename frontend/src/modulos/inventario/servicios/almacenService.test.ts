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
  obtenerConfiguracionAlertasStock,
  transferirInventario,
} from './almacenService'

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { from, rpc } }))

function crearQuery(data: Record<string, unknown>[] = [], count = data.length) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const metodo of ['select', 'eq', 'neq', 'or', 'ilike', 'gte', 'lte', 'order']) {
    query[metodo] = vi.fn(() => query)
  }
  query.range = vi.fn(() => Promise.resolve({ data, count, error: null }))
  query.maybeSingle = vi.fn(() => Promise.resolve({ data: data[0] ?? null, error: null }))
  from.mockReturnValue(query)
  return query
}

const base = { pagina: 2, tamanioPagina: 50 as const, busqueda: '', almacenId: '' }

describe('transferencia de posición exacta', () => {
  const datos = {
    productoId: 'producto-1', almacenOrigenId: 'almacen-1', ubicacionOrigenId: 'anaquel-1',
    almacenDestinoId: 'almacen-1', ubicacionDestinoId: 'anaquel-2', cantidad: '2',
    lote: 'LOTE-ESPECIFICO', fechaVencimiento: '2029-01-01', estado: 'available' as const,
    notas: 'Reubicación autorizada', unidadEntradaId: 'caja-1', factorConversionEsperado: 20,
  }

  beforeEach(() => { rpc.mockReset() })

  it('envía posición, cantidad capturada y UUID de reintento sin FEFO ni conversión en cliente', async () => {
    rpc.mockResolvedValue({ data: 'transferencia-1', error: null })
    await transferirInventario('org-1', datos, 'operacion-estable')
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('transfer_inventory_position', { payload: {
      organization_id: 'org-1', operation_key: 'operacion-estable', product_id: 'producto-1',
      source_warehouse_id: 'almacen-1', source_location_id: 'anaquel-1',
      destination_warehouse_id: 'almacen-1', destination_location_id: 'anaquel-2',
      quantity: '2', input_unit_id: 'caja-1', expected_conversion_factor: 20,
      lot: 'LOTE-ESPECIFICO', expiration_date: '2029-01-01', stock_status: 'available',
      notes: 'Reubicación autorizada',
    } })
  })

  it('conserva el contrato exacto también para cuarentena sin vencimiento ni unidad alternativa', async () => {
    rpc.mockResolvedValue({ data: 'transferencia-1', error: null })
    await transferirInventario('org-1', {
      ...datos, referencia: 'LEGACY-IGNORADO', estado: 'quarantine', fechaVencimiento: '',
      unidadEntradaId: '', factorConversionEsperado: undefined,
    }, 'operacion-estable')
    expect(rpc).toHaveBeenCalledWith('transfer_inventory_position', { payload: expect.objectContaining({
      stock_status: 'quarantine', input_unit_id: null, expected_conversion_factor: null,
      expiration_date: null, source_location_id: 'anaquel-1',
    }) })
    expect(rpc.mock.calls[0][1].payload).not.toHaveProperty('reference')
  })

  it.each([
    ['TRANSFER_INSUFFICIENT_STOCK', 'stock no reservado'],
    ['TRANSFER_POSITION_MUST_DIFFER', 'destino diferente'],
    ['TRANSFER_SOURCE_POSITION_UNAVAILABLE', 'posición de origen'],
    ['TRANSFER_OPERATION_CONFLICT', 'intento anterior'],
    ['TRANSFER_WAREHOUSE_UNAVAILABLE', 'ya no está activo'],
    ['TRANSFER_LOCATION_UNAVAILABLE', 'ya no está activa'],
    ['INVENTORY_INPUT_UNIT_STALE', 'equivalencia de la unidad cambió'],
    ['INVENTORY_INPUT_UNIT_INVALID', 'unidad de medida configurada'],
    ['INVENTORY_QUANTITY_CONVERSION_INVALID', '3 decimales'],
    ['TRANSFER_UNIT_COST_INVALID', 'valorización'],
    ['TRANSFER_OPERATION_KEY_REQUIRED', 'identificar el intento'],
    ['TRANSFER_DETAILS_INVALID', 'lote y las notas'],
    ['INVENTORY_STATUS_INVALID', 'condición de stock válida'],
  ])('explica %s sin ocultar el fallo', async (message, texto) => {
    rpc.mockResolvedValue({ data: null, error: { message } })
    await expect(transferirInventario('org-1', datos, 'operacion-estable')).rejects.toThrow(texto)
  })
})

describe('listados paginados de almacén', () => {
  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
  })

  it('pagina stock detallado con filtros persistentes', async () => {
    rpc.mockResolvedValue({ data: { items: [{ physical_quantity: '10', reserved_quantity: '3', assignable_quantity: '7' }], total_count: 120 }, error: null })
    const resultado = await listarStockDetallado('org-1', {
      ...base,
      ubicacionId: 'ubicacion-1', lote: 'L-01', estado: 'available',
      vencimientoDesde: '2026-01-01', vencimientoHasta: '2026-12-31', orden: 'vencimiento-asc',
    })
    expect(rpc).toHaveBeenCalledWith('inventory_stock_detail_read', {
      requested_organization_id: 'org-1', search_term: '', requested_warehouse_id: null,
      requested_location_id: 'ubicacion-1', requested_lot: 'L-01', requested_status: 'available',
      expiration_from: '2026-01-01', expiration_to: '2026-12-31',
      requested_sort: 'vencimiento-asc', requested_limit: 50, requested_offset: 50,
    })
    expect(resultado.total).toBe(120)
    expect(resultado.elementos[0]).toMatchObject({ cantidad: 10, cantidadReservada: 3, cantidadAsignable: 7 })
    expect(from).not.toHaveBeenCalled()
  })

  it('pagina alertas con conteo exacto', async () => {
    rpc.mockResolvedValue({ data: { items: [], total_count: 1_205 }, error: null })
    const resultado = await listarAlertasStock('org-1', { ...base, orden: 'stock-asc' })
    expect(rpc).toHaveBeenCalledWith('inventory_low_stock_alerts_read', {
      requested_organization_id: 'org-1',
      search_term: '',
      requested_warehouse_id: null,
      requested_sort: 'stock-asc',
      requested_limit: 50,
      requested_offset: 50,
    })
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

  it('lee la captura histórica en Kardex sin convertir el saldo base', async () => {
    const query = crearQuery([{
      unit_of_measure: 'Unidad', entered_quantity: '10', entered_unit_of_measure: 'Caja', unit_conversion_factor: '20',
      inbound_quantity: '200', outbound_quantity: '0', running_quantity: '200', running_value: '1000',
    }])
    const resultado = await listarKardex('org-1', { ...base, fechaDesde: '', fechaHasta: '', orden: 'fecha-desc' })
    expect(query.select.mock.calls[0][0]).toContain('entered_quantity,entered_unit_of_measure,unit_conversion_factor')
    expect(resultado.elementos[0]).toMatchObject({
      cantidadCapturada: 10, unidadCapturada: 'Caja', factorConversion: 20, unidadMedida: 'Unidad',
      cantidadEntrada: 200, cantidadSalida: 0, saldoCantidad: 200, saldoValor: 1000,
    })
  })

  it('permite buscar referencias registradas en el Kardex', async () => {
    const query = crearQuery()
    await listarKardex('org-1', {
      ...base, busqueda: 'AJ-2026-001', fechaDesde: '', fechaHasta: '', orden: 'fecha-desc',
    })
    expect(query.or).toHaveBeenCalledWith(
      'product_code.ilike.%AJ-2026-001%,product_description.ilike.%AJ-2026-001%,lot.ilike.%AJ-2026-001%,document_reference.ilike.%AJ-2026-001%',
    )
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

  it('expone las ubicaciones únicas para distinguir reubicaciones dentro del mismo almacén', async () => {
    crearQuery([{
      id: 'transferencia-1', source_warehouse_id: 'almacen-1', destination_warehouse_id: 'almacen-1',
      warehouse_transfer_items: [{ source_location_id: 'anaquel-1', destination_location_id: 'anaquel-2' }],
    }])
    const resultado = await listarTransferencias('org-1', { ...base, fechaDesde: '', fechaHasta: '', orden: 'fecha-desc' })
    expect(resultado.elementos[0]).toMatchObject({ ubicacionOrigenId: 'anaquel-1', ubicacionDestinoId: 'anaquel-2' })
  })

  it('no presenta un único origen falso para transferencias históricas con varias posiciones', async () => {
    crearQuery([{
      warehouse_transfer_items: [
        { source_location_id: 'anaquel-1', destination_location_id: 'anaquel-3' },
        { source_location_id: 'anaquel-2', destination_location_id: 'anaquel-3' },
      ],
    }])
    const resultado = await listarTransferencias('org-1', { ...base, fechaDesde: '', fechaHasta: '', orden: 'fecha-desc' })
    expect(resultado.elementos[0].ubicacionOrigenId).toBeUndefined()
    expect(resultado.elementos[0].ubicacionDestinoId).toBe('anaquel-3')
  })
})

describe('configuración de control de stock', () => {
  beforeEach(() => from.mockReset())

  it('recupera la política guardada por producto y almacén', async () => {
    const query = crearQuery([{
      default_location_id: 'ubicacion-1',
      minimum_stock: '5.250',
      expiration_alert_days: 45,
    }])

    await expect(obtenerConfiguracionAlertasStock('org-1', 'producto-1', 'almacen-1'))
      .resolves.toEqual({
        ubicacionId: 'ubicacion-1',
        stockMinimo: 5.25,
        diasVencimiento: 45,
      })

    expect(from).toHaveBeenCalledWith('product_warehouse_settings')
    expect(query.eq).toHaveBeenNthCalledWith(1, 'organization_id', 'org-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'product_id', 'producto-1')
    expect(query.eq).toHaveBeenNthCalledWith(3, 'warehouse_id', 'almacen-1')
  })

  it('retorna null cuando la combinación aún no tiene política guardada', async () => {
    crearQuery([])

    await expect(obtenerConfiguracionAlertasStock('org-1', 'producto-1', 'almacen-1'))
      .resolves.toBeNull()
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
