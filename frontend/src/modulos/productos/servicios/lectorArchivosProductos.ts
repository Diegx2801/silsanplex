import type {
  FilaImportacion,
  ResultadoImportacion,
} from '@/modulos/productos/modelo/analisisImportacion'
import { analizarFilasImportacion } from '@/modulos/productos/modelo/analisisImportacion'

const columnasProductos = [
  'Codigo',
  'Producto',
  'Linea',
  'SubLinea',
  'Marca_Laboratorio',
]

export const columnasOpcionalesProductos = [
  'DescripcionAmpliada',
  'CodigoBarras',
  'Presentacion',
  'RegistroSanitario',
  'StockMaximo',
  'AnchoCm',
  'AltoCm',
  'LargoCm',
  'PesoKg',
  'ControlLote',
  'ControlVencimiento',
  'ControlSerie',
  'VentaReceta',
  'AfectacionTributaria',
] as const

const columnasPrecios = [
  'CodigoProducto',
  'Producto',
  'Medida',
  'Precio_venta',
  'IncIGV',
]

const maximoProductos = 1000
const maximoPrecios = 3000
const maximoFilasTotales = 4000

export const columnasOpcionalesPrecios = ['CostoBase', 'PrecioMinimo', 'Equivalencia', 'CodigoBarra'] as const

function validarExtension(archivo: File) {
  if (!archivo.name.toLocaleLowerCase('es-PE').endsWith('.xlsx')) {
    throw new Error(`“${archivo.name}” no es un archivo .xlsx.`)
  }

  if (archivo.size > 5 * 1024 * 1024) {
    throw new Error(`“${archivo.name}” supera el límite de 5 MB.`)
  }
}

export async function analizarArchivosProductos(
  archivoProductos: File,
  archivoPrecios: File,
): Promise<ResultadoImportacion> {
  validarExtension(archivoProductos)
  validarExtension(archivoPrecios)

  const [{ read, utils }, productosBuffer, preciosBuffer] = await Promise.all([
    import('xlsx'),
    archivoProductos.arrayBuffer(),
    archivoPrecios.arrayBuffer(),
  ])

  function leerFilas(
    buffer: ArrayBuffer,
    nombreArchivo: string,
    columnasEsperadas: string[],
  ): { filas: FilaImportacion[]; encabezados: string[] } {
    const libro = read(buffer, { cellText: true })
    const nombreHoja = libro.SheetNames.find(
      (nombre) => nombre.toLocaleLowerCase('es-PE') === 'data',
    )

    if (!nombreHoja) {
      throw new Error(`“${nombreArchivo}” no contiene una hoja llamada “data”.`)
    }

    const hoja = libro.Sheets[nombreHoja]
    if (!hoja) {
      throw new Error(`No se pudo leer la hoja “data” de “${nombreArchivo}”.`)
    }

    const encabezados = utils.sheet_to_json<string[]>(hoja, {
      header: 1,
      range: 0,
      raw: false,
      defval: '',
      blankrows: false,
    })[0]
    const encabezadosNormalizados = encabezados ?? []
    const faltantes = columnasEsperadas.filter(
      (columna) => !encabezadosNormalizados.includes(columna),
    )

    if (faltantes.length) {
      throw new Error(
        `“${nombreArchivo}” no tiene el formato esperado. Faltan: ${faltantes.join(', ')}.`,
      )
    }

    return {
      filas: utils.sheet_to_json<FilaImportacion>(hoja, {
        raw: false,
        defval: '',
        blankrows: false,
      }),
      encabezados: encabezadosNormalizados,
    }
  }

  const productosLeidos = leerFilas(
    productosBuffer,
    archivoProductos.name,
    columnasProductos,
  )
  const preciosLeidos = leerFilas(preciosBuffer, archivoPrecios.name, columnasPrecios)
  const productos = productosLeidos.filas
  const precios = preciosLeidos.filas

  if (!productos.length) {
    throw new Error('El archivo de productos debe contener al menos una fila de datos.')
  }

  const filasTotales = productos.length + precios.length
  if (filasTotales > maximoFilasTotales) {
    throw new Error(
      `La importación admite como máximo ${maximoFilasTotales} filas en total. Se recibieron ${filasTotales}.`,
    )
  }
  if (productos.length > maximoProductos) {
    throw new Error(
      `La importación admite como máximo ${maximoProductos} filas de productos. Se recibieron ${productos.length}.`,
    )
  }
  if (precios.length > maximoPrecios) {
    throw new Error(
      `La importación admite como máximo ${maximoPrecios} filas de precios. Se recibieron ${precios.length}.`,
    )
  }

  return analizarFilasImportacion(productos, precios, {
    afectacionTributariaColumnaPresente: productosLeidos.encabezados.includes(
      'AfectacionTributaria',
    ),
  })
}
