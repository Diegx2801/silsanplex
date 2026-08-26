import { z } from 'zod'

import {
  esquemaProgramacionEntrega,
  type ProgramacionEntrega,
} from '@/modulos/distribucion/modelo/programacionEntrega'

const CLAVE = 'silsanplex.programaciones-entrega-temporales.v1'

export function crearRepositorioProgramacionesEntregaSesion(
  almacenamiento: Pick<Storage, 'getItem' | 'setItem'>,
) {
  return {
    listar(): ProgramacionEntrega[] {
      try {
        const valor = almacenamiento.getItem(CLAVE)
        if (!valor) return []
        const resultado = z.array(esquemaProgramacionEntrega).safeParse(JSON.parse(valor))
        return resultado.success ? resultado.data : []
      } catch {
        return []
      }
    },
    guardar(programaciones: readonly ProgramacionEntrega[]) {
      almacenamiento.setItem(CLAVE, JSON.stringify(programaciones))
    },
  }
}