import { z } from 'zod'

import { fechaActualPeru } from '@/lib/fechas'
import { esquemaLineaOperacionVenta } from '@/modulos/ventas/modelo/operacionVenta'

const ESTADOS_CON_ENTREGA_FISICA = ['entregado', 'entrega_parcial'] as const
const ESTADOS_EN_RUTA = ['en_curso', 'en_destino', ...ESTADOS_CON_ENTREGA_FISICA] as const

function esFechaCalendarioValida(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00.000Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

export const MODALIDADES_DISTRIBUCION = ['movilidad_propia', 'movilidad_externa', 'recojo_cliente'] as const
export const TIPOS_TRANSPORTE_DISTRIBUCION = ['interno', 'externo'] as const
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

export const TRANSICIONES_DISTRIBUCION: Record<ProgramacionEntrega['estado'], readonly ProgramacionEntrega['estado'][]> = {
  programado: ['preparando', 'reprogramado', 'cancelado'],
  preparando: ['en_curso', 'reprogramado', 'cancelado'],
  en_curso: ['en_destino', 'entrega_parcial', 'reprogramado', 'rechazado'],
  en_destino: ['entregado', 'entrega_parcial', 'rechazado', 'devuelto'],
  entregado: [],
  entrega_parcial: ['en_curso', 'en_destino', 'entregado', 'reprogramado', 'devuelto'],
  reprogramado: ['preparando', 'cancelado'],
  rechazado: ['reprogramado', 'devuelto'],
  devuelto: ['reprogramado'],
  cancelado: [],
}

export function obtenerEstadosSiguientes(estado: ProgramacionEntrega['estado']) {
  return TRANSICIONES_DISTRIBUCION[estado]
}

export function puedeTransicionarEntrega(
  estadoActual: ProgramacionEntrega['estado'],
  estadoSiguiente: ProgramacionEntrega['estado'],
) {
  return estadoActual === estadoSiguiente || obtenerEstadosSiguientes(estadoActual).includes(estadoSiguiente)
}

export const esquemaLineaProgramacionEntrega = esquemaLineaOperacionVenta

export const esquemaProgramacionEntrega = z.object({
  id: z.string().min(1),
  lockVersion: z.number().int().positive().default(1),
  pedidoId: z.string().min(1),
  pedidoNumero: z.string().min(1),
  ventaId: z.string().optional().default(''),
  ventaNumero: z.string().optional().default(''),
  clienteNombre: z.string().min(1),
  // Las filas creadas antes de la migración pueden no tener estos campos.
  // La obligatoriedad para nuevas entregas está en el esquema de entrada y en el RPC.
  direccionEntrega: z.string().trim().max(500).default(''),
  numeroDespacho: z.string().trim().max(40).default(''),
  numeroGuiaRemision: z.string().trim().max(40).default(''),
  fechaEmision: z.string().min(1),
  fechaProgramada: z.string().min(1, 'Selecciona la fecha programada'),
  fechaEntrega: z.string().optional().default(''),
  tipoTransporte: z.enum(TIPOS_TRANSPORTE_DISTRIBUCION).default('interno'),
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
  lockVersion: z.number().int().positive().optional(),
  pedidoId: z.string().min(1),
  pedidoNumero: z.string().min(1),
  ventaId: z.string().optional().default(''),
  ventaNumero: z.string().optional().default(''),
  clienteNombre: z.string().min(1),
  direccionEntrega: z.string().trim().min(1, 'Ingresa la dirección de entrega').max(500),
  numeroDespacho: z.string().trim().min(1, 'Ingresa el número de despacho').max(40),
  numeroGuiaRemision: z.string().trim().min(1, 'Ingresa el número de guía de remisión').max(40),
  fechaEmision: z.string().min(1).optional().default(''),
  fechaProgramada: z.string().min(1, 'Selecciona la fecha programada'),
  fechaEntrega: z.string().optional().default(''),
  tipoTransporte: z.enum(TIPOS_TRANSPORTE_DISTRIBUCION).default('interno'),
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
}).superRefine((datos, contexto) => {
  if (datos.fechaEmision && !esFechaCalendarioValida(datos.fechaEmision)) {
    contexto.addIssue({ code: 'custom', path: ['fechaEmision'], message: 'Ingresa una fecha de emisión válida' })
  }
  if (!esFechaCalendarioValida(datos.fechaProgramada)) {
    contexto.addIssue({ code: 'custom', path: ['fechaProgramada'], message: 'Ingresa una fecha programada válida' })
  }
  if (datos.fechaEntrega && !esFechaCalendarioValida(datos.fechaEntrega)) {
    contexto.addIssue({ code: 'custom', path: ['fechaEntrega'], message: 'Ingresa una fecha de entrega válida' })
  }
  if (datos.fechaEmision && datos.fechaProgramada && datos.fechaProgramada < datos.fechaEmision) {
    contexto.addIssue({ code: 'custom', path: ['fechaProgramada'], message: 'La fecha programada no puede ser anterior a la emisión' })
  }
  if (datos.fechaEntrega && datos.fechaEmision && datos.fechaEntrega < datos.fechaEmision) {
    contexto.addIssue({ code: 'custom', path: ['fechaEntrega'], message: 'La fecha real no puede ser anterior a la emisión' })
  }

  if (ESTADOS_CON_ENTREGA_FISICA.includes(datos.estado as typeof ESTADOS_CON_ENTREGA_FISICA[number]) && !datos.fechaEntrega) {
    contexto.addIssue({ code: 'custom', path: ['fechaEntrega'], message: 'Registra la fecha real para confirmar la entrega' })
  }
  if (datos.estado === 'entregado' && !datos.evidencia.trim()) {
    contexto.addIssue({ code: 'custom', path: ['evidencia'], message: 'Registra la evidencia de entrega antes de marcarla como entregada' })
  }
  if ((datos.estado === 'rechazado' || datos.estado === 'devuelto') && datos.incidencias.length === 0) {
    contexto.addIssue({ code: 'custom', path: ['incidencias'], message: 'Registra al menos una incidencia para este estado' })
  }

  const requiereDatosTransporte = ESTADOS_EN_RUTA.includes(datos.estado as typeof ESTADOS_EN_RUTA[number]) && datos.modalidad !== 'recojo_cliente'
  if (requiereDatosTransporte && !datos.conductor.trim()) {
    contexto.addIssue({ code: 'custom', path: ['conductor'], message: 'Ingresa el conductor antes de iniciar la entrega' })
  }
  if (requiereDatosTransporte && !datos.vehiculo.trim()) {
    contexto.addIssue({ code: 'custom', path: ['vehiculo'], message: 'Ingresa el vehículo antes de iniciar la entrega' })
  }
  if (requiereDatosTransporte && !datos.placa.trim()) {
    contexto.addIssue({ code: 'custom', path: ['placa'], message: 'Ingresa la placa antes de iniciar la entrega' })
  }
  if (requiereDatosTransporte && datos.tipoTransporte === 'externo' && !datos.transportista.trim()) {
    contexto.addIssue({ code: 'custom', path: ['transportista'], message: 'Ingresa el transportista para movilidad externa' })
  }
})

export type DatosProgramacionEntrega = z.infer<typeof esquemaDatosProgramacionEntrega>

export function crearProgramacionEntrega(
  datos: DatosProgramacionEntrega,
  fechaEmision = fechaActualPeru(),
  lineas: ProgramacionEntrega['lineas'] = [],
): ProgramacionEntrega {
  return {
    ...datos,
    id: crypto.randomUUID(),
    lockVersion: datos.lockVersion ?? 1,
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
  fechaDesde?: string
  fechaHasta?: string
  /** Compatibilidad con consumidores anteriores que filtraban por un único día. */
  fecha?: string
}

export function filtrarProgramacionesEntrega(
  programaciones: readonly ProgramacionEntrega[],
  filtro: FiltroProgramacionesEntrega = {},
): ProgramacionEntrega[] {
  const busqueda = normalizarTexto(filtro.busqueda ?? '')
  const estado = filtro.estado ?? 'todos'
  const fechaDesde = filtro.fechaDesde ?? filtro.fecha ?? ''
  const fechaHasta = filtro.fechaHasta ?? filtro.fecha ?? ''

  return programaciones.filter((item) => {
    const coincideBusqueda = !busqueda || normalizarTexto(`${item.pedidoNumero} ${item.clienteNombre} ${item.numeroGuiaRemision}`).includes(busqueda)
    const coincideEstado = estado === 'todos' || item.estado === estado
    const coincideFecha = (!fechaDesde && !fechaHasta) || [item.fechaEmision, item.fechaProgramada, item.fechaEntrega]
      .filter(Boolean)
      .some((valor) => (!fechaDesde || valor >= fechaDesde) && (!fechaHasta || valor <= fechaHasta))

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

export type EntregaAtrasada = ProgramacionEntrega & {
  diasAtraso: number
}

export function estaAtrasada(entrega: ProgramacionEntrega, fechaReferencia: string): boolean {
  if (!entrega.fechaProgramada) return false
  if (entrega.estado === 'entregado' || entrega.estado === 'cancelado') return false

  const fechaProgramada = new Date(`${entrega.fechaProgramada}T12:00:00`)
  const referencia = new Date(`${fechaReferencia}T12:00:00`)

  return fechaProgramada < referencia
}

export function listarEntregasAtrasadas(
  programaciones: readonly ProgramacionEntrega[],
  fechaReferencia: string,
): EntregaAtrasada[] {
  return programaciones
    .filter((entrega) => estaAtrasada(entrega, fechaReferencia))
    .map((entrega) => {
      const fechaProgramada = new Date(`${entrega.fechaProgramada}T12:00:00`)
      const referencia = new Date(`${fechaReferencia}T12:00:00`)
      const diasAtraso = Math.max(1, Math.ceil((referencia.getTime() - fechaProgramada.getTime()) / (1000 * 60 * 60 * 24)))

      return { ...entrega, diasAtraso }
    })
    .sort((a, b) => b.diasAtraso - a.diasAtraso)
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
