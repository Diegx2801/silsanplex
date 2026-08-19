import { z } from 'zod'

import {
  esquemaPedidoVenta,
  esquemaVenta,
  type PedidoVenta,
  type Venta,
} from '@/modulos/ventas/modelo/operacionVenta'

const CLAVE_OPERACIONES = 'silsanplex.operaciones-venta-temporales.v1'

const esquemaDatos = z.object({
  pedidos: z.array(esquemaPedidoVenta),
  ventas: z.array(esquemaVenta),
})

export interface DatosOperacionesVenta {
  pedidos: PedidoVenta[]
  ventas: Venta[]
}

export function crearRepositorioOperacionesVentaSesion(
  almacenamiento: Pick<Storage, 'getItem' | 'setItem'>,
) {
  return {
    listar(): DatosOperacionesVenta {
      try {
        const valor = almacenamiento.getItem(CLAVE_OPERACIONES)
        if (!valor) return { pedidos: [], ventas: [] }
        const resultado = esquemaDatos.safeParse(JSON.parse(valor))
        return resultado.success ? resultado.data : { pedidos: [], ventas: [] }
      } catch {
        return { pedidos: [], ventas: [] }
      }
    },
    guardar(datos: DatosOperacionesVenta) {
      almacenamiento.setItem(CLAVE_OPERACIONES, JSON.stringify(datos))
    },
  }
}
