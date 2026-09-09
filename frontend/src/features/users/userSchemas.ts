import { z } from 'zod'

import { assignablePermissionCodes, type PermissionCode } from '@/features/users/userTypes'

const permissionCodes = assignablePermissionCodes as [PermissionCode, ...PermissionCode[]]

export const userFormSchema = z.object({
  fullName: z.string().trim().min(2, 'Ingresa el nombre completo.').max(150, 'El nombre es demasiado largo.'),
  email: z.string().trim().email('Ingresa un correo válido.').max(254, 'El correo es demasiado largo.'),
  phone: z.string().trim().max(30, 'El teléfono es demasiado largo.')
    .refine((phone) => !phone || /^[+()\d\s-]+$/.test(phone), 'El teléfono solo puede contener números, espacios, +, paréntesis o guiones.')
    .refine((phone) => !phone || phone.replace(/\D/g, '').length >= 6, 'Ingresa al menos 6 dígitos o deja el teléfono vacío.')
    .refine((phone) => !phone || phone.replace(/\D/g, '').length <= 15, 'El teléfono no puede contener más de 15 dígitos.'),
  isAdmin: z.boolean(),
  permissionCodes: z.array(z.enum(permissionCodes))
    .refine((permissions) => new Set(permissions).size === permissions.length, 'No repitas permisos.'),
}).superRefine((values, context) => {
  if (values.isAdmin && values.permissionCodes.length > 0) {
    context.addIssue({ code: 'custom', path: ['permissionCodes'], message: 'El administrador total no utiliza permisos operativos individuales.' })
  }
  if (!values.isAdmin && values.permissionCodes.length === 0) {
    context.addIssue({ code: 'custom', path: ['permissionCodes'], message: 'Selecciona al menos un acceso operativo.' })
  }
})
