import { z } from 'zod'

import type { Producto } from '@/modulos/productos/modelo/producto'

export const tiposMovimientoInventario = [
  { valor: 'entrada', etiqueta: 'Entrada' },
  { valor: 'salida', etiqueta: 'Salida' },
  { valor: 'ajuste-positivo', etiqueta: 'Ajuste positivo' },
  { valor: 'ajuste-negativo', etiqueta: 'Ajuste negativo' },
] as const

export const esquemaDatosMovimientoInventario = z.object({
  productoId: z.string().min(1, 'Selecciona un producto'),
  tipo: z.enum(['entrada', 'salida', 'ajuste-positivo', 'ajuste-negativo']),
  cantidad: z
    .string()
    .trim()
    .refine(
      (valor) => /^\d+(\.\d{1,3})?$/.test(valor) && Number(valor) > 0,
      'Ingresa una cantidad mayor a cero con hasta 3 decimales',
    ),
  almacen: z
    .string()
    .trim()
    .min(2, 'Ingresa el almacén')
    .max(80, 'Máximo 80 caracteres'),
  lote: z.string().trim().max(60, 'Máximo 60 caracteres'),
  almacenId: z.string().uuid().optional(),
  ubicacionId: z.string().uuid().optional(),
  estadoStock: z.enum(['available', 'quarantine', 'damaged']).optional(),
  costoUnitario: z.string().optional(),
  fechaVencimiento: z.string(),
  fechaOperacion: z.string().min(1, 'Selecciona la fecha de operación'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Describe el motivo del movimiento')
    .max(180, 'Máximo 180 caracteres'),
})

export type DatosMovimientoInventario = z.infer<
  typeof esquemaDatosMovimientoInventario
>
export type TipoMovimientoInventario = DatosMovimientoInventario['tipo']

export const esquemaMovimientoInventario = z.object({
  id: z.string().min(1),
  productoId: z.string().min(1),
  productoCodigo: z.string().min(1),
  productoDescripcion: z.string().min(1),
  unidadMedida: z.string(),
  tipo: z.enum(['entrada', 'salida', 'ajuste-positivo', 'ajuste-negativo']),
  cantidad: z.number().positive(),
  almacen: z.string().min(1),
  lote: z.string(),
  almacenId: z.string().optional(),
  ubicacionId: z.string().optional(),
  ubicacion: z.string().optional(),
  estadoStock: z.enum(['available', 'quarantine', 'damaged']).optional(),
  costoUnitario: z.number().nonnegative().optional(),
  fechaVencimiento: z.string(),
  fechaOperacion: z.string().min(1),
  fechaRegistro: z.string().datetime(),
  motivo: z.string().min(1),
})

export type MovimientoInventario = z.infer<typeof esquemaMovimientoInventario>

export interface ExistenciaProducto {
  producto: Producto
  stock: number
  almacenes: number
  lotesConStock: number
  ultimoMovimiento: MovimientoInventario | null
}

export function movimientoEsSalida(tipo: TipoMovimientoInventario) {
  return tipo === 'salida' || tipo === 'ajuste-negativo'
}

export function obtenerVariacion(movimiento: {
  tipo: TipoMovimientoInventario
  cantidad: number
}) {
  return movimientoEsSalida(movimiento.tipo)
    ? -movimiento.cantidad
    : movimiento.cantidad
}

function normalizarClave(valor: string) {
  return valor.trim().toLocaleLowerCase('es-PE')
}

export function calcularSaldoDisponible(
  movimientos: readonly MovimientoInventario[],
  producto: Producto,
  almacen: string,
  lote: string,
) {
  const almacenNormalizado = normalizarClave(almacen)
  const loteNormalizado = normalizarClave(lote)
  let saldo = 0

  for (const movimiento of movimientos) {
    if (
      movimiento.productoId !== producto.id ||
      normalizarClave(movimiento.almacen) !== almacenNormalizado ||
      (producto.controlLote &&
        normalizarClave(movimiento.lote) !== loteNormalizado)
    ) {
      continue
    }

    saldo += obtenerVariacion(movimiento)
  }

  return saldo
}

export function calcularStockTotal(
  movimientos: readonly MovimientoInventario[],
  productoId: string,
) {
  return movimientos.reduce(
    (saldo, movimiento) =>
      movimiento.productoId === productoId
        ? saldo + obtenerVariacion(movimiento)
        : saldo,
    0,
  )
}

export function validarMovimientoInventario(
  datos: DatosMovimientoInventario,
  producto: Producto,
  movimientos: readonly MovimientoInventario[],
) {
  if (producto.controlLote && !datos.lote) {
    return 'Ingresa el lote para este producto'
  }

  if (producto.controlVencimiento && !datos.fechaVencimiento) {
    return 'Ingresa la fecha de vencimiento para este producto'
  }

  if (!movimientoEsSalida(datos.tipo)) {
    const stockMaximo = Number(producto.stockMaximo)
    const stockResultante =
      calcularStockTotal(movimientos, producto.id) + Number(datos.cantidad)

    if (producto.stockMaximo && stockResultante > stockMaximo) {
      return `La entrada superaría el stock máximo del producto (${stockMaximo})`
    }

    return undefined
  }

  const disponible = calcularSaldoDisponible(
    movimientos,
    producto,
    datos.almacen,
    datos.lote,
  )

  if (Number(datos.cantidad) > disponible) {
    return `La cantidad supera el stock disponible (${disponible})`
  }

  return undefined
}

export function crearMovimientoInventario(
  datos: DatosMovimientoInventario,
  producto: Producto,
  ahora = new Date(),
): MovimientoInventario {
  return {
    id: crypto.randomUUID(),
    productoId: producto.id,
    productoCodigo: producto.codigo,
    productoDescripcion: producto.descripcion,
    unidadMedida: producto.unidadMedida,
    tipo: datos.tipo,
    cantidad: Number(datos.cantidad),
    almacen: datos.almacen,
    lote: datos.lote,
    fechaVencimiento: datos.fechaVencimiento,
    fechaOperacion: datos.fechaOperacion,
    fechaRegistro: ahora.toISOString(),
    motivo: datos.motivo,
  }
}

export function calcularExistencias(
  productos: readonly Producto[],
  movimientos: readonly MovimientoInventario[],
): ExistenciaProducto[] {
  const movimientosPorProducto = new Map<string, MovimientoInventario[]>()

  for (const movimiento of movimientos) {
    const agrupados = movimientosPorProducto.get(movimiento.productoId)
    if (agrupados) agrupados.push(movimiento)
    else movimientosPorProducto.set(movimiento.productoId, [movimiento])
  }

  return productos.map((producto) => {
    const relacionados = movimientosPorProducto.get(producto.id) ?? []
    const saldoPorAlmacen = new Map<string, number>()
    const saldoPorLote = new Map<string, number>()
    let stock = 0

    for (const movimiento of relacionados) {
      const variacion = obtenerVariacion(movimiento)
      const claveAlmacen = normalizarClave(movimiento.almacen)
      const claveLote = `${claveAlmacen}::${normalizarClave(movimiento.lote)}`
      stock += variacion
      saldoPorAlmacen.set(
        claveAlmacen,
        (saldoPorAlmacen.get(claveAlmacen) ?? 0) + variacion,
      )
      if (movimiento.lote) {
        saldoPorLote.set(
          claveLote,
          (saldoPorLote.get(claveLote) ?? 0) + variacion,
        )
      }
    }

    return {
      producto,
      stock,
      almacenes: [...saldoPorAlmacen.values()].filter((saldo) => saldo > 0)
        .length,
      lotesConStock: [...saldoPorLote.values()].filter((saldo) => saldo > 0)
        .length,
      ultimoMovimiento:
        relacionados.toSorted((a, b) =>
          b.fechaRegistro.localeCompare(a.fechaRegistro),
        )[0] ?? null,
    }
  })
}

export function resumirInventario(
  existencias: readonly ExistenciaProducto[],
  movimientos: readonly MovimientoInventario[],
) {
  let productosConStock = 0
  let stockTotal = 0

  for (const existencia of existencias) {
    if (existencia.stock > 0) productosConStock += 1
    stockTotal += existencia.stock
  }

  return {
    productos: existencias.length,
    productosConStock,
    productosSinStock: existencias.length - productosConStock,
    stockTotal,
    movimientos: movimientos.length,
  }
}
