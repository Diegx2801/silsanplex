import { describe, expect, it } from 'vitest'

import {
  esquemaProducto,
  productoInicial,
  resumirProductos,
  type Producto,
} from './producto'

describe('esquemaProducto', () => {
  const unidadBaseId = '11111111-1111-4111-8111-111111111111'
  it('acepta el registro mínimo y limpia espacios', () => {
    const resultado = esquemaProducto.parse({
      ...productoInicial,
      codigo: '  PROD-001  ',
      descripcion: '  Producto de prueba  ',
      unidadMedida: 'Unidad',
      unidadBaseId,
    })

    expect(resultado.codigo).toBe('PROD-001')
    expect(resultado.descripcion).toBe('Producto de prueba')
  })

  it('exige SKU, descripción y unidad de medida', () => {
    const resultado = esquemaProducto.safeParse(productoInicial)

    expect(resultado.success).toBe(false)
  })

  it('rechaza precios con más de dos decimales', () => {
    const resultado = esquemaProducto.safeParse({
      ...productoInicial,
      codigo: 'PROD-001',
      descripcion: 'Producto de prueba',
      unidadMedida: 'Unidad',
      unidadBaseId,
      precioVenta: '12.345',
    })

    expect(resultado.success).toBe(false)
  })

  it('rechaza importes negativos', () => {
    const resultado = esquemaProducto.safeParse({
      ...productoInicial,
      codigo: 'PROD-001',
      descripcion: 'Producto de prueba',
      unidadMedida: 'Unidad',
      unidadBaseId,
      costo: '-1',
      precioVenta: '-2',
    })

    expect(resultado.success).toBe(false)
  })

  it('rechaza un precio mínimo mayor al precio base', () => {
    const resultado = esquemaProducto.safeParse({
      ...productoInicial,
      codigo: 'PROD-001',
      descripcion: 'Producto de prueba',
      unidadMedida: 'Unidad',
      unidadBaseId,
      precioVenta: '10',
      precioMinimo: '11',
    })

    expect(resultado.success).toBe(false)
  })

  it('permite controlar lote y vencimiento de manera independiente', () => {
    const resultado = esquemaProducto.parse({
      ...productoInicial,
      codigo: 'PROD-001',
      descripcion: 'Producto de prueba',
      unidadMedida: 'Unidad',
      unidadBaseId,
      controlLote: false,
      controlVencimiento: true,
    })

    expect(resultado.controlLote).toBe(false)
    expect(resultado.controlVencimiento).toBe(true)
  })
})

describe('resumirProductos', () => {
  it('cuenta productos activos e inactivos sin alterar la colección', () => {
    const productos = [
      {
        ...productoInicial,
        id: '1',
        codigo: 'A',
        descripcion: 'Activo',
        activo: true,
      },
      {
        ...productoInicial,
        id: '2',
        codigo: 'B',
        descripcion: 'Inactivo',
        activo: false,
      },
      {
        ...productoInicial,
        id: '3',
        codigo: 'C',
        descripcion: 'Otro',
        activo: true,
      },
    ] satisfies Producto[]

    expect(resumirProductos(productos)).toEqual({
      total: 3,
      activos: 2,
      inactivos: 1,
    })
    expect(productos).toHaveLength(3)
  })
})
