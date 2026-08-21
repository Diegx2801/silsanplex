import { supabase } from '@/lib/supabase'
import type {
  AlertaInventario,
  Almacen,
  DatosAlmacen,
  DatosReclasificacion,
  DatosTransferencia,
  DatosUbicacion,
  MovimientoKardex,
  SaldoInventario,
  TransferenciaAlmacen,
  UbicacionAlmacen,
} from '@/modulos/inventario/modelo/almacen'

function errorAlmacen(error: { code?: string; message?: string }) {
  const mensaje = error.message ?? ''
  if (mensaje.includes('INVENTORY_INSUFFICIENT_STOCK')) return 'La operacion supera el stock disponible del lote y ubicacion seleccionados.'
  if (mensaje.includes('TRANSFER_WAREHOUSES_MUST_DIFFER')) return 'El almacen de destino debe ser diferente al de origen.'
  if (mensaje.includes('LOCATION_UNAVAILABLE')) return 'La ubicacion seleccionada no esta disponible.'
  if (mensaje.includes('INVENTORY_FORBIDDEN') || error.code === '42501') return 'No tienes permiso para administrar almacenes.'
  if (error.code === '23505') return 'El codigo o la referencia ya existe.'
  return 'No se pudo completar la operacion de almacen.'
}

export async function cargarGestionAlmacen(organizationId: string) {
  const [almacenes, ubicaciones, saldos, alertas, kardex, transferencias] = await Promise.all([
    supabase.from('warehouses').select('id,code,name,address,is_active').eq('organization_id', organizationId).order('name'),
    supabase.from('warehouse_locations').select('id,warehouse_id,code,name,description,is_active').eq('organization_id', organizationId).order('name'),
    supabase.from('inventory_balances').select('*').eq('organization_id', organizationId).neq('quantity', 0).order('product_description'),
    supabase.from('inventory_alerts').select('*').eq('organization_id', organizationId).or('has_low_stock_alert.eq.true,has_expiration_alert.eq.true').order('expiration_date'),
    supabase.from('inventory_kardex').select('*').eq('organization_id', organizationId).order('operation_date', { ascending: false }).order('created_at', { ascending: false }).limit(250),
    supabase.from('warehouse_transfers').select('id,reference,source_warehouse_id,destination_warehouse_id,transferred_at,notes').eq('organization_id', organizationId).order('transferred_at', { ascending: false }).limit(100),
  ])
  const fallo = [almacenes, ubicaciones, saldos, alertas, kardex, transferencias].find((resultado) => resultado.error)
  if (fallo?.error) throw new Error(errorAlmacen(fallo.error))

  return {
    almacenes: (almacenes.data ?? []).map((fila) => ({
      id: fila.id, codigo: fila.code, nombre: fila.name, direccion: fila.address ?? '', activo: fila.is_active,
    })) as Almacen[],
    ubicaciones: (ubicaciones.data ?? []).map((fila) => ({
      id: fila.id, almacenId: fila.warehouse_id, codigo: fila.code, nombre: fila.name, descripcion: fila.description ?? '', activa: fila.is_active,
    })) as UbicacionAlmacen[],
    saldos: (saldos.data ?? []).map(mapearSaldo) as SaldoInventario[],
    alertas: (alertas.data ?? []).map((fila) => ({
      ...mapearSaldo(fila),
      stockMinimo: Number(fila.minimum_stock),
      diasAlertaVencimiento: fila.expiration_alert_days,
      alertaStockMinimo: fila.has_low_stock_alert,
      alertaVencimiento: fila.has_expiration_alert,
      diasParaVencer: fila.days_until_expiration,
    })) as AlertaInventario[],
    kardex: (kardex.data ?? []).map((fila) => ({
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
    })) as MovimientoKardex[],
    transferencias: (transferencias.data ?? []).map((fila) => ({
      id: fila.id,
      referencia: fila.reference,
      almacenOrigenId: fila.source_warehouse_id,
      almacenDestinoId: fila.destination_warehouse_id,
      fechaTransferencia: fila.transferred_at,
      notas: fila.notes ?? '',
    })) as TransferenciaAlmacen[],
  }
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
  const { error } = await supabase.rpc('transfer_inventory', { payload: {
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
  } })
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
