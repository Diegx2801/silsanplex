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

const columnasPrecios = [
  'CodigoProducto',
  'Producto',
  'Medida',
  'Precio_venta',
  'IncIGV',
]

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
  ): FilaImportacion[] {
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
    const faltantes = columnasEsperadas.filter(
      (columna) => !encabezados?.includes(columna),
    )

    if (faltantes.length) {
      throw new Error(
        `“${nombreArchivo}” no tiene el formato esperado. Faltan: ${faltantes.join(', ')}.`,
      )
    }

    return utils.sheet_to_json<FilaImportacion>(hoja, {
      raw: false,
      defval: '',
      blankrows: false,
    })
  }

  const productos = leerFilas(
    productosBuffer,
    archivoProductos.name,
    columnasProductos,
  )
  const precios = leerFilas(preciosBuffer, archivoPrecios.name, columnasPrecios)

  if (!productos.length || !precios.length) {
    throw new Error('Los dos archivos deben contener al menos una fila de datos.')
  }

  return analizarFilasImportacion(productos, precios)
}
