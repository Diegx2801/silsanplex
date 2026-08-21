import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ManagedUser } from '@/features/users/userTypes'

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setUserStatus: vi.fn(),
  sendPasswordReset: vi.fn(),
  resendInvitation: vi.fn(),
}))

vi.mock('@/features/users/userService', () => mocks)
vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'admin-user' } }),
}))

import { UsersPage } from '@/features/users/UsersPage'

const usuario: ManagedUser = {
  id: 'managed-user',
  organizationId: 'organization-1',
  email: 'ventas@silsan.local',
  fullName: 'Usuario de Ventas',
  phone: null,
  isActive: true,
  authConfirmedAt: '2026-08-20T12:00:00.000Z',
  roleCodes: ['VENTAS'],
  createdAt: '2026-08-20T12:00:00.000Z',
  updatedAt: '2026-08-20T12:00:00.000Z',
}

const usuarioInactivo: ManagedUser = {
  ...usuario,
  id: 'inactive-user',
  email: 'inactivo@silsan.local',
  fullName: 'Usuario Inactivo',
  isActive: false,
}

function renderUsersPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>,
  )
}

describe('UsersPage', () => {
  it('muestra carga y luego el listado de usuarios', async () => {
    let resolveUsers!: (users: ManagedUser[]) => void
    mocks.listUsers.mockReturnValue(
      new Promise<ManagedUser[]>((resolve) => {
        resolveUsers = resolve
      }),
    )

    renderUsersPage()

    expect(screen.getByText('Cargando usuarios…')).toBeInTheDocument()

    resolveUsers([usuario])

    await waitFor(() => {
      expect(screen.getAllByText('Usuario de Ventas')).toHaveLength(2)
    })
  })

  it('muestra activos por defecto y permite consultar inactivos', async () => {
    mocks.listUsers.mockResolvedValue([usuario, usuarioInactivo])
    renderUsersPage()

    expect(await screen.findAllByText('Usuario de Ventas')).toHaveLength(2)
    expect(screen.queryAllByText('Usuario Inactivo')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), {
      target: { value: 'inactive' },
    })

    expect(await screen.findAllByText('Usuario Inactivo')).toHaveLength(2)
    expect(screen.queryAllByText('Usuario de Ventas')).toHaveLength(0)
  })
})
