import { z } from 'zod'

import {
  esquemaCompra,
  esquemaProveedor,
  type Compra,
  type Proveedor,
} from '@/modulos/compras/modelo/compras'

const CLAVE_COMPRAS = 'silsanplex.compras-temporales.v1'

export interface DatosComprasSesion {
  proveedores: Proveedor[]
  compras: Compra[]
}

const esquemaDatosComprasSesion = z.object({
  proveedores: z.array(esquemaProveedor),
  compras: z.array(esquemaCompra),
})

export interface RepositorioCompras {
  leer: () => DatosComprasSesion
  guardar: (datos: DatosComprasSesion) => void
}

export function crearRepositorioComprasSesion(
  almacenamiento: Pick<Storage, 'getItem' | 'setItem'>,
): RepositorioCompras {
  return {
    leer() {
      try {
        const valor = almacenamiento.getItem(CLAVE_COMPRAS)
        if (!valor) return { proveedores: [], compras: [] }

        const resultado = esquemaDatosComprasSesion.safeParse(JSON.parse(valor))
        return resultado.success
          ? resultado.data
          : { proveedores: [], compras: [] }
      } catch {
        return { proveedores: [], compras: [] }
      }
    },
    guardar(datos) {
      almacenamiento.setItem(CLAVE_COMPRAS, JSON.stringify(datos))
    },
  }
}
