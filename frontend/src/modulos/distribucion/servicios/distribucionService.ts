import { z } from 'zod'

import { supabase } from '@/lib/supabase'
import {
  esquemaProgramacionEntrega,
  esquemaLineaProgramacionEntrega,
  type DatosProgramacionEntrega,
  type ProgramacionEntrega,
} from '@/modulos/distribucion/modelo/programacionEntrega'

interface EntregaFila {
  id: string
  order_id: string
  order_number: string
  customer_name: string
  issue_date: string
  delivery_date: string
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
  order_items: unknown
  created_at: string
}

const columnas = 'id,order_id,order_number,customer_name,issue_date,delivery_date,guide_number,transport_type,tracking_status,delivery_status,direction,numero_despacho,modalidad,transportista,conductor,vehiculo,placa,evidencia,incidencias,observations,order_items,created_at' as const

export function prepararPayloadEntrega(
  organizationId: string,
  datos: DatosProgramacionEntrega,
  lineas: ProgramacionEntrega['lineas'],
  id?: string,
) {
  return {
    ...(id ? { id } : {}),
    organization_id: organizationId,
    order_id: datos.pedidoId,
    order_number: datos.pedidoNumero,
    customer_name: datos.clienteNombre,
    issue_date: datos.fechaEmision || new Date().toISOString().slice(0, 10),
    delivery_date: datos.fechaEntrega || datos.fechaProgramada,
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
    items: lineas,
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
    pedidoId: fila.order_id,
    pedidoNumero: fila.order_number,
    clienteNombre: fila.customer_name,
    direccionEntrega: fila.direction ?? '',
    numeroDespacho: fila.numero_despacho ?? '',
    numeroGuiaRemision: fila.guide_number,
    fechaEmision: fila.issue_date,
    fechaProgramada: fila.delivery_date || fila.issue_date,
    fechaEntrega: fila.delivery_date,
    tipoTransporte: fila.transport_type ?? 'interno',
    modalidad: fila.modalidad ?? 'movilidad_propia',
    transportista: fila.transportista ?? '',
    conductor: fila.conductor ?? '',
    vehiculo: fila.vehiculo ?? '',
    placa: fila.placa ?? '',
    observaciones: fila.observations ?? '',
    evidencia: fila.evidencia ?? '',
    estado: fila.delivery_status ?? 'programado',
    seguimiento: fila.tracking_status ?? 'en_curso',
    incidencias,
    lineas: lineas.success ? lineas.data : [],
  })
}

function mensajeError(error: { code?: string; message?: string }) {
  const mensaje = error.message ?? ''
  if (error.code === '23505' || mensaje.includes('DISTRIBUTION_DUPLICATE')) return 'Ya existe una entrega para este pedido o guía de remisión'
  if (error.code === '42501' || mensaje.includes('DISTRIBUTION_FORBIDDEN')) return 'No tienes permiso para administrar distribución'
  if (mensaje.includes('DISTRIBUTION_NOT_FOUND')) return 'La entrega ya no existe'
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
  return ((data ?? []) as EntregaFila[]).map(mapearEntrega)
}

export async function guardarEntrega(
  organizationId: string,
  datos: DatosProgramacionEntrega,
  lineas: ProgramacionEntrega['lineas'],
  id?: string,
) {
  const { error } = await supabase.rpc('save_distribution_delivery', {
    payload: prepararPayloadEntrega(organizationId, datos, lineas, id),
  })
  if (error) throw new Error(mensajeError(error))
}