import { z } from 'zod'

import {
  esquemaCotizacion,
  type Cotizacion,
} from '@/modulos/ventas/modelo/cotizacion'

const CLAVE_COTIZACIONES = 'silsanplex.cotizaciones-temporales.v1'
const esquemaCotizaciones = z.array(esquemaCotizacion)

export interface RepositorioCotizaciones {
  listar: () => Cotizacion[]
  guardar: (cotizaciones: readonly Cotizacion[]) => void
}

export function crearRepositorioCotizacionesSesion(
  almacenamiento: Pick<Storage, 'getItem' | 'setItem'>,
): RepositorioCotizaciones {
  return {
    listar() {
      try {
        const valor = almacenamiento.getItem(CLAVE_COTIZACIONES)
        if (!valor) return []

        const resultado = esquemaCotizaciones.safeParse(JSON.parse(valor))
        return resultado.success ? resultado.data : []
      } catch {
        return []
      }
    },
    guardar(cotizaciones) {
      almacenamiento.setItem(
        CLAVE_COTIZACIONES,
        JSON.stringify(cotizaciones),
      )
    },
  }
}
