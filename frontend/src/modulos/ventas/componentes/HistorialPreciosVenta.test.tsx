import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistorialPreciosVenta, UltimoPrecioVenta } from './HistorialPreciosVenta'
import { precioHistoricoCompatible } from '@/modulos/ventas/modelo/precioHistorico'
import type { PrecioVentaHistorico } from '@/modulos/ventas/servicios/historialPreciosService'

const mocks = vi.hoisted(() => ({ historial: vi.fn() }))
vi.mock('@/modulos/ventas/estado/useHistorialPreciosVenta', () => ({ useHistorialPreciosVenta: mocks.historial }))
const fila: PrecioVentaHistorico = {
  sale_id: 'sale-1', sale_item_id: 'line-1', sale_date: '2026-11-01', recorded_at: '2026-11-01T12:00:00Z',
  product_id: 'p1', product_code: 'P1', product_description: 'Producto histórico', customer_id: 'c1', customer_name: 'Cliente uno',
  internal_number: 'VEN-000001', document_type: 'nota-venta', document_reference: 'NV-1',
  quantity: 2, unit_of_measure: 'UND', unit_price: 17, currency: 'PEN', prices_include_tax: true,
  tax_affectation: 'gravado', recorded_by: 'actor-verificable',
}
let respuesta: { permitido: boolean; puedeUsar: boolean; filas: PrecioVentaHistorico[]; isPending: boolean; isFetching: boolean; error: Error | null; refetch: ReturnType<typeof vi.fn> }
beforeEach(() => {
  respuesta = { permitido: true, puedeUsar: true, filas: [fila], isPending: false, isFetching: false, error: null, refetch: vi.fn() }
  mocks.historial.mockImplementation(() => respuesta)
})
const props = { clienteId: 'c1', productoId: 'p1', unidad: 'UND', afectacion: 'gravado', incluyeIgv: true }

describe('historial de precios de venta', () => {
  it('solo entrega el precio tras una acción explícita; abrir el historial no cambia precios', () => {
    const alUsar = vi.fn()
    render(<UltimoPrecioVenta {...props} alUsar={alUsar} />)
    expect(screen.getByText(/Último precio vendido/)).toHaveTextContent('PEN 17.0000')
    expect(alUsar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial completo' }))
    expect(screen.getByRole('heading', { name: 'Historial de precios de venta' })).toBeVisible()
    expect(alUsar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Utilizar último precio' }))
    expect(alUsar).toHaveBeenCalledExactlyOnceWith('17')
  })
  it.each([
    { unit_of_measure: 'CAJA' }, { currency: 'USD' }, { prices_include_tax: false },
    { tax_affectation: 'exonerado' }, { tax_affectation: null },
  ])('impide aplicar importes incompatibles: %j', cambio => {
    expect(precioHistoricoCompatible({ ...fila, ...cambio }, 'UND', 'gravado', true)).toBe(false)
  })
  it('respeta el precio mínimo actual', () => {
    render(<UltimoPrecioVenta {...props} minimo={20} alUsar={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Utilizar último precio' })).toBeDisabled()
  })
  it('expone estado vacío y no propone importes ficticios', () => {
    respuesta.filas = []
    render(<UltimoPrecioVenta {...props} alUsar={vi.fn()} />)
    expect(screen.getByText('Este cliente aún no compró este producto.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Utilizar último precio' })).not.toBeInTheDocument()
  })
  it('consulta por producto, fechas y páginas sin descargar todo el historial', () => {
    respuesta.filas = Array.from({ length: 21 }, (_, n) => ({ ...fila, sale_item_id: 'line-' + n }))
    render(<HistorialPreciosVenta clienteId="c1" />)
    expect(screen.getAllByRole('row')).toHaveLength(21)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(mocks.historial).toHaveBeenLastCalledWith('c1', expect.objectContaining({ desplazamiento: 20, limite: 21 }), true)
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'original' } })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-01' } })
    expect(mocks.historial).toHaveBeenLastCalledWith('c1', expect.objectContaining({ desplazamiento: 0, busqueda: 'original', desde: '2026-10-01', hasta: '2026-11-01' }), true)
  })
  it('oculta el historial sin permisos y presenta error recuperable', () => {
    respuesta.permitido = false
    const { rerender } = render(<HistorialPreciosVenta clienteId="c1" />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    respuesta.permitido = true; respuesta.error = new Error('Unavailable')
    rerender(<HistorialPreciosVenta clienteId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(respuesta.refetch).toHaveBeenCalledOnce()
  })
  it('rechaza fechas invertidas y conserva información tributaria explícita', () => {
    render(<HistorialPreciosVenta clienteId="c1" />)
    expect(screen.getByText(/Incluye IGV/)).toBeVisible()
    expect(screen.getByText('actor-verificable')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-02' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-01' } })
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha inicial')
    expect(mocks.historial).toHaveBeenLastCalledWith('c1', expect.anything(), false)
  })
})
