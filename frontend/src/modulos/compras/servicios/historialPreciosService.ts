import { supabase } from '@/lib/supabase'
import type { EventoPrecioCompra, ResumenPrecioCompra } from '@/modulos/compras/modelo/historialPrecios'

export interface FiltrosHistorialPrecios {
  organizationId: string
  productoId?: string | null
  proveedorId?: string | null
  desde?: string | null
  hasta?: string | null
}

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

function booleano(valor: unknown): boolean {
  return valor === true || valor === 'true'
}

function construirParametros(filtros: FiltrosHistorialPrecios) {
  return {
    requested_organization_id: filtros.organizationId,
    requested_product_id: filtros.productoId ?? null,
    requested_supplier_id: filtros.proveedorId ?? null,
    requested_from: filtros.desde ?? null,
    requested_to: filtros.hasta ?? null,
  }
}

function mapearResumen(fila: FilaDesconocida): ResumenPrecioCompra {
  return {
    organizationId: texto(fila.organization_id),
    supplierId: texto(fila.supplier_id),
    supplierName: texto(fila.supplier_name, 'Proveedor sin nombre'),
    productId: texto(fila.product_id),
    productCode: texto(fila.product_code),
    productDescription: texto(fila.product_description, 'Producto sin descripción'),
    unitOfMeasure: texto(fila.unit_of_measure),
    currency: texto(fila.currency, 'MON'),
    pricesIncludeTax: booleano(fila.prices_include_tax),
    taxAffectation: fila.tax_affectation === null ? null : texto(fila.tax_affectation),
    receiptCount: numero(fila.receipt_count),
    purchaseCount: numero(fila.purchase_count),
    receivedQuantity: numero(fila.received_quantity),
    lastReceivedAt: texto(fila.last_received_at),
    latestUnitCost: numero(fila.latest_unit_cost),
    previousUnitCost: numeroNulo(fila.previous_unit_cost),
    absoluteVariation: numeroNulo(fila.absolute_variation),
    percentageVariation: numeroNulo(fila.percentage_variation),
    minimumUnitCost: numero(fila.minimum_unit_cost),
    weightedAverageUnitCost: numero(fila.weighted_average_unit_cost),
    maximumUnitCost: numero(fila.maximum_unit_cost),
    latestPurchaseOrderId: texto(fila.latest_purchase_order_id),
    latestPurchaseReceiptId: texto(fila.latest_purchase_receipt_id),
    latestOrderStatus: texto(fila.latest_order_status),
    costBasis: texto(fila.cost_basis, 'registered_unit_cost'),
    taxBasis: texto(fila.tax_basis, 'tax_snapshot_unavailable'),
  }
}

function mapearEvento(fila: FilaDesconocida): EventoPrecioCompra {
  return {
    organizationId: texto(fila.organization_id),
    supplierId: texto(fila.supplier_id),
    supplierName: texto(fila.supplier_name, 'Proveedor sin nombre'),
    purchaseOrderId: texto(fila.purchase_order_id),
    documentType: texto(fila.document_type),
    series: texto(fila.series),
    documentNumber: texto(fila.document_number),
    currency: texto(fila.currency, 'MON'),
    receivedAt: texto(fila.received_at),
    purchaseOrderItemId: texto(fila.purchase_order_item_id),
    productId: texto(fila.product_id),
    productCode: texto(fila.product_code),
    productDescription: texto(fila.product_description, 'Producto sin descripción'),
    quantity: numero(fila.quantity),
    unitCost: numero(fila.unit_cost),
    purchaseReceiptId: texto(fila.purchase_receipt_id),
    purchaseReceiptItemId: texto(fila.purchase_receipt_item_id),
    orderStatus: texto(fila.order_status),
    unitOfMeasure: texto(fila.unit_of_measure),
    productType: texto(fila.product_type),
    fulfillmentMode: texto(fila.fulfillment_mode),
    pricesIncludeTax: booleano(fila.prices_include_tax),
    taxAffectation: fila.tax_affectation === null ? null : texto(fila.tax_affectation),
    unitCostWithTax: numeroNulo(fila.unit_cost_with_tax),
    unitCostWithoutTax: numeroNulo(fila.unit_cost_without_tax),
    isInventoryReceipt: fila.is_inventory_receipt === null ? null : booleano(fila.is_inventory_receipt),
    costBasis: texto(fila.cost_basis, 'registered_unit_cost'),
    taxBasis: texto(fila.tax_basis, 'tax_snapshot_unavailable'),
  }
}

export async function listarResumenPreciosCompra(
  filtros: FiltrosHistorialPrecios,
): Promise<ResumenPrecioCompra[]> {
  const { data, error } = await supabase.rpc(
    'get_supplier_purchase_price_summary',
    construirParametros(filtros),
  )

  if (error) throw new Error('No se pudo consultar el resumen de precios de compra')
  if (!Array.isArray(data)) return []
  return data.map((fila) => mapearResumen(fila as FilaDesconocida))
}

export async function listarHistorialPreciosCompra(
  filtros: FiltrosHistorialPrecios,
): Promise<EventoPrecioCompra[]> {
  const { data, error } = await supabase.rpc(
    'get_supplier_purchase_price_history',
    construirParametros(filtros),
  )

  if (error) throw new Error('No se pudo consultar el detalle de recepciones')
  if (!Array.isArray(data)) return []
  return data.map((fila) => mapearEvento(fila as FilaDesconocida))
}
