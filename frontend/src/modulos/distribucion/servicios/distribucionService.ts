import { supabase } from '@/lib/supabase'
import type {
  DatosDevolucionEntrega,
  DatosEntrega,
  DatosIncidenciaEntrega,
  DatosTransicionEntrega,
  DevolucionEntrega,
  EstadoEntrega,
  EventoEntrega,
  EvidenciaEntrega,
  IncidenciaEntrega,
  PedidoFuenteDistribucion,
  ProgramacionEntrega,
  TipoEvidencia,
} from '@/modulos/distribucion/modelo/programacionEntrega'

interface FilaOrden {
  id: string
  source_order_id: string
  order_number: string
  customer_id: string | null
  customer_document: string | null
  customer_name: string
  order_date: string
  delivery_address: string
  delivery_reference: string | null
  contact_name: string | null
  contact_phone: string | null
  status: PedidoFuenteDistribucion['estado']
}

interface FilaOrdenItem {
  id: string
  distribution_order_id: string
  source_item_id: string
  product_id: string | null
  product_code: string
  product_description: string
  unit_of_measure: string
  ordered_quantity: number | string
}

interface FilaEntrega {
  id: string
  distribution_order_id: string
  order_id: string
  order_number: string
  customer_name: string
  issue_date: string
  delivery_date: string
  guide_number: string
  transport_type: ProgramacionEntrega['tipoTransporte']
  tracking_status: EstadoEntrega
  observations: string
  sequence_number: number
  destination_address: string
  destination_reference: string | null
  contact_name: string | null
  contact_phone: string | null
  carrier_name: string | null
  carrier_document: string | null
  driver_name: string | null
  driver_document: string | null
  driver_license: string | null
  vehicle_plate: string | null
  started_at: string | null
  completed_at: string | null
}

interface FilaEntregaItem {
  id: string
  delivery_id: string
  order_item_id: string
  shipped_quantity: number | string
  delivered_quantity: number | string
  rejected_quantity: number | string
  returned_quantity: number | string
  lot_number: string | null
  expiration_date: string | null
}

type ErrorSupabase = { code?: string; message?: string }

const columnasEntrega = [
  'id', 'distribution_order_id', 'order_id', 'order_number', 'customer_name',
  'issue_date', 'delivery_date', 'guide_number', 'transport_type', 'tracking_status',
  'observations', 'sequence_number', 'destination_address', 'destination_reference',
  'contact_name', 'contact_phone', 'carrier_name', 'carrier_document', 'driver_name',
  'driver_document', 'driver_license', 'vehicle_plate', 'started_at', 'completed_at',
].join(',')

function mensajeError(error: ErrorSupabase) {
  const mensaje = error.message ?? ''
  const reglas: Array<[string, string]> = [
    ['DISTRIBUTION_FORBIDDEN', 'No tienes permiso para completar esta operación'],
    ['DISTRIBUTION_DUPLICATE', 'La guía o el pedido ya están registrados'],
    ['DISTRIBUTION_NOT_FOUND', 'La entrega ya no existe'],
    ['DISTRIBUTION_NOT_EDITABLE', 'La entrega ya inició y no puede editarse'],
    ['DISTRIBUTION_QUANTITY_EXCEEDED', 'La cantidad supera el saldo pendiente del pedido'],
    ['DISTRIBUTION_DATE_INVALID', 'La fecha de entrega no puede estar en el pasado'],
    ['DISTRIBUTION_TRANSITION_INVALID', 'Ese cambio de estado no está permitido'],
    ['DISTRIBUTION_RESULT_QUANTITY_INVALID', 'Las cantidades entregadas y rechazadas deben completar lo enviado'],
    ['DISTRIBUTION_REPROGRAM_REASON_REQUIRED', 'Ingresa la nueva fecha y el motivo de reprogramación'],
    ['DISTRIBUTION_RETURN_QUANTITY_INVALID', 'La devolución supera la cantidad disponible'],
    ['DISTRIBUTION_EVIDENCE_FILE_NOT_FOUND', 'El archivo no quedó disponible en el almacenamiento'],
    ['DISTRIBUTION_TRANSPORT_DETAILS_REQUIRED', 'Completa conductor y vehículo'],
    ['DISTRIBUTION_CARRIER_REQUIRED', 'Ingresa el transportista externo'],
  ]
  const coincidencia = reglas.find(([codigo]) => mensaje.includes(codigo))
  if (coincidencia) return coincidencia[1]
  if (error.code === '23505') return 'La guía ya está registrada'
  if (error.code === '42501') return 'No tienes permiso para completar esta operación'
  return 'No se pudo completar la operación de distribución'
}

function exigir<T>(resultado: { data: T | null; error: ErrorSupabase | null }) {
  if (resultado.error) throw new Error(mensajeError(resultado.error))
  return resultado.data
}

function agruparPor<T>(elementos: T[], obtenerClave: (elemento: T) => string) {
  const grupos = new Map<string, T[]>()
  for (const elemento of elementos) {
    const clave = obtenerClave(elemento)
    const grupo = grupos.get(clave) ?? []
    grupo.push(elemento)
    grupos.set(clave, grupo)
  }
  return grupos
}

export async function listarDistribucion(organizationId: string) {
  const [
    entregasResultado,
    ordenesResultado,
    ordenItemsResultado,
    entregaItemsResultado,
    eventosResultado,
    incidenciasResultado,
    evidenciasResultado,
    devolucionesResultado,
  ] = await Promise.all([
    supabase.from('distribution_deliveries').select(columnasEntrega).eq('organization_id', organizationId).order('delivery_date').order('sequence_number'),
    supabase.from('distribution_orders').select('id,source_order_id,order_number,customer_id,customer_document,customer_name,order_date,delivery_address,delivery_reference,contact_name,contact_phone,status').eq('organization_id', organizationId).order('order_date', { ascending: false }),
    supabase.from('distribution_order_items').select('id,distribution_order_id,source_item_id,product_id,product_code,product_description,unit_of_measure,ordered_quantity').eq('organization_id', organizationId),
    supabase.from('distribution_delivery_items').select('id,delivery_id,order_item_id,shipped_quantity,delivered_quantity,rejected_quantity,returned_quantity,lot_number,expiration_date').eq('organization_id', organizationId),
    supabase.from('distribution_delivery_events').select('id,delivery_id,event_type,previous_status,new_status,description,metadata,occurred_at').eq('organization_id', organizationId).order('occurred_at', { ascending: false }),
    supabase.from('distribution_incidents').select('id,delivery_id,incident_type,severity,description,status,resolution,occurred_at,resolved_at').eq('organization_id', organizationId).order('occurred_at', { ascending: false }),
    supabase.from('distribution_evidence').select('id,delivery_id,evidence_type,file_name,storage_path,mime_type,file_size,notes,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    supabase.from('distribution_returns').select('id,delivery_id,reason,notes,status,occurred_at').eq('organization_id', organizationId).order('occurred_at', { ascending: false }),
  ])

  const entregas = (exigir(entregasResultado) ?? []) as unknown as FilaEntrega[]
  const ordenes = (exigir(ordenesResultado) ?? []) as unknown as FilaOrden[]
  const ordenItems = (exigir(ordenItemsResultado) ?? []) as unknown as FilaOrdenItem[]
  const entregaItems = (exigir(entregaItemsResultado) ?? []) as unknown as FilaEntregaItem[]
  const eventos = exigir(eventosResultado) ?? []
  const incidencias = exigir(incidenciasResultado) ?? []
  const evidencias = exigir(evidenciasResultado) ?? []
  const devoluciones = exigir(devolucionesResultado) ?? []

  const ordenPorId = new Map(ordenes.map((orden) => [orden.id, orden]))
  const ordenItemPorId = new Map(ordenItems.map((item) => [item.id, item]))
  const lineasPorOrden = agruparPor(ordenItems, (item) => item.distribution_order_id)
  const lineasPorEntrega = agruparPor(entregaItems, (item) => item.delivery_id)
  const eventosPorEntrega = agruparPor(eventos, (item) => item.delivery_id)
  const incidenciasPorEntrega = agruparPor(incidencias, (item) => item.delivery_id)
  const evidenciasPorEntrega = agruparPor(evidencias, (item) => item.delivery_id)
  const devolucionesPorEntrega = agruparPor(devoluciones, (item) => item.delivery_id)

  const pedidos: PedidoFuenteDistribucion[] = ordenes.map((orden) => ({
    id: orden.source_order_id,
    numero: orden.order_number,
    clienteId: orden.customer_id,
    clienteDocumento: orden.customer_document ?? '',
    clienteNombre: orden.customer_name,
    fechaPedido: orden.order_date,
    direccionEntrega: orden.delivery_address,
    referenciaEntrega: orden.delivery_reference ?? '',
    contactoNombre: orden.contact_name ?? '',
    contactoTelefono: orden.contact_phone ?? '',
    estado: orden.status,
    lineas: (lineasPorOrden.get(orden.id) ?? []).map((item) => ({
      id: item.source_item_id,
      productoId: item.product_id ?? '',
      productoCodigo: item.product_code,
      productoDescripcion: item.product_description,
      unidadMedida: item.unit_of_measure,
      cantidadOrdenada: Number(item.ordered_quantity),
    })),
  }))

  const programaciones: ProgramacionEntrega[] = entregas.map((entrega) => {
    const orden = ordenPorId.get(entrega.distribution_order_id)
    const lineas = (lineasPorEntrega.get(entrega.id) ?? [])
      .map((item) => {
        const ordenItem = ordenItemPorId.get(item.order_item_id)
        if (!ordenItem) return null
        return {
          id: item.id,
          ordenLineaId: ordenItem.id,
          fuenteLineaId: ordenItem.source_item_id,
          productoId: ordenItem.product_id,
          productoCodigo: ordenItem.product_code,
          productoDescripcion: ordenItem.product_description,
          unidadMedida: ordenItem.unit_of_measure,
          cantidadOrdenada: Number(ordenItem.ordered_quantity),
          cantidadEnviada: Number(item.shipped_quantity),
          cantidadEntregada: Number(item.delivered_quantity),
          cantidadRechazada: Number(item.rejected_quantity),
          cantidadDevuelta: Number(item.returned_quantity),
          lote: item.lot_number ?? '',
          fechaVencimiento: item.expiration_date ?? '',
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    return {
      id: entrega.id,
      ordenDistribucionId: entrega.distribution_order_id,
      pedidoId: entrega.order_id,
      pedidoNumero: entrega.order_number,
      clienteNombre: entrega.customer_name,
      clienteDocumento: orden?.customer_document ?? '',
      fechaPedido: orden?.order_date ?? entrega.issue_date,
      fechaEmision: entrega.issue_date,
      fechaEntrega: entrega.delivery_date,
      numeroGuiaRemision: entrega.guide_number,
      tipoTransporte: entrega.transport_type,
      seguimiento: entrega.tracking_status,
      secuencia: entrega.sequence_number,
      direccionEntrega: entrega.destination_address,
      referenciaEntrega: entrega.destination_reference ?? '',
      contactoNombre: entrega.contact_name ?? '',
      contactoTelefono: entrega.contact_phone ?? '',
      transportistaNombre: entrega.carrier_name ?? '',
      transportistaDocumento: entrega.carrier_document ?? '',
      conductorNombre: entrega.driver_name ?? '',
      conductorDocumento: entrega.driver_document ?? '',
      conductorLicencia: entrega.driver_license ?? '',
      vehiculoPlaca: entrega.vehicle_plate ?? '',
      observaciones: entrega.observations,
      iniciadaEn: entrega.started_at,
      completadaEn: entrega.completed_at,
      lineas,
      eventos: (eventosPorEntrega.get(entrega.id) ?? []).map((evento): EventoEntrega => ({
        id: Number(evento.id), tipo: evento.event_type,
        estadoAnterior: evento.previous_status as EstadoEntrega | null,
        estadoNuevo: evento.new_status as EstadoEntrega | null,
        descripcion: evento.description, metadata: evento.metadata as Record<string, unknown>,
        ocurridoEn: evento.occurred_at,
      })),
      incidencias: (incidenciasPorEntrega.get(entrega.id) ?? []).map((incidencia): IncidenciaEntrega => ({
        id: incidencia.id, tipo: incidencia.incident_type as IncidenciaEntrega['tipo'],
        severidad: incidencia.severity as IncidenciaEntrega['severidad'],
        descripcion: incidencia.description, estado: incidencia.status as IncidenciaEntrega['estado'],
        resolucion: incidencia.resolution ?? '', ocurridaEn: incidencia.occurred_at,
        resueltaEn: incidencia.resolved_at,
      })),
      evidencias: (evidenciasPorEntrega.get(entrega.id) ?? []).map((evidencia): EvidenciaEntrega => ({
        id: evidencia.id, tipo: evidencia.evidence_type as EvidenciaEntrega['tipo'],
        nombreArchivo: evidencia.file_name, ruta: evidencia.storage_path,
        tipoMime: evidencia.mime_type, tamano: Number(evidencia.file_size),
        notas: evidencia.notes ?? '', creadaEn: evidencia.created_at,
      })),
      devoluciones: (devolucionesPorEntrega.get(entrega.id) ?? []).map((devolucion): DevolucionEntrega => ({
        id: devolucion.id, motivo: devolucion.reason, notas: devolucion.notes ?? '',
        estado: devolucion.status as DevolucionEntrega['estado'], ocurridaEn: devolucion.occurred_at,
      })),
    }
  })

  return { pedidos, programaciones }
}

export async function guardarEntrega(organizationId: string, datos: DatosEntrega, id?: string) {
  const { error } = await supabase.rpc('save_distribution_delivery', {
    payload: {
      ...(id ? { id } : {}),
      organization_id: organizationId,
      delivery_date: datos.fechaEntrega,
      guide_number: datos.numeroGuiaRemision,
      transport_type: datos.tipoTransporte,
      carrier_name: datos.transportistaNombre,
      carrier_document: datos.transportistaDocumento,
      driver_name: datos.conductorNombre,
      driver_document: datos.conductorDocumento,
      driver_license: datos.conductorLicencia,
      vehicle_plate: datos.vehiculoPlaca,
      destination_address: datos.direccionEntrega,
      destination_reference: datos.referenciaEntrega,
      contact_name: datos.contactoNombre,
      contact_phone: datos.contactoTelefono,
      observations: datos.observaciones,
      order: {
        id: datos.pedido.id,
        number: datos.pedido.numero,
        customer_id: datos.pedido.clienteId,
        customer_document: datos.pedido.clienteDocumento,
        customer_name: datos.pedido.clienteNombre,
        order_date: datos.pedido.fechaPedido,
        delivery_address: datos.direccionEntrega,
        delivery_reference: datos.referenciaEntrega,
        contact_name: datos.contactoNombre,
        contact_phone: datos.contactoTelefono,
        items: datos.pedido.lineas.map((linea) => ({
          id: linea.id, product_id: linea.productoId, product_code: linea.productoCodigo,
          product_description: linea.productoDescripcion, unit_of_measure: linea.unidadMedida,
          ordered_quantity: linea.cantidadOrdenada,
        })),
      },
      delivery_items: datos.lineas.map((linea) => ({
        source_item_id: linea.fuenteLineaId,
        shipped_quantity: linea.cantidad,
        lot_number: linea.lote,
        expiration_date: linea.fechaVencimiento,
      })),
    },
  })
  if (error) throw new Error(mensajeError(error))
}

export async function transicionarEntrega(organizationId: string, deliveryId: string, datos: DatosTransicionEntrega) {
  const { error } = await supabase.rpc('transition_distribution_delivery', {
    payload: {
      organization_id: organizationId, delivery_id: deliveryId, status: datos.estado,
      description: datos.descripcion, delivery_date: datos.fechaEntrega,
      items: datos.lineas?.map((linea) => ({
        id: linea.id, delivered_quantity: linea.cantidadEntregada,
        rejected_quantity: linea.cantidadRechazada,
      })),
    },
  })
  if (error) throw new Error(mensajeError(error))
}

export async function guardarIncidencia(organizationId: string, deliveryId: string, datos: DatosIncidenciaEntrega) {
  const { error } = await supabase.rpc('save_distribution_incident', {
    payload: {
      organization_id: organizationId, delivery_id: deliveryId, id: datos.id,
      incident_type: datos.tipo, severity: datos.severidad, description: datos.descripcion,
      status: datos.estado, resolution: datos.resolucion,
    },
  })
  if (error) throw new Error(mensajeError(error))
}

export async function registrarDevolucion(organizationId: string, deliveryId: string, datos: DatosDevolucionEntrega) {
  const { error } = await supabase.rpc('register_distribution_return', {
    payload: {
      organization_id: organizationId, delivery_id: deliveryId,
      reason: datos.motivo, notes: datos.notas,
      items: datos.lineas.map((linea) => ({
        delivery_item_id: linea.entregaLineaId, quantity: linea.cantidad,
        item_condition: linea.condicion,
      })),
    },
  })
  if (error) throw new Error(mensajeError(error))
}

const tiposArchivoPermitidos = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

export async function subirEvidencia(
  organizationId: string,
  deliveryId: string,
  archivo: File,
  tipo: TipoEvidencia,
  notas: string,
) {
  if (!tiposArchivoPermitidos.has(archivo.type)) throw new Error('Adjunta una imagen JPG, PNG, WEBP o un PDF')
  if (archivo.size > 10 * 1024 * 1024) throw new Error('El archivo no puede superar 10 MB')
  const nombreSeguro = archivo.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-')
  const ruta = `${organizationId}/${deliveryId}/${crypto.randomUUID()}-${nombreSeguro}`
  const { error: uploadError } = await supabase.storage.from('distribution-evidence').upload(ruta, archivo, {
    contentType: archivo.type, upsert: false,
  })
  if (uploadError) throw new Error('No se pudo cargar la evidencia')
  const { error } = await supabase.rpc('register_distribution_evidence', {
    payload: {
      organization_id: organizationId, delivery_id: deliveryId, evidence_type: tipo,
      file_name: archivo.name, storage_path: ruta, mime_type: archivo.type,
      file_size: archivo.size, notes: notas,
    },
  })
  if (error) throw new Error(mensajeError(error))
}

export async function obtenerUrlEvidencia(ruta: string) {
  const { data, error } = await supabase.storage.from('distribution-evidence').createSignedUrl(ruta, 60)
  if (error) throw new Error('No se pudo abrir la evidencia')
  return data.signedUrl
}
