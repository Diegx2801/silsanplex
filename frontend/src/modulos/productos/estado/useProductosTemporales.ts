import { useState } from 'react'
import { z } from 'zod'

import {
  esquemaProducto,
  type DatosProducto,
  type Producto,
} from '@/modulos/productos/modelo/producto'

const CLAVE_SESION = 'silsanplex.productos-temporales.v1'
const esquemaProductosGuardados = z.array(
  esquemaProducto.extend({ id: z.string().min(1) }),
)

function leerProductos(): Producto[] {
  try {
    const valorGuardado = window.sessionStorage.getItem(CLAVE_SESION)

    if (!valorGuardado) return []

    const resultado = esquemaProductosGuardados.safeParse(
      JSON.parse(valorGuardado),
    )

    return resultado.success ? resultado.data : []
  } catch {
    return []
  }
}

function persistirProductos(productos: Producto[]) {
  window.sessionStorage.setItem(CLAVE_SESION, JSON.stringify(productos))
}

export function useProductosTemporales() {
  const [productos, setProductos] = useState<Producto[]>(leerProductos)

  const guardarProducto = (datos: DatosProducto, productoId?: string) => {
    const codigoNormalizado = datos.codigo.toLocaleLowerCase('es-PE')
    const codigoRepetido = productos.some(
      (producto) =>
        producto.id !== productoId &&
        producto.codigo.toLocaleLowerCase('es-PE') === codigoNormalizado,
    )

    if (codigoRepetido) return 'Ya existe un producto con este código'

    const siguientesProductos = productoId
      ? productos.map((producto) =>
          producto.id === productoId ? { ...datos, id: producto.id } : producto,
        )
      : [...productos, { ...datos, id: crypto.randomUUID() }]

    setProductos(siguientesProductos)
    persistirProductos(siguientesProductos)

    return undefined
  }

  const cambiarEstado = (productoId: string) => {
    const siguientesProductos = productos.map((producto) =>
      producto.id === productoId
        ? { ...producto, activo: !producto.activo }
        : producto,
    )

    setProductos(siguientesProductos)
    persistirProductos(siguientesProductos)
  }

  return { productos, guardarProducto, cambiarEstado }
}
