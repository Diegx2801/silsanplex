import { useQueryClient } from '@tanstack/react-query'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  AuthContext,
  type AuthContextValue,
  type UserAccess,
} from '@/features/auth/AuthContext'
import { limpiarDatosTemporalesDeSesion } from '@/features/auth/sessionCleanup'
import { supabase } from '@/lib/supabase'

async function loadUserAccess(userId: string): Promise<UserAccess | null> {
  const { data: membership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) throw membershipError
  if (!membership) return null

  const [organizationResult, rolesResult, permissionsResult] = await Promise.all([
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
    supabase.rpc('current_user_permissions'),
  ])

  if (organizationResult.error) throw organizationResult.error
  if (rolesResult.error) throw rolesResult.error
  if (permissionsResult.error) throw permissionsResult.error
  if (!organizationResult.data?.is_active) return null

  const permissions = Array.isArray(permissionsResult.data)
    ? permissionsResult.data.filter(
        (permission): permission is string => typeof permission === 'string',
      )
    : []

  return {
    organizationId: membership.organization_id,
    organizationName: organizationResult.data.name,
    roles: (rolesResult.data ?? []).map((role) => role.role_code),
    permissions: [...new Set(permissions)],
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [access, setAccess] = useState<UserAccess | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [accessLoading, setAccessLoading] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [accessAttempt, setAccessAttempt] = useState(0)

  useEffect(() => {
    let mounted = true
    let currentUserId: string | null = null
    let currentAccessToken: string | null = null
    let sessionInitializationFailed = false
    let initialAuthEventSession: Session | null | undefined

    const actualizarSesion = (
      nextSession: Session | null,
      event?: AuthChangeEvent,
    ) => {
      if (!mounted) return

      if (event === 'INITIAL_SESSION') {
        initialAuthEventSession = nextSession
        if (sessionInitializationFailed && !nextSession) return
      }

      const nextUserId = nextSession?.user.id ?? null
      const nextAccessToken = nextSession?.access_token ?? null
      const cambioDeUsuario =
        currentUserId !== null && currentUserId !== nextUserId
      const mismaSesion =
        currentUserId === nextUserId && currentAccessToken === nextAccessToken
      const debeRecargarAcceso =
        Boolean(nextSession) &&
        event !== undefined &&
        event !== 'INITIAL_SESSION' &&
        mismaSesion

      currentUserId = nextUserId
      currentAccessToken = nextAccessToken

      setSession(nextSession)
      setAccess(null)
      setAccessError(null)
      setSessionError(null)
      setAccessLoading(Boolean(nextSession))
      setSessionLoading(false)

      if (debeRecargarAcceso) {
        setAccessAttempt((attempt) => attempt + 1)
      }

      if (!nextSession || cambioDeUsuario) {
        limpiarDatosTemporalesDeSesion(window.sessionStorage)
        queryClient.clear()
      }
    }

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error
        actualizarSesion(data.session)
      })
      .catch(() => {
        if (!mounted) return
        if (initialAuthEventSession) return

        sessionInitializationFailed = true

        setSession(null)
        setAccess(null)
        setAccessError(null)
        setSessionLoading(false)
        setAccessLoading(false)
        setSessionError('No se pudo verificar la sesión. Inténtalo nuevamente.')
        limpiarDatosTemporalesDeSesion(window.sessionStorage)
        queryClient.clear()
      })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        actualizarSesion(nextSession, event)
      },
    )

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [queryClient])

  useEffect(() => {
    if (!session?.user.id) return

    let lastRevalidation = 0
    const revalidateAccess = () => {
      const now = Date.now()
      if (now - lastRevalidation < 500) return

      lastRevalidation = now
      setAccessAttempt((attempt) => attempt + 1)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') revalidateAccess()
    }

    window.addEventListener('focus', revalidateAccess)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', revalidateAccess)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [session?.user.id])

  useEffect(() => {
    let cancelled = false

    if (!session?.user.id) {
      setAccess(null)
      setAccessLoading(false)
      setAccessError(null)
      return
    }

    setAccessLoading(true)
    setAccessError(null)
    void loadUserAccess(session.user.id)
      .then((nextAccess) => {
        if (cancelled) return

        if (!nextAccess) {
          limpiarDatosTemporalesDeSesion(window.sessionStorage)
          queryClient.clear()
        }
        setAccess(nextAccess)
      })
      .catch(() => {
        if (!cancelled) {
          setAccess(null)
          setAccessError('No se pudo verificar el acceso de tu cuenta.')
        }
      })
      .finally(() => {
        if (!cancelled) setAccessLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessAttempt, queryClient, session?.access_token, session?.user.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      access,
      isAdmin: access?.roles.includes('ADMIN') ?? false,
      hasPermission: (permission) =>
        access?.permissions.includes(permission) ?? false,
      isLoading: sessionLoading || accessLoading,
      sessionError,
      accessError,
      reintentarAcceso: () => setAccessAttempt((attempt) => attempt + 1),
      signOut: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error

        limpiarDatosTemporalesDeSesion(window.sessionStorage)
        queryClient.clear()
        setSession(null)
        setAccess(null)
        setAccessError(null)
        setAccessLoading(false)
      },
    }),
    [access, accessError, accessLoading, queryClient, session, sessionError, sessionLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
