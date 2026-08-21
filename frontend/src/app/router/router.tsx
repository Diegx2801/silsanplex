import { createBrowserRouter } from 'react-router'

import { elementosNavegacion } from '@/app/navegacion'
import { ModuloPendientePage } from '@/app/paginas/ModuloPendientePage'
import { NotFoundPage } from '@/app/paginas/NotFoundPage'
import { CargandoAplicacion } from '@/components/feedback/CargandoAplicacion'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { PERMISSIONS } from '@/features/auth/permissions'
import {
  PermissionRoute,
  ProtectedRoute,
} from '@/features/auth/ProtectedRoute'
import { SetPasswordPage } from '@/features/auth/SetPasswordPage'
import { UsersPage } from '@/features/users/UsersPage'

const rutasModulos = elementosNavegacion
  .filter(
    (elemento) =>
      elemento.ruta !== '/' &&
      elemento.ruta !== '/productos' &&
      elemento.ruta !== '/inventario' &&
      elemento.ruta !== '/proveedores' &&
      elemento.ruta !== '/compras' &&
      elemento.ruta !== '/clientes' &&
      elemento.ruta !== '/ventas' &&
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

          return {
            Component: () => (
              <PermissionRoute permission={PERMISSIONS.PRODUCTS_VIEW}>
                <ProductosPage />
              </PermissionRoute>
            ),
          }
        },
      },
      {
        path: 'productos/importar',
        lazy: async () => {
          const { ImportarProductosPage } = await import(
            '@/app/paginas/ImportarProductosPage'
          )

          return {
            Component: () => (
              <PermissionRoute permission={PERMISSIONS.PRODUCTS_VIEW}>
                <ImportarProductosPage />
              </PermissionRoute>
            ),
          }
        },
      },
      {
        path: 'inventario',
        lazy: async () => {
          const { InventarioPage } = await import(
            '@/app/paginas/InventarioPage'
          )

          return {
            Component: () => (
              <PermissionRoute permission={PERMISSIONS.INVENTORY_VIEW}>
                <InventarioPage />
              </PermissionRoute>
            ),
          }
        },
      },
      {
        path: 'proveedores',
        lazy: async () => {
          const { ProveedoresPage } = await import(
            '@/app/paginas/ProveedoresPage'
          )

          return {
            Component: () => (
              <PermissionRoute permission={PERMISSIONS.SUPPLIERS_VIEW}>
                <ProveedoresPage />
              </PermissionRoute>
            ),
          }
        },
      },
      {
        path: 'compras',
        lazy: async () => {
          const { ComprasPage } = await import('@/app/paginas/ComprasPage')

          return {
            Component: () => (
              <PermissionRoute permission={PERMISSIONS.PURCHASES_VIEW}>
                <ComprasPage />
              </PermissionRoute>
            ),
          }
        },
      },
      {
        path: 'clientes',
        lazy: async () => {
          const { ClientesPage } = await import('@/app/paginas/ClientesPage')
          const ClientesProtegidos = () => (
            <PermissionRoute permission={PERMISSIONS.CUSTOMERS_VIEW}>
              <ClientesPage />
            </PermissionRoute>
          )
          return { Component: ClientesProtegidos }
        },
      },
      {
        path: 'ventas',
        lazy: async () => {
          const { VentasPage } = await import('@/app/paginas/VentasPage')

          return { Component: VentasPage }
        },
      },
      {
        path: 'usuarios',
        element: (
          <PermissionRoute permission={PERMISSIONS.USERS_MANAGE}>
            <UsersPage />
          </PermissionRoute>
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
