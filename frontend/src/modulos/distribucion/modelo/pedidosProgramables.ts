import type { LineaOperacionVenta, PedidoVenta, Venta } from '@/modulos/ventas/modelo/operacionVenta'

type PedidoProgramable = Pick<PedidoVenta, 'estado' | 'modalidadCumplimiento' | 'estadoCumplimiento'> & {
  lineas: ReadonlyArray<{ id: string; tipoProducto?: 'good' | 'service'; cantidad: number }>
}
type VentaProgramable = Pick<Venta, 'estado'> & {
  lineas: ReadonlyArray<{
    pedidoLineaId?: string
    tipoProducto?: 'good' | 'service'
    cantidadDespachada?: number
    cantidadPendiente?: number
  }>
}

/** A delivery can cover a dispatched subset of the order's goods. */
export function pedidoListoParaProgramarDistribucion(
  pedido: PedidoProgramable,
  venta: VentaProgramable | undefined,
) {
  const estadoCumplimiento = pedido.estadoCumplimiento ?? 'pending'
  const bienesPedido = pedido.lineas.filter((linea) => linea.tipoProducto === 'good')
  if (!venta
    || pedido.modalidadCumplimiento !== 'delivery'
    || pedido.estado === 'cancelado'
    || ['delivered', 'cancelled'].includes(estadoCumplimiento)
    || !bienesPedido.length) return false

  return bienesPedido.every((bienPedido) => {
    const bienVenta = venta.lineas.find((linea) => linea.tipoProducto === 'good' && linea.pedidoLineaId === bienPedido.id)
    return bienVenta !== undefined
      && bienVenta.cantidadDespachada !== undefined
      && bienVenta.cantidadDespachada >= bienPedido.cantidad
      && bienVenta.cantidadPendiente === 0
  })
}

/**
 * Proyecta en el detalle del pedido el saldo logístico autoritativo de Ventas.
 * Los pedidos no duplican el contador de despachos: el saldo procede de las
 * reservas consumidas y se relaciona por la identidad de la línea de pedido.
 */
export function enriquecerLineasPedidoConSaldos(
  lineas: readonly PedidoVenta['lineas'][number][],
  venta: { lineas: ReadonlyArray<Pick<LineaOperacionVenta, 'pedidoLineaId' | 'tipoProducto' | 'cantidadDespachada' | 'cantidadPendiente'>> } | undefined,
) {
  return lineas
    .filter((linea) => linea.tipoProducto === 'good')
    .map((linea) => {
      const lineaVenta = venta?.lineas.find((item) => item.pedidoLineaId === linea.id)
      return {
        ...linea,
        cantidadDespachada: lineaVenta?.cantidadDespachada ?? 0,
        cantidadPendiente: lineaVenta?.cantidadPendiente ?? linea.cantidad,
      }
    })
}

/**
 * Returns the part of each sales-dispatched line that has not already been
 * assigned to a live delivery. Cancelled plans release their allocation;
 * delivered and in-progress plans continue to consume it.
 */
export function obtenerLineasDisponiblesDistribucion(
  lineas: readonly PedidoVenta['lineas'][number][],
  venta: { lineas: ReadonlyArray<Pick<LineaOperacionVenta, 'pedidoLineaId' | 'tipoProducto' | 'cantidadDespachada' | 'cantidadPendiente'>> } | undefined,
  entregas: ReadonlyArray<{ id?: string; estado: string; lineas: ReadonlyArray<{ id: string; cantidad: number }> }>,
  excluirEntregaId?: string,
) {
  const asignadasPorLinea = new Map<string, number>()
  for (const entrega of entregas) {
    if (entrega.estado === 'cancelado') continue
    for (const linea of entrega.lineas) {
      asignadasPorLinea.set(linea.id, (asignadasPorLinea.get(linea.id) ?? 0) + linea.cantidad)
    }
  }

  const asignadasDeEntregaExcluida = new Map<string, number>()
  if (excluirEntregaId) {
    const entrega = entregas.find((item) => item.id === excluirEntregaId)
    for (const linea of entrega?.lineas ?? []) {
      asignadasDeEntregaExcluida.set(linea.id, (asignadasDeEntregaExcluida.get(linea.id) ?? 0) + linea.cantidad)
    }
  }

  return enriquecerLineasPedidoConSaldos(lineas, venta)
    .map((linea) => {
      const cantidadDespachada = linea.cantidadDespachada ?? 0
      const asignada = asignadasPorLinea.get(linea.id) ?? 0
      const asignadaSinEntregaExcluida = Math.max(0, asignada - (asignadasDeEntregaExcluida.get(linea.id) ?? 0))
      const despachada = Math.max(0, cantidadDespachada)
      return {
        ...linea,
        cantidadDisponibleDistribucion: Math.max(0, despachada - asignada),
        cantidadMaximaPlanificacion: Math.max(0, despachada - asignadaSinEntregaExcluida),
      }
    })
    .filter((linea) => linea.cantidadDisponibleDistribucion > 0 || (excluirEntregaId && linea.cantidadMaximaPlanificacion > 0))
}
