import { describe, expect, it } from 'vitest'

import { userFormSchema } from '@/features/users/userSchemas'

describe('userFormSchema', () => {
  it('acepta un técnico sin asignarle ADMIN', () => {
    const result = userFormSchema.parse({
      fullName: 'Técnico de Reparaciones', email: 'tecnico@silsan.com',
      phone: '', roleCodes: ['TECNICO_REPARACIONES'],
    })
    expect(result.roleCodes).toEqual(['TECNICO_REPARACIONES'])
  })
  it('acepta un usuario con correo y varios roles', () => {
    const result = userFormSchema.safeParse({
      fullName: 'Usuario de Ventas',
      email: 'ventas@silsan.com',
      phone: '999888777',
      roleCodes: ['VENTAS', 'ALMACEN'],
    })

    expect(result.success).toBe(true)
  })

  it('rechaza usuarios sin correo válido', () => {
    const result = userFormSchema.safeParse({
      fullName: 'Usuario de Ventas',
      email: 'correo-invalido',
      phone: '',
      roleCodes: ['VENTAS'],
    })

    expect(result.success).toBe(false)
  })

  it('requiere al menos un rol', () => {
    const result = userFormSchema.safeParse({
      fullName: 'Usuario de Ventas',
      email: 'ventas@silsan.com',
      phone: '',
      roleCodes: [],
    })

    expect(result.success).toBe(false)
  })

  it('rechaza roles repetidos', () => {
    const result = userFormSchema.safeParse({
      fullName: 'Usuario de Ventas',
      email: 'ventas@silsan.com',
      phone: '',
      roleCodes: ['VENTAS', 'VENTAS'],
    })

    expect(result.success).toBe(false)
  })
})
