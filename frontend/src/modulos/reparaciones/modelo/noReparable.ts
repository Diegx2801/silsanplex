import { z } from 'zod'

export const esquemaDecisionNoReparable = z.object({
  id: z.string().regex(/^[1-9]\d*$/), reason: z.string(), technician_id: z.string().uuid(),
  technician_name: z.string().nullable(), confirmed_by: z.string().uuid(), decided_at: z.string(),
  diagnosis_id: z.string().uuid(), diagnosis_snapshot: z.object({ symptoms: z.string(), cause_found: z.string().nullable() }),
})
export type DecisionNoReparable = z.infer<typeof esquemaDecisionNoReparable>
const motivo = z.string().trim().min(1, 'Indica el motivo técnico').max(2000)
export const esquemaComandoNoReparable = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('declare_repair_non_repairable'), expectedLockVersion: z.number().int().positive(),
    datos: z.object({ diagnosis_id: z.string().uuid('Selecciona un diagnóstico'), reason: motivo }) }),
  z.object({ tipo: z.literal('reopen_repair_non_repairable_assessment'), expectedLockVersion: z.number().int().positive(),
    datos: z.object({ decision_event_id: z.string().regex(/^[1-9]\d*$/), reason: motivo }) }),
])
export type ComandoNoReparable = z.infer<typeof esquemaComandoNoReparable>
export function puedeDeclararNoReparable(estado: string, asignado: string | null, usuario: string | undefined, tecnico: boolean) {
  return tecnico && Boolean(usuario) && asignado === usuario
    && ['diagnosis', 'quote_approved', 'in_repair', 'awaiting_parts', 'testing'].includes(estado)
}
