import { z } from 'zod'

import { fechaActualPeru } from '@/lib/fechas'

/**
 * Valida una fecha ISO de formulario sin permitir fechas de calendario
 * inexistentes (por ejemplo, 31 de febrero). El tipo `date` del navegador
 * ayuda a la interfaz, pero el contrato también debe protegerse antes de
 * enviar una operación persistente.
 */
export function esFechaCalendarioValida(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00.000Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

/** Devuelve la fecha del calendario local para controles HTML `date`. */
export function fechaLocalActual() {
  return fechaActualPeru()
}

export const esquemaDatosVenta = z.object({
  tipoDocumento: z.enum(['factura', 'boleta', 'nota-venta']),
  serie: z.string().trim().min(1, 'Ingresa la serie').max(10, 'Máximo 10 caracteres'),
  numeroDocumento: z.string().trim().min(1, 'Ingresa el número').max(20, 'Máximo 20 caracteres'),
  fechaVenta: z.string()
    .trim()
    .min(1, 'Selecciona la fecha de venta')
    .refine(esFechaCalendarioValida, 'Ingresa una fecha de venta válida'),
  almacen: z.string().trim().min(2, 'Ingresa el almacén').max(80, 'Máximo 80 caracteres'),
})

export type DatosVenta = z.infer<typeof esquemaDatosVenta>

export const esquemaEstadoCalculoTributario = z.enum(['calculated', 'pending', 'legacy_unknown'])
export type EstadoCalculoTributario = z.infer<typeof esquemaEstadoCalculoTributario>

/** Contrato de cumplimiento persistente del pedido. Se mantiene opcional en
 * lecturas para que los pedidos históricos sigan siendo renderizables hasta
 * completar la migración local/remota. */
export const MODOS_CUMPLIMIENTO_PEDIDO = ['delivery', 'pickup'] as const
export const ESTADOS_CUMPLIMIENTO_PEDIDO = [
  'pending',
  'preparing',
  'dispatched',
  'delivered',
  'partially_fulfilled',
  'out_of_stock',
  'cancelled',
] as const
export type ModoCumplimientoPedido = typeof MODOS_CUMPLIMIENTO_PEDIDO[number]
export type EstadoCumplimientoPedido = typeof ESTADOS_CUMPLIMIENTO_PEDIDO[number]

export const esquemaLineaOperacionVenta = z.object({
  id: z.string().min(1),
  productoId: z.string().min(1),
  tipoProducto: z.enum(['good', 'service']).optional(),
  productoCodigo: z.string().min(1),
  productoDescripcion: z.string().min(1),
  unidadMedida: z.string(),
  cantidad: z.number().positive(),
  // PostgreSQL permite precio cero para bonificaciones; distribución solo
  // necesita la cantidad y la identidad persistente de la línea.
  precioUnitario: z.number().nonnegative(),
  lote: z.string(),
  fechaVencimiento: z.string(),
  // NULL identifica líneas históricas anteriores a P1B-1 sin dato reconstruible.
  afectacionIgv: z.enum(['por-definir', 'gravado', 'exonerado', 'inafecto']).nullable().optional(),
  // Identidad persistente de la línea de pedido. El despacho canónico la usa
  // para consumir únicamente las reservas de su origen comercial.
  pedidoLineaId: z.string().uuid().optional(),
  cantidadDespachada: z.number().nonnegative().optional(),
  cantidadPendiente: z.number().nonnegative().optional(),
  cantidadCompletadaServicio: z.number().nonnegative().optional(),
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
  // Fecha comercial del pedido; los registros antiguos pueden no tenerla.
  fechaPedido: z.string().min(1).optional(),
  preciosIncluyenIgv: z.boolean(),
  baseGravada: z.number().nonnegative().nullable(),
  montoExonerado: z.number().nonnegative().nullable(),
  montoInafecto: z.number().nonnegative().nullable(),
  subtotal: z.number().nonnegative(),
  igv: z.number().nonnegative(),
  total: z.number().nonnegative(),
  estadoCalculoTributario: esquemaEstadoCalculoTributario,
  observacion: z.string(),
  lineas: z.array(esquemaLineaOperacionVenta).min(1),
  estado: z.enum(['confirmado', 'atendido', 'cancelado']),
  modalidadCumplimiento: z.enum(MODOS_CUMPLIMIENTO_PEDIDO).optional(),
  estadoCumplimiento: z.enum(ESTADOS_CUMPLIMIENTO_PEDIDO).optional(),
  fechaRegistro: z.string().datetime(),
  fechaAtencion: z.string().datetime().nullable(),
  // Algunos pedidos históricos migrados todavía no tienen almacén canónico.
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
  baseGravada: z.number().nonnegative().nullable(),
  montoExonerado: z.number().nonnegative().nullable(),
  montoInafecto: z.number().nonnegative().nullable(),
  subtotal: z.number().nonnegative(),
  igv: z.number().nonnegative(),
  total: z.number().nonnegative(),
  estadoCalculoTributario: esquemaEstadoCalculoTributario,
  lineas: z.array(esquemaLineaOperacionVenta).min(1),
  estado: z.enum(['registrada', 'despachada']),
  fechaRegistro: z.string().datetime(),
  fechaDespacho: z.string().datetime().nullable(),
})

export type Venta = z.infer<typeof esquemaVenta>
