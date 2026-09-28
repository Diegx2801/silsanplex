export type PeriodoDesempenoProveedor = '30d' | '90d' | '6m' | '1y' | 'all'

export interface DesempenoProveedor {
  organizationId: string
  supplierId: string
  totalOrders: number
  totalOrderLines: number
  totalOrderedQuantity: number | null
  totalReceivedQuantity: number | null
  fulfillmentPercentage: number | null
  completeLines: number
  incompleteLines: number
  overReceivedLines: number
  receivedOrders: number
  partiallyReceivedOrders: number
  closedPartialOrders: number
  ordersWithExpectedDelivery: number
  onTimeOrders: number
  lateOrders: number
  onTimePercentage: number | null
  firstReceiptSampleSize: number
  completeDeliverySampleSize: number
  lastReceiptSampleSize: number
  avgDaysToFirstReceipt: number | null
  avgDaysToLastReceipt: number | null
  avgDaysToComplete: number | null
  completedReturnsCount: number
  returnedProductCount: number
  returnedQuantity: number | null
  returnedQuantityUnit: string | null
  returnedQuantityPercentage: number | null
  quantityUnit: string | null
  quantityDimensions: number
  sampleSize: number
}
