import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PedidoVenta } from '@/modulos/ventas/modelo/operacionVenta'

import { DialogoRegistroVenta } from './DialogoRegistroVenta'

const pedido = {
  id: 'pedido-1', numero: 'PED-000001', cotizacionId: 'cotizacion-1',
  cotizacionNumero: 'COT-000001', clienteId: 'cliente-1',
  clienteDocumento: '20548796321', clienteNombre: 'Cliente Uno',
  preciosIncluyenIgv: true, baseGravada: 8.47, montoExonerado: 0,
  montoInafecto: 0, subtotal: 8.47, igv: 1.53, total: 10,
  estadoCalculoTributario: 'calculated', observacion: '', lineas: [{
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
  it('marca la fecha cuando se intenta registrar sin una fecha válida', async () => {
    const alGuardar = vi.fn()
    renderDialog(alGuardar)
    fireEvent.change(screen.getByLabelText('Fecha *'), { target: { value: '' } })
    completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }))

    expect(await screen.findByText('Selecciona la fecha de venta')).toBeVisible()
    expect(alGuardar).not.toHaveBeenCalled()
  })

  it('muestra el error de la RPC y conserva abierto el formulario', async () => {
    const alCambiarApertura = renderDialog(vi.fn().mockResolvedValue('No hay disponibilidad'))
    fireEvent.change(screen.getByLabelText('Fecha *'), { target: { value: '2026-11-03' } })
    completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay disponibilidad')
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
    expect(screen.getByLabelText('Comprobante *')).toHaveValue('factura')
    expect(screen.getByLabelText('Fecha *')).toHaveValue('2026-11-03')
    expect(screen.getByLabelText('Serie *')).toHaveValue('f001')
    expect(screen.getByLabelText('Número *')).toHaveValue('1')
    expect(screen.getByLabelText('Almacén de despacho *')).toHaveValue('Almacén principal')
  })

  it('mantiene visible el pie de acciones al desplazar el formulario en pantallas bajas', () => {
    renderDialog(vi.fn())

    const dialogo = screen.getByRole('dialog')
    const formulario = dialogo.querySelector('form')
    const contenidoDesplazable = formulario?.querySelector('.overflow-y-auto')
    const pie = formulario?.querySelector('footer')

    expect(dialogo).toHaveClass('max-h-[92svh]', 'overflow-hidden')
    expect(formulario).toHaveClass('flex', 'min-h-0', 'overflow-hidden')
    expect(contenidoDesplazable).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto')
    expect(pie).toHaveClass('shrink-0')
    expect(screen.getByRole('button', { name: 'Registrar venta' })).toHaveClass('min-h-11')
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
