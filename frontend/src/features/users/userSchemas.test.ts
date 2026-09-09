import { describe, expect, it } from 'vitest'

import { userFormSchema } from '@/features/users/userSchemas'

describe('userFormSchema', () => {
  it('acepta un administrador sin permisos individuales', () => {
    expect(userFormSchema.safeParse({ fullName: 'Administradora', email: 'admin@silsan.com', phone: '', isAdmin: true, permissionCodes: [] }).success).toBe(true)
  })

  it('acepta acceso operativo con al menos un permiso', () => {
    expect(userFormSchema.safeParse({ fullName: 'Usuario de Ventas', email: 'ventas@silsan.com', phone: '999 888 777', isAdmin: false, permissionCodes: ['SALES_VIEW'] }).success).toBe(true)
  })

  it('rechaza acceso operativo sin permisos', () => {
    expect(userFormSchema.safeParse({ fullName: 'Usuario sin acceso', email: 'usuario@silsan.com', phone: '', isAdmin: false, permissionCodes: [] }).success).toBe(false)
  })

  it('rechaza permisos administrativos fuera del catálogo operativo', () => {
    expect(userFormSchema.safeParse({ fullName: 'Usuario', email: 'usuario@silsan.com', phone: '', isAdmin: false, permissionCodes: ['USERS_MANAGE'] }).success).toBe(false)
  })

  it('rechaza permisos individuales para administrador total', () => {
    expect(userFormSchema.safeParse({ fullName: 'Administradora', email: 'admin@silsan.com', phone: '', isAdmin: true, permissionCodes: ['SALES_VIEW'] }).success).toBe(false)
  })

  it('valida el teléfono solo cuando se ingresa', () => {
    const base = { fullName: 'Usuario de Ventas', email: 'ventas@silsan.com', isAdmin: false, permissionCodes: ['SALES_VIEW'] }
    expect(userFormSchema.safeParse({ ...base, phone: '' }).success).toBe(true)
    expect(userFormSchema.safeParse({ ...base, phone: 'teléfono' }).success).toBe(false)
  })
})
