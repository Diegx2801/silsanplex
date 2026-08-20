import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

import type { Permission } from '@/features/auth/permissions'

export interface UserAccess {
  organizationId: string
  organizationName: string
  roles: string[]
  permissions: string[]
}

export interface AuthContextValue {
  session: Session | null
  user: User | null
  access: UserAccess | null
  isAdmin: boolean
  isLoading: boolean
  sessionError: string | null
  accessError: string | null
  hasPermission: (permission: Permission) => boolean
  reintentarAcceso: () => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
