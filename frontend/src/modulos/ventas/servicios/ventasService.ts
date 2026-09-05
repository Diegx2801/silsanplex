import { supabase } from '@/lib/supabase'
import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'
import type { DatosVenta, PedidoVenta, Venta } from '@/modulos/ventas/modelo/operacionVenta'

interface ClienteFila {
  document_type: string
  document_number: string
  legal_name: string
}

interface LineaPedidoFila {
  id: string
  product_id: string
  products?: { product_type: 'good' | 'service' } | null
  product_code: string
  product_description: string
  unit_of_measure: string | null
  quantity: number | string
  unit_price: number | string
}

interface AlmacenPedidoFila {
  code: string
  name: string
}

interface PedidoFila {
  id: string
  organization_id: string
  order_number: string
  source_quote_id: string | null
  source_quote_number: string | null
  customer_id: string
  warehouse_id: string | null
  order_date: string
  status: PedidoVenta['estado']
  prices_include_tax: boolean
  notes: string
  created_at: string
  order_items: LineaPedidoFila[]
  warehouses: AlmacenPedidoFila | AlmacenPedidoFila[] | null
  customers: ClienteFila | ClienteFila[] | null
}

interface LineaVentaFila extends LineaPedidoFila {
  order_item_id: string
}

interface VentaFila {
  id: string
  organization_id: string
  order_id: string
  customer_id: string
  internal_number: string
  document_type: Venta['tipoDocumento']
  series: string
  document_number: string
  sale_date: string
  warehouse: string
  prices_include_tax: boolean
  status: Venta['estado']
  created_at: string
  sales_order?: { order_number: string } | { order_number: string }[] | null
  orders?: { order_number: string } | { order_number: string }[] | null
  customers: ClienteFila | ClienteFila[] | null
  sale_items: LineaVentaFila[]
}

const columnasPedido = [
  'id',
  'organization_id',
  'order_number',
  'source_quote_id',
  'source_quote_number',
  'customer_id',
  'warehouse_id',
  'order_date',
  'status',
  'prices_include_tax',
  'notes',
  'created_at',
  'order_items(id,product_id,product_code,product_description,unit_of_measure,quantity,unit_price,products(product_type))',
  'warehouses!orders_warehouse_same_organization(code,name)',
  'customers!orders_customer_same_organization(document_type,document_number,legal_name)',
].join(',')

const columnasVenta = [
  'id',
  'organization_id',
  'order_id',
  'customer_id',
  'internal_number',
  'document_type',
  'series',
  'document_number',
  'sale_date',
  'warehouse',
  'prices_include_tax',
  'status',
  'created_at',
  'orders!sales_order_same_organization(order_number)',
  'customers!sales_customer_same_organization(document_type,document_number,legal_name)',
  'sale_items(id,order_item_id,product_id,product_code,product_description,unit_of_measure,quantity,unit_price,products(product_type))',
].join(',')

function primerCliente(cliente: ClienteFila | ClienteFila[] | null) {
  return Array.isArray(cliente) ? cliente[0] : cliente
}

function primerPedido(pedido: VentaFila['orders']) {
  return Array.isArray(pedido) ? pedido[0] : pedido
}

function primerAlmacen(almacen: PedidoFila['warehouses']) {
  return Array.isArray(almacen) ? almacen[0] : almacen
}

function mapearLinea(fila: LineaPedidoFila) {
  return {
    id: fila.id,
    productoId: fila.product_id,
    tipoProducto: fila.products?.product_type ?? 'good',
    productoCodigo: fila.product_code,
    productoDescripcion: fila.product_description,
    unidadMedida: fila.unit_of_measure ?? '',
    cantidad: Number(fila.quantity),
    precioUnitario: Number(fila.unit_price),
    lote: '',
    fechaVencimiento: '',
  }
}

function mapearLineaVenta(fila: LineaVentaFila) {
  return {
    ...mapearLinea(fila),
    pedidoLineaId: fila.order_item_id,
  }
}

function mapearPedido(fila: PedidoFila): PedidoVenta {
  const cliente = primerCliente(fila.customers)
  const almacen = primerAlmacen(fila.warehouses)
  if (!cliente) throw new Error('El pedido no tiene un cliente válido')
  return {
    id: fila.id,
    numero: fila.order_number,
    cotizacionId: fila.source_quote_id ?? '',
    cotizacionNumero: fila.source_quote_number ?? '',
    clienteId: fila.customer_id,
    clienteDocumento: cliente.document_number,
    clienteNombre: cliente.legal_name,
    preciosIncluyenIgv: fila.prices_include_tax,
    observacion: fila.notes,
    lineas: fila.order_items.map(mapearLinea),
    estado: fila.status,
    fechaRegistro: fila.created_at,
    fechaAtencion: null,
    almacenId: fila.warehouse_id ?? undefined,
    almacenNombre: almacen?.name,
  }
}

function mapearVenta(fila: VentaFila): Venta {
  const cliente = primerCliente(fila.customers)
  const pedido = primerPedido(fila.orders)
  if (!cliente || !pedido) throw new Error('La venta no tiene relaciones comerciales válidas')
  return {
    id: fila.id,
    numeroInterno: fila.internal_number,
    pedidoId: fila.order_id,
    pedidoNumero: pedido.order_number,
    clienteId: fila.customer_id,
    clienteDocumento: cliente.document_number,
    clienteNombre: cliente.legal_name,
    tipoDocumento: fila.document_type,
    serie: fila.series,
    numeroDocumento: fila.document_number,
    fechaVenta: fila.sale_date,
    almacen: fila.warehouse,
    preciosIncluyenIgv: fila.prices_include_tax,
    lineas: fila.sale_items.map((linea) => ({ ...mapearLineaVenta(linea), id: linea.id })),
    estado: fila.status,
    fechaRegistro: fila.created_at,
    fechaDespacho: null,
  }
}

function mensajeError(error: { code?: string; message?: string }) {
  const message = error.message ?? ''
  if (message.includes('ORDER_SERVICE_COMPLETION_QUANTITY_INVALID')) return 'Los servicios se atienden por la cantidad completa al cerrar la venta'
  if (message.includes('INVENTORY_SERVICE_PRODUCT_FORBIDDEN')) return 'Los servicios no generan reservas ni pueden despacharse como inventario.'
  if (error.code === '42501' || /_FORBIDDEN|AUTHENTICATION_REQUIRED/.test(message)) return 'No tienes permiso para gestionar operaciones comerciales'
  if (message.includes('ORDER_CUSTOMER_UNAVAILABLE')) return 'El cliente seleccionado ya no está disponible'
  if (message.includes('ORDER_WAREHOUSE_REQUIRED')) return 'Selecciona un almacén para el pedido'
  if (message.includes('ORDER_WAREHOUSE_UNAVAILABLE')) return 'El almacén seleccionado ya no está disponible'
  if (message.includes('ORDER_PRODUCT_UNAVAILABLE')) return 'Uno de los productos ya no está disponible'
  if (message.includes('INVENTORY_FEFO_INSUFFICIENT_STOCK') || message.includes('INVENTORY_RESERVED_STOCK')) return 'No hay stock asignable suficiente en el almacén seleccionado'
  if (message.includes('ORDER_RESERVATION_STATE_INVALID')) return 'La reserva del pedido ya no coincide con su cantidad; recarga el pedido antes de continuar'
  if (message.includes('ORDER_NOT_MODIFIABLE')) return 'El pedido ya no puede modificar sus cantidades'
  if (message.includes('ORDER_NOT_CANCELLABLE')) return 'El pedido ya no puede cancelarse'
  if (message.includes('ORDER_ITEMS_MISMATCH') || message.includes('ORDER_ITEM_NOT_FOUND')) return 'Las líneas del pedido ya no son válidas; recarga el pedido'
  if (message.includes('ORDER_DUPLICATE_ITEM')) return 'Cada línea del pedido debe aparecer una sola vez'
  if (message.includes('ORDER_OPERATION_KEY_REUSED')) return 'La operación ya fue utilizada; vuelve a cargar el pedido'
  if (message.includes('ORDER_IDEMPOTENCY_CONFLICT')) return 'La clave de operación del pedido ya fue usada con datos diferentes; revisa y vuelve a cargar la cotización'
  if (message.includes('ORDER_DUPLICATE_PRODUCT')) return 'Cada producto debe aparecer una sola vez en el pedido'
  if (message.includes('ORDER_ITEM_VALUES_INVALID')) return 'Las cantidades y precios deben ser válidos'
  if (message.includes('ORDER_OPERATION_KEY_REQUIRED')) return 'No se pudo identificar el reintento del pedido'
  if (message.includes('ORDER_DISPATCH_EXCEEDS_RESERVED')) return 'La cantidad supera el saldo reservado pendiente'
  if (message.includes('ORDER_DISPATCH_SALE_REQUIRED')) return 'La venta persistente no está disponible para despacho'
  if (message.includes('ORDER_DISPATCH_ITEM_INVALID')) return 'La línea de venta ya no es válida; recarga el documento'
  if (message.includes('ORDER_NOT_DISPATCHABLE')) return 'La venta ya no puede despacharse en su estado actual'
  if (message.includes('ORDER_RESERVATION_STATE_INVALID')) return 'La reserva ya no es válida para despacho; recarga el documento'
  if (message.includes('SALE_ORDER_ALREADY_CONVERTED')) return 'El pedido ya tiene una venta registrada'
  if (message.includes('SALE_IDEMPOTENCY_CONFLICT')) return 'La clave de operación de la venta ya fue usada con datos diferentes; revisa el comprobante'
  if (message.includes('SALE_ORDER_NOT_AVAILABLE')) return 'El pedido ya no está disponible para registrar una venta'
  if (message.includes('SALE_ORDER_NOT_FOUND')) return 'El pedido ya no existe'
  if (message.includes('SALE_DOCUMENT_INVALID')) return 'Revisa los datos del comprobante'
  if (error.code === '23505') return 'Ya existe un pedido o venta con esos datos'
  return 'No se pudo completar la operación comercial'
}

export async function listarPedidosPersistentes(organizationId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(columnasPedido)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error(mensajeError(error))
  return ((data ?? []) as unknown as PedidoFila[]).map(mapearPedido)
}

export async function listarVentasPersistentes(organizationId: string) {
  const { data, error } = await supabase
    .from('sales')
    .select(columnasVenta)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error(mensajeError(error))
  const ventas = ((data ?? []) as unknown as VentaFila[]).map(mapearVenta)
  if (!ventas.length) return ventas

  // El saldo operativo se deriva de las reservas persistentes. El filtro por
  // las líneas visibles evita descargar reservas ajenas a estas ventas.
  const orderItemIds = ventas.flatMap((venta) => venta.lineas.map((linea) => linea.pedidoLineaId)).filter((id): id is string => Boolean(id))
  if (!orderItemIds.length) return ventas
  const reservas = await supabase
    .from('inventory_reservations')
    .select('source_id,quantity,quantity_consumed,status')
    .eq('organization_id', organizationId)
    .eq('source_type', 'order-item')
    .in('source_id', orderItemIds)
  if (reservas.error) throw new Error(mensajeError(reservas.error))
  const saldos = new Map<string, { despachada: number; pendiente: number }>()
  for (const fila of (reservas.data ?? []) as Array<{ source_id: string; quantity: number | string; quantity_consumed: number | string; status: string }>) {
    const saldo = saldos.get(fila.source_id) ?? { despachada: 0, pendiente: 0 }
    const cantidad = Number(fila.quantity)
    const consumida = Number(fila.quantity_consumed)
    saldo.despachada += consumida
    if (fila.status === 'active') saldo.pendiente += Math.max(cantidad - consumida, 0)
    saldos.set(fila.source_id, saldo)
  }
  return ventas.map((venta) => ({
    ...venta,
    lineas: venta.lineas.map((linea) => {
      if (linea.tipoProducto === 'service') {
        return {
          ...linea,
          cantidadDespachada: venta.estado === 'despachada' ? linea.cantidad : 0,
          cantidadPendiente: venta.estado === 'despachada' ? 0 : linea.cantidad,
        }
      }
      const saldo = linea.pedidoLineaId ? saldos.get(linea.pedidoLineaId) : undefined
      return {
        ...linea,
        cantidadDespachada: saldo?.despachada ?? 0,
        cantidadPendiente: saldo?.pendiente ?? linea.cantidad,
      }
    }),
  }))
}

export async function crearPedidoPersistente(
  organizationId: string,
  cotizacion: Cotizacion,
  warehouseId: string,
) {
  const { data, error } = await supabase.rpc('create_order', {
    payload: {
      organization_id: organizationId,
      operation_key: cotizacion.id,
      source_quote_id: cotizacion.id,
      source_quote_number: cotizacion.numero,
      customer_id: cotizacion.clienteId,
      warehouse_id: warehouseId,
      order_date: cotizacion.fechaEmision,
      prices_include_tax: cotizacion.preciosIncluyenIgv,
      notes: cotizacion.observacion,
      items: cotizacion.lineas.map((linea) => ({
        product_id: linea.productoId,
        quantity: linea.cantidad,
        unit_price: linea.precioUnitario,
      })),
    },
  })
  if (error) throw new Error(mensajeError(error))
  return data as string
}

export async function registrarVentaPersistente(
  organizationId: string,
  pedidoId: string,
  datos: DatosVenta,
) {
  const { data, error } = await supabase.rpc('create_sale_from_order', {
    requested_organization_id: organizationId,
    requested_order_id: pedidoId,
    payload: {
      operation_key: pedidoId,
      document_type: datos.tipoDocumento,
      series: datos.serie,
      document_number: datos.numeroDocumento,
      sale_date: datos.fechaVenta,
      warehouse: datos.almacen,
    },
  })
  if (error) throw new Error(mensajeError(error))
  return data as string
}

export interface CantidadLineaPedido {
  orderItemId: string
  quantity: number
}

function operationKeyOrNew(operationKey?: string) {
  return operationKey ?? crypto.randomUUID()
}

export async function actualizarCantidadesPedidoPersistente(
  organizationId: string,
  pedidoId: string,
  lineas: readonly CantidadLineaPedido[],
  operationKey?: string,
) {
  const { data, error } = await supabase.rpc('update_order_quantities', {
    payload: {
      organization_id: organizationId,
      order_id: pedidoId,
      operation_key: operationKeyOrNew(operationKey),
      items: lineas.map((linea) => ({
        order_item_id: linea.orderItemId,
        quantity: linea.quantity,
      })),
    },
  })
  if (error) throw new Error(mensajeError(error))
  return data as string
}

export async function cancelarPedidoPersistente(
  organizationId: string,
  pedidoId: string,
  operationKey?: string,
) {
  const { data, error } = await supabase.rpc('cancel_order', {
    payload: {
      organization_id: organizationId,
      order_id: pedidoId,
      operation_key: operationKeyOrNew(operationKey),
    },
  })
  if (error) throw new Error(mensajeError(error))
  return data as string
}

export interface CantidadDespacho {
  orderItemId: string
  quantity: number
}

export async function despacharVentaPersistente(
  organizationId: string,
  pedidoId: string,
  ventaId: string,
  lineas: readonly CantidadDespacho[],
  operationKey?: string,
  operationDate?: string,
) {
  const { data, error } = await supabase.rpc('dispatch_order_from_reservations', {
    payload: {
      organization_id: organizationId,
      order_id: pedidoId,
      sale_id: ventaId,
      operation_key: operationKeyOrNew(operationKey),
      operation_date: operationDate,
      items: lineas.map((linea) => ({
        order_item_id: linea.orderItemId,
        quantity: linea.quantity,
      })),
    },
  })
  if (error) throw new Error(mensajeError(error))
  return data as string
}
