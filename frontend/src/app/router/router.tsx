import { createBrowserRouter } from 'react-router'

import { elementosNavegacion } from '@/app/navegacion'
import { InicioPage } from '@/app/paginas/InicioPage'
import { ModuloPendientePage } from '@/app/paginas/ModuloPendientePage'
import { NotFoundPage } from '@/app/paginas/NotFoundPage'
import { AppLayout } from '@/components/layout/AppLayout'

const rutasModulos = elementosNavegacion
  .filter((elemento) => elemento.ruta !== '/')
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
    children: [
      {
        index: true,
        Component: InicioPage,
      },
      ...rutasModulos,
      {
        path: '*',
        Component: NotFoundPage,
      },
    ],
  },
])
