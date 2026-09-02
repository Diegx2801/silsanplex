import { z } from 'zod'

import {
  calcularSaldoDisponible,
  crearMovimientoInventario,
  type MovimientoInventario,
} from '@/modulos/inventario/modelo/inventario'
import type { Producto } from '@/modulos/productos/modelo/producto'
import type { Cotizacion, LineaCotizacion } from '@/modulos/ventas/modelo/cotizacion'

export const esquemaDatosVenta = z.object({
  tipoDocumento: z.enum(['factura', 'boleta', 'nota-venta']),
  serie: z.string().trim().min(1, 'Ingresa la serie').max(10, 'Máximo 10 caracteres'),
  numeroDocumento: z.string().trim().min(1, 'Ingresa el número').max(20, 'Máximo 20 caracteres'),
  fechaVenta: z.string().min(1, 'Selecciona la fecha de venta'),
  almacen: z.string().trim().min(2, 'Ingresa el almacén').max(80, 'Máximo 80 caracteres'),
})

export type DatosVenta = z.infer<typeof esquemaDatosVenta>

export const esquemaLineaDespacho = z.object({
  lineaVentaId: z.string().min(1),
  lote: z.string().trim().max(60, 'Máximo 60 caracteres'),
  fechaVencimiento: z.string(),
})

export const esquemaDatosDespacho = z.object({
  fechaDespacho: z.string().min(1, 'Selecciona la fecha de despacho'),
  lineas: z.array(esquemaLineaDespacho).min(1),
})

export type DatosDespacho = z.infer<typeof esquemaDatosDespacho>

export const esquemaLineaOperacionVenta = z.object({
  id: z.string().min(1),
  productoId: z.string().min(1),
  productoCodigo: z.string().min(1),
  productoDescripcion: z.string().min(1),
  unidadMedida: z.string(),
  cantidad: z.number().positive(),
  // PostgreSQL permite precio cero para bonificaciones; distribución solo
  // necesita la cantidad y la identidad persistente de la línea.
  precioUnitario: z.number().nonnegative(),
  lote: z.string(),
  fechaVencimiento: z.string(),
  // Identidad persistente de la línea de pedido. El despacho canónico la usa
  // para consumir únicamente las reservas de su origen comercial.
  pedidoLineaId: z.string().uuid().optional(),
  cantidadDespachada: z.number().nonnegative().optional(),
  cantidadPendiente: z.number().nonnegative().optional(),
})

export type LineaOperacionVenta = z.infer<typeof esquemaLineaOperacionVenta>

export const esquemaPedidoVenta = z.object({
  id: z.string().min(1),
  numero: z.string().regex(/^PED-\d{6}$/),
  cotizacionId: z.string().min(1),
  cotizacionNumero: z.string().min(1),
  clienteId: z.string().min(1),
  clienteDocumento: z.string().min(1),
  clienteNombre: z.string().min(1),
  preciosIncluyenIgv: z.boolean(),
  observacion: z.string(),
  lineas: z.array(esquemaLineaOperacionVenta).min(1),
  estado: z.enum(['confirmado', 'atendido', 'cancelado']),
  fechaRegistro: z.string().datetime(),
  fechaAtencion: z.string().datetime().nullable(),
  // Los pedidos persistentes de Fase 2B-1A incluyen el almacen canonico.
  // Se mantienen opcionales para que el repositorio temporal legado pueda
  // seguir leyendo borradores historicos mientras se completa la migracion.
  almacenId: z.string().uuid().optional(),
  almacenNombre: z.string().min(1).optional(),
})

export type PedidoVenta = z.infer<typeof esquemaPedidoVenta>

export const esquemaVenta = z.object({
  id: z.string().min(1),
  numeroInterno: z.string().regex(/^VEN-\d{6}$/),
  pedidoId: z.string().min(1),
  pedidoNumero: z.string().min(1),
  clienteId: z.string().min(1),
  clienteDocumento: z.string().min(1),
  clienteNombre: z.string().min(1),
  tipoDocumento: z.enum(['factura', 'boleta', 'nota-venta']),
  serie: z.string().min(1),
  numeroDocumento: z.string().min(1),
  fechaVenta: z.string().min(1),
  almacen: z.string().min(1),
  preciosIncluyenIgv: z.boolean(),
  lineas: z.array(esquemaLineaOperacionVenta).min(1),
  estado: z.enum(['registrada', 'despachada']),
  fechaRegistro: z.string().datetime(),
  fechaDespacho: z.string().datetime().nullable(),
})

export type Venta = z.infer<typeof esquemaVenta>

function copiarLineas(lineas: readonly LineaCotizacion[]): LineaOperacionVenta[] {
  return lineas.map((linea) => ({
    ...linea,
    id: crypto.randomUUID(),
    lote: '',
    fechaVencimiento: '',
  }))
}

export function crearPedidoDesdeCotizacion(
  cotizacion: Cotizacion,
  numero: string,
  ahora = new Date(),
): PedidoVenta {
  return {
    id: crypto.randomUUID(),
    numero,
    cotizacionId: cotizacion.id,
    cotizacionNumero: cotizacion.numero,
    clienteId: cotizacion.clienteId,
    clienteDocumento: cotizacion.clienteDocumento,
    clienteNombre: cotizacion.clienteNombre,
    preciosIncluyenIgv: cotizacion.preciosIncluyenIgv,
    observacion: cotizacion.observacion,
    lineas: copiarLineas(cotizacion.lineas),
    estado: 'confirmado',
    fechaRegistro: ahora.toISOString(),
    fechaAtencion: null,
  }
}

export function crearVentaDesdePedido(
  pedido: PedidoVenta,
  datos: DatosVenta,
  numeroInterno: string,
  ahora = new Date(),
): Venta {
  return {
    id: crypto.randomUUID(),
    numeroInterno,
    pedidoId: pedido.id,
    pedidoNumero: pedido.numero,
    clienteId: pedido.clienteId,
    clienteDocumento: pedido.clienteDocumento,
    clienteNombre: pedido.clienteNombre,
    tipoDocumento: datos.tipoDocumento,
    serie: datos.serie.trim().toUpperCase(),
    numeroDocumento: datos.numeroDocumento.trim(),
    fechaVenta: datos.fechaVenta,
    almacen: datos.almacen.trim(),
    preciosIncluyenIgv: pedido.preciosIncluyenIgv,
    lineas: pedido.lineas.map((linea) => ({ ...linea, id: crypto.randomUUID() })),
    estado: 'registrada',
    fechaRegistro: ahora.toISOString(),
    fechaDespacho: null,
  }
}

export type ResultadoPreparacionDespacho =
  | { error: string; venta?: never; movimientos?: never }
  | { error?: never; venta: Venta; movimientos: MovimientoInventario[] }

export function prepararDespachoVenta(
  venta: Venta,
  datos: DatosDespacho,
  productos: readonly Producto[],
  inventario: readonly MovimientoInventario[],
  ahora = new Date(),
): ResultadoPreparacionDespacho {
  const productosPorId = new Map(productos.map((producto) => [producto.id, producto]))
  const despachoPorLinea = new Map(datos.lineas.map((linea) => [linea.lineaVentaId, linea]))
  const movimientos: MovimientoInventario[] = []

  for (const linea of venta.lineas) {
    const producto = productosPorId.get(linea.productoId)
    const despacho = despachoPorLinea.get(linea.id)
    if (!producto?.activo) return { error: `El producto ${linea.productoDescripcion} ya no está activo` }
    if (!despacho) return { error: `Faltan datos de despacho para ${linea.productoDescripcion}` }
    if (producto.controlLote && !despacho.lote) return { error: `Selecciona el lote de ${linea.productoDescripcion}` }

    const disponible = calcularSaldoDisponible(inventario, producto, venta.almacen, despacho.lote)
    if (linea.cantidad > disponible) {
      return { error: `${linea.productoDescripcion}: stock insuficiente en ${venta.almacen} (disponible: ${disponible})` }
    }

    movimientos.push(
      crearMovimientoInventario(
        {
          productoId: producto.id,
          tipo: 'salida',
          cantidad: String(linea.cantidad),
          almacen: venta.almacen,
          lote: despacho.lote,
          fechaVencimiento: despacho.fechaVencimiento,
          fechaOperacion: datos.fechaDespacho,
          motivo: `Despacho de ${venta.tipoDocumento} ${venta.serie}-${venta.numeroDocumento} · ${venta.pedidoNumero}`,
        },
        producto,
        ahora,
      ),
    )
  }

  return {
    movimientos,
    venta: {
      ...venta,
      estado: 'despachada',
      fechaDespacho: ahora.toISOString(),
      lineas: venta.lineas.map((linea) => {
        const despacho = despachoPorLinea.get(linea.id)!
        return { ...linea, lote: despacho.lote, fechaVencimiento: despacho.fechaVencimiento }
      }),
    },
  }
}
