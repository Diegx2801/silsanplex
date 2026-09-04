import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'
import {
  actualizarCantidadesPedidoPersistente,
  cancelarPedidoPersistente,
  crearPedidoPersistente,
  despacharVentaPersistente,
  listarPedidosPersistentes,
  listarVentasPersistentes,
  registrarVentaPersistente,
} from './ventasService'

function cadena(respuesta: { data: unknown; error: { message: string } | null }) {
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

const cotizacion = {
  id: 'cotizacion-1', numero: 'COT-000001', clienteId: 'cliente-1', clienteDocumento: '20548796321', clienteNombre: 'Cliente Uno',
  fechaEmision: '2026-09-01', fechaValidez: '2026-09-30', preciosIncluyenIgv: true, observacion: '',
  lineas: [{ id: 'cot-linea-1', productoId: 'producto-1', productoCodigo: 'P-1', productoDescripcion: 'Producto', unidadMedida: 'UND', cantidad: 2, precioUnitario: 10 }],
  estado: 'emitida', fechaRegistro: '2026-09-01T12:00:00.000Z', fechaCambioEstado: null,
} satisfies Cotizacion

describe('ventasService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('crea pedidos mediante una RPC con clave idempotente y líneas normalizadas', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'pedido-1', error: null })

    await expect(crearPedidoPersistente('org-1', cotizacion, 'warehouse-1')).resolves.toBe('pedido-1')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('create_order', {
      payload: expect.objectContaining({
        organization_id: 'org-1',
        operation_key: 'cotizacion-1',
        source_quote_id: 'cotizacion-1',
        warehouse_id: 'warehouse-1',
        items: [{ product_id: 'producto-1', quantity: 2, unit_price: 10 }],
      }),
    })
  })

  it('traduce conflictos de idempotencia de pedidos y ventas', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'ORDER_IDEMPOTENCY_CONFLICT' } })
    await expect(crearPedidoPersistente('org-1', cotizacion, 'warehouse-1')).rejects.toThrow('La clave de operación del pedido ya fue usada con datos diferentes')

    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'SALE_IDEMPOTENCY_CONFLICT' } })
    await expect(registrarVentaPersistente('org-1', 'pedido-1', {
      tipoDocumento: 'factura', serie: 'f001', numeroDocumento: '1', fechaVenta: '2026-09-01', almacen: 'Principal',
    })).rejects.toThrow('La clave de operación de la venta ya fue usada con datos diferentes')
  })

  it('expone un error de stock asignable insuficiente', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'INVENTORY_FEFO_INSUFFICIENT_STOCK' },
    })

    await expect(crearPedidoPersistente('org-1', cotizacion, 'warehouse-1'))
      .rejects.toThrow('No hay stock asignable suficiente en el almacén seleccionado')
  })

  it('mapea pedidos persistentes con cliente y líneas', async () => {
    supabaseMock.from
      .mockReturnValueOnce(cadena({
      data: [{
        id: 'pedido-1', organization_id: 'org-1', order_number: 'PED-000001', source_quote_id: 'cotizacion-1', source_quote_number: 'COT-000001',
        customer_id: 'cliente-1', warehouse_id: 'warehouse-1', order_date: '2026-09-01', status: 'confirmado', prices_include_tax: true, notes: '', created_at: '2026-09-01T12:00:00.000Z',
        customers: { document_type: 'RUC', document_number: '20548796321', legal_name: 'Cliente Uno' },
        warehouses: { code: 'MAIN', name: 'Almacén principal' },
        order_items: [{ id: 'linea-1', product_id: 'producto-1', product_code: 'P-1', product_description: 'Producto', unit_of_measure: 'UND', quantity: 2, unit_price: 10 }],
      }],
      error: null,
    }))

    await expect(listarPedidosPersistentes('org-1')).resolves.toEqual([
      expect.objectContaining({ id: 'pedido-1', numero: 'PED-000001', clienteNombre: 'Cliente Uno', almacenId: 'warehouse-1', almacenNombre: 'Almacén principal', lineas: [expect.objectContaining({ cantidad: 2 })] }),
    ])
  })

  it('mapea ventas persistentes manteniendo el pedido de origen', async () => {
    supabaseMock.from
      .mockReturnValueOnce(cadena({
      data: [{
        id: 'venta-1', organization_id: 'org-1', order_id: 'pedido-1', customer_id: 'cliente-1', internal_number: 'VEN-000001',
        document_type: 'factura', series: 'F001', document_number: '1', sale_date: '2026-09-01', warehouse: 'Principal', prices_include_tax: true,
        status: 'registrada', created_at: '2026-09-01T12:00:00.000Z', orders: { order_number: 'PED-000001' },
        customers: { document_type: 'RUC', document_number: '20548796321', legal_name: 'Cliente Uno' },
        sale_items: [{ id: 'sale-linea-1', order_item_id: 'linea-1', product_id: 'producto-1', product_code: 'P-1', product_description: 'Producto', unit_of_measure: 'UND', quantity: 2, unit_price: 10 }],
      }],
      error: null,
    }))
      .mockReturnValueOnce(cadena({
        data: [{ source_id: 'linea-1', quantity: 2, quantity_consumed: 1, status: 'active' }],
        error: null,
      }))

    await expect(listarVentasPersistentes('org-1')).resolves.toEqual([
      expect.objectContaining({
        pedidoId: 'pedido-1', pedidoNumero: 'PED-000001', numeroInterno: 'VEN-000001', clienteId: 'cliente-1',
        lineas: [expect.objectContaining({ cantidadDespachada: 1, cantidadPendiente: 1 })],
      }),
    ])
  })

  it('convierte un pedido mediante la RPC atómica de venta', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'venta-1', error: null })

    await expect(registrarVentaPersistente('org-1', 'pedido-1', {
      tipoDocumento: 'factura', serie: 'f001', numeroDocumento: '1', fechaVenta: '2026-09-01', almacen: 'Principal',
    })).resolves.toBe('venta-1')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('create_sale_from_order', {
      requested_organization_id: 'org-1',
      requested_order_id: 'pedido-1',
      payload: expect.objectContaining({ operation_key: 'pedido-1', document_type: 'factura' }),
    })
  })

  it('actualiza cantidades mediante una sola RPC y conserva la clave de operación', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'pedido-1', error: null })

    await expect(actualizarCantidadesPedidoPersistente(
      'org-1',
      'pedido-1',
      [{ orderItemId: 'linea-1', quantity: 6 }],
      '00000000-0000-4000-8000-000000000001',
    )).resolves.toBe('pedido-1')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('update_order_quantities', {
      payload: {
        organization_id: 'org-1',
        order_id: 'pedido-1',
        operation_key: '00000000-0000-4000-8000-000000000001',
        items: [{ order_item_id: 'linea-1', quantity: 6 }],
      },
    })
  })

  it('cancela mediante una RPC y traduce el estado incompatible', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'pedido-1', error: null })
    await expect(cancelarPedidoPersistente('org-1', 'pedido-1', '00000000-0000-4000-8000-000000000002')).resolves.toBe('pedido-1')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('cancel_order', {
      payload: { organization_id: 'org-1', order_id: 'pedido-1', operation_key: '00000000-0000-4000-8000-000000000002' },
    })

    supabaseMock.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ORDER_NOT_CANCELLABLE' } })
    await expect(cancelarPedidoPersistente('org-1', 'pedido-1', '00000000-0000-4000-8000-000000000003')).rejects.toThrow('El pedido ya no puede cancelarse')
  })

  it('despacha mediante la RPC transaccional y conserva la clave para reintentos', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'pedido-1', error: null })

    await expect(despacharVentaPersistente(
      'org-1',
      'pedido-1',
      'venta-1',
      [{ orderItemId: 'linea-1', quantity: 1 }],
      '00000000-0000-4000-8000-000000000004',
      '2026-09-01',
    )).resolves.toBe('pedido-1')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('dispatch_order_from_reservations', {
      payload: {
        organization_id: 'org-1',
        order_id: 'pedido-1',
        sale_id: 'venta-1',
        operation_key: '00000000-0000-4000-8000-000000000004',
        operation_date: '2026-09-01',
        items: [{ order_item_id: 'linea-1', quantity: 1 }],
      },
    })
  })

  it('traduce el exceso sobre el saldo reservado', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ORDER_DISPATCH_EXCEEDS_RESERVED' } })
    await expect(despacharVentaPersistente('org-1', 'pedido-1', 'venta-1', [{ orderItemId: 'linea-1', quantity: 4 }]))
      .rejects.toThrow('La cantidad supera el saldo reservado pendiente')
  })
})
