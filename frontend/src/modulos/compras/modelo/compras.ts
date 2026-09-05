import { z } from 'zod'

import type { AfectacionTributaria, Producto } from '@/modulos/productos/modelo/producto'
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
  baseGravada: z.number().nonnegative().nullable().optional(),
  montoExonerado: z.number().nonnegative().nullable().optional(),
  montoInafecto: z.number().nonnegative().nullable().optional(),
  subtotal: z.number().nonnegative().nullable().optional(),
  igv: z.number().nonnegative().nullable().optional(),
  total: z.number().nonnegative().nullable().optional(),
  estadoCalculoTributario: z.enum(['calculated', 'pending', 'legacy_unknown']).optional(),
})

export type Compra = z.infer<typeof esquemaCompra>

export type EstadoCalculoTributario = 'calculated' | 'pending' | 'legacy_unknown'

export interface TotalesCompra {
  estado: EstadoCalculoTributario
  baseGravada: number | null
  montoExonerado: number | null
  montoInafecto: number | null
  subtotal: number | null
  igv: number | null
  total: number | null
}

function redondearMoneda(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function calcularTotalesCompra(
  lineas: readonly (Pick<LineaCompra, 'cantidad' | 'costoUnitario'> & {
    afectacionIgv?: AfectacionTributaria | null
  })[],
  preciosIncluyenIgv: boolean,
): TotalesCompra {
  if (lineas.some((linea) => !linea.afectacionIgv || linea.afectacionIgv === 'por-definir')) {
    return {
      estado: 'pending',
      baseGravada: null,
      montoExonerado: null,
      montoInafecto: null,
      subtotal: null,
      igv: null,
      total: null,
    }
  }

  const acumulado = lineas.reduce(
    (totales, linea) => {
      const importe = redondearMoneda(linea.cantidad * linea.costoUnitario)
      const afectacion = linea.afectacionIgv
      if (afectacion === 'gravado') {
        const base = preciosIncluyenIgv
          ? redondearMoneda(importe / 1.18)
          : importe
        const igv = preciosIncluyenIgv
          ? redondearMoneda(importe - base)
          : redondearMoneda(base * 0.18)
        return {
          baseGravada: totales.baseGravada + base,
          montoExonerado: totales.montoExonerado,
          montoInafecto: totales.montoInafecto,
          igv: totales.igv + igv,
        }
      }
      return {
        baseGravada: totales.baseGravada,
        montoExonerado: totales.montoExonerado + (afectacion === 'exonerado' ? importe : 0),
        montoInafecto: totales.montoInafecto + (afectacion === 'inafecto' ? importe : 0),
        igv: totales.igv,
      }
    },
    { baseGravada: 0, montoExonerado: 0, montoInafecto: 0, igv: 0 },
  )
  const baseGravada = redondearMoneda(acumulado.baseGravada)
  const montoExonerado = redondearMoneda(acumulado.montoExonerado)
  const montoInafecto = redondearMoneda(acumulado.montoInafecto)
  const subtotal = redondearMoneda(baseGravada + montoExonerado + montoInafecto)
  const igv = redondearMoneda(acumulado.igv)
  return {
    estado: 'calculated',
    baseGravada,
    montoExonerado,
    montoInafecto,
    subtotal,
    igv,
    total: redondearMoneda(subtotal + igv),
  }
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
        afectacionIgv: producto.afectacionIgv || 'por-definir',
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
