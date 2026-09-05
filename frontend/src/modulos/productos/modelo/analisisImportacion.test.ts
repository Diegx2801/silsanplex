import { describe, expect, it } from 'vitest'

import { analizarFilasImportacion } from './analisisImportacion'

describe('analizarFilasImportacion', () => {
  it('conserva varias unidades comerciales del mismo producto', () => {
    const resultado = analizarFilasImportacion(
      [{ Codigo: 'SKU-1', Producto: 'Producto uno', Linea: '', SubLinea: '', Marca_Laboratorio: '' }],
      [
        { CodigoProducto: 'SKU-1', Producto: 'Producto uno', Medida: 'Unidad', Precio_venta: '2', IncIGV: 'Sí', Equivalencia: '1' },
        { CodigoProducto: 'SKU-1', Producto: 'Producto uno', Medida: 'Caja', Precio_venta: '20', IncIGV: 'Sí', Equivalencia: '10' },
      ],
    )

    expect(resultado.hallazgos.some((hallazgo) => hallazgo.id === 'precios-conflictivos')).toBe(false)
    expect(resultado.datos.precios).toHaveLength(2)
  })

  it('rechaza solo la unidad que tiene precios incompatibles', () => {
    const resultado = analizarFilasImportacion(
      [{ Codigo: 'SKU-1', Producto: 'Producto uno' }],
      [
        { CodigoProducto: 'SKU-1', Medida: 'Unidad', Precio_venta: '2', IncIGV: 'Sí' },
        { CodigoProducto: 'SKU-1', Medida: 'Caja', Precio_venta: '20', IncIGV: 'Sí', Equivalencia: '10' },
        { CodigoProducto: 'SKU-1', Medida: 'Caja', Precio_venta: '25', IncIGV: 'Sí', Equivalencia: '10' },
      ],
    )

    expect(resultado.filasObservadas.filter((fila) => fila.estado === 'rechazada'))
      .toEqual([
        expect.objectContaining({ fila: 3, codigo: 'SKU-1' }),
        expect.objectContaining({ fila: 4, codigo: 'SKU-1' }),
      ])
  })

  it('bloquea códigos que identifican productos distintos', () => {
    const resultado = analizarFilasImportacion(
      [
        { Codigo: '00353', Producto: 'Guantes' },
        { Codigo: '00353', Producto: 'Auto usado' },
      ],
      [{ CodigoProducto: '00353', Precio_venta: '10', Medida: 'UND' }],
    )

    expect(resultado.tieneBloqueos).toBe(true)
    expect(resultado.hallazgos).toContainEqual(
      expect.objectContaining({ id: 'codigos-ambiguos', cantidad: 1 }),
    )
  })

  it('detecta precios repetidos, precios en cero y unidades equivalentes', () => {
    const filaPrecio = {
      CodigoProducto: '0001',
      Producto: 'Producto uno',
      Medida: 'UND',
      Precio_venta: '0',
      CodigoBarra: '',
    }
    const resultado = analizarFilasImportacion(
      [{ Codigo: '0001', Producto: ' Producto uno ' }],
      [filaPrecio, filaPrecio, { ...filaPrecio, Medida: 'UNIDAD' }],
    )

    expect(resultado.resumen).toEqual(
      expect.objectContaining({ productos: 1, precios: 3, coincidencias: 1 }),
    )
    expect(resultado.hallazgos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'precios-duplicados', cantidad: 1 }),
        expect.objectContaining({ id: 'precios-en-cero', cantidad: 3 }),
        expect.objectContaining({ id: 'unidades-equivalentes', cantidad: 2 }),
        expect.objectContaining({ id: 'espacios-en-nombres', cantidad: 1 }),
      ]),
    )
  })

  it('informa códigos de precio sin producto y productos sin precio', () => {
    const resultado = analizarFilasImportacion(
      [
        { Codigo: 'A', Producto: 'Producto A' },
        { Codigo: 'B', Producto: 'Producto B' },
      ],
      [{ CodigoProducto: 'C', Precio_venta: '5', Medida: 'CAJA' }],
    )

    expect(resultado.tieneBloqueos).toBe(false)
    expect(resultado.hallazgos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'precios-sin-producto', cantidad: 1 }),
        expect.objectContaining({ id: 'productos-sin-precio', cantidad: 2 }),
      ]),
    )
  })

  it('mantiene sin bloqueo un catálogo completamente sin filas de precio', () => {
    const resultado = analizarFilasImportacion(
      [{ Codigo: 'SIN-PRECIO', Producto: 'Producto sin precio' }],
      [],
    )

    expect(resultado.tieneBloqueos).toBe(false)
    expect(resultado.datos.productos).toHaveLength(1)
    expect(resultado.datos.precios).toHaveLength(0)
    expect(resultado.filasObservadas).toContainEqual(
      expect.objectContaining({ tipoAviso: 'sin-precio', codigo: 'SIN-PRECIO' }),
    )
  })

  it('distingue mínimo sin precio efectivo y precio cero', () => {
    const resultado = analizarFilasImportacion(
      [{ Codigo: 'SKU-1', Producto: 'Producto uno' }],
      [
        { CodigoProducto: 'SKU-1', Medida: 'UND', Precio_venta: '', PrecioMinimo: '2' },
        { CodigoProducto: 'SKU-1', Medida: 'CAJA', Precio_venta: '0' },
      ],
    )

    expect(resultado.hallazgos).toContainEqual(
      expect.objectContaining({ id: 'minimos-sin-precio', nivel: 'advertencia' }),
    )
    expect(resultado.filasObservadas).toContainEqual(
      expect.objectContaining({ tipoAviso: 'minimo-sin-precio' }),
    )
    expect(resultado.hallazgos).toContainEqual(
      expect.objectContaining({ id: 'precios-en-cero', nivel: 'advertencia' }),
    )
    expect(resultado.filasObservadas).toContainEqual(
      expect.objectContaining({ tipoAviso: 'precio-cero' }),
    )
  })

  it('advierte que IncIGV no permite inferir la afectación tributaria', () => {
    const resultado = analizarFilasImportacion(
      [
        { Codigo: 'NO-IGV', Producto: 'Precio neto' },
        { Codigo: 'PEND-IGV', Producto: 'Precio pendiente' },
        { Codigo: 'EMPTY-IGV', Producto: 'Precio vacío' },
      ],
      [
        { CodigoProducto: 'NO-IGV', Medida: 'UND', Precio_venta: '10', IncIGV: ' No ' },
        { CodigoProducto: 'PEND-IGV', Medida: 'UND', Precio_venta: '11', IncIGV: 'Pendiente' },
        { CodigoProducto: 'EMPTY-IGV', Medida: 'UND', Precio_venta: '12', IncIGV: '' },
      ],
    )

    expect(resultado.tieneBloqueos).toBe(false)
    expect(resultado.hallazgos).toContainEqual(
      expect.objectContaining({ id: 'inc-igv-ambiguo', nivel: 'advertencia', cantidad: 3 }),
    )
    expect(resultado.filasObservadas).toContainEqual(
      expect.objectContaining({ tipoAviso: 'inc-igv-ambiguo', codigo: 'NO-IGV' }),
    )
  })

  it('prepara una fila por código y expone duplicados y conflictos por fila', () => {
    const resultado = analizarFilasImportacion(
      [
        { Codigo: '0001', Producto: 'Producto uno' },
        { Codigo: '0001', Producto: 'Producto uno' },
        { Codigo: '0002', Producto: 'Producto dos' },
        { Codigo: '0002', Producto: 'Producto diferente' },
      ],
      [
        {
          CodigoProducto: '0001',
          Producto: 'Producto uno',
          Medida: 'UND',
          Precio_venta: '10,50',
          IncIGV: 'Si',
        },
        {
          CodigoProducto: '0001',
          Producto: 'Producto uno',
          Medida: 'UND',
          Precio_venta: '10,50',
          IncIGV: 'Si',
        },
      ],
    )

    expect(resultado.tieneBloqueos).toBe(false)
    expect(resultado.datos.productos).toHaveLength(1)
    expect(resultado.datos.precios[0]).toMatchObject({
      codigoProducto: '0001',
      precioVenta: '10.50',
      incIgv: 'Sí',
    })
    expect(resultado.filasObservadas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fila: 3, estado: 'duplicada' }),
        expect.objectContaining({ fila: 4, estado: 'rechazada' }),
      ]),
    )
  })

  it('bloquea valores de precio o IGV que la base no puede interpretar', () => {
    const resultado = analizarFilasImportacion(
      [{ Codigo: '0001', Producto: 'Producto uno' }],
      [
        {
          CodigoProducto: '0001',
          Medida: 'UND',
          Precio_venta: 'no disponible',
          IncIGV: 'desconocido',
        },
      ],
    )

    expect(resultado.hallazgos).toContainEqual(
      expect.objectContaining({ id: 'precios-invalidos', nivel: 'bloqueo' }),
    )
    expect(resultado.filasObservadas).toContainEqual(
      expect.objectContaining({ tipo: 'precio', estado: 'rechazada' }),
    )
  })

  it('bloquea campos que exceden las restricciones del catálogo', () => {
    const resultado = analizarFilasImportacion(
      [
        {
          Codigo: '0001',
          Producto: 'Producto uno',
          Linea: 'L'.repeat(81),
        },
      ],
      [
        {
          CodigoProducto: '0001',
          Medida: 'U'.repeat(41),
          Precio_venta: '1000000000000.00',
          IncIGV: 'Sí',
        },
      ],
    )

    expect(resultado.hallazgos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'productos-invalidos', nivel: 'bloqueo' }),
        expect.objectContaining({ id: 'precios-invalidos', nivel: 'bloqueo' }),
      ]),
    )
  })

  it('bloquea dimensiones, booleanos y precio mínimo extendidos inválidos', () => {
    const resultado = analizarFilasImportacion(
      [
        {
          Codigo: '0001',
          Producto: 'Producto uno',
          AnchoCm: '0',
          ControlLote: 'tal vez',
        },
      ],
      [
        {
          CodigoProducto: '0001',
          Medida: 'UND',
          Precio_venta: '10',
          PrecioMinimo: '11',
        },
      ],
    )

    expect(resultado.hallazgos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'productos-invalidos' }),
        expect.objectContaining({ id: 'precios-invalidos' }),
      ]),
    )
  })
})
