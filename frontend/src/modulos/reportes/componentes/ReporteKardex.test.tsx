import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReporteKardex } from './ReporteKardex'

const mocks = vi.hoisted(() => ({
  useReporteKardex: vi.fn(),
  useOpcionesProductoInventario: vi.fn(),
  hasPermission: vi.fn(),
  listarKardexReporte: vi.fn(),
  descargarKardex: vi.fn(),
}))

vi.mock('@/modulos/reportes/estado/useReporteKardex', () => ({ useReporteKardex: mocks.useReporteKardex }))
vi.mock('@/modulos/inventario/estado/useOpcionesProductoInventario', () => ({ useOpcionesProductoInventario: mocks.useOpcionesProductoInventario }))
vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ hasPermission: mocks.hasPermission }) }))
vi.mock('@/modulos/reportes/servicios/kardexReporteService', () => ({ listarKardexReporte: mocks.listarKardexReporte }))
vi.mock('@/modulos/reportes/servicios/exportarKardex', () => ({ descargarKardex: mocks.descargarKardex }))

const opcion = {
  id: 'product-1', codigo: 'SKU-01', descripcion: 'Producto uno', codigoBarras: '',
  unidadMedida: 'Caja', controlLote: true, controlVencimiento: true,
}

const movimiento = {
  id: 'movement-1', secuencia: 1, fechaOperacion: '2026-09-03', fechaRegistro: '2026-09-03T15:00:00Z',
  productoId: 'product-1', productoCodigo: 'SKU-01', productoDescripcion: 'Producto uno', unidadMedida: 'Caja',
  almacenId: 'warehouse-1', almacen: 'Central', ubicacionCodigo: 'A-01', ubicacionNombre: 'Anaquel 1',
  estado: 'available', lote: 'LOT-1', fechaVencimiento: '2030-12-31', tipo: 'salida',
  entrada: 0, salida: 2, saldoAnterior: 8, saldoPosterior: 6, documentoReferencia: 'GUIA-01',
  tipoOrigen: 'manual', motivo: 'Despacho confirmado', responsable: 'Almacenero',
}

describe('ReporteKardex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasPermission.mockReturnValue(true)
    mocks.useOpcionesProductoInventario.mockReturnValue({
      data: { items: [opcion], totalCount: 1 }, isLoading: false, error: null,
    })
    mocks.useReporteKardex.mockReturnValue({
      data: { elementos: [movimiento], total: 1, pagina: 1, tamanioPagina: 25, totalPaginas: 1 },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    })
    mocks.listarKardexReporte.mockResolvedValue({ elementos: [movimiento], total: 1 })
  })

  it('requiere elegir producto y presenta trazabilidad y saldos por movimiento', () => {
    render(<ReporteKardex organizationId="org-1" almacenes={[]} />)
    expect(screen.getByRole('heading', { name: 'Kardex detallado' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Selecciona un producto')

    fireEvent.change(screen.getByRole('combobox', { name: 'Producto' }), { target: { value: 'product-1' } })
    expect(screen.getByText('GUIA-01')).toBeVisible()
    expect(screen.getByText('Despacho confirmado')).toBeVisible()
    expect(screen.getByText('Almacenero')).toBeVisible()
    expect(screen.getByText('Saldo anterior')).toBeVisible()
    expect(screen.getByText('8')).toBeVisible()
    expect(screen.getByText('6')).toBeVisible()
  })

  it('exporta el resultado completo solo con el permiso independiente de exportación', async () => {
    render(<ReporteKardex organizationId="org-1" almacenes={[]} />)
    const boton = screen.getByRole('button', { name: 'Exportar Excel' })
    expect(boton).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Producto' }), { target: { value: 'product-1' } })
    fireEvent.click(boton)

    await waitFor(() => expect(mocks.descargarKardex).toHaveBeenCalledWith([movimiento], expect.objectContaining({
      productoCodigo: 'SKU-01', productoDescripcion: 'Producto uno',
    })) )
    expect(mocks.listarKardexReporte).toHaveBeenCalledWith('org-1', expect.objectContaining({ productoId: 'product-1' }), true)
    expect(screen.getByRole('status')).toHaveTextContent('1 movimientos exportados en Excel.')
  })

  it('oculta la descarga a quien solo puede consultar', () => {
    mocks.hasPermission.mockReturnValue(false)
    render(<ReporteKardex organizationId="org-1" almacenes={[]} />)
    expect(screen.queryByRole('button', { name: 'Exportar Excel' })).not.toBeInTheDocument()
  })
})
