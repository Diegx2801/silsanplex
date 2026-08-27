import { describe, expect, it } from 'vitest'

import {
  datosReparacionInicial,
  esquemaDatosReparacion,
  limitarEnteroSeguro,
  normalizarBusquedaReparaciones,
  normalizarTextoOpcional,
  obtenerTransicionesGenericas,
  validarNumeroSerie,
} from './reparacion'

describe('modelo de reparaciones', () => {
  it('normaliza textos opcionales y búsquedas sin permitir patrones de PostgREST', () => {
    expect(normalizarTextoOpcional('  referencia  ')).toBe('referencia')
    expect(normalizarTextoOpcional('   ')).toBeNull()
    expect(normalizarBusquedaReparaciones(' REP-001, cliente_% ')).toBe('REP-001 cliente')
  })

  it('limita números de página a enteros seguros', () => {
    expect(limitarEnteroSeguro(Number.NaN, 1, 50)).toBe(1)
    expect(limitarEnteroSeguro(3.9, 1, 50)).toBe(3)
    expect(limitarEnteroSeguro(100, 1, 50)).toBe(50)
  })

  it('exige serie únicamente cuando el producto controla series', () => {
    expect(validarNumeroSerie('', true)).toBe('El número de serie es obligatorio para este producto')
    expect(validarNumeroSerie('SERIE-01', true)).toBeUndefined()
    expect(validarNumeroSerie('', false)).toBeUndefined()
  })

  it('valida los datos mínimos y conserva el estado inicial de garantía', () => {
    const datos = datosReparacionInicial()
    expect(datos.esGarantia).toBe(false)

    expect(esquemaDatosReparacion.safeParse({
      ...datos,
      clienteId: '00000000-0000-0000-0000-000000000001',
      productoId: '00000000-0000-0000-0000-000000000002',
      problema: 'No enciende',
    }).success).toBe(true)
  })

  it('expone solo transiciones comunes del estado actual', () => {
    expect(obtenerTransicionesGenericas('waiting_customer_approval')).toEqual([])
    expect(obtenerTransicionesGenericas('testing')).toEqual(['in_repair', 'ready_for_delivery'])
  })
})
