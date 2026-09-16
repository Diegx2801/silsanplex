import { supabase } from '@/lib/supabase'
import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import type { Producto } from '@/modulos/productos/modelo/producto'
import {
  validarCotizacion,
  type Cotizacion,
  type DatosCotizacion,
  type EstadoCotizacion,
} from '@/modulos/ventas/modelo/cotizacion'

interface CotizacionFila {
  id: string
  organization_id: string
  quote_number: string
  customer_id: string
  issue_date: string
  valid_until: string
  prices_include_tax: boolean
  status: EstadoCotizacion
  notes: string | null
  created_at: string
  updated_at: string
  issued_at: string | null
  accepted_at: string | null
  rejected_at: string | null
}

interface LineaCotizacionFila {
  id: string
  quote_id: string
  product_id: string
  product_code: string
  product_description: string
  unit_of_measure: string | null
  quantity: number | string
  unit_price: number | string
  tax_affectation: 'por-definir' | 'gravado' | 'exonerado' | 'inafecto' | null
}

interface ClienteFila {
  id: string
  document_number: string
  legal_name: string
}

const columnasCotizacion = [
  'id',
  'organization_id',
  'quote_number',
  'customer_id',
  'issue_date',
  'valid_until',
  'prices_include_tax',
  'status',
  'notes',
  'created_at',
  'updated_at',
  'issued_at',
  'accepted_at',
  'rejected_at',
].join(',')

const columnasLinea = [
  'id',
  'quote_id',
  'product_id',
  'product_code',
  'product_description',
  'unit_of_measure',
  'quantity',
  'unit_price',
  'tax_affectation',
].join(',')

function mensajeError(error: { code?: string | null; message?: string | null }) {
  const detalle = `${error.code ?? ''} ${error.message ?? ''}`
  if (detalle.includes('QUOTE_FORBIDDEN') || detalle.includes('SALES_QUOTE_FORBIDDEN') || error.code === '42501') {
    return 'No tienes permiso para gestionar cotizaciones.'
  }
  if (detalle.includes('QUOTE_CUSTOMER_UNAVAILABLE') || detalle.includes('SALES_QUOTE_CUSTOMER_UNAVAILABLE')) {
    return 'El cliente seleccionado ya no está disponible.'
  }
  if (detalle.includes('QUOTE_PRODUCT_UNAVAILABLE') || detalle.includes('SALES_QUOTE_PRODUCT_UNAVAILABLE')) {
    return 'Uno de los productos ya no está disponible.'
  }
  if (detalle.includes('SALES_QUOTE_PRODUCT_CHANGED')) {
    return 'Un producto de la cotización cambió en el catálogo. Actualiza la cotización antes de crear el pedido.'
  }
  if (detalle.includes('QUOTE_DUPLICATE_PRODUCT') || detalle.includes('SALES_QUOTE_DUPLICATE_PRODUCT')) {
    return 'Cada producto debe aparecer una sola vez en la cotización.'
  }
  if (detalle.includes('QUOTE_ITEMS_REQUIRED') || detalle.includes('SALES_QUOTE_ITEMS_REQUIRED')) {
    return 'Agrega al menos un producto a la cotización.'
  }
  if (detalle.includes('QUOTE_FIELDS_REQUIRED') || detalle.includes('QUOTE_DATES_INVALID') || detalle.includes('SALES_QUOTE_FIELDS_REQUIRED') || detalle.includes('SALES_QUOTE_DATES_INVALID')) {
    return 'Revisa el cliente y las fechas de la cotización.'
  }
  if (detalle.includes('QUOTE_ITEM_VALUES_INVALID') || detalle.includes('SALES_QUOTE_ITEM_VALUES_INVALID')) {
    return 'Las cantidades y precios de la cotización deben ser válidos.'
  }
  if (detalle.includes('QUOTE_PRODUCT_REQUIRED') || detalle.includes('SALES_QUOTE_PRODUCT_REQUIRED')) {
    return 'Selecciona un producto en cada línea.'
  }
  if (detalle.includes('QUOTE_TAX_AFFECTATION_REQUIRED') || detalle.includes('SALES_QUOTE_TAX_AFFECTATION_REQUIRED')) {
    return 'Completa la afectación tributaria de todos los productos antes de emitir.'
  }
  if (detalle.includes('QUOTE_NOT_EDITABLE') || detalle.includes('SALES_QUOTE_NOT_EDITABLE') || detalle.includes('SALES_QUOTE_NOT_DRAFT')) {
    return 'Solo se pueden editar cotizaciones en borrador.'
  }
  if (detalle.includes('QUOTE_NOT_ISSUABLE') || detalle.includes('SALES_QUOTE_NOT_ISSUABLE')) {
    return 'La cotización ya no está disponible para emisión.'
  }
  if (detalle.includes('QUOTE_EXPIRED') || detalle.includes('SALES_QUOTE_EXPIRED')) {
    return 'La cotización está vencida; actualiza su vigencia antes de emitirla.'
  }
  if (detalle.includes('SALES_QUOTE_NOT_AVAILABLE')) {
    return 'La cotización ya no está disponible para crear el pedido.'
  }
  if (detalle.includes('SALES_QUOTE_NOT_FOUND')) {
    return 'La cotización ya no existe o no está disponible. Recarga el listado.'
  }
  if (detalle.includes('QUOTE_IDEMPOTENCY_CONFLICT')) {
    return 'La operación ya fue utilizada con datos diferentes. Recarga la cotización.'
  }
  return 'No se pudo completar la operación de cotización. Recarga e inténtalo nuevamente.'
}

function mapearCotizacion(
  fila: CotizacionFila,
  lineas: readonly LineaCotizacionFila[],
  clientes: ReadonlyMap<string, ClienteFila>,
): Cotizacion {
  const cliente = clientes.get(fila.customer_id)
  if (!cliente) throw new Error('La cotización no tiene un cliente válido')
  return {
    id: fila.id,
    numero: fila.quote_number,
    clienteId: fila.customer_id,
    clienteDocumento: cliente.document_number,
    clienteNombre: cliente.legal_name,
    fechaEmision: fila.issue_date,
    fechaValidez: fila.valid_until,
    preciosIncluyenIgv: fila.prices_include_tax,
    observacion: fila.notes ?? '',
    lineas: lineas
      .filter((linea) => linea.quote_id === fila.id)
      .map((linea) => ({
        id: linea.id,
        productoId: linea.product_id,
        productoCodigo: linea.product_code,
        productoDescripcion: linea.product_description,
        unidadMedida: linea.unit_of_measure ?? '',
        cantidad: Number(linea.quantity),
        precioUnitario: Number(linea.unit_price),
        afectacionIgv: linea.tax_affectation ?? 'por-definir',
      })),
    estado: fila.status,
    fechaRegistro: fila.created_at,
    fechaCambioEstado: fila.accepted_at ?? fila.rejected_at ?? fila.issued_at,
  }
}

export async function listarCotizacionesPersistentes(organizationId: string) {
  const { data, error } = await supabase
    .from('sales_quotes')
    .select(columnasCotizacion)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error(mensajeError(error))

  const cotizaciones = (data ?? []) as unknown as CotizacionFila[]
  if (!cotizaciones.length) return []
  const ids = cotizaciones.map((cotizacion) => cotizacion.id)
  const clientesIds = [...new Set(cotizaciones.map((cotizacion) => cotizacion.customer_id))]
  const [lineasResult, clientesResult] = await Promise.all([
    supabase.from('sales_quote_items').select(columnasLinea).eq('organization_id', organizationId).in('quote_id', ids),
    supabase.from('customers').select('id,document_number,legal_name').eq('organization_id', organizationId).in('id', clientesIds),
  ])
  if (lineasResult.error) throw new Error(mensajeError(lineasResult.error))
  if (clientesResult.error) throw new Error(mensajeError(clientesResult.error))

  const clientes = new Map(
    ((clientesResult.data ?? []) as unknown as ClienteFila[]).map((cliente) => [cliente.id, cliente]),
  )
  return cotizaciones.map((cotizacion) =>
    mapearCotizacion(cotizacion, (lineasResult.data ?? []) as unknown as LineaCotizacionFila[], clientes),
  )
}

function operationKeyOrNew(operationKey?: string) {
  return operationKey ?? crypto.randomUUID()
}

export async function guardarCotizacionPersistente(
  organizationId: string,
  datos: DatosCotizacion,
  clientes: readonly Cliente[],
  productos: readonly Producto[],
  cotizacionId?: string,
  operationKey?: string,
) {
  const cliente = clientes.find((item) => item.id === datos.clienteId && item.activo)
  if (!cliente) throw new Error('El cliente seleccionado ya no está disponible')
  const errorValidacion = validarCotizacion(datos, productos)
  if (errorValidacion) throw new Error(errorValidacion)

  const id = cotizacionId ?? crypto.randomUUID()
  const { data, error } = await supabase.rpc('save_sales_quote', {
    payload: {
      organization_id: organizationId,
      quote_id: id,
      operation_key: operationKeyOrNew(operationKey),
      customer_id: datos.clienteId,
      issue_date: datos.fechaEmision,
      valid_until: datos.fechaValidez,
      prices_include_tax: datos.preciosIncluyenIgv,
      notes: datos.observacion,
      items: datos.lineas.map((linea) => ({
        product_id: linea.productoId,
        quantity: Number(linea.cantidad),
        unit_price: Number(linea.precioUnitario),
      })),
    },
  })
  if (error) throw new Error(mensajeError(error))
  return data as string
}

export async function emitirCotizacionPersistente(
  organizationId: string,
  cotizacionId: string,
) {
  const { data, error } = await supabase.rpc('issue_sales_quote', {
    requested_organization_id: organizationId,
    requested_quote_id: cotizacionId,
  })
  if (error) throw new Error(mensajeError(error))
  return data as string
}
