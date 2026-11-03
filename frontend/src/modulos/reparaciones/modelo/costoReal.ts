import { z } from 'zod'

export const monedasCosto = ['PEN', 'USD'] as const
export const basesCosto = ['tax_inclusive', 'tax_exclusive', 'not_applicable'] as const
export const componentesCosto = ['consumption', 'external', 'labor', 'other'] as const
export const etiquetasBaseCosto = { tax_inclusive: 'Incluye impuestos', tax_exclusive: 'Sin impuestos', not_applicable: 'No afecto / no aplica' }
export const etiquetasComponenteCosto: Record<string, string> = {
  consumption: 'Repuestos consumidos', external: 'Servicios externos', labor: 'Mano de obra interna', other: 'Otros gastos', inconsistent_parts: 'Consumos incompletos',
}
export const etiquetasEstadoCosto = { confirmed: 'Costo real confirmado', partial: 'Costo parcial registrado', undetermined: 'Costo no determinado' }
const decimal = z.string().regex(/^\d+(\.\d+)?$/)
const subtotal = z.object({ amount: decimal, currency: z.enum(monedasCosto), cost_basis: z.enum(basesCosto) })
export const esquemaResumenCosto = z.object({
  repair_id: z.string().uuid(), lock_version: z.number().int().positive(), source_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(['confirmed', 'partial', 'undetermined']), can_confirm: z.boolean(), total: subtotal.nullable(),
  subtotals: z.array(subtotal), components: z.array(subtotal.extend({ component: z.string(), count: z.number().int().nonnegative() })),
  item_count: z.number().int().nonnegative(), pending: z.array(z.object({ reason: z.string(), source_kind: z.string().optional(), source_id: z.string().optional() })),
  warnings: z.array(z.string()), latest_review: z.object({ id: z.string().uuid(), cutoff_at: z.string(), reviewed_by: z.string().uuid(),
    reviewed_by_name: z.string(), scope: z.record(z.string(), z.string()), evidence_reference: z.string(), is_current: z.boolean() }).nullable(),
})
export type ResumenCostoReal = z.infer<typeof esquemaResumenCosto>
export const esquemaItemCosto = z.object({
  source_kind: z.string(), source_id: z.string().uuid(), revision_id: z.string().uuid().nullable(), title: z.string(),
  amount: z.string().nullable(), original_amount: z.string().nullable(), currency: z.enum(monedasCosto).nullable(), cost_basis: z.enum(basesCosto).nullable(),
  is_verified: z.boolean(), pending_reason: z.string().nullable(), source_fingerprint: z.string(), details: z.record(z.string(), z.unknown()),
})
export type ItemCostoReal = z.infer<typeof esquemaItemCosto>
export const esquemaHistorialCosto = z.object({
  kind: z.enum(['entry', 'source_review', 'confirmation']), id: z.string().uuid(), supersedes_id: z.string().nullable().optional(),
  description: z.string().optional(), category: z.string().optional(), amount: z.string().nullable().optional(), currency: z.string().optional(),
  reason: z.string(), evidence_reference: z.string(), actor_name: z.string(), recorded_at: z.string(), sequence_number: z.string(),
  cost_basis: z.enum(basesCosto).nullable().optional(), previous_amount: z.string().nullable().optional(),
  previous_currency: z.enum(monedasCosto).nullable().optional(), previous_cost_basis: z.enum(basesCosto).nullable().optional(),
  is_effective: z.boolean().optional(), is_current: z.boolean().optional(),
  scope: z.record(z.string(), z.enum(['complete', 'not_applicable'])).optional(),
}).passthrough()
export const esquemaDetalleCosto = z.object({ summary: esquemaResumenCosto, items: z.array(esquemaItemCosto), history: z.array(esquemaHistorialCosto),
  total_items: z.number().int().nonnegative(), total_history: z.number().int().nonnegative(), offset: z.number().int(), limit: z.number().int() })
export const esquemaComandoCosto = z.object({
  tipo: z.enum(['record_repair_actual_cost', 'revise_repair_actual_cost', 'verify_repair_cost_source', 'revise_repair_external_cost', 'confirm_repair_actual_cost_review']),
  datos: z.record(z.string(), z.unknown()), expectedLockVersion: z.number().int().positive(),
})
export type ComandoCostoReal = z.infer<typeof esquemaComandoCosto>
export const esquemaImporteCosto = z.string().trim().regex(/^\d{1,16}(\.\d{1,2})?$/, 'Indica un importe no negativo con hasta dos decimales')

/** Lossless presentation. All sums and monetary rounding are PostgreSQL's job. */
export function importeCostoExacto(valor: string | null | undefined) {
  if (!valor || !/^\d+(\.\d+)?$/.test(valor)) return 'No verificable'
  const [entero, fraccion = ''] = valor.split('.')
  const decimales = fraccion.replace(/0+$/, '').padEnd(2, '0')
  return `${BigInt(entero).toLocaleString('es-PE')}.${decimales}`
}
export const motivosCosto: Record<string, string> = {
  inventory_documentary_inconsistent: 'La cadena de compra/recepción contradice el movimiento (orden, producto, bucket, cantidad o costo). No puede acreditarse.',
  inventory_currency_basis_unverified: 'Moneda y base de inventario no acreditadas. No se asume PEN.',
  historical_zero_unverified: 'Cero histórico sin evidencia de gratuidad.',
  consumption_movement_inconsistent: 'El consumo no coincide con su movimiento de inventario.',
  consumption_ledger_inconsistent: 'La cantidad consumida no coincide con el ledger.',
  external_return_pending: 'Servicio pendiente de retorno: costo desconocido.',
  external_basis_unverified: 'Costo declarado al retorno; falta verificar su base económica.',
  incompatible_tax_bases: 'Hay bases tributarias incompatibles; no se suman.',
  scope_review_required: 'Falta revisión explícita del alcance económico.',
  economic_review_outdated: 'Las fuentes económicas cambiaron; requiere nueva revisión.',
}
