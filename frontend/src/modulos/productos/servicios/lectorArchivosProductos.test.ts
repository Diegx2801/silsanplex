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
  fila: string[] = [],
  nombreHoja = 'data',
) {
  return crearArchivoConFilas(
    nombre,
    encabezados,
    fila.length ? [fila] : [],
    nombreHoja,
  )
}

function crearArchivoConFilas(
  nombre: string,
  encabezados: string[],
  filas: string[][],
  nombreHoja = 'data',
) {
  const libro = utils.book_new()
  const hoja = utils.aoa_to_sheet([encabezados, ...filas])
  utils.book_append_sheet(libro, hoja, nombreHoja)
  const contenido = write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

  return {
    name: nombre,
    size: contenido.byteLength,
    arrayBuffer: async () => contenido,
  } as File
}

function filasProductos(cantidad: number) {
  return Array.from({ length: cantidad }, (_, indice) => {
    const codigo = `P-${String(indice + 1).padStart(5, '0')}`
    return [codigo, `Producto ${indice + 1}`, 'Línea', 'SubLínea', 'Marca']
  })
}

function filasPrecios(cantidad: number, productos = 1) {
  return Array.from({ length: cantidad }, (_, indice) => {
    const numeroProducto = (indice % productos) + 1
    const codigo = `P-${String(numeroProducto).padStart(5, '0')}`
    return [codigo, `Producto ${numeroProducto}`, 'UNIDAD', '10', 'Si']
  })
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

  it('permite una hoja de precios sin filas para importar productos sin precio', async () => {
    const resultado = await analizarArchivosProductos(
      archivoProductosValido(),
      crearArchivo('Precios.xlsx', encabezadosPrecios),
    )

    expect(resultado.tieneBloqueos).toBe(false)
    expect(resultado.datos.precios).toHaveLength(0)
    expect(resultado.datos.productos).toHaveLength(1)
    expect(resultado.hallazgos).toContainEqual(
      expect.objectContaining({ id: 'productos-sin-precio', nivel: 'advertencia' }),
    )
  })

  it('lee las columnas extendidas cuando están presentes', async () => {
    const productos = crearArchivo(
      'Productos.xlsx',
      [...encabezadosProductos, 'DescripcionAmpliada', 'StockMaximo', 'ControlLote', 'ControlVencimiento', 'ControlSerie'],
      ['0001', 'Producto uno', 'Línea', 'SubLínea', 'Marca', 'Detalle técnico', '100', 'Sí', 'No', 'Sí'],
    )
    const precios = crearArchivo(
      'Precios.xlsx',
      [...encabezadosPrecios, 'CostoBase', 'PrecioMinimo'],
      ['0001', 'Producto uno', 'UNIDAD', '10', 'Si', '7.50', '8.00'],
    )

    const resultado = await analizarArchivosProductos(productos, precios)

    expect(resultado.datos.productos[0]).toMatchObject({
      descripcionAmpliada: 'Detalle técnico',
      stockMaximo: '100',
      controlLote: true,
      controlVencimiento: false,
      serialControl: true,
    })
    expect(resultado.datos.precios[0]).toMatchObject({
      costoBase: '7.50',
      precioMinimo: '8.00',
    })
  })

  it('permite exactamente 1000 filas de productos', async () => {
    const resultado = await analizarArchivosProductos(
      crearArchivoConFilas('Productos.xlsx', encabezadosProductos, filasProductos(1000)),
      crearArchivo('Precios.xlsx', encabezadosPrecios),
    )

    expect(resultado.resumen.productos).toBe(1000)
  })

  it('rechaza 1001 filas de productos', async () => {
    await expect(
      analizarArchivosProductos(
        crearArchivoConFilas('Productos.xlsx', encabezadosProductos, filasProductos(1001)),
        crearArchivo('Precios.xlsx', encabezadosPrecios),
      ),
    ).rejects.toThrow('máximo 1000 filas de productos. Se recibieron 1001')
  })

  it('permite exactamente 3000 filas de precios', async () => {
    const resultado = await analizarArchivosProductos(
      crearArchivoConFilas('Productos.xlsx', encabezadosProductos, filasProductos(1)),
      crearArchivoConFilas('Precios.xlsx', encabezadosPrecios, filasPrecios(3000)),
    )

    expect(resultado.resumen.precios).toBe(3000)
  })

  it('rechaza 3001 filas de precios', async () => {
    await expect(
      analizarArchivosProductos(
        crearArchivoConFilas('Productos.xlsx', encabezadosProductos, filasProductos(1)),
        crearArchivoConFilas('Precios.xlsx', encabezadosPrecios, filasPrecios(3001)),
      ),
    ).rejects.toThrow('máximo 3000 filas de precios. Se recibieron 3001')
  })

  it('permite exactamente 4000 filas totales', async () => {
    const resultado = await analizarArchivosProductos(
      crearArchivoConFilas('Productos.xlsx', encabezadosProductos, filasProductos(1000)),
      crearArchivoConFilas('Precios.xlsx', encabezadosPrecios, filasPrecios(3000, 1000)),
    )

    expect(resultado.resumen).toMatchObject({ productos: 1000, precios: 3000 })
  })

  it('prioriza el límite total para un XLSX comprimido con 4001 filas', async () => {
    await expect(
      analizarArchivosProductos(
        crearArchivoConFilas('Productos.xlsx', encabezadosProductos, filasProductos(1001)),
        crearArchivoConFilas('Precios.xlsx', encabezadosPrecios, filasPrecios(3000, 1000)),
      ),
    ).rejects.toThrow('máximo 4000 filas en total. Se recibieron 4001')
  })
})
