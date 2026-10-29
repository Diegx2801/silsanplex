import { RotateCcw, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type {
  ConsultaReparaciones,
  FiltroEstadoReparacion,
  FiltroPrioridadReparacion,
} from '@/modulos/reparaciones/modelo/consultaReparaciones'
import {
  etiquetasEstadoReparacion,
  estadosReparacion,
  prioridadesReparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

interface FiltrosReparacionesProps {
  consulta: ConsultaReparaciones
  cantidadActivos: number
  alCambiarBusqueda: (valor: string) => void
  alCambiarEstado: (valor: FiltroEstadoReparacion) => void
  alCambiarPrioridad: (valor: FiltroPrioridadReparacion) => void
  alLimpiar: () => void
}

export function FiltrosReparaciones({
  consulta,
  cantidadActivos,
  alCambiarBusqueda,
  alCambiarEstado,
  alCambiarPrioridad,
  alLimpiar,
}: FiltrosReparacionesProps) {
  return (
    <section aria-label="Filtros de reparaciones" className="ledger-sheet">
      <div className="grid gap-4 px-5 py-4 sm:px-6 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
        <div>
          <label htmlFor="buscar-reparaciones" className="field-label">
            Buscar reparación
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="buscar-reparaciones"
              type="search"
              value={consulta.busqueda}
              onChange={(evento) => alCambiarBusqueda(evento.target.value)}
              className="field-control ps-9"
              placeholder="Código, cliente, equipo o referencia"
            />
          </div>
        </div>
        <div>
          <label htmlFor="estado-reparaciones" className="field-label">
            Estado
          </label>
          <select
            id="estado-reparaciones"
            className="field-control"
            value={consulta.estado}
            onChange={(evento) =>
              alCambiarEstado(evento.target.value as FiltroEstadoReparacion)
            }
          >
            <option value="todos">Todos los estados</option>
            {estadosReparacion.map((estado) => (
              <option key={estado} value={estado}>
                {etiquetasEstadoReparacion[estado]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="prioridad-reparaciones" className="field-label">
            Prioridad
          </label>
          <select
            id="prioridad-reparaciones"
            className="field-control"
            value={consulta.prioridad}
            onChange={(evento) =>
              alCambiarPrioridad(evento.target.value as FiltroPrioridadReparacion)
            }
          >
            <option value="todas">Todas</option>
            {prioridadesReparacion.map((prioridad) => (
              <option key={prioridad.valor} value={prioridad.valor}>
                {prioridad.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end justify-end self-end">
          <Button type="button" variant="outline" disabled={!cantidadActivos} onClick={alLimpiar}>
            <RotateCcw aria-hidden="true" />Limpiar filtros
          </Button>
        </div>
      </div>
    </section>
  )
}
