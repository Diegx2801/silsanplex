import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

import {
  listarHistorialPreciosCompra,
  listarResumenPreciosCompra,
} from './historialPreciosService'

const filtros = {
  organizationId: 'org-1',
  productoId: 'producto-1',
  proveedorId: 'proveedor-1',
  desde: '2026-09-01T00:00:00.000Z',
  hasta: null,
}

describe('historialPreciosService', () => {
  beforeEach(() => rpc.mockReset())

  it('consulta el resumen con el rango y adapta las métricas agregadas', async () => {
    rpc.mockResolvedValue({
      data: [{
        organization_id: 'org-1',
        supplier_id: 'proveedor-1',
        supplier_name: 'Proveedor Uno',
        product_id: 'producto-1',
        product_code: 'SKU-1',
        product_description: 'Producto uno',
        unit_of_measure: 'UND',
        currency: 'PEN',
        prices_include_tax: true,
        tax_affectation: 'gravado',
        receipt_count: 3,
        purchase_count: 2,
        received_quantity: '17',
        last_received_at: '2026-09-20T10:00:00.000Z',
        latest_unit_cost: '14',
        previous_unit_cost: '12',
        absolute_variation: '2',
        percentage_variation: '16.67',
        minimum_unit_cost: '10',
        weighted_average_unit_cost: '12.4706',
        maximum_unit_cost: '14',
        latest_purchase_order_id: 'orden-2',
        latest_purchase_receipt_id: 'recepcion-3',
        latest_order_status: 'received',
        cost_basis: 'registered_unit_cost',
        tax_basis: 'includes_igv',
      }],
      error: null,
    })

    const resultado = await listarResumenPreciosCompra(filtros)

    expect(rpc).toHaveBeenCalledWith('get_supplier_purchase_price_summary', {
      requested_organization_id: 'org-1',
      requested_product_id: 'producto-1',
      requested_supplier_id: 'proveedor-1',
      requested_from: '2026-09-01T00:00:00.000Z',
      requested_to: null,
    })
    expect(resultado[0]).toMatchObject({
      supplierName: 'Proveedor Uno',
      receivedQuantity: 17,
      latestUnitCost: 14,
      previousUnitCost: 12,
      weightedAverageUnitCost: 12.4706,
      percentageVariation: 16.67,
      taxBasis: 'includes_igv',
    })
  })

  it('consulta el detalle de recepciones y conserva moneda e IGV', async () => {
    rpc.mockResolvedValue({
      data: [{
        organization_id: 'org-1',
        supplier_id: 'proveedor-1',
        supplier_name: 'Proveedor Uno',
        purchase_order_id: 'orden-1',
        document_type: 'factura',
        series: 'F001',
        document_number: '10',
        currency: 'USD',
        received_at: '2026-09-20T10:00:00.000Z',
        purchase_order_item_id: 'linea-1',
        product_id: 'producto-1',
        product_code: 'SKU-1',
        product_description: 'Producto uno',
        quantity: '4',
        unit_cost: '3.5',
        purchase_receipt_id: 'recepcion-1',
        purchase_receipt_item_id: 'recepcion-linea-1',
        order_status: 'partially_received',
        unit_of_measure: 'UND',
        product_type: 'good',
        fulfillment_mode: 'physical',
        prices_include_tax: false,
        tax_affectation: 'gravado',
        unit_cost_with_tax: '4.13',
        unit_cost_without_tax: '3.5',
        is_inventory_receipt: true,
        cost_basis: 'registered_unit_cost',
        tax_basis: 'excludes_igv',
      }],
      error: null,
    })

    const resultado = await listarHistorialPreciosCompra({ organizationId: 'org-1', proveedorId: 'proveedor-1' })

    expect(resultado[0]).toMatchObject({
      currency: 'USD',
      quantity: 4,
      unitCost: 3.5,
      pricesIncludeTax: false,
      unitCostWithTax: 4.13,
      taxBasis: 'excludes_igv',
    })
  })

  it('expone un error estable si la RPC falla', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'detalle interno' } })

    await expect(listarResumenPreciosCompra({ organizationId: 'org-1' })).rejects.toThrow(
      'No se pudo consultar el resumen de precios de compra',
    )
  })
})
