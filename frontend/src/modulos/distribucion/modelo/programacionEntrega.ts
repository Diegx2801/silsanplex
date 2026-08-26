import { z } from 'zod'

export const estadosEntrega = [
  'programada', 'reprogramada', 'en_transito', 'entrega_parcial',
  'entregada', 'rechazada', 'devuelta', 'cancelada',
] as const

export type EstadoEntrega = (typeof estadosEntrega)[number]

export const etiquetasEstadoEntrega: Record<EstadoEntrega, string> = {
  programada: 'Programada',
  reprogramada: 'Reprogramada',
  en_transito: 'En tránsito',
  entrega_parcial: 'Entrega parcial',
  entregada: 'Entregada',
  rechazada: 'Rechazada',
  devuelta: 'Devuelta',
  cancelada: 'Cancelada',
}

export const esquemaLineaOrdenDistribucion = z.object({
  id: z.string().min(1),
  productoId: z.string(),
  productoCodigo: z.string().trim().min(1),
  productoDescripcion: z.string().trim().min(1),
  unidadMedida: z.string().trim().min(1),
  cantidadOrdenada: z.number().positive(),
})

export type LineaOrdenDistribucion = z.infer<typeof esquemaLineaOrdenDistribucion>

export const esquemaPedidoFuenteDistribucion = z.object({
  id: z.string().uuid(),
  numero: z.string().trim().min(1).max(30),
  clienteId: z.string().uuid().nullable(),
  clienteDocumento: z.string().trim().max(20),
  clienteNombre: z.string().trim().min(2).max(160),
  fechaPedido: z.string().date(),
  direccionEntrega: z.string().trim().max(240),
  referenciaEntrega: z.string().trim().max(200),
  contactoNombre: z.string().trim().max(120),
  contactoTelefono: z.string().trim().max(30),
  estado: z.enum(['pendiente', 'parcial', 'completado', 'cancelado']),
  lineas: z.array(esquemaLineaOrdenDistribucion).min(1),
})

export type PedidoFuenteDistribucion = z.infer<typeof esquemaPedidoFuenteDistribucion>

export const esquemaLineaEntrega = z.object({
  id: z.string().uuid(),
  ordenLineaId: z.string().uuid(),
  fuenteLineaId: z.string().min(1),
  productoId: z.string().uuid().nullable(),
  productoCodigo: z.string().min(1),
  productoDescripcion: z.string().min(1),
  unidadMedida: z.string().min(1),
  cantidadOrdenada: z.number().positive(),
  cantidadEnviada: z.number().positive(),
  cantidadEntregada: z.number().nonnegative(),
  cantidadRechazada: z.number().nonnegative(),
  cantidadDevuelta: z.number().nonnegative(),
  lote: z.string(),
  fechaVencimiento: z.string(),
})

export type LineaEntrega = z.infer<typeof esquemaLineaEntrega>

export const esquemaDatosLineaEntrega = z.object({
  fuenteLineaId: z.string().min(1),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero'),
  lote: z.string().trim().max(60),
  fechaVencimiento: z.string(),
})

export type DatosLineaEntrega = z.infer<typeof esquemaDatosLineaEntrega>

export const esquemaDatosEntrega = z.object({
  pedido: esquemaPedidoFuenteDistribucion,
  fechaEntrega: z.string().date('Selecciona una fecha válida'),
  numeroGuiaRemision: z.string().trim().min(1, 'Ingresa la guía de remisión').max(40),
  tipoTransporte: z.enum(['interno', 'externo']),
  transportistaNombre: z.string().trim().max(160),
  transportistaDocumento: z.string().trim().max(20),
  conductorNombre: z.string().trim().min(2, 'Ingresa el conductor').max(160),
  conductorDocumento: z.string().trim().max(20),
  conductorLicencia: z.string().trim().max(30),
  vehiculoPlaca: z.string().trim().min(3, 'Ingresa la placa').max(20),
  direccionEntrega: z.string().trim().min(3, 'Ingresa la dirección de entrega').max(240),
  referenciaEntrega: z.string().trim().max(200),
  contactoNombre: z.string().trim().max(120),
  contactoTelefono: z.string().trim().max(30),
  observaciones: z.string().trim().max(500),
  lineas: z.array(esquemaDatosLineaEntrega).min(1, 'Selecciona al menos un producto'),
}).superRefine((datos, contexto) => {
  if (datos.tipoTransporte === 'externo' && !datos.transportistaNombre) {
    contexto.addIssue({ code: 'custom', path: ['transportistaNombre'], message: 'Ingresa el transportista externo' })
  }
})

export type DatosEntrega = z.infer<typeof esquemaDatosEntrega>

export interface EventoEntrega {
  id: number
  tipo: string
  estadoAnterior: EstadoEntrega | null
  estadoNuevo: EstadoEntrega | null
  descripcion: string
  metadata: Record<string, unknown>
  ocurridoEn: string
}

export interface IncidenciaEntrega {
  id: string
  tipo: 'demora' | 'danio' | 'perdida' | 'documentacion' | 'cliente_ausente' | 'vehiculo' | 'otro'
  severidad: 'baja' | 'media' | 'alta' | 'critica'
  descripcion: string
  estado: 'abierta' | 'investigando' | 'resuelta' | 'cerrada'
  resolucion: string
  ocurridaEn: string
  resueltaEn: string | null
}

export interface EvidenciaEntrega {
  id: string
  tipo: 'despacho' | 'entrega' | 'rechazo' | 'devolucion' | 'incidencia'
  nombreArchivo: string
  ruta: string
  tipoMime: string
  tamano: number
  notas: string
  creadaEn: string
}

export interface DevolucionEntrega {
  id: string
  motivo: string
  notas: string
  estado: 'registrada' | 'recibida' | 'cerrada'
  ocurridaEn: string
}

export interface ProgramacionEntrega {
  id: string
  ordenDistribucionId: string
  pedidoId: string
  pedidoNumero: string
  clienteNombre: string
  clienteDocumento: string
  fechaPedido: string
  fechaEmision: string
  fechaEntrega: string
  numeroGuiaRemision: string
  tipoTransporte: 'interno' | 'externo'
  seguimiento: EstadoEntrega
  secuencia: number
  direccionEntrega: string
  referenciaEntrega: string
  contactoNombre: string
  contactoTelefono: string
  transportistaNombre: string
  transportistaDocumento: string
  conductorNombre: string
  conductorDocumento: string
  conductorLicencia: string
  vehiculoPlaca: string
  observaciones: string
  iniciadaEn: string | null
  completadaEn: string | null
  lineas: LineaEntrega[]
  eventos: EventoEntrega[]
  incidencias: IncidenciaEntrega[]
  evidencias: EvidenciaEntrega[]
  devoluciones: DevolucionEntrega[]
}

export interface DatosTransicionEntrega {
  estado: EstadoEntrega
  descripcion: string
  fechaEntrega?: string
  lineas?: Array<{ id: string; cantidadEntregada: number; cantidadRechazada: number }>
}

export interface DatosIncidenciaEntrega {
  id?: string
  tipo: IncidenciaEntrega['tipo']
  severidad: IncidenciaEntrega['severidad']
  descripcion: string
  estado?: IncidenciaEntrega['estado']
  resolucion?: string
}

export interface DatosDevolucionEntrega {
  motivo: string
  notas: string
  lineas: Array<{
    entregaLineaId: string
    cantidad: number
    condicion: 'conforme' | 'danado' | 'vencido' | 'abierto' | 'otro'
  }>
}

export const tiposEvidencia = ['despacho', 'entrega', 'rechazo', 'devolucion', 'incidencia'] as const
export type TipoEvidencia = (typeof tiposEvidencia)[number]

export function fechaLocalISO(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(fecha)
}
