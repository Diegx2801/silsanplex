import { describe, expect, it } from 'vitest'

import { enriquecerLineasPedidoConSaldos, obtenerLineasDisponiblesDistribucion, pedidoListoParaProgramarDistribucion } from './pedidosProgramables'

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
const lineaOperativa = {
  id: 'linea-pedido-1', productoId: 'producto-1', tipoProducto: 'good', productoCodigo: 'P-1',
  productoDescripcion: 'Producto', unidadMedida: 'UND', cantidad: 3, precioUnitario: 10,
  lote: '', fechaVencimiento: '',
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

describe('enriquecerLineasPedidoConSaldos', () => {
  it('usa cantidades de Ventas por identidad de línea y conserva el pendiente real', () => {
    const resultado = enriquecerLineasPedidoConSaldos([lineaOperativa], ventaCompleta)
    expect(resultado).toEqual([expect.objectContaining({
      id: 'linea-pedido-1', cantidad: 3, cantidadDespachada: 3, cantidadPendiente: 0,
    })])
  })

  it('no inventa despachos si el saldo de Ventas aún no está disponible', () => {
    const resultado = enriquecerLineasPedidoConSaldos([lineaOperativa], undefined)
    expect(resultado[0]).toMatchObject({ cantidadDespachada: 0, cantidadPendiente: 3 })
  })
})

describe('obtenerLineasDisponiblesDistribucion', () => {
  it('resta lo asignado a otros envíos y libera planes cancelados', () => {
    const resultado = obtenerLineasDisponiblesDistribucion(
      [lineaOperativa],
      ventaCompleta,
      [
        { id: 'activa', estado: 'programado', lineas: [{ id: 'linea-pedido-1', cantidad: 1 }] },
        { id: 'cancelada', estado: 'cancelado', lineas: [{ id: 'linea-pedido-1', cantidad: 1 }] },
      ],
    )

    expect(resultado[0]).toMatchObject({ cantidadDisponibleDistribucion: 2, cantidadMaximaPlanificacion: 2 })
  })

  it('al editar incluye su propia asignación en el máximo, sin restarla dos veces', () => {
    const resultado = obtenerLineasDisponiblesDistribucion(
      [lineaOperativa],
      ventaCompleta,
      [{ id: 'actual', estado: 'preparando', lineas: [{ id: 'linea-pedido-1', cantidad: 2 }] }],
      'actual',
    )

    expect(resultado[0]).toMatchObject({ cantidadDisponibleDistribucion: 1, cantidadMaximaPlanificacion: 3 })
  })

  it('no ofrece un pedido si todo lo despachado ya está asignado a entregas activas', () => {
    expect(obtenerLineasDisponiblesDistribucion(
      [lineaOperativa],
      ventaCompleta,
      [{ id: 'activa', estado: 'en_curso', lineas: [{ id: 'linea-pedido-1', cantidad: 3 }] }],
    )).toEqual([])
  })
})
