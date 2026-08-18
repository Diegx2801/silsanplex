import type { PropsWithChildren } from 'react'
import { Navigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'

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

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <section className="max-w-md border bg-card p-8 text-center">
        <p className="font-mono text-xs text-destructive">ACCESO INACTIVO</p>
        <h1 className="mt-3 text-2xl font-semibold">Tu cuenta no tiene acceso</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Solicita a un administrador que revise tu estado y organización.
        </p>
        <Button className="mt-6" onClick={() => void signOut()}>
          Volver al inicio de sesión
        </Button>
      </section>
    </main>
  )
}

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { session, access, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!session) return <Navigate to="/iniciar-sesion" replace />
  if (!access) return <AccessDeniedScreen />

  return children
}

export function AdminRoute({ children }: PropsWithChildren) {
  const { isAdmin } = useAuth()

  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
