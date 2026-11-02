import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DetalleReparacion } from '../modelo/reparacion'
const mock = vi.hoisted(() => ({ user: 'tech', permissions: ['REPAIRS_CHANGE_STATUS', 'REPAIRS_PERFORM_TECHNICAL'], ejecutar: vi.fn(), recuperar: vi.fn() }))
vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ user: { id: mock.user }, hasPermission: (p: string) => mock.permissions.includes(p) }) }))
vi.mock('../servicios/noReparableService', () => ({ ejecutarNoReparable: mock.ejecutar, recuperarNoReparable: mock.recuperar }))
vi.mock('./DialogoEntregaAccesorios', () => ({ DialogoEntregaAccesorios: () => <div>Devolución B1 con accesorios</div> }))
import { NoReparableReparacion } from './NoReparableReparacion'
const id = 'b1000000-0000-4000-8000-000000000001'
function detalle(estado = 'diagnosis'): DetalleReparacion {
  return { reparacion: { id, organizationId: id, estado, tecnicoAsignadoId: 'tech', lockVersion: 4, codigo: 'REP-1', productoDescripcionSnapshot: 'Monitor' },
    diagnosticos: [{ id, sintomas: 'Placa dañada', causaEncontrada: 'Daño irreversible' }], partes: [] } as unknown as DetalleReparacion
}
const mostrar = (datos = detalle()) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NoReparableReparacion detalle={datos} /></QueryClientProvider>)
beforeEach(() => { vi.clearAllMocks(); mock.user = 'tech'; mock.permissions = ['REPAIRS_CHANGE_STATUS', 'REPAIRS_PERFORM_TECHNICAL']; mock.recuperar.mockReturnValue(null); mock.ejecutar.mockResolvedValue(undefined) })
describe('decisión técnica B1', () => {
  it.each(['non_repairable', 'returned_unrepaired', 'delivered', 'cancelled', 'rejected'])('recuperar sin pendiente en %s nunca crea una declaración', estado => {
    mostrar(detalle(estado))
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar decisión pendiente' }))
    expect(screen.getByRole('alert')).toHaveTextContent('No hay una decisión pendiente')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mock.ejecutar).not.toHaveBeenCalled()
  })
  it('no sustituye creación por recuperación implícita cuando ya hay una intención pendiente', () => {
    mock.recuperar.mockReturnValue({ tipo: 'declare_repair_non_repairable', expectedLockVersion: 3, datos: { diagnosis_id: id, reason: 'Original' }, clave: id })
    mostrar(); fireEvent.click(screen.getByRole('button', { name: 'Declarar No reparable' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Usa Recuperar decisión pendiente')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('permite confirmar el replay original tras reasignación sin ofrecer nuevas decisiones al técnico anterior', async () => {
    const comando = { tipo: 'declare_repair_non_repairable', expectedLockVersion: 3, datos: { diagnosis_id: id, reason: 'Original' }, clave: id }
    mock.recuperar.mockReturnValue(comando)
    const d = detalle('non_repairable'); d.reparacion.tecnicoAsignadoId = 'other-tech'; mostrar(d)
    expect(screen.queryByRole('button', { name: 'Reabrir evaluación técnica' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar decisión pendiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar decisión' }))
    await waitFor(() => expect(mock.ejecutar).toHaveBeenCalledWith(expect.any(String), id, id, expect.objectContaining({ expectedLockVersion: 3 }), id))
  })
  it('no ofrece recuperación ni creación sin las capacidades técnicas', () => {
    mock.permissions = ['REPAIRS_VIEW']; mostrar(detalle('non_repairable'))
    expect(screen.queryByRole('button', { name: 'Recuperar decisión pendiente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Declarar No reparable' })).not.toBeInTheDocument()
  })
  it('solo ofrece declarar al técnico con capacidades y asignación', () => {
    mock.user = 'admin'; mostrar()
    expect(screen.queryByRole('button', { name: 'Declarar No reparable' })).not.toBeInTheDocument()
  })
  it('bloquea si hay reservas pendientes o falta diagnóstico', () => {
    const d = detalle(); d.diagnosticos = []; mostrar(d)
    expect(screen.getByRole('button', { name: 'Declarar No reparable' })).toBeDisabled()
  })
  it('envía diagnóstico y motivo sin inventar actor o fecha', async () => {
    mostrar(); fireEvent.click(screen.getByRole('button', { name: 'Declarar No reparable' }))
    fireEvent.change(screen.getByLabelText('Motivo técnico *'), { target: { value: 'Placa destruida' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar decisión No reparable' }))
    await waitFor(() => expect(mock.ejecutar).toHaveBeenCalledWith(expect.any(String), id, id,
      { tipo: 'declare_repair_non_repairable', expectedLockVersion: 4, datos: { diagnosis_id: id, reason: 'Placa destruida' } }, expect.any(String)))
  })
  it('presenta errores de servidor sin cerrar el formulario', async () => {
    mock.ejecutar.mockRejectedValue(new Error('Hay reservas pendientes')); mostrar()
    fireEvent.click(screen.getByRole('button', { name: 'Declarar No reparable' }))
    fireEvent.change(screen.getByLabelText('Motivo técnico *'), { target: { value: 'Daño' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar decisión No reparable' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('reservas pendientes')
  })
  it('permite devolver al usuario de entrega sin conceder decisión técnica', () => {
    mock.permissions = ['REPAIRS_DELIVER']; mostrar(detalle('non_repairable'))
    expect(screen.queryByRole('button', { name: 'Reabrir evaluación técnica' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Devolver sin reparar' }))
    expect(screen.getByText('Devolución B1 con accesorios')).toBeVisible()
  })
  it('no ofrece reabrir una orden devuelta', () => {
    mostrar(detalle('returned_unrepaired'))
    expect(screen.queryByRole('button', { name: 'Reabrir evaluación técnica' })).not.toBeInTheDocument()
  })
  it('recupera el comando y la versión anteriores después de un cambio de estado', async () => {
    mock.recuperar.mockReturnValue({ tipo: 'declare_repair_non_repairable', expectedLockVersion: 3, datos: { diagnosis_id: id, reason: 'Original' }, clave: id })
    mostrar(detalle('non_repairable')); fireEvent.click(screen.getByRole('button', { name: 'Recuperar decisión pendiente' }))
    expect(screen.getByLabelText('Motivo técnico *')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar decisión' }))
    await waitFor(() => expect(mock.ejecutar).toHaveBeenCalledWith(expect.any(String), id, id, expect.objectContaining({ expectedLockVersion: 3 }), id))
  })
})
