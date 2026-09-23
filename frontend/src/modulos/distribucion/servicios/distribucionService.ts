import { z } from 'zod'

import { fechaActualPeru } from '@/lib/fechas'
import { supabase } from '@/lib/supabase'
import {
  esquemaProgramacionEntrega,
  esquemaLineaProgramacionEntrega,
  esquemaResultadoEntrega,
  type DatosProgramacionEntrega,
  type EventoResultadoEntrega,
  type ProgramacionEntrega,
  type ResultadoEntrega,
} from '@/modulos/distribucion/modelo/programacionEntrega'
import { listarPedidosPersistentes, listarVentasPersistentes } from '@/modulos/ventas/servicios/ventasService'
import { enriquecerLineasPedidoConSaldos } from '@/modulos/distribucion/modelo/pedidosProgramables'

interface EntregaFila {
  id: string
  lock_version?: number | null
  order_id: string
  sale_id?: string | null
  sale_number?: string | null
  order_number: string
  customer_name: string
  issue_date: string
  delivery_date: string
  scheduled_date?: string | null
  actual_delivery_date?: string | null
  guide_number: string
  transport_type: ProgramacionEntrega['tipoTransporte']
  tracking_status: ProgramacionEntrega['seguimiento']
  observations: string
  delivery_status?: ProgramacionEntrega['estado']
  direction?: string
  numero_despacho?: string
  modalidad?: ProgramacionEntrega['modalidad']
  transportista?: string
  conductor?: string
  vehiculo?: string
  placa?: string
  evidencia?: string
  incidencias?: unknown
  quantity_reconciliation_required?: boolean | null
  order_items: unknown
  created_at: string
}

interface ResultadoFila {
  id: string
  delivery_id: string
  result_status: EventoResultadoEntrega['resultado']
  occurred_on: string
  evidence: string
  incidents: unknown
  created_at: string
}

interface LineaResultadoFila {
  outcome_id: string
  order_line_id: string
  quantity_delivered: number | string
}

const columnas = 'id,lock_version,order_id,sale_id,sale_number,order_number,customer_name,issue_date,delivery_date,scheduled_date,actual_delivery_date,guide_number,transport_type,tracking_status,delivery_status,direction,numero_despacho,modalidad,transportista,conductor,vehiculo,placa,evidencia,incidencias,observations,quantity_reconciliation_required,order_items,created_at' as const

export function prepararPayloadEntrega(
  organizationId: string,
  datos: DatosProgramacionEntrega,
  lineas: ProgramacionEntrega['lineas'],
  id?: string,
  operationKey?: string,
) {
  return {
    ...(id ? { id } : {}),
    ...(id && datos.lockVersion ? { expected_lock_version: datos.lockVersion } : {}),
    ...(operationKey ? { operation_key: operationKey } : {}),
    organization_id: organizationId,
    order_id: datos.pedidoId,
    sale_id: datos.ventaId || null,
    order_number: datos.pedidoNumero,
    customer_name: datos.clienteNombre,
    issue_date: datos.fechaEmision || fechaActualPeru(),
    // `delivery_date` se conserva para compatibilidad con las funciones SQL
    // existentes. La migración de endurecimiento separa su significado en
    // `scheduled_date` y `actual_delivery_date` mediante un trigger.
    delivery_date: datos.fechaEntrega || datos.fechaProgramada,
    scheduled_date: datos.fechaProgramada,
    actual_delivery_date: datos.fechaEntrega || null,
    guide_number: datos.numeroGuiaRemision,
    transport_type: datos.tipoTransporte,
    tracking_status: datos.seguimiento ?? (datos.estado === 'en_curso' || datos.estado === 'en_destino' ? datos.estado : 'en_curso'),
    delivery_status: datos.estado ?? 'programado',
    direction: datos.direccionEntrega,
    numero_despacho: datos.numeroDespacho,
    modalidad: datos.modalidad,
    transportista: datos.transportista,
    conductor: datos.conductor,
    vehiculo: datos.vehiculo,
    placa: datos.placa,
    evidencia: datos.evidencia,
    incidencias: Array.isArray(datos.incidencias) ? datos.incidencias : [],
    observations: datos.observaciones,
    items: lineas.filter((linea) => linea.tipoProducto === 'good'),
  }
}

export function mapearEntrega(fila: EntregaFila): ProgramacionEntrega {
  const lineas = z.array(esquemaLineaProgramacionEntrega).safeParse(fila.order_items)
  const incidencias = Array.isArray(fila.incidencias)
    ? fila.incidencias
    : typeof fila.incidencias === 'string'
      ? fila.incidencias.split(/[,;\n]/).map((valor) => valor.trim()).filter(Boolean)
      : []

  return esquemaProgramacionEntrega.parse({
    id: fila.id,
    lockVersion: fila.lock_version ?? 1,
    pedidoId: fila.order_id,
    ventaId: fila.sale_id ?? '',
    ventaNumero: fila.sale_number ?? '',
    pedidoNumero: fila.order_number,
    clienteNombre: fila.customer_name,
    direccionEntrega: fila.direction ?? '',
    numeroDespacho: fila.numero_despacho ?? '',
    numeroGuiaRemision: fila.guide_number,
    fechaEmision: fila.issue_date,
    fechaProgramada: fila.scheduled_date || fila.delivery_date || fila.issue_date,
    fechaEntrega: fila.actual_delivery_date ?? '',
    tipoTransporte: fila.transport_type ?? 'interno',
    modalidad: fila.modalidad ?? 'movilidad_propia',
    transportista: fila.transportista ?? '',
    conductor: fila.conductor ?? '',
    vehiculo: fila.vehiculo ?? '',
    placa: fila.placa ?? '',
    observaciones: fila.observations ?? '',
    evidencia: fila.evidencia ?? '',
    estado: fila.delivery_status ?? 'programado',
    requiereConciliacionCantidades: fila.quantity_reconciliation_required ?? false,
    seguimiento: fila.tracking_status ?? 'en_curso',
    incidencias,
    lineas: lineas.success ? lineas.data : [],
  })
}

function enriquecerEntrega(
  entrega: ProgramacionEntrega,
  pedido: Awaited<ReturnType<typeof listarPedidosPersistentes>>[number] | undefined,
  venta: Awaited<ReturnType<typeof listarVentasPersistentes>>[number] | undefined,
) {
  if (!pedido) return entrega

  const lineas = enriquecerLineasPedidoConSaldos(pedido.lineas, venta)

  return esquemaProgramacionEntrega.parse({
    ...entrega,
    pedidoNumero: pedido.numero,
    clienteNombre: pedido.clienteNombre,
    ventaId: venta?.id ?? entrega.ventaId ?? '',
    ventaNumero: venta?.numeroInterno ?? entrega.ventaNumero ?? '',
    lineas,
  })
}

function mensajeError(error: { code?: string; message?: string }) {
  const mensaje = error.message ?? ''
  if (error.code === '23505' || mensaje.includes('DISTRIBUTION_DUPLICATE')) return 'Ya existe una entrega para este pedido o guía de remisión'
  if (error.code === '42501' || mensaje.includes('DISTRIBUTION_FORBIDDEN')) return 'No tienes permiso para administrar distribución'
  if (mensaje.includes('DISTRIBUTION_NOT_FOUND')) return 'La entrega ya no existe'
  if (mensaje.includes('DISTRIBUTION_VERSION_REQUIRED') || mensaje.includes('DISTRIBUTION_VERSION_CONFLICT')) return 'La entrega cambió mientras la editabas. Actualiza la lista e inténtalo nuevamente.'
  if (mensaje.includes('DISTRIBUTION_OUTCOME_RECONCILIATION_REQUIRED')) return 'Esta entrega histórica no tiene cantidades recibidas por producto. Debe conciliarse antes de registrar otro resultado.'
  if (mensaje.includes('DISTRIBUTION_OUTCOME_STATE_INVALID')) return 'La entrega debe estar en ruta o tener un resultado parcial para registrar su recepción.'
  if (mensaje.includes('DISTRIBUTION_OUTCOME_TOTAL_INCOMPLETE')) return 'Las cantidades no completan el saldo. Registra una entrega parcial o ajusta las cantidades recibidas.'
  if (mensaje.includes('DISTRIBUTION_OUTCOME_PARTIAL_INVALID')) return 'Una entrega parcial debe registrar cantidades recibidas y dejar un saldo pendiente.'
  if (mensaje.includes('DISTRIBUTION_OUTCOME_QUANTITY_EXCEEDED')) return 'La cantidad recibida supera el saldo pendiente de al menos un producto.'
  if (mensaje.includes('DISTRIBUTION_OUTCOME_EVIDENCE_REQUIRED')) return 'Registra evidencia para confirmar los bienes recibidos.'
  if (mensaje.includes('DISTRIBUTION_OUTCOME_REJECTION_INVALID')) return 'Describe una incidencia y no registres cantidades para informar un rechazo.'
  if (mensaje.includes('DISTRIBUTION_OUTCOME_DUPLICATE_LINE')) return 'Cada producto debe aparecer una sola vez en el resultado.'
  if (mensaje.includes('DISTRIBUTION_OUTCOME')) return 'No se pudo registrar el resultado. Actualiza la entrega y revisa las cantidades ingresadas.'
  if (mensaje.includes('DISTRIBUTION_DIRECTION_REQUIRED')) return 'Ingresa la dirección de entrega'
  if (mensaje.includes('DISTRIBUTION_ORDER_NOT_FOUND')) return 'El pedido persistente no existe en esta organización'
  if (mensaje.includes('DISTRIBUTION_ORDER_NOT_AVAILABLE')) return 'El pedido cancelado no puede programarse'
  if (mensaje.includes('DISTRIBUTION_ORDER_NOT_DISPATCHED')) return 'Completa el despacho de todos los bienes en Ventas antes de programar la entrega'
  if (mensaje.includes('DISTRIBUTION_PICKUP_NOT_SUPPORTED')) return 'Los pedidos de recojo del cliente no se programan en Distribución'
  if (mensaje.includes('DISTRIBUTION_ORDER_MISMATCH')) return 'La entrega no puede cambiar de pedido'
  if (mensaje.includes('DISTRIBUTION_FULFILLMENT_MODE_LOCKED')) return 'La modalidad del pedido ya está en ejecución y no puede cambiarse'
  if (mensaje.includes('DISTRIBUTION_FULFILLMENT_MODE_MISMATCH')) return 'La modalidad del pedido es recojo del cliente; no requiere una entrega en ruta'
  if (mensaje.includes('DISTRIBUTION_ORDER_ITEMS_REQUIRED')) return 'El pedido no tiene líneas persistentes'
  if (mensaje.includes('DISTRIBUTION_SALE_REQUIRED')) return 'El pedido todavía no tiene una venta persistente'
  if (mensaje.includes('DISTRIBUTION_SALE_MISMATCH')) return 'La venta no corresponde al pedido seleccionado'
  if (mensaje.includes('DISTRIBUTION_GOODS_REQUIRED')) return 'Solo se pueden programar entregas para bienes físicos'
  if (mensaje.includes('ORDER_SERVICE_PRODUCT_TYPE_UNKNOWN')) return 'El pedido histórico no tiene tipo de producto reconstruible'
  if (mensaje.includes('DISTRIBUTION_DISPATCH_NUMBER_REQUIRED')) return 'Ingresa el número de despacho'
  if (mensaje.includes('DISTRIBUTION_GUIDE_REQUIRED')) return 'Ingresa el número de guía de remisión'
  if (mensaje.includes('DISTRIBUTION_TRANSPORT_INVALID')) return 'Selecciona un tipo de transporte válido'
  if (mensaje.includes('DISTRIBUTION_MODALITY_INVALID')) return 'Selecciona una modalidad válida'
  if (mensaje.includes('DISTRIBUTION_INCIDENTS_INVALID')) return 'Las incidencias no tienen un formato válido'
  if (mensaje.includes('distribution_deliveries_transport_data_required')) return 'Completa conductor, vehículo y placa antes de iniciar la entrega'
  if (mensaje.includes('distribution_deliveries_external_carrier_required')) return 'Ingresa el transportista para movilidad externa'
  if (mensaje.includes('distribution_deliveries_evidence_required')) return 'Registra la evidencia antes de marcar la entrega como entregada'
  if (mensaje.includes('distribution_deliveries_incidents_required')) return 'Registra una incidencia para este estado'
  if (mensaje.includes('DISTRIBUTION_') && error.code === '22023') return 'Revisa los datos de la entrega'
  return 'No se pudo guardar la entrega'
}

export async function listarEntregas(organizationId: string) {
  const { data, error } = await supabase
    .from('distribution_deliveries')
    .select(columnas)
    .eq('organization_id', organizationId)
    .order('delivery_date', { ascending: true })
    .order('id', { ascending: false })
  if (error) throw new Error(mensajeError(error))
  const entregas = ((data ?? []) as EntregaFila[]).map(mapearEntrega)
  if (!entregas.length) return entregas

  // order_items se conserva solo como snapshot histórico. La lectura vigente
  // reconstruye las líneas desde SQL y los saldos desde reservas persistentes.
  // Los eventos se leen por organización en consultas de conjunto, evitando
  // construir una URL PostgREST con listas de IDs potencialmente extensas.
  const [pedidos, ventas, outcomesResponse] = await Promise.all([
    listarPedidosPersistentes(organizationId),
    listarVentasPersistentes(organizationId),
    supabase
      .from('distribution_delivery_outcomes')
      .select('id,delivery_id,result_status,occurred_on,evidence,incidents,created_at')
      .eq('organization_id', organizationId)
      .order('occurred_on', { ascending: true })
      .order('created_at', { ascending: true }),
  ])
  if (outcomesResponse.error) throw new Error(mensajeError(outcomesResponse.error))
  const outcomes = (outcomesResponse.data ?? []) as ResultadoFila[]
  const outcomeLinesResponse = outcomes.length
    ? await supabase
      .from('distribution_delivery_outcome_lines')
      .select('outcome_id,order_line_id,quantity_delivered')
      .eq('organization_id', organizationId)
    : { data: [], error: null }
  if (outcomeLinesResponse.error) throw new Error(mensajeError(outcomeLinesResponse.error))

  const linesByOutcomeId = new Map<string, EventoResultadoEntrega['lineas']>()
  for (const line of (outcomeLinesResponse.data ?? []) as LineaResultadoFila[]) {
    const lines = linesByOutcomeId.get(line.outcome_id) ?? []
    lines.push({ orderLineId: line.order_line_id, cantidad: Number(line.quantity_delivered) })
    linesByOutcomeId.set(line.outcome_id, lines)
  }
  const outcomesByDeliveryId = new Map<string, EventoResultadoEntrega[]>()
  for (const outcome of outcomes) {
    const lines = linesByOutcomeId.get(outcome.id) ?? []
    const event = {
      id: outcome.id,
      resultado: outcome.result_status,
      fecha: outcome.occurred_on,
      evidencia: outcome.evidence,
      incidencias: Array.isArray(outcome.incidents) ? outcome.incidents.filter((value): value is string => typeof value === 'string') : [],
      lineas: lines,
    } satisfies EventoResultadoEntrega
    const events = outcomesByDeliveryId.get(outcome.delivery_id) ?? []
    events.push(event)
    outcomesByDeliveryId.set(outcome.delivery_id, events)
  }
  const pedidosPorId = new Map(pedidos.map((pedido) => [pedido.id, pedido]))
  const ventasPorPedidoId = new Map(ventas.map((venta) => [venta.pedidoId, venta]))

  return entregas.map((entrega) => {
    const eventos = outcomesByDeliveryId.get(entrega.id) ?? []
    const cantidadesRecibidas = new Map<string, number>()
    for (const evento of eventos) {
      for (const linea of evento.lineas) {
        cantidadesRecibidas.set(linea.orderLineId, (cantidadesRecibidas.get(linea.orderLineId) ?? 0) + linea.cantidad)
      }
    }
    const enriquecida = enriquecerEntrega(
      entrega,
      pedidosPorId.get(entrega.pedidoId),
      ventasPorPedidoId.get(entrega.pedidoId),
    )
    return esquemaProgramacionEntrega.parse({
      ...enriquecida,
      resultadosEntrega: eventos,
      lineas: enriquecida.lineas.map((linea) => {
        const cantidadEntregadaCliente = cantidadesRecibidas.get(linea.id) ?? 0
        return {
          ...linea,
          cantidadEntregadaCliente,
          cantidadPendienteCliente: Math.max(0, linea.cantidad - cantidadEntregadaCliente),
        }
      }),
    })
  })
}

export async function guardarEntrega(
  organizationId: string,
  datos: DatosProgramacionEntrega,
  lineas: ProgramacionEntrega['lineas'],
  id?: string,
  operationKey: string = crypto.randomUUID(),
) {
  const { error } = await supabase.rpc('save_distribution_delivery', {
    payload: prepararPayloadEntrega(organizationId, datos, lineas, id, operationKey),
  })
  if (error) throw new Error(mensajeError(error))
}

export async function registrarResultadoEntrega(
  organizationId: string,
  resultado: ResultadoEntrega,
  operationKey: string = crypto.randomUUID(),
) {
  const datos = esquemaResultadoEntrega.parse(resultado)
  const { error } = await supabase.rpc('record_distribution_delivery_outcome', {
    payload: {
      organizationId,
      entregaId: datos.entregaId,
      expectedLockVersion: datos.lockVersion,
      operationKey,
      resultado: datos.resultado,
      fecha: datos.fecha,
      evidencia: datos.evidencia,
      incidencias: datos.incidencias,
      lineas: datos.lineas,
    },
  })
  if (error) throw new Error(mensajeError(error))
}
