import { z } from 'zod'

import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import type { Producto } from '@/modulos/productos/modelo/producto'

const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo, `Máximo ${maximo} caracteres`)

const numeroPositivo = z
  .string()
  .trim()
  .refine(
    (valor) => /^\d+(\.\d{1,4})?$/.test(valor) && Number(valor) > 0,
    'Ingresa un valor mayor a cero con hasta 4 decimales',
  )

export const esquemaLineaCotizacionFormulario = z.object({
  productoId: z.string().min(1, 'Selecciona un producto'),
  cantidad: numeroPositivo,
  precioUnitario: numeroPositivo,
})

export const esquemaDatosCotizacion = z
  .object({
    clienteId: z.string().min(1, 'Selecciona un cliente'),
    fechaEmision: z.string().min(1, 'Selecciona la fecha de emisión'),
    fechaValidez: z.string().min(1, 'Selecciona la fecha de validez'),
    preciosIncluyenIgv: z.boolean(),
    observacion: textoOpcional(300),
    lineas: z
      .array(esquemaLineaCotizacionFormulario)
      .min(1, 'Agrega al menos un producto'),
  })
  .superRefine((datos, contexto) => {
    if (datos.fechaValidez < datos.fechaEmision) {
      contexto.addIssue({
        code: 'custom',
        path: ['fechaValidez'],
        message: 'La vigencia no puede terminar antes de la emisión',
      })
    }
  })

export type DatosCotizacion = z.infer<typeof esquemaDatosCotizacion>

export const esquemaLineaCotizacion = z.object({
  id: z.string().min(1),
  productoId: z.string().min(1),
  productoCodigo: z.string().min(1),
  productoDescripcion: z.string().min(1),
  unidadMedida: z.string(),
  cantidad: z.number().positive(),
  precioUnitario: z.number().positive(),
})

export type LineaCotizacion = z.infer<typeof esquemaLineaCotizacion>
export type EstadoCotizacion = 'borrador' | 'emitida' | 'aceptada' | 'rechazada'

export const esquemaCotizacion = z.object({
  id: z.string().min(1),
  numero: z.string().regex(/^COT-\d{6}$/),
  clienteId: z.string().min(1),
  clienteDocumento: z.string().min(1),
  clienteNombre: z.string().min(1),
  fechaEmision: z.string().min(1),
  fechaValidez: z.string().min(1),
  preciosIncluyenIgv: z.boolean(),
  observacion: z.string(),
  lineas: z.array(esquemaLineaCotizacion).min(1),
  estado: z.enum(['borrador', 'emitida', 'aceptada', 'rechazada']),
  fechaRegistro: z.string().datetime(),
  fechaCambioEstado: z.string().datetime().nullable(),
})

export type Cotizacion = z.infer<typeof esquemaCotizacion>

export interface TotalesCotizacion {
  subtotal: number
  igv: number
  total: number
}

function redondearMoneda(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function calcularTotalesCotizacion(
  lineas: readonly Pick<LineaCotizacion, 'cantidad' | 'precioUnitario'>[],
  preciosIncluyenIgv: boolean,
): TotalesCotizacion {
  const importe = lineas.reduce(
    (total, linea) => total + linea.cantidad * linea.precioUnitario,
    0,
  )

  if (preciosIncluyenIgv) {
    const total = redondearMoneda(importe)
    const subtotal = redondearMoneda(total / 1.18)
    return { subtotal, igv: redondearMoneda(total - subtotal), total }
  }

  const subtotal = redondearMoneda(importe)
  const igv = redondearMoneda(subtotal * 0.18)
  return { subtotal, igv, total: redondearMoneda(subtotal + igv) }
}

export function validarCotizacion(
  datos: DatosCotizacion,
  productos: readonly Producto[],
) {
  const productosPorId = new Map(
    productos.map((producto) => [producto.id, producto]),
  )
  const seleccionados = new Set<string>()

  for (const linea of datos.lineas) {
    if (seleccionados.has(linea.productoId)) {
      return 'Cada producto debe aparecer una sola vez en la cotización'
    }
    seleccionados.add(linea.productoId)

    const producto = productosPorId.get(linea.productoId)
    if (!producto?.activo) {
      return 'Uno de los productos ya no está disponible'
    }

    const precioMinimo = Number(producto.precioMinimo)
    if (
      producto.precioMinimo &&
      Number(linea.precioUnitario) < precioMinimo
    ) {
      return `${producto.descripcion}: el precio unitario no puede ser menor a S/ ${precioMinimo.toFixed(2)}`
    }
  }

  return undefined
}

export function crearCotizacion(
  datos: DatosCotizacion,
  cliente: Cliente,
  productos: readonly Producto[],
  numero: string,
  ahora = new Date(),
  cotizacionId: string = crypto.randomUUID(),
): Cotizacion {
  const productosPorId = new Map(
    productos.map((producto) => [producto.id, producto]),
  )

  return {
    id: cotizacionId,
    numero,
    clienteId: cliente.id,
    clienteDocumento: cliente.numeroDocumento,
    clienteNombre: cliente.nombreRazonSocial,
    fechaEmision: datos.fechaEmision,
    fechaValidez: datos.fechaValidez,
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
        cantidad: Number(linea.cantidad),
        precioUnitario: Number(linea.precioUnitario),
      }
    }),
    estado: 'borrador',
    fechaRegistro: ahora.toISOString(),
    fechaCambioEstado: null,
  }
}

export function cotizacionAFormulario(cotizacion: Cotizacion): DatosCotizacion {
  return {
    clienteId: cotizacion.clienteId,
    fechaEmision: cotizacion.fechaEmision,
    fechaValidez: cotizacion.fechaValidez,
    preciosIncluyenIgv: cotizacion.preciosIncluyenIgv,
    observacion: cotizacion.observacion,
    lineas: cotizacion.lineas.map((linea) => ({
      productoId: linea.productoId,
      cantidad: String(linea.cantidad),
      precioUnitario: String(linea.precioUnitario),
    })),
  }
}
