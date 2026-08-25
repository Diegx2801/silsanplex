import { utils, writeFile, type WorkBook } from 'xlsx'

import {
  afectacionesIgv,
  resumirProductos,
  type Producto,
} from '@/modulos/productos/modelo/producto'

export interface FilaProductoExportada {
  Código: string
  'Código de barras': string
  Producto: string
  'Descripción ampliada': string
  Categoría: string
  Sublínea: string
  'Laboratorio o marca': string
  Presentación: string
  'Unidad de medida': string
  'Afectación de IGV': string
  'Costo base': number | ''
  'Precio de venta base': number | ''
  'Precio mínimo': number | ''
  'Stock máximo': number | ''
  'Ancho (cm)': number | ''
  'Alto (cm)': number | ''
  'Largo (cm)': number | ''
  'Peso (kg)': number | ''
  'Registro sanitario': string
  'Control por lote': 'Sí' | 'No'
  'Control de vencimiento': 'Sí' | 'No'
  'Venta con receta': 'Sí' | 'No'
  Estado: 'Activo' | 'Inactivo'
}

const encabezados = [
  'Código',
  'Código de barras',
  'Producto',
  'Descripción ampliada',
  'Categoría',
  'Sublínea',
  'Laboratorio o marca',
  'Presentación',
  'Unidad de medida',
  'Afectación de IGV',
  'Costo base',
  'Precio de venta base',
  'Precio mínimo',
  'Stock máximo',
  'Ancho (cm)',
  'Alto (cm)',
  'Largo (cm)',
  'Peso (kg)',
  'Registro sanitario',
  'Control por lote',
  'Control de vencimiento',
  'Venta con receta',
  'Estado',
] satisfies (keyof FilaProductoExportada)[]

const anchosColumnas = [
  16, 20, 36, 46, 22, 18, 28, 26, 18, 16, 21, 22, 18, 18, 14, 14, 14,
  14, 19, 18, 22, 18, 12,
].map((wch) => ({ wch }))

function etiquetaAfectacionIgv(valor: Producto['afectacionIgv']) {
  return (
    afectacionesIgv.find((opcion) => opcion.valor === valor)?.etiqueta ??
    'Por definir'
  )
}

export function crearFilasProductos(
  productos: readonly Producto[],
): FilaProductoExportada[] {
  return productos.map((producto) => ({
    Código: producto.codigo,
    'Código de barras': producto.codigoBarras,
    Producto: producto.descripcion,
    'Descripción ampliada': producto.descripcionAmpliada,
    Categoría: producto.categoria,
    Sublínea: producto.sublinea ?? '',
    'Laboratorio o marca': producto.laboratorio,
    Presentación: producto.presentacion,
    'Unidad de medida': producto.unidadMedida,
    'Afectación de IGV': etiquetaAfectacionIgv(producto.afectacionIgv),
    'Costo base': producto.costo ? Number(producto.costo) : '',
    'Precio de venta base': producto.precioVenta
      ? Number(producto.precioVenta)
      : '',
    'Precio mínimo': producto.precioMinimo ? Number(producto.precioMinimo) : '',
    'Stock máximo': producto.stockMaximo ? Number(producto.stockMaximo) : '',
    'Ancho (cm)': producto.anchoCm ? Number(producto.anchoCm) : '',
    'Alto (cm)': producto.altoCm ? Number(producto.altoCm) : '',
    'Largo (cm)': producto.largoCm ? Number(producto.largoCm) : '',
    'Peso (kg)': producto.pesoKg ? Number(producto.pesoKg) : '',
    'Registro sanitario': producto.registroSanitario,
    'Control por lote': producto.controlLote ? 'Sí' : 'No',
    'Control de vencimiento': producto.controlVencimiento ? 'Sí' : 'No',
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
    ref: `A1:W${ultimaFila}`,
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
