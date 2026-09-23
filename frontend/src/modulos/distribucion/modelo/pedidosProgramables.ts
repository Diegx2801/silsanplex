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

/**
 * La programación actual es única por pedido y representa la salida completa
 * de sus bienes. Los despachos parciales continúan en Ventas; una futura
 * entrega parcial requerirá una programación por despacho y cantidades propias.
 */
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
