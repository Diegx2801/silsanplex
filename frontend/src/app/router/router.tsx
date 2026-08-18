import { createBrowserRouter } from 'react-router'

import { elementosNavegacion } from '@/app/navegacion'
import { InicioPage } from '@/app/paginas/InicioPage'
import { ModuloPendientePage } from '@/app/paginas/ModuloPendientePage'
import { NotFoundPage } from '@/app/paginas/NotFoundPage'
import { CargandoAplicacion } from '@/components/feedback/CargandoAplicacion'
import { AppLayout } from '@/components/layout/AppLayout'

const rutasModulos = elementosNavegacion
  .filter(
    (elemento) => elemento.ruta !== '/' && elemento.ruta !== '/productos',
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
    path: '/',
    Component: AppLayout,
    HydrateFallback: CargandoAplicacion,
    children: [
      {
        index: true,
        Component: InicioPage,
      },
      {
        path: 'productos',
        lazy: async () => {
          const { ProductosPage } = await import('@/app/paginas/ProductosPage')

          return { Component: ProductosPage }
        },
      },
      ...rutasModulos,
      {
        path: '*',
        Component: NotFoundPage,
      },
    ],
  },
])
