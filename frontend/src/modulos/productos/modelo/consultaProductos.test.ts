import { describe, expect, it } from 'vitest'

import { productoInicial, type Producto } from './producto'
import {
  consultarProductos,
  obtenerOpcionesProducto,
  paginarProductos,
  type ConsultaProductos,
} from './consultaProductos'

const productos = [
  {
    ...productoInicial,
    id: '1',
    codigo: 'PROD-10',
    codigoBarras: '7750000010',
    descripcion: 'Alcohol medicinal',
    categoria: 'Antisépticos',
    laboratorio: 'Laboratorio Norte',
    precioVenta: '8.50',
    activo: true,
  },
  {
    ...productoInicial,
    id: '2',
    codigo: 'PROD-2',
    descripcion: 'Guantes de examen',
    categoria: 'Descartables',
    laboratorio: 'Suministros Lima',
    precioVenta: '25.00',
    activo: false,
  },
  {
    ...productoInicial,
    id: '3',
    codigo: 'PROD-1',
    descripcion: 'Alcohol en gel',
    categoria: 'antisépticos',
    laboratorio: 'laboratorio norte',
    precioVenta: '',
    activo: true,
  },
] satisfies Producto[]

const consultaBase: ConsultaProductos = {
  busqueda: '',
  estado: 'todos',
  categoria: '',
  laboratorio: '',
  orden: 'codigo-asc',
}

describe('consultarProductos', () => {
  it('busca sin distinguir mayúsculas, acentos ni campos visibles', () => {
    const resultado = consultarProductos(productos, {
      ...consultaBase,
      busqueda: 'ÁLCOHOL',
    })

    expect(resultado.map((producto) => producto.id)).toEqual(['3', '1'])
  })

  it('combina estado, categoría y laboratorio', () => {
    const resultado = consultarProductos(productos, {
      ...consultaBase,
      estado: 'activos',
      categoria: 'Antisépticos',
      laboratorio: 'Laboratorio Norte',
    })

    expect(resultado).toHaveLength(2)
  })

  it('ordena códigos numéricamente y mantiene precios vacíos al final', () => {
    expect(
      consultarProductos(productos, consultaBase).map(
        (producto) => producto.codigo,
      ),
    ).toEqual(['PROD-1', 'PROD-2', 'PROD-10'])

    expect(
      consultarProductos(productos, {
        ...consultaBase,
        orden: 'precio-desc',
      }).map((producto) => producto.precioVenta),
    ).toEqual(['25.00', '8.50', ''])
  })

  it('no modifica el orden de la colección original', () => {
    consultarProductos(productos, {
      ...consultaBase,
      orden: 'descripcion-asc',
    })

    expect(productos.map((producto) => producto.id)).toEqual(['1', '2', '3'])
  })
})

describe('obtenerOpcionesProducto', () => {
  it('elimina duplicados sin distinguir mayúsculas y ordena las opciones', () => {
    expect(obtenerOpcionesProducto(productos, 'categoria')).toEqual([
      'Antisépticos',
      'Descartables',
    ])
  })
})

describe('paginarProductos', () => {
  it('calcula rangos y limita páginas fuera de rango', () => {
    expect(paginarProductos(productos, 2, 2)).toEqual({
      elementos: [productos[2]],
      inicio: 3,
      fin: 3,
      pagina: 2,
      totalPaginas: 2,
    })

    expect(paginarProductos(productos, 99, 2).pagina).toBe(2)
  })

  it('representa una colección vacía sin rangos ficticios', () => {
    expect(paginarProductos([], 1, 10)).toEqual({
      elementos: [],
      inicio: 0,
      fin: 0,
      pagina: 1,
      totalPaginas: 1,
    })
  })
})
