import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'disabled-user' } },
    access: null,
    accessError: null,
    isLoading: false,
    sessionError: null,
    reintentarAcceso: vi.fn(),
    signOut: mocks.signOut,
    hasPermission: mocks.hasPermission,
  }),
}))

import { PERMISSIONS } from '@/features/auth/permissions'
import {
  PermissionRoute,
  ProtectedRoute,
} from '@/features/auth/ProtectedRoute'

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mocks.hasPermission.mockReset()
  })

  it('muestra acceso inactivo para un usuario deshabilitado', () => {
    render(
      <ProtectedRoute>
        <p>Contenido protegido</p>
      </ProtectedRoute>,
    )

    expect(screen.getByText('Tu cuenta no tiene acceso')).toBeInTheDocument()
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  })

  it('impide abrir una ruta sin el permiso requerido', () => {
    mocks.hasPermission.mockReturnValue(false)

    render(
      <MemoryRouter initialEntries={['/usuarios']}>
        <Routes>
          <Route path="/" element={<p>Inicio</p>} />
          <Route
            path="/usuarios"
            element={
              <PermissionRoute permission={PERMISSIONS.USERS_MANAGE}>
                <p>Gestión de usuarios</p>
              </PermissionRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Inicio')).toBeInTheDocument()
    expect(screen.queryByText('Gestión de usuarios')).not.toBeInTheDocument()
  })

  it('permite abrir una ruta con el permiso requerido', () => {
    mocks.hasPermission.mockReturnValue(true)

    render(
      <MemoryRouter>
        <PermissionRoute permission={PERMISSIONS.USERS_MANAGE}>
          <p>Gestión de usuarios</p>
        </PermissionRoute>
      </MemoryRouter>,
    )

    expect(screen.getByText('Gestión de usuarios')).toBeInTheDocument()
  })
})
