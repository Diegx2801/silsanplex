import { utils, writeFile, type WorkBook } from 'xlsx'

import {
  resumirProductos,
  type Producto,
} from '@/modulos/productos/modelo/producto'

export interface FilaProductoExportada {
  SKU: string
  'Código de barras': string
  Producto: string
  Tipo: 'Producto físico' | 'Servicio'
  Línea: string
  Sublínea: string
  'Laboratorio o marca': string
  Presentación: string
  'Unidad de medida': string
  'Unidades alternativas': string
  AfectacionTributaria: string
  'Precio de venta final': number | ''
  'Precio mínimo final': number | ''
  'Registro sanitario': string
  'Control por lote': 'Sí' | 'No'
  'Control de vencimiento': 'Sí' | 'No'
  'Control por serie': 'Sí' | 'No'
  'Venta con receta': 'Sí' | 'No'
  Estado: 'Activo' | 'Inactivo'
}

const encabezados = [
  'SKU',
  'Código de barras',
  'Producto',
  'Tipo',
  'Línea',
  'Sublínea',
  'Laboratorio o marca',
  'Presentación',
  'Unidad de medida',
  'Unidades alternativas',
  'AfectacionTributaria',
  'Precio de venta final',
  'Precio mínimo final',
  'Registro sanitario',
  'Control por lote',
  'Control de vencimiento',
  'Control por serie',
  'Venta con receta',
  'Estado',
] satisfies (keyof FilaProductoExportada)[]

const anchosColumnas = [
  16, 20, 36, 18, 22, 18, 28, 26, 18, 36, 20, 22, 22, 19, 18, 22, 18, 18, 12,
].map((wch) => ({ wch }))

function afectacionTributariaCanonica(valor: Producto['afectacionIgv']) {
  return valor === 'gravado' || valor === 'exonerado' || valor === 'inafecto'
    ? valor
    : 'por-definir'
}

export function crearFilasProductos(
  productos: readonly Producto[],
): FilaProductoExportada[] {
  return productos.map((producto) => ({
    SKU: producto.codigo,
    'Código de barras': producto.codigoBarras,
    Producto: producto.descripcion,
    Tipo: producto.tipo === 'service' ? 'Servicio' : 'Producto físico',
    Línea: producto.categoria,
    Sublínea: producto.sublinea ?? '',
    'Laboratorio o marca': producto.laboratorio,
    Presentación: producto.presentacion,
    'Unidad de medida': producto.unidadMedida,
    'Unidades alternativas': producto.unidadesAlternativas
      .map((unidad) => `${unidad.unidadNombre || 'Unidad'} x ${unidad.equivalencia}`)
      .join('; '),
    AfectacionTributaria: afectacionTributariaCanonica(producto.afectacionIgv),
    'Precio de venta final': producto.precioVenta
      ? Number(producto.precioVenta)
      : '',
    'Precio mínimo final': producto.precioMinimo ? Number(producto.precioMinimo) : '',
    'Registro sanitario': producto.registroSanitario,
    'Control por lote': producto.controlLote ? 'Sí' : 'No',
    'Control de vencimiento': producto.controlVencimiento ? 'Sí' : 'No',
    'Control por serie': producto.serialControl ? 'Sí' : 'No',
    'Venta con receta': producto.ventaReceta ? 'Sí' : 'No',
    Estado: producto.activo ? 'Activo' : 'Inactivo',
  }))
}

function fechaLocalIso(fecha: Date) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')

  return `${anio}-${mes}-${dia}`
}

export function crearNombreArchivoCatalogo(fecha = new Date()) {
  return `catalogo-productos-${fechaLocalIso(fecha)}.xlsx`
}

export function crearLibroCatalogoProductos(
  productos: readonly Producto[],
  fecha = new Date(),
): WorkBook {
  const filas = crearFilasProductos(productos)
  const resumen = resumirProductos(productos)
  const hojaProductos = utils.json_to_sheet(filas, {
    header: [...encabezados],
  })
  const ultimaFila = Math.max(filas.length + 1, 1)

  hojaProductos['!cols'] = anchosColumnas
  hojaProductos['!autofilter'] = {
    ref: `A1:S${ultimaFila}`,
  }

  const hojaResumen = utils.aoa_to_sheet([
    ['Exportación del catálogo de productos'],
    [],
    ['Fecha de exportación', fecha.toLocaleString('es-PE')],
    ['Alcance', 'Productos que coincidían con los filtros aplicados'],
    ['Total exportado', resumen.total],
    ['Activos', resumen.activos],
    ['Inactivos', resumen.inactivos],
  ])
  hojaResumen['!cols'] = [{ wch: 24 }, { wch: 52 }]

  const libro = utils.book_new()
  utils.book_append_sheet(libro, hojaProductos, 'Productos')
  utils.book_append_sheet(libro, hojaResumen, 'Resumen')
  libro.Props = {
    Title: 'Catálogo de productos',
    Subject: 'Exportación filtrada del catálogo de SILSANPLEX',
    Author: 'SILSANPLEX',
    CreatedDate: fecha,
  }

  return libro
}

export function descargarCatalogoProductos(
  productos: readonly Producto[],
  fecha = new Date(),
) {
  if (!productos.length) {
    throw new Error('No hay productos para exportar.')
  }

  const libro = crearLibroCatalogoProductos(productos, fecha)
  writeFile(libro, crearNombreArchivoCatalogo(fecha), { compression: true })
}
