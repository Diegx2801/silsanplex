import { z } from 'zod'

export const esquemaDatosVenta = z.object({
  tipoDocumento: z.enum(['factura', 'boleta', 'nota-venta']),
  serie: z.string().trim().min(1, 'Ingresa la serie').max(10, 'Máximo 10 caracteres'),
  numeroDocumento: z.string().trim().min(1, 'Ingresa el número').max(20, 'Máximo 20 caracteres'),
  fechaVenta: z.string().min(1, 'Selecciona la fecha de venta'),
  almacen: z.string().trim().min(2, 'Ingresa el almacén').max(80, 'Máximo 80 caracteres'),
})

export type DatosVenta = z.infer<typeof esquemaDatosVenta>

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
  lineas: z.array(esquemaLineaOperacionVenta).min(1),
  estado: z.enum(['registrada', 'despachada']),
  fechaRegistro: z.string().datetime(),
  fechaDespacho: z.string().datetime().nullable(),
})

export type Venta = z.infer<typeof esquemaVenta>
