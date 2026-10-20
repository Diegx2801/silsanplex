import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReparacionesPage } from './ReparacionesPage'

const mocks = vi.hoisted(() => ({ operaciones: vi.fn(), opciones: vi.fn(), puedeCrear: true }))
vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ hasPermission: () => mocks.puedeCrear }) }))
vi.mock('@/modulos/reparaciones/estado/useReparaciones', () => ({ useReparaciones: mocks.operaciones }))
vi.mock('@/modulos/reparaciones/estado/useReparacionOpciones', () => ({ useReparacionOpciones: mocks.opciones }))
vi.mock('@/modulos/reparaciones/estado/useReparacionDetalle', () => ({ useReparacionDetalle: () => ({ detalle: undefined, cargando: false }) }))
vi.mock('@/modulos/reparaciones/componentes/DetalleReparacion', () => ({ DetalleReparacion: () => null }))
vi.mock('@/modulos/reparaciones/componentes/DialogoReparacion', () => ({ DialogoReparacion: () => <div role="dialog" aria-label="Registrar reparación" /> }))

const operacionesIniciales = () => ({
  reparaciones: [], totalFiltrado: 0, resumen: { total: 0, abiertas: 0, esperandoAprobacion: 0, listasParaEntrega: 0 },
  cargando: false, error: null, cargandoResumen: false, errorResumen: null,
  recuperarCreacionPendiente: vi.fn(), reintentar: vi.fn(),
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.puedeCrear = true
  mocks.operaciones.mockReturnValue(operacionesIniciales())
  mocks.opciones.mockReturnValue({ clientes: [], productos: [], almacenes: [], ubicaciones: [], cargando: false })
})
describe('ReparacionesPage: primer bloque', () => {
  it('distingue el registro vacío de una búsqueda sin coincidencias y permite limpiar', () => {
    render(<ReparacionesPage />)
    expect(screen.getByText('Aún no hay reparaciones registradas')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar reparación' }), { target: { value: 'no existe' } })
    expect(screen.getByText('No hay coincidencias')).toBeVisible()
    expect(screen.queryByText('Aún no hay reparaciones registradas')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas las reparaciones' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByText('Aún no hay reparaciones registradas')).toBeVisible()
  })
  it('restaura estado y prioridad junto con la búsqueda', () => {
    render(<ReparacionesPage />)
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'testing' } })
    fireEvent.change(screen.getByLabelText('Prioridad'), { target: { value: 'urgent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(mocks.operaciones).toHaveBeenLastCalledWith(expect.objectContaining({ consulta: { busqueda: '', estado: 'todos', prioridad: 'todas' }, pagina: 1 }))
  })
  it('no presenta ceros como datos confirmados mientras carga el resumen', () => {
    mocks.operaciones.mockReturnValue({ ...operacionesIniciales(), cargandoResumen: true })
    render(<ReparacionesPage />)
    const resumen = screen.getByRole('region', { name: 'Resumen de reparaciones' })
    expect(within(resumen).getAllByText('—')).toHaveLength(4)
    expect(within(resumen).queryByText('0')).not.toBeInTheDocument()
  })
  it('mantiene disponible el listado si falla únicamente el resumen', () => {
    const operaciones = { ...operacionesIniciales(), errorResumen: new Error('falló resumen') }
    mocks.operaciones.mockReturnValue(operaciones)
    render(<ReparacionesPage />)
    expect(screen.getByText('No se pudo cargar el resumen.')).toBeVisible()
    expect(screen.getByText('Aún no hay reparaciones registradas')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar resumen' }))
    expect(operaciones.reintentar).toHaveBeenCalledOnce()
  })
  it('consulta catálogos solo al abrir una tarea que los necesita', () => {
    render(<ReparacionesPage />)
    expect(mocks.opciones).toHaveBeenLastCalledWith(expect.objectContaining({ cargarClientes: false, cargarProductos: false, cargarAlmacenes: false }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Registrar reparación' })[0])
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(mocks.opciones).toHaveBeenLastCalledWith(expect.objectContaining({ cargarClientes: true, cargarProductos: true }))
  })
  it('no ofrece registrar a usuarios de consulta', () => {
    mocks.puedeCrear = false
    render(<ReparacionesPage />)
    expect(screen.queryByRole('button', { name: 'Registrar reparación' })).not.toBeInTheDocument()
  })
})
