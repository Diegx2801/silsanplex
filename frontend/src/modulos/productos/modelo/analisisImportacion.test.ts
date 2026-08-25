import { describe, expect, it } from 'vitest'

import { analizarFilasImportacion } from './analisisImportacion'

describe('analizarFilasImportacion', () => {
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

    expect(resultado.tieneBloqueos).toBe(true)
    expect(resultado.hallazgos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'precios-sin-producto', cantidad: 1 }),
        expect.objectContaining({ id: 'productos-sin-precio', cantidad: 2 }),
      ]),
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

    expect(resultado.tieneBloqueos).toBe(true)
    expect(resultado.datos.productos).toHaveLength(2)
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
