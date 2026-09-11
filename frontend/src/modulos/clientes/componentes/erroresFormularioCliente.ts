import type { FieldErrors } from 'react-hook-form'
import type { DatosCliente } from '@/modulos/clientes/modelo/cliente'

export interface ErrorFormularioCliente {
  path: string
  message: string
}

const clavesInternas = new Set(['message', 'type', 'ref', 'types'])

function recorrerErrores(valor: unknown, ruta: string, resultado: ErrorFormularioCliente[]) {
  if (!valor || typeof valor !== 'object') return

  if ('message' in valor && typeof valor.message === 'string' && valor.message) {
    resultado.push({ path: ruta, message: valor.message })
  }

  if (Array.isArray(valor)) {
    valor.forEach((item, indice) => recorrerErrores(item, ruta ? `${ruta}.${indice}` : String(indice), resultado))
    return
  }

  Object.entries(valor).forEach(([clave, hijo]) => {
    if (clavesInternas.has(clave)) return
    recorrerErrores(hijo, ruta ? `${ruta}.${clave}` : clave, resultado)
  })
}

export function resumirErroresCliente(errors: FieldErrors<DatosCliente>) {
  const resultado: ErrorFormularioCliente[] = []
  recorrerErrores(errors, '', resultado)
  return resultado
}
