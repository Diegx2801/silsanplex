import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DialogoProveedor } from '@/modulos/proveedores/componentes/DialogoProveedor'

describe('DialogoProveedor', () => {
  it('explica la validación de un campo opcional completado incorrectamente', async () => {
    const guardar = vi.fn().mockResolvedValue(undefined)

    render(
      <DialogoProveedor
        abierto
        proveedor={null}
        alCambiarApertura={vi.fn()}
        alGuardar={guardar}
        alConsultarRuc={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Número de documento *'), {
      target: { value: '20131380951' },
    })
    fireEvent.change(screen.getByLabelText('Razón social o nombre *'), {
      target: { value: 'Proveedor de prueba' },
    })
    const telefono = screen.getByLabelText('Teléfono')
    fireEvent.change(telefono, {
      target: { value: 'ss' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(
      await screen.findByText('El teléfono debe tener al menos 6 caracteres'),
    ).toBeVisible()
    expect(telefono).toHaveAttribute('aria-invalid', 'true')
    expect(guardar).not.toHaveBeenCalled()
  })

  it('permite dejar vacíos los campos opcionales', async () => {
    const guardar = vi.fn().mockResolvedValue(undefined)

    render(
      <DialogoProveedor
        abierto
        proveedor={null}
        alCambiarApertura={vi.fn()}
        alGuardar={guardar}
        alConsultarRuc={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Número de documento *'), {
      target: { value: '20131380951' },
    })
    fireEvent.change(screen.getByLabelText('Razón social o nombre *'), {
      target: { value: 'Proveedor de prueba' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    await waitFor(() => expect(guardar).toHaveBeenCalledOnce())
  })
})
