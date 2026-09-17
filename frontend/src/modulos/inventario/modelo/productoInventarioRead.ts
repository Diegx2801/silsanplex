export interface ProductoInventarioOpcion {
  id: string
  codigo: string
  descripcion: string
  codigoBarras: string
  unidadMedida: string
  controlLote: boolean
  controlVencimiento: boolean
}

export interface RespuestaReadInventario<T> {
  items: T[]
  totalCount: number
}
