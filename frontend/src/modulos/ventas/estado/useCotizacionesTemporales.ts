import { useRef, useState } from 'react'

import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import type { Producto } from '@/modulos/productos/modelo/producto'
import {
  crearCotizacion,
  validarCotizacion,
  type Cotizacion,
  type DatosCotizacion,
} from '@/modulos/ventas/modelo/cotizacion'
import { crearRepositorioCotizacionesSesion } from '@/modulos/ventas/servicios/repositorioCotizacionesSesion'

function siguienteNumero(cotizaciones: readonly Cotizacion[]) {
  let mayor = 0
  for (const cotizacion of cotizaciones) {
    const correlativo = Number(cotizacion.numero.slice(4))
    if (Number.isFinite(correlativo) && correlativo > mayor) mayor = correlativo
  }
  return `COT-${String(mayor + 1).padStart(6, '0')}`
}

export function useCotizacionesTemporales(
  clientes: readonly Cliente[],
  productos: readonly Producto[],
) {
  const repositorio = useRef(
    crearRepositorioCotizacionesSesion(window.sessionStorage),
  )
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>(() =>
    repositorio.current.listar(),
  )

  const persistir = (siguientes: Cotizacion[]) => {
    repositorio.current.guardar(siguientes)
    setCotizaciones(siguientes)
  }

  const guardarCotizacion = (
    datos: DatosCotizacion,
    cotizacionId?: string,
  ) => {
    const cliente = clientes.find(
      (item) => item.id === datos.clienteId && item.activo,
    )
    if (!cliente) return 'El cliente seleccionado ya no está disponible'

    const error = validarCotizacion(datos, productos)
    if (error) return error

    const existente = cotizaciones.find((item) => item.id === cotizacionId)
    if (existente && existente.estado !== 'borrador') {
      return 'Solo se pueden editar cotizaciones en borrador'
    }

    const cotizacionCreada = crearCotizacion(
      datos,
      cliente,
      productos,
      existente?.numero ?? siguienteNumero(cotizaciones),
      existente ? new Date(existente.fechaRegistro) : new Date(),
      existente?.id,
    )
    const cotizacion = existente
      ? { ...cotizacionCreada, fechaRegistro: existente.fechaRegistro }
      : cotizacionCreada
    const siguientes = existente
      ? cotizaciones.map((item) =>
          item.id === existente.id ? cotizacion : item,
        )
      : [...cotizaciones, cotizacion]

    persistir(siguientes)
    return undefined
  }

  const emitirCotizacion = (cotizacionId: string) => {
    const cotizacion = cotizaciones.find((item) => item.id === cotizacionId)
    if (!cotizacion || cotizacion.estado !== 'borrador') {
      return 'La cotización ya no está disponible para emisión'
    }

    persistir(
      cotizaciones.map((item) =>
        item.id === cotizacion.id
          ? {
              ...item,
              estado: 'emitida' as const,
              fechaCambioEstado: new Date().toISOString(),
            }
          : item,
      ),
    )
    return undefined
  }

  const aceptarCotizacion = (cotizacionId: string) => {
    const cotizacion = cotizaciones.find((item) => item.id === cotizacionId)
    if (!cotizacion || cotizacion.estado !== 'emitida') {
      return 'La cotización ya no está disponible para crear un pedido'
    }

    persistir(
      cotizaciones.map((item) =>
        item.id === cotizacion.id
          ? {
              ...item,
              estado: 'aceptada' as const,
              fechaCambioEstado: new Date().toISOString(),
            }
          : item,
      ),
    )
    return undefined
  }

  return {
    cotizaciones,
    guardarCotizacion,
    emitirCotizacion,
    aceptarCotizacion,
  }
}
