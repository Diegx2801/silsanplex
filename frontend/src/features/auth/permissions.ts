export const PERMISSIONS = {
  USERS_MANAGE: 'USERS_MANAGE',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
