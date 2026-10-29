import { z } from 'zod'

export const esquemaAccesorioRecepcion = z.object({
  nombre: z.string().trim().min(1, 'Indica el nombre del accesorio').max(160),
  cantidadRecibida: z.number().int('La cantidad debe ser entera').min(1, 'Ingresa una cantidad mayor que cero').max(1_000_000),
  condicion: z.string().trim().max(500),
  observaciones: z.string().trim().max(2000),
})
export type DatosAccesorioRecepcion = z.infer<typeof esquemaAccesorioRecepcion>
export const accesorioInicial = (): DatosAccesorioRecepcion => ({ nombre: '', cantidadRecibida: 1, condicion: '', observaciones: '' })
export function payloadAccesorio(datos: DatosAccesorioRecepcion) {
  return { name: datos.nombre.trim(), quantity_received: datos.cantidadRecibida,
    received_condition: datos.condicion.trim() || null, observations: datos.observaciones.trim() || null }
}

export const esquemaDevolucionAccesorio = z.object({
  accessory_id: z.string().uuid(), quantity: z.number().int().min(1).max(1_000_000), observation: z.string().trim().max(2000),
})
export const esquemaComandoAccesorios = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('save_repair_accessories'), datos: z.object({ accessories: z.array(z.union([
    z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(160), quantity_received: z.number().int().min(1).max(1_000_000),
      received_condition: z.string().max(500).nullable(), observations: z.string().max(2000).nullable() }),
    z.object({ id: z.string().uuid(), void: z.literal(true), reason: z.string().trim().min(1, 'Indica el motivo de anulación').max(2000) }),
  ])).max(100) }), expectedLockVersion: z.number().int().positive() }),
  z.object({ tipo: z.literal('record_repair_accessory_return'), datos: z.object({ returns: z.array(esquemaDevolucionAccesorio).min(1).max(100) }), expectedLockVersion: z.number().int().positive() }),
  z.object({ tipo: z.literal('deliver_repair_with_accessories'), datos: z.object({
    returns: z.array(esquemaDevolucionAccesorio).max(100), authorize_exception: z.boolean(), exception_reason: z.string().trim().max(2000),
  }).superRefine((datos, contexto) => {
    if (datos.authorize_exception && !datos.exception_reason) contexto.addIssue({ code: 'custom', path: ['exception_reason'], message: 'Indica el motivo de la excepción' })
  }), expectedLockVersion: z.number().int().positive() }),
])
export type ComandoAccesorios = z.infer<typeof esquemaComandoAccesorios>

const esquemaRetorno = z.object({
  id: z.string().uuid(), accessory_id: z.string().uuid(), quantity: z.number().int().positive(),
  returned_by: z.string().uuid(), returned_by_name: z.string(), returned_at: z.string(), observation: z.string().nullable(), operation_key: z.string().uuid(),
})
const esquemaAccesorio = z.object({
  id: z.string().uuid(), organization_id: z.string().uuid(), repair_id: z.string().uuid(), name: z.string(), quantity_received: z.number().int().positive(),
  received_condition: z.string().nullable(), observations: z.string().nullable(), registered_by: z.string().uuid(), registered_by_name: z.string(),
  registered_at: z.string(), updated_by: z.string().uuid(), updated_at: z.string(), voided_at: z.string().nullable(), void_reason: z.string().nullable(),
  quantity_returned: z.number().int().nonnegative(), quantity_pending: z.number().int().nonnegative(), returns: z.array(esquemaRetorno),
})
export const esquemaDetalleAccesorios = z.object({ reviewed_at: z.string().nullable(), lock_version: z.number().int().positive(), accessories: z.array(esquemaAccesorio) })
export type AccesorioReparacion = z.infer<typeof esquemaAccesorio>
export type DetalleAccesorios = z.infer<typeof esquemaDetalleAccesorios>
export const accesoriosPendientes = (detalle?: DetalleAccesorios) => detalle?.accessories.filter(a => !a.voided_at && a.quantity_pending > 0) ?? []
export const fechaAccesorio = (valor: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(valor))
