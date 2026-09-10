import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UserForm } from './UserForm'
import type { ManagedUser } from './userTypes'

const operationalUser: ManagedUser = {
  id: 'seller', organizationId: 'org', email: 'ventas@silsan.test', fullName: 'Usuario de ventas',
  phone: '', isActive: true, authConfirmedAt: null, isAdmin: false,
  permissionCodes: ['SALES_VIEW'], accessVersion: 3, createdAt: '', updatedAt: '',
}

describe('UserForm', () => {
  it('envía permisos operativos y agrega sus dependencias automáticamente', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserForm open user={null} currentUserId="admin" isSubmitting={false} onOpenChange={vi.fn()} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('Nombre completo *'), { target: { value: 'Usuario de compras' } })
    fireEvent.change(screen.getByLabelText('Correo *'), { target: { value: 'compras@silsan.test' } })
    fireEvent.click(screen.getByLabelText('Compras: Administrar'))

    expect(screen.getByLabelText('Compras: Consultar')).toBeChecked()
    expect(screen.getByLabelText('Compras: Consultar')).toBeDisabled()
    expect(screen.getByLabelText('Productos: Consultar')).toBeChecked()
    expect(screen.getByLabelText('Productos: Consultar')).toBeDisabled()
    expect(screen.getByLabelText('Proveedores: Consultar')).toBeChecked()
    expect(screen.getByLabelText('Inventario: Consultar')).toBeChecked()
    expect(screen.getAllByText('Requerido').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Usado por:').length).toBeGreaterThan(0)
    expect(screen.getByText('4 módulos')).toBeInTheDocument()
    expect(screen.getByText('· 4 accesos requeridos')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Compras, Productos, Inventario, Proveedores')

    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      isAdmin: false,
      permissionCodes: expect.arrayContaining(['PURCHASES_MANAGE', 'PURCHASES_VIEW', 'PRODUCTS_VIEW', 'SUPPLIERS_VIEW', 'INVENTORY_VIEW']),
    })))
  })

  it('separa procesos de mantenedores y elimina dependencias al retirar su origen', () => {
    render(<UserForm open user={null} currentUserId="admin" isSubmitting={false} onOpenChange={vi.fn()} onSubmit={vi.fn()} />)

    const processHeading = screen.getByRole('heading', { name: 'Procesos operativos' })
    const masterHeading = screen.getByRole('heading', { name: 'Mantenedores y recursos' })
    expect(processHeading.compareDocumentPosition(masterHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const salesView = screen.getByLabelText('Ventas: Consultar')
    fireEvent.click(salesView)
    expect(screen.getByLabelText('Productos: Consultar')).toBeDisabled()
    expect(screen.getByLabelText('Clientes: Consultar')).toBeDisabled()
    expect(screen.getByLabelText('Inventario: Consultar')).toBeDisabled()
    expect(screen.getByLabelText('Ventas: Administrar')).not.toBeChecked()
    expect(screen.getByLabelText('Distribución: Consultar')).not.toBeChecked()

    fireEvent.click(salesView)
    expect(screen.getByLabelText('Productos: Consultar')).not.toBeChecked()
    expect(screen.getByLabelText('Clientes: Consultar')).not.toBeChecked()
    expect(screen.getByLabelText('Inventario: Consultar')).not.toBeChecked()
  })

  it('envía un administrador total sin permisos individuales', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserForm open user={null} currentUserId="admin" isSubmitting={false} onOpenChange={vi.fn()} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Nombre completo *'), { target: { value: 'Nueva administradora' } })
    fireEvent.change(screen.getByLabelText('Correo *'), { target: { value: 'admin2@silsan.test' } })
    fireEvent.click(screen.getByRole('radio', { name: /Administrador total/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true, permissionCodes: [] })))
  })

  it('impide que el administrador actual retire su propio acceso total', () => {
    const ownAdmin: ManagedUser = { ...operationalUser, id: 'admin', isAdmin: true, permissionCodes: [] }
    render(<UserForm open user={ownAdmin} currentUserId="admin" isSubmitting={false} onOpenChange={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByRole('radio', { name: /Acceso operativo personalizado/ })).toBeDisabled()
    expect(screen.getByText('No puedes quitarte tu propio acceso de administrador.')).toBeInTheDocument()
  })

  it('muestra dentro del modal el error devuelto al guardar', () => {
    render(<UserForm open user={operationalUser} currentUserId="admin" isSubmitting={false} submitError="El usuario fue modificado por otra sesión." onOpenChange={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('El usuario fue modificado por otra sesión.')
  })
})
