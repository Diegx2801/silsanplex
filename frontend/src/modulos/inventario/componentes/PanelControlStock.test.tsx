import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelControlStock } from './PanelControlStock'
import type { AlertaInventario } from '../modelo/almacen'

const { useListados } = vi.hoisted(() => ({ useListados: vi.fn() }))
vi.mock('../estado/useListadosAlmacen', () => ({ useListadosAlmacen: useListados }))
vi.mock('../estado/useDebounceInventario', () => ({ useDebounceInventario: (valor: string) => valor }))
vi.mock('./DialogoCondicionStock', () => ({ DialogoCondicionStock: () => <div role="dialog" aria-label="Cambiar condición del stock" /> }))
vi.mock('./DialogoConfiguracionAlertas', () => ({ DialogoConfiguracionAlertas: () => <div role="dialog" aria-label="Configurar alertas" /> }))
const alerta: AlertaInventario = {
  productoId: 'producto', productoCodigo: 'MED-001', productoDescripcion: 'Medicamento de prueba', unidadMedida: 'Unidad',
  almacenId: 'central', almacenCodigo: 'CENTRAL', almacenNombre: 'Central', ubicacionId: 'anaquel', ubicacionCodigo: 'A-01', ubicacionNombre: 'Anaquel 1',
  estado: 'quarantine', lote: 'LOT-001', fechaVencimiento: '2026-10-19', cantidad: 4, valorInventario: 20, costoPromedio: 5,
  stockMinimo: 8, diasAlertaVencimiento: 30, alertaStockMinimo: true, alertaVencimiento: true, diasParaVencer: 0, estadoVencimiento: 'urgent',
}
function consulta(elementos: AlertaInventario[] = []) {
  return { data: { elementos, total: elementos.length, totalPaginas: 1 }, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }
}
function renderPanel(ruta = '/inventario/control', puedeGestionar = true) {
  return render(<MemoryRouter initialEntries={[ruta]}><PanelControlStock organizationId="org"
    almacenes={[{ id: 'central', codigo: 'CENTRAL', nombre: 'Central', direccion: '', activo: true }]}
    ubicaciones={[]} puedeGestionar={puedeGestionar} reclasificar={vi.fn()} configurar={vi.fn()} /></MemoryRouter>)
}
describe('PanelControlStock', () => {
  beforeEach(() => {
    useListados.mockReset()
    useListados.mockReturnValue({ alertas: consulta(), vencimientos: consulta() })
  })
  it('consulta solo la vista activa y mantiene formularios fuera de la página inicial', () => {
    renderPanel()
    expect(useListados).toHaveBeenLastCalledWith({ alertas: expect.objectContaining({ pagina: 1, busqueda: '' }) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar condición' }))
    expect(screen.getByRole('dialog', { name: 'Cambiar condición del stock' })).toBeVisible()
  })
  it('muestra mínimos con unidades y no atribuye un lote al agregado', () => {
    useListados.mockReturnValue({ alertas: consulta([alerta]), vencimientos: consulta() })
    renderPanel()
    expect(screen.getByText('4 Unidad disponibles')).toBeVisible()
    expect(screen.getByText('Mínimo: 8 Unidad')).toBeVisible()
    expect(screen.queryByText(/Sin lote|LOT-001/)).not.toBeInTheDocument()
  })
  it('muestra ubicación, cantidad, condición y fecha de vencimiento sin claves duplicadas', () => {
    const consoleError = vi.spyOn(console, 'error')
    useListados.mockReturnValue({ alertas: consulta(), vencimientos: consulta([alerta, { ...alerta, estado: 'available' }]) })
    renderPanel('/inventario/control?vista=vencimientos')
    expect(useListados).toHaveBeenLastCalledWith({ vencimientos: expect.any(Object) })
    expect(screen.getAllByText(/Central · A-01 · Anaquel 1 · Lote LOT-001/)).toHaveLength(2)
    expect(screen.getAllByText('4 Unidad')).toHaveLength(2)
    expect(screen.getByText('Cuarentena')).toBeVisible()
    expect(screen.getAllByText('Vence hoy')).toHaveLength(2)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
  it('restaura búsqueda, almacén, orden, fechas, paginación y estado de vencimiento', () => {
    renderPanel('/inventario/control?vista=vencimientos')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'paracetamol' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Almacén' }), { target: { value: 'central' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Orden' }), { target: { value: 'vencimiento-desc' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado del vencimiento' }), { target: { value: 'expired' } })
    fireEvent.change(screen.getByLabelText('Vence desde'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Vence hasta'), { target: { value: '2026-10-31' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filas por página de vencimientos' }), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(useListados).toHaveBeenLastCalledWith({ vencimientos: {
      pagina: 1, tamanioPagina: 25, busqueda: '', almacenId: '', orden: 'vencimiento-asc', estadoVencimiento: '', fechaDesde: '', fechaHasta: '',
    } })
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled()
  })
  it('distingue una lista sin alertas de una búsqueda sin coincidencias', () => {
    renderPanel()
    expect(screen.getByText(/No hay alertas de stock mínimo registradas/)).toBeVisible()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'medicamento' } })
    expect(screen.getByText(/No hay coincidencias para estos filtros/)).toBeVisible()
  })
  it('permite cambiar de vista sin perder los filtros de cada listado', () => {
    renderPanel()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'mínimo' } })
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Vistas de control de stock' })).getByRole('link', { name: 'Vencimientos' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    fireEvent.click(screen.getByRole('link', { name: 'Stock mínimo' }))
    expect(screen.getByRole('searchbox')).toHaveValue('mínimo')
  })
  it('no ofrece acciones de gestión a un usuario de solo consulta', () => {
    renderPanel('/inventario/control', false)
    expect(screen.queryByRole('button', { name: 'Cambiar condición' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Configurar alertas' })).not.toBeInTheDocument()
  })
  it('explica un rango de fechas invertido y no consulta un listado inválido', () => {
    renderPanel('/inventario/control?vista=vencimientos')
    fireEvent.change(screen.getByLabelText('Vence desde'), { target: { value: '2026-10-31' } })
    fireEvent.change(screen.getByLabelText('Vence hasta'), { target: { value: '2026-10-01' } })
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha hasta debe ser igual o posterior')
    expect(useListados).toHaveBeenLastCalledWith({})
  })
})
