import { z } from 'zod'

import type { Producto } from '@/modulos/productos/modelo/producto'
import type { Proveedor } from '@/modulos/proveedores/modelo/proveedor'

export {
  esquemaDatosProveedor,
  type DatosProveedor,
  type Proveedor,
} from '@/modulos/proveedores/modelo/proveedor'

const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo, `Máximo ${maximo} caracteres`)

const importePositivo = z
  .string()
  .trim()
  .refine(
    (valor) => /^\d+(\.\d{1,4})?$/.test(valor) && Number(valor) > 0,
    'Ingresa un valor mayor a cero con hasta 4 decimales',
  )

export const esquemaLineaCompraFormulario = z.object({
  productoId: z.string().min(1, 'Selecciona un producto'),
  cantidad: importePositivo,
  costoUnitario: importePositivo,
  lote: textoOpcional(60),
  fechaVencimiento: z.string(),
})

export const esquemaDatosCompra = z.object({
  proveedorId: z.string().min(1, 'Selecciona un proveedor'),
  tipoDocumento: z.enum(['factura', 'boleta', 'guia', 'otro']),
  serie: z
    .string()
    .trim()
    .min(1, 'Ingresa la serie')
    .max(10, 'Máximo 10 caracteres'),
  numero: z
    .string()
    .trim()
    .min(1, 'Ingresa el número')
    .max(20, 'Máximo 20 caracteres'),
  fechaEmision: z.string().min(1, 'Selecciona la fecha de emisión'),
  fechaVencimientoPago: z.string(),
  fechaEntregaEsperada: z.string(),
  almacenId: z.string().uuid('Selecciona un almacén válido'),
  almacen: z
    .string()
    .trim()
    .min(2, 'Ingresa el almacén')
    .max(80, 'Máximo 80 caracteres'),
  preciosIncluyenIgv: z.boolean(),
  observacion: textoOpcional(240),
  lineas: z
    .array(esquemaLineaCompraFormulario)
    .min(1, 'Agrega al menos un producto'),
}).superRefine((datos, contexto) => {
  if (
    datos.fechaVencimientoPago &&
    datos.fechaEmision &&
    datos.fechaVencimientoPago < datos.fechaEmision
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['fechaVencimientoPago'],
      message: 'No puede ser anterior a la fecha de emisión',
    })
  }
  if (
    datos.fechaEntregaEsperada &&
    datos.fechaEmision &&
    datos.fechaEntregaEsperada < datos.fechaEmision
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['fechaEntregaEsperada'],
      message: 'No puede ser anterior a la fecha de emisión',
    })
  }
})

export type DatosCompra = z.infer<typeof esquemaDatosCompra>

export const esquemaLineaCompra = z.object({
  id: z.string().min(1),
  productoId: z.string().min(1),
  productoCodigo: z.string().min(1),
  productoDescripcion: z.string().min(1),
  unidadMedida: z.string(),
  controlLote: z.boolean(),
  controlVencimiento: z.boolean(),
  cantidad: z.number().positive(),
  cantidadRecibida: z.number().nonnegative(),
  cantidadPendiente: z.number().nonnegative(),
  costoUnitario: z.number().positive(),
  lote: z.string(),
  fechaVencimiento: z.string(),
  // NULL identifica líneas históricas anteriores a P1B-1 sin dato reconstruible.
  afectacionIgv: z.enum(['por-definir', 'gravado', 'exonerado', 'inafecto']).nullable().optional(),
})

export type LineaCompra = z.infer<typeof esquemaLineaCompra>
export type EstadoCompra = 'borrador' | 'emitida' | 'parcialmente-recibida' | 'recibida' | 'cerrada-parcial' | 'anulada'

export interface LineaRecepcionCompra {
  purchaseOrderItemId: string
  cantidad: string
  ubicacionId: string
  lote: string
  fechaVencimiento: string
}

export interface DatosRecepcionCompra {
  operationKey: string
  observacion: string
  lineas: LineaRecepcionCompra[]
}

export const esquemaCompra = z.object({
  id: z.string().min(1),
  proveedorId: z.string().min(1),
  proveedorDocumento: z.string().min(1),
  proveedorNombre: z.string().min(1),
  tipoDocumento: z.enum(['factura', 'boleta', 'guia', 'otro']),
  serie: z.string().min(1),
  numero: z.string().min(1),
  fechaEmision: z.string().min(1),
  fechaVencimientoPago: z.string(),
  fechaEntregaEsperada: z.string(),
  almacenId: z.string().uuid(),
  almacen: z.string().min(1),
  preciosIncluyenIgv: z.boolean(),
  observacion: z.string(),
  lineas: z.array(esquemaLineaCompra).min(1),
  estado: z.enum(['borrador', 'emitida', 'parcialmente-recibida', 'recibida', 'cerrada-parcial', 'anulada']),
  fechaRegistro: z.string().datetime(),
  fechaEmisionOrden: z.string().datetime().nullable(),
  fechaRecepcion: z.string().datetime().nullable(),
})

export type Compra = z.infer<typeof esquemaCompra>

export interface TotalesCompra {
  subtotal: number
  igv: number
  total: number
}

function redondearMoneda(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function calcularTotalesCompra(
  lineas: readonly Pick<LineaCompra, 'cantidad' | 'costoUnitario'>[],
  preciosIncluyenIgv: boolean,
): TotalesCompra {
  const importeLineas = lineas.reduce(
    (total, linea) => total + linea.cantidad * linea.costoUnitario,
    0,
  )

  if (preciosIncluyenIgv) {
    const total = redondearMoneda(importeLineas)
    const subtotal = redondearMoneda(total / 1.18)
    return { subtotal, igv: redondearMoneda(total - subtotal), total }
  }

  const subtotal = redondearMoneda(importeLineas)
  const igv = redondearMoneda(subtotal * 0.18)
  return { subtotal, igv, total: redondearMoneda(subtotal + igv) }
}

export function validarCompra(
  datos: DatosCompra,
  productos: readonly Producto[],
) {
  const ids = new Set<string>()

  for (const linea of datos.lineas) {
    if (ids.has(linea.productoId)) {
      return 'Cada producto debe aparecer una sola vez en la compra'
    }
    ids.add(linea.productoId)

    const producto = productos.find((item) => item.id === linea.productoId)
    if (!producto?.activo) {
      return 'Uno de los productos ya no está disponible'
    }
    if (producto.controlLote && !linea.lote) {
      return `Ingresa el lote de ${producto.descripcion}`
    }
    if (producto.controlVencimiento && !linea.fechaVencimiento) {
      return `Ingresa la fecha de vencimiento de ${producto.descripcion}`
    }
  }

  return undefined
}

export function crearCompra(
  datos: DatosCompra,
  proveedor: Proveedor,
  productos: readonly Producto[],
  ahora = new Date(),
  compraId: string = crypto.randomUUID(),
): Compra {
  const productosPorId = new Map(
    productos.map((producto) => [producto.id, producto]),
  )

  return {
    id: compraId,
    proveedorId: proveedor.id,
    proveedorDocumento: proveedor.numeroDocumento,
    proveedorNombre: proveedor.razonSocial,
    tipoDocumento: datos.tipoDocumento,
    serie: datos.serie.toLocaleUpperCase('es-PE'),
    numero: datos.numero,
    fechaEmision: datos.fechaEmision,
    fechaVencimientoPago: datos.fechaVencimientoPago,
    fechaEntregaEsperada: datos.fechaEntregaEsperada,
    almacenId: datos.almacenId,
    almacen: datos.almacen,
    preciosIncluyenIgv: datos.preciosIncluyenIgv,
    observacion: datos.observacion,
    lineas: datos.lineas.map((linea) => {
      const producto = productosPorId.get(linea.productoId)!
      return {
        id: crypto.randomUUID(),
        productoId: producto.id,
        productoCodigo: producto.codigo,
        productoDescripcion: producto.descripcion,
        unidadMedida: producto.unidadMedida,
        controlLote: producto.controlLote,
        controlVencimiento: producto.controlVencimiento,
        cantidad: Number(linea.cantidad),
        cantidadRecibida: 0,
        cantidadPendiente: Number(linea.cantidad),
        costoUnitario: Number(linea.costoUnitario),
        lote: linea.lote,
        fechaVencimiento: linea.fechaVencimiento,
      }
    }),
    estado: 'borrador',
    fechaRegistro: ahora.toISOString(),
    fechaEmisionOrden: null,
    fechaRecepcion: null,
  }
}

export function compraAFormulario(compra: Compra): DatosCompra {
  return {
    proveedorId: compra.proveedorId,
    tipoDocumento: compra.tipoDocumento,
    serie: compra.serie,
    numero: compra.numero,
    fechaEmision: compra.fechaEmision,
    fechaVencimientoPago: compra.fechaVencimientoPago,
    fechaEntregaEsperada: compra.fechaEntregaEsperada,
    almacenId: compra.almacenId,
    almacen: compra.almacen,
    preciosIncluyenIgv: compra.preciosIncluyenIgv,
    observacion: compra.observacion,
    lineas: compra.lineas.map((linea) => ({
      productoId: linea.productoId,
      cantidad: String(linea.cantidad),
      costoUnitario: String(linea.costoUnitario),
      lote: linea.lote,
      fechaVencimiento: linea.fechaVencimiento,
    })),
  }
}
