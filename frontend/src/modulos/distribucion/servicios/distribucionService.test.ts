import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  listarEntregas,
  listarHistorialEstadosEntrega,
  listarMovimientosDisponibles,
  listarTrazabilidadEntrega,
  prepararPayloadEntrega,
  reprogramarEntrega,
} from './distribucionService'

function cadena(respuesta: { data: unknown; error: { code?: string; message?: string } | null }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    then: (resolve: (value: typeof respuesta) => unknown) => Promise.resolve(respuesta).then(resolve),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.order.mockReturnValue(query)
  return query
}

describe('lectura persistente de distribución', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock.rpc.mockResolvedValue({ data: [], error: null })
  })

  it('carga líneas de SQL y expone saldos parciales y completos', async () => {
    supabaseMock.from
      .mockReturnValueOnce(cadena({
        data: [{
          id: 'entrega-1', order_id: 'pedido-1', sale_id: null, sale_number: null,
          order_number: 'PED-000001', customer_name: 'Snapshot ignorado',
          issue_date: '2026-09-01', delivery_date: '2026-09-02', guide_number: 'G-001',
          transport_type: 'interno', tracking_status: 'en_curso', delivery_status: 'entrega_parcial',
          direction: 'Av. Persistente 123', numero_despacho: 'DES-001', modalidad: 'movilidad_propia',
          transportista: '', conductor: '', vehiculo: '', placa: '', evidencia: '', incidencias: [],
          quantity_reconciliation_required: false,
          observations: '', order_items: [{ id: 'snapshot-falso', productoDescripcion: 'No usar', cantidad: 999 }],
          created_at: '2026-09-01T00:00:00.000Z',
        }],
        error: null,
      }))
      .mockReturnValueOnce(cadena({
        data: [{
          id: 'pedido-1', organization_id: 'org-1', order_number: 'PED-000001', source_quote_id: null,
          source_quote_number: null, customer_id: 'cliente-1', warehouse_id: 'almacen-1',
          order_date: '2026-09-01', status: 'confirmado', prices_include_tax: true, notes: '',
          created_at: '2026-09-01T00:00:00.000Z',
          customers: { document_type: 'RUC', document_number: '20111111111', legal_name: 'Cliente SQL' },
          warehouses: { code: 'MAIN', name: 'Almacén principal' },
          order_items: [
             { id: 'order-item-1', product_id: 'product-1', product_type: 'good', service_completed_quantity: 0, product_code: 'P-1', product_description: 'Producto parcial', unit_of_measure: 'UND', quantity: 2, unit_price: 10 },
             { id: 'order-item-2', product_id: 'product-2', product_type: 'good', service_completed_quantity: 0, product_code: 'P-2', product_description: 'Producto completo', unit_of_measure: 'CAJA', quantity: 3, unit_price: 12 },
          ],
        }],
        error: null,
      }))
      .mockReturnValueOnce(cadena({
        data: [{
          id: 'sale-1', organization_id: 'org-1', order_id: 'pedido-1', customer_id: 'cliente-1',
          internal_number: 'VEN-000001', document_type: 'factura', series: 'F001', document_number: '1',
          sale_date: '2026-09-01', warehouse: 'Almacén principal', prices_include_tax: true,
          status: 'registrada', created_at: '2026-09-01T00:00:00.000Z', orders: { order_number: 'PED-000001' },
          customers: { document_type: 'RUC', document_number: '20111111111', legal_name: 'Cliente SQL' },
          sale_items: [
            { id: 'sale-item-1', order_item_id: 'order-item-1', product_id: 'product-1', product_code: 'P-1', product_description: 'Producto parcial', unit_of_measure: 'UND', quantity: 2, unit_price: 10 },
            { id: 'sale-item-2', order_item_id: 'order-item-2', product_id: 'product-2', product_code: 'P-2', product_description: 'Producto completo', unit_of_measure: 'CAJA', quantity: 3, unit_price: 12 },
          ],
        }],
        error: null,
      }))
      .mockReturnValueOnce(cadena({
        data: [
          { delivery_id: 'entrega-1', order_line_id: 'order-item-1', quantity: 2 },
          { delivery_id: 'entrega-1', order_line_id: 'order-item-2', quantity: 1 },
        ],
        error: null,
      }))
      .mockReturnValueOnce(cadena({
        data: [
          { id: 'resultado-1', delivery_id: 'entrega-1', result_status: 'entrega_parcial', occurred_on: '2026-09-02', evidence: 'firma parcial', incidents: [], created_at: '2026-09-02T12:00:00.000Z' },
          { id: 'resultado-2', delivery_id: 'entrega-1', result_status: 'rechazado', failure_category: 'cliente_ausente', occurred_on: '2026-09-03', evidence: '', incidents: ['Cliente ausente'], created_at: '2026-09-03T12:00:00.000Z' },
        ],
        error: null,
      }))
      .mockReturnValueOnce(cadena({
        data: [
          { source_id: 'order-item-1', quantity: 2, quantity_consumed: 1, status: 'active' },
          { source_id: 'order-item-2', quantity: 3, quantity_consumed: 3, status: 'consumed' },
        ],
        error: null,
      }))
      .mockReturnValueOnce(cadena({
        data: [{ outcome_id: 'resultado-1', order_line_id: 'order-item-1', quantity_delivered: '1' }],
        error: null,
      }))

    const [entrega] = await listarEntregas('org-1')

    expect(entrega).toMatchObject({
      pedidoNumero: 'PED-000001',
      clienteNombre: 'Cliente SQL',
      ventaId: 'sale-1',
      ventaNumero: 'VEN-000001',
      lineas: [
          expect.objectContaining({ id: 'order-item-1', productoDescripcion: 'Producto parcial', cantidad: 2, cantidadDespachada: 1, cantidadPendiente: 1, cantidadEntregadaCliente: 1, cantidadPendienteCliente: 1 }),
          expect.objectContaining({ id: 'order-item-2', productoDescripcion: 'Producto completo', cantidad: 1, cantidadDespachada: 3, cantidadPendiente: 0, cantidadEntregadaCliente: 0, cantidadPendienteCliente: 1 }),
        ],
      resultadosEntrega: [
        expect.objectContaining({ id: 'resultado-1', resultado: 'entrega_parcial', fecha: '2026-09-02', lineas: [{ orderLineId: 'order-item-1', cantidad: 1 }] }),
        expect.objectContaining({ id: 'resultado-2', resultado: 'rechazado', categoriaIncidencia: 'cliente_ausente', fecha: '2026-09-03' }),
      ],
    })
    expect(entrega.lineas).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'snapshot-falso' })]))
  })

  it('mapea en la bitácora los cambios de etapa y de fecha programada', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [
        {
          event_id: 'status-1', event_type: 'status', from_status: 'preparando', to_status: 'en_curso',
          from_scheduled_date: null, to_scheduled_date: null, actor_name: 'Operador', occurred_at: '2026-09-02T10:00:00Z',
        },
        {
          event_id: 'schedule-1', event_type: 'schedule', from_status: null, to_status: null,
          from_scheduled_date: '2026-09-02', to_scheduled_date: '2026-09-04', schedule_reason: 'Cliente pidió recibirlo el viernes', actor_name: 'Operador', occurred_at: '2026-09-02T11:00:00Z',
        },
      ],
      error: null,
    })

    await expect(listarHistorialEstadosEntrega('org-1', 'entrega-1')).resolves.toEqual([
      expect.objectContaining({ id: 'status-1', tipo: 'status', estadoAnterior: 'preparando', estadoNuevo: 'en_curso' }),
      expect.objectContaining({ id: 'schedule-1', tipo: 'schedule', fechaProgramadaAnterior: '2026-09-02', fechaProgramadaNueva: '2026-09-04', motivoReprogramacion: 'Cliente pidió recibirlo el viernes' }),
    ])
  })

  it('envía la reprogramación como comando acotado sin reenviar la planificación completa', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'delivery-1', error: null })

    await reprogramarEntrega('org-1', 'delivery-1', 7, '2026-09-26', 'Cliente pidió otra fecha', 'operation-1')

    expect(supabaseMock.rpc).toHaveBeenCalledWith('reschedule_distribution_delivery', {
      payload: {
        organization_id: 'org-1',
        delivery_id: 'delivery-1',
        expected_lock_version: 7,
        operation_key: 'operation-1',
        scheduled_date: '2026-09-26',
        reason: 'Cliente pidió otra fecha',
      },
    })
  })
})

describe('payloads de asignación a envíos independientes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock.rpc.mockResolvedValue({ data: [], error: null })
  })

  it('envía solo las líneas con cantidad asignada, identificadas por línea persistente', () => {
    const payload = prepararPayloadEntrega('org-1', {
      pedidoId: 'order-1', pedidoNumero: 'PED-000001', ventaId: 'sale-1', ventaNumero: 'VEN-000001',
      clienteNombre: 'Cliente', direccionEntrega: 'Av. Principal 123', numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001', fechaEmision: '2026-09-01', fechaProgramada: '2026-09-02',
      fechaEntrega: '', tipoTransporte: 'interno', modalidad: 'movilidad_propia', transportista: '',
      conductor: '', vehiculo: '', placa: '', observaciones: '', evidencia: '', estado: 'programado',
      incidencias: [], lineas: [],
    }, [
      { id: 'order-line-1', productoId: 'product-1', tipoProducto: 'good', productoCodigo: 'P-1', productoDescripcion: 'Producto 1', unidadMedida: 'UND', cantidad: 2, precioUnitario: 10, lote: '', fechaVencimiento: '' },
      { id: 'order-line-2', productoId: 'product-2', tipoProducto: 'good', productoCodigo: 'P-2', productoDescripcion: 'Producto 2', unidadMedida: 'UND', cantidad: 0, precioUnitario: 10, lote: '', fechaVencimiento: '' },
    ])

    expect(payload.items).toEqual([{
      order_line_id: 'order-line-1',
      quantity: 2,
      movement_allocations: [],
    }])
  })

  it('envía allocations explícitas sin convertir la referencia documental en una relación', () => {
    const payload = prepararPayloadEntrega('org-1', {
      pedidoId: 'order-1', pedidoNumero: 'PED-000001', ventaId: 'sale-1', ventaNumero: 'VEN-000001',
      clienteNombre: 'Cliente', direccionEntrega: 'Av. Principal 123', numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001', fechaEmision: '2026-09-01', fechaProgramada: '2026-09-02',
      fechaEntrega: '', tipoTransporte: 'interno', modalidad: 'movilidad_propia', transportista: '',
      conductor: '', vehiculo: '', placa: '', observaciones: '', evidencia: '', estado: 'programado',
      incidencias: [], lineas: [],
    }, [{
      id: 'order-line-1', productoId: 'product-1', tipoProducto: 'good', productoCodigo: 'P-1',
      productoDescripcion: 'Producto 1', unidadMedida: 'UND', cantidad: 2, precioUnitario: 10,
      lote: '', fechaVencimiento: '', asignacionesMovimiento: [
        { inventoryMovementId: '11111111-1111-4111-8111-111111111111', quantity: 1.25 },
        { inventoryMovementId: '22222222-2222-4222-8222-222222222222', quantity: 0.75 },
      ],
    }])

    expect(payload.items).toEqual([{
      order_line_id: 'order-line-1',
      quantity: 2,
      movement_allocations: [
        { inventory_movement_id: '11111111-1111-4111-8111-111111111111', quantity: 1.25 },
        { inventory_movement_id: '22222222-2222-4222-8222-222222222222', quantity: 0.75 },
      ],
    }])
  })

  it('normaliza movimientos disponibles y traza sin perder los atributos del ledger', async () => {
    supabaseMock.rpc
      .mockResolvedValueOnce({
        data: [{
          inventory_movement_id: 'movement-1', order_item_id: 'line-1',
          quantity_physical: '60', quantity_allocated: '10', quantity_available: '50',
          lot: 'L1', expiration_date: '2027-01-01', warehouse: 'Principal',
          warehouse_id: 'warehouse-1', location_id: 'location-1', stock_status: 'available',
          reservation_id: 'reservation-1', document_reference: 'PED:PED-000001|OP:operation-1',
          operation_date: '2026-09-29', operation_key: 'operation-1',
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          delivery_id: 'delivery-1', order_id: 'order-1', order_item_id: 'line-1',
          inventory_movement_id: 'movement-1', allocated_quantity: '10',
          lot: 'L1', expiration_date: '2027-01-01', warehouse: 'Principal',
          warehouse_id: 'warehouse-1', location_id: 'location-1', stock_status: 'available',
          reservation_id: 'reservation-1', document_reference: null,
          operation_date: '2026-09-29', operation_key: 'operation-1',
        }],
        error: null,
      })

    await expect(listarMovimientosDisponibles('org-1', 'order-1', 'delivery-1')).resolves.toEqual([
      expect.objectContaining({ inventoryMovementId: 'movement-1', cantidadFisica: 60, cantidadAsignada: 10, cantidadDisponible: 50, lote: 'L1' }),
    ])
    await expect(listarTrazabilidadEntrega('org-1', 'delivery-1')).resolves.toEqual([
      expect.objectContaining({ entregaId: 'delivery-1', pedidoId: 'order-1', orderLineId: 'line-1', cantidadAsignada: 10, lote: 'L1', referenciaDocumento: null }),
    ])
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(1, 'list_distribution_inventory_movements', {
      requested_organization_id: 'org-1',
      requested_order_id: 'order-1',
      requested_delivery_id: 'delivery-1',
    })
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(2, 'list_distribution_delivery_inventory_trace', {
      requested_organization_id: 'org-1',
      requested_delivery_id: 'delivery-1',
    })
  })
})
