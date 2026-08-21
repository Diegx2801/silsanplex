import { extractSessionId } from '../_shared/authorization.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Se esperaba ${String(expected)} y se recibió ${String(actual)}`)
  }
}

function tokenWithPayload(payload: object) {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `header.${encodedPayload}.signature`
}

Deno.test('extrae un session_id válido de un JWT verificado', () => {
  assertEquals(
    extractSessionId(
      tokenWithPayload({
        session_id: '11111111-1111-4111-8111-111111111111',
      }),
    ),
    '11111111-1111-4111-8111-111111111111',
  )
})

Deno.test('rechaza tokens sin un session_id válido', () => {
  assertEquals(extractSessionId(tokenWithPayload({ sub: 'user-id' })), null)
  assertEquals(extractSessionId('token-invalido'), null)
})
