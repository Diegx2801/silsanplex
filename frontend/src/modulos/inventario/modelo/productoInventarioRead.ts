export interface ProductoInventarioOpcion {
  id: string
  codigo: string
  descripcion: string
  codigoBarras: string
  unidadMedida: string
  unidadBaseId?: string
  unidadesEntrada?: UnidadInventarioDisponible[]
  controlLote: boolean
  controlVencimiento: boolean
}

export interface UnidadInventarioDisponible {
  id: string
  nombre: string
  factorConversion: number
}

export interface RespuestaReadInventario<T> {
  items: T[]
  totalCount: number
}
