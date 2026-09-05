import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { UserForm } from './UserForm'
import type { ManagedUser } from './userTypes'

it('permite invitar a un técnico desde el formulario existente sin seleccionar ADMIN', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<UserForm open user={null} currentUserId="admin" isSubmitting={false}
    onOpenChange={vi.fn()} onSubmit={onSubmit} />)
  fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Técnico prueba' } })
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'tecnico@silsan.test' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Técnico de reparaciones' }))
  expect(screen.getByRole('checkbox', { name: 'Administración' })).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ roleCodes: ['TECNICO_REPARACIONES'] })))
})

it('conserva el rol técnico al editar un usuario existente', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const user: ManagedUser = { id: 'tech', organizationId: 'org', email: 'tecnico@silsan.test',
    fullName: 'Técnico prueba', phone: '', isActive: true, authConfirmedAt: null,
    roleCodes: ['TECNICO_REPARACIONES'], createdAt: '', updatedAt: '' }
  render(<UserForm open user={user} currentUserId="admin" isSubmitting={false}
    onOpenChange={vi.fn()} onSubmit={onSubmit} />)
  expect(screen.getByRole('checkbox', { name: 'Técnico de reparaciones' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Administración' })).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ roleCodes: ['TECNICO_REPARACIONES'] })))
})
