import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invokeEdgeFunction: vi.fn() }))
vi.mock('@/lib/edgeFunctions', () => ({ invokeEdgeFunction: mocks.invokeEdgeFunction }))

import { consultarRuc } from './rucLookupService'

describe('consultarRuc', () => {
  beforeEach(() => mocks.invokeEdgeFunction.mockReset())

  it('usa exclusivamente la Edge Function y valida la respuesta', async () => {
    mocks.invokeEdgeFunction.mockResolvedValue({
      lookupId: '11111111-1111-4111-8111-111111111111',
      ruc: '20550154065',
      legalName: 'EMPRESA DE PRUEBA S.A.C.',
      taxpayerStatus: 'ACTIVO',
      domicileCondition: 'HABIDO',
      ubigeoCode: '150140',
      fiscalAddress: 'AV. PRUEBA 123',
      source: 'DECOLECTA',
      checkedAt: '2026-08-21T12:00:00.000Z',
      cacheHit: false,
    })

    const resultado = await consultarRuc('20550154065')

    expect(mocks.invokeEdgeFunction).toHaveBeenCalledWith('ruc-lookup', { ruc: '20550154065' })
    expect(resultado.legalName).toBe('EMPRESA DE PRUEBA S.A.C.')
  })

  it('rechaza respuestas incompletas del backend', async () => {
    mocks.invokeEdgeFunction.mockResolvedValue({ ruc: '20550154065' })
    await expect(consultarRuc('20550154065')).rejects.toThrow()
  })
})
