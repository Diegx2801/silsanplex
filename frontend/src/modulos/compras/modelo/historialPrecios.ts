export type PeriodoHistorialPrecios = '30d' | '90d' | '6m' | '1y' | 'all'

export type ClaveDetallePrecioCompra = {
  supplierId: string
  productId: string
  currency: string
  unitOfMeasure: string
  pricesIncludeTax: boolean
  taxAffectation: string | null
}

export interface ResumenPrecioCompra {
  organizationId: string
  supplierId: string
  supplierName: string
  productId: string
  productCode: string
  productDescription: string
  unitOfMeasure: string
  currency: string
  pricesIncludeTax: boolean
  taxAffectation: string | null
  receiptCount: number
  purchaseCount: number
  receivedQuantity: number
  lastReceivedAt: string
  latestUnitCost: number
  previousUnitCost: number | null
  absoluteVariation: number | null
  percentageVariation: number | null
  minimumUnitCost: number
  weightedAverageUnitCost: number
  maximumUnitCost: number
  latestPurchaseOrderId: string
  latestPurchaseReceiptId: string
  latestOrderStatus: string
  costBasis: string
  taxBasis: string
}

export interface EventoPrecioCompra {
  organizationId: string
  supplierId: string
  supplierName: string
  purchaseOrderId: string
  documentType: string
  series: string
  documentNumber: string
  currency: string
  receivedAt: string
  purchaseOrderItemId: string
  productId: string
  productCode: string
  productDescription: string
  quantity: number
  unitCost: number
  purchaseReceiptId: string
  purchaseReceiptItemId: string
  orderStatus: string
  unitOfMeasure: string
  productType: string
  fulfillmentMode: string
  pricesIncludeTax: boolean
  taxAffectation: string | null
  unitCostWithTax: number | null
  unitCostWithoutTax: number | null
  isInventoryReceipt: boolean | null
  costBasis: string
  taxBasis: string
}
