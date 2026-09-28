import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

import { obtenerDesempenoProveedor } from './desempenoProveedorService'

describe('desempenoProveedorService', () => {
  beforeEach(() => rpc.mockReset())

  it('consulta la RPC por organizacion, proveedor y periodo y adapta el read model', async () => {
    rpc.mockResolvedValue({
      data: [{
        organization_id: 'org-1',
        supplier_id: 'proveedor-1',
        total_orders: 6,
        total_order_lines: 6,
        total_ordered_quantity: null,
        total_received_quantity: null,
        fulfillment_percentage: null,
        complete_lines: 3,
        incomplete_lines: 3,
        over_received_lines: 1,
        received_orders: 3,
        partially_received_orders: 1,
        closed_partial_orders: 1,
        orders_with_expected_delivery: 3,
        on_time_orders: 2,
        late_orders: 1,
        on_time_percentage: '66.67',
        first_receipt_sample_size: 5,
        complete_delivery_sample_size: 3,
        last_receipt_sample_size: 5,
        avg_days_to_first_receipt: '5.40',
        avg_days_to_last_receipt: '5.80',
        avg_days_to_complete: '4.67',
        completed_returns_count: 0,
        returned_product_count: 0,
        returned_quantity: 0,
        returned_quantity_unit: null,
        returned_quantity_percentage: 0,
        quantity_unit: null,
        quantity_dimensions: 2,
        sample_size: 6,
      }],
      error: null,
    })

    const resultado = await obtenerDesempenoProveedor('org-1', 'proveedor-1', '2026-09-01T00:00:00.000Z', null)

    expect(rpc).toHaveBeenCalledWith('get_supplier_operational_performance_summary', {
      requested_organization_id: 'org-1',
      requested_supplier_id: 'proveedor-1',
      requested_from: '2026-09-01T00:00:00.000Z',
      requested_to: null,
    })
    expect(resultado).toMatchObject({
      totalOrders: 6,
      onTimePercentage: 66.67,
      avgDaysToFirstReceipt: 5.4,
      quantityDimensions: 2,
      totalOrderedQuantity: null,
    })
  })

  it('devuelve null cuando no hay filas y propaga un error estable', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    await expect(obtenerDesempenoProveedor('org-1', 'proveedor-1', null, null)).resolves.toBeNull()

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'detalle interno' } })
    await expect(obtenerDesempenoProveedor('org-1', 'proveedor-1', null, null)).rejects.toThrow(
      'No se pudo consultar el desempeno operativo del proveedor',
    )
  })
})
