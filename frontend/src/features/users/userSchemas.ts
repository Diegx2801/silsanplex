import { z } from 'zod'

import { roleOptions } from '@/features/users/userTypes'

const roleCodes = roleOptions.map((role) => role.code) as [
  (typeof roleOptions)[number]['code'],
  ...(typeof roleOptions)[number]['code'][],
]

export const userFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Ingresa el nombre completo.')
    .max(150, 'El nombre es demasiado largo.'),
  email: z
    .string()
    .trim()
    .email('Ingresa un correo válido.')
    .max(254, 'El correo es demasiado largo.'),
  phone: z.string().trim().max(30, 'El teléfono es demasiado largo.'),
  roleCodes: z.array(z.enum(roleCodes)).min(1, 'Selecciona al menos un rol.'),
})
