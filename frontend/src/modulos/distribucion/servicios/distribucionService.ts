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
  order_items: unknown
  created_at: string
}

const columnas = 'id,order_id,order_number,customer_name,issue_date,delivery_date,guide_number,transport_type,tracking_status,observations,order_items,created_at' as const

function mapearEntrega(fila: EntregaFila): ProgramacionEntrega {
  const lineas = z.array(esquemaLineaProgramacionEntrega).safeParse(fila.order_items)
  return esquemaProgramacionEntrega.parse({
    id: fila.id,
    pedidoId: fila.order_id,
    pedidoNumero: fila.order_number,
    clienteNombre: fila.customer_name,
    fechaEmision: fila.issue_date,
    fechaEntrega: fila.delivery_date,
    numeroGuiaRemision: fila.guide_number,
    tipoTransporte: fila.transport_type,
    seguimiento: fila.tracking_status,
    observaciones: fila.observations,
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
    payload: {
      ...(id ? { id } : {}),
      organization_id: organizationId,
      order_id: datos.pedidoId,
      order_number: datos.pedidoNumero,
      customer_name: datos.clienteNombre,
      issue_date: new Date().toISOString().slice(0, 10),
      delivery_date: datos.fechaEntrega,
      guide_number: datos.numeroGuiaRemision,
      transport_type: datos.tipoTransporte,
      tracking_status: datos.seguimiento,
      observations: datos.observaciones,
      items: lineas,
    },
  })
  if (error) throw new Error(mensajeError(error))
}