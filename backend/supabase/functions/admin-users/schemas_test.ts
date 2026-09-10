import { adminUserRequestSchema } from './schemas.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('acepta una creación con permisos operativos explícitos', () => {
  const result = adminUserRequestSchema.safeParse({
    action: 'create',
    email: 'USUARIO@SILSAN.COM',
    fullName: 'Usuario SILSAN',
    phone: '+51 999-888-777',
    isAdmin: false,
    permissionCodes: ['SALES_VIEW', 'SALES_MANAGE'],
  })

  assert(result.success, 'La solicitud válida fue rechazada')
  assert(result.data.action === 'create', 'La acción no corresponde a creación')
  assert(result.data.email === 'usuario@silsan.com', 'El correo no se normalizó')
})

Deno.test('acepta crear un administrador sin permisos directos', () => {
  const result = adminUserRequestSchema.safeParse({
    action: 'create',
    email: 'admin@silsan.com',
    fullName: 'Administrador SILSAN',
    isAdmin: true,
    permissionCodes: [],
  })

  assert(result.success, 'La creación del administrador fue rechazada')
})

Deno.test('rechaza una cuenta operativa sin permisos', () => {
  const result = adminUserRequestSchema.safeParse({
    action: 'create',
    email: 'usuario@silsan.com',
    fullName: 'Usuario SILSAN',
    isAdmin: false,
    permissionCodes: [],
  })

  assert(!result.success, 'La solicitud sin permisos fue aceptada')
})

Deno.test('impide asignar permisos directos a un administrador', () => {
  const result = adminUserRequestSchema.safeParse({
    action: 'create',
    email: 'admin@silsan.com',
    fullName: 'Administrador SILSAN',
    isAdmin: true,
    permissionCodes: ['PRODUCTS_VIEW'],
  })

  assert(!result.success, 'La combinación ambigua de accesos fue aceptada')
})

Deno.test('rechaza permisos administrativos y códigos desconocidos', () => {
  for (const permissionCode of ['USERS_MANAGE', 'ADMIN', 'UNKNOWN_PERMISSION']) {
    const result = adminUserRequestSchema.safeParse({
      action: 'create',
      email: 'usuario@silsan.com',
      fullName: 'Usuario SILSAN',
      isAdmin: false,
      permissionCodes: [permissionCode],
    })

    assert(!result.success, `El permiso no delegable ${permissionCode} fue aceptado`)
  }
})

Deno.test('rechaza permisos operativos duplicados', () => {
  const result = adminUserRequestSchema.safeParse({
    action: 'create',
    email: 'usuario@silsan.com',
    fullName: 'Usuario SILSAN',
    isAdmin: false,
    permissionCodes: ['INVENTORY_VIEW', 'INVENTORY_VIEW'],
  })

  assert(!result.success, 'Los permisos duplicados fueron aceptados')
})

Deno.test('exige la versión de accesos al editar', () => {
  const baseRequest = {
    action: 'update' as const,
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'usuario@silsan.com',
    fullName: 'Usuario SILSAN',
    isAdmin: false,
    permissionCodes: ['INVENTORY_VIEW'],
  }

  assert(!adminUserRequestSchema.safeParse(baseRequest).success, 'Se aceptó una edición sin versión')
  assert(
    !adminUserRequestSchema.safeParse({ ...baseRequest, accessVersion: 0 }).success,
    'Se aceptó una versión inexistente',
  )
  assert(
    adminUserRequestSchema.safeParse({ ...baseRequest, accessVersion: 1 }).success,
    'Se rechazó una edición con versión válida',
  )
})

Deno.test('el teléfono es opcional y se valida solamente cuando se informa', () => {
  const baseRequest = {
    action: 'create' as const,
    email: 'usuario@silsan.com',
    fullName: 'Usuario SILSAN',
    isAdmin: false,
    permissionCodes: ['PRODUCTS_VIEW'],
  }

  assert(adminUserRequestSchema.safeParse(baseRequest).success, 'Se hizo obligatorio el teléfono')
  assert(
    !adminUserRequestSchema.safeParse({ ...baseRequest, phone: 'abc123' }).success,
    'Se aceptaron letras en el teléfono',
  )
  assert(
    !adminUserRequestSchema.safeParse({ ...baseRequest, phone: '12345' }).success,
    'Se aceptó un teléfono demasiado corto',
  )
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
