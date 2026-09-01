import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PedidoVenta, Venta } from '@/modulos/ventas/modelo/operacionVenta'

import { PanelOperacionesVenta } from './PanelOperacionesVenta'

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
    id: 'linea-1', productoId: 'producto-1', productoCodigo: 'P-1',
    productoDescripcion: 'Producto', unidadMedida: 'UND', cantidad: 1,
    precioUnitario: 10, lote: '', fechaVencimiento: '',
  }],
  estado: 'confirmado',
  fechaRegistro: '2026-09-01T12:00:00.000Z',
  fechaAtencion: null,
} satisfies PedidoVenta

const venta = {
  id: 'venta-1',
  numeroInterno: 'VEN-000001',
  pedidoId: 'pedido-1',
  pedidoNumero: 'PED-000001',
  clienteId: 'cliente-1',
  clienteDocumento: '20548796321',
  clienteNombre: 'Cliente Uno',
  tipoDocumento: 'boleta',
  serie: 'B001',
  numeroDocumento: '1',
  fechaVenta: '2026-09-01',
  almacen: 'Almacén central',
  preciosIncluyenIgv: true,
  lineas: [{
    id: 'sale-linea-1', pedidoLineaId: 'linea-1', productoId: 'producto-1', productoCodigo: 'P-1',
    productoDescripcion: 'Producto', unidadMedida: 'UND', cantidad: 10, cantidadDespachada: 0,
    cantidadPendiente: 10, precioUnitario: 10, lote: '', fechaVencimiento: '',
  }],
  estado: 'registrada',
  fechaRegistro: '2026-09-01T12:00:00.000Z',
  fechaDespacho: null,
} satisfies Venta

function renderPanel(props: Partial<React.ComponentProps<typeof PanelOperacionesVenta>> = {}) {
  return render(
    <PanelOperacionesVenta
      pedidos={[]}
      ventas={[]}
      alRegistrarVenta={vi.fn()}
      alNotificar={vi.fn()}
      {...props}
    />,
  )
}

describe('PanelOperacionesVenta', () => {
  it('muestra estado vacío cuando no existen pedidos persistentes', () => {
    renderPanel()
    expect(screen.getByText('Todavía no hay pedidos')).toBeVisible()
  })

  it('prioriza loading y error sobre el estado vacío', () => {
    const { rerender } = renderPanel({ cargando: true, pedidos: [pedido] })
    expect(screen.getByText('Cargando operaciones comerciales…')).toBeVisible()

    rerender(
      <PanelOperacionesVenta
        pedidos={[]}
        ventas={[]}
        alRegistrarVenta={vi.fn()}
        alNotificar={vi.fn()}
        error={new Error('RPC')}
        alReintentar={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los pedidos o ventas persistentes.')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  })

  it('muestra el almacén persistente del pedido', () => {
    renderPanel({ pedidos: [{ ...pedido, almacenNombre: 'Almacén central' }] })
    expect(screen.getByText('Almacén: Almacén central')).toBeVisible()
  })

  it('permite modificar cantidades con la clave idempotente del diálogo', async () => {
    const alActualizarPedido = vi.fn().mockResolvedValue(undefined)
    renderPanel({ pedidos: [pedido], alActualizarPedido })
    fireEvent.click(screen.getByRole('button', { name: 'Modificar cantidades' }))
    fireEvent.change(screen.getByLabelText('Nueva cantidad'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cantidades' }))

    await waitFor(() => expect(alActualizarPedido).toHaveBeenCalledWith(
      'pedido-1', [{ orderItemId: 'linea-1', quantity: 2 }], expect.stringMatching(/^[0-9a-f-]{36}$/),
    ))
  })

  it('confirma cancelación y delega la liberación al RPC', async () => {
    const alCancelarPedido = vi.fn().mockResolvedValue(undefined)
    renderPanel({ pedidos: [pedido], alCancelarPedido })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))

    await waitFor(() => expect(alCancelarPedido).toHaveBeenCalledWith(
      'pedido-1', expect.stringMatching(/^[0-9a-f-]{36}$/),
    ))
  })

  it('permite un despacho parcial y bloquea el doble submit', async () => {
    const alDespacharVenta = vi.fn().mockResolvedValue(undefined)
    renderPanel({ pedidos: [pedido], ventas: [venta], alDespacharVenta })
    fireEvent.click(screen.getByRole('button', { name: 'Despachar venta' }))
    fireEvent.change(screen.getByLabelText('Cantidad a despachar'), { target: { value: '6' } })
    const confirmar = screen.getByRole('button', { name: 'Confirmar despacho' })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)

    await waitFor(() => expect(alDespacharVenta).toHaveBeenCalledTimes(1))
    expect(alDespacharVenta).toHaveBeenCalledWith(
      'pedido-1', 'venta-1', [{ orderItemId: 'linea-1', quantity: 6 }],
      expect.stringMatching(/^[0-9a-f-]{36}$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    )
  })
})
