import { beforeEach, describe, expect, it } from 'vitest'

import { limpiarDatosTemporalesDeSesion } from '@/features/auth/sessionCleanup'

describe('limpiarDatosTemporalesDeSesion', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('elimina únicamente datos temporales de SILSANPLEX', () => {
    window.sessionStorage.setItem('silsanplex.productos-temporales.v1', '[]')
    window.sessionStorage.setItem('silsanplex.cotizaciones-temporales.v1', '[]')
    window.sessionStorage.setItem('otra-aplicacion.estado', 'conservar')

    limpiarDatosTemporalesDeSesion(window.sessionStorage)

    expect(window.sessionStorage.getItem('silsanplex.productos-temporales.v1')).toBeNull()
    expect(
      window.sessionStorage.getItem('silsanplex.cotizaciones-temporales.v1'),
    ).toBeNull()
    expect(window.sessionStorage.getItem('otra-aplicacion.estado')).toBe('conservar')
  })
})
