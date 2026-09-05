import { z } from 'zod'

export const estadosReparacion = [
  'received',
  'diagnosis',
  'quote_pending',
  'waiting_customer_approval',
  'quote_approved',
  'in_repair',
  'awaiting_parts',
  'testing',
  'ready_for_delivery',
  'delivered',
  'cancelled',
  'rejected',
  'warranty',
] as const

export type EstadoReparacion = (typeof estadosReparacion)[number]

export const etiquetasEstadoReparacion: Record<EstadoReparacion, string> = {
  received: 'Recibida',
  diagnosis: 'En diagnóstico',
  quote_pending: 'Cotización pendiente',
  waiting_customer_approval: 'Esperando aprobación',
  quote_approved: 'Cotización aprobada',
  in_repair: 'En reparación',
  awaiting_parts: 'Esperando repuestos',
  testing: 'En pruebas',
  ready_for_delivery: 'Lista para entrega',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
  rejected: 'Rechazada',
  warranty: 'Garantía',
}

export const tonosEstadoReparacion: Record<EstadoReparacion, string> = {
  received: 'revision',
  diagnosis: 'revision',
  quote_pending: 'revision',
  waiting_customer_approval: 'espera',
  quote_approved: 'listo',
  in_repair: 'activo',
  awaiting_parts: 'espera',
  testing: 'activo',
  ready_for_delivery: 'listo',
  delivered: 'listo',
  cancelled: 'neutral',
  rejected: 'neutral',
  warranty: 'activo',
}

export const prioridadesReparacion = [
  { valor: 'low', etiqueta: 'Baja' },
  { valor: 'normal', etiqueta: 'Normal' },
  { valor: 'high', etiqueta: 'Alta' },
  { valor: 'urgent', etiqueta: 'Urgente' },
] as const

export type PrioridadReparacion = (typeof prioridadesReparacion)[number]['valor']

export const tiposLineaCotizacion = [
  { valor: 'labor', etiqueta: 'Mano de obra' },
  { valor: 'part', etiqueta: 'Repuesto' },
  { valor: 'external_service', etiqueta: 'Servicio externo' },
] as const

export type TipoLineaCotizacion = (typeof tiposLineaCotizacion)[number]['valor']

export type EstadoCotizacion = 'draft' | 'pending' | 'approved' | 'rejected'

export const etiquetasEstadoCotizacion: Record<EstadoCotizacion, string> = {
  draft: 'Borrador',
  pending: 'Pendiente de aprobación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

export type EstadoParteReparacion = 'reserved' | 'consumed' | 'cancelled'
export type EstadoStockReparacion = 'available' | 'quarantine' | 'damaged'

export const etiquetasEstadoParte: Record<EstadoParteReparacion, string> = {
  reserved: 'Reservado',
  consumed: 'Consumido',
  cancelled: 'Cancelado',
}

export const etiquetasEstadoStockReparacion: Record<EstadoStockReparacion, string> = {
  available: 'Disponible',
  quarantine: 'Cuarentena',
  damaged: 'Dañado / inmovilizado',
}

export function estadoStockReparacionEsConsumible(estado: EstadoStockReparacion) {
  return estado === 'available'
}

export interface OpcionClienteReparacion {
  id: string
  nombre: string
  nombreComercial: string
  documento: string
}

export interface OpcionProductoReparacion {
  id: string
  codigo: string
  descripcion: string
  unidadMedida: string
  serialControl: boolean
  controlLote: boolean
  controlVencimiento: boolean
}

export interface Reparacion {
  id: string
  organizationId: string
  lockVersion: number
  codigo: string
  clienteId: string
  productoId: string
  numeroSerie: string
  recibidaEn: string
  fechaEntregaEstimada: string
  entregadaEn: string
  estado: EstadoReparacion
  prioridad: PrioridadReparacion
  problema: string
  diagnostico: string
  diagnosticoRegistrado: boolean
  solucionAplicada: string
  solucionAplicadaRegistrada: boolean
  notas: string
  referenciaCliente: string
  documentoVentaId: string
  referenciaGarantia: string
  tecnicoAsignadoId: string | null
  clienteNombreSnapshot: string
  clienteDocumentoSnapshot: string
  productoCodigoSnapshot: string
  productoDescripcionSnapshot: string
  serialControlSnapshot: boolean
  creadoPor: string | null
  actualizadoPor: string | null
  creadoEn: string
  actualizadoEn: string
}

export interface DiagnosticoReparacion {
  id: string
  organizationId: string
  reparacionId: string
  diagnosticadoEn: string
  tecnicoId: string
  sintomas: string
  causaEncontrada: string
  solucionRecomendada: string
  notas: string
  creadoPor: string | null
  creadoEn: string
}

export interface LineaCotizacionReparacion {
  id: string
  organizationId: string
  cotizacionId: string
  tipo: TipoLineaCotizacion
  productoId: string | null
  descripcion: string
  cantidad: number
  precioUnitario: number
  gravable: boolean
  subtotalLinea: number
  creadoEn: string
}

export interface CotizacionReparacion {
  id: string
  organizationId: string
  reparacionId: string
  version: number
  esActual: boolean
  estado: EstadoCotizacion
  moneda: 'PEN' | 'USD'
  preciosIncluyenImpuesto: boolean
  tasaImpuesto: number
  subtotal: number
  impuesto: number
  total: number
  aprobadoPor: string | null
  aprobadoEn: string | null
  observacionAprobacion: string
  rechazadoPor: string | null
  rechazadoEn: string | null
  observacionRechazo: string
  creadoPor: string | null
  actualizadoPor: string | null
  creadoEn: string
  actualizadoEn: string
  lineas: LineaCotizacionReparacion[]
}

export interface ConsumoParteReparacion {
  id: string
  organizationId: string
  parteId: string
  cantidad: number
  almacenId: string
  ubicacionId: string
  estadoStock: EstadoStockReparacion
  lote: string
  fechaVencimiento: string
  costoUnitario: number
  movimientoInventarioId: string
  claveOperacion: string
  consumidoPor: string | null
  consumidoEn: string
  creadoEn: string
}

export interface ParteReparacion {
  id: string
  organizationId: string
  reparacionId: string
  productoId: string
  productoCodigoSnapshot: string
  productoDescripcionSnapshot: string
  almacenId: string
  ubicacionId: string
  estadoStock: EstadoStockReparacion
  lote: string
  fechaVencimiento: string
  cantidadSolicitada: number
  cantidadConsumida: number
  estado: EstadoParteReparacion
  notas: string
  creadoPor: string | null
  actualizadoPor: string | null
  creadoEn: string
  actualizadoEn: string
  consumos: ConsumoParteReparacion[]
}

export interface PruebaReparacion {
  ciclo: number | null
  id: string
  organizationId: string
  reparacionId: string
  tipo: string
  resultado: string
  aprobada: boolean
  realizadaPor: string
  notas: string
  completadaEn: string
  creadoPor: string | null
  creadoEn: string
}

export interface EventoReparacion {
  id: number
  organizationId: string
  reparacionId: string
  tipo: string
  estadoAnterior: string | null
  estadoNuevo: string | null
  actorId: string | null
  observacion: string
  metadata: Record<string, unknown>
  creadoEn: string
}

export interface DetalleReparacion {
  cicloPruebasActual: number
  reparacion: Reparacion
  diagnosticos: DiagnosticoReparacion[]
  cotizaciones: CotizacionReparacion[]
  cotizacionActiva: CotizacionReparacion | null
  partes: ParteReparacion[]
  pruebas: PruebaReparacion[]
  eventos: EventoReparacion[]
  eventosCompletos?: boolean
}

export interface ResumenReparaciones {
  total: number
  abiertas: number
  esperandoAprobacion: number
  listasParaEntrega: number
}

const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo, `Máximo ${maximo} caracteres`)

const fechaOpcional = z
  .string()
  .trim()
  .refine(
    (valor) => valor === '' || /^\d{4}-\d{2}-\d{2}$/.test(valor),
    'Selecciona una fecha válida',
  )

const uuidOpcional = z
  .string()
  .trim()
  .refine(
    (valor) => valor === '' || z.string().uuid().safeParse(valor).success,
    'Ingresa un UUID válido o deja el campo vacío',
  )

export const esquemaDatosReparacion = z.object({
  clienteId: z.string().uuid('Selecciona un cliente'),
  productoId: z.string().uuid('Selecciona un producto'),
  numeroSerie: z.string().trim().max(120, 'Máximo 120 caracteres'),
  prioridad: z.enum(['low', 'normal', 'high', 'urgent']),
  fechaEstimadaEntrega: fechaOpcional,
  problema: z
    .string()
    .trim()
    .min(3, 'Describe el problema de la reparación')
    .max(2000, 'Máximo 2000 caracteres'),
  notas: textoOpcional(4000),
  referenciaCliente: textoOpcional(160),
  documentoVentaId: uuidOpcional,
  referenciaGarantia: textoOpcional(160),
  esGarantia: z.boolean(),
})

export type DatosReparacion = z.infer<typeof esquemaDatosReparacion>

const cantidadTexto = z
  .string()
  .trim()
  .refine(
    (valor) => /^\d+(\.\d{1,3})?$/.test(valor) && Number(valor) > 0,
    'Ingresa una cantidad mayor que cero con hasta 3 decimales',
  )

const importeTexto = z
  .string()
  .trim()
  .refine(
    (valor) => /^\d+(\.\d{1,4})?$/.test(valor) && Number(valor) >= 0,
    'Ingresa un importe válido con hasta 4 decimales',
  )

export const esquemaLineaCotizacion = z
  .object({
    tipo: z.enum(['labor', 'part', 'external_service']),
    productoId: z.string(),
    descripcion: z.string().trim().max(500, 'Máximo 500 caracteres'),
    cantidad: cantidadTexto,
    precioUnitario: importeTexto,
    gravable: z.boolean(),
  })
  .superRefine((linea, contexto) => {
    if (!linea.descripcion) {
      contexto.addIssue({
        code: 'custom',
        path: ['descripcion'],
        message: 'Describe la línea de cotización',
      })
    }
    if (linea.tipo === 'part' && !z.string().uuid().safeParse(linea.productoId).success) {
      contexto.addIssue({
        code: 'custom',
        path: ['productoId'],
        message: 'Selecciona el producto del repuesto',
      })
    }
    if (linea.tipo !== 'part' && linea.productoId) {
      contexto.addIssue({
        code: 'custom',
        path: ['productoId'],
        message: 'Esta línea no debe tener producto',
      })
    }
  })

export const esquemaDatosCotizacion = z.object({
  id: z.string().uuid().optional(),
  moneda: z.enum(['PEN', 'USD']),
  preciosIncluyenImpuesto: z.boolean(),
  tasaImpuesto: z
    .string()
    .trim()
    .refine(
      (valor) => /^\d{1,3}(\.\d{1,4})?$/.test(valor) && Number(valor) >= 0 && Number(valor) <= 100,
      'La tasa debe estar entre 0 y 100',
    ),
  lineas: z.array(esquemaLineaCotizacion).min(1, 'Agrega al menos una línea').max(100),
})

export type DatosCotizacion = z.infer<typeof esquemaDatosCotizacion>

export const esquemaDatosDiagnostico = z.object({
  tecnicoId: uuidOpcional,
  sintomas: z.string().trim().min(3, 'Describe los síntomas').max(4000),
  causaEncontrada: textoOpcional(4000),
  solucionRecomendada: textoOpcional(4000),
  notas: textoOpcional(4000),
})

export type DatosDiagnostico = z.infer<typeof esquemaDatosDiagnostico>

export const esquemaDatosSolucionReparacion = z.object({
  solucionAplicada: z
    .string()
    .trim()
    .min(1, 'Describe la solución aplicada')
    .max(4000, 'Máximo 4000 caracteres'),
})

export type DatosSolucionReparacion = z.infer<typeof esquemaDatosSolucionReparacion>

export const esquemaDatosPrueba = z.object({
  realizadaPor: uuidOpcional,
  tipo: z.string().trim().min(2, 'Ingresa el tipo de prueba').max(120),
  resultado: z.string().trim().min(1, 'Describe el resultado').max(2000),
  aprobada: z.boolean(),
  notas: textoOpcional(1000),
})

export type DatosPrueba = z.infer<typeof esquemaDatosPrueba>

export const esquemaDatosReservaParte = z.object({
  productoId: z.string().uuid('Selecciona un producto'),
  almacenId: z.string().uuid('Selecciona un almacén'),
  ubicacionId: z.string().uuid('Selecciona una ubicación'),
  estadoStock: z.literal('available'),
  lote: textoOpcional(60),
  fechaVencimiento: fechaOpcional,
  cantidadSolicitada: cantidadTexto,
  notas: textoOpcional(1000),
})

export type DatosReservaParte = z.infer<typeof esquemaDatosReservaParte>

export const esquemaDatosConsumoParte = z.object({
  cantidad: cantidadTexto,
})

export type DatosConsumoParte = z.infer<typeof esquemaDatosConsumoParte>

export const esquemaObservacionReparacion = z.object({
  observacion: textoOpcional(2000),
})

export type DatosObservacionReparacion = z.infer<typeof esquemaObservacionReparacion>

export const esquemaCambioEstado = z.object({
  estado: z.string().min(1, 'Selecciona el estado de destino'),
  observacion: textoOpcional(2000),
})

export type DatosCambioEstado = z.infer<typeof esquemaCambioEstado>

const transicionesGenericas: Record<EstadoReparacion, EstadoReparacion[]> = {
  received: ['diagnosis', 'warranty'],
  diagnosis: ['quote_pending', 'in_repair'],
  quote_pending: ['diagnosis'],
  waiting_customer_approval: [],
  quote_approved: ['in_repair'],
  in_repair: ['awaiting_parts', 'testing'],
  awaiting_parts: ['in_repair', 'testing'],
  testing: ['in_repair', 'ready_for_delivery'],
  ready_for_delivery: ['in_repair'],
  delivered: [],
  cancelled: [],
  rejected: [],
  warranty: ['diagnosis', 'in_repair'],
}

export function obtenerTransicionesGenericas(estado: EstadoReparacion) {
  return transicionesGenericas[estado]
}

export function estadoEsTerminal(estado: EstadoReparacion) {
  return estado === 'delivered' || estado === 'cancelled' || estado === 'rejected'
}

export function estadoEsEditable(estado: EstadoReparacion) {
  return !estadoEsTerminal(estado)
}

const eventosSustantivosIdentidadReparacion = new Set([
  'DIAGNOSIS_CREATED',
  'SOLUTION_RECORDED',
  'QUOTE_CREATED',
  'QUOTE_SUBMITTED',
  'QUOTE_APPROVED',
  'QUOTE_REJECTED',
  'PART_RESERVED',
  'PART_CONSUMED',
  'PART_CANCELLED',
  'TEST_COMPLETED',
  'DELIVERED',
  'CANCELLED',
])

export function identidadReparacionEsEditable(
  detalle?: DetalleReparacion | null,
) {
  if (!detalle) return true

  const { reparacion } = detalle
  let eventoCreacion: EventoReparacion | undefined
  for (const evento of detalle.eventos) {
    if (
      evento.tipo === 'CREATED'
      && (!eventoCreacion || evento.id < eventoCreacion.id)
    ) {
      eventoCreacion = evento
    }
  }

  const estadoInicialValido = reparacion.estado === 'received'
    ? !eventoCreacion || eventoCreacion.estadoNuevo === 'received'
    : reparacion.estado === 'warranty'
      && eventoCreacion?.estadoNuevo === 'warranty'
  if (!estadoInicialValido) return false

  if (
    reparacion.diagnosticoRegistrado
    || reparacion.solucionAplicadaRegistrada
    || detalle.diagnosticos.length
    || detalle.cotizaciones.length
    || detalle.partes.length
    || detalle.pruebas.length
  ) {
    return false
  }

  if (detalle.eventosCompletos === false) return false

  return !detalle.eventos.some((evento) => {
    if (eventosSustantivosIdentidadReparacion.has(evento.tipo)) return true
    if (evento.tipo === 'CREATED') {
      return evento.estadoAnterior !== null || evento.estadoNuevo !== reparacion.estado
    }
    return evento.estadoAnterior !== evento.estadoNuevo
      || (evento.estadoAnterior !== null && evento.estadoAnterior !== reparacion.estado)
      || (evento.estadoNuevo !== null && evento.estadoNuevo !== reparacion.estado)
  })
}

export function validarNumeroSerie(numeroSerie: string, requiereSerie: boolean) {
  const valor = numeroSerie.trim()
  if (requiereSerie && !valor) return 'El número de serie es obligatorio para este producto'
  if (valor.length > 120) return 'El número de serie no puede superar 120 caracteres'
  return undefined
}

export function normalizarTextoOpcional(valor: string | null | undefined) {
  return valor?.trim() || null
}

export function normalizarBusquedaReparaciones(valor: string) {
  return valor
    .trim()
    .replace(/[\\%_(),*]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 100)
    .trim()
}

export function limitarEnteroSeguro(valor: number, minimo: number, maximo: number) {
  if (!Number.isFinite(valor)) return minimo
  return Math.min(maximo, Math.max(minimo, Math.trunc(valor)))
}

export function datosReparacionInicial(
  reparacion?: Reparacion | null,
): DatosReparacion {
  if (!reparacion) {
    return {
      clienteId: '',
      productoId: '',
      numeroSerie: '',
      prioridad: 'normal',
      fechaEstimadaEntrega: '',
      problema: '',
      notas: '',
      referenciaCliente: '',
      documentoVentaId: '',
      referenciaGarantia: '',
      esGarantia: false,
    }
  }

  return {
    clienteId: reparacion.clienteId,
    productoId: reparacion.productoId,
    numeroSerie: reparacion.numeroSerie,
    prioridad: reparacion.prioridad,
    fechaEstimadaEntrega: reparacion.fechaEntregaEstimada,
    problema: reparacion.problema,
    notas: reparacion.notas,
    referenciaCliente: reparacion.referenciaCliente,
    documentoVentaId: reparacion.documentoVentaId,
    referenciaGarantia: reparacion.referenciaGarantia,
    esGarantia: reparacion.estado === 'warranty',
  }
}

export function lineaCotizacionInicial(): DatosCotizacion['lineas'][number] {
  return {
    tipo: 'labor',
    productoId: '',
    descripcion: '',
    cantidad: '1',
    precioUnitario: '0',
    gravable: true,
  }
}
