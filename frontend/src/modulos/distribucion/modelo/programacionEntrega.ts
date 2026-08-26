import { z } from 'zod'

import { esquemaLineaOperacionVenta } from '@/modulos/ventas/modelo/operacionVenta'

export const esquemaLineaProgramacionEntrega = esquemaLineaOperacionVenta

export const esquemaProgramacionEntrega = z.object({
  id: z.string().min(1),
  pedidoId: z.string().min(1),
  pedidoNumero: z.string().min(1),
  clienteNombre: z.string().min(1),
  fechaEmision: z.string().min(1),
  fechaEntrega: z.string().min(1, 'Selecciona la fecha de entrega'),
  numeroGuiaRemision: z.string().trim().min(1, 'Ingresa el número de guía de remisión').max(40),
  tipoTransporte: z.enum(['interno', 'externo']),
  observaciones: z.string().trim().max(500, 'Máximo 500 caracteres'),
  seguimiento: z.enum(['en_curso', 'en_destino']),
  lineas: z.array(esquemaLineaProgramacionEntrega).default([]),
})

export type ProgramacionEntrega = z.infer<typeof esquemaProgramacionEntrega>

export const esquemaDatosProgramacionEntrega = esquemaProgramacionEntrega.pick({
  pedidoId: true,
  pedidoNumero: true,
  clienteNombre: true,
  fechaEntrega: true,
  numeroGuiaRemision: true,
  tipoTransporte: true,
  observaciones: true,
  seguimiento: true,
})

export type DatosProgramacionEntrega = z.infer<typeof esquemaDatosProgramacionEntrega>

export function crearProgramacionEntrega(
  datos: DatosProgramacionEntrega,
  fechaEmision = new Date().toISOString().slice(0, 10),
  lineas: ProgramacionEntrega['lineas'] = [],
): ProgramacionEntrega {
  return { ...datos, id: crypto.randomUUID(), fechaEmision, lineas }
}