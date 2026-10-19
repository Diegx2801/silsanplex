import { supabase } from '@/lib/supabase'
import { leerCapturaUnidadMovimiento } from '../modelo/capturaUnidadMovimiento'
import type {
  AlertaInventario,
  Almacen,
  ConsultaAlertasStock,
  ConsultaKardex,
  ConsultaStockDetallado,
  ConsultaTransferencias,
  ConsultaVencimientos,
  ConfiguracionAlertasStock,
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
import { leerRespuestaReadInventario } from '@/modulos/inventario/servicios/productoInventarioReadService'

function errorAlmacen(error: { code?: string; message?: string }) {
  const mensaje = error.message ?? ''
  if (mensaje.includes('INVENTORY_SERVICE_PRODUCT_FORBIDDEN')) return 'Los servicios no pueden transferirse ni administrarse como inventario.'
  if (mensaje.includes('INVENTORY_FEFO_INSUFFICIENT_STOCK')) return 'La cantidad supera el stock asignable disponible según FEFO.'
  if (mensaje.includes('INVENTORY_INSUFFICIENT_STOCK')) return 'La operación supera el stock disponible del lote y ubicación seleccionados.'
  if (mensaje.includes('INVENTORY_RESERVED_STOCK')) return 'La cantidad afectaría unidades reservadas. Reduce la cantidad al stock no reservado de la posición.'
  if (mensaje.includes('RECLASSIFICATION_OPERATION_CONFLICT')) return 'El intento anterior corresponde a otros datos. Revisa la reclasificación antes de confirmar nuevamente.'
  if (mensaje.includes('RECLASSIFICATION_REASON_INVALID')) return 'Describe el motivo de la reclasificación con entre 3 y 180 caracteres.'
  if (mensaje.includes('RECLASSIFICATION_UNIT_COST_INVALID')) return 'No se pudo verificar el costo de la posición. Revisa su valorización antes de cambiar la condición.'
  if (mensaje.includes('INVENTORY_MAXIMUM_STOCK_EXCEEDED')) return 'La operación superaría el stock máximo configurado para el producto.'
  if (mensaje.includes('TRANSFER_POSITION_MUST_DIFFER')) return 'Selecciona una ubicación de destino diferente a la de origen.'
  if (mensaje.includes('TRANSFER_WAREHOUSE_UNAVAILABLE')) return 'Uno de los almacenes ya no está activo. Actualiza la selección.'
  if (mensaje.includes('TRANSFER_LOCATION_UNAVAILABLE')) return 'Una ubicación ya no está activa o no pertenece al almacén seleccionado.'
  if (mensaje.includes('TRANSFER_SOURCE_POSITION_UNAVAILABLE')) return 'La posición de origen ya no tiene stock disponible. Actualiza la selección.'
  if (mensaje.includes('TRANSFER_INSUFFICIENT_STOCK')) return 'La cantidad supera el stock no reservado de la posición seleccionada.'
  if (mensaje.includes('TRANSFER_OPERATION_CONFLICT')) return 'El intento anterior corresponde a otros datos. Actualiza el formulario antes de volver a confirmar.'
  if (mensaje.includes('TRANSFER_OPERATION_KEY_REQUIRED')) return 'No se pudo identificar el intento de transferencia. Recarga el formulario antes de confirmar.'
  if (mensaje.includes('TRANSFER_DETAILS_INVALID')) return 'Revisa los datos de la transferencia.'
  if (mensaje.includes('INVENTORY_STATUS_INVALID')) return 'Selecciona una condición de stock válida.'
  if (mensaje.includes('TRANSFER_UNIT_COST_INVALID')) return 'No se pudo verificar el costo de la posición de origen. Revisa su valorización antes de transferir.'
  if (mensaje.includes('INVENTORY_PRODUCT_UNAVAILABLE')) return 'El producto ya no está disponible para esta operación.'
  if (mensaje.includes('INVENTORY_WAREHOUSE_UNAVAILABLE')) return 'El almacén ya no está activo. Vuelve a seleccionar una posición disponible.'
  if (mensaje.includes('INVENTORY_POSITION_UNIT_CONFLICT')) return 'Una posición conserva stock con una unidad base anterior. Es necesario conciliar ese saldo antes de continuar; no se convertirá automáticamente.'
  if (mensaje.includes('INVENTORY_INPUT_UNIT_STALE')) return 'La equivalencia de la unidad cambió. Vuelve a seleccionar la unidad y revisa la cantidad.'
  if (mensaje.includes('INVENTORY_INPUT_UNIT_INVALID')) return 'Selecciona una unidad de medida configurada para este producto.'
  if (mensaje.includes('INVENTORY_QUANTITY_INVALID') || mensaje.includes('INVENTORY_QUANTITY_CONVERSION_INVALID')) return 'Revisa la cantidad y su equivalencia: debe ser mayor a cero y admitir hasta 3 decimales en la unidad base.'
  if (mensaje.includes('LOCATION_UNAVAILABLE')) return 'La ubicación seleccionada no está disponible.'
  if (mensaje.includes('WAREHOUSE_OPERATION_KEY_REUSED')) return 'La operación ya fue utilizada con otros datos. Vuelve a intentarlo.'
  if (mensaje.includes('WAREHOUSE_CODE_DUPLICATE')) return 'Ya existe un almacén con ese código.'
  if (mensaje.includes('WAREHOUSE_LOCATION_CODE_DUPLICATE')) return 'Ya existe una ubicación con ese código en el almacén.'
  if (mensaje.includes('WAREHOUSE_CODE_INVALID')) return 'Revisa el código del almacén.'
  if (mensaje.includes('WAREHOUSE_LOCATION_CODE_INVALID')) return 'Revisa el código de la ubicación.'
  if (mensaje.includes('WAREHOUSE_NAME_INVALID')) return 'Revisa el nombre del almacén.'
  if (mensaje.includes('WAREHOUSE_LOCATION_NAME_INVALID')) return 'Revisa el nombre de la ubicación.'
  if (mensaje.includes('WAREHOUSE_STALE_WRITE') || mensaje.includes('WAREHOUSE_LOCATION_STALE_WRITE')) return 'El registro cambió mientras lo editabas. Recarga los datos e inténtalo nuevamente.'
  if (mensaje.includes('WAREHOUSE_ACTIVE_LOCATION_REQUIRED')) return 'El almacén necesita al menos una ubicación activa.'
  if (mensaje.includes('WAREHOUSE_HAS_STOCK')) return 'No puedes desactivar un almacén que todavía tiene stock.'
  if (mensaje.includes('WAREHOUSE_HAS_RESERVATIONS')) return 'No puedes desactivar un almacén con reservas activas.'
  if (mensaje.includes('WAREHOUSE_HAS_OPEN_PURCHASES')) return 'No puedes desactivar un almacén con compras pendientes.'
  if (mensaje.includes('WAREHOUSE_HAS_OPEN_ORDERS')) return 'No puedes desactivar un almacén con pedidos pendientes.'
  if (mensaje.includes('WAREHOUSE_LOCATION_LAST_ACTIVE')) return 'El almacén debe conservar al menos una ubicación activa.'
  if (mensaje.includes('WAREHOUSE_LOCATION_HAS_STOCK')) return 'No puedes desactivar una ubicación que todavía tiene stock.'
  if (mensaje.includes('WAREHOUSE_LOCATION_HAS_RESERVATIONS')) return 'No puedes desactivar una ubicación con reservas activas.'
  if (mensaje.includes('WAREHOUSE_LOCATION_IS_DEFAULT')) return 'Cambia primero la ubicación predeterminada de los productos.'
  if (mensaje.includes('INVENTORY_FORBIDDEN') || error.code === '42501') return 'No tienes permiso para administrar almacenes.'
  if (error.code === '23505') return 'El código o la referencia ya existe.'
  return 'No se pudo completar la operación de almacén.'
}

function versionMaestro(version: number | undefined) {
  if (!version || version < 1) {
    throw new Error('No se pudo verificar la versión del registro. Recarga los datos e inténtalo nuevamente.')
  }
  return version
}

export async function cargarMaestrosAlmacen(organizationId: string) {
  const [almacenes, ubicaciones] = await Promise.all([
    supabase.from('warehouses').select('id,code,name,address,is_active,lock_version').eq('organization_id', organizationId).order('name'),
    supabase.from('warehouse_locations').select('id,warehouse_id,code,name,description,is_active,lock_version').eq('organization_id', organizationId).order('name'),
  ])
  const fallo = [almacenes, ubicaciones].find((resultado) => resultado.error)
  if (fallo?.error) throw new Error(errorAlmacen(fallo.error))

  return {
    almacenes: (almacenes.data ?? []).map((fila) => ({
      id: fila.id, codigo: fila.code, nombre: fila.name, direccion: fila.address ?? '', activo: fila.is_active,
      version: Number(fila.lock_version),
    })) as Almacen[],
    ubicaciones: (ubicaciones.data ?? []).map((fila) => ({
      id: fila.id, almacenId: fila.warehouse_id, codigo: fila.code, nombre: fila.name, descripcion: fila.description ?? '', activa: fila.is_active,
      version: Number(fila.lock_version),
    })) as UbicacionAlmacen[],
  }
}

export async function buscarAlmacenesDisponibles(
  organizationId: string,
  busqueda: string,
  limite = 50,
): Promise<Almacen[]> {
  const termino = busqueda.trim().replace(/[\\%_(),*]/g, ' ').replace(/\s+/g, ' ').slice(0, 100)
  let query = supabase
    .from('warehouses')
    .select('id,code,name,address,is_active,warehouse_locations!inner(id)')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('warehouse_locations.is_active', true)
  if (termino) query = query.or(`code.ilike.%${termino}%,name.ilike.%${termino}%,address.ilike.%${termino}%`)
  query = query.order('name').limit(Math.min(Math.max(limite, 1), 50))
  const { data, error } = await query
  if (error) throw new Error(errorAlmacen(error))
  return (data ?? []).map((fila) => ({
    id: fila.id,
    codigo: fila.code,
    nombre: fila.name,
    direccion: fila.address ?? '',
    activo: fila.is_active,
  }))
}

const columnasVencimiento =
  'product_id,product_code,product_description,unit_of_measure,warehouse_id,warehouse_code,warehouse_name,location_id,location_code,location_name,stock_status,lot,expiration_date,physical_quantity,inventory_value,average_cost,expiration_alert_days,days_until_expiration,expiration_state' as const
const columnasKardex =
  'id,product_id,product_code,product_description,unit_of_measure,warehouse,warehouse_id,stock_status,lot,operation_date,created_at,reason,document_reference,unit_cost,inbound_quantity,outbound_quantity,inbound_value,outbound_value,running_quantity,running_value,ledger_sequence,entered_quantity,entered_unit_of_measure,unit_conversion_factor' as const

function aplicarBusqueda<T extends { or: (filtro: string) => T }>(
  query: T,
  busqueda: string,
  incluirReferencia = false,
) {
  const termino = normalizarBusquedaInventario(busqueda)
  return termino
    ? query.or(incluirReferencia
      ? `product_code.ilike.%${termino}%,product_description.ilike.%${termino}%,lot.ilike.%${termino}%,document_reference.ilike.%${termino}%`
      : `product_code.ilike.%${termino}%,product_description.ilike.%${termino}%`)
    : query
}

export async function listarStockDetallado(
  organizationId: string,
  consulta: ConsultaStockDetallado,
) {
  const { desde } = normalizarPaginacion(consulta)
  const { data, error } = await supabase.rpc('inventory_stock_detail_read', {
    requested_organization_id: organizationId,
    search_term: normalizarBusquedaInventario(consulta.busqueda),
    requested_warehouse_id: consulta.almacenId || null,
    requested_location_id: consulta.ubicacionId || null,
    requested_lot: normalizarBusquedaInventario(consulta.lote),
    requested_status: consulta.estado || null,
    expiration_from: consulta.vencimientoDesde || null,
    expiration_to: consulta.vencimientoHasta || null,
    requested_sort: consulta.orden,
    requested_limit: consulta.tamanioPagina,
    requested_offset: desde,
  })
  if (error) throw new Error(errorAlmacen(error))
  const respuesta = leerRespuestaReadInventario<Record<string, unknown>>(data)
  const elementos = respuesta.items.map((fila) => ({
    ...mapearSaldoBucket(fila),
    cantidadReservada: Number(fila.reserved_quantity),
    cantidadAsignable: Number(fila.assignable_quantity),
  }))
  return crearResultadoPaginado(elementos, respuesta.totalCount, consulta)
}

export async function listarAlertasStock(
  organizationId: string,
  consulta: ConsultaAlertasStock,
) {
  const { desde } = normalizarPaginacion(consulta)
  const { data, error } = await supabase.rpc('inventory_low_stock_alerts_read', {
    requested_organization_id: organizationId,
    search_term: normalizarBusquedaInventario(consulta.busqueda),
    requested_warehouse_id: consulta.almacenId || null,
    requested_sort: consulta.orden,
    requested_limit: consulta.tamanioPagina,
    requested_offset: desde,
  })
  if (error) throw new Error(errorAlmacen(error))
  const respuesta = leerRespuestaReadInventario<{
    product_id: string
    product_code: string
    product_description: string
    unit_of_measure: string | null
    warehouse_id: string
    warehouse_code: string
    warehouse_name: string
    assignable_quantity: number
    minimum_stock: number
  }>(data)
  const elementos = respuesta.items.map((fila) => ({
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
  return crearResultadoPaginado(elementos, respuesta.totalCount, consulta)
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
    true,
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
      ...leerCapturaUnidadMovimiento(fila),
      unidadMedida: fila.unit_of_measure ?? '',
      productoId: fila.product_id,
      productoCodigo: fila.product_code,
      productoDescripcion: fila.product_description,
      almacen: fila.warehouse,
      estado: fila.stock_status,
      lote: fila.lot ?? '',
      fechaOperacion: fila.operation_date,
      fechaRegistro: fila.created_at,
      motivo: fila.reason,
      documentoReferencia: fila.document_reference ?? undefined,
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
    .select('id,reference,source_warehouse_id,destination_warehouse_id,transferred_at,notes,warehouse_transfer_items(source_location_id,destination_location_id)', { count: 'exact' })
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
      ubicacionOrigenId: ubicacionUnica(fila.warehouse_transfer_items, 'source_location_id'),
      ubicacionDestinoId: ubicacionUnica(fila.warehouse_transfer_items, 'destination_location_id'),
      fechaTransferencia: fila.transferred_at,
      notas: fila.notes ?? '',
  })) as TransferenciaAlmacen[]
  return crearResultadoPaginado(elementos, count, consulta)
}

function ubicacionUnica(
  items: { source_location_id: string; destination_location_id: string }[] | null,
  campo: 'source_location_id' | 'destination_location_id',
): string | undefined {
  const ids = new Set((items ?? []).map((item) => item[campo]).filter(Boolean))
  return ids.size === 1 ? [...ids][0] : undefined
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

export async function crearAlmacen(
  organizationId: string,
  datos: DatosAlmacen,
  operationKey = crypto.randomUUID(),
) {
  const { error } = await supabase.rpc('save_warehouse', { payload: {
    organization_id: organizationId,
    operation_key: operationKey,
    code: datos.codigo,
    name: datos.nombre,
    address: datos.direccion,
  } })
  if (error) throw new Error(errorAlmacen(error))
}

export async function crearUbicacion(
  organizationId: string,
  datos: DatosUbicacion,
  operationKey = crypto.randomUUID(),
) {
  const { error } = await supabase.rpc('save_warehouse_location', { payload: {
    organization_id: organizationId,
    operation_key: operationKey,
    warehouse_id: datos.almacenId,
    code: datos.codigo,
    name: datos.nombre,
    description: datos.descripcion,
  } })
  if (error) throw new Error(errorAlmacen(error))
}

export async function editarAlmacen(
  organizationId: string,
  almacen: Almacen,
  datos: DatosAlmacen,
  operationKey = crypto.randomUUID(),
) {
  const { error } = await supabase.rpc('save_warehouse', { payload: {
    id: almacen.id,
    organization_id: organizationId,
    operation_key: operationKey,
    expected_lock_version: versionMaestro(almacen.version),
    code: almacen.codigo,
    name: datos.nombre,
    address: datos.direccion,
  } })
  if (error) throw new Error(errorAlmacen(error))
}

export async function editarUbicacion(
  organizationId: string,
  ubicacion: UbicacionAlmacen,
  datos: DatosUbicacion,
  operationKey = crypto.randomUUID(),
) {
  const { error } = await supabase.rpc('save_warehouse_location', { payload: {
    id: ubicacion.id,
    organization_id: organizationId,
    operation_key: operationKey,
    expected_lock_version: versionMaestro(ubicacion.version),
    warehouse_id: ubicacion.almacenId,
    code: ubicacion.codigo,
    name: datos.nombre,
    description: datos.descripcion,
  } })
  if (error) throw new Error(errorAlmacen(error))
}

export async function cambiarEstadoAlmacen(
  organizationId: string,
  almacen: Almacen,
  operationKey = crypto.randomUUID(),
) {
  const { error } = await supabase.rpc('set_warehouse_status', { payload: {
    id: almacen.id,
    organization_id: organizationId,
    operation_key: operationKey,
    expected_lock_version: versionMaestro(almacen.version),
    is_active: !almacen.activo,
  } })
  if (error) throw new Error(errorAlmacen(error))
}

export async function cambiarEstadoUbicacion(
  organizationId: string,
  ubicacion: UbicacionAlmacen,
  operationKey = crypto.randomUUID(),
) {
  const { error } = await supabase.rpc('set_warehouse_location_status', { payload: {
    id: ubicacion.id,
    organization_id: organizationId,
    operation_key: operationKey,
    expected_lock_version: versionMaestro(ubicacion.version),
    is_active: !ubicacion.activa,
  } })
  if (error) throw new Error(errorAlmacen(error))
}

export async function obtenerConfiguracionAlertasStock(
  organizationId: string,
  productId: string,
  warehouseId: string,
): Promise<ConfiguracionAlertasStock | null> {
  const { data, error } = await supabase
    .from('product_warehouse_settings')
    .select('default_location_id,minimum_stock,expiration_alert_days')
    .eq('organization_id', organizationId)
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId)
    .maybeSingle()

  if (error) throw new Error(errorAlmacen(error))
  if (!data) return null

  return {
    ubicacionId: data.default_location_id,
    stockMinimo: Number(data.minimum_stock),
    diasVencimiento: Number(data.expiration_alert_days),
  }
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

export async function transferirInventario(
  organizationId: string,
  datos: DatosTransferencia,
  operationKey: string = crypto.randomUUID(),
) {
  const { error } = await supabase.rpc('transfer_inventory_position', { payload: {
    organization_id: organizationId,
    operation_key: operationKey,
    product_id: datos.productoId,
    source_warehouse_id: datos.almacenOrigenId,
    source_location_id: datos.ubicacionOrigenId,
    destination_warehouse_id: datos.almacenDestinoId,
    destination_location_id: datos.ubicacionDestinoId,
    quantity: datos.cantidad,
    input_unit_id: datos.unidadEntradaId || null,
    expected_conversion_factor: datos.factorConversionEsperado ?? null,
    lot: datos.lote,
    expiration_date: datos.fechaVencimiento || null,
    stock_status: datos.estado,
  } })
  if (error) throw new Error(errorAlmacen(error))
}

export async function reclasificarInventario(
  organizationId: string,
  datos: DatosReclasificacion,
  operationKey: string = crypto.randomUUID(),
) {
  const { error } = await supabase.rpc('reclassify_inventory', { payload: {
    organization_id: organizationId,
    operation_key: operationKey,
    product_id: datos.productoId,
    warehouse_id: datos.almacenId,
    location_id: datos.ubicacionId,
    source_status: datos.estadoOrigen,
    destination_status: datos.estadoDestino,
    quantity: datos.cantidad,
    input_unit_id: datos.unidadEntradaId || null,
    expected_conversion_factor: datos.factorConversionEsperado ?? null,
    lot: datos.lote,
    expiration_date: datos.fechaVencimiento,
    reason: datos.motivo,
  } })
  if (error) throw new Error(errorAlmacen(error))
}
