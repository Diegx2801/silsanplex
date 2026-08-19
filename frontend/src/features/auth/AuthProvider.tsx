import type { Session, User } from '@supabase/supabase-js'
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase } from '@/lib/supabase'

interface UserAccess {
  organizationId: string
  organizationName: string
  roles: string[]
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  access: UserAccess | null
  isAdmin: boolean
  isLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function loadUserAccess(userId: string): Promise<UserAccess | null> {
  const { data: membership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id, is_active')
    .eq('user_id', userId)
    .maybeSingle()

  if (membershipError) throw membershipError
  if (!membership?.is_active) return null

  const [organizationResult, rolesResult] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, is_active')
      .eq('id', membership.organization_id)
      .maybeSingle(),
    supabase
      .from('user_roles')
      .select('role_code')
      .eq('organization_id', membership.organization_id)
      .eq('user_id', userId),
  ])

  if (organizationResult.error) throw organizationResult.error
  if (rolesResult.error) throw rolesResult.error
  if (!organizationResult.data?.is_active) return null

  return {
    organizationId: membership.organization_id,
    organizationName: organizationResult.data.name,
    roles: (rolesResult.data ?? []).map((role) => role.role_code),
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [access, setAccess] = useState<UserAccess | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [accessLoading, setAccessLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setSessionLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setSessionLoading(false)
      },
    )

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!session?.user.id) {
      setAccess(null)
      setAccessLoading(false)
      return
    }

    setAccessLoading(true)
    void loadUserAccess(session.user.id)
      .then((nextAccess) => {
        if (!cancelled) setAccess(nextAccess)
      })
      .catch(() => {
        if (!cancelled) setAccess(null)
      })
      .finally(() => {
        if (!cancelled) setAccessLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session?.access_token, session?.user.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      access,
      isAdmin: access?.roles.includes('ADMIN') ?? false,
      isLoading: sessionLoading || accessLoading,
      signOut: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }),
    [access, accessLoading, session, sessionLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider.')
  }

  return context
}
