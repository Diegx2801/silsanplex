import { describe, expect, it } from 'vitest'

import {
  esquemaProducto,
  productoInicial,
  resumirProductos,
  type Producto,
} from './producto'

describe('esquemaProducto', () => {
  it('acepta el registro mínimo y limpia espacios', () => {
    const resultado = esquemaProducto.parse({
      ...productoInicial,
      codigo: '  PROD-001  ',
      descripcion: '  Producto de prueba  ',
    })

    expect(resultado.codigo).toBe('PROD-001')
    expect(resultado.descripcion).toBe('Producto de prueba')
  })

  it('exige código y descripción', () => {
    const resultado = esquemaProducto.safeParse(productoInicial)

    expect(resultado.success).toBe(false)
  })

  it('rechaza precios con más de dos decimales', () => {
    const resultado = esquemaProducto.safeParse({
      ...productoInicial,
      codigo: 'PROD-001',
      descripcion: 'Producto de prueba',
      precioVenta: '12.345',
    })

    expect(resultado.success).toBe(false)
  })

  it('rechaza importes negativos', () => {
    const resultado = esquemaProducto.safeParse({
      ...productoInicial,
      codigo: 'PROD-001',
      descripcion: 'Producto de prueba',
      costo: '-1',
      precioVenta: '-2',
    })

    expect(resultado.success).toBe(false)
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
