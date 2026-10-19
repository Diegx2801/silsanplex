import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComboboxProps } from '@/components/ui/combobox'
import { DialogoCondicionStock } from './DialogoCondicionStock'

const mocks = vi.hoisted(() => ({ buckets: vi.fn(), listar: vi.fn() }))
const producto = {
  id: 'a1000000-0000-4000-8000-000000000001', codigo: 'P-1', descripcion: 'Paracetamol', codigoBarras: '', unidadMedida: 'Unidad',
  unidadBaseId: 'a2000000-0000-4000-8000-000000000001',
  unidadesEntrada: [
    { id: 'a2000000-0000-4000-8000-000000000001', nombre: 'Unidad', factorConversion: 1 },
    { id: 'a2000000-0000-4000-8000-000000000002', nombre: 'Caja', factorConversion: 20 },
  ], controlLote: true, controlVencimiento: true,
}
const almacen = { id: 'a3000000-0000-4000-8000-000000000001', codigo: 'CENTRAL', nombre: 'Almacén central', activo: true, direccion: '' }
const ubicacion = { id: 'a4000000-0000-4000-8000-000000000001', almacenId: almacen.id, codigo: 'A-1', nombre: 'Anaquel 1', activa: true, descripcion: '' }
const bucket = {
  productoId: producto.id, almacenId: almacen.id, ubicacionId: ubicacion.id, ubicacionCodigo: 'A-1', ubicacionNombre: 'Anaquel 1',
  almacenCodigo: 'CENTRAL', almacenNombre: 'Almacén central', productoCodigo: 'P-1', productoDescripcion: 'Paracetamol', unidadMedida: 'Unidad',
  estadoStock: 'available', lote: 'L-25', fechaVencimiento: '2027-01-01', cantidadFisica: 100, cantidadReservada: 20, costoPromedio: 0.5,
}
vi.mock('../estado/useBucketsAjusteStock', () => ({ useBucketsAjusteStock: (...args: unknown[]) => mocks.buckets(...args) }))
vi.mock('../servicios/inventarioService', () => ({ listarAlmacenesAjusteStock: (...args: unknown[]) => mocks.listar(...args) }))
vi.mock('./SelectorProductoInventario', () => ({
  SelectorProductoInventario: ({ onValueChange }: { onValueChange: (id: string, opcion: typeof producto) => void }) =>
    <button type="button" onClick={() => onValueChange(producto.id, producto)}>Elegir producto</button>,
}))
vi.mock('@/components/ui/combobox', () => ({
  Combobox: (props: ComboboxProps) => {
    const opciones = props.id === 'condicion-almacen' ? [{ value: almacen.id, label: 'CENTRAL · Almacén central' }] : props.options
    return <label>{props.label}<select aria-label={props.label} value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value, opciones.find((o) => o.value === e.target.value))}>
      <option value="">Seleccionar</option>{opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>{props.error ? <p>{props.error}</p> : null}</label>
  },
}))
function montar(reclasificar = vi.fn().mockResolvedValue(undefined)) {
  const cerrar = vi.fn()
  render(<QueryClientProvider client={new QueryClient()}><DialogoCondicionStock organizationId="org" abierto almacenes={[almacen]} ubicaciones={[ubicacion]} alCambiarAbierto={cerrar} reclasificar={reclasificar} /></QueryClientProvider>)
  return { reclasificar, cerrar }
}
function completar(cantidad = '2') {
  fireEvent.click(screen.getByRole('button', { name: 'Elegir producto' }))
  fireEvent.change(screen.getByLabelText('Almacén'), { target: { value: almacen.id } })
  const posicion = screen.getByLabelText('Ubicación y lote') as HTMLSelectElement
  fireEvent.change(posicion, { target: { value: posicion.options[1].value } })
  fireEvent.change(screen.getByLabelText('Cantidad a cambiar *'), { target: { value: cantidad } })
  fireEvent.change(screen.getByLabelText('Unidad de medida *'), { target: { value: producto.unidadesEntrada[1].id } })
  fireEvent.change(screen.getByLabelText('Nueva condición *'), { target: { value: 'quarantine' } })
  fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'Inspección pendiente' } })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.buckets.mockReturnValue({ buckets: [bucket], consultando: false, error: '' })
})
describe('DialogoCondicionStock', () => {
  it('no pide reconstruir lote, vencimiento, referencia ni observación', () => {
    montar()
    expect(screen.queryByLabelText(/Documento|Observación|Vencimiento|Estado actual/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Almacén')).toHaveValue('')
    expect(screen.getByLabelText('Ubicación y lote')).toBeDisabled()
  })
  it('valida junto al campo y excluye la condición actual', () => {
    montar()
    completar('5')
    expect(screen.getByLabelText('Nueva condición *')).not.toHaveTextContent('Disponible')
    expect(screen.getByText('80 Unidad')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cambio' }))
    expect(screen.getByLabelText('Cantidad a cambiar *')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/Puedes cambiar hasta 4 Caja/)).toBeVisible()
  })
  it('revisa, conserva posición y unidad capturada y cierra sólo al confirmar', async () => {
    const { reclasificar, cerrar } = montar()
    completar()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cambio' }))
    expect(reclasificar).not.toHaveBeenCalled()
    expect(screen.getByText('Equivale a 40 Unidad')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }))
    await waitFor(() => expect(cerrar).toHaveBeenCalledWith(false))
    expect(reclasificar).toHaveBeenCalledWith(expect.objectContaining({
      productoId: producto.id, almacenId: almacen.id, ubicacionId: ubicacion.id,
      estadoOrigen: 'available', estadoDestino: 'quarantine', lote: 'L-25', fechaVencimiento: '2027-01-01',
      cantidad: '2', unidadEntradaId: producto.unidadesEntrada[1].id, factorConversionEsperado: 20, motivo: 'Inspección pendiente',
    }), expect.any(String))
  })
  it('conserva la clave idempotente al reintentar y al volver sin cambiar los datos', async () => {
    const guardar = vi.fn().mockResolvedValue('La consulta tardó demasiado. Reintenta.')
    montar(guardar)
    completar()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cambio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }))
    await screen.findByText('La consulta tardó demasiado. Reintenta.')
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cambio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }))
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(2))
    expect(guardar.mock.calls[0][1]).toBe(guardar.mock.calls[1][1])
  })
  it('no permite revisar una posición durante una consulta', () => {
    mocks.buckets.mockReturnValue({ buckets: [bucket], consultando: true, error: '' })
    const { reclasificar } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir producto' }))
    fireEvent.change(screen.getByLabelText('Almacén'), { target: { value: almacen.id } })
    expect(screen.getByLabelText('Ubicación y lote')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cambio' }))
    expect(reclasificar).not.toHaveBeenCalled()
    expect(screen.getByText(/Selecciona una posición con stock no reservado/)).toBeVisible()
  })
})
