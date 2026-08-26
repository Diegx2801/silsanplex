import { supabase } from '@/lib/supabase'
import type { Compra, DatosCompra, EstadoCompra, LineaCompra } from '@/modulos/compras/modelo/compras'

interface LineaCompraFila {
  id: string
  product_id: string
  product_code: string
  product_description: string
  unit_of_measure: string | null
  batch_control: boolean
  quantity: number
  unit_cost: number
  lot: string | null
  expiration_date: string | null
}

interface CompraFila {
  id: string
  supplier_id: string
  supplier_document: string
  supplier_name: string
  document_type: Compra['tipoDocumento']
  series: string
  document_number: string
  issue_date: string
  payment_due_date: string | null
  expected_delivery_date: string | null
  warehouse: string
  prices_include_tax: boolean
  notes: string | null
  status: 'draft' | 'issued' | 'received' | 'cancelled'
  issued_at: string | null
  received_at: string | null
  created_at: string
  purchase_order_items: LineaCompraFila[]
}

const columnasCompra =
  'id,supplier_id,supplier_document,supplier_name,document_type,series,document_number,issue_date,payment_due_date,expected_delivery_date,warehouse,prices_include_tax,notes,status,issued_at,received_at,created_at,purchase_order_items(id,product_id,product_code,product_description,unit_of_measure,batch_control,quantity,unit_cost,lot,expiration_date)' as const

const estados: Record<CompraFila['status'], EstadoCompra> = {
  draft: 'borrador',
  issued: 'emitida',
  received: 'recibida',
  cancelled: 'anulada',
}

function mapearLinea(fila: LineaCompraFila): LineaCompra {
  return {
    id: fila.id,
    productoId: fila.product_id,
    productoCodigo: fila.product_code,
    productoDescripcion: fila.product_description,
    unidadMedida: fila.unit_of_measure ?? '',
    controlLote: fila.batch_control,
    cantidad: Number(fila.quantity),
    costoUnitario: Number(fila.unit_cost),
    lote: fila.lot ?? '',
    fechaVencimiento: fila.expiration_date ?? '',
  }
}

function mapearCompra(fila: CompraFila): Compra {
  return {
    id: fila.id,
    proveedorId: fila.supplier_id,
    proveedorDocumento: fila.supplier_document,
    proveedorNombre: fila.supplier_name,
    tipoDocumento: fila.document_type,
    serie: fila.series,
    numero: fila.document_number,
    fechaEmision: fila.issue_date,
    fechaVencimientoPago: fila.payment_due_date ?? '',
    fechaEntregaEsperada: fila.expected_delivery_date ?? '',
    almacen: fila.warehouse,
    preciosIncluyenIgv: fila.prices_include_tax,
    observacion: fila.notes ?? '',
    lineas: fila.purchase_order_items.map(mapearLinea),
    estado: estados[fila.status],
    fechaRegistro: fila.created_at,
    fechaEmisionOrden: fila.issued_at,
    fechaRecepcion: fila.received_at,
  }
}

function mensajeError(error: { code?: string; message?: string }) {
  const mensaje = error.message ?? ''
  if (error.code === '23505') return mensaje.includes('DUPLICATE_PRODUCT') ? 'Cada producto debe aparecer una sola vez' : 'Ya existe una compra con este documento'
  if (mensaje.includes('PURCHASE_ORDER_NOT_EDITABLE')) return 'Solo se pueden editar órdenes en borrador'
  if (mensaje.includes('PURCHASE_ORDER_NOT_ISSUABLE')) return 'La orden ya no está disponible para emitir'
  if (mensaje.includes('PURCHASE_ORDER_NOT_RECEIVABLE')) return 'La orden debe estar emitida y pendiente de recepción'
  if (mensaje.includes('INVENTORY_MAXIMUM_STOCK_EXCEEDED')) return 'La recepción superaría el stock máximo configurado para uno de los productos'
  if (mensaje.includes('PURCHASE_ORDER_NOT_CANCELLABLE')) return 'La orden ya no se puede anular'
  if (mensaje.includes('PURCHASE_ORDER_EXPIRATION_REQUIRED')) return 'Un producto requiere fecha de vencimiento'
  if (mensaje.includes('PURCHASE_ORDER_PRODUCT_UNAVAILABLE')) return 'Un producto está inactivo o requiere lote'
  if (mensaje.includes('PURCHASE_ORDER_SUPPLIER_UNAVAILABLE')) return 'El proveedor ya no está disponible'
  if (error.code === '42501' || mensaje.includes('FORBIDDEN')) return 'No tienes permiso para esta operación'
  return 'No se pudo completar la operación de compra'
}

export async function listarCompras(organizationId: string): Promise<Compra[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(columnasCompra)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error(mensajeError(error))
  return ((data ?? []) as CompraFila[]).map(mapearCompra)
}

export async function guardarCompraPersistente(organizationId: string, datos: DatosCompra, compraId?: string) {
  const { error } = await supabase.rpc('save_purchase_order', {
    payload: {
      ...(compraId ? { id: compraId } : {}),
      organization_id: organizationId,
      supplier_id: datos.proveedorId,
      document_type: datos.tipoDocumento,
      series: datos.serie,
      document_number: datos.numero,
      issue_date: datos.fechaEmision,
      payment_due_date: datos.fechaVencimientoPago,
      expected_delivery_date: datos.fechaEntregaEsperada,
      warehouse: datos.almacen,
      currency: 'PEN',
      prices_include_tax: datos.preciosIncluyenIgv,
      notes: datos.observacion,
      items: datos.lineas.map((linea) => ({
        product_id: linea.productoId,
        quantity: linea.cantidad,
        unit_cost: linea.costoUnitario,
        lot: linea.lote,
        expiration_date: linea.fechaVencimiento,
      })),
    },
  })
  if (error) throw new Error(mensajeError(error))
}

async function ejecutarAccion(nombre: 'issue_purchase_order' | 'receive_purchase_order' | 'cancel_purchase_order', organizationId: string, compraId: string) {
  const { error } = await supabase.rpc(nombre, {
    requested_organization_id: organizationId,
    requested_order_id: compraId,
  })
  if (error) throw new Error(mensajeError(error))
}

export const emitirCompraPersistente = (organizationId: string, compraId: string) => ejecutarAccion('issue_purchase_order', organizationId, compraId)
export const recibirCompraPersistente = (organizationId: string, compraId: string) => ejecutarAccion('receive_purchase_order', organizationId, compraId)
export const anularCompraPersistente = (organizationId: string, compraId: string) => ejecutarAccion('cancel_purchase_order', organizationId, compraId)
