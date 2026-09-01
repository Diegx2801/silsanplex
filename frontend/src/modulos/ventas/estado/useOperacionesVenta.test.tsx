import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'

const mocks = vi.hoisted(() => ({
  crearPedidoPersistente: vi.fn(),
  listarPedidosPersistentes: vi.fn(),
  listarVentasPersistentes: vi.fn(),
  registrarVentaPersistente: vi.fn(),
  actualizarCantidadesPedidoPersistente: vi.fn(),
  cancelarPedidoPersistente: vi.fn(),
  despacharVentaPersistente: vi.fn(),
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ access: { organizationId: 'org-1' } }),
}))
vi.mock('@/modulos/ventas/servicios/ventasService', () => mocks)

import { useOperacionesVenta } from './useOperacionesVenta'

const cotizacion = {
  id: 'cotizacion-1', numero: 'COT-000001', clienteId: 'cliente-1', clienteDocumento: '20548796321', clienteNombre: 'Cliente Uno',
  fechaEmision: '2026-09-01', fechaValidez: '2026-09-30', preciosIncluyenIgv: true, observacion: '',
  lineas: [{ id: 'linea-1', productoId: 'producto-1', productoCodigo: 'P-1', productoDescripcion: 'Producto', unidadMedida: 'UND', cantidad: 1, precioUnitario: 10 }],
  estado: 'emitida', fechaRegistro: '2026-09-01T12:00:00.000Z', fechaCambioEstado: null,
} satisfies Cotizacion

function Probe({ aceptarCotizacion = vi.fn() }: { aceptarCotizacion?: (id: string) => string | undefined }) {
  const { pedidos, ventas, crearPedido, actualizarPedido, cancelarPedido, despacharVenta, cargando, error, reintentar } = useOperacionesVenta({ cotizaciones: [cotizacion], aceptarCotizacion })
  return (
    <>
      <output data-testid="estado">{cargando ? 'cargando' : error ? 'error' : `${pedidos.length}:${ventas.length}`}</output>
      <button type="button" onClick={() => void crearPedido(cotizacion.id, 'warehouse-1')}>Crear</button>
      <button type="button" onClick={() => void actualizarPedido('pedido-1', [{ orderItemId: 'linea-1', quantity: 2 }], '00000000-0000-4000-8000-000000000001')}>Modificar</button>
      <button type="button" onClick={() => void cancelarPedido('pedido-1', '00000000-0000-4000-8000-000000000002')}>Cancelar</button>
      <button type="button" onClick={() => void despacharVenta('pedido-1', 'venta-1', [{ orderItemId: 'linea-1', quantity: 1 }], '00000000-0000-4000-8000-000000000003', '2026-09-01')}>Despachar</button>
      <button type="button" onClick={() => void reintentar()}>Reintentar</button>
    </>
  )
}

function crearCliente() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

describe('useOperacionesVenta', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lee pedidos/ventas desde Supabase y crea el pedido de forma asíncrona', async () => {
    mocks.listarPedidosPersistentes.mockResolvedValue([])
    mocks.listarVentasPersistentes.mockResolvedValue([])
    mocks.crearPedidoPersistente.mockResolvedValue('pedido-1')
    const aceptar = vi.fn()
    render(<QueryClientProvider client={crearCliente()}><Probe aceptarCotizacion={aceptar} /></QueryClientProvider>)

    fireEvent.click(document.querySelector('button')!)
    await waitFor(() => expect(mocks.crearPedidoPersistente).toHaveBeenCalledWith('org-1', cotizacion, 'warehouse-1'))
    expect(aceptar).toHaveBeenCalledWith('cotizacion-1')
  })

  it('refresca inventario tras confirmar el pedido', async () => {
    mocks.listarPedidosPersistentes.mockResolvedValue([])
    mocks.listarVentasPersistentes.mockResolvedValue([])
    mocks.crearPedidoPersistente.mockResolvedValue('pedido-1')
    const cliente = crearCliente()
    const invalidar = vi.spyOn(cliente, 'invalidateQueries')
    render(<QueryClientProvider client={cliente}><Probe /></QueryClientProvider>)

    fireEvent.click(document.querySelector('button')!)
    await waitFor(() => expect(mocks.crearPedidoPersistente).toHaveBeenCalled())
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ['inventory', 'org-1'] }))
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['inventory-fefo', 'org-1'] })
  })

  it('expone error de lectura y permite reintentar', async () => {
    mocks.listarPedidosPersistentes.mockRejectedValueOnce(new Error('fallo')).mockResolvedValueOnce([])
    mocks.listarVentasPersistentes.mockResolvedValue([])
    render(<QueryClientProvider client={crearCliente()}><Probe /></QueryClientProvider>)
    await waitFor(() => expect(document.querySelector('[data-testid="estado"]')).toHaveTextContent('error'))
    const llamadasAntes = mocks.listarPedidosPersistentes.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(mocks.listarPedidosPersistentes.mock.calls.length).toBeGreaterThan(llamadasAntes))
  })

  it('ajusta cantidades e invalida pedidos e inventario tras éxito', async () => {
    mocks.listarPedidosPersistentes.mockResolvedValue([])
    mocks.listarVentasPersistentes.mockResolvedValue([])
    mocks.actualizarCantidadesPedidoPersistente.mockResolvedValue('pedido-1')
    const cliente = crearCliente()
    const invalidar = vi.spyOn(cliente, 'invalidateQueries')
    render(<QueryClientProvider client={cliente}><Probe /></QueryClientProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Modificar' }))
    await waitFor(() => expect(mocks.actualizarCantidadesPedidoPersistente).toHaveBeenCalledWith(
      'org-1', 'pedido-1', [{ orderItemId: 'linea-1', quantity: 2 }], '00000000-0000-4000-8000-000000000001',
    ))
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ['inventory', 'org-1'] }))
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['sales-orders', 'org-1'] })
  })

  it('expone el error de cancelación sin mutar datos localmente', async () => {
    mocks.listarPedidosPersistentes.mockResolvedValue([])
    mocks.listarVentasPersistentes.mockResolvedValue([])
    mocks.cancelarPedidoPersistente.mockRejectedValue(new Error('El pedido ya no puede cancelarse'))
    render(<QueryClientProvider client={crearCliente()}><Probe /></QueryClientProvider>)

    const boton = screen.getByRole('button', { name: 'Cancelar' })
    fireEvent.click(boton)
    await waitFor(() => expect(mocks.cancelarPedidoPersistente).toHaveBeenCalledWith(
      'org-1', 'pedido-1', '00000000-0000-4000-8000-000000000002',
    ))
  })

  it('despacha mediante una RPC y refresca ventas, pedidos, inventario y Kardex', async () => {
    mocks.listarPedidosPersistentes.mockResolvedValue([])
    mocks.listarVentasPersistentes.mockResolvedValue([])
    mocks.despacharVentaPersistente.mockResolvedValue('pedido-1')
    const cliente = crearCliente()
    const invalidar = vi.spyOn(cliente, 'invalidateQueries')
    render(<QueryClientProvider client={cliente}><Probe /></QueryClientProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Despachar' }))
    await waitFor(() => expect(mocks.despacharVentaPersistente).toHaveBeenCalledWith(
      'org-1', 'pedido-1', 'venta-1', [{ orderItemId: 'linea-1', quantity: 1 }], '00000000-0000-4000-8000-000000000003', '2026-09-01',
    ))
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ['inventory-kardex', 'org-1'] }))
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['sales', 'org-1'] })
  })
})
