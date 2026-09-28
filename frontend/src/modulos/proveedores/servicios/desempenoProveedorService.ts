import { supabase } from '@/lib/supabase'
import type { DesempenoProveedor } from '@/modulos/proveedores/modelo/desempenoProveedor'

type FilaDesconocida = Record<string, unknown>

function texto(valor: unknown, fallback = ''): string {
  return typeof valor === 'string' ? valor : fallback
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

function construirParametros(organizationId: string, supplierId: string, desde: string | null, hasta: string | null) {
  return {
    requested_organization_id: organizationId,
    requested_supplier_id: supplierId,
    requested_from: desde,
    requested_to: hasta,
  }
}

function mapearDesempeno(fila: FilaDesconocida): DesempenoProveedor {
  return {
    organizationId: texto(fila.organization_id),
    supplierId: texto(fila.supplier_id),
    totalOrders: numero(fila.total_orders),
    totalOrderLines: numero(fila.total_order_lines),
    totalOrderedQuantity: numeroNulo(fila.total_ordered_quantity),
    totalReceivedQuantity: numeroNulo(fila.total_received_quantity),
    fulfillmentPercentage: numeroNulo(fila.fulfillment_percentage),
    completeLines: numero(fila.complete_lines),
    incompleteLines: numero(fila.incomplete_lines),
    overReceivedLines: numero(fila.over_received_lines),
    receivedOrders: numero(fila.received_orders),
    partiallyReceivedOrders: numero(fila.partially_received_orders),
    closedPartialOrders: numero(fila.closed_partial_orders),
    ordersWithExpectedDelivery: numero(fila.orders_with_expected_delivery),
    onTimeOrders: numero(fila.on_time_orders),
    lateOrders: numero(fila.late_orders),
    onTimePercentage: numeroNulo(fila.on_time_percentage),
    firstReceiptSampleSize: numero(fila.first_receipt_sample_size),
    completeDeliverySampleSize: numero(fila.complete_delivery_sample_size),
    lastReceiptSampleSize: numero(fila.last_receipt_sample_size),
    avgDaysToFirstReceipt: numeroNulo(fila.avg_days_to_first_receipt),
    avgDaysToLastReceipt: numeroNulo(fila.avg_days_to_last_receipt),
    avgDaysToComplete: numeroNulo(fila.avg_days_to_complete),
    completedReturnsCount: numero(fila.completed_returns_count),
    returnedProductCount: numero(fila.returned_product_count),
    returnedQuantity: numeroNulo(fila.returned_quantity),
    returnedQuantityUnit: fila.returned_quantity_unit === null ? null : texto(fila.returned_quantity_unit),
    returnedQuantityPercentage: numeroNulo(fila.returned_quantity_percentage),
    quantityUnit: fila.quantity_unit === null ? null : texto(fila.quantity_unit),
    quantityDimensions: numero(fila.quantity_dimensions),
    sampleSize: numero(fila.sample_size),
  }
}

export async function obtenerDesempenoProveedor(
  organizationId: string,
  supplierId: string,
  desde: string | null,
  hasta: string | null,
): Promise<DesempenoProveedor | null> {
  const { data, error } = await supabase.rpc(
    'get_supplier_operational_performance_summary',
    construirParametros(organizationId, supplierId, desde, hasta),
  )

  if (error) throw new Error('No se pudo consultar el desempeno operativo del proveedor')
  if (!Array.isArray(data) || !data.length) return null
  return mapearDesempeno(data[0] as FilaDesconocida)
}
