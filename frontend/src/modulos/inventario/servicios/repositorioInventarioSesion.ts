import { z } from 'zod'

import {
  esquemaMovimientoInventario,
  type MovimientoInventario,
} from '@/modulos/inventario/modelo/inventario'

const CLAVE_INVENTARIO = 'silsanplex.inventario-temporal.v1'
const esquemaMovimientos = z.array(esquemaMovimientoInventario)

export interface RepositorioInventario {
  listar: () => MovimientoInventario[]
  guardar: (movimientos: readonly MovimientoInventario[]) => void
}

export function crearRepositorioInventarioSesion(
  almacenamiento: Pick<Storage, 'getItem' | 'setItem'>,
): RepositorioInventario {
  return {
    listar() {
      try {
        const valor = almacenamiento.getItem(CLAVE_INVENTARIO)
        if (!valor) return []

        const resultado = esquemaMovimientos.safeParse(JSON.parse(valor))
        return resultado.success ? resultado.data : []
      } catch {
        return []
      }
    },
    guardar(movimientos) {
      almacenamiento.setItem(CLAVE_INVENTARIO, JSON.stringify(movimientos))
    },
  }
}
