import type { SaldoInventario } from './almacen'
import type { ProductoInventarioOpcion } from './productoInventarioRead'

export type PosicionInventarioSeleccionada = Pick<
  SaldoInventario,
  'almacenId' | 'ubicacionId' | 'estado' | 'lote' | 'fechaVencimiento'
>

export interface ContextoAccionInventario {
  producto: ProductoInventarioOpcion
  posicion?: PosicionInventarioSeleccionada
}
