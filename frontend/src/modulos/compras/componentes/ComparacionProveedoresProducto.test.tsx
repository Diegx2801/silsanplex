import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ComparacionProveedorProducto } from '@/modulos/compras/modelo/comparacionProveedoresProducto'

const { useComparacion } = vi.hoisted(() => ({ useComparacion: vi.fn() }))

vi.mock('@/modulos/compras/estado/useComparacionProveedoresProducto', () => ({
  useComparacionProveedoresProducto: useComparacion,
}))

import { ComparacionProveedoresProducto } from './ComparacionProveedoresProducto'

const filaBase: ComparacionProveedorProducto = {
  organizationId: 'org-1',
  supplierId: 'supplier-1',
  supplierName: 'Proveedor Uno',
  productId: 'product-1',
  productCode: 'SKU-1',
  productDescription: 'Producto uno',
  comparisonStatus: 'comparable',
  comparisonDimensionCount: 2,
  comparisonKey: 'PEN|UND|true|gravado',
  currency: 'PEN',
  unitOfMeasure: 'UND',
  pricesIncludeTax: true,
  taxAffectation: 'gravado',
  taxBasis: 'includes_igv',
  costBasis: 'registered_unit_cost',
  latestUnitCost: 8.2,
  previousUnitCost: 8,
  absoluteVariation: 0.2,
  percentageVariation: 2.5,
  minimumUnitCost: 7.5,
  weightedAverageUnitCost: 8.05,
  maximumUnitCost: 8.2,
  priceReceivedQuantity: 9,
  priceReceiptCount: 3,
  pricePurchaseCount: 2,
  lastPriceReceivedAt: '2026-09-20T10:00:00.000Z',
  latestPurchaseOrderId: 'order-1',
  latestPurchaseReceiptId: 'receipt-1',
  latestOrderStatus: 'received',
  totalOrders: 2,
  totalOrderLines: 2,
  orderedQuantity: 10,
  receivedQuantity: 9,
  fulfillmentPercentage: 90,
  completeLines: 1,
  incompleteLines: 1,
  overReceivedLines: 0,
  receivedOrders: 1,
  partiallyReceivedOrders: 1,
  closedPartialOrders: 0,
  operationalReceiptCount: 3,
  firstReceiptSampleSize: 2,
  lastReceiptSampleSize: 2,
  completeDeliverySampleSize: 1,
  ordersWithExpectedDelivery: 1,
  onTimeOrders: 1,
  lateOrders: 0,
  onTimePercentage: 100,
  avgDaysToFirstReceipt: 2.4,
  avgDaysToLastReceipt: 3,
  avgDaysToComplete: 3,
  completedReturnsCount: 1,
  affectedReceiptsCount: 1,
  returnedQuantity: 1,
  returnedQuantityPercentage: 11.11,
  sampleSize: 2,
}

function estado(overrides: Partial<ReturnType<typeof useComparacion>> = {}) {
  return {
    puedeConsultar: true,
    periodo: 'all',
    cambiarPeriodo: vi.fn(),
    filas: [filaBase],
    cargando: false,
    actualizando: false,
    error: null,
    reintentar: vi.fn(),
    ...overrides,
  }
}

describe('ComparacionProveedoresProducto', () => {
  beforeEach(() => useComparacion.mockReset())

  it('muestra precio E2, cumplimiento, entregas, devoluciones, muestra y no score', () => {
    useComparacion.mockReturnValue(estado())

    render(<ComparacionProveedoresProducto productoId="product-1" abierto />)

    expect(screen.getByRole('heading', { name: 'Comparar proveedores' })).toBeInTheDocument()
    expect(screen.getByText('Proveedor Uno')).toBeInTheDocument()
    expect(screen.getByText('Comparable')).toBeInTheDocument()
    expect(screen.getByText(/S\/\s*8[.,]20/)).toBeInTheDocument()
    expect(screen.getByText(/90\s*%/)).toBeInTheDocument()
    expect(screen.getByText('1 de 1')).toBeInTheDocument()
    expect(screen.getAllByText(/3 recepciones/).length).toBeGreaterThan(0)
    expect(screen.getByText(/No calcula un ganador ni un score/)).toBeInTheDocument()
    expect(screen.queryByText(/proveedor recomendado/i)).not.toBeInTheDocument()
  })

  it('distingue filas no comparables y conserva N/D', () => {
    useComparacion.mockReturnValue(estado({
      filas: [{
        ...filaBase,
        supplierId: 'supplier-2',
        supplierName: 'Proveedor sin recepción',
        comparisonStatus: 'no_comparable',
        comparisonKey: null,
        currency: null,
        latestUnitCost: null,
        weightedAverageUnitCost: null,
        priceReceiptCount: 0,
        receivedQuantity: 0,
        fulfillmentPercentage: null,
      }],
    }))

    render(<ComparacionProveedoresProducto productoId="product-1" abierto />)

    expect(screen.getByText('No comparable')).toBeInTheDocument()
    expect(screen.getByText('Proveedor sin recepción')).toBeInTheDocument()
    expect(screen.getAllByText('N/D').length).toBeGreaterThan(0)
    expect(screen.getByText(/No hay una recepción con dimensiones/i)).toBeInTheDocument()
  })

  it('maneja loading, error, vacío, permisos y periodo', () => {
    useComparacion.mockReturnValue(estado({ cargando: true, filas: [] }))
    const { rerender } = render(<ComparacionProveedoresProducto productoId="product-1" abierto />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando comparación de proveedores')

    useComparacion.mockReturnValue(estado({ cargando: false, filas: [] }))
    rerender(<ComparacionProveedoresProducto productoId="product-1" abierto />)
    expect(screen.getByText(/No hay compras o recepciones/i)).toBeInTheDocument()

    useComparacion.mockReturnValue(estado({ error: new Error('Fallo de lectura'), filas: [] }))
    rerender(<ComparacionProveedoresProducto productoId="product-1" abierto />)
    expect(screen.getByRole('alert')).toHaveTextContent('Fallo de lectura')

    const cambiarPeriodo = vi.fn()
    useComparacion.mockReturnValue(estado({ cambiarPeriodo }))
    rerender(<ComparacionProveedoresProducto productoId="product-1" abierto />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Periodo de comparación de proveedores' }), { target: { value: '90d' } })
    expect(cambiarPeriodo).toHaveBeenCalledWith('90d')

    useComparacion.mockReturnValue(estado({ puedeConsultar: false }))
    rerender(<ComparacionProveedoresProducto productoId="product-1" abierto />)
    expect(screen.queryByRole('heading', { name: 'Comparar proveedores' })).not.toBeInTheDocument()
  })
})
