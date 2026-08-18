import { describe, expect, it } from 'vitest'

import { esquemaProducto, productoInicial } from './producto'

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
})
