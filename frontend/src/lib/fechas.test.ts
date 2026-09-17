import { describe, expect, it } from 'vitest'

import {
  fechaActualPeru,
  fechaPeruDesdeTimestamp,
  fechaPeruEnDias,
  formatearFechaCalendarioPeru,
} from './fechas'

describe('fechas de negocio peruanas', () => {
  it('mantiene el día calendario de Lima en el límite UTC', () => {
    expect(fechaPeruDesdeTimestamp('2026-09-16T03:30:00.000Z')).toBe('2026-09-15')
    expect(fechaPeruDesdeTimestamp('2026-09-16T05:00:00.000Z')).toBe('2026-09-16')
  })

  it('calcula el día actual y los desplazamientos en America/Lima', () => {
    const instante = new Date('2026-09-16T03:30:00.000Z')
    expect(fechaActualPeru(instante)).toBe('2026-09-15')
    expect(fechaPeruEnDias(1, instante)).toBe('2026-09-16')
  })

  it('formatea una fecha SQL DATE sin desplazarla de día', () => {
    expect(formatearFechaCalendarioPeru('2026-09-16')).toContain('16')
    expect(formatearFechaCalendarioPeru('2026-09-16')).toContain('2026')
  })
})

