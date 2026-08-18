import { z } from 'zod'

export const roleCodes = [
  'ADMIN',
  'GERENCIA',
  'LOGISTICA',
  'ALMACEN',
  'COMPRAS',
  'VENTAS',
  'CONTABILIDAD',
] as const

const roleCodeSchema = z.enum(roleCodes)
const userIdSchema = z.string().uuid()
const fullNameSchema = z.string().trim().min(2).max(150)
const phoneSchema = z.string().trim().max(30).optional().default('')
const emailSchema = z.string().trim().toLowerCase().email().max(254)
const rolesSchema = z.array(roleCodeSchema).min(1).max(roleCodes.length)

export const adminUserRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({
    action: z.literal('create'),
    email: emailSchema,
    fullName: fullNameSchema,
    phone: phoneSchema,
    roleCodes: rolesSchema,
  }),
  z.object({
    action: z.literal('update'),
    userId: userIdSchema,
    email: emailSchema,
    fullName: fullNameSchema,
    phone: phoneSchema,
    roleCodes: rolesSchema,
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
])

export type AdminUserRequest = z.infer<typeof adminUserRequestSchema>
