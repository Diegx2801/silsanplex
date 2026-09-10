import { invokeEdgeFunction } from '@/lib/edgeFunctions'
import type {
  ManagedUser,
  PermissionCode,
  UserInput,
} from '@/features/users/userTypes'

interface RawManagedUser {
  user_id: string
  organization_id: string
  email: string
  full_name: string
  phone: string | null
  is_active: boolean
  auth_confirmed_at: string | null
  permission_codes: PermissionCode[]
  is_admin: boolean
  access_version: number
  created_at: string
  updated_at: string
}

async function invokeAdminUsers<T>(body: object): Promise<T> {
  return invokeEdgeFunction<T>('admin-users', body)
}

export async function listUsers(): Promise<ManagedUser[]> {
  const result = await invokeAdminUsers<{ users: RawManagedUser[] }>({ action: 'list' })

  return result.users.map((user) => ({
    id: user.user_id,
    organizationId: user.organization_id,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    isActive: user.is_active,
    authConfirmedAt: user.auth_confirmed_at,
    permissionCodes: user.permission_codes,
    isAdmin: user.is_admin,
    accessVersion: user.access_version,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  }))
}

export async function createUser(input: UserInput) {
  return invokeAdminUsers<{ userId: string }>({
    action: 'create',
    ...input,
  })
}

export async function updateUser(
  user: Pick<ManagedUser, 'id' | 'accessVersion'>,
  input: UserInput,
) {
  return invokeAdminUsers<{ userId: string }>({
    action: 'update',
    userId: user.id,
    accessVersion: user.accessVersion,
    ...input,
  })
}

export async function setUserStatus(userId: string, isActive: boolean) {
  return invokeAdminUsers<{ userId: string; isActive: boolean }>({
    action: 'set-status',
    userId,
    isActive,
  })
}

export async function sendPasswordReset(userId: string) {
  return invokeAdminUsers<{ userId: string }>({
    action: 'send-password-reset',
    userId,
  })
}

export async function resendInvitation(userId: string) {
  return invokeAdminUsers<{ userId: string }>({
    action: 'resend-invitation',
    userId,
  })
}
