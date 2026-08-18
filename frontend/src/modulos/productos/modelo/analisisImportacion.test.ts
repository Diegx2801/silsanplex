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
})
