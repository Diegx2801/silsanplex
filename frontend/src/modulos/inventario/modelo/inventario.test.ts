import { describe, expect, it } from 'vitest'

import { productoInicial, type Producto } from '../../productos/modelo/producto'
import {
  calcularExistencias,
  calcularExistenciasDesdeResumen,
  calcularSaldoDisponible,
  cantidadFisicaNoReservada,
  crearMotivoAjusteStock,
  esquemaDatosMovimientoInventario,
  esquemaFormularioAjusteStock,
  crearMovimientoInventario,
  obtenerVariacion,
  resumirInventario,
  validarMovimientoInventario,
  type DatosMovimientoInventario,
  type MovimientoInventario,
} from './inventario'

const producto = {
  ...productoInicial,
  id: 'producto-1',
  codigo: 'MED-001',
  descripcion: 'Paracetamol 500 mg',
  unidadMedida: 'Caja',
  controlLote: true,
  stockMaximo: '12',
} satisfies Producto

const datosBase = {
  productoId: producto.id,
  tipo: 'entrada',
  cantidad: '10',
  costoUnitario: '12.5',
  almacen: 'Almacén principal',
  lote: 'L-001',
  fechaVencimiento: '2027-12-31',
  fechaOperacion: '2026-08-19',
  motivo: 'Recepción de mercadería',
  documentoReferencia: 'ACTA-001',
} satisfies DatosMovimientoInventario

function movimiento(
  tipo: MovimientoInventario['tipo'],
  cantidad: number,
  lote = 'L-001',
): MovimientoInventario {
  return {
    id: `${tipo}-${cantidad}`,
    productoId: producto.id,
    productoCodigo: producto.codigo,
    productoDescripcion: producto.descripcion,
    unidadMedida: producto.unidadMedida,
    tipo,
    cantidad,
    almacen: 'Almacén principal',
    lote,
    fechaVencimiento: '2027-12-31',
    fechaOperacion: '2026-08-19',
    fechaRegistro: '2026-08-19T15:00:00.000Z',
    motivo: 'Prueba',
  }
}

describe('inventario', () => {
  it('calcula la cantidad física disponible para ajustes descontando reservas', () => {
    expect(cantidadFisicaNoReservada(8, 3)).toBe(5)
    expect(cantidadFisicaNoReservada(8, 8)).toBe(0)
    expect(cantidadFisicaNoReservada(4, 7)).toBe(0)
  })

  it('permite omitir el documento externo y normaliza su referencia cuando existe', () => {
    expect(esquemaDatosMovimientoInventario.safeParse({ ...datosBase, documentoReferencia: undefined }).success).toBe(true)
    expect(esquemaDatosMovimientoInventario.safeParse({ ...datosBase, documentoReferencia: 'x'.repeat(121) }).success).toBe(false)
    expect(esquemaDatosMovimientoInventario.parse({ ...datosBase, documentoReferencia: ' ACTA-001 ' }).documentoReferencia).toBe('ACTA-001')
  })

  it('exige costo para valorar las entradas manuales', () => {
    expect(esquemaDatosMovimientoInventario.safeParse({ ...datosBase, costoUnitario: '' }).success).toBe(false)
    expect(esquemaDatosMovimientoInventario.safeParse({ ...datosBase, costoUnitario: '12.5000' }).success).toBe(true)
  })

  it('limita los motivos del aumento de stock a diferencias positivas u otro', () => {
    const ajuste = {
      productoId: producto.id,
      tipoAjuste: 'ajuste-positivo',
      almacenId: 'almacen-1',
      bucketKey: '',
      ubicacionId: 'ubicacion-1',
      estadoStock: 'available',
      lote: 'LOTE-1',
      fechaVencimiento: '2027-12-31',
      costoUnitario: '12.5',
      cantidad: '1',
      motivoAjuste: 'expired',
      observacion: '',
    } as const

    expect(esquemaFormularioAjusteStock.safeParse(ajuste).success).toBe(false)
    expect(esquemaFormularioAjusteStock.safeParse({
      ...ajuste,
      motivoAjuste: 'physical_count_difference',
    }).success).toBe(true)
    expect(esquemaFormularioAjusteStock.safeParse({
      ...ajuste,
      motivoAjuste: 'internal_use',
    }).success).toBe(false)
  })

  it('guarda el motivo del ajuste en lenguaje claro dentro del límite del Kardex', () => {
    const motivo = crearMotivoAjusteStock('physical_count_difference', 'x'.repeat(120))
    expect(motivo).toContain('Diferencia de inventario físico')
    expect(motivo).not.toContain('physical_count_difference')
    expect(motivo.length).toBeLessThanOrEqual(180)
  })

  it('convierte entradas y salidas en variaciones con signo', () => {
    expect(obtenerVariacion({ tipo: 'entrada', cantidad: 5 })).toBe(5)
    expect(obtenerVariacion({ tipo: 'ajuste-positivo', cantidad: 2 })).toBe(2)
    expect(obtenerVariacion({ tipo: 'salida', cantidad: 3 })).toBe(-3)
    expect(obtenerVariacion({ tipo: 'ajuste-negativo', cantidad: 1 })).toBe(-1)
  })

  it('calcula stock, almacenes y lotes desde el historial', () => {
    const movimientos = [
      movimiento('entrada', 10),
      movimiento('salida', 4),
      movimiento('entrada', 3, 'L-002'),
    ]
    const existencias = calcularExistencias([producto], movimientos)

    expect(existencias[0]).toMatchObject({
      stock: 9,
      almacenes: 1,
      lotesConStock: 2,
    })
    expect(resumirInventario(existencias, movimientos)).toEqual({
      productos: 1,
      productosConStock: 1,
      productosSinStock: 0,
      stockTotal: 9,
      movimientos: 3,
    })
  })

  it('usa el resumen SQL para mostrar fisico, reservado y asignable', () => {
    const existencias = calcularExistenciasDesdeResumen(
      [producto],
      [{
        productoId: producto.id,
        almacenId: 'almacen-1',
        stockFisico: 10,
        stockDisponibleSanitario: 10,
        stockReservado: 4,
        stockAsignable: 6,
        stockCuarentena: 0,
        stockDanado: 0,
        stockVencido: 0,
        valorInventario: 50,
        bucketsConStock: 2,
        lotesConStock: 2,
      }],
      [movimiento('entrada', 10)],
    )

    expect(existencias[0]).toMatchObject({
      stock: 6,
      stockFisico: 10,
      stockReservado: 4,
      almacenes: 1,
      lotesConStock: 2,
    })
  })

  it('calcula el saldo por almacén y lote cuando corresponde', () => {
    const movimientos = [
      movimiento('entrada', 10),
      movimiento('salida', 4),
      movimiento('entrada', 8, 'L-002'),
    ]

    expect(
      calcularSaldoDisponible(
        movimientos,
        producto,
        'ALMACÉN PRINCIPAL',
        'l-001',
      ),
    ).toBe(6)
  })

  it('impide lotes faltantes y salidas que produzcan stock negativo', () => {
    expect(
      validarMovimientoInventario(
        { ...datosBase, lote: '' },
        producto,
        [],
      ),
    ).toMatch(/lote/i)
    expect(
      validarMovimientoInventario(
        { ...datosBase, tipo: 'salida', cantidad: '11' },
        producto,
        [movimiento('entrada', 10)],
      ),
    ).toMatch(/stock disponible/i)
  })

  it('impide entradas que superen el stock máximo global', () => {
    expect(
      validarMovimientoInventario(
        { ...datosBase, cantidad: '3', lote: 'L-002' },
        producto,
        [movimiento('entrada', 10)],
      ),
    ).toContain('stock máximo')

    expect(
      validarMovimientoInventario(
        { ...datosBase, cantidad: '2', lote: 'L-002' },
        producto,
        [movimiento('entrada', 10)],
      ),
    ).toBeUndefined()
  })

  it('crea un movimiento con instantánea del producto', () => {
    const creado = crearMovimientoInventario(
      datosBase,
      producto,
      new Date('2026-08-19T16:00:00.000Z'),
    )

    expect(creado).toMatchObject({
      productoCodigo: 'MED-001',
      productoDescripcion: 'Paracetamol 500 mg',
      cantidad: 10,
      fechaRegistro: '2026-08-19T16:00:00.000Z',
    })
  })

})
