import { describe, expect, it } from 'vitest'

import { pedidoListoParaProgramarDistribucion } from './pedidosProgramables'

const pedido = {
  estado: 'confirmado',
  modalidadCumplimiento: 'delivery',
  estadoCumplimiento: 'pending',
  lineas: [{ id: 'linea-pedido-1', tipoProducto: 'good', cantidad: 3 }],
} as const
const ventaCompleta = {
  estado: 'registrada',
  lineas: [{ pedidoLineaId: 'linea-pedido-1', tipoProducto: 'good', cantidadDespachada: 3, cantidadPendiente: 0 }],
} as const

describe('pedidoListoParaProgramarDistribucion', () => {
  it('acepta bienes totalmente despachados aunque queden servicios pendientes en la venta', () => {
    expect(pedidoListoParaProgramarDistribucion(pedido, ventaCompleta)).toBe(true)
  })

  it('usa los saldos de bienes y no bloquea por el estado agregado parcialmente cumplido', () => {
    expect(pedidoListoParaProgramarDistribucion({ ...pedido, estadoCumplimiento: 'partially_fulfilled' }, ventaCompleta)).toBe(true)
  })

  it.each([
    ['sin venta', undefined],
    ['venta sin líneas de producto', { estado: 'registrada', lineas: [] }],
    ['producto parcialmente despachado', { estado: 'registrada', lineas: [{ pedidoLineaId: 'linea-pedido-1', tipoProducto: 'good', cantidadDespachada: 1, cantidadPendiente: 2 }] }],
    ['producto sin saldo de despacho conocido', { estado: 'despachada', lineas: [{ pedidoLineaId: 'linea-pedido-1', tipoProducto: 'good' }] }],
  ] as const)('rechaza un pedido %s', (_caso, venta) => {
    expect(pedidoListoParaProgramarDistribucion(pedido, venta as typeof ventaCompleta | undefined)).toBe(false)
  })

  it.each([
    ['recojo del cliente', { ...pedido, modalidadCumplimiento: 'pickup' }],
    ['ya entregado', { ...pedido, estadoCumplimiento: 'delivered' }],
    ['cancelado', { ...pedido, estado: 'cancelado', estadoCumplimiento: 'cancelled' }],
    ['sin bienes físicos', { ...pedido, lineas: [{ id: 'servicio-1', tipoProducto: 'service', cantidad: 1 }] }],
  ] as const)('rechaza pedido %s', (_caso, pedidoNoProgramable) => {
    expect(pedidoListoParaProgramarDistribucion(pedidoNoProgramable, ventaCompleta)).toBe(false)
  })
})
