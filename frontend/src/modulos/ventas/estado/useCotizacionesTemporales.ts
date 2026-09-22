import { useRef, useState } from 'react'

import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import type { Producto } from '@/modulos/productos/modelo/producto'
import {
  crearClienteSnapshotCotizacion,
  crearProductoSnapshotCotizacion,
  crearCotizacion,
  validarCotizacion,
  type Cotizacion,
  type DatosCotizacion,
  type EntidadesSeleccionadasCotizacion,
} from '@/modulos/ventas/modelo/cotizacion'
import { crearRepositorioCotizacionesSesion } from '@/modulos/ventas/servicios/repositorioCotizacionesSesion'

function combinarPorId<T extends { id: string }>(base: readonly T[], seleccionadas: readonly T[]) {
  const entidades = new Map(base.map((entidad) => [entidad.id, entidad]))
  seleccionadas.forEach((entidad) => entidades.set(entidad.id, entidad))
  return [...entidades.values()]
}

function productosDesdeCotizacion(cotizacion: Cotizacion): Producto[] {
  return cotizacion.lineas.map(crearProductoSnapshotCotizacion)
}

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
    entidadesSeleccionadas?: EntidadesSeleccionadasCotizacion,
  ) => {
    const existente = cotizaciones.find((item) => item.id === cotizacionId)
    const clientesDisponibles = combinarPorId(
      clientes,
      [
        ...(existente ? [crearClienteSnapshotCotizacion(existente)] : []),
        ...(entidadesSeleccionadas?.cliente ? [entidadesSeleccionadas.cliente] : []),
      ],
    )
    const productosDisponibles = combinarPorId(
      productos,
      [
        ...(existente ? productosDesdeCotizacion(existente) : []),
        ...(entidadesSeleccionadas?.productos ?? []),
      ],
    )
    const cliente = clientesDisponibles.find(
      (item) => item.id === datos.clienteId && item.activo,
    )
    if (!cliente) return 'El cliente seleccionado ya no está disponible'

    const error = validarCotizacion(datos, productosDisponibles)
    if (error) return error

    if (existente && existente.estado !== 'borrador') {
      return 'Solo se pueden editar cotizaciones en borrador'
    }

    const cotizacionCreada = crearCotizacion(
      datos,
      cliente,
      productosDisponibles,
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
