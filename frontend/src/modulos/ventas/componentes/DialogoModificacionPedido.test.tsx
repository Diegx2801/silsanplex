import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PedidoVenta } from '@/modulos/ventas/modelo/operacionVenta'

import { DialogoModificacionPedido } from './DialogoModificacionPedido'

const pedido = {
  id: 'pedido-1',
  numero: 'PED-000001',
  cotizacionId: 'cotizacion-1',
  cotizacionNumero: 'COT-000001',
  clienteId: 'cliente-1',
  clienteDocumento: '20548796321',
  clienteNombre: 'Cliente Uno',
  preciosIncluyenIgv: true,
  observacion: '',
  lineas: [{
    id: 'linea-1',
    productoId: 'producto-1',
    productoCodigo: 'P-1',
    productoDescripcion: 'Producto',
    unidadMedida: 'UND',
    cantidad: 10,
    precioUnitario: 10,
    lote: '',
    fechaVencimiento: '',
  }],
  estado: 'confirmado',
  fechaRegistro: '2026-09-01T12:00:00.000Z',
  fechaAtencion: null,
} satisfies PedidoVenta

function renderDialog(alGuardar: React.ComponentProps<typeof DialogoModificacionPedido>['alGuardar']) {
  const alCambiarApertura = vi.fn()
  render(
    <DialogoModificacionPedido
      abierto
      pedido={pedido}
      alCambiarApertura={alCambiarApertura}
      alGuardar={alGuardar}
    />,
  )
  return alCambiarApertura
}

describe('DialogoModificacionPedido', () => {
  it('envía todas las líneas y una clave idempotente', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined)
    renderDialog(alGuardar)
    fireEvent.change(screen.getByLabelText('Nueva cantidad'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cantidades' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      [{ orderItemId: 'linea-1', quantity: 6 }],
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    ))
  })

  it('muestra el error RPC y conserva el diálogo abierto', async () => {
    const alGuardar = vi.fn().mockResolvedValue('No hay stock asignable suficiente')
    const alCambiarApertura = renderDialog(alGuardar)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cantidades' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay stock asignable suficiente')
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })

  it('impide doble envío durante una modificación pendiente', async () => {
    let resolver: (resultado?: string) => void = () => undefined
    const alGuardar = vi.fn(() => new Promise<string | undefined>((resolve) => { resolver = resolve }))
    renderDialog(alGuardar)
    const boton = screen.getByRole('button', { name: 'Guardar cantidades' })
    fireEvent.click(boton)
    await waitFor(() => expect(boton).toBeDisabled())
    fireEvent.click(boton)
    expect(alGuardar).toHaveBeenCalledOnce()
    resolver()
  })
})
