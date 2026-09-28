import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { AppLayout } from './AppLayout'

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'admin@silsan.local' },
    access: { organizationName: 'Droguería SILSAN S.A.C.', roles: ['ADMIN'] },
    hasPermission: () => true,
    signOut: vi.fn(),
  }),
}))

describe('AppLayout', () => {
  it('mantiene las vistas de Inventario visibles cuando se abre su página principal', () => {
    render(
      <MemoryRouter initialEntries={['/inventario']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="inventario" element={<p>Existencias</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Contraer opciones de Inventario' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Movimientos y Kardex' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Control de stock' })).toBeVisible()
  })

  it('mantiene Inventario desplegado y señala Almacenes y ubicaciones en su ruta', () => {
    render(
      <MemoryRouter initialEntries={['/inventario/almacenes']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="inventario/almacenes" element={<p>Contenido del mantenedor</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Contraer opciones de Inventario' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Almacenes y ubicaciones' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Existencias y lotes' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Movimientos y Kardex' })).toHaveAttribute('href', '/inventario/movimientos')
    expect(screen.getAllByText('Almacenes y ubicaciones')).toHaveLength(2)
    expect(screen.getByText('Contenido del mantenedor')).toBeVisible()
  })
})
