import { z } from 'zod'

const fechaRequerida = z.string().min(1, 'Selecciona una fecha')
const textoRequerido = (minimo: number, maximo: number) =>
  z.string().trim().min(minimo, `Ingresa al menos ${minimo} caracteres`).max(maximo, `Máximo ${maximo} caracteres`)

export interface MetricasProveedor {
  ordenesRecibidas: number
  entregasMedidas: number
  entregasPuntuales: number
  entregasTardias: number
  puntualidadPorcentaje: number | null
  diasEntregaPromedio: number | null
  ultimaCompraEn: string | null
  incidencias: number
  incidenciasAbiertas: number
  devolucionesCompletadas: number
  cantidadDevuelta: number
  ultimaEvaluacion: number | null
  ultimaEvaluacionEn: string | null
}

export interface ProductoSuministradoProveedor {
  productoId: string
  codigo: string
  descripcion: string
  unidadMedida: string
  compras: number
  cantidadSuministrada: number
  costoMinimo: number
  costoPromedio: number
  costoMaximo: number
  ultimoCosto: number
  ultimaRecepcionEn: string
}

export interface PrecioHistoricoProveedor {
  compraId: string
  lineaId: string
  documento: string
  moneda: string
  recibidoEn: string
  productoId: string
  productoCodigo: string
  productoDescripcion: string
  cantidad: number
  costoUnitario: number
}

export interface EvaluacionProveedor {
  id: string
  evaluadaEn: string
  calidad: number
  entrega: number
  servicio: number
  precio: number
  global: number
  comentario: string
  responsable: string
  creadaEn: string
}

export type TipoIncidenciaProveedor =
  | 'late-delivery'
  | 'incomplete-delivery'
  | 'quality'
  | 'documentation'
  | 'commercial'
  | 'other'
export type SeveridadIncidenciaProveedor = 'low' | 'medium' | 'high' | 'critical'
export type EstadoIncidenciaProveedor = 'open' | 'investigating' | 'resolved' | 'closed'

export interface IncidenciaProveedor {
  id: string
  compraId: string | null
  productoId: string | null
  tipo: TipoIncidenciaProveedor
  severidad: SeveridadIncidenciaProveedor
  estado: EstadoIncidenciaProveedor
  ocurridaEn: string
  descripcion: string
  resolucion: string
  resueltaEn: string | null
  responsable: string
  creadaEn: string
}

export interface DevolucionProveedor {
  id: string
  compraId: string
  lineaCompraId: string
  productoId: string
  cantidad: number
  motivo: string
  estado: 'registered' | 'completed' | 'cancelled'
  solicitadaEn: string
  completadaEn: string | null
  responsable: string
  creadaEn: string
}

export interface CompraRecibidaProveedor {
  id: string
  documento: string
  recibidaEn: string
  lineas: Array<{
    id: string
    productoId: string
    productoCodigo: string
    productoDescripcion: string
    cantidad: number
    costoUnitario: number
  }>
}

export const esquemaEvaluacionProveedor = z.object({
  evaluadaEn: fechaRequerida,
  calidad: z.coerce.number().int().min(1).max(5),
  entrega: z.coerce.number().int().min(1).max(5),
  servicio: z.coerce.number().int().min(1).max(5),
  precio: z.coerce.number().int().min(1).max(5),
  comentario: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
})
export type DatosEvaluacionProveedor = z.infer<typeof esquemaEvaluacionProveedor>

export const esquemaIncidenciaProveedor = z.object({
  compraId: z.string(),
  productoId: z.string(),
  tipo: z.enum(['late-delivery', 'incomplete-delivery', 'quality', 'documentation', 'commercial', 'other']),
  severidad: z.enum(['low', 'medium', 'high', 'critical']),
  estado: z.enum(['open', 'investigating', 'resolved', 'closed']),
  ocurridaEn: fechaRequerida,
  descripcion: textoRequerido(5, 1200),
  resolucion: z.string().trim().max(1200, 'Máximo 1200 caracteres'),
}).superRefine((datos, contexto) => {
  if (['resolved', 'closed'].includes(datos.estado) && !datos.resolucion) {
    contexto.addIssue({ code: 'custom', path: ['resolucion'], message: 'Describe cómo se resolvió la incidencia' })
  }
})
export type DatosIncidenciaProveedor = z.infer<typeof esquemaIncidenciaProveedor>

export const esquemaDevolucionProveedor = z.object({
  compraId: z.string().min(1, 'Selecciona una compra'),
  lineaCompraId: z.string().min(1, 'Selecciona un producto'),
  cantidad: z.string().trim().refine(
    (valor) => /^\d+(\.\d{1,3})?$/.test(valor) && Number(valor) > 0,
    'Ingresa una cantidad mayor que cero',
  ),
  motivo: textoRequerido(5, 600),
  solicitadaEn: fechaRequerida,
})
export type DatosDevolucionProveedor = z.infer<typeof esquemaDevolucionProveedor>

export interface ComparativoProductoProveedor extends ProductoSuministradoProveedor {
  proveedorId: string
}

export interface DetalleOperativoProveedor {
  metricas: MetricasProveedor
  productos: ProductoSuministradoProveedor[]
  precios: PrecioHistoricoProveedor[]
  evaluaciones: EvaluacionProveedor[]
  incidencias: IncidenciaProveedor[]
  devoluciones: DevolucionProveedor[]
  comprasRecibidas: CompraRecibidaProveedor[]
}
