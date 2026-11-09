import { Check } from 'lucide-react'

import {
  etiquetasEstadoReparacion,
  type EstadoReparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

const etapas = [
  { nombre: 'Recepción', estados: ['received'] },
  { nombre: 'Diagnóstico', estados: ['diagnosis', 'warranty'] },
  { nombre: 'Cotización', estados: ['quote_pending', 'waiting_customer_approval', 'rejected'] },
  { nombre: 'Reparación', estados: ['quote_approved', 'in_repair', 'awaiting_parts'] },
  { nombre: 'Pruebas', estados: ['testing'] },
  { nombre: 'Entrega', estados: ['ready_for_delivery', 'delivered'] },
] as const

interface FlujoReparacionProps {
  estado: EstadoReparacion
  tieneCotizacion: boolean
  tieneDiagnostico: boolean
}

function etiquetaCotizacion(estado: EstadoReparacion, omitida: boolean) {
  if (omitida) return 'No requerida'
  switch (estado) {
    case 'quote_pending': return 'En preparación'
    case 'waiting_customer_approval': return 'Esperando cliente'
    case 'rejected': return 'Rechazada'
    case 'quote_approved': return 'Aprobada'
    default: return 'Opcional'
  }
}

export function FlujoReparacion({ estado, tieneCotizacion, tieneDiagnostico }: FlujoReparacionProps) {
  if (estado === 'cancelled' || estado === 'non_repairable' || estado === 'returned_unrepaired') {
    const resultado = estado === 'cancelled'
      ? 'Orden cancelada. El historial se conserva y el flujo no continúa.'
      : estado === 'non_repairable'
        ? 'Equipo no reparable. Registra su devolución sin reparar para cerrar la atención.'
        : 'Equipo devuelto sin reparar. La orden está cerrada.'

    return <p role="status" className="border-b bg-muted/25 px-5 py-3 text-sm leading-6 text-muted-foreground sm:px-7">{resultado}</p>
  }

  const estadoVisual = estado === 'warranty' && tieneDiagnostico ? 'in_repair' : estado
  const indiceActual = estadoVisual === 'delivered'
    ? etapas.length
    : etapas.findIndex((etapa) => (etapa.estados as readonly string[]).includes(estadoVisual))
  const estadoRechazado = estadoVisual === 'rejected'

  return (
    <section aria-label="Progreso de reparación" className="border-b px-5 py-4 sm:px-7">
      <div className="overflow-x-auto pb-1">
        <ol className="flex min-w-[39rem]" aria-label="Recepción, diagnóstico, cotización si aplica, reparación, pruebas y entrega">
          {etapas.map((etapa, indice) => {
            const esActual = indice === indiceActual
            const omitida = indice === 2
              && indice < indiceActual
              && !tieneCotizacion
              && estado !== 'quote_approved'
            const completada = indice < indiceActual
            const textoEtapa = indice === 2 ? etiquetaCotizacion(estado, omitida) : null

            return (
              <li
                key={etapa.nombre}
                aria-current={esActual ? 'step' : undefined}
                className="relative flex min-w-0 flex-1 flex-col gap-2 pe-3 text-xs"
              >
                {indice < etapas.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`absolute start-7 end-0 top-3 h-px ${completada ? 'bg-primary' : 'bg-border'}`}
                  />
                ) : null}
                <span className={`relative grid size-6 place-items-center rounded-full border text-[0.68rem] font-semibold ${
                  completada
                    ? 'border-primary bg-primary text-primary-foreground'
                    : esActual
                      ? 'border-primary bg-background text-primary ring-2 ring-primary/15'
                      : 'border-border bg-background text-muted-foreground'
                }`}>
                  {completada ? <Check aria-hidden="true" className="size-3.5" /> : indice + 1}
                </span>
                <span className={esActual ? 'font-semibold text-foreground' : completada ? 'text-foreground' : 'text-muted-foreground'}>
                  {etapa.nombre}
                  {indice === 2 ? <span className="block text-[0.65rem] font-normal text-muted-foreground">{textoEtapa}</span> : null}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      {estadoRechazado ? <p className="mt-2 text-sm text-amber-800">La cotización fue rechazada; puedes preparar una revisión si corresponde.</p> : null}
      {estado === 'delivered' ? <p role="status" className="mt-2 text-sm text-primary">Proceso completado · {etiquetasEstadoReparacion[estado]}.</p> : null}
    </section>
  )
}
