import { supabase } from '@/lib/supabase'
import type { ComparacionProveedorProducto } from '@/modulos/compras/modelo/comparacionProveedoresProducto'

export interface FiltrosComparacionProveedoresProducto {
  organizationId: string
  productId: string
  desde?: string | null
  hasta?: string | null
}

type FilaDesconocida = Record<string, unknown>

function texto(valor: unknown, fallback = ''): string {
  return typeof valor === 'string' ? valor : fallback
}

function textoNulo(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null
  return typeof valor === 'string' ? valor : null
}

function numero(valor: unknown, fallback = 0): number {
  const resultado = Number(valor)
  return Number.isFinite(resultado) ? resultado : fallback
}

function numeroNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const resultado = Number(valor)
  return Number.isFinite(resultado) ? resultado : null
}

function booleanoNulo(valor: unknown): boolean | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (valor === true || valor === 'true') return true
  if (valor === false || valor === 'false') return false
  return null
}

function construirParametros(filtros: FiltrosComparacionProveedoresProducto) {
  return {
    requested_organization_id: filtros.organizationId,
    requested_product_id: filtros.productId,
    requested_from: filtros.desde ?? null,
    requested_to: filtros.hasta ?? null,
  }
}

function mapearFila(fila: FilaDesconocida): ComparacionProveedorProducto {
  return {
    organizationId: texto(fila.organization_id),
    supplierId: texto(fila.supplier_id),
    supplierName: texto(fila.supplier_name, 'Proveedor sin nombre'),
    productId: texto(fila.product_id),
    productCode: texto(fila.product_code),
    productDescription: texto(fila.product_description, 'Producto sin descripción'),
    comparisonStatus: fila.comparison_status === 'no_comparable' ? 'no_comparable' : 'comparable',
    comparisonDimensionCount: numero(fila.comparison_dimension_count),
    comparisonKey: textoNulo(fila.comparison_key),
    currency: textoNulo(fila.currency),
    unitOfMeasure: textoNulo(fila.unit_of_measure),
    pricesIncludeTax: booleanoNulo(fila.prices_include_tax),
    taxAffectation: textoNulo(fila.tax_affectation),
    taxBasis: textoNulo(fila.tax_basis),
    costBasis: textoNulo(fila.cost_basis),
    latestUnitCost: numeroNulo(fila.latest_unit_cost),
    previousUnitCost: numeroNulo(fila.previous_unit_cost),
    absoluteVariation: numeroNulo(fila.absolute_variation),
    percentageVariation: numeroNulo(fila.percentage_variation),
    minimumUnitCost: numeroNulo(fila.minimum_unit_cost),
    weightedAverageUnitCost: numeroNulo(fila.weighted_average_unit_cost),
    maximumUnitCost: numeroNulo(fila.maximum_unit_cost),
    priceReceivedQuantity: numeroNulo(fila.price_received_quantity),
    priceReceiptCount: numero(fila.price_receipt_count),
    pricePurchaseCount: numero(fila.price_purchase_count),
    lastPriceReceivedAt: textoNulo(fila.last_price_received_at),
    latestPurchaseOrderId: textoNulo(fila.latest_purchase_order_id),
    latestPurchaseReceiptId: textoNulo(fila.latest_purchase_receipt_id),
    latestOrderStatus: textoNulo(fila.latest_order_status),
    totalOrders: numero(fila.total_orders),
    totalOrderLines: numero(fila.total_order_lines),
    orderedQuantity: numeroNulo(fila.ordered_quantity),
    receivedQuantity: numeroNulo(fila.received_quantity),
    fulfillmentPercentage: numeroNulo(fila.fulfillment_percentage),
    completeLines: numero(fila.complete_lines),
    incompleteLines: numero(fila.incomplete_lines),
    overReceivedLines: numero(fila.over_received_lines),
    receivedOrders: numero(fila.received_orders),
    partiallyReceivedOrders: numero(fila.partially_received_orders),
    closedPartialOrders: numero(fila.closed_partial_orders),
    operationalReceiptCount: numero(fila.operational_receipt_count),
    firstReceiptSampleSize: numero(fila.first_receipt_sample_size),
    lastReceiptSampleSize: numero(fila.last_receipt_sample_size),
    completeDeliverySampleSize: numero(fila.complete_delivery_sample_size),
    ordersWithExpectedDelivery: numero(fila.orders_with_expected_delivery),
    onTimeOrders: numero(fila.on_time_orders),
    lateOrders: numero(fila.late_orders),
    onTimePercentage: numeroNulo(fila.on_time_percentage),
    avgDaysToFirstReceipt: numeroNulo(fila.avg_days_to_first_receipt),
    avgDaysToLastReceipt: numeroNulo(fila.avg_days_to_last_receipt),
    avgDaysToComplete: numeroNulo(fila.avg_days_to_complete),
    completedReturnsCount: numero(fila.completed_returns_count),
    affectedReceiptsCount: numero(fila.affected_receipts_count),
    returnedQuantity: numeroNulo(fila.returned_quantity),
    returnedQuantityPercentage: numeroNulo(fila.returned_quantity_percentage),
    sampleSize: numero(fila.sample_size),
  }
}

export async function listarComparacionProveedoresProducto(
  filtros: FiltrosComparacionProveedoresProducto,
): Promise<ComparacionProveedorProducto[]> {
  const { data, error } = await supabase.rpc(
    'get_product_supplier_comparison',
    construirParametros(filtros),
  )

  if (error) throw new Error('No se pudo consultar la comparación de proveedores')
  if (!Array.isArray(data)) return []
  return data.map((fila) => mapearFila(fila as FilaDesconocida))
}
