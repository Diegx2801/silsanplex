import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Almacen } from '@/modulos/inventario/modelo/almacen'
import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'

import { DialogoSeleccionAlmacenPedido } from './DialogoSeleccionAlmacenPedido'

const cotizacion = {
  id: 'cotizacion-1', numero: 'COT-000001', clienteId: 'cliente-1', clienteDocumento: '20548796321', clienteNombre: 'Cliente Uno',
  fechaEmision: '2026-09-01', fechaValidez: '2026-09-30', preciosIncluyenIgv: true, observacion: '',
  lineas: [{ id: 'linea-1', productoId: 'producto-1', productoCodigo: 'P-1', productoDescripcion: 'Producto', unidadMedida: 'UND', cantidad: 1, precioUnitario: 10 }],
  estado: 'emitida', fechaRegistro: '2026-09-01T12:00:00.000Z', fechaCambioEstado: null,
} satisfies Cotizacion

const almacenes: Almacen[] = [
  { id: 'warehouse-1', codigo: 'CENTRAL', nombre: 'Almacén central', direccion: 'Av. Principal 100', activo: true },
  { id: 'warehouse-2', codigo: 'NORTE', nombre: 'Almacén norte', direccion: 'Jr. Los Pinos 200', activo: true },
]

function renderDialog(alConfirmar: React.ComponentProps<typeof DialogoSeleccionAlmacenPedido>['alConfirmar']) {
  const alCambiarApertura = vi.fn()
  render(
    <DialogoSeleccionAlmacenPedido
      abierto
      cotizacion={cotizacion}
      almacenes={almacenes}
      alCambiarApertura={alCambiarApertura}
      alConfirmar={alConfirmar}
      alRestaurarFoco={vi.fn()}
    />,
  )
  return alCambiarApertura
}

describe('DialogoSeleccionAlmacenPedido', () => {
  it('envía el UUID del almacén seleccionado', async () => {
    const alConfirmar = vi.fn().mockResolvedValue(undefined)
    renderDialog(alConfirmar)
    const almacen = screen.getByRole('combobox', { name: 'Almacén de preparación' })
    expect(almacen).toHaveValue('')
    fireEvent.focus(almacen)
    fireEvent.change(almacen, { target: { value: 'norte' } })
    fireEvent.click(screen.getByRole('option', { name: /NORTE · Almacén norte/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))

    await waitFor(() => expect(alConfirmar).toHaveBeenCalledWith('warehouse-2', 'delivery'))
  })

  it('permite indicar recojo sin enviarlo como una entrega', async () => {
    const alConfirmar = vi.fn().mockResolvedValue(undefined)
    renderDialog(alConfirmar)
    fireEvent.change(screen.getByLabelText('Modalidad de cumplimiento'), { target: { value: 'pickup' } })
    const almacen = screen.getByRole('combobox', { name: 'Almacén de preparación' })
    fireEvent.focus(almacen)
    fireEvent.click(screen.getByRole('option', { name: /CENTRAL · Almacén central/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))

    await waitFor(() => expect(alConfirmar).toHaveBeenCalledWith('warehouse-1', 'pickup'))
  })

  it('filtra los almacenes por dirección', () => {
    renderDialog(vi.fn())
    const almacen = screen.getByRole('combobox', { name: 'Almacén de preparación' })
    fireEvent.focus(almacen)
    fireEvent.change(almacen, { target: { value: 'pinos' } })

    expect(screen.getByRole('option', { name: /NORTE · Almacén norte/ })).toBeVisible()
    expect(screen.queryByRole('option', { name: /CENTRAL · Almacén central/ })).not.toBeInTheDocument()
  })

  it('muestra el error del RPC y conserva abierto el diálogo', async () => {
    const alConfirmar = vi.fn().mockResolvedValue('El almacén seleccionado ya no está disponible')
    const alCambiarApertura = renderDialog(alConfirmar)
    const almacen = screen.getByRole('combobox', { name: 'Almacén de preparación' })
    fireEvent.focus(almacen)
    fireEvent.click(screen.getByRole('option', { name: /CENTRAL · Almacén central/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El almacén seleccionado ya no está disponible')
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })

  it('impide doble envío mientras la creación permanece pendiente', async () => {
    let resolver: (resultado?: string) => void = () => undefined
    const alConfirmar = vi.fn(() => new Promise<string | undefined>((resolve) => { resolver = resolve }))
    renderDialog(alConfirmar)
    const almacen = screen.getByRole('combobox', { name: 'Almacén de preparación' })
    fireEvent.focus(almacen)
    fireEvent.click(screen.getByRole('option', { name: /CENTRAL · Almacén central/ }))
    const boton = screen.getByRole('button', { name: 'Confirmar pedido' })
    fireEvent.click(boton)
    await waitFor(() => expect(boton).toBeDisabled())
    fireEvent.click(boton)
    expect(alConfirmar).toHaveBeenCalledOnce()

    resolver()
  })
})
