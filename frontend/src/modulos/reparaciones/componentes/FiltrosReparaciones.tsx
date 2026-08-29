import { Search, X } from 'lucide-react'

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
      <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[minmax(16rem,1fr)_15rem_13rem_auto] lg:items-end">
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
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <span className="font-mono text-xs text-muted-foreground">
            {cantidadActivos} {cantidadActivos === 1 ? 'filtro' : 'filtros'}
          </span>
          {cantidadActivos ? (
            <Button type="button" variant="ghost" onClick={alLimpiar}>
              <X aria-hidden="true" />
              Limpiar
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
