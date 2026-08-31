import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { notifySessionInvalidated } from '@/features/auth/sessionEvents'

type SessionEventCallback = (event: string, session: Session | null) => void

const mocks = vi.hoisted(() => {
  let sessionEventCallback: SessionEventCallback | null = null

  return {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn((callback: SessionEventCallback) => {
      sessionEventCallback = callback
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
    }),
    signOut: vi.fn(),
    rpc: vi.fn(),
    unsubscribe: vi.fn(),
    from: vi.fn(),
    emitSessionEvent(event: string, session: Session | null) {
      sessionEventCallback?.(event, session)
    },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}))

import { AuthProvider } from '@/features/auth/AuthProvider'
import { useAuth } from '@/features/auth/useAuth'

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: 1_900_000_000,
  token_type: 'bearer',
  user: { id: 'user-1', email: 'admin@silsan.local' },
} as unknown as Session

function configureActiveAccess() {
  mocks.rpc.mockImplementation(async (functionName: string) => {
    if (functionName === 'current_auth_session_is_active') {
      return { data: true, error: null }
    }

    return { data: ['USERS_MANAGE'], error: null }
  })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'organization_memberships') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { organization_id: 'organization-1' },
                error: null,
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'organizations') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'organization-1',
                name: 'Droguería SILSAN S.A.C.',
                is_active: true,
              },
              error: null,
            }),
          }),
        }),
      }
    }

    return {
      select: () => ({
        eq: () => ({
          eq: async () => ({
            data: [{ role_code: 'ADMIN' }],
            error: null,
          }),
        }),
      }),
    }
  })
}

function Probe() {
  const {
    access,
    hasPermission,
    isLoading,
    session,
    sessionError,
    signOut,
  } = useAuth()

  return (
    <>
      <output data-testid="session-state">{session ? 'activa' : 'cerrada'}</output>
      <output data-testid="access-state">{access ? 'habilitado' : 'sin acceso'}</output>
      <output data-testid="loading-state">{isLoading ? 'cargando' : 'lista'}</output>
      <output data-testid="session-error">{sessionError ?? 'sin error'}</output>
      <output data-testid="permission-state">
        {hasPermission('USERS_MANAGE') ? 'permitido' : 'denegado'}
      </output>
      <button type="button" onClick={() => void signOut()}>
        Cerrar prueba
      </button>
    </>
  )
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Probe />
          <ProtectedRoute>
            <p data-testid="protected-content">Contenido protegido</p>
          </ProtectedRoute>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    window.sessionStorage.clear()
    mocks.getSession.mockReset()
    mocks.onAuthStateChange.mockClear()
    mocks.signOut.mockReset()
    mocks.rpc.mockReset()
    mocks.unsubscribe.mockReset()
    mocks.from.mockReset()
    mocks.signOut.mockResolvedValue({ error: null })
  })

  it('limpia el estado local al cerrar sesión', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    window.sessionStorage.setItem('silsanplex.productos-temporales.v1', '[]')
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('access-state')).toHaveTextContent('habilitado')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar prueba' }))

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent('cerrada')
    })
    expect(window.sessionStorage.getItem('silsanplex.productos-temporales.v1')).toBeNull()
    expect(mocks.signOut).toHaveBeenCalledOnce()
  })

  it('limpia el estado local cuando Supabase informa una sesión expirada', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    window.sessionStorage.setItem('silsanplex.clientes-temporales.v1', '[]')
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent('activa')
    })

    mocks.emitSessionEvent('SIGNED_OUT', null)

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent('cerrada')
    })
    expect(window.sessionStorage.getItem('silsanplex.clientes-temporales.v1')).toBeNull()
  })

  it('limpia datos temporales cuando cambia el usuario autenticado', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent('activa')
    })

    window.sessionStorage.setItem('silsanplex.compras-temporales.v1', '{}')
    const otherSession = {
      ...session,
      user: { id: 'user-2', email: 'otro@silsan.local' },
    } as Session
    mocks.emitSessionEvent('SIGNED_IN', otherSession)

    await waitFor(() => {
      expect(window.sessionStorage.getItem('silsanplex.compras-temporales.v1')).toBeNull()
    })
  })

  it('recarga el acceso después de USER_UPDATED con el mismo usuario y token', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toHaveTextContent(
        'Contenido protegido',
      )
    })
    const membershipCallsBefore = mocks.from.mock.calls.filter(
      ([table]) => table === 'organization_memberships',
    ).length

    mocks.emitSessionEvent('USER_UPDATED', session)

    await waitFor(() => {
      const membershipCallsAfter = mocks.from.mock.calls.filter(
        ([table]) => table === 'organization_memberships',
      ).length
      expect(membershipCallsAfter).toBeGreaterThan(membershipCallsBefore)
      expect(screen.getByTestId('protected-content')).toHaveTextContent(
        'Contenido protegido',
      )
    })
  })

  it('redirige una sesión de recuperación al formulario de contraseña', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toHaveTextContent('lista')
    })

    mocks.emitSessionEvent('PASSWORD_RECOVERY', session)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/establecer-contrasena')
      expect(screen.getByTestId('session-state')).toHaveTextContent('activa')
    })
  })

  it('carga los permisos efectivos mediante el RPC del backend', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('permission-state')).toHaveTextContent(
        'permitido',
      )
    })
    expect(mocks.rpc).toHaveBeenCalledWith('current_user_permissions')
  })

  it('revalida el acceso cuando la ventana recupera el foco', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('access-state')).toHaveTextContent('habilitado')
    })
    const callsBefore = mocks.rpc.mock.calls.length

    window.dispatchEvent(new Event('focus'))

    expect(screen.getByTestId('loading-state')).toHaveTextContent('lista')
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()

    await waitFor(() => {
      expect(mocks.rpc.mock.calls.length).toBeGreaterThan(callsBefore)
      expect(mocks.rpc).toHaveBeenCalledWith(
        'current_auth_session_is_active',
      )
    })
  })

  it('limpia datos temporales si la membresía deja de estar activa', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('access-state')).toHaveTextContent('habilitado')
    })
    window.sessionStorage.setItem('silsanplex.ventas-temporales.v1', '{}')
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'organization_memberships') {
        throw new Error(`Consulta inesperada a ${table}`)
      }

      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }
    })

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(screen.getByTestId('access-state')).toHaveTextContent('sin acceso')
    })
    expect(
      window.sessionStorage.getItem('silsanplex.ventas-temporales.v1'),
    ).toBeNull()
  })

  it('termina la sesión cuando una API informa que el JWT expiró', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent('activa')
    })

    notifySessionInvalidated()

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent('cerrada')
      expect(screen.getByTestId('session-error')).toHaveTextContent(
        'Tu sesión expiró.',
      )
    })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('detecta una sesión revocada al recuperar el foco', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent('activa')
    })
    mocks.rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'current_auth_session_is_active') {
        return { data: false, error: null }
      }

      return { data: ['USERS_MANAGE'], error: null }
    })

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent('cerrada')
    })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('conserva la sesión ante un fallo transitorio de revalidación', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent('activa')
    })
    mocks.rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'current_auth_session_is_active') {
        return {
          data: null,
          error: { status: 503, message: 'Service unavailable' },
        }
      }

      return { data: ['USERS_MANAGE'], error: null }
    })

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled()
    })
    expect(screen.getByTestId('session-state')).toHaveTextContent('activa')
    expect(mocks.signOut).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('conserva el error de getSession si INITIAL_SESSION llega después con sesión nula', async () => {
    mocks.getSession.mockRejectedValue(new Error('Storage failure'))
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session-error')).toHaveTextContent(
        'No se pudo verificar la sesión.',
      )
    })

    mocks.emitSessionEvent('INITIAL_SESSION', null)

    expect(screen.getByTestId('session-error')).toHaveTextContent(
      'No se pudo verificar la sesión.',
    )
  })

  it('desuscribe los eventos de Supabase al desmontarse', async () => {
    configureActiveAccess()
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    const { unmount } = renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent('activa')
    })

    unmount()

    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })
})
