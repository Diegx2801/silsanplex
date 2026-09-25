import { describe, expect, it } from 'vitest'

import type { PedidoVenta, Venta } from './operacionVenta'
import { estadoOperacionVenta, etiquetaEstadoLogisticoPedido } from './estadoCumplimientoPedido'

const pedido = {
  id: 'pedido-1',
  numero: 'PED-000001',
  cotizacionId: 'cotizacion-1',
  cotizacionNumero: 'COT-000001',
  clienteId: 'cliente-1',
  clienteDocumento: '20111111111',
  clienteNombre: 'Cliente Uno',
  preciosIncluyenIgv: true,
  baseGravada: 10,
  montoExonerado: 0,
  montoInafecto: 0,
  subtotal: 10,
  igv: 1.8,
  total: 11.8,
  estadoCalculoTributario: 'calculated',
  observacion: '',
  lineas: [],
  estado: 'atendido',
  modalidadCumplimiento: 'delivery',
  estadoCumplimiento: 'pending',
  fechaRegistro: '2026-09-01T12:00:00.000Z',
  fechaAtencion: '2026-09-01T12:00:00.000Z',
} satisfies PedidoVenta

const bienes = {
  id: 'venta-1',
  numeroInterno: 'VEN-000001',
  pedidoId: 'pedido-1',
  pedidoNumero: 'PED-000001',
  clienteId: 'cliente-1',
  clienteDocumento: '20111111111',
  clienteNombre: 'Cliente Uno',
  tipoDocumento: 'factura',
  serie: 'F001',
  numeroDocumento: '1',
  fechaVenta: '2026-09-01',
  almacen: 'Almacén central',
  preciosIncluyenIgv: true,
  baseGravada: 10,
  montoExonerado: 0,
  montoInafecto: 0,
  subtotal: 10,
  igv: 1.8,
  total: 11.8,
  estadoCalculoTributario: 'calculated',
  lineas: [{
    id: 'linea-venta-1',
    productoId: 'producto-1',
    tipoProducto: 'good',
    productoCodigo: 'P-1',
    productoDescripcion: 'Producto',
    unidadMedida: 'UND',
    cantidad: 10,
    cantidadDespachada: 10,
    cantidadPendiente: 0,
    precioUnitario: 1,
    lote: '',
    fechaVencimiento: '',
  }],
  estado: 'despachada',
  fechaRegistro: '2026-09-01T12:00:00.000Z',
  fechaDespacho: '2026-09-01T12:00:00.000Z',
} satisfies Venta

describe('estado de cumplimiento entre Ventas y Distribución', () => {
  it('no confunde la salida de almacén con la recepción del cliente', () => {
    expect(estadoOperacionVenta(pedido, bienes)).toBe('por-entregar')
    expect(etiquetaEstadoLogisticoPedido(pedido, bienes)).toBe('Despachado · pendiente de entrega')
  })

  it('muestra la preparación y la recepción parcial como etapas logísticas', () => {
    expect(etiquetaEstadoLogisticoPedido({ ...pedido, estadoCumplimiento: 'preparing' }, bienes))
      .toBe('Preparando entrega')
    expect(estadoOperacionVenta({ ...pedido, estadoCumplimiento: 'partially_fulfilled' }, bienes))
      .toBe('entrega-parcial')
    expect(etiquetaEstadoLogisticoPedido({ ...pedido, estadoCumplimiento: 'partially_fulfilled' }, bienes))
      .toBe('Entrega parcial')
  })

  it('marca el recojo como completo sin crear una entrega de Distribución', () => {
    const pedidoRecojo = { ...pedido, modalidadCumplimiento: 'pickup' as const, estadoCumplimiento: 'delivered' as const }
    expect(estadoOperacionVenta(pedidoRecojo, bienes)).toBe('completado')
    expect(etiquetaEstadoLogisticoPedido(pedidoRecojo, bienes)).toBe('Recojo completado')
  })

  it('mantiene despacho parcial de bienes separado de entrega parcial al cliente', () => {
    const despachoParcial = {
      ...bienes,
      estado: 'registrada' as const,
      lineas: [{ ...bienes.lineas[0], cantidadDespachada: 4, cantidadPendiente: 6 }],
    }
    expect(estadoOperacionVenta(pedido, despachoParcial)).toBe('despacho-parcial')
    expect(etiquetaEstadoLogisticoPedido(pedido, despachoParcial)).toBe('Despacho parcial')
  })

  it('no llama despacho a una atención que solo tiene servicios pendientes', () => {
    const ventaServicio = {
      ...bienes,
      estado: 'registrada' as const,
      lineas: [{
        ...bienes.lineas[0],
        tipoProducto: 'service' as const,
        cantidadDespachada: 0,
        cantidadPendiente: 1,
      }],
    }
    expect(estadoOperacionVenta(pedido, ventaServicio)).toBe('servicios-pendientes')
    expect(etiquetaEstadoLogisticoPedido(pedido, ventaServicio)).toBe('Servicios pendientes')
  })
})
