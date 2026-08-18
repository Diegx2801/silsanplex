import { describe, expect, it } from 'vitest'
import { utils, write } from 'xlsx'

import { analizarArchivosProductos } from './lectorArchivosProductos'

const encabezadosProductos = [
  'Codigo',
  'Producto',
  'Linea',
  'SubLinea',
  'Marca_Laboratorio',
]
const encabezadosPrecios = [
  'CodigoProducto',
  'Producto',
  'Medida',
  'Precio_venta',
  'IncIGV',
]

function crearArchivo(
  nombre: string,
  encabezados: string[],
  fila: string[],
  nombreHoja = 'data',
) {
  const libro = utils.book_new()
  const hoja = utils.aoa_to_sheet([encabezados, fila])
  utils.book_append_sheet(libro, hoja, nombreHoja)
  const contenido = write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

  return {
    name: nombre,
    size: contenido.byteLength,
    arrayBuffer: async () => contenido,
  } as File
}

const archivoProductosValido = () =>
  crearArchivo(
    'Productos.xlsx',
    encabezadosProductos,
    ['0001', 'Producto uno', 'Línea', 'SubLínea', 'Marca'],
  )

const archivoPreciosValido = () =>
  crearArchivo(
    'Precios.xlsx',
    encabezadosPrecios,
    ['0001', 'Producto uno', 'UNIDAD', '10', 'Si'],
  )

describe('analizarArchivosProductos', () => {
  it('rechaza un libro sin la hoja data', async () => {
    const productos = crearArchivo(
      'Productos.xlsx',
      encabezadosProductos,
      ['0001', 'Producto uno', 'Línea', 'SubLínea', 'Marca'],
      'productos',
    )

    await expect(
      analizarArchivosProductos(productos, archivoPreciosValido()),
    ).rejects.toThrow('no contiene una hoja llamada “data”')
  })

  it('explica qué columnas obligatorias faltan', async () => {
    const precios = crearArchivo(
      'Precios.xlsx',
      ['CodigoProducto', 'Producto'],
      ['0001', 'Producto uno'],
    )

    await expect(
      analizarArchivosProductos(archivoProductosValido(), precios),
    ).rejects.toThrow('Faltan: Medida, Precio_venta, IncIGV')
  })

  it('rechaza archivos mayores al límite defensivo', async () => {
    const archivoGrande = {
      name: 'Productos.xlsx',
      size: 5 * 1024 * 1024 + 1,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as File

    await expect(
      analizarArchivosProductos(archivoGrande, archivoPreciosValido()),
    ).rejects.toThrow('supera el límite de 5 MB')
  })

  it('preserva códigos con ceros iniciales al relacionar productos y precios', async () => {
    const resultado = await analizarArchivosProductos(
      archivoProductosValido(),
      archivoPreciosValido(),
    )

    expect(resultado.resumen.codigosProducto).toBe(1)
    expect(resultado.resumen.codigosConPrecio).toBe(1)
    expect(resultado.resumen.coincidencias).toBe(1)
  })
})
