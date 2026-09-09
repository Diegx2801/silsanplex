import { z } from 'zod'

/** Permisos operativos delegables. USERS_MANAGE queda reservado a ADMIN. */
export const operationalPermissionCodes = [
  'PRODUCTS_VIEW',
  'PRODUCTS_MANAGE',
  'INVENTORY_VIEW',
  'INVENTORY_MANAGE',
  'SUPPLIERS_VIEW',
  'SUPPLIERS_MANAGE',
  'PURCHASES_VIEW',
  'PURCHASES_MANAGE',
  'PURCHASES_RECEIVE',
  'CUSTOMERS_VIEW',
  'CUSTOMERS_MANAGE',
  'CUSTOMERS_EXPORT',
  'REPAIRS_VIEW',
  'REPAIRS_CREATE',
  'REPAIRS_UPDATE',
  'REPAIRS_ASSIGN',
  'REPAIRS_CHANGE_STATUS',
  'REPAIRS_APPROVE_QUOTE',
  'REPAIRS_USE_PARTS',
  'REPAIRS_DELIVER',
  'REPAIRS_PERFORM_TECHNICAL',
  'SALES_VIEW',
  'SALES_MANAGE',
  'DISTRIBUTION_VIEW',
  'DISTRIBUTION_MANAGE',
] as const

const operationalPermissionCodeSchema = z.enum(operationalPermissionCodes)
const userIdSchema = z.string().uuid()
const fullNameSchema = z.string().trim().min(2).max(150)
const emailSchema = z.string().trim().toLowerCase().email().max(254)
const accessVersionSchema = z.number().int().positive()
const phoneSchema = z.string().trim().max(30).optional().default('').superRefine(
  (phone, context) => {
    if (!phone) return

    if (!/^\+?[0-9()\-\s]+$/.test(phone)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El teléfono contiene caracteres no permitidos.',
      })
      return
    }

    const digitCount = phone.replace(/\D/g, '').length
    if (digitCount < 6 || digitCount > 15) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El teléfono debe contener entre 6 y 15 dígitos.',
      })
    }
  },
)
const permissionsSchema = z.array(operationalPermissionCodeSchema)
  .max(operationalPermissionCodes.length)

export const adminUserRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({
    action: z.literal('create'),
    email: emailSchema,
    fullName: fullNameSchema,
    phone: phoneSchema,
    isAdmin: z.boolean(),
    permissionCodes: permissionsSchema,
  }),
  z.object({
    action: z.literal('update'),
    userId: userIdSchema,
    email: emailSchema,
    fullName: fullNameSchema,
    phone: phoneSchema,
    isAdmin: z.boolean(),
    permissionCodes: permissionsSchema,
    accessVersion: accessVersionSchema,
  }),
  z.object({
    action: z.literal('set-status'),
    userId: userIdSchema,
    isActive: z.boolean(),
  }),
  z.object({
    action: z.literal('send-password-reset'),
    userId: userIdSchema,
  }),
  z.object({
    action: z.literal('resend-invitation'),
    userId: userIdSchema,
  }),
]).superRefine((request, context) => {
  if (request.action !== 'create' && request.action !== 'update') return

  if (new Set(request.permissionCodes).size !== request.permissionCodes.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['permissionCodes'],
      message: 'Los permisos seleccionados no pueden repetirse.',
    })
  }

  if (request.isAdmin && request.permissionCodes.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['permissionCodes'],
      message: 'Una cuenta administradora no requiere permisos operativos directos.',
    })
  }

  if (!request.isAdmin && request.permissionCodes.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['permissionCodes'],
      message: 'Selecciona al menos un permiso operativo.',
    })
  }
})

export type AdminUserRequest = z.infer<typeof adminUserRequestSchema>
