import { describe, expect, it } from 'vitest'
import { leerCapturaUnidadMovimiento } from './capturaUnidadMovimiento'

describe('leerCapturaUnidadMovimiento', () => {
  it('normaliza la captura numérica de PostgreSQL sin recalcularla', () => {
    expect(leerCapturaUnidadMovimiento({ entered_quantity: '10.000000000', entered_unit_of_measure: 'Caja', unit_conversion_factor: '20.000000' }))
      .toEqual({ cantidadCapturada: 10, unidadCapturada: 'Caja', factorConversion: 20 })
  })
  it.each([
    {},
    { entered_quantity: null, entered_unit_of_measure: null, unit_conversion_factor: 1 },
    { entered_quantity: 'NaN', entered_unit_of_measure: 'Caja', unit_conversion_factor: 20 },
    { entered_quantity: 10, entered_unit_of_measure: ' ', unit_conversion_factor: 20 },
    { entered_quantity: 10, entered_unit_of_measure: 'Caja', unit_conversion_factor: 0 },
  ])('no fabrica datos cuando la captura está ausente o es inválida: %j', (fila) => {
    expect(leerCapturaUnidadMovimiento(fila)).toEqual({})
  })
})
