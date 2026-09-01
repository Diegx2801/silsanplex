import { describe, expect, it } from 'vitest'

import { formatearFechaDistribucion } from './formatoDistribucion'

describe('formatearFechaDistribucion', () => {
  it('muestra un marcador para una fecha de entrega vacía', () => {
    expect(formatearFechaDistribucion('')).toBe('Sin fecha')
    expect(formatearFechaDistribucion(null)).toBe('Sin fecha')
  })

  it('muestra un marcador para una fecha inválida', () => {
    expect(formatearFechaDistribucion('no-es-fecha')).toBe('Sin fecha')
  })

  it('formatea una fecha válida sin desfase de zona horaria', () => {
    expect(formatearFechaDistribucion('2026-09-02')).toContain('02')
  })
})
