import { DecolectaRucProvider } from '../_shared/ruc/decolecta-provider.ts'
import { RucLookupError } from '../_shared/ruc/types.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('normaliza la respuesta parcial de APIsPerú', async () => {
  const provider = new DecolectaRucProvider({
    token: 'token-de-prueba',
    fetcher: () => Promise.resolve(new Response(JSON.stringify({
      nombre: 'EMPRESA DE PRUEBA S.A.C.',
      numeroDocumento: '20550154065',
      estado: 'Activo',
      condicion: 'Habido',
      direccion: 'AV. PRUEBA 123',
      ubigeo: '150140',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  })

  const result = await provider.lookup('20550154065')
  assert(result.legalName === 'EMPRESA DE PRUEBA S.A.C.', 'No mapeó la razón social')
  assert(result.taxpayerStatus === 'ACTIVO', 'No normalizó el estado')
  assert(result.domicileCondition === 'HABIDO', 'No normalizó la condición')
  assert(result.source === 'APISPERU', 'No registró la fuente')
})

Deno.test('traduce un RUC inexistente a un error de dominio', async () => {
  const provider = new DecolectaRucProvider({
    token: 'token-de-prueba',
    fetcher: () => Promise.resolve(new Response('{}', { status: 404 })),
  })

  try {
    await provider.lookup('20550154065')
    throw new Error('La consulta debería fallar')
  } catch (error) {
    assert(error instanceof RucLookupError, 'No devolvió un error de dominio')
    assert(error.code === 'RUC_NOT_FOUND', 'El código de error no corresponde')
  }
})

Deno.test('rechaza una respuesta cuyo RUC no coincide', async () => {
  const provider = new DecolectaRucProvider({
    token: 'token-de-prueba',
    fetcher: () => Promise.resolve(new Response(JSON.stringify({
      nombre: 'EMPRESA DE PRUEBA S.A.C.',
      numeroDocumento: '20111111111',
      estado: 'ACTIVO',
      condicion: 'HABIDO',
      direccion: '',
      ubigeo: '',
    }), { status: 200 })),
  })

  try {
    await provider.lookup('20550154065')
    throw new Error('La consulta debería fallar')
  } catch (error) {
    assert(error instanceof RucLookupError, 'No devolvió un error de dominio')
    assert(error.code === 'RUC_PROVIDER_RESPONSE_INVALID', 'Aceptó datos de otro RUC')
  }
})

Deno.test('exige configurar el token solo en el backend', async () => {
  const provider = new DecolectaRucProvider({ token: '' })
  try {
    await provider.lookup('20550154065')
    throw new Error('La consulta debería fallar')
  } catch (error) {
    assert(error instanceof RucLookupError, 'No devolvió un error de dominio')
    assert(error.code === 'RUC_PROVIDER_NOT_CONFIGURED', 'No detectó el token ausente')
  }
})
