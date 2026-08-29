import { z } from 'zod'

export type EstadoStock = 'available' | 'quarantine' | 'damaged'

export interface Almacen {
  id: string
  codigo: string
  nombre: string
  direccion: string
  activo: boolean
}

export interface UbicacionAlmacen {
  id: string
  almacenId: string
  codigo: string
  nombre: string
  descripcion: string
  activa: boolean
}

export interface SaldoInventario {
  productoId: string
  productoCodigo: string
  productoDescripcion: string
  unidadMedida: string
  almacenId: string
  almacenCodigo: string
  almacenNombre: string
  ubicacionId: string
  ubicacionCodigo: string
  ubicacionNombre: string
  estado: EstadoStock
  lote: string
  fechaVencimiento: string
  cantidad: number
  valorInventario: number
  costoPromedio: number
}

export interface AlertaInventario extends SaldoInventario {
  stockMinimo: number
  diasAlertaVencimiento: number
  alertaStockMinimo: boolean
  alertaVencimiento: boolean
  diasParaVencer: number | null
  estadoVencimiento: 'expired' | 'urgent' | 'upcoming' | null
}

export interface MovimientoKardex {
  id: string
  secuenciaLedger: number
  productoId: string
  productoCodigo: string
  productoDescripcion: string
  almacen: string
  estado: EstadoStock
  lote: string
  fechaOperacion: string
  fechaRegistro: string
  motivo: string
  costoUnitario: number
  cantidadEntrada: number
  cantidadSalida: number
  valorEntrada: number
  valorSalida: number
  saldoCantidad: number
  saldoValor: number
}

export interface TransferenciaAlmacen {
  id: string
  referencia: string
  almacenOrigenId: string
  almacenDestinoId: string
  fechaTransferencia: string
  notas: string
}

const cantidadPositiva = z
  .string()
  .trim()
  .refine((valor) => /^\d+(\.\d{1,3})?$/.test(valor) && Number(valor) > 0, 'Ingresa una cantidad mayor a cero')

export const esquemaAlmacen = z.object({
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,19}$/, 'Usa letras, numeros, punto, guion o guion bajo'),
  nombre: z.string().trim().min(2, 'Ingresa el nombre').max(80),
  direccion: z.string().trim().max(180),
})

export const esquemaUbicacion = z.object({
  almacenId: z.string().uuid('Selecciona un almacen'),
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,29}$/, 'Codigo no valido'),
  nombre: z.string().trim().min(2, 'Ingresa el nombre').max(80),
  descripcion: z.string().trim().max(180),
})

export const esquemaTransferencia = z.object({
  referencia: z.string().trim().min(2).max(40),
  almacenOrigenId: z.string().uuid(),
  ubicacionOrigenId: z.string().uuid(),
  almacenDestinoId: z.string().uuid(),
  ubicacionDestinoId: z.string().uuid(),
  productoId: z.string().uuid(),
  cantidad: cantidadPositiva,
  lote: z.string().trim().max(60),
  fechaVencimiento: z.string(),
  estado: z.enum(['available', 'quarantine', 'damaged']),
  notas: z.string().trim().max(240),
}).refine((datos) => datos.almacenOrigenId !== datos.almacenDestinoId, {
  message: 'El origen y destino deben ser diferentes',
  path: ['almacenDestinoId'],
})

export const esquemaReclasificacion = z.object({
  productoId: z.string().uuid(),
  almacenId: z.string().uuid(),
  ubicacionId: z.string().uuid(),
  estadoOrigen: z.enum(['available', 'quarantine', 'damaged']),
  estadoDestino: z.enum(['available', 'quarantine', 'damaged']),
  cantidad: cantidadPositiva,
  lote: z.string().trim().max(60),
  fechaVencimiento: z.string(),
  motivo: z.string().trim().min(3).max(180),
}).refine((datos) => datos.estadoOrigen !== datos.estadoDestino, {
  message: 'Selecciona un estado diferente',
  path: ['estadoDestino'],
})

export type DatosAlmacen = z.infer<typeof esquemaAlmacen>
export type DatosUbicacion = z.infer<typeof esquemaUbicacion>
export type DatosTransferencia = z.infer<typeof esquemaTransferencia>
export type DatosReclasificacion = z.infer<typeof esquemaReclasificacion>

export const etiquetasEstadoStock: Record<EstadoStock, string> = {
  available: 'Disponible',
  quarantine: 'Cuarentena',
  damaged: 'Danado / inmovilizado',
}
