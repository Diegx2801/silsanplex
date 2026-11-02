import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Reparacion } from '../modelo/reparacion'
import { FechasReparacion } from './FechasReparacion'

const evidencia = { event_id: '9007199254740993', completed_at: '2026-11-01T02:30:00Z', test_cycle_number: 2,
  actor_user_id: null, actor_name: 'Actor original', assigned_technician_id: null, assigned_technician_name: 'Técnico original' }
const base = { estado: 'ready_for_delivery', entregadaEn: '', tecnicoAsignadoId: 'otro-tecnico', finalizacionTecnica: evidencia,
  primeraFinalizacionTecnica: evidencia } as Reparacion
describe('fechas técnicas separadas', () => {
  it('muestra fecha canónica, responsables históricos y entrega todavía pendiente', () => {
    render(<FechasReparacion reparacion={base} />)
    expect(screen.getByText('Actor original')).toBeVisible()
    expect(screen.getByText('Técnico original')).toBeVisible()
    expect(screen.getByText('Pendiente de entrega')).toBeVisible()
    expect(screen.getByText(/31 oct/).closest('time')).toHaveAttribute('datetime', evidencia.completed_at)
    expect(screen.queryByText('otro-tecnico')).not.toBeInTheDocument()
  })
  it('separa finalización y entrega posterior', () => {
    const { container } = render(<FechasReparacion reparacion={{ ...base, estado: 'delivered', entregadaEn: '2026-11-05T15:00:00Z' }} />)
    expect([...container.querySelectorAll('time')].map(e => e.dateTime)).toEqual([evidencia.completed_at, '2026-11-05T15:00:00Z'])
  })
  it('retira vigencia durante retrabajo aunque existe primera fecha histórica', () => {
    render(<FechasReparacion reparacion={{ ...base, estado: 'in_repair', finalizacionTecnica: null }} />)
    expect(screen.getByText('Sin finalización vigente — requiere nueva validación técnica.')).toBeVisible()
    expect(screen.queryByText('Actor original')).not.toBeInTheDocument()
  })
  it.each(['non_repairable', 'returned_unrepaired'] as const)('diferencia R28 en %s', estado => {
    render(<FechasReparacion reparacion={{ ...base, estado, finalizacionTecnica: null }} />)
    expect(screen.getByText('No aplica como reparación completada.')).toBeVisible()
  })
  it('tolera modelos antiguos y fechas ausentes', () => {
    render(<FechasReparacion reparacion={{ estado: 'received', entregadaEn: '' } as Reparacion} />)
    expect(screen.getByText('No registrada')).toBeVisible()
  })
})
