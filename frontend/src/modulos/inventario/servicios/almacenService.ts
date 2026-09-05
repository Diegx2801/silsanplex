import { supabase } from '@/lib/supabase'
import type {
  AlertaInventario,
  Almacen,
  ConsultaAlertasStock,
  ConsultaKardex,
  ConsultaStockDetallado,
  ConsultaTransferencias,
  ConsultaVencimientos,
  DatosAlmacen,
  DatosReclasificacion,
  DatosTransferencia,
  DatosUbicacion,
  MovimientoKardex,
  SaldoInventario,
  TransferenciaAlmacen,
  UbicacionAlmacen,
} from '@/modulos/inventario/modelo/almacen'
import {
  crearResultadoPaginado,
  normalizarBusquedaInventario,
  normalizarPaginacion,
} from '@/modulos/inventario/modelo/paginacionInventario'

function errorAlmacen(error: { code?: string; message?: string }) {
  const mensaje = error.message ?? ''
  if (mensaje.includes('INVENTORY_SERVICE_PRODUCT_FORBIDDEN')) return 'Los servicios no pueden transferirse ni administrarse como inventario.'
  if (mensaje.includes('INVENTORY_FEFO_INSUFFICIENT_STOCK')) return 'La cantidad supera el stock asignable disponible según FEFO.'
  if (mensaje.includes('INVENTORY_INSUFFICIENT_STOCK')) return 'La operacion supera el stock disponible del lote y ubicacion seleccionados.'
  if (mensaje.includes('INVENTORY_MAXIMUM_STOCK_EXCEEDED')) return 'La operación superaría el stock máximo configurado para el producto.'
  if (mensaje.includes('TRANSFER_WAREHOUSES_MUST_DIFFER')) return 'El almacen de destino debe ser diferente al de origen.'
  if (mensaje.includes('LOCATION_UNAVAILABLE')) return 'La ubicacion seleccionada no esta disponible.'
  if (mensaje.includes('INVENTORY_FORBIDDEN') || error.code === '42501') return 'No tienes permiso para administrar almacenes.'
  if (error.code === '23505') return 'El codigo o la referencia ya existe.'
  return 'No se pudo completar la operacion de almacen.'
}

export async function cargarMaestrosAlmacen(organizationId: string) {
  const [almacenes, ubicaciones] = await Promise.all([
    supabase.from('warehouses').select('id,code,name,address,is_active').eq('organization_id', organizationId).order('name'),
    supabase.from('warehouse_locations').select('id,warehouse_id,code,name,description,is_active').eq('organization_id', organizationId).order('name'),
  ])
  const fallo = [almacenes, ubicaciones].find((resultado) => resultado.error)
  if (fallo?.error) throw new Error(errorAlmacen(fallo.error))

  return {
    almacenes: (almacenes.data ?? []).map((fila) => ({
      id: fila.id, codigo: fila.code, nombre: fila.name, direccion: fila.address ?? '', activo: fila.is_active,
    })) as Almacen[],
    ubicaciones: (ubicaciones.data ?? []).map((fila) => ({
      id: fila.id, almacenId: fila.warehouse_id, codigo: fila.code, nombre: fila.name, descripcion: fila.description ?? '', activa: fila.is_active,
    })) as UbicacionAlmacen[],
  }
}

const columnasSaldo =
  'product_id,product_code,product_description,unit_of_measure,warehouse_id,warehouse_code,warehouse_name,location_id,location_code,location_name,stock_status,lot,expiration_date,quantity,inventory_value,average_cost' as const
const columnasVencimiento =
  'product_id,product_code,product_description,unit_of_measure,warehouse_id,warehouse_code,warehouse_name,location_id,location_code,location_name,stock_status,lot,expiration_date,physical_quantity,inventory_value,average_cost,expiration_alert_days,days_until_expiration,expiration_state' as const
const columnasKardex =
  'id,product_id,product_code,product_description,warehouse,warehouse_id,stock_status,lot,operation_date,created_at,reason,unit_cost,inbound_quantity,outbound_quantity,inbound_value,outbound_value,running_quantity,running_value,ledger_sequence' as const

function aplicarBusqueda<T extends { or: (filtro: string) => T }>(query: T, busqueda: string) {
  const termino = normalizarBusquedaInventario(busqueda)
  return termino
    ? query.or(`product_code.ilike.%${termino}%,product_description.ilike.%${termino}%`)
    : query
}

export async function listarStockDetallado(
  organizationId: string,
  consulta: ConsultaStockDetallado,
) {
  const { desde, hasta } = normalizarPaginacion(consulta)
  let query = aplicarBusqueda(
    supabase.from('inventory_balances').select(columnasSaldo, { count: 'exact' }).eq('organization_id', organizationId).neq('quantity', 0),
    consulta.busqueda,
  )
  if (consulta.almacenId) query = query.eq('warehouse_id', consulta.almacenId)
  if (consulta.ubicacionId) query = query.eq('location_id', consulta.ubicacionId)
  if (consulta.lote.trim()) query = query.ilike('lot', `%${normalizarBusquedaInventario(consulta.lote)}%`)
  if (consulta.estado) query = query.eq('stock_status', consulta.estado)
  if (consulta.vencimientoDesde) query = query.gte('expiration_date', consulta.vencimientoDesde)
  if (consulta.vencimientoHasta) query = query.lte('expiration_date', consulta.vencimientoHasta)

  if (consulta.orden === 'producto-asc') {
    query = query.order('product_description', { ascending: true })
  } else {
    query = query.order('expiration_date', {
      ascending: consulta.orden === 'vencimiento-asc',
      nullsFirst: false,
    })
  }
  const { data, error, count } = await query
    .order('product_id', { ascending: true })
    .order('warehouse_id', { ascending: true })
    .order('location_id', { ascending: true })
    .order('stock_status', { ascending: true })
    .order('lot', { ascending: true, nullsFirst: true })
    .range(desde, hasta)
  if (error) throw new Error(errorAlmacen(error))
  return crearResultadoPaginado((data ?? []).map(mapearSaldo), count, consulta)
}

export async function listarAlertasStock(
  organizationId: string,
  consulta: ConsultaAlertasStock,
) {
  const { desde, hasta } = normalizarPaginacion(consulta)
  let query = aplicarBusqueda(
    supabase.from('inventory_low_stock_alerts').select('*', { count: 'exact' }).eq('organization_id', organizationId).eq('has_low_stock_alert', true),
    consulta.busqueda,
  )
  if (consulta.almacenId) query = query.eq('warehouse_id', consulta.almacenId)
  query = consulta.orden === 'stock-asc'
    ? query.order('assignable_quantity', { ascending: true })
    : query.order('product_description', { ascending: true })
  const { data, error, count } = await query
    .order('product_id', { ascending: true })
    .order('warehouse_id', { ascending: true })
    .range(desde, hasta)
  if (error) throw new Error(errorAlmacen(error))
  const elementos = (data ?? []).map((fila) => ({
      productoId: fila.product_id,
      productoCodigo: fila.product_code,
      productoDescripcion: fila.product_description,
      unidadMedida: fila.unit_of_measure ?? '',
      almacenId: fila.warehouse_id,
      almacenCodigo: fila.warehouse_code,
      almacenNombre: fila.warehouse_name,
      ubicacionId: '',
      ubicacionCodigo: '',
      ubicacionNombre: '',
      estado: 'available' as const,
      lote: '',
      fechaVencimiento: '',
      cantidad: Number(fila.assignable_quantity),
      valorInventario: 0,
      costoPromedio: 0,
      stockMinimo: Number(fila.minimum_stock),
      diasAlertaVencimiento: 0,
      alertaStockMinimo: true,
      alertaVencimiento: false,
      diasParaVencer: null,
      estadoVencimiento: null,
  })) as AlertaInventario[]
  return crearResultadoPaginado(elementos, count, consulta)
}

export async function listarVencimientos(
  organizationId: string,
  consulta: ConsultaVencimientos,
) {
  const { desde, hasta } = normalizarPaginacion(consulta)
  let query = aplicarBusqueda(
    supabase.from('inventory_expiration_alerts').select(columnasVencimiento, { count: 'exact' }).eq('organization_id', organizationId),
    consulta.busqueda,
  )
  if (consulta.almacenId) query = query.eq('warehouse_id', consulta.almacenId)
  if (consulta.estadoVencimiento) query = query.eq('expiration_state', consulta.estadoVencimiento)
  if (consulta.fechaDesde) query = query.gte('expiration_date', consulta.fechaDesde)
  if (consulta.fechaHasta) query = query.lte('expiration_date', consulta.fechaHasta)
  const { data, error, count } = await query
    .order('expiration_date', { ascending: consulta.orden === 'vencimiento-asc' })
    .order('product_id', { ascending: true })
    .order('warehouse_id', { ascending: true })
    .order('location_id', { ascending: true })
    .order('stock_status', { ascending: true })
    .order('lot', { ascending: true, nullsFirst: true })
    .range(desde, hasta)
  if (error) throw new Error(errorAlmacen(error))
  const elementos = (data ?? []).map((fila) => ({
    ...mapearSaldoBucket(fila),
    stockMinimo: 0,
    diasAlertaVencimiento: Number(fila.expiration_alert_days),
    alertaStockMinimo: false,
    alertaVencimiento: true,
    diasParaVencer: Number(fila.days_until_expiration),
    estadoVencimiento: fila.expiration_state as AlertaInventario['estadoVencimiento'],
  })) as AlertaInventario[]
  return crearResultadoPaginado(elementos, count, consulta)
}

export async function listarKardex(
  organizationId: string,
  consulta: ConsultaKardex,
) {
  const { desde, hasta } = normalizarPaginacion(consulta)
  let query = aplicarBusqueda(
    supabase.from('inventory_kardex').select(columnasKardex, { count: 'exact' }).eq('organization_id', organizationId),
    consulta.busqueda,
  )
  if (consulta.almacenId) query = query.eq('warehouse_id', consulta.almacenId)
  if (consulta.fechaDesde) query = query.gte('operation_date', consulta.fechaDesde)
  if (consulta.fechaHasta) query = query.lte('operation_date', consulta.fechaHasta)
  const ascendente = consulta.orden === 'fecha-asc'
  const { data, error, count } = await query
    .order('operation_date', { ascending: ascendente })
    .order('ledger_sequence', { ascending: ascendente })
    .range(desde, hasta)
  if (error) throw new Error(errorAlmacen(error))
  const elementos = (data ?? []).map((fila) => ({
      id: fila.id,
      productoId: fila.product_id,
      productoCodigo: fila.product_code,
      productoDescripcion: fila.product_description,
      almacen: fila.warehouse,
      estado: fila.stock_status,
      lote: fila.lot ?? '',
      fechaOperacion: fila.operation_date,
      fechaRegistro: fila.created_at,
      motivo: fila.reason,
      costoUnitario: Number(fila.unit_cost),
      cantidadEntrada: Number(fila.inbound_quantity),
      cantidadSalida: Number(fila.outbound_quantity),
      valorEntrada: Number(fila.inbound_value),
      valorSalida: Number(fila.outbound_value),
      saldoCantidad: Number(fila.running_quantity),
      saldoValor: Number(fila.running_value),
      secuenciaLedger: Number(fila.ledger_sequence),
  })) as MovimientoKardex[]
  return crearResultadoPaginado(elementos, count, consulta)
}

export async function listarTransferencias(
  organizationId: string,
  consulta: ConsultaTransferencias,
) {
  const { desde, hasta } = normalizarPaginacion(consulta)
  let query = supabase
    .from('warehouse_transfers')
    .select('id,reference,source_warehouse_id,destination_warehouse_id,transferred_at,notes', { count: 'exact' })
    .eq('organization_id', organizationId)
  const busqueda = normalizarBusquedaInventario(consulta.busqueda)
  if (busqueda) query = query.or(`reference.ilike.%${busqueda}%,notes.ilike.%${busqueda}%`)
  if (consulta.almacenId) {
    query = query.or(`source_warehouse_id.eq.${consulta.almacenId},destination_warehouse_id.eq.${consulta.almacenId}`)
  }
  if (consulta.fechaDesde) query = query.gte('transferred_at', `${consulta.fechaDesde}T00:00:00`)
  if (consulta.fechaHasta) query = query.lte('transferred_at', `${consulta.fechaHasta}T23:59:59.999`)
  const ascendente = consulta.orden === 'fecha-asc'
  const { data, error, count } = await query
    .order('transferred_at', { ascending: ascendente })
    .order('id', { ascending: ascendente })
    .range(desde, hasta)
  if (error) throw new Error(errorAlmacen(error))
  const elementos = (data ?? []).map((fila) => ({
      id: fila.id,
      referencia: fila.reference,
      almacenOrigenId: fila.source_warehouse_id,
      almacenDestinoId: fila.destination_warehouse_id,
      fechaTransferencia: fila.transferred_at,
      notas: fila.notes ?? '',
  })) as TransferenciaAlmacen[]
  return crearResultadoPaginado(elementos, count, consulta)
}

function mapearSaldo(fila: Record<string, unknown>): SaldoInventario {
  return {
    productoId: String(fila.product_id),
    productoCodigo: String(fila.product_code),
    productoDescripcion: String(fila.product_description),
    unidadMedida: String(fila.unit_of_measure ?? ''),
    almacenId: String(fila.warehouse_id),
    almacenCodigo: String(fila.warehouse_code),
    almacenNombre: String(fila.warehouse_name),
    ubicacionId: String(fila.location_id),
    ubicacionCodigo: String(fila.location_code),
    ubicacionNombre: String(fila.location_name),
    estado: fila.stock_status as SaldoInventario['estado'],
    lote: String(fila.lot ?? ''),
    fechaVencimiento: String(fila.expiration_date ?? ''),
    cantidad: Number(fila.quantity),
    valorInventario: Number(fila.inventory_value),
    costoPromedio: Number(fila.average_cost),
  }
}

function mapearSaldoBucket(fila: Record<string, unknown>): SaldoInventario {
  return {
    ...mapearSaldo(fila),
    cantidad: Number(fila.physical_quantity),
  }
}

export async function crearAlmacen(organizationId: string, userId: string, datos: DatosAlmacen) {
  const { error } = await supabase.from('warehouses').insert({
    organization_id: organizationId,
    code: datos.codigo,
    name: datos.nombre,
    address: datos.direccion || null,
    created_by: userId,
    updated_by: userId,
  })
  if (error) throw new Error(errorAlmacen(error))
}

export async function crearUbicacion(organizationId: string, userId: string, datos: DatosUbicacion) {
  const { error } = await supabase.from('warehouse_locations').insert({
    organization_id: organizationId,
    warehouse_id: datos.almacenId,
    code: datos.codigo,
    name: datos.nombre,
    description: datos.descripcion || null,
    created_by: userId,
    updated_by: userId,
  })
  if (error) throw new Error(errorAlmacen(error))
}

export async function configurarAlertas(organizationId: string, userId: string, datos: {
  productoId: string
  almacenId: string
  ubicacionId: string
  stockMinimo: number
  diasVencimiento: number
}) {
  const { error } = await supabase.from('product_warehouse_settings').upsert({
    organization_id: organizationId,
    product_id: datos.productoId,
    warehouse_id: datos.almacenId,
    default_location_id: datos.ubicacionId,
    minimum_stock: datos.stockMinimo,
    expiration_alert_days: datos.diasVencimiento,
    updated_by: userId,
  })
  if (error) throw new Error(errorAlmacen(error))
}

export async function transferirInventario(organizationId: string, datos: DatosTransferencia) {
  const transferenciaFefo = datos.estado === 'available'
  const payload = transferenciaFefo ? {
    organization_id: organizationId,
    reference: datos.referencia,
    source_warehouse_id: datos.almacenOrigenId,
    destination_warehouse_id: datos.almacenDestinoId,
    destination_location_id: datos.ubicacionDestinoId,
    product_id: datos.productoId,
    quantity: datos.cantidad,
    notes: datos.notas,
  } : {
    organization_id: organizationId,
    reference: datos.referencia,
    source_warehouse_id: datos.almacenOrigenId,
    destination_warehouse_id: datos.almacenDestinoId,
    notes: datos.notas,
    items: [{
      product_id: datos.productoId,
      source_location_id: datos.ubicacionOrigenId,
      destination_location_id: datos.ubicacionDestinoId,
      quantity: datos.cantidad,
      lot: datos.lote,
      expiration_date: datos.fechaVencimiento,
      stock_status: datos.estado,
    }],
  }
  const { error } = await supabase.rpc(transferenciaFefo ? 'transfer_inventory_fefo' : 'transfer_inventory', { payload })
  if (error) throw new Error(errorAlmacen(error))
}

export async function reclasificarInventario(organizationId: string, datos: DatosReclasificacion) {
  const { error } = await supabase.rpc('reclassify_inventory', { payload: {
    organization_id: organizationId,
    product_id: datos.productoId,
    warehouse_id: datos.almacenId,
    location_id: datos.ubicacionId,
    source_status: datos.estadoOrigen,
    destination_status: datos.estadoDestino,
    quantity: datos.cantidad,
    lot: datos.lote,
    expiration_date: datos.fechaVencimiento,
    reason: datos.motivo,
  } })
  if (error) throw new Error(errorAlmacen(error))
}
