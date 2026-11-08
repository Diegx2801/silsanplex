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

  return bienesPedido.some((bienPedido) => {
    const bienVenta = venta.lineas.find((linea) => linea.tipoProducto === 'good' && linea.pedidoLineaId === bienPedido.id)
    return (bienVenta?.cantidadDespachada ?? 0) > 0
  })
}

interface MovimientoDisponibleParaAsignacion {
  inventoryMovementId: string
  orderLineId: string
  cantidadDisponible: number
}

/**
 * Asigna una cantidad de entrega a las salidas que Ventas ya registró.
 * Respeta primero las asignaciones existentes al editar y completa el saldo
 * usando el orden estable entregado por Inventario (vencimiento, luego id).
 */
export function asignarMovimientosDisponibles<T extends {
  id: string
  tipoProducto?: 'good' | 'service'
  cantidad: number
  asignacionesMovimiento?: ReadonlyArray<{ inventoryMovementId: string; quantity: number }>
}>(
  lineas: readonly T[],
  movimientos: readonly MovimientoDisponibleParaAsignacion[],
) {
  const cantidadesUsadasMil = new Map<string, number>()
  const lineasSinSaldo: Array<{ id: string; cantidadRequerida: number; cantidadDisponible: number }> = []

  const aMiliunidades = (cantidad: number) => Math.max(0, Math.round((cantidad + Number.EPSILON) * 1000))
  const aCantidad = (cantidadMil: number) => cantidadMil / 1000

  const lineasAsignadas = lineas.map((linea) => {
    const cantidadRequeridaMil = aMiliunidades(linea.cantidad)
    if (linea.tipoProducto !== 'good' || cantidadRequeridaMil <= 0) {
      return { ...linea, asignacionesMovimiento: [] }
    }

    const movimientosLinea = movimientos.filter((movimiento) => movimiento.orderLineId === linea.id)
    const disponiblesPorId = new Map(movimientosLinea.map((movimiento) => [movimiento.inventoryMovementId, movimiento]))
    const asignacionesMil = new Map<string, number>()
    let saldoMil = cantidadRequeridaMil

    for (const asignacion of linea.asignacionesMovimiento ?? []) {
      const movimiento = disponiblesPorId.get(asignacion.inventoryMovementId)
      if (!movimiento || saldoMil <= 0) continue
      const usadoMil = cantidadesUsadasMil.get(movimiento.inventoryMovementId) ?? 0
      const disponibleMil = Math.max(0, aMiliunidades(movimiento.cantidadDisponible) - usadoMil)
      const cantidadMil = Math.min(saldoMil, aMiliunidades(asignacion.quantity), disponibleMil)
      if (cantidadMil <= 0) continue
      asignacionesMil.set(movimiento.inventoryMovementId, cantidadMil)
      cantidadesUsadasMil.set(movimiento.inventoryMovementId, usadoMil + cantidadMil)
      saldoMil -= cantidadMil
    }

    for (const movimiento of movimientosLinea) {
      if (saldoMil <= 0) break
      const usadoMil = cantidadesUsadasMil.get(movimiento.inventoryMovementId) ?? 0
      const disponibleMil = Math.max(0, aMiliunidades(movimiento.cantidadDisponible) - usadoMil)
      const cantidadMil = Math.min(saldoMil, disponibleMil)
      if (cantidadMil <= 0) continue
      asignacionesMil.set(movimiento.inventoryMovementId, (asignacionesMil.get(movimiento.inventoryMovementId) ?? 0) + cantidadMil)
      cantidadesUsadasMil.set(movimiento.inventoryMovementId, usadoMil + cantidadMil)
      saldoMil -= cantidadMil
    }

    if (saldoMil > 0) {
      lineasSinSaldo.push({
        id: linea.id,
        cantidadRequerida: aCantidad(cantidadRequeridaMil),
        cantidadDisponible: aCantidad(cantidadRequeridaMil - saldoMil),
      })
    }

    return {
      ...linea,
      asignacionesMovimiento: [...asignacionesMil].map(([inventoryMovementId, quantityMil]) => ({
        inventoryMovementId,
        quantity: aCantidad(quantityMil),
      })),
    }
  })

  return { lineas: lineasAsignadas, lineasSinSaldo }
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
