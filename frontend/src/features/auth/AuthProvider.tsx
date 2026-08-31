import { useQueryClient } from '@tanstack/react-query'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  AuthContext,
  type AuthContextValue,
  type UserAccess,
} from '@/features/auth/AuthContext'
import { limpiarDatosTemporalesDeSesion } from '@/features/auth/sessionCleanup'
import {
  isSessionInvalidationEvent,
  notifySessionInvalidated,
  SESSION_INVALIDATED_EVENT,
} from '@/features/auth/sessionEvents'
import { supabase } from '@/lib/supabase'

function isInvalidAuthSession(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { message?: unknown; name?: unknown; status?: unknown }
  const message = typeof candidate.message === 'string' ? candidate.message : ''
  const name = typeof candidate.name === 'string' ? candidate.name : ''

  return (
    name === 'AuthSessionMissingError' ||
    (candidate.status === 401 ||
      ((candidate.status === 400 || candidate.status === 403) &&
        /refresh token|session|jwt/i.test(message)))
  )
}

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
  const forcedSessionMessage = useRef<string | null>(null)

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
      const debeReiniciarAcceso = !nextSession || currentUserId !== nextUserId
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

      if (nextSession) forcedSessionMessage.current = null

      setSession(nextSession)
      if (debeReiniciarAcceso) setAccess(null)
      setAccessError(null)
      setSessionError(nextSession ? null : forcedSessionMessage.current)
      if (debeReiniciarAcceso) setAccessLoading(Boolean(nextSession))
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
        if (
          event === 'PASSWORD_RECOVERY' &&
          window.location.pathname !== '/establecer-contrasena'
        ) {
          window.history.replaceState(null, '', '/establecer-contrasena')
          window.dispatchEvent(new PopStateEvent('popstate'))
        }

        actualizarSesion(nextSession, event)
      },
    )

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [queryClient])

  useEffect(() => {
    const handleInvalidSession = (event: Event) => {
      if (!isSessionInvalidationEvent(event)) return

      forcedSessionMessage.current = event.detail.message
      setSession(null)
      setAccess(null)
      setAccessError(null)
      setAccessLoading(false)
      setSessionLoading(false)
      setSessionError(event.detail.message)
      limpiarDatosTemporalesDeSesion(window.sessionStorage)
      queryClient.clear()

      void supabase.auth.signOut({ scope: 'local' })
    }

    window.addEventListener(SESSION_INVALIDATED_EVENT, handleInvalidSession)
    return () => {
      window.removeEventListener(SESSION_INVALIDATED_EVENT, handleInvalidSession)
    }
  }, [queryClient])

  useEffect(() => {
    if (!session?.user.id) return

    let revalidationInFlight = false
    const revalidateAccess = () => {
      if (revalidationInFlight) return

      revalidationInFlight = true
      void (async () => {
        try {
          const { data, error } = await supabase.rpc(
            'current_auth_session_is_active',
          )
          if (error) throw error
          if (data !== true) {
            notifySessionInvalidated()
            return
          }

          setAccessAttempt((attempt) => attempt + 1)
        } catch (error: unknown) {
          if (isInvalidAuthSession(error)) {
            notifySessionInvalidated()
            return
          }

          if (import.meta.env.DEV) {
            console.error('No se pudo revalidar la sesión activa.', error)
          }
        } finally {
          revalidationInFlight = false
        }
      })()
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
      // Una revalidación en segundo plano no debe desmontar la interfaz ni
      // perder formularios abiertos. Solo bloqueamos la carga inicial.
      isLoading: sessionLoading || (accessLoading && !access),
      sessionError,
      accessError,
      reintentarAcceso: () => setAccessAttempt((attempt) => attempt + 1),
      signOut: async () => {
        forcedSessionMessage.current = null
        const remoteSignOut = supabase.auth.signOut({ scope: 'global' })
        limpiarDatosTemporalesDeSesion(window.sessionStorage)
        queryClient.clear()
        setSession(null)
        setAccess(null)
        setAccessError(null)
        setAccessLoading(false)
        setSessionError(null)
        const { error } = await remoteSignOut
        if (error) throw error
      },
    }),
    [access, accessError, accessLoading, queryClient, session, sessionError, sessionLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
