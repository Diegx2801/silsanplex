import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invokeEdgeFunction: vi.fn() }))
vi.mock('@/lib/edgeFunctions', () => ({ invokeEdgeFunction: mocks.invokeEdgeFunction }))

import { consultarDni } from './dniLookupService'

const respuesta = {
  dni: '46027897',
  firstName: 'ERACLEO JUAN',
  firstLastName: 'HUAMANI',
  secondLastName: 'MENDOZA',
  fullName: 'HUAMANI MENDOZA ERACLEO JUAN',
  source: 'DECOLECTA_RENIEC',
  checkedAt: '2026-09-01T12:00:00.000Z',
}

describe('consultarDni', () => {
  beforeEach(() => mocks.invokeEdgeFunction.mockReset())

  it('usa la Edge Function DNI y valida la respuesta', async () => {
    mocks.invokeEdgeFunction.mockResolvedValue(respuesta)

    await expect(consultarDni(respuesta.dni)).resolves.toEqual(respuesta)
    expect(mocks.invokeEdgeFunction).toHaveBeenCalledWith('dni-lookup', { dni: respuesta.dni })
  })

  it('rechaza respuestas incompletas del backend', async () => {
    mocks.invokeEdgeFunction.mockResolvedValue({ dni: respuesta.dni })

    await expect(consultarDni(respuesta.dni)).rejects.toThrow(
      'El servicio de identidad devolvió datos incompletos',
    )
  })
})
