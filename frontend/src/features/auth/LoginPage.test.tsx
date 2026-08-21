import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
    },
  },
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    session: null,
    isLoading: false,
    sessionError: null,
  }),
}))

import { LoginPage } from '@/features/auth/LoginPage'

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/iniciar-sesion']}>
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    mocks.signInWithPassword.mockReset()
  })

  it('inicia sesión con credenciales válidas', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null })
    renderLoginPage()

    fireEvent.change(screen.getByLabelText('Correo'), {
      target: { value: 'admin@silsan.local' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'correcta-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: 'admin@silsan.local',
        password: 'correcta-123',
      })
    })
  })

  it('muestra un error cuando las credenciales son incorrectas', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: new Error('Invalid login credentials'),
    })
    renderLoginPage()

    fireEvent.change(screen.getByLabelText('Correo'), {
      target: { value: 'admin@silsan.local' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'incorrecta' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(
      await screen.findByText('El correo o la contraseña no son correctos.'),
    ).toBeInTheDocument()
  })

  it('confirma que la contraseña fue actualizada al volver del flujo de invitación', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/iniciar-sesion',
            state: { passwordUpdated: true },
          },
        ]}
      >
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      screen.getByText('Contraseña actualizada. Inicia sesión nuevamente.'),
    ).toBeInTheDocument()
  })
})
