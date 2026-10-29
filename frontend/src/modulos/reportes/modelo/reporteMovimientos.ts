import type { EstadoStock } from '@/modulos/inventario/modelo/almacen'

export const TAMANIO_PAGINA_REPORTE = 25

export interface ConsultaResumenMovimientos {
  pagina: number
  fechaDesde: string
  fechaHasta: string
  busqueda: string
  almacenId: string
}

export interface ResumenMovimientoInventario {
  productoId: string
  productoCodigo: string
  productoDescripcion: string
  unidadMedida: string
  almacenId: string | null
  almacen: string
  estado: EstadoStock
  entradas: number
  salidas: number
  variacionNeta: number
  cantidadMovimientos: number
}

export interface ResultadoResumenMovimientos {
  elementos: ResumenMovimientoInventario[]
  total: number
  totalMovimientos: number
  pagina: number
  tamanioPagina: number
  totalPaginas: number
}

function fechaLocal(fecha: Date) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

export function crearPeriodoUltimos30Dias(hoy = new Date()) {
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const desde = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() - 29)

  return { fechaDesde: fechaLocal(desde), fechaHasta: fechaLocal(hasta) }
}
