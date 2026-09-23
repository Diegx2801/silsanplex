import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Almacen } from '@/modulos/inventario/modelo/almacen'
import type { DireccionEntregaCliente } from '@/modulos/clientes/modelo/cliente'
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
const direccionesEntrega: DireccionEntregaCliente[] = [
  { id: '92af79d1-8223-4d07-8bc4-36060695a434', etiqueta: 'Sucursal principal', direccion: 'Av. Principal 123', ubigeo: '150101', referencia: 'Frente al parque', principal: true },
  { id: '0d328a2a-09ec-47d1-9d47-13a05a02be66', etiqueta: 'Sucursal norte', direccion: 'Jr. Los Pinos 200', ubigeo: '150102', referencia: '', principal: false },
]

function renderDialog(alConfirmar: React.ComponentProps<typeof DialogoSeleccionAlmacenPedido>['alConfirmar']) {
  const alCambiarApertura = vi.fn()
  render(
    <DialogoSeleccionAlmacenPedido
      abierto
      cotizacion={cotizacion}
      almacenes={almacenes}
      direccionesEntrega={direccionesEntrega}
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

    await waitFor(() => expect(alConfirmar).toHaveBeenCalledWith('warehouse-2', 'delivery', expect.objectContaining({
      id: direccionesEntrega[0].id,
      direccion: 'Av. Principal 123',
    })))
  })

  it('permite indicar recojo sin enviarlo como una entrega', async () => {
    const alConfirmar = vi.fn().mockResolvedValue(undefined)
    renderDialog(alConfirmar)
    fireEvent.change(screen.getByLabelText('Modalidad de cumplimiento'), { target: { value: 'pickup' } })
    const almacen = screen.getByRole('combobox', { name: 'Almacén de preparación' })
    fireEvent.focus(almacen)
    fireEvent.click(screen.getByRole('option', { name: /CENTRAL · Almacén central/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))

    await waitFor(() => expect(alConfirmar).toHaveBeenCalledWith('warehouse-1', 'pickup', undefined))
  })

  it('permite guardar el destino manual en el pedido cuando es entrega', async () => {
    const alConfirmar = vi.fn().mockResolvedValue(undefined)
    renderDialog(alConfirmar)
    const almacen = screen.getByRole('combobox', { name: 'Almacén de preparación' })
    fireEvent.focus(almacen)
    fireEvent.click(screen.getByRole('option', { name: /CENTRAL · Almacén central/ }))
    const direccion = screen.getByRole('combobox', { name: 'Dirección de entrega' })
    fireEvent.focus(direccion)
    fireEvent.click(screen.getByRole('option', { name: /Ingresar otra dirección/ }))
    fireEvent.change(screen.getByRole('textbox', { name: /Dirección/ }), { target: { value: 'Av. Nueva 456' } })
    fireEvent.change(screen.getByLabelText('Nombre del destino'), { target: { value: 'Sucursal nueva' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))

    await waitFor(() => expect(alConfirmar).toHaveBeenCalledWith('warehouse-1', 'delivery', {
      etiqueta: 'Sucursal nueva', direccion: 'Av. Nueva 456', ubigeo: '', referencia: '',
    }))
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
