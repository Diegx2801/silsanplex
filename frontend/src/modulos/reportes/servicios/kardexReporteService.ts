import { supabase } from '@/lib/supabase'
import type { EstadoStock } from '@/modulos/inventario/modelo/almacen'
import {
  MAXIMO_FILAS_EXPORTACION_KARDEX,
  TAMANIO_PAGINA_KARDEX_REPORTE,
  type ConsultaKardexReporte,
  type MovimientoKardexReporte,
  type ResultadoKardexReporte,
  type TipoMovimientoKardex,
} from '@/modulos/reportes/modelo/reporteKardex'

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}

function leerTexto(valor: unknown, campo: string) {
  if (typeof valor !== 'string') throw new Error(`El Kardex devolvió un campo inválido: ${campo}.`)
  return valor
}

function leerCantidad(valor: unknown) {
  const cantidad = Number(valor)
  if (!Number.isFinite(cantidad)) throw new Error('El Kardex devolvió una cantidad inválida.')
  return cantidad
}

function mapearMovimiento(valor: unknown): MovimientoKardexReporte {
  if (!esObjeto(valor)) throw new Error('El Kardex devolvió una fila inválida.')
  const estado = valor.stock_status
  const tipo = valor.movement_type
  if (estado !== 'available' && estado !== 'quarantine' && estado !== 'damaged') {
    throw new Error('El Kardex devolvió una condición de stock inválida.')
  }
  if (tipo !== 'entrada' && tipo !== 'salida' && tipo !== 'ajuste-positivo' && tipo !== 'ajuste-negativo') {
    throw new Error('El Kardex devolvió un tipo de movimiento inválido.')
  }
  const vencimiento = valor.expiration_date
  if (vencimiento !== null && typeof vencimiento !== 'string') {
    throw new Error('El Kardex devolvió un vencimiento inválido.')
  }

  return {
    id: leerTexto(valor.id, 'id'),
    secuencia: leerCantidad(valor.ledger_sequence),
    fechaOperacion: leerTexto(valor.operation_date, 'operation_date'),
    fechaRegistro: leerTexto(valor.created_at, 'created_at'),
    productoId: leerTexto(valor.product_id, 'product_id'),
    productoCodigo: leerTexto(valor.product_code, 'product_code'),
    productoDescripcion: leerTexto(valor.product_description, 'product_description'),
    unidadMedida: leerTexto(valor.unit_of_measure, 'unit_of_measure'),
    almacenId: leerTexto(valor.warehouse_id, 'warehouse_id'),
    almacen: leerTexto(valor.warehouse, 'warehouse'),
    ubicacionCodigo: leerTexto(valor.location_code, 'location_code'),
    ubicacionNombre: leerTexto(valor.location_name, 'location_name'),
    estado: estado as EstadoStock,
    lote: leerTexto(valor.lot, 'lot'),
    fechaVencimiento: vencimiento,
    tipo: tipo as TipoMovimientoKardex,
    entrada: leerCantidad(valor.inbound_quantity),
    salida: leerCantidad(valor.outbound_quantity),
    saldoAnterior: leerCantidad(valor.opening_quantity),
    saldoPosterior: leerCantidad(valor.closing_quantity),
    documentoReferencia: leerTexto(valor.document_reference, 'document_reference'),
    tipoOrigen: leerTexto(valor.source_type, 'source_type'),
    motivo: leerTexto(valor.reason, 'reason'),
    responsable: leerTexto(valor.responsible, 'responsible'),
  }
}

function crearErrorKardex(error: { code?: string; message?: string }, exportando: boolean) {
  if (error.code === '42501') {
    return new Error(exportando
      ? 'No tienes permiso para exportar reportes de inventario.'
      : 'No tienes permiso para consultar el Kardex de inventario.')
  }
  if (error.code === '22023' && error.message?.includes('EXPORT_LIMIT_EXCEEDED')) {
    return new Error('El resultado supera el límite seguro de 10 000 movimientos. Reduce el periodo o filtra por almacén o lote.')
  }
  if (error.code === '22023') return new Error('Revisa los filtros del Kardex e inténtalo nuevamente.')
  return new Error(exportando ? 'No se pudo preparar la exportación del Kardex.' : 'No se pudo cargar el Kardex detallado.')
}

export async function listarKardexReporte(
  organizationId: string,
  consulta: ConsultaKardexReporte,
  exportando = false,
): Promise<ResultadoKardexReporte> {
  const pagina = Number.isFinite(consulta.pagina) ? Math.max(1, Math.trunc(consulta.pagina)) : 1
  const tamanioPagina = exportando ? MAXIMO_FILAS_EXPORTACION_KARDEX : TAMANIO_PAGINA_KARDEX_REPORTE
  const offset = exportando ? 0 : (pagina - 1) * tamanioPagina
  const { data, error } = await supabase.rpc('inventory_kardex_report_read', {
    requested_organization_id: organizationId,
    requested_product_id: consulta.productoId,
    requested_date_from: consulta.fechaDesde,
    requested_date_to: consulta.fechaHasta,
    requested_warehouse_id: consulta.almacenId || null,
    requested_lot: consulta.lote.trim().slice(0, 60),
    requested_limit: tamanioPagina,
    requested_offset: offset,
    requested_export: exportando,
  })

  if (error) throw crearErrorKardex(error, exportando)
  if (!esObjeto(data) || !Array.isArray(data.items)) throw new Error('El Kardex devolvió una respuesta inválida.')
  const total = Number(data.total_count)
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('El Kardex devolvió un total inválido.')
  const elementos = data.items.map(mapearMovimiento)
  if (exportando && elementos.length !== total) {
    throw new Error('La exportación no contiene todos los movimientos del filtro. Reduce el periodo y vuelve a intentarlo.')
  }

  return {
    elementos,
    total,
    pagina,
    tamanioPagina,
    totalPaginas: Math.max(1, Math.ceil(total / tamanioPagina)),
  }
}
