import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  EventoPrecioCompra,
  ResumenPrecioCompra,
} from '@/modulos/compras/modelo/historialPrecios'

const { useHistorial } = vi.hoisted(() => ({ useHistorial: vi.fn() }))

vi.mock('@/modulos/compras/estado/useHistorialPreciosCompra', () => ({
  useHistorialPreciosCompra: useHistorial,
}))

import { HistorialPreciosCompra } from './HistorialPreciosCompra'

const resumenBase: ResumenPrecioCompra = {
  organizationId: 'org-1',
  supplierId: 'proveedor-1',
  supplierName: 'Proveedor Uno',
  productId: 'producto-1',
  productCode: 'SKU-1',
  productDescription: 'Producto uno',
  unitOfMeasure: 'UND',
  currency: 'PEN',
  pricesIncludeTax: true,
  taxAffectation: 'gravado',
  receiptCount: 3,
  purchaseCount: 2,
  receivedQuantity: 17,
  lastReceivedAt: '2026-09-20T10:00:00.000Z',
  latestUnitCost: 14,
  previousUnitCost: 12,
  absoluteVariation: 2,
  percentageVariation: 16.67,
  minimumUnitCost: 10,
  weightedAverageUnitCost: 12.4706,
  maximumUnitCost: 14,
  latestPurchaseOrderId: 'orden-2',
  latestPurchaseReceiptId: 'recepcion-3',
  latestOrderStatus: 'received',
  costBasis: 'registered_unit_cost',
  taxBasis: 'includes_igv',
}

const evento: EventoPrecioCompra = {
  organizationId: 'org-1',
  supplierId: 'proveedor-1',
  supplierName: 'Proveedor Uno',
  purchaseOrderId: 'orden-2',
  documentType: 'factura',
  series: 'F001',
  documentNumber: '10',
  currency: 'PEN',
  receivedAt: '2026-09-20T10:00:00.000Z',
  purchaseOrderItemId: 'linea-1',
  productId: 'producto-1',
  productCode: 'SKU-1',
  productDescription: 'Producto uno',
  quantity: 4,
  unitCost: 14,
  purchaseReceiptId: 'recepcion-3',
  purchaseReceiptItemId: 'recepcion-linea-3',
  orderStatus: 'received',
  unitOfMeasure: 'UND',
  productType: 'good',
  fulfillmentMode: 'physical',
  pricesIncludeTax: true,
  taxAffectation: 'gravado',
  unitCostWithTax: 14,
  unitCostWithoutTax: 11.8644,
  isInventoryReceipt: true,
  costBasis: 'registered_unit_cost',
  taxBasis: 'includes_igv',
}

function estado(overrides: Partial<ReturnType<typeof useHistorial>> = {}) {
  return {
    puedeConsultar: true,
    periodo: 'all',
    cambiarPeriodo: vi.fn(),
    resumen: [resumenBase],
    cargandoResumen: false,
    actualizandoResumen: false,
    errorResumen: null,
    reintentarResumen: vi.fn(),
    detalleClave: null,
    detalle: [],
    cargandoDetalle: false,
    errorDetalle: null,
    abrirDetalle: vi.fn(),
    cerrarDetalle: vi.fn(),
    ...overrides,
  }
}

describe('HistorialPreciosCompra', () => {
  beforeEach(() => useHistorial.mockReset())

  it('muestra el resumen, la variación positiva y separa otra moneda', () => {
    useHistorial.mockReturnValue(estado({
      resumen: [resumenBase, {
        ...resumenBase,
        supplierId: 'proveedor-2',
        supplierName: 'Proveedor Dos',
        currency: 'USD',
        latestUnitCost: 8,
        previousUnitCost: null,
        absoluteVariation: null,
        percentageVariation: null,
        taxBasis: 'excludes_igv',
      }],
    }))

    render(<HistorialPreciosCompra modo="producto" productoId="producto-1" />)

    expect(screen.getByRole('heading', { name: 'Precios proveedores' })).toBeInTheDocument()
    expect(screen.getByText('Proveedor Uno')).toBeInTheDocument()
    expect(screen.getByText('Proveedor Dos')).toBeInTheDocument()
    expect(screen.getAllByText('PEN').length).toBeGreaterThan(0)
    expect(screen.getAllByText('USD').length).toBeGreaterThan(0)
    expect(screen.getByTitle('Variación contra la recepción anterior')).toHaveTextContent(/16[.,]67/)
    expect(screen.getAllByText('N/D').length).toBeGreaterThan(0)
  })

  it('muestra la variación negativa y el detalle de recepciones', () => {
    useHistorial.mockReturnValue(estado({
      resumen: [{ ...resumenBase, absoluteVariation: -2, percentageVariation: -16.67 }],
      detalleClave: {
        supplierId: resumenBase.supplierId,
        productId: resumenBase.productId,
        currency: resumenBase.currency,
        unitOfMeasure: resumenBase.unitOfMeasure,
        pricesIncludeTax: resumenBase.pricesIncludeTax,
        taxAffectation: resumenBase.taxAffectation,
      },
      detalle: [evento],
    }))

    render(<HistorialPreciosCompra modo="proveedor" proveedorId="proveedor-1" />)

    expect(screen.getByRole('heading', { name: 'Historial de precios' })).toBeInTheDocument()
    expect(screen.getByTitle('Variación contra la recepción anterior')).toHaveTextContent(/-16[.,]67/)
    expect(screen.getByText('Recepciones que componen el historial de costos')).toBeInTheDocument()
    expect(screen.getByText('factura F001 10')).toBeInTheDocument()
    expect(screen.getByText('Ocultar recepciones')).toBeInTheDocument()
  })

  it('permite cambiar el periodo y oculta el módulo sin permiso', () => {
    const cambiarPeriodo = vi.fn()
    useHistorial.mockReturnValue(estado({ cambiarPeriodo }))
    const { rerender } = render(<HistorialPreciosCompra modo="producto" productoId="producto-1" />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Periodo del historial de precios' }), { target: { value: '90d' } })
    expect(cambiarPeriodo).toHaveBeenCalledWith('90d')

    useHistorial.mockReturnValue(estado({ puedeConsultar: false }))
    rerender(<HistorialPreciosCompra modo="proveedor" proveedorId="proveedor-1" />)
    expect(screen.queryByRole('heading', { name: 'Historial de precios' })).not.toBeInTheDocument()
  })

  it('expone loading, vacío y error de lectura', () => {
    useHistorial.mockReturnValue(estado({ cargandoResumen: true, resumen: [] }))
    const { rerender } = render(<HistorialPreciosCompra modo="producto" productoId="producto-1" />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando historial de precios')

    useHistorial.mockReturnValue(estado({ resumen: [] }))
    rerender(<HistorialPreciosCompra modo="producto" productoId="producto-1" />)
    expect(screen.getByText('No hay recepciones de inventario para el periodo seleccionado.')).toBeInTheDocument()

    useHistorial.mockReturnValue(estado({ errorResumen: new Error('Fallo de lectura'), resumen: [] }))
    rerender(<HistorialPreciosCompra modo="producto" productoId="producto-1" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Fallo de lectura')
  })
})
