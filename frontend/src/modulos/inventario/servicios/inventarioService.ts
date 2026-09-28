import { supabase } from '@/lib/supabase'
import type {
  BucketAjusteStock,
  CandidatoFefo,
  ConsultaExistenciasInventario,
  ConsultaMovimientosInventario,
  DatosMovimientoInventario,
  ExistenciaInventario,
  MovimientoInventario,
  ResumenExistenciasInventario,
} from '@/modulos/inventario/modelo/inventario'
import type { EstadoStock } from '@/modulos/inventario/modelo/almacen'
import {
  crearResultadoPaginado,
  normalizarBusquedaInventario,
  normalizarPaginacion,
  type ResultadoPaginadoInventario,
} from '@/modulos/inventario/modelo/paginacionInventario'
import { leerRespuestaReadInventario } from '@/modulos/inventario/servicios/productoInventarioReadService'

interface MovimientoFila {
  id: string
  product_id: string
  product_code: string
  product_description: string
  unit_of_measure: string | null
  movement_type: MovimientoInventario['tipo']
  quantity: number
  warehouse: string
  warehouse_id: string
  location_id: string
  stock_status: MovimientoInventario['estadoStock']
  unit_cost: number
  lot: string | null
  expiration_date: string | null
  operation_date: string
  created_at: string
  reason: string
  document_reference: string | null
  created_by: string | null
  source_type: string | null
  source_id: string | null
}

const columnasMovimiento =
  'id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,warehouse,warehouse_id,location_id,stock_status,unit_cost,lot,expiration_date,operation_date,created_at,reason,document_reference,created_by,source_type,source_id' as const

interface ExistenciaFila {
  product_id: string
  product_code: string
  product_description: string
  laboratory: string | null
  unit_of_measure: string | null
  physical_quantity: number
  sanitary_available_quantity: number
  reserved_quantity: number
  assignable_quantity: number
  quarantine_quantity: number
  damaged_quantity: number
  expired_quantity: number
  inventory_value: number
  warehouse_count: number
  bucket_count: number
  lot_count: number
}

function mapearMovimiento(fila: MovimientoFila): MovimientoInventario {
  return {
    id: fila.id,
    productoId: fila.product_id,
    productoCodigo: fila.product_code,
    productoDescripcion: fila.product_description,
    unidadMedida: fila.unit_of_measure ?? '',
    tipo: fila.movement_type,
    cantidad: Number(fila.quantity),
    almacen: fila.warehouse,
    almacenId: fila.warehouse_id,
    ubicacionId: fila.location_id,
    estadoStock: fila.stock_status,
    costoUnitario: Number(fila.unit_cost),
    lote: fila.lot ?? '',
    fechaVencimiento: fila.expiration_date ?? '',
    fechaOperacion: fila.operation_date,
    fechaRegistro: fila.created_at,
    motivo: fila.reason,
    documentoReferencia: fila.document_reference ?? undefined,
    creadoPor: fila.created_by ?? undefined,
    fuenteTipo: fila.source_type ?? undefined,
    fuenteId: fila.source_id ?? undefined,
  }
}

function mensajeError(error: { code?: string; message?: string }) {
  if (error.message?.includes('INVENTORY_DOCUMENT_REFERENCE_INVALID')) return 'Ingresa un documento de sustento de hasta 120 caracteres'
  if (error.message?.includes('INVENTORY_REASON_INVALID')) return 'Describe el motivo del movimiento con entre 3 y 180 caracteres'
  if (error.message?.includes('INVENTORY_SERVICE_PRODUCT_FORBIDDEN')) return 'Los servicios no generan stock ni movimientos de inventario'
  if (error.message?.includes('INVENTORY_INSUFFICIENT_STOCK')) return 'La cantidad supera el stock disponible'
  if (error.message?.includes('INVENTORY_RESERVED_STOCK')) return 'La cantidad afectaría unidades reservadas por otro proceso'
  if (error.message?.includes('INVENTORY_WAREHOUSE_UNAVAILABLE')) return 'El almacén seleccionado ya no está activo o disponible'
  if (error.message?.includes('INVENTORY_LOCATION_UNAVAILABLE')) return 'La ubicación seleccionada ya no está activa o no pertenece al almacén'
  if (error.message?.includes('INVENTORY_BUCKET_UNAVAILABLE')) return 'El bucket seleccionado ya no está disponible'
  if (error.message?.includes('INVENTORY_FEFO_VIOLATION')) return 'Debes utilizar primero el lote con vencimiento más próximo'
  if (error.message?.includes('INVENTORY_EXPIRED_STOCK')) return 'El lote seleccionado está vencido y no puede despacharse'
  if (error.message?.includes('INVENTORY_MAXIMUM_STOCK_EXCEEDED')) return 'La entrada superaría el stock máximo configurado para el producto'
  if (error.message?.includes('INVENTORY_EXPIRATION_REQUIRED')) return 'El producto requiere fecha de vencimiento'
  if (error.message?.includes('INVENTORY_BATCH_REQUIRED')) return 'El producto requiere lote'
  if (error.message?.includes('INVENTORY_PRODUCT_UNAVAILABLE')) return 'El producto ya no está disponible o requiere lote'
  if (error.code === '42501' || error.message?.includes('INVENTORY_FORBIDDEN')) return 'No tienes permiso para registrar movimientos'
  return 'No se pudo registrar el movimiento de inventario'
}

export async function listarMovimientosInventario(
  organizationId: string,
  consulta: ConsultaMovimientosInventario,
): Promise<ResultadoPaginadoInventario<MovimientoInventario>> {
  const { desde, hasta } = normalizarPaginacion(consulta)
  let query = supabase
    .from('inventory_movements')
    .select(columnasMovimiento, { count: 'exact' })
    .eq('organization_id', organizationId)
  const busqueda = normalizarBusquedaInventario(consulta.busqueda)

  if (busqueda) {
    query = query.or(
      `product_code.ilike.%${busqueda}%,product_description.ilike.%${busqueda}%,lot.ilike.%${busqueda}%`,
    )
  }
  if (consulta.almacenId) query = query.eq('warehouse_id', consulta.almacenId)
  if (consulta.tipo) query = query.eq('movement_type', consulta.tipo)
  if (consulta.fechaDesde) query = query.gte('operation_date', consulta.fechaDesde)
  if (consulta.fechaHasta) query = query.lte('operation_date', consulta.fechaHasta)

  const ascendente = consulta.orden === 'fecha-asc'
  const { data, error, count } = await query
    .order('operation_date', { ascending: ascendente })
    .order('created_at', { ascending: ascendente })
    .order('id', { ascending: ascendente })
    .range(desde, hasta)

  if (error) throw new Error(mensajeError(error))
  return crearResultadoPaginado(
    ((data ?? []) as MovimientoFila[]).map(mapearMovimiento),
    count,
    consulta,
  )
}

export async function listarExistenciasInventario(
  organizationId: string,
  consulta: ConsultaExistenciasInventario,
): Promise<ResultadoPaginadoInventario<ExistenciaInventario>> {
  const { desde } = normalizarPaginacion(consulta)
  const busqueda = normalizarBusquedaInventario(consulta.busqueda)
  const { data, error } = await supabase.rpc('inventory_product_stock_summary_read', {
    requested_organization_id: organizationId,
    search_term: busqueda,
    requested_stock_filter: consulta.filtroStock,
    requested_sort: consulta.orden,
    requested_limit: consulta.tamanioPagina,
    requested_offset: desde,
  })
  if (error) throw new Error('No se pudieron consultar las existencias')

  const respuesta = leerRespuestaReadInventario<ExistenciaFila>(data)
  const elementos = respuesta.items.map((fila) => ({
    productoId: fila.product_id,
    productoCodigo: fila.product_code,
    productoDescripcion: fila.product_description,
    laboratorio: fila.laboratory ?? '',
    unidadMedida: fila.unit_of_measure ?? '',
    stockFisico: Number(fila.physical_quantity),
    stockDisponibleSanitario: Number(fila.sanitary_available_quantity),
    stockReservado: Number(fila.reserved_quantity),
    stockAsignable: Number(fila.assignable_quantity),
    stockCuarentena: Number(fila.quarantine_quantity),
    stockDanado: Number(fila.damaged_quantity),
    stockVencido: Number(fila.expired_quantity),
    valorInventario: Number(fila.inventory_value),
    almacenes: Number(fila.warehouse_count),
    bucketsConStock: Number(fila.bucket_count),
    lotesConStock: Number(fila.lot_count),
  }))

  return crearResultadoPaginado(elementos, respuesta.totalCount, consulta)
}

export async function contarResumenExistencias(
  organizationId: string,
): Promise<ResumenExistenciasInventario> {
  const consultarTotal = async (filtro: 'todos' | 'con-stock' | 'sin-stock') => {
    const { data, error } = await supabase.rpc('inventory_product_stock_summary_read', {
      requested_organization_id: organizationId,
      search_term: '',
      requested_stock_filter: filtro,
      requested_sort: 'producto-asc',
      requested_limit: 1,
      requested_offset: 0,
    })
    if (error) throw new Error('No se pudo consultar el resumen de existencias')
    return leerRespuestaReadInventario<ExistenciaFila>(data).totalCount
  }
  const [productos, productosConStock, productosSinStock] = await Promise.all([
    consultarTotal('todos'),
    consultarTotal('con-stock'),
    consultarTotal('sin-stock'),
  ])

  return {
    productos,
    productosConStock,
    productosSinStock,
  }
}

export async function listarCandidatosFefo(
  organizationId: string,
  productId: string,
  warehouseId: string,
) {
  const { data, error } = await supabase
    .from('inventory_fefo_candidates')
    .select('product_id,warehouse_id,location_id,location_code,location_name,lot,expiration_date,assignable_quantity,average_cost,fefo_rank')
    .eq('organization_id', organizationId)
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId)
    .order('fefo_rank')
  if (error) throw new Error('No se pudo consultar la selección FEFO')

  return (data ?? []).map((fila) => ({
    productoId: fila.product_id,
    almacenId: fila.warehouse_id,
    ubicacionId: fila.location_id,
    ubicacionCodigo: fila.location_code,
    ubicacionNombre: fila.location_name,
    lote: fila.lot ?? '',
    fechaVencimiento: fila.expiration_date ?? '',
    cantidadAsignable: Number(fila.assignable_quantity),
    costoPromedio: Number(fila.average_cost),
    ordenFefo: Number(fila.fefo_rank),
  })) as CandidatoFefo[]
}

interface BucketAjusteStockFila {
  product_id: string
  product_code: string
  product_description: string
  unit_of_measure: string | null
  warehouse_id: string
  warehouse_code: string
  warehouse_name: string
  location_id: string
  location_code: string
  location_name: string
  stock_status: EstadoStock
  lot: string | null
  expiration_date: string | null
  physical_quantity: number
  reserved_quantity: number
  average_cost: number
}

export async function listarBucketsAjusteStock(
  organizationId: string,
  productId: string,
  warehouseId: string,
) {
  const { data, error } = await supabase
    .from('inventory_bucket_availability')
    .select('product_id,product_code,product_description,unit_of_measure,warehouse_id,warehouse_code,warehouse_name,location_id,location_code,location_name,stock_status,lot,expiration_date,physical_quantity,reserved_quantity,average_cost')
    .eq('organization_id', organizationId)
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId)
    .gt('physical_quantity', 0)
    .order('location_code')
    .order('stock_status')
    .order('normalized_lot')
    .order('expiration_date')

  if (error) throw new Error('No se pudo consultar el stock por bucket')

  return ((data ?? []) as BucketAjusteStockFila[]).map((fila): BucketAjusteStock => ({
    productoId: fila.product_id,
    productoCodigo: fila.product_code,
    productoDescripcion: fila.product_description,
    unidadMedida: fila.unit_of_measure ?? '',
    almacenId: fila.warehouse_id,
    almacenCodigo: fila.warehouse_code,
    almacenNombre: fila.warehouse_name,
    ubicacionId: fila.location_id,
    ubicacionCodigo: fila.location_code,
    ubicacionNombre: fila.location_name,
    estadoStock: fila.stock_status,
    lote: fila.lot ?? '',
    fechaVencimiento: fila.expiration_date ?? '',
    cantidadFisica: Number(fila.physical_quantity),
    cantidadReservada: Number(fila.reserved_quantity),
    costoPromedio: Number(fila.average_cost),
  }))
}

export async function registrarMovimientoInventario(organizationId: string, datos: DatosMovimientoInventario) {
  const esSalidaFefo = datos.tipo === 'salida' && (datos.estadoStock ?? 'available') === 'available'
  const { error } = await supabase.rpc(esSalidaFefo ? 'record_inventory_fefo_outbound' : 'record_inventory_movement', {
    payload: {
      organization_id: organizationId,
      product_id: datos.productoId,
      movement_type: datos.tipo,
      quantity: datos.cantidad,
      warehouse: datos.almacen,
      warehouse_id: datos.almacenId,
      location_id: datos.ubicacionId,
      stock_status: datos.estadoStock ?? 'available',
      unit_cost: datos.costoUnitario ?? '0',
      lot: datos.lote,
      expiration_date: datos.fechaVencimiento,
      operation_date: datos.fechaOperacion,
      reason: datos.motivo,
      document_reference: datos.documentoReferencia,
    },
  })
  if (error) throw new Error(mensajeError(error))
}
