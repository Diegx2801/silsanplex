import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PedidoVenta } from '@/modulos/ventas/modelo/operacionVenta'

import { DialogoRegistroVenta } from './DialogoRegistroVenta'

const pedido = {
  id: 'pedido-1', numero: 'PED-000001', cotizacionId: 'cotizacion-1',
  cotizacionNumero: 'COT-000001', clienteId: 'cliente-1',
  clienteDocumento: '20548796321', clienteNombre: 'Cliente Uno',
  preciosIncluyenIgv: true, observacion: '', lineas: [{
    id: 'linea-1', productoId: 'producto-1', productoCodigo: 'P-1',
    productoDescripcion: 'Producto', unidadMedida: 'UND', cantidad: 1,
    precioUnitario: 10, lote: '', fechaVencimiento: '',
  }], estado: 'confirmado', fechaRegistro: '2026-09-01T12:00:00.000Z',
  fechaAtencion: null,
} satisfies PedidoVenta

function completarFormulario() {
  fireEvent.change(screen.getByLabelText('Serie *'), { target: { value: 'f001' } })
  fireEvent.change(screen.getByLabelText('Número *'), { target: { value: '1' } })
}

function renderDialog(alGuardar: React.ComponentProps<typeof DialogoRegistroVenta>['alGuardar']) {
  const alCambiarApertura = vi.fn()
  render(
    <DialogoRegistroVenta
      abierto
      pedido={pedido}
      alCambiarApertura={alCambiarApertura}
      alGuardar={alGuardar}
    />,
  )
  return alCambiarApertura
}

describe('DialogoRegistroVenta', () => {
  it('muestra el error de la RPC y conserva abierto el formulario', async () => {
    const alCambiarApertura = renderDialog(vi.fn().mockResolvedValue('No hay disponibilidad'))
    completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay disponibilidad')
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })

  it('impide un doble envío mientras la conversión permanece pendiente', async () => {
    let resolver: (resultado?: string) => void = () => undefined
    const alGuardar = vi.fn(() => new Promise<string | undefined>((resolve) => { resolver = resolve }))
    const alCambiarApertura = renderDialog(alGuardar)
    completarFormulario()
    const boton = screen.getByRole('button', { name: 'Registrar venta' })
    fireEvent.click(boton)
    await waitFor(() => expect(boton).toBeDisabled())
    fireEvent.click(boton)
    expect(alGuardar).toHaveBeenCalledOnce()

    resolver()
    await waitFor(() => expect(alCambiarApertura).toHaveBeenCalledWith(false))
  })
})
