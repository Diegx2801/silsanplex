export type PeriodoComparacionProveedoresProducto = '30d' | '90d' | '6m' | '1y' | 'all'

export type EstadoComparacionProveedorProducto = 'comparable' | 'no_comparable'

export interface ComparacionProveedorProducto {
  organizationId: string
  supplierId: string
  supplierName: string
  productId: string
  productCode: string
  productDescription: string
  comparisonStatus: EstadoComparacionProveedorProducto
  comparisonDimensionCount: number
  comparisonKey: string | null
  currency: string | null
  unitOfMeasure: string | null
  pricesIncludeTax: boolean | null
  taxAffectation: string | null
  taxBasis: string | null
  costBasis: string | null
  latestUnitCost: number | null
  previousUnitCost: number | null
  absoluteVariation: number | null
  percentageVariation: number | null
  minimumUnitCost: number | null
  weightedAverageUnitCost: number | null
  maximumUnitCost: number | null
  priceReceivedQuantity: number | null
  priceReceiptCount: number
  pricePurchaseCount: number
  lastPriceReceivedAt: string | null
  latestPurchaseOrderId: string | null
  latestPurchaseReceiptId: string | null
  latestOrderStatus: string | null
  totalOrders: number
  totalOrderLines: number
  orderedQuantity: number | null
  receivedQuantity: number | null
  fulfillmentPercentage: number | null
  completeLines: number
  incompleteLines: number
  overReceivedLines: number
  receivedOrders: number
  partiallyReceivedOrders: number
  closedPartialOrders: number
  operationalReceiptCount: number
  firstReceiptSampleSize: number
  lastReceiptSampleSize: number
  completeDeliverySampleSize: number
  ordersWithExpectedDelivery: number
  onTimeOrders: number
  lateOrders: number
  onTimePercentage: number | null
  avgDaysToFirstReceipt: number | null
  avgDaysToLastReceipt: number | null
  avgDaysToComplete: number | null
  completedReturnsCount: number
  affectedReceiptsCount: number
  returnedQuantity: number | null
  returnedQuantityPercentage: number | null
  sampleSize: number
}
