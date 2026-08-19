import { adminUserRequestSchema } from './schemas.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('acepta una solicitud válida de creación', () => {
  const result = adminUserRequestSchema.safeParse({
    action: 'create',
    email: 'USUARIO@SILSAN.COM',
    fullName: 'Usuario SILSAN',
    phone: '',
    roleCodes: ['VENTAS', 'ALMACEN'],
  })

  assert(result.success, 'La solicitud válida fue rechazada')
  assert(result.data.action === 'create', 'La acción no corresponde a creación')
  assert(result.data.email === 'usuario@silsan.com', 'El correo no se normalizó')
})

Deno.test('rechaza una creación sin roles', () => {
  const result = adminUserRequestSchema.safeParse({
    action: 'create',
    email: 'usuario@silsan.com',
    fullName: 'Usuario SILSAN',
    roleCodes: [],
  })

  assert(!result.success, 'La solicitud sin roles fue aceptada')
})

Deno.test('rechaza identificadores de usuario inválidos', () => {
  const result = adminUserRequestSchema.safeParse({
    action: 'set-status',
    userId: 'no-es-un-uuid',
    isActive: false,
  })

  assert(!result.success, 'El identificador inválido fue aceptado')
})

Deno.test('acepta el reenvío de una invitación pendiente', () => {
  const result = adminUserRequestSchema.safeParse({
    action: 'resend-invitation',
    userId: '11111111-1111-4111-8111-111111111111',
  })

  assert(result.success, 'La solicitud de reenvío debería ser válida')
})
