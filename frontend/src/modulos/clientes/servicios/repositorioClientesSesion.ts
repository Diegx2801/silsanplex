import { z } from 'zod'

import {
  esquemaCliente,
  type Cliente,
} from '@/modulos/clientes/modelo/cliente'

const CLAVE_CLIENTES = 'silsanplex.clientes-temporales.v1'
const esquemaClientes = z.array(esquemaCliente)

export interface RepositorioClientes {
  listar: () => Cliente[]
  guardar: (clientes: readonly Cliente[]) => void
}

export function crearRepositorioClientesSesion(
  almacenamiento: Pick<Storage, 'getItem' | 'setItem'>,
): RepositorioClientes {
  return {
    listar() {
      try {
        const valor = almacenamiento.getItem(CLAVE_CLIENTES)
        if (!valor) return []

        const resultado = esquemaClientes.safeParse(JSON.parse(valor))
        return resultado.success ? resultado.data : []
      } catch {
        return []
      }
    },
    guardar(clientes) {
      almacenamiento.setItem(CLAVE_CLIENTES, JSON.stringify(clientes))
    },
  }
}
