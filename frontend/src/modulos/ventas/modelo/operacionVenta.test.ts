import { describe, expect, it } from 'vitest'

import { crearMovimientoInventario } from '@/modulos/inventario/modelo/inventario'
import type { Producto } from '@/modulos/productos/modelo/producto'
import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'

import {
  crearPedidoDesdeCotizacion,
  crearVentaDesdePedido,
  prepararDespachoVenta,
} from './operacionVenta'

const producto = {
  id: 'producto-1',
  codigo: 'MED-001',
  descripcion: 'Paracetamol 500 mg',
  codigoBarras: '',
  categoria: '',
  laboratorio: '',
  presentacion: '',
  unidadMedida: 'Caja',
  afectacionIgv: 'gravado',
  precioVenta: '23.60',
  registroSanitario: '',
  controlLote: true,
  ventaReceta: false,
  activo: true,
} satisfies Producto

const cotizacion = {
  id: 'cotizacion-1',
  numero: 'COT-000001',
  clienteId: 'cliente-1',
  clienteDocumento: '20548796321',
  clienteNombre: 'Boticas El Sol SAC',
  fechaEmision: '2026-08-19',
  fechaValidez: '2026-08-26',
  preciosIncluyenIgv: true,
  observacion: '',
  lineas: [{
    id: 'linea-cotizacion-1',
    productoId: producto.id,
    productoCodigo: producto.codigo,
    productoDescripcion: producto.descripcion,
    unidadMedida: producto.unidadMedida,
    cantidad: 5,
    precioUnitario: 23.6,
  }],
  estado: 'emitida',
  fechaRegistro: '2026-08-19T18:00:00.000Z',
  fechaCambioEstado: '2026-08-19T19:00:00.000Z',
} satisfies Cotizacion

function crearFlujo() {
  const pedido = crearPedidoDesdeCotizacion(
    cotizacion,
    'PED-000001',
    new Date('2026-08-19T20:00:00.000Z'),
  )
  const venta = crearVentaDesdePedido(
    pedido,
    {
      tipoDocumento: 'factura',
      serie: 'f001',
      numeroDocumento: '000001',
      fechaVenta: '2026-08-19',
      almacen: 'Almacén principal',
    },
    'VEN-000001',
    new Date('2026-08-19T21:00:00.000Z'),
  )
  return { pedido, venta }
}

describe('operación de venta', () => {
  it('conserva la trazabilidad y las instantáneas comerciales', () => {
    const { pedido, venta } = crearFlujo()

    expect(pedido).toMatchObject({
      numero: 'PED-000001',
      cotizacionId: cotizacion.id,
      estado: 'confirmado',
    })
    expect(venta).toMatchObject({
      numeroInterno: 'VEN-000001',
      pedidoId: pedido.id,
      serie: 'F001',
      estado: 'registrada',
    })
    expect(venta.lineas[0].productoDescripcion).toBe(producto.descripcion)
  })

  it('rechaza el despacho completo si falta stock', () => {
    const { venta } = crearFlujo()
    const resultado = prepararDespachoVenta(
      venta,
      {
        fechaDespacho: '2026-08-20',
        lineas: [{ lineaVentaId: venta.lineas[0].id, lote: 'L-001', fechaVencimiento: '' }],
      },
      [producto],
      [],
    )

    expect(resultado).toEqual({
      error: `${producto.descripcion}: stock insuficiente en Almacén principal (disponible: 0)`,
    })
  })

  it('genera la salida y completa la venta cuando existe stock', () => {
    const { venta } = crearFlujo()
    const entrada = crearMovimientoInventario(
      {
        productoId: producto.id,
        tipo: 'entrada',
        cantidad: '10',
        almacen: 'Almacén principal',
        lote: 'L-001',
        fechaVencimiento: '2027-08-01',
        fechaOperacion: '2026-08-19',
        motivo: 'Recepción inicial',
      },
      producto,
      new Date('2026-08-19T17:00:00.000Z'),
    )
    const resultado = prepararDespachoVenta(
      venta,
      {
        fechaDespacho: '2026-08-20',
        lineas: [{ lineaVentaId: venta.lineas[0].id, lote: 'L-001', fechaVencimiento: '2027-08-01' }],
      },
      [producto],
      [entrada],
      new Date('2026-08-20T14:00:00.000Z'),
    )

    if ('error' in resultado) throw new Error(resultado.error)
    expect(resultado.venta.estado).toBe('despachada')
    expect(resultado.movimientos[0]).toMatchObject({
      tipo: 'salida',
      cantidad: 5,
      lote: 'L-001',
      almacen: 'Almacén principal',
    })
  })
})
