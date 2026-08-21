import { useState, type PropsWithChildren } from 'react'
import { Navigate } from 'react-router'

import { Button } from '@/components/ui/button'
import type { Permission } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'

function LoadingScreen() {
  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <p role="status" className="text-sm text-muted-foreground">
        Verificando acceso…
      </p>
    </main>
  )
}

function AccessDeniedScreen() {
  const { signOut } = useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const handleSignOut = async () => {
    setSignOutError(null)
    try {
      await signOut()
    } catch {
      setSignOutError('No se pudo cerrar la sesión. Inténtalo nuevamente.')
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <section className="max-w-md border bg-card p-8 text-center">
        <p className="font-mono text-xs text-destructive">ACCESO INACTIVO</p>
        <h1 className="mt-3 text-2xl font-semibold">Tu cuenta no tiene acceso</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Solicita a un administrador que revise tu estado y organización.
        </p>
        {signOutError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {signOutError}
          </p>
        ) : null}
        <Button className="mt-6" onClick={() => void handleSignOut()}>
          Volver al inicio de sesión
        </Button>
      </section>
    </main>
  )
}

function AccessErrorScreen() {
  const { accessError, reintentarAcceso, signOut } = useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const handleSignOut = async () => {
    setSignOutError(null)
    try {
      await signOut()
    } catch {
      setSignOutError('No se pudo cerrar la sesión. Inténtalo nuevamente.')
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <section className="max-w-md border bg-card p-8 text-center">
        <p className="font-mono text-xs text-destructive">ERROR DE ACCESO</p>
        <h1 className="mt-3 text-2xl font-semibold">No se pudo verificar tu acceso</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-muted-foreground">
          {accessError}
        </p>
        {signOutError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {signOutError}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" variant="outline" onClick={reintentarAcceso}>
            Reintentar
          </Button>
          <Button type="button" onClick={() => void handleSignOut()}>
            Volver al inicio de sesión
          </Button>
        </div>
      </section>
    </main>
  )
}

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { session, access, accessError, isLoading, sessionError } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!session) return <Navigate to="/iniciar-sesion" replace />
  if (sessionError) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6">
        <section className="max-w-md border bg-card p-8 text-center">
          <p className="font-mono text-xs text-destructive">ERROR DE SESIÓN</p>
          <h1 className="mt-3 text-2xl font-semibold">No se pudo iniciar la sesión</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-muted-foreground">
            {sessionError}
          </p>
          <Button
            type="button"
            className="mt-6"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </Button>
        </section>
      </main>
    )
  }
  if (accessError) return <AccessErrorScreen />
  if (!access) return <AccessDeniedScreen />

  return children
}

interface PermissionRouteProps extends PropsWithChildren {
  permission: Permission
}

export function PermissionRoute({
  children,
  permission,
}: PermissionRouteProps) {
  const { hasPermission } = useAuth()

  if (!hasPermission(permission)) return <Navigate to="/" replace />
  return children
}
