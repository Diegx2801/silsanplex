import { z } from 'zod'
import { estadosReparacion } from './reparacion'

export const esquemaFinalizacionTecnica = z.object({
  event_id: z.string().regex(/^[1-9]\d*$/), completed_at: z.string().datetime({ offset: true }),
  test_cycle_number: z.number().int().positive(), actor_user_id: z.string().uuid().nullable(),
  actor_name: z.string().nullable(), assigned_technician_id: z.string().uuid().nullable(),
  assigned_technician_name: z.string().nullable(),
})
export type FinalizacionTecnica = z.infer<typeof esquemaFinalizacionTecnica>
export const esquemaResumenFinalizacion = z.object({
  technical_completion: esquemaFinalizacionTecnica.nullable(),
  first_technical_completion: esquemaFinalizacionTecnica.nullable(),
  verified_technical_completions: z.array(esquemaFinalizacionTecnica),
})
export const leerResumenFinalizacion = (valor: unknown) => {
  const resultado = esquemaResumenFinalizacion.safeParse(valor)
  return resultado.success ? resultado.data : null
}
export const leerFinalizacionTecnica = (valor: unknown): FinalizacionTecnica | null => {
  const resultado = esquemaFinalizacionTecnica.safeParse(valor)
  return resultado.success ? resultado.data : null
}
export const fechaTecnica = (valor: string) => new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima',
}).format(new Date(valor))

export const esquemaCambioEstadoPendiente = z.object({
  estado: z.enum(estadosReparacion), observacion: z.string().max(2000), expectedLockVersion: z.number().int().positive(),
})
export type CambioEstadoPendiente = z.infer<typeof esquemaCambioEstadoPendiente> & { clave: string }
