import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PedidosPorProgramar, type PedidoPorProgramarResumen } from './PedidosPorProgramar'

const pedidos: PedidoPorProgramarResumen[] = [{
  id: 'pedido-1',
  numero: 'PED-000041',
  clienteNombre: 'Boticas El Sol S.A.C.',
  clienteDocumento: '20548796321',
  almacenNombre: 'Almacén central',
  cantidadProductos: 2,
  estado: 'Despachado · pendiente de entrega',
  estadoListo: true,
}]

describe('PedidosPorProgramar', () => {
  it('presenta tarjetas para celular y tableta y conserva la tabla detallada para escritorio', () => {
    const alVerDetalle = vi.fn()
    const alProgramar = vi.fn()
    const { container } = render(
      <PedidosPorProgramar
        pedidos={pedidos}
        puedeProgramar
        alVerDetalle={alVerDetalle}
        alProgramar={alProgramar}
      />,
    )

    const tarjetas = screen.getByRole('list', { name: 'Pedidos por programar' })
    expect(tarjetas).toHaveClass('lg:hidden')
    expect(within(tarjetas).getByText('2 productos')).toBeVisible()
    expect(within(tarjetas).getByRole('button', { name: 'Programar envío' })).toBeVisible()

    const tabla = screen.getByRole('table', { name: 'Pedidos por programar' })
    expect(tabla.parentElement).toHaveClass('hidden', 'lg:block')
    expect(container.querySelectorAll('[class*="min-w-"]').length).toBeGreaterThan(0)

    fireEvent.click(within(tarjetas).getByRole('button', { name: 'Ver detalle de PED-000041' }))
    fireEvent.click(within(tarjetas).getByRole('button', { name: 'Programar envío' }))
    expect(alVerDetalle).toHaveBeenCalledWith('pedido-1', expect.any(HTMLButtonElement))
    expect(alProgramar).toHaveBeenCalledTimes(1)
    expect(alProgramar).toHaveBeenCalledWith('pedido-1')
  })

  it('respeta el permiso de programación en tarjetas y tabla', () => {
    render(
      <PedidosPorProgramar
        pedidos={pedidos}
        puedeProgramar={false}
        alVerDetalle={vi.fn()}
        alProgramar={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Ver detalle de PED-000041' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Programar envío' })).not.toBeInTheDocument()
  })
})
