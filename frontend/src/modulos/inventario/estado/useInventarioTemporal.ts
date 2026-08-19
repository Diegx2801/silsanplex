import { useRef, useState } from 'react'

import {
  crearMovimientoInventario,
  validarMovimientoInventario,
  type DatosMovimientoInventario,
  type MovimientoInventario,
} from '@/modulos/inventario/modelo/inventario'
import { crearRepositorioInventarioSesion } from '@/modulos/inventario/servicios/repositorioInventarioSesion'
import type { Producto } from '@/modulos/productos/modelo/producto'

export function useInventarioTemporal(productos: readonly Producto[]) {
  const repositorio = useRef(
    crearRepositorioInventarioSesion(window.sessionStorage),
  )
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>(() =>
    repositorio.current.listar(),
  )

  const registrarMovimiento = (datos: DatosMovimientoInventario) => {
    const producto = productos.find((item) => item.id === datos.productoId)
    if (!producto) return 'El producto seleccionado ya no está disponible'

    const error = validarMovimientoInventario(datos, producto, movimientos)
    if (error) return error

    const siguientes = [
      ...movimientos,
      crearMovimientoInventario(datos, producto),
    ]
    setMovimientos(siguientes)
    repositorio.current.guardar(siguientes)

    return undefined
  }

  return { movimientos, registrarMovimiento }
}
