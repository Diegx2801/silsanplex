import { supabase } from '@/lib/supabase'
import type {
  ComparativoProductoProveedor,
  CompraRecibidaProveedor,
  DatosDevolucionProveedor,
  DatosEvaluacionProveedor,
  DatosIncidenciaProveedor,
  DetalleOperativoProveedor,
  DevolucionProveedor,
  EvaluacionProveedor,
  IncidenciaProveedor,
  MetricasProveedor,
  PrecioHistoricoProveedor,
  ProductoSuministradoProveedor,
} from '@/modulos/proveedores/modelo/proveedorDetalle'

const metricasVacias: MetricasProveedor = {
  ordenesRecibidas: 0,
  entregasMedidas: 0,
  entregasPuntuales: 0,
  entregasTardias: 0,
  puntualidadPorcentaje: null,
  diasEntregaPromedio: null,
  ultimaCompraEn: null,
  incidencias: 0,
  incidenciasAbiertas: 0,
  devolucionesCompletadas: 0,
  cantidadDevuelta: 0,
  ultimaEvaluacion: null,
  ultimaEvaluacionEn: null,
}

function errorDetalle(error: { code?: string; message?: string }) {
  const mensaje = error.message ?? ''
  if (error.code === '42501' || mensaje.includes('FORBIDDEN')) return 'No tienes permiso para gestionar este expediente.'
  if (mensaje.includes('SUPPLIER_RETURN_QUANTITY_INVALID')) return 'La cantidad supera lo recibido o ya devuelto.'
  if (mensaje.includes('SUPPLIER_RETURN_INSUFFICIENT_STOCK')) return 'No hay stock disponible suficiente para completar la devolución.'
  if (mensaje.includes('SUPPLIER_RETURN_NOT_COMPLETABLE')) return 'La devolución ya no está disponible para completarse.'
  return 'No se pudo completar la operación del proveedor.'
}

function mapearMetricas(fila: Record<string, unknown> | null): MetricasProveedor {
  if (!fila) return metricasVacias
  return {
    ordenesRecibidas: Number(fila.received_orders),
    entregasMedidas: Number(fila.measured_deliveries),
    entregasPuntuales: Number(fila.on_time_deliveries),
    entregasTardias: Number(fila.late_deliveries),
    puntualidadPorcentaje: fila.on_time_percentage === null ? null : Number(fila.on_time_percentage),
    diasEntregaPromedio: fila.average_delivery_days === null ? null : Number(fila.average_delivery_days),
    ultimaCompraEn: fila.last_purchase_at as string | null,
    incidencias: Number(fila.incident_count),
    incidenciasAbiertas: Number(fila.open_incident_count),
    devolucionesCompletadas: Number(fila.completed_return_count),
    cantidadDevuelta: Number(fila.returned_quantity),
    ultimaEvaluacion: fila.latest_evaluation === null ? null : Number(fila.latest_evaluation),
    ultimaEvaluacionEn: fila.latest_evaluation_at as string | null,
  }
}

function mapearProducto(fila: Record<string, unknown>): ProductoSuministradoProveedor {
  return {
    productoId: fila.product_id as string,
    codigo: fila.product_code as string,
    descripcion: fila.product_description as string,
    unidadMedida: (fila.unit_of_measure as string | null) ?? '',
    compras: Number(fila.purchase_count),
    cantidadSuministrada: Number(fila.supplied_quantity),
    costoMinimo: Number(fila.minimum_unit_cost),
    costoPromedio: Number(fila.average_unit_cost),
    costoMaximo: Number(fila.maximum_unit_cost),
    ultimoCosto: Number(fila.latest_unit_cost),
    ultimaRecepcionEn: fila.last_received_at as string,
  }
}

export async function listarDetalleOperativoProveedor(
  organizationId: string,
  proveedorId: string,
): Promise<DetalleOperativoProveedor> {
  const [metricas, productos, precios, evaluaciones, incidencias, devoluciones, compras] = await Promise.all([
    supabase.from('supplier_performance_summary').select('*').eq('organization_id', organizationId).eq('supplier_id', proveedorId).maybeSingle(),
    supabase.from('supplier_supplied_products').select('*').eq('organization_id', organizationId).eq('supplier_id', proveedorId).order('last_received_at', { ascending: false }),
    supabase.from('supplier_price_history').select('*').eq('organization_id', organizationId).eq('supplier_id', proveedorId).order('received_at', { ascending: false }).limit(200),
    supabase.from('supplier_evaluations').select('*').eq('organization_id', organizationId).eq('supplier_id', proveedorId).order('evaluated_at', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('supplier_incidents').select('*').eq('organization_id', organizationId).eq('supplier_id', proveedorId).order('occurred_at', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('supplier_returns').select('*').eq('organization_id', organizationId).eq('supplier_id', proveedorId).order('requested_at', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('purchase_orders').select('id,document_type,series,document_number,received_at,purchase_order_items(id,product_id,product_code,product_description,quantity,unit_cost)').eq('organization_id', organizationId).eq('supplier_id', proveedorId).eq('status', 'received').order('received_at', { ascending: false }),
  ])

  const fallo = [metricas, productos, precios, evaluaciones, incidencias, devoluciones, compras].find((respuesta) => respuesta.error)
  if (fallo?.error) throw new Error(errorDetalle(fallo.error))

  return {
    metricas: mapearMetricas(metricas.data as Record<string, unknown> | null),
    productos: ((productos.data ?? []) as Record<string, unknown>[]).map(mapearProducto),
    precios: ((precios.data ?? []) as Record<string, unknown>[]).map((fila): PrecioHistoricoProveedor => ({
      compraId: fila.purchase_order_id as string,
      lineaId: fila.purchase_order_item_id as string,
      documento: `${fila.document_type} ${fila.series}-${fila.document_number}`,
      moneda: fila.currency as string,
      recibidoEn: fila.received_at as string,
      productoId: fila.product_id as string,
      productoCodigo: fila.product_code as string,
      productoDescripcion: fila.product_description as string,
      cantidad: Number(fila.quantity),
      costoUnitario: Number(fila.unit_cost),
    })),
    evaluaciones: ((evaluaciones.data ?? []) as Record<string, unknown>[]).map((fila): EvaluacionProveedor => ({
      id: fila.id as string,
      evaluadaEn: fila.evaluated_at as string,
      calidad: Number(fila.quality_rating),
      entrega: Number(fila.delivery_rating),
      servicio: Number(fila.service_rating),
      precio: Number(fila.price_rating),
      global: Number(fila.overall_rating),
      comentario: (fila.comments as string | null) ?? '',
      responsable: fila.responsible_name as string,
      creadaEn: fila.created_at as string,
    })),
    incidencias: ((incidencias.data ?? []) as Record<string, unknown>[]).map((fila): IncidenciaProveedor => ({
      id: fila.id as string,
      compraId: fila.purchase_order_id as string | null,
      productoId: fila.product_id as string | null,
      tipo: fila.incident_type as IncidenciaProveedor['tipo'],
      severidad: fila.severity as IncidenciaProveedor['severidad'],
      estado: fila.status as IncidenciaProveedor['estado'],
      ocurridaEn: fila.occurred_at as string,
      descripcion: fila.description as string,
      resolucion: (fila.resolution as string | null) ?? '',
      resueltaEn: fila.resolved_at as string | null,
      responsable: fila.responsible_name as string,
      creadaEn: fila.created_at as string,
    })),
    devoluciones: ((devoluciones.data ?? []) as Record<string, unknown>[]).map((fila): DevolucionProveedor => ({
      id: fila.id as string,
      compraId: fila.purchase_order_id as string,
      lineaCompraId: fila.purchase_order_item_id as string,
      productoId: fila.product_id as string,
      cantidad: Number(fila.quantity),
      motivo: fila.reason as string,
      estado: fila.status as DevolucionProveedor['estado'],
      solicitadaEn: fila.requested_at as string,
      completadaEn: fila.completed_at as string | null,
      responsable: fila.responsible_name as string,
      creadaEn: fila.created_at as string,
    })),
    comprasRecibidas: ((compras.data ?? []) as Array<Record<string, unknown> & { purchase_order_items: Record<string, unknown>[] }>).map((fila): CompraRecibidaProveedor => ({
      id: fila.id as string,
      documento: `${fila.document_type} ${fila.series}-${fila.document_number}`,
      recibidaEn: fila.received_at as string,
      lineas: fila.purchase_order_items.map((linea) => ({
        id: linea.id as string,
        productoId: linea.product_id as string,
        productoCodigo: linea.product_code as string,
        productoDescripcion: linea.product_description as string,
        cantidad: Number(linea.quantity),
        costoUnitario: Number(linea.unit_cost),
      })),
    })),
  }
}

export async function listarComparativoProductosProveedor(organizationId: string): Promise<ComparativoProductoProveedor[]> {
  const { data, error } = await supabase
    .from('supplier_supplied_products')
    .select('*')
    .eq('organization_id', organizationId)
    .order('product_description', { ascending: true })
  if (error) throw new Error(errorDetalle(error))
  return ((data ?? []) as Record<string, unknown>[]).map((fila) => ({
    ...mapearProducto(fila),
    proveedorId: fila.supplier_id as string,
  }))
}

export async function registrarEvaluacionProveedor(organizationId: string, proveedorId: string, datos: DatosEvaluacionProveedor) {
  const { error } = await supabase.rpc('record_supplier_evaluation', { payload: {
    organization_id: organizationId, supplier_id: proveedorId, evaluated_at: datos.evaluadaEn,
    quality_rating: datos.calidad, delivery_rating: datos.entrega,
    service_rating: datos.servicio, price_rating: datos.precio, comments: datos.comentario,
  } })
  if (error) throw new Error(errorDetalle(error))
}

export async function guardarIncidenciaProveedor(organizationId: string, proveedorId: string, datos: DatosIncidenciaProveedor, incidenciaId?: string) {
  const { error } = await supabase.rpc('save_supplier_incident', { payload: {
    ...(incidenciaId ? { id: incidenciaId } : {}), organization_id: organizationId,
    supplier_id: proveedorId, purchase_order_id: datos.compraId, product_id: datos.productoId,
    incident_type: datos.tipo, severity: datos.severidad, status: datos.estado,
    occurred_at: datos.ocurridaEn, description: datos.descripcion, resolution: datos.resolucion,
  } })
  if (error) throw new Error(errorDetalle(error))
}

export async function registrarDevolucionProveedor(organizationId: string, proveedorId: string, datos: DatosDevolucionProveedor) {
  const { error } = await supabase.rpc('register_supplier_return', { payload: {
    organization_id: organizationId, supplier_id: proveedorId,
    purchase_order_id: datos.compraId, purchase_order_item_id: datos.lineaCompraId,
    quantity: datos.cantidad, reason: datos.motivo, requested_at: datos.solicitadaEn,
  } })
  if (error) throw new Error(errorDetalle(error))
}

export async function completarDevolucionProveedor(organizationId: string, devolucionId: string) {
  const { error } = await supabase.rpc('complete_supplier_return', {
    requested_organization_id: organizationId,
    requested_return_id: devolucionId,
  })
  if (error) throw new Error(errorDetalle(error))
}
