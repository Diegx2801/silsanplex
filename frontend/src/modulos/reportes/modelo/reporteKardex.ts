import type { EstadoStock } from '@/modulos/inventario/modelo/almacen'

export const TAMANIO_PAGINA_KARDEX_REPORTE = 25
export const MAXIMO_FILAS_EXPORTACION_KARDEX = 10000

export type TipoMovimientoKardex = 'entrada' | 'salida' | 'ajuste-positivo' | 'ajuste-negativo'

export interface ConsultaKardexReporte {
  pagina: number
  fechaDesde: string
  fechaHasta: string
  productoId: string
  almacenId: string
  lote: string
}

export interface MovimientoKardexReporte {
  id: string
  secuencia: number
  fechaOperacion: string
  fechaRegistro: string
  productoId: string
  productoCodigo: string
  productoDescripcion: string
  unidadMedida: string
  almacenId: string
  almacen: string
  ubicacionCodigo: string
  ubicacionNombre: string
  estado: EstadoStock
  lote: string
  fechaVencimiento: string | null
  tipo: TipoMovimientoKardex
  entrada: number
  salida: number
  saldoAnterior: number
  saldoPosterior: number
  documentoReferencia: string
  tipoOrigen: string
  motivo: string
  responsable: string
}

export interface ResultadoKardexReporte {
  elementos: MovimientoKardexReporte[]
  total: number
  pagina: number
  tamanioPagina: number
  totalPaginas: number
}
