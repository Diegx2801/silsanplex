import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EventoReparacion } from '../modelo/reparacion'
import { DetalleEventoNoReparable } from './DetalleEventoNoReparable'

const original: EventoReparacion = { id: '9007199254740993', organizationId: 'org', reparacionId: 'repair', tipo: 'NON_REPAIRABLE_DECLARED',
  estadoAnterior: 'diagnosis', estadoNuevo: 'non_repairable', actorId: 'tech-original', creadoEn: '2026-10-29T15:00:00Z',
  observacion: 'Placa irrecuperable', metadata: { technician_id: 'tech-original', technician_name: 'Técnico original', diagnosis_id: 'diagnosis-original',
    diagnosis_snapshot: { symptoms: 'Síntomas originales', cause_found: 'Daño original', recommended_solution: 'No viable', notes: 'Informe histórico' } } }
const revocacion: EventoReparacion = { ...original, id: '9007199254740995', tipo: 'NON_REPAIRABLE_REOPENED', actorId: 'tech-nuevo',
  estadoAnterior: 'non_repairable', estadoNuevo: 'diagnosis', observacion: 'Nueva evaluación solicitada',
  metadata: { decision_event_id: original.id, actor_name: 'Técnico nuevo' } }

describe('historial específico B1', () => {
  it('muestra declaración, fecha, actor, técnico y snapshot persistido', () => {
    render(<DetalleEventoNoReparable evento={original} eventos={[original]} />)
    expect(screen.getByText('Técnico que confirmó la decisión: Técnico original · tech-original')).toBeVisible()
    expect(screen.getByText(/Actor de la operación: Técnico original/)).toBeVisible()
    expect(screen.getByText('Síntomas históricos: Síntomas originales')).toBeVisible()
    expect(screen.getByText('Causa histórica: Daño original')).toBeVisible()
    expect(screen.getByText('Motivo de no reparabilidad: Placa irrecuperable')).toBeVisible()
    expect(screen.getByText('Informe histórico', { exact: false })).toBeVisible()
    expect(screen.getByText('Fecha y hora:').querySelector('time')).toHaveAttribute('datetime', original.creadoEn)
  })
  it('revocación resuelve la decisión original con bigint exacto y conserva su técnico aunque el actor sea otro', () => {
    render(<DetalleEventoNoReparable evento={revocacion} eventos={[revocacion, original]} />)
    expect(screen.getByText(/Actor de la operación: Técnico nuevo/)).toBeVisible()
    expect(screen.getByText('Técnico que confirmó la decisión: Técnico original · tech-original')).toBeVisible()
    expect(screen.getByText('Motivo de reevaluación: Nueva evaluación solicitada')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ver decisión original' })).toHaveAttribute('href', '#repair-event-9007199254740993')
    expect(screen.getByText(/Decisión revocada: 9007199254740993/)).toBeVisible()
  })
  it('muestra responsable de devolución sin sustituir al técnico original', () => {
    render(<DetalleEventoNoReparable evento={{ ...revocacion, tipo: 'RETURNED_UNREPAIRED', metadata: { decision_event_id: original.id, actor_name: 'Responsable físico' } }} eventos={[original]} />)
    expect(screen.getByText('Responsable de devolución: Responsable físico')).toBeVisible()
    expect(screen.getByText(/Técnico que confirmó la decisión: Técnico original/)).toBeVisible()
  })
  it('no inventa el snapshot cuando no está disponible la decisión referenciada', () => {
    render(<DetalleEventoNoReparable evento={revocacion} eventos={[]} />)
    expect(screen.getByText(/No se dispone del detalle/)).toBeVisible()
    expect(screen.queryByText(/Técnico que confirmó/)).not.toBeInTheDocument()
  })
  it('no interpreta eventos de accesorios ni otros módulos como decisiones B1', () => {
    const { container } = render(<DetalleEventoNoReparable evento={{ ...original, tipo: 'ACCESSORY_RETURNED' }} eventos={[original]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
