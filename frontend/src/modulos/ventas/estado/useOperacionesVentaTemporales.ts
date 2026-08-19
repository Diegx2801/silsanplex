import { useRef, useState } from 'react'

import { crearRepositorioInventarioSesion } from '@/modulos/inventario/servicios/repositorioInventarioSesion'
import type { Producto } from '@/modulos/productos/modelo/producto'
import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'
import {
  crearPedidoDesdeCotizacion,
  crearVentaDesdePedido,
  prepararDespachoVenta,
  type DatosDespacho,
  type DatosVenta,
  type PedidoVenta,
  type Venta,
} from '@/modulos/ventas/modelo/operacionVenta'
import {
  crearRepositorioOperacionesVentaSesion,
  type DatosOperacionesVenta,
} from '@/modulos/ventas/servicios/repositorioOperacionesVentaSesion'

function siguienteNumero(prefijo: 'PED' | 'VEN', elementos: readonly { numero: string }[]) {
  let mayor = 0
  for (const elemento of elementos) {
    const correlativo = Number(elemento.numero.slice(4))
    if (Number.isFinite(correlativo) && correlativo > mayor) mayor = correlativo
  }
  return `${prefijo}-${String(mayor + 1).padStart(6, '0')}`
}

interface UseOperacionesVentaProps {
  cotizaciones: readonly Cotizacion[]
  productos: readonly Producto[]
  aceptarCotizacion: (cotizacionId: string) => string | undefined
}

export function useOperacionesVentaTemporales({
  cotizaciones,
  productos,
  aceptarCotizacion,
}: UseOperacionesVentaProps) {
  const repositorio = useRef(crearRepositorioOperacionesVentaSesion(window.sessionStorage))
  const repositorioInventario = useRef(crearRepositorioInventarioSesion(window.sessionStorage))
  const [datos, setDatos] = useState<DatosOperacionesVenta>(() => repositorio.current.listar())

  const persistir = (siguientes: DatosOperacionesVenta) => {
    repositorio.current.guardar(siguientes)
    setDatos(siguientes)
  }

  const crearPedido = (cotizacionId: string) => {
    const cotizacion = cotizaciones.find((item) => item.id === cotizacionId)
    if (!cotizacion || cotizacion.estado !== 'emitida') {
      return 'La cotización debe estar emitida para crear el pedido'
    }
    if (cotizacion.fechaValidez < new Date().toISOString().slice(0, 10)) {
      return 'La cotización está vencida; emite una nueva propuesta antes de crear el pedido'
    }
    if (datos.pedidos.some((pedido) => pedido.cotizacionId === cotizacionId)) {
      return 'Esta cotización ya tiene un pedido'
    }

    const pedido = crearPedidoDesdeCotizacion(
      cotizacion,
      siguienteNumero('PED', datos.pedidos.map((item) => ({ numero: item.numero }))),
    )
    const anteriores = datos
    const siguientes = { ...datos, pedidos: [...datos.pedidos, pedido] }

    try {
      persistir(siguientes)
      const error = aceptarCotizacion(cotizacionId)
      if (error) throw new Error(error)
    } catch (error) {
      try {
        persistir(anteriores)
      } catch {
        // sessionStorage no ofrece transacciones reales.
      }
      return error instanceof Error ? error.message : 'No se pudo crear el pedido'
    }
    return undefined
  }

  const registrarVenta = (pedidoId: string, datosVenta: DatosVenta) => {
    const pedido = datos.pedidos.find((item) => item.id === pedidoId)
    if (!pedido || pedido.estado !== 'confirmado') return 'El pedido ya no está disponible'
    if (datos.ventas.some((venta) => venta.pedidoId === pedidoId)) return 'El pedido ya tiene una venta registrada'

    const documentoDuplicado = datos.ventas.some(
      (venta) =>
        venta.tipoDocumento === datosVenta.tipoDocumento &&
        venta.serie.toLocaleLowerCase('es-PE') === datosVenta.serie.trim().toLocaleLowerCase('es-PE') &&
        venta.numeroDocumento === datosVenta.numeroDocumento.trim(),
    )
    if (documentoDuplicado) return 'Ya existe una venta con el mismo tipo, serie y número'

    const venta = crearVentaDesdePedido(
      pedido,
      datosVenta,
      siguienteNumero(
        'VEN',
        datos.ventas.map((item) => ({ numero: item.numeroInterno })),
      ),
    )
    try {
      persistir({ ...datos, ventas: [...datos.ventas, venta] })
    } catch {
      return 'No se pudo registrar la venta en esta sesión'
    }
    return undefined
  }

  const despacharVenta = (ventaId: string, despacho: DatosDespacho) => {
    const venta = datos.ventas.find((item) => item.id === ventaId)
    if (!venta || venta.estado !== 'registrada') return 'La venta ya no está disponible para despacho'

    const inventarioAnterior = repositorioInventario.current.listar()
    const resultado = prepararDespachoVenta(venta, despacho, productos, inventarioAnterior)
    if ('error' in resultado) return resultado.error
    const { venta: ventaDespachada, movimientos } = resultado

    const ahora = new Date().toISOString()
    const siguientes: DatosOperacionesVenta = {
      pedidos: datos.pedidos.map((pedido): PedidoVenta =>
        pedido.id === venta.pedidoId
          ? { ...pedido, estado: 'atendido', fechaAtencion: ahora }
          : pedido,
      ),
      ventas: datos.ventas.map((item): Venta =>
        item.id === venta.id ? ventaDespachada : item,
      ),
    }

    try {
      repositorioInventario.current.guardar([...inventarioAnterior, ...movimientos])
      persistir(siguientes)
    } catch {
      try {
        repositorioInventario.current.guardar(inventarioAnterior)
      } catch {
        // sessionStorage no ofrece transacciones reales.
      }
      return 'No se pudo completar el despacho en esta sesión'
    }
    return undefined
  }

  return {
    pedidos: datos.pedidos,
    ventas: datos.ventas,
    crearPedido,
    registrarVenta,
    despacharVenta,
  }
}
