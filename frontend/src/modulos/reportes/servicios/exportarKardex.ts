import { utils, writeFile, type WorkBook } from 'xlsx'

import { etiquetasEstadoStock } from '@/modulos/inventario/modelo/almacen'
import type { MovimientoKardexReporte } from '@/modulos/reportes/modelo/reporteKardex'

const encabezados = [
  'Fecha de operación',
  'Fecha de registro',
  'Código',
  'Producto',
  'Unidad',
  'Almacén',
  'Ubicación',
  'Condición',
  'Lote',
  'Vencimiento',
  'Tipo de movimiento',
  'Documento de origen',
  'Motivo',
  'Entrada',
  'Salida',
  'Saldo anterior',
  'Saldo posterior',
  'Responsable',
] as const

function protegerTextoExcel(valor: string) {
  return /^[=+\-@]/.test(valor.trimStart()) ? `'${valor}` : valor
}

function nombreTipoMovimiento(tipo: MovimientoKardexReporte['tipo']) {
  switch (tipo) {
    case 'ajuste-positivo': return 'Ajuste positivo'
    case 'ajuste-negativo': return 'Ajuste negativo'
    case 'entrada': return 'Entrada'
    case 'salida': return 'Salida'
  }
}

function nombreOrigen(movimiento: MovimientoKardexReporte) {
  if (movimiento.documentoReferencia) return movimiento.documentoReferencia
  const etiquetas: Record<string, string> = {
    manual: 'Movimiento manual',
    'purchase-receipt': 'Recepción de compra',
    'warehouse-transfer': 'Transferencia de almacén',
    'stock-reclassification': 'Reclasificación de stock',
    'supplier-return': 'Devolución a proveedor',
    'repair-consumption': 'Consumo de reparación',
  }
  return etiquetas[movimiento.tipoOrigen] ?? 'Sin referencia registrada'
}

function fechaLocalIso(fecha: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(fecha)
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

export function crearNombreArchivoKardex(productoCodigo: string, fecha = new Date()) {
  const productoSeguro = productoCodigo
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'producto'
  return `kardex-${productoSeguro}-${fechaLocalIso(fecha)}.xlsx`
}

export function crearFilasKardex(movimientos: readonly MovimientoKardexReporte[]) {
  return movimientos.map((movimiento) => ({
    'Fecha de operación': movimiento.fechaOperacion,
    'Fecha de registro': movimiento.fechaRegistro,
    'Código': movimiento.productoCodigo,
    'Producto': movimiento.productoDescripcion,
    'Unidad': movimiento.unidadMedida,
    'Almacén': movimiento.almacen,
    'Ubicación': `${movimiento.ubicacionCodigo} · ${movimiento.ubicacionNombre}`,
    'Condición': etiquetasEstadoStock[movimiento.estado],
    'Lote': movimiento.lote,
    'Vencimiento': movimiento.fechaVencimiento ?? '',
    'Tipo de movimiento': nombreTipoMovimiento(movimiento.tipo),
    'Documento de origen': nombreOrigen(movimiento),
    'Motivo': movimiento.motivo,
    'Entrada': movimiento.entrada,
    'Salida': movimiento.salida,
    'Saldo anterior': movimiento.saldoAnterior,
    'Saldo posterior': movimiento.saldoPosterior,
    'Responsable': movimiento.responsable,
  }))
}

export function crearLibroKardex(
  movimientos: readonly MovimientoKardexReporte[],
  filtros: { productoCodigo: string; productoDescripcion: string; almacen: string; lote: string; fechaDesde: string; fechaHasta: string },
  fecha = new Date(),
): WorkBook {
  const filas = crearFilasKardex(movimientos).map((fila) =>
    Object.fromEntries(Object.entries(fila).map(([clave, valor]) => [
      clave,
      typeof valor === 'string' ? protegerTextoExcel(valor) : valor,
    ])),
  )
  const hojaDetalle = utils.json_to_sheet(filas, { header: [...encabezados] })
  hojaDetalle['!cols'] = [18, 24, 16, 34, 14, 22, 28, 18, 20, 16, 20, 30, 36, 14, 14, 16, 16, 28]
    .map((wch) => ({ wch }))
  hojaDetalle['!autofilter'] = { ref: `A1:R${Math.max(filas.length + 1, 1)}` }

  const fechaGeneracion = new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima',
  }).format(fecha)
  const hojaResumen = utils.aoa_to_sheet([
    ['Kardex de inventario · SILSANPLEX'],
    [],
    ['Producto', protegerTextoExcel(`${filtros.productoCodigo} · ${filtros.productoDescripcion}`)],
    ['Periodo', `${filtros.fechaDesde} al ${filtros.fechaHasta}`],
    ['Almacén', protegerTextoExcel(filtros.almacen || 'Todos')],
    ['Lote', protegerTextoExcel(filtros.lote || 'Todos')],
    ['Fecha de generación (hora Perú)', fechaGeneracion],
    ['Movimientos exportados', movimientos.length],
    ['Alcance', 'Detalle operativo filtrado; no incluye costos ni valorización.'],
  ])
  hojaResumen['!cols'] = [{ wch: 32 }, { wch: 72 }]

  const libro = utils.book_new()
  utils.book_append_sheet(libro, hojaDetalle, 'Kardex')
  utils.book_append_sheet(libro, hojaResumen, 'Resumen')
  libro.Props = {
    Title: 'Kardex de inventario',
    Subject: 'Exportación operativa autorizada de SILSANPLEX',
    Author: 'SILSANPLEX',
    CreatedDate: fecha,
  }
  return libro
}

export function descargarKardex(
  movimientos: readonly MovimientoKardexReporte[],
  filtros: Parameters<typeof crearLibroKardex>[1],
  fecha = new Date(),
) {
  if (!movimientos.length) throw new Error('No hay movimientos de Kardex para exportar.')
  writeFile(crearLibroKardex(movimientos, filtros, fecha), crearNombreArchivoKardex(filtros.productoCodigo, fecha), { compression: true })
}
