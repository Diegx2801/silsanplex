import { LogOut, Menu, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { elementosNavegacion, seccionesNavegacion } from '@/app/navegacion'
import { Button } from '@/components/ui/button'
import type { Permission } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

interface ContenidoNavegacionProps {
  alNavegar?: () => void
  cerrarMenu?: () => void
  organizationName: string
  hasPermission: (permission: Permission) => boolean
}

function ContenidoNavegacion({
  alNavegar,
  cerrarMenu,
  organizationName,
  hasPermission,
}: ContenidoNavegacionProps) {
  return (
    <>
      <div className="flex min-h-20 items-center justify-between border-b px-5">
        <NavLink to="/" onClick={alNavegar}>
          <span className="block text-lg font-semibold tracking-[-0.03em]">
            SILSANPLEX
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {organizationName}
          </span>
        </NavLink>
        {cerrarMenu ? (
          <button
            type="button"
            aria-label="Cerrar menú"
            className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={cerrarMenu}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        {seccionesNavegacion.map((seccion) => (
          <div key={seccion.titulo} className="mb-6 last:mb-0">
            <p className="px-3 pb-2 font-mono text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {seccion.titulo}
            </p>
            <ul className="space-y-1">
              {seccion.elementos
                .filter(
                  (elemento) =>
                    !elemento.permission || hasPermission(elemento.permission),
                )
                .map((elemento) => {
                  const Icono = elemento.icono

                  return (
                    <li key={elemento.ruta}>
                      <NavLink
                        to={elemento.ruta}
                        end={elemento.ruta === '/'}
                        onClick={alNavegar}
                        className={({ isActive }) =>
                          cn(
                            'group flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                            isActive &&
                              'bg-sidebar-accent text-sidebar-accent-foreground',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icono
                              aria-hidden="true"
                              className={cn(
                                'size-4.5 shrink-0',
                                isActive && 'text-sidebar-primary',
                              )}
                            />
                            <span>{elemento.titulo}</span>
                            {isActive ? (
                              <span
                                aria-hidden="true"
                                className="ms-auto size-1.5 rounded-full bg-sidebar-primary"
                              />
                            ) : null}
                          </>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  )
}

export function AppLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const { user, access, hasPermission, signOut } = useAuth()
  const { pathname } = useLocation()
  const paginaActual =
    elementosNavegacion.find(
      (elemento) =>
        elemento.ruta === pathname ||
        (elemento.ruta !== '/' && pathname.startsWith(`${elemento.ruta}/`)),
    )?.titulo ??
    'Página no encontrada'

  const cerrarSesion = async () => {
    setSignOutError(null)
    try {
      await signOut()
    } catch {
      setSignOutError('No se pudo cerrar la sesión. Inténtalo nuevamente.')
    }
  }

  return (
    <DialogPrimitive.Root open={menuAbierto} onOpenChange={setMenuAbierto}>
      <div className="min-h-svh bg-background text-foreground">
        <a
          href="#contenido-principal"
          className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          Saltar al contenido principal
        </a>

        <aside
          aria-label="Navegación principal"
          className="fixed inset-y-0 start-0 z-30 hidden w-72 flex-col border-e bg-sidebar lg:flex"
        >
          <ContenidoNavegacion
            organizationName={access?.organizationName ?? 'Organización'}
            hasPermission={hasPermission}
          />
        </aside>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-30 bg-foreground/20 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 start-0 z-40 flex w-72 flex-col border-e bg-sidebar shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden">
            <DialogPrimitive.Title className="sr-only">
              Navegación principal
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Acceso a los módulos de SILSANPLEX
            </DialogPrimitive.Description>
            <aside aria-label="Navegación principal móvil" className="contents">
              <ContenidoNavegacion
                organizationName={access?.organizationName ?? 'Organización'}
                hasPermission={hasPermission}
                alNavegar={() => setMenuAbierto(false)}
                cerrarMenu={() => setMenuAbierto(false)}
              />
            </aside>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>

        <div className="min-h-svh lg:ps-72">
          <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm">
            <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
              <DialogPrimitive.Trigger asChild>
                <button
                  type="button"
                  aria-label="Abrir menú"
                  className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
                >
                  <Menu aria-hidden="true" className="size-5" />
                </button>
              </DialogPrimitive.Trigger>

              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{paginaActual}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {access?.organizationName}
                </p>
              </div>

              <div className="ms-auto hidden min-w-0 text-right sm:block">
                <p className="truncate text-xs font-medium">{user?.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {access?.roles.join(' · ')}
                </p>
              </div>
              {signOutError ? (
                <p role="alert" className="max-w-52 text-xs text-destructive">
                  {signOutError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar sesión"
                onClick={() => void cerrarSesion()}
              >
                <LogOut aria-hidden="true" />
              </Button>
            </div>
          </header>

          <main
            id="contenido-principal"
            className="mx-auto w-full max-w-[96rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-10"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </DialogPrimitive.Root>
  )
}
