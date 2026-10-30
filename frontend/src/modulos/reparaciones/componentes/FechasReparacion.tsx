import type { Reparacion } from '../modelo/reparacion'
import { fechaTecnica } from '../modelo/finalizacionTecnica'

export function FechasReparacion({ reparacion: r, requiereNuevaValidacion = false }: { reparacion: Reparacion; requiereNuevaValidacion?: boolean }) {
  const noReparable = ['non_repairable', 'returned_unrepaired'].includes(r.estado)
  const actual = noReparable ? null : r.finalizacionTecnica
  const primera = r.primeraFinalizacionTecnica
  return <section aria-label="Finalización técnica y entrega" className="mt-4 border-t pt-4 text-sm">
    <dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Finalización técnica vigente</dt><dd className="mt-1">{noReparable
        ? 'No aplica como reparación completada.' : actual ? <time dateTime={actual.completed_at}>{fechaTecnica(actual.completed_at)}</time>
          : (primera || requiereNuevaValidacion) && !['delivered', 'cancelled', 'rejected'].includes(r.estado)
            ? 'Sin finalización vigente — requiere nueva validación técnica.' : 'No registrada'}</dd></div>
      <div><dt className="text-muted-foreground">Entrega real al cliente</dt><dd className="mt-1">{r.entregadaEn
        ? <time dateTime={r.entregadaEn}>{fechaTecnica(r.entregadaEn)}</time> : noReparable ? 'No aplica; devolución sin reparar independiente.' : 'Pendiente de entrega'}</dd></div>
      {actual ? <><div><dt className="text-muted-foreground">Confirmada por</dt><dd>{actual.actor_name || actual.actor_user_id || 'No registrado'}</dd></div>
        <div><dt className="text-muted-foreground">Técnico al finalizar · ciclo {actual.test_cycle_number}</dt><dd>{actual.assigned_technician_name || actual.assigned_technician_id || 'No registrado'}</dd></div></> : null}
    </dl>
  </section>
}
