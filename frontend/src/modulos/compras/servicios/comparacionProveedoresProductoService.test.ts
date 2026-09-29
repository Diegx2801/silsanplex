import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

import { listarComparacionProveedoresProducto } from './comparacionProveedoresProductoService'

describe('comparacionProveedoresProductoService', () => {
  beforeEach(() => rpc.mockReset())

  it('consulta la RPC por producto y periodo y conserva dimensiones históricas', async () => {
    rpc.mockResolvedValue({
      data: [{
        organization_id: 'org-1',
        supplier_id: 'supplier-1',
        supplier_name: 'Proveedor Uno',
        product_id: 'product-1',
        product_code: 'SKU-1',
        product_description: 'Producto uno',
        comparison_status: 'comparable',
        comparison_dimension_count: 3,
        comparison_key: 'PEN|UND|true|gravado',
        currency: 'PEN',
        unit_of_measure: 'UND',
        prices_include_tax: true,
        tax_affectation: 'gravado',
        tax_basis: 'includes_igv',
        cost_basis: 'registered_unit_cost',
        latest_unit_cost: '14',
        previous_unit_cost: '12',
        absolute_variation: '2',
        percentage_variation: '16.67',
        minimum_unit_cost: '10',
        weighted_average_unit_cost: '12.47',
        maximum_unit_cost: '14',
        price_received_quantity: '17',
        price_receipt_count: 3,
        price_purchase_count: 2,
        last_price_received_at: '2026-09-20T10:00:00.000Z',
        total_orders: 3,
        total_order_lines: 3,
        ordered_quantity: '20',
        received_quantity: '17',
        fulfillment_percentage: '85',
        complete_lines: 2,
        incomplete_lines: 1,
        over_received_lines: 0,
        received_orders: 1,
        partially_received_orders: 1,
        closed_partial_orders: 1,
        operational_receipt_count: 3,
        first_receipt_sample_size: 3,
        last_receipt_sample_size: 3,
        complete_delivery_sample_size: 1,
        orders_with_expected_delivery: 1,
        on_time_orders: 1,
        late_orders: 0,
        on_time_percentage: '100',
        avg_days_to_first_receipt: '2.5',
        avg_days_to_last_receipt: '4',
        avg_days_to_complete: '3',
        completed_returns_count: 1,
        affected_receipts_count: 1,
        returned_quantity: '2',
        returned_quantity_percentage: '11.76',
        sample_size: 3,
      }],
      error: null,
    })

    const resultado = await listarComparacionProveedoresProducto({
      organizationId: 'org-1',
      productId: 'product-1',
      desde: '2026-09-01T00:00:00.000Z',
      hasta: null,
    })

    expect(rpc).toHaveBeenCalledWith('get_product_supplier_comparison', {
      requested_organization_id: 'org-1',
      requested_product_id: 'product-1',
      requested_from: '2026-09-01T00:00:00.000Z',
      requested_to: null,
    })
    expect(resultado[0]).toMatchObject({
      supplierName: 'Proveedor Uno',
      latestUnitCost: 14,
      weightedAverageUnitCost: 12.47,
      orderedQuantity: 20,
      receivedQuantity: 17,
      fulfillmentPercentage: 85,
      closedPartialOrders: 1,
      currency: 'PEN',
      unitOfMeasure: 'UND',
    })
  })

  it('preserva N/D cuando la fila no tiene precio comparable', async () => {
    rpc.mockResolvedValue({
      data: [{
        supplier_id: 'supplier-2',
        supplier_name: 'Proveedor sin recepción',
        product_id: 'product-1',
        comparison_status: 'no_comparable',
        comparison_dimension_count: 2,
        currency: null,
        unit_of_measure: 'UND',
        latest_unit_cost: null,
        weighted_average_unit_cost: null,
        price_receipt_count: null,
        ordered_quantity: '4',
        received_quantity: '0',
        total_orders: 1,
      }],
      error: null,
    })

    const [fila] = await listarComparacionProveedoresProducto({ organizationId: 'org-1', productId: 'product-1' })

    expect(fila).toMatchObject({
      comparisonStatus: 'no_comparable',
      currency: null,
      latestUnitCost: null,
      weightedAverageUnitCost: null,
      priceReceiptCount: 0,
      receivedQuantity: 0,
    })
  })

  it('expone un error estable si falla la RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'detalle interno' } })

    await expect(listarComparacionProveedoresProducto({ organizationId: 'org-1', productId: 'product-1' })).rejects.toThrow(
      'No se pudo consultar la comparación de proveedores',
    )
  })
})
