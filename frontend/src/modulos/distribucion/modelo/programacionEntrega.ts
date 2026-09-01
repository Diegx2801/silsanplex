import { z } from 'zod'

import { esquemaLineaOperacionVenta } from '@/modulos/ventas/modelo/operacionVenta'

export const MODALIDADES_DISTRIBUCION = ['movilidad_propia', 'movilidad_externa', 'recojo_cliente'] as const
export const ESTADOS_DISTRIBUCION = [
  'programado',
  'preparando',
  'en_curso',
  'en_destino',
  'entregado',
  'entrega_parcial',
  'reprogramado',
  'rechazado',
  'devuelto',
  'cancelado',
] as const

export const esquemaLineaProgramacionEntrega = esquemaLineaOperacionVenta

export const esquemaProgramacionEntrega = z.object({
  id: z.string().min(1),
  pedidoId: z.string().min(1),
  pedidoNumero: z.string().min(1),
  ventaId: z.string().optional().default(''),
  ventaNumero: z.string().optional().default(''),
  clienteNombre: z.string().min(1),
  direccionEntrega: z.string().trim().min(1, 'Ingresa la dirección de entrega').default(''),
  numeroDespacho: z.string().trim().min(1, 'Ingresa el número de despacho').max(40).default(''),
  numeroGuiaRemision: z.string().trim().max(40).default(''),
  fechaEmision: z.string().min(1),
  fechaProgramada: z.string().min(1, 'Selecciona la fecha programada'),
  fechaEntrega: z.string().optional().default(''),
  tipoTransporte: z.enum(['interno', 'externo', 'cliente']).default('interno'),
  modalidad: z.enum(MODALIDADES_DISTRIBUCION).default('movilidad_propia'),
  transportista: z.string().trim().max(120).default(''),
  conductor: z.string().trim().max(120).default(''),
  vehiculo: z.string().trim().max(120).default(''),
  placa: z.string().trim().max(20).default(''),
  observaciones: z.string().trim().max(500, 'Máximo 500 caracteres').default(''),
  evidencia: z.string().trim().max(255).default(''),
  estado: z.enum(ESTADOS_DISTRIBUCION).default('programado'),
  incidencias: z.array(z.string().trim().max(200)).default([]),
  seguimiento: z.enum(['en_curso', 'en_destino']).optional(),
  lineas: z.array(esquemaLineaProgramacionEntrega).default([]),
})

export type ProgramacionEntrega = z.infer<typeof esquemaProgramacionEntrega>

export const esquemaDatosProgramacionEntrega = z.object({
  pedidoId: z.string().min(1),
  pedidoNumero: z.string().min(1),
  ventaId: z.string().optional().default(''),
  ventaNumero: z.string().optional().default(''),
  clienteNombre: z.string().min(1),
  direccionEntrega: z.string().trim().min(1, 'Ingresa la dirección de entrega').default(''),
  numeroDespacho: z.string().trim().max(40).default(''),
  numeroGuiaRemision: z.string().trim().max(40).default(''),
  fechaEmision: z.string().min(1).optional().default(''),
  fechaProgramada: z.string().min(1, 'Selecciona la fecha programada'),
  fechaEntrega: z.string().optional().default(''),
  tipoTransporte: z.enum(['interno', 'externo', 'cliente']).default('interno'),
  modalidad: z.enum(MODALIDADES_DISTRIBUCION).default('movilidad_propia'),
  transportista: z.string().trim().max(120).default(''),
  conductor: z.string().trim().max(120).default(''),
  vehiculo: z.string().trim().max(120).default(''),
  placa: z.string().trim().max(20).default(''),
  observaciones: z.string().trim().max(500, 'Máximo 500 caracteres').default(''),
  evidencia: z.string().trim().max(255).default(''),
  estado: z.enum(ESTADOS_DISTRIBUCION).default('programado'),
  seguimiento: z.enum(['en_curso', 'en_destino']).optional(),
  incidencias: z.array(z.string().trim().max(200)).default([]),
  lineas: z.array(esquemaLineaProgramacionEntrega).optional().default([]),
})

export type DatosProgramacionEntrega = z.infer<typeof esquemaDatosProgramacionEntrega>

export function crearProgramacionEntrega(
  datos: DatosProgramacionEntrega,
  fechaEmision = new Date().toISOString().slice(0, 10),
  lineas: ProgramacionEntrega['lineas'] = [],
): ProgramacionEntrega {
  return {
    ...datos,
    id: crypto.randomUUID(),
    fechaEmision: datos.fechaEmision || fechaEmision,
    fechaEntrega: datos.fechaEntrega ?? '',
    seguimiento: datos.estado === 'en_curso' || datos.estado === 'en_destino' ? datos.estado : undefined,
    lineas: datos.lineas && datos.lineas.length ? datos.lineas : lineas,
  }
}

function normalizarTexto(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE')
}

export type FiltroProgramacionesEntrega = {
  busqueda?: string
  estado?: 'todos' | ProgramacionEntrega['estado']
  fecha?: string
}

export function filtrarProgramacionesEntrega(
  programaciones: readonly ProgramacionEntrega[],
  filtro: FiltroProgramacionesEntrega = {},
): ProgramacionEntrega[] {
  const busqueda = normalizarTexto(filtro.busqueda ?? '')
  const estado = filtro.estado ?? 'todos'
  const fecha = filtro.fecha ?? ''

  return programaciones.filter((item) => {
    const coincideBusqueda = !busqueda || normalizarTexto(`${item.pedidoNumero} ${item.clienteNombre} ${item.numeroGuiaRemision}`).includes(busqueda)
    const coincideEstado = estado === 'todos' || item.estado === estado
    const coincideFecha = !fecha || [item.fechaEmision, item.fechaProgramada, item.fechaEntrega].some((valor) => valor === fecha)

    return coincideBusqueda && coincideEstado && coincideFecha
  })
}

export type ResumenEntregas = {
  total: number
  programados: number
  enCurso: number
  enDestino: number
  entregados: number
  atrasadas: number
  conIncidencias: number
}

export function resumirEntregas(
  programaciones: readonly ProgramacionEntrega[],
  fechaReferencia: string,
): ResumenEntregas {
  const hoy = new Date(`${fechaReferencia}T12:00:00`)

  return programaciones.reduce<ResumenEntregas>(
    (resumen, entrega) => {
      const fechaProgramada = entrega.fechaProgramada ? new Date(`${entrega.fechaProgramada}T12:00:00`) : null
      const retrasada = fechaProgramada ? fechaProgramada < hoy && entrega.estado !== 'entregado' && entrega.estado !== 'cancelado' : false

      resumen.total += 1
      if (entrega.estado === 'programado') resumen.programados += 1
      if (entrega.estado === 'en_curso') resumen.enCurso += 1
      if (entrega.estado === 'en_destino') resumen.enDestino += 1
      if (entrega.estado === 'entregado') resumen.entregados += 1
      if (retrasada) resumen.atrasadas += 1
      if (entrega.incidencias.length > 0) resumen.conIncidencias += 1
      return resumen
    },
    { total: 0, programados: 0, enCurso: 0, enDestino: 0, entregados: 0, atrasadas: 0, conIncidencias: 0 },
  )
}