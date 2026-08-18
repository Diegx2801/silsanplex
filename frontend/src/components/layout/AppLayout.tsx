import { Link, Outlet } from 'react-router'

export function AppLayout() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#contenido-principal"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        Saltar al contenido principal
      </a>

      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link to="/" className="font-semibold tracking-tight">
            SILSANPLEX
          </Link>
        </div>
      </header>

      <main
        id="contenido-principal"
        className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      >
        <Outlet />
      </main>
    </div>
  )
}
