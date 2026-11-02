import type { EventoReparacion } from '../modelo/reparacion'

const objeto = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const texto = (v: unknown) => typeof v === 'string' && v.trim() ? v : 'Sin dato registrado'
const identificador = (v: unknown): string | null => typeof v === 'string' && /^[1-9]\d*$/.test(v) ? v
  : typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? String(v) : null
const fecha = (v: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(v))

/** Only persisted events are used: never substitute the currently assigned technician. */
export function DetalleEventoNoReparable({ evento, eventos }: { evento: EventoReparacion; eventos: readonly EventoReparacion[] }) {
  if (!['NON_REPAIRABLE_DECLARED', 'NON_REPAIRABLE_REOPENED', 'RETURNED_UNREPAIRED'].includes(evento.tipo)) return null
  const m = evento.metadata
  const referencia = identificador(m.decision_event_id)
  const decision = evento.tipo === 'NON_REPAIRABLE_DECLARED' ? evento
    : eventos.find(e => e.tipo === 'NON_REPAIRABLE_DECLARED' && identificador(e.id) === referencia)
  const original = decision?.metadata ?? {}
  const diagnostico = objeto(original.diagnosis_snapshot)
  const actor = m.actor_name ?? (m.technician_id === evento.actorId ? m.technician_name : null) ?? evento.actorId
  const titulo = evento.tipo === 'NON_REPAIRABLE_DECLARED' ? 'Detalle de la declaración No reparable'
    : evento.tipo === 'NON_REPAIRABLE_REOPENED' ? 'Detalle de la reevaluación técnica' : 'Detalle de la devolución sin reparar'
  return <section id={`repair-event-${evento.id}`} aria-label={titulo} data-event-type={evento.tipo} data-event-id={String(evento.id)}
    className="mt-3 space-y-2 border-t pt-3 text-sm text-muted-foreground">
    <p className="font-medium">{titulo}</p>
    <p>Fecha y hora: <time dateTime={evento.creadoEn}>{fecha(evento.creadoEn)}</time></p>
    <p>Actor de la operación: {texto(actor)}{evento.actorId && actor !== evento.actorId ? ` · ${evento.actorId}` : ''}</p>
    {referencia ? <p>{evento.tipo === 'NON_REPAIRABLE_REOPENED' ? 'Decisión revocada' : 'Decisión original'}: {referencia}
      {decision ? <> · <a href={`#repair-event-${referencia}`} className="text-primary underline">Ver decisión original</a></> : null}</p> : null}
    {decision ? <div className="space-y-1" aria-label="Evaluación histórica utilizada">
      <p>Técnico que confirmó la decisión: {texto(original.technician_name)} · {texto(original.technician_id)}</p>
      <p>Decisión técnica registrada: {fecha(decision.creadoEn)}</p>
      <p>Diagnóstico utilizado: {texto(original.diagnosis_id)}</p>
      <p className="whitespace-pre-wrap">Síntomas históricos: {texto(diagnostico.symptoms)}</p>
      <p className="whitespace-pre-wrap">Causa histórica: {texto(diagnostico.cause_found)}</p>
      <p className="whitespace-pre-wrap">Solución recomendada histórica: {texto(diagnostico.recommended_solution)}</p>
      {typeof diagnostico.notes === 'string' && diagnostico.notes.trim() ? <p className="whitespace-pre-wrap">Notas históricas: {diagnostico.notes}</p> : null}
      <p className="whitespace-pre-wrap">Motivo de no reparabilidad: {texto(decision.observacion || original.reason)}</p>
    </div> : <p>No se dispone del detalle de la decisión original en el historial cargado.</p>}
    {evento.tipo === 'NON_REPAIRABLE_REOPENED' ? <p className="whitespace-pre-wrap">Motivo de reevaluación: {texto(evento.observacion || m.reason)}</p> : null}
    {evento.tipo === 'RETURNED_UNREPAIRED' ? <p>Responsable de devolución: {texto(actor)}</p> : null}
  </section>
}
