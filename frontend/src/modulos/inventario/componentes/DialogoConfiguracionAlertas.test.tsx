import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { inventoryQueryKeys } from '../estado/inventoryQueryKeys'
import { DialogoConfiguracionAlertas } from './DialogoConfiguracionAlertas'

const { obtenerConfiguracion } = vi.hoisted(() => ({ obtenerConfiguracion: vi.fn() }))
vi.mock('../servicios/almacenService', () => ({ obtenerConfiguracionAlertasStock: obtenerConfiguracion }))
vi.mock('./SelectorProductoInventario', () => ({
  SelectorProductoInventario: ({ id, value, onValueChange, autoSeleccionarPrimeraOpcion }: {
    id: string
    value: string
    autoSeleccionarPrimeraOpcion: boolean
    onValueChange: (value: string, option: { id: string; unidadMedida: string }) => void
  }) => <label htmlFor={id}>Producto<select id={id} value={value} data-autoselect={String(autoSeleccionarPrimeraOpcion)} onChange={(evento) => onValueChange(evento.target.value, { id: evento.target.value, unidadMedida: 'Unidad' })}>
    <option value="">Selecciona un producto</option>
    <option value="30000000-0000-4000-8000-000000000001">Producto de prueba</option>
    <option value="30000000-0000-4000-8000-000000000002">Segundo producto</option>
  </select></label>,
}))
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({ id, label, value, options, onChange, disabled, helperText }: {
    id: string; label: string; value: string; options: { value: string; label: string }[]
    onChange: (id: string) => void; disabled?: boolean; helperText?: string
  }) => <div><label htmlFor={id}>{label}<select id={id} value={value} disabled={disabled} onChange={(evento) => onChange(evento.target.value)}>
    <option value="">Selecciona</option>
    {options.map((opcion) => <option key={opcion.value} value={opcion.value}>{opcion.label}</option>)}
  </select></label><p>{helperText}</p></div>,
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const productId = '30000000-0000-4000-8000-000000000001'
const warehouseId = '20000000-0000-4000-8000-000000000001'
const locationId = '40000000-0000-4000-8000-000000000001'

function renderDialogo() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const configurar = vi.fn().mockResolvedValue(undefined)
  const alCambiarAbierto = vi.fn()
  render(<QueryClientProvider client={client}><DialogoConfiguracionAlertas
    organizationId={organizationId}
    abierto
    almacenes={[{ id: warehouseId, codigo: 'CENTRAL', nombre: 'Central', direccion: '', activo: true }]}
    ubicaciones={[{ id: locationId, almacenId: warehouseId, codigo: 'A-01', nombre: 'Anaquel 1', descripcion: '', activa: true }]}
    configurar={configurar}
    alCambiarAbierto={alCambiarAbierto}
  /></QueryClientProvider>)
  return { client, configurar, alCambiarAbierto }
}

function seleccionarContexto() {
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: productId } })
  fireEvent.change(screen.getByLabelText('Almacén'), { target: { value: warehouseId } })
}

describe('DialogoConfiguracionAlertas', () => {
  beforeEach(() => { obtenerConfiguracion.mockReset() })

  it('no elige automáticamente un producto ni permite guardar antes de cargar su configuración', () => {
    obtenerConfiguracion.mockResolvedValue(null)
    renderDialogo()
    expect(screen.getByLabelText('Producto')).toHaveValue('')
    expect(screen.getByLabelText('Producto')).toHaveAttribute('data-autoselect', 'false')
    expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeDisabled()
    expect(obtenerConfiguracion).not.toHaveBeenCalled()
  })

  it('carga los valores guardados, identifica la unidad base y conserva el borrador tras refetch', async () => {
    obtenerConfiguracion.mockResolvedValue({ ubicacionId: locationId, stockMinimo: 5.25, diasVencimiento: 45 })
    const { client } = renderDialogo()
    seleccionarContexto()
    await waitFor(() => expect(screen.getByLabelText('Stock mínimo (Unidad) *')).toHaveValue(5.25))
    expect(screen.getByLabelText('Avisar antes del vencimiento (días) *')).toHaveValue(45)
    expect(screen.getByLabelText('Ubicación predeterminada')).toHaveValue(locationId)
    fireEvent.change(screen.getByLabelText('Stock mínimo (Unidad) *'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Avisar antes del vencimiento (días) *'), { target: { value: '60' } })
    obtenerConfiguracion.mockResolvedValue({ ubicacionId: locationId, stockMinimo: 2, diasVencimiento: 10 })
    await act(async () => { await client.refetchQueries({ queryKey: inventoryQueryKeys.stockPolicy(organizationId, productId, warehouseId) }) })
    expect(screen.getByLabelText('Stock mínimo (Unidad) *')).toHaveValue(12)
    expect(screen.getByLabelText('Avisar antes del vencimiento (días) *')).toHaveValue(60)
  })

  it('explica y guarda los valores predeterminados de una combinación nueva', async () => {
    obtenerConfiguracion.mockResolvedValue(null)
    const { configurar, alCambiarAbierto } = renderDialogo()
    seleccionarContexto()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeEnabled())
    expect(screen.getByLabelText('Stock mínimo (Unidad) *')).toHaveValue(0)
    expect(screen.getByLabelText('Avisar antes del vencimiento (días) *')).toHaveValue(30)
    expect(screen.getByText(/Aún no hay configuración guardada/)).toBeVisible()
    expect(screen.getByText(/No limita las alertas/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }))
    await waitFor(() => expect(configurar).toHaveBeenCalledWith({ productoId: productId, almacenId: warehouseId, ubicacionId: locationId, stockMinimo: 0, diasVencimiento: 30 }))
    expect(alCambiarAbierto).toHaveBeenCalledWith(false)
  })

  it('ofrece reintentar la carga y bloquea guardar mientras hay un error', async () => {
    obtenerConfiguracion.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(null)
    renderDialogo()
    seleccionarContexto()
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeEnabled())
  })

  it('no reutiliza los valores del producto anterior al cambiar de combinación', async () => {
    obtenerConfiguracion.mockResolvedValueOnce({ ubicacionId: locationId, stockMinimo: 5, diasVencimiento: 45 }).mockResolvedValue(null)
    renderDialogo()
    seleccionarContexto()
    await waitFor(() => expect(screen.getByLabelText('Stock mínimo (Unidad) *')).toHaveValue(5))
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: '30000000-0000-4000-8000-000000000002' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeEnabled())
    expect(screen.getByLabelText('Stock mínimo (Unidad) *')).toHaveValue(0)
    expect(screen.getByLabelText('Avisar antes del vencimiento (días) *')).toHaveValue(30)
  })

  it('conserva el borrador si falla guardar y permite volver a intentarlo', async () => {
    obtenerConfiguracion.mockResolvedValue(null)
    const { configurar, alCambiarAbierto } = renderDialogo()
    configurar.mockResolvedValue('No tienes permiso para cambiar esta configuración.')
    seleccionarContexto()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Stock mínimo (Unidad) *'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso')
    expect(screen.getByLabelText('Stock mínimo (Unidad) *')).toHaveValue(18)
    expect(alCambiarAbierto).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeEnabled()
  })
})
