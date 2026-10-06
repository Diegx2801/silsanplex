import { describe, expect, it } from 'vitest'

import { crearPeriodoUltimos30Dias } from './reporteMovimientos'

describe('crearPeriodoUltimos30Dias', () => {
  it('incluye hoy y los 29 días calendario anteriores sin desplazamiento UTC', () => {
    expect(crearPeriodoUltimos30Dias(new Date(2026, 9, 5, 23, 45))).toEqual({
      fechaDesde: '2026-09-06',
      fechaHasta: '2026-10-05',
    })
  })
})
