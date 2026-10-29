import type { EventoReparacion } from '../modelo/reparacion'

const objeto = (valor: unknown): Record<string, unknown> => valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : {}
export function DetalleEventoAccesorio({ evento }: { evento: EventoReparacion }) {
  if (!evento.tipo.startsWith('ACCESSORY_')) return null
  const m = evento.metadata
  const anterior = objeto(m.old_values), nuevo = objeto(m.new_values)
  const pendientes = Array.isArray(m.pending_accessories) ? m.pending_accessories.map(objeto) : []
  return <div className="mt-2 space-y-1 text-sm text-muted-foreground">
    <p>Responsable: {String(m.actor_name ?? evento.actorId ?? 'Sin actor registrado')}</p>
    {typeof m.name === 'string' ? <p>Accesorio: {m.name}</p> : null}
    {evento.tipo === 'ACCESSORY_RECEIVED' ? <p>Recibido: {String(nuevo.quantity_received ?? '')}</p> : null}
    {evento.tipo === 'ACCESSORY_UPDATED' ? <p>Antes: {String(anterior.name)} × {String(anterior.quantity_received)} · {String(anterior.received_condition ?? 'Sin condición')} · {String(anterior.observations ?? '')}<br />Después: {String(nuevo.name)} × {String(nuevo.quantity_received)} · {String(nuevo.received_condition ?? 'Sin condición')} · {String(nuevo.observations ?? '')}</p> : null}
    {evento.tipo === 'ACCESSORY_RETURNED' ? <p>Devuelto: {String(m.quantity)} · Pendiente tras la operación: {String(m.quantity_pending)}</p> : null}
    {pendientes.length ? <ul aria-label="Accesorios pendientes en la excepción" className="list-disc ps-5">{pendientes.map(p => <li key={String(p.accessory_id)}>{String(p.name)} · Recibido: {String(p.quantity_received)} · Devuelto: {String(p.quantity_returned)} · Pendiente: {String(p.quantity_pending)}</li>)}</ul> : null}
  </div>
}
