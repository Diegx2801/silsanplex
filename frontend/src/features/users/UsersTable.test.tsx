import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UsersTable } from '@/features/users/UsersTable'
import type { ManagedUser } from '@/features/users/userTypes'

const usuarioInactivo: ManagedUser = {
  id: 'inactive-user',
  organizationId: 'organization-1',
  email: 'inactivo@silsan.local',
  fullName: 'Usuario Inactivo',
  phone: null,
  isActive: false,
  authConfirmedAt: '2026-08-20T12:00:00.000Z',
  roleCodes: ['VENTAS'],
  createdAt: '2026-08-20T12:00:00.000Z',
  updatedAt: '2026-08-20T12:00:00.000Z',
}

describe('UsersTable', () => {
  it('muestra un usuario inactivo y bloquea recuperación de contraseña', () => {
    render(
      <UsersTable
        users={[usuarioInactivo]}
        busyUserId={null}
        currentUserId="admin-user"
        onEdit={vi.fn()}
        onToggleStatus={vi.fn()}
        onResetPassword={vi.fn()}
        onResendInvitation={vi.fn()}
      />,
    )

    expect(screen.getAllByText('Inactivo')).toHaveLength(2)
    for (const button of screen.getAllByRole('button', {
      name: 'Restablecer contraseña de Usuario Inactivo',
    })) {
      expect(button).toBeDisabled()
    }
    for (const button of screen.getAllByRole('button', {
      name: 'Reactivar a Usuario Inactivo',
    })) {
      expect(button).toBeEnabled()
    }
  })
})
