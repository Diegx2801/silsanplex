import { describe, expect, it } from 'vitest'
import { esquemaImporteCosto, esquemaResumenCosto, importeCostoExacto } from './costoReal'

describe('R14 importes exactos y estados', () => {
  it.each(['0', '0.01', '9999999999999999.99', '12.50'])('admite el importe textual explícito %s', amount => {
    expect(esquemaImporteCosto.parse(amount)).toBe(amount)
  })
  it.each(['-1', '1.001', 'NaN', 'Infinity', '1e3', '', ' ', '10000000000000000.00'])('rechaza %s sin redondearlo', amount => {
    expect(esquemaImporteCosto.safeParse(amount).success).toBe(false)
  })
  it('no usa Number para redondear valores más grandes que el entero seguro de JS', () => {
    expect(importeCostoExacto('9999999999999999.99')).toBe('9,999,999,999,999,999.99')
    expect(importeCostoExacto('10000000000000000.00')).toBe('10,000,000,000,000,000.00')
    expect(importeCostoExacto('0.0000125')).toBe('0.0000125')
    expect(importeCostoExacto('0')).toBe('0.00')
  })
  it.each([undefined, null, 'NaN', '-5', 'Infinity'])('no transforma %s en cero', amount => {
    expect(importeCostoExacto(amount)).toBe('No verificable')
  })
  it('conserva monedas separadas y un total nulo aunque estén revisadas', () => {
    const subtotal = { amount: '9999999999999999.99', currency: 'PEN', cost_basis: 'not_applicable' }
    const result = esquemaResumenCosto.parse({ repair_id: 'b1400000-0000-4000-8000-000000000001', lock_version: 4, source_fingerprint: 'a'.repeat(64),
      state: 'confirmed', can_confirm: true, total: null, subtotals: [subtotal, { ...subtotal, currency: 'USD', amount: '2.50' }], components: [], item_count: 2,
      pending: [], warnings: ['multiple_currencies_no_conversion'], latest_review: null })
    expect(result.total).toBeNull()
    expect(result.subtotals.map(s=>[s.currency,s.amount])).toEqual([['PEN',subtotal.amount],['USD','2.50']])
  })
})
