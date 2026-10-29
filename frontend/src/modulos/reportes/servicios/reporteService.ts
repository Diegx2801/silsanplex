import { supabase } from '@/lib/supabase'
import {
  TAMANIO_PAGINA_REPORTE,
  type ConsultaResumenMovimientos,
  type ResumenMovimientoInventario,
  type ResultadoResumenMovimientos,
} from '@/modulos/reportes/modelo/reporteMovimientos'

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}

function leerNumero(valor: unknown) {
  const numero = Number(valor)
  if (!Number.isFinite(numero)) throw new Error('El reporte devolvió una cantidad inválida.')
  return numero
}

function mapearFila(valor: unknown): ResumenMovimientoInventario {
  if (!esObjeto(valor)) throw new Error('El reporte devolvió una fila inválida.')

  const estado = valor.stock_status
  if (estado !== 'available' && estado !== 'quarantine' && estado !== 'damaged') {
    throw new Error('El reporte devolvió una condición de stock inválida.')
  }

  const texto = (campo: string) => {
    const dato = valor[campo]
    if (typeof dato !== 'string') throw new Error('El reporte devolvió datos de texto inválidos.')
    return dato
  }

  return {
    productoId: texto('product_id'),
    productoCodigo: texto('product_code'),
    productoDescripcion: texto('product_description'),
    unidadMedida: typeof valor.unit_of_measure === 'string' ? valor.unit_of_measure : '',
    almacenId: typeof valor.warehouse_id === 'string' ? valor.warehouse_id : null,
    almacen: texto('warehouse'),
    estado,
    entradas: leerNumero(valor.inbound_quantity),
    salidas: leerNumero(valor.outbound_quantity),
    variacionNeta: leerNumero(valor.net_quantity),
    cantidadMovimientos: leerNumero(valor.movement_count),
  }
}

export async function listarResumenMovimientos(
  organizationId: string,
  consulta: ConsultaResumenMovimientos,
): Promise<ResultadoResumenMovimientos> {
  const pagina = Number.isFinite(consulta.pagina) ? Math.max(1, Math.trunc(consulta.pagina)) : 1
  const offset = (pagina - 1) * TAMANIO_PAGINA_REPORTE
  const { data, error } = await supabase.rpc('inventory_movement_summary_read', {
    requested_organization_id: organizationId,
    requested_date_from: consulta.fechaDesde,
    requested_date_to: consulta.fechaHasta,
    search_term: consulta.busqueda.trim().slice(0, 100),
    requested_warehouse_id: consulta.almacenId || null,
    requested_limit: TAMANIO_PAGINA_REPORTE,
    requested_offset: offset,
  })

  if (error) {
    if (error.code === '42501') throw new Error('No tienes permiso para consultar reportes de inventario.')
    if (error.code === '22023') throw new Error('Revisa el periodo seleccionado e inténtalo nuevamente.')
    throw new Error('No se pudo cargar el resumen de movimientos.')
  }
  if (!esObjeto(data) || !Array.isArray(data.items)) {
    throw new Error('El reporte devolvió una respuesta inválida.')
  }

  const total = leerNumero(data.total_count)
  const totalMovimientos = leerNumero(data.total_movements)
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(totalMovimientos) || totalMovimientos < 0) {
    throw new Error('El reporte devolvió totales inválidos.')
  }
  const elementos = data.items.map(mapearFila)

  return {
    elementos,
    total,
    totalMovimientos,
    pagina,
    tamanioPagina: TAMANIO_PAGINA_REPORTE,
    totalPaginas: Math.max(1, Math.ceil(total / TAMANIO_PAGINA_REPORTE)),
  }
}
