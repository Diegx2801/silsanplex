import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesempenoProveedor } from '@/modulos/proveedores/modelo/desempenoProveedor'

const { useDesempeno } = vi.hoisted(() => ({ useDesempeno: vi.fn() }))

vi.mock('@/modulos/proveedores/estado/useDesempenoProveedor', () => ({
  useDesempenoProveedor: useDesempeno,
}))

import { ResumenDesempenoProveedor } from './ResumenDesempenoProveedor'

const resumenBase: DesempenoProveedor = {
  organizationId: 'org-1',
  supplierId: 'proveedor-1',
  totalOrders: 6,
  totalOrderLines: 6,
  totalOrderedQuantity: null,
  totalReceivedQuantity: null,
  fulfillmentPercentage: null,
  completeLines: 3,
  incompleteLines: 3,
  overReceivedLines: 1,
  receivedOrders: 3,
  partiallyReceivedOrders: 1,
  closedPartialOrders: 1,
  ordersWithExpectedDelivery: 3,
  onTimeOrders: 2,
  lateOrders: 1,
  onTimePercentage: 66.67,
  firstReceiptSampleSize: 5,
  completeDeliverySampleSize: 3,
  lastReceiptSampleSize: 5,
  avgDaysToFirstReceipt: 5.4,
  avgDaysToLastReceipt: 5.8,
  avgDaysToComplete: 4.67,
  completedReturnsCount: 2,
  returnedProductCount: 1,
  returnedQuantity: 2,
  returnedQuantityUnit: 'UND',
  returnedQuantityPercentage: 20,
  quantityUnit: null,
  quantityDimensions: 2,
  sampleSize: 6,
}

function estado(overrides: Partial<ReturnType<typeof useDesempeno>> = {}) {
  return {
    puedeConsultar: true,
    periodo: 'all',
    cambiarPeriodo: vi.fn(),
    resumen: resumenBase,
    cargando: false,
    actualizando: false,
    error: null,
    reintentar: vi.fn(),
    ...overrides,
  }
}

describe('ResumenDesempenoProveedor', () => {
  beforeEach(() => useDesempeno.mockReset())

  it('muestra indicadores neutrales, muestra, parciales, devoluciones y no muestra score', () => {
    useDesempeno.mockReturnValue(estado())

    render(<ResumenDesempenoProveedor proveedorId="proveedor-1" abierto />)

    expect(screen.getByRole('heading', { name: 'Desempeno operativo' })).toBeInTheDocument()
    expect(screen.getByText('Muestra:')).toBeInTheDocument()
    expect(screen.getByText('6 ordenes')).toBeInTheDocument()
    expect(screen.getByText('Ordenes cerradas parciales')).toBeInTheDocument()
    expect(screen.getByText('Categoria separada; no implica incumplimiento confirmado.')).toBeInTheDocument()
    expect(screen.getByText('2 de 3')).toBeInTheDocument()
    expect(screen.getByText('2 UND')).toBeInTheDocument()
    expect(screen.getAllByText('N/D').length).toBeGreaterThan(0)
    expect(screen.queryByText(/^score$/i)).not.toBeInTheDocument()
  })

  it('expone loading, vacio, error, permisos y filtros de periodo', () => {
    useDesempeno.mockReturnValue(estado({ cargando: true, resumen: null }))
    const { rerender } = render(<ResumenDesempenoProveedor proveedorId="proveedor-1" abierto />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando desempeno operativo')

    useDesempeno.mockReturnValue(estado({ cargando: false, resumen: null }))
    rerender(<ResumenDesempenoProveedor proveedorId="proveedor-1" abierto />)
    expect(screen.getByText('No hay ordenes de bienes fisicos para el periodo seleccionado.')).toBeInTheDocument()

    useDesempeno.mockReturnValue(estado({ error: new Error('Fallo de lectura'), resumen: null }))
    rerender(<ResumenDesempenoProveedor proveedorId="proveedor-1" abierto />)
    expect(screen.getByRole('alert')).toHaveTextContent('Fallo de lectura')

    const cambiarPeriodo = vi.fn()
    useDesempeno.mockReturnValue(estado({ cambiarPeriodo }))
    rerender(<ResumenDesempenoProveedor proveedorId="proveedor-1" abierto />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Periodo del desempeno operativo' }), { target: { value: '90d' } })
    expect(cambiarPeriodo).toHaveBeenCalledWith('90d')

    useDesempeno.mockReturnValue(estado({ puedeConsultar: false }))
    rerender(<ResumenDesempenoProveedor proveedorId="proveedor-1" abierto />)
    expect(screen.queryByRole('heading', { name: 'Desempeno operativo' })).not.toBeInTheDocument()
  })
})
