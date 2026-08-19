import { createBrowserRouter } from 'react-router'

import { elementosNavegacion } from '@/app/navegacion'
import { ModuloPendientePage } from '@/app/paginas/ModuloPendientePage'
import { NotFoundPage } from '@/app/paginas/NotFoundPage'
import { CargandoAplicacion } from '@/components/feedback/CargandoAplicacion'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { AdminRoute, ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { SetPasswordPage } from '@/features/auth/SetPasswordPage'
import { UsersPage } from '@/features/users/UsersPage'

const rutasModulos = elementosNavegacion
  .filter(
    (elemento) =>
      elemento.ruta !== '/' &&
      elemento.ruta !== '/productos' &&
      elemento.ruta !== '/inventario' &&
      elemento.ruta !== '/compras' &&
      elemento.ruta !== '/usuarios',
  )
  .map((elemento) => ({
    path: elemento.ruta,
    element: (
      <ModuloPendientePage
        titulo={elemento.titulo}
        descripcion={elemento.descripcion}
      />
    ),
  }))

export const router = createBrowserRouter([
  {
    path: '/iniciar-sesion',
    Component: LoginPage,
  },
  {
    path: '/establecer-contrasena',
    Component: SetPasswordPage,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    HydrateFallback: CargandoAplicacion,
    children: [
      {
        index: true,
        lazy: async () => {
          const { InicioPage } = await import('@/app/paginas/InicioPage')

          return { Component: InicioPage }
        },
      },
      {
        path: 'productos',
        lazy: async () => {
          const { ProductosPage } = await import('@/app/paginas/ProductosPage')

          return { Component: ProductosPage }
        },
      },
      {
        path: 'productos/importar',
        lazy: async () => {
          const { ImportarProductosPage } = await import(
            '@/app/paginas/ImportarProductosPage'
          )

          return { Component: ImportarProductosPage }
        },
      },
      {
        path: 'inventario',
        lazy: async () => {
          const { InventarioPage } = await import(
            '@/app/paginas/InventarioPage'
          )

          return { Component: InventarioPage }
        },
      },
      {
        path: 'compras',
        lazy: async () => {
          const { ComprasPage } = await import('@/app/paginas/ComprasPage')

          return { Component: ComprasPage }
        },
      },
      {
        path: 'usuarios',
        element: (
          <AdminRoute>
            <UsersPage />
          </AdminRoute>
        ),
      },
      ...rutasModulos,
      {
        path: '*',
        Component: NotFoundPage,
      },
    ],
  },
])
