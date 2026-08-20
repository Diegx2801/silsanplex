import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  },
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'invited-user' } },
    isLoading: false,
    sessionError: null,
  }),
}))

import { SetPasswordPage } from '@/features/auth/SetPasswordPage'

function LoginDestination() {
  const location = useLocation()
  const passwordUpdated =
    typeof location.state === 'object' &&
    location.state !== null &&
    'passwordUpdated' in location.state &&
    location.state.passwordUpdated === true

  return <p>{passwordUpdated ? 'Ingreso confirmado' : 'Ingreso sin estado'}</p>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/establecer-contrasena']}>
      <Routes>
        <Route
          path="/establecer-contrasena"
          element={<SetPasswordPage />}
        />
        <Route path="/iniciar-sesion" element={<LoginDestination />} />
      </Routes>
    </MemoryRouter>,
  )
}

function completeForm() {
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
    target: { value: 'segura-1234' },
  })
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), {
    target: { value: 'segura-1234' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
}

describe('SetPasswordPage', () => {
  beforeEach(() => {
    mocks.updateUser.mockReset()
    mocks.signOut.mockReset()
  })

  it('actualiza la contraseña, cierra todas las sesiones y vuelve al login', async () => {
    mocks.updateUser.mockResolvedValue({ error: null })
    mocks.signOut.mockResolvedValue({ error: null })
    renderPage()

    completeForm()

    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith({
        password: 'segura-1234',
      })
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' })
    })
    expect(await screen.findByText('Ingreso confirmado')).toBeInTheDocument()
  })

  it('no confirma el flujo si no puede cerrar todas las sesiones', async () => {
    mocks.updateUser.mockResolvedValue({ error: null })
    mocks.signOut.mockResolvedValue({ error: new Error('Network error') })
    renderPage()

    completeForm()

    expect(
      await screen.findByText(
        'La contraseña se actualizó, pero no se pudieron cerrar todas las sesiones. Inténtalo nuevamente.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Ingreso confirmado')).not.toBeInTheDocument()
  })
})
