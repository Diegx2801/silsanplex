import type { PedidoVenta, Venta } from './operacionVenta'

export type EstadoOperacionVenta =
  | 'todos'
  | 'pedido-confirmado'
  | 'por-despachar'
  | 'despacho-parcial'
  | 'servicios-pendientes'
  | 'por-entregar'
  | 'entrega-parcial'
  | 'completado'
  | 'cancelado'

export const etiquetasEstadoOperacionVenta: Record<EstadoOperacionVenta, string> = {
  todos: 'Todos',
  'pedido-confirmado': 'Pedidos confirmados',
  'por-despachar': 'Por despachar',
  'despacho-parcial': 'Despacho parcial',
  'servicios-pendientes': 'Servicios pendientes',
  'por-entregar': 'Pendientes de entrega',
  'entrega-parcial': 'Entrega parcial',
  completado: 'Completados',
  cancelado: 'Cancelados',
}

function lineasBienes(venta?: Venta) {
  return venta?.lineas.filter((linea) => linea.tipoProducto === 'good') ?? []
}

function cantidadPendiente(linea: Venta['lineas'][number]) {
  return linea.cantidadPendiente ?? linea.cantidad
}

function bienesTotalmenteDespachados(venta?: Venta) {
  const bienes = lineasBienes(venta)
  return bienes.length > 0 && bienes.every((linea) => cantidadPendiente(linea) <= 0)
}

function hayDespachoParcial(venta?: Venta) {
  return lineasBienes(venta).some((linea) => {
    const pendiente = cantidadPendiente(linea)
    return pendiente > 0 && pendiente < linea.cantidad
  })
}

function hayServiciosPendientes(venta?: Venta) {
  return (venta?.lineas ?? []).some((linea) => (
    linea.tipoProducto === 'service' && cantidadPendiente(linea) > 0
  ))
}

export function estadoOperacionVenta(pedido: PedidoVenta, venta?: Venta): EstadoOperacionVenta {
  if (pedido.estado === 'cancelado' || pedido.estadoCumplimiento === 'cancelled') return 'cancelado'
  if (!venta) return 'pedido-confirmado'

  if (pedido.estadoCumplimiento === 'delivered') return 'completado'
  if (pedido.estadoCumplimiento === 'partially_fulfilled') return 'entrega-parcial'

  const modalidad = pedido.modalidadCumplimiento ?? 'delivery'
  const bienes = lineasBienes(venta)
  if (pedido.estadoCumplimiento === 'preparing' || pedido.estadoCumplimiento === 'dispatched') {
    return modalidad === 'delivery' ? 'por-entregar' : 'completado'
  }
  if (venta.estado === 'despachada') {
    if (modalidad === 'pickup' || bienes.length === 0) return 'completado'
    return 'por-entregar'
  }
  if (modalidad === 'delivery' && bienesTotalmenteDespachados(venta)) return 'por-entregar'
  if (hayDespachoParcial(venta)) return 'despacho-parcial'
  if (!hayBienesPendientesDeDespacho(venta) && hayServiciosPendientes(venta)) return 'servicios-pendientes'
  return 'por-despachar'
}

export function etiquetaEstadoLogisticoPedido(pedido: PedidoVenta, venta?: Venta) {
  const modalidad = pedido.modalidadCumplimiento ?? 'delivery'

  if (pedido.estado === 'cancelado' || pedido.estadoCumplimiento === 'cancelled') return 'Cancelado'
  if (pedido.estadoCumplimiento === 'delivered') {
    return modalidad === 'pickup' ? 'Recojo completado' : 'Entrega completada'
  }
  if (pedido.estadoCumplimiento === 'partially_fulfilled') {
    return modalidad === 'pickup' ? 'Recojo parcial' : 'Entrega parcial'
  }
  if (pedido.estadoCumplimiento === 'preparing') return 'Preparando entrega'
  if (pedido.estadoCumplimiento === 'dispatched') {
    return modalidad === 'pickup' ? 'Listo para recojo' : 'Despachado · pendiente de entrega'
  }
  if (pedido.estadoCumplimiento === 'out_of_stock') return 'Pendiente de stock'

  if (venta?.estado === 'despachada') {
    if (modalidad === 'pickup') return 'Recojo completado'
    if (lineasBienes(venta).length === 0) return 'Servicios completados'
    return 'Despachado · pendiente de entrega'
  }
  if (modalidad === 'delivery' && bienesTotalmenteDespachados(venta)) {
    return 'Bienes despachados · pendientes de entrega'
  }
  if (hayDespachoParcial(venta)) return 'Despacho parcial'
  if (!hayBienesPendientesDeDespacho(venta) && hayServiciosPendientes(venta)) return 'Servicios pendientes'
  return venta ? 'Pendiente de despacho' : 'Pendiente de venta'
}

function hayBienesPendientesDeDespacho(venta?: Venta) {
  return lineasBienes(venta).some((linea) => cantidadPendiente(linea) > 0)
}
