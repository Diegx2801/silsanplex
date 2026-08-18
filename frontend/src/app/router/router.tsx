import { createBrowserRouter } from 'react-router'

import { InicioPage } from '@/app/pages/InicioPage'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { AppLayout } from '@/components/layout/AppLayout'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    children: [
      {
        index: true,
        Component: InicioPage,
      },
      {
        path: '*',
        Component: NotFoundPage,
      },
    ],
  },
])
