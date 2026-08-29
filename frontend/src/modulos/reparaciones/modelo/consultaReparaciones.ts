import type { EstadoReparacion, PrioridadReparacion, Reparacion } from './reparacion'

export type FiltroEstadoReparacion = 'todos' | EstadoReparacion
export type FiltroPrioridadReparacion = 'todas' | PrioridadReparacion

export interface ConsultaReparaciones {
  busqueda: string
  estado: FiltroEstadoReparacion
  prioridad: FiltroPrioridadReparacion
}

export interface ConsultaReparacionesPaginada extends ConsultaReparaciones {
  pagina: number
  tamanioPagina: number
}

export interface ResultadoReparacionesPaginado {
  elementos: Reparacion[]
  totalFiltrado: number
}
