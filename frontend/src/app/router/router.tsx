import { createBrowserRouter } from 'react-router'

import { elementosNavegacion } from '@/app/navegacion'
import { InicioPage } from '@/app/paginas/InicioPage'
import { ModuloPendientePage } from '@/app/paginas/ModuloPendientePage'
import { NotFoundPage } from '@/app/paginas/NotFoundPage'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { AdminRoute, ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { SetPasswordPage } from '@/features/auth/SetPasswordPage'
import { UsersPage } from '@/features/users/UsersPage'

const rutasModulos = elementosNavegacion
  .filter((elemento) => elemento.ruta !== '/' && elemento.ruta !== '/usuarios')
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
    children: [
      {
        index: true,
        Component: InicioPage,
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
