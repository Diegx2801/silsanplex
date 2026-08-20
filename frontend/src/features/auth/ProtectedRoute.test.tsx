import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    session: { user: { id: 'disabled-user' } },
    access: null,
    accessError: null,
    isLoading: false,
    sessionError: null,
    reintentarAcceso: vi.fn(),
    signOut: vi.fn(),
  }),
}))

import { ProtectedRoute } from '@/features/auth/ProtectedRoute'

describe('ProtectedRoute', () => {
  it('muestra acceso inactivo para un usuario deshabilitado', () => {
    render(
      <ProtectedRoute>
        <p>Contenido protegido</p>
      </ProtectedRoute>,
    )

    expect(screen.getByText('Tu cuenta no tiene acceso')).toBeInTheDocument()
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  })
})
