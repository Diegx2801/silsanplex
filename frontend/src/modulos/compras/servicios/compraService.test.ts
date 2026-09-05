import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  anularCompraPersistente,
  guardarCompraPersistente,
  listarAlmacenesCompra,
  listarCompras,
  listarUbicacionesCompra,
  recibirCompraPersistente,
} from './compraService'

function cadena(respuesta: { data: unknown; error: { message: string } | null }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: (resolve: (value: typeof respuesta) => unknown) =>
      Promise.resolve(respuesta).then(resolve),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.order.mockReturnValue(query)
  return query
}

describe('compraService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mapea el almacén maestro de la orden', async () => {
    supabaseMock.from.mockReturnValue(cadena({
      data: [{
        id: 'compra-1', supplier_id: 'proveedor-1', supplier_document: '20123456789',
        supplier_name: 'Proveedor SAC', document_type: 'factura', series: 'F001',
        document_number: '1', issue_date: '2026-08-31', payment_due_date: null,
        expected_delivery_date: null, warehouse_id: 'almacen-1', warehouse: 'Principal',
        prices_include_tax: true, taxable_base: 0, exempt_amount: 20, unaffected_amount: 0,
        subtotal: 20, tax: 0, total: 20, tax_calculation_status: 'calculated',
        notes: null, status: 'draft', issued_at: null,
        received_at: null, created_at: '2026-08-31T12:00:00.000Z', purchase_order_items: [{
          id: 'linea-1', product_id: 'producto-1', product_code: 'P-1',
          product_description: 'Producto', unit_of_measure: 'UND', tax_affectation: 'exonerado', batch_control: false,
          quantity: 2, unit_cost: 10, lot: null, expiration_date: null,
          products: [{ expiration_control: false }], purchase_receipt_items: [],
        }],
      }],
      error: null,
    }))

    await expect(listarCompras('org-1')).resolves.toEqual([
      expect.objectContaining({ almacenId: 'almacen-1', almacen: 'Principal', lineas: [expect.objectContaining({ afectacionIgv: 'exonerado' })] }),
    ])
  })

  it('lista almacenes aislados por organización', async () => {
    const query = cadena({
      data: [{ id: 'almacen-1', code: 'ALM-01', name: 'Principal', address: null, is_active: true, warehouse_locations: [{ id: 'ubicacion-1' }] }],
      error: null,
    })
    supabaseMock.from.mockReturnValue(query)

    await expect(listarAlmacenesCompra('org-1')).resolves.toEqual([
      { id: 'almacen-1', codigo: 'ALM-01', nombre: 'Principal', direccion: '', activo: true },
    ])
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(query.eq).toHaveBeenCalledWith('warehouse_locations.is_active', true)
  })

  it('envía el identificador de almacén a la RPC transaccional', async () => {
    supabaseMock.rpc.mockResolvedValue({ error: null })

    await guardarCompraPersistente('org-1', {
      proveedorId: 'proveedor-1', tipoDocumento: 'factura', serie: 'F001', numero: '1',
      fechaEmision: '2026-08-31', fechaVencimientoPago: '', fechaEntregaEsperada: '',
      almacenId: 'a1111111-1111-4111-8111-111111111111', almacen: 'Principal',
      preciosIncluyenIgv: true, observacion: '', lineas: [{
        productoId: 'producto-1', cantidad: '2', costoUnitario: '10', lote: '', fechaVencimiento: '',
      }],
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('save_purchase_order', {
      payload: expect.objectContaining({
        organization_id: 'org-1',
        warehouse_id: 'a1111111-1111-4111-8111-111111111111',
      }),
    })
    const payload = supabaseMock.rpc.mock.calls[0][1].payload
    expect(payload).not.toEqual(expect.objectContaining({
      tax_affectation: expect.anything(),
      taxable_base: expect.anything(),
      exempt_amount: expect.anything(),
      unaffected_amount: expect.anything(),
      subtotal: expect.anything(),
      tax: expect.anything(),
      total: expect.anything(),
    }))
  })

  it('lista únicamente ubicaciones activas de la organización', async () => {
    const query = cadena({
      data: [{ id: 'u-1', warehouse_id: 'a-1', code: 'R01', name: 'Rack 1', description: null, is_active: true }],
      error: null,
    })
    supabaseMock.from.mockReturnValue(query)
    await expect(listarUbicacionesCompra('org-1')).resolves.toEqual([
      { id: 'u-1', almacenId: 'a-1', codigo: 'R01', nombre: 'Rack 1', descripcion: '', activa: true },
    ])
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(query.eq).toHaveBeenCalledWith('is_active', true)
  })

  it('envía partidas e idempotencia a la recepción parcial', async () => {
    supabaseMock.rpc.mockResolvedValue({ error: null })
    await recibirCompraPersistente('org-1', 'compra-1', {
      operationKey: 'c1111111-1111-4111-8111-111111111111', observacion: 'Primera entrega',
      lineas: [{ purchaseOrderItemId: 'linea-1', cantidad: '2', ubicacionId: 'u-1', lote: 'L1', fechaVencimiento: '2027-01-01' }],
    })
    expect(supabaseMock.rpc).toHaveBeenCalledWith('receive_purchase_order_partial', {
      payload: expect.objectContaining({
        purchase_order_id: 'compra-1', operation_key: 'c1111111-1111-4111-8111-111111111111',
        items: [expect.objectContaining({ purchase_order_item_id: 'linea-1', location_id: 'u-1' })],
      }),
    })
  })

  it('cierra el saldo mediante una RPC con motivo auditable', async () => {
    supabaseMock.rpc.mockResolvedValue({ error: null })
    await anularCompraPersistente('org-1', 'compra-1', 'Proveedor canceló el saldo')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('close_purchase_order', {
      payload: {
        organization_id: 'org-1', purchase_order_id: 'compra-1',
        reason: 'Proveedor canceló el saldo',
      },
    })
  })
})
