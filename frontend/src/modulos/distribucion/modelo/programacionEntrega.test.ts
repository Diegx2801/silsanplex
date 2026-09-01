import { describe, expect, it } from 'vitest'

import {
  crearProgramacionEntrega,
  esquemaDatosProgramacionEntrega,
  esquemaProgramacionEntrega,
  type DatosProgramacionEntrega,
} from './programacionEntrega'
import { mapearEntrega, prepararPayloadEntrega } from '../servicios/distribucionService'

describe('programación de entrega', () => {
  it('incluye los datos principales de distribución y la modalidad de transporte', () => {
    const programacion = crearProgramacionEntrega({
      pedidoId: 'pedido-1',
      pedidoNumero: 'PED-001',
      ventaId: 'venta-1',
      ventaNumero: 'VEN-001',
      clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001',
      fechaProgramada: '2026-09-02',
      fechaEntrega: '2026-09-02',
      tipoTransporte: 'externo',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      fechaEmision: '2026-09-01',
      observaciones: 'Entrega urgente',
      evidencia: 'foto-1.jpg',
      estado: 'programado',
      incidencias: ['Se confirma horario'],
      lineas: [],
    })

    expect(programacion).toMatchObject({
      numeroDespacho: 'DES-001',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      estado: 'programado',
      incidencias: ['Se confirma horario'],
    })
  })

  it('acepta los estados principales y alternos de una entrega', () => {
    const estados = [
      'programado',
      'preparando',
      'en_curso',
      'en_destino',
      'entregado',
      'entrega_parcial',
      'reprogramado',
      'rechazado',
      'devuelto',
      'cancelado',
    ] as const

    estados.forEach((estado) => {
      const resultado = esquemaProgramacionEntrega.safeParse({
        id: 'id-1',
        pedidoId: 'pedido-1',
        pedidoNumero: 'PED-001',
        ventaId: 'venta-1',
        ventaNumero: 'VEN-001',
        clienteNombre: 'Cliente demo',
        direccionEntrega: 'Av. Central 123',
        numeroDespacho: 'DES-001',
        numeroGuiaRemision: 'G-001',
        fechaEmision: '2026-09-01',
        fechaProgramada: '2026-09-02',
        fechaEntrega: '2026-09-02',
        tipoTransporte: 'externo',
        modalidad: 'movilidad_externa',
        transportista: 'Transportes Sol',
        conductor: 'Luis Pérez',
        vehiculo: 'Camión',
        placa: 'ABC-123',
        observaciones: '',
        evidencia: '',
        estado,
        incidencias: [],
        lineas: [],
      })

      expect(resultado.success).toBe(true)
    })
  })

  it('reconoce los campos del formulario de programación', () => {
    const resultado = esquemaDatosProgramacionEntrega.safeParse({
      pedidoId: 'pedido-1',
      pedidoNumero: 'PED-001',
      ventaId: 'venta-1',
      ventaNumero: 'VEN-001',
      clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001',
      fechaEmision: '2026-09-01',
      fechaProgramada: '2026-09-02',
      fechaEntrega: '2026-09-02',
      tipoTransporte: 'externo',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      observaciones: 'Entrega urgente',
      evidencia: 'foto-1.jpg',
      estado: 'programado',
      incidencias: ['Se confirma horario'],
    })

    expect(resultado.success).toBe(true)
  })

  it('serializa y restaura todos los campos del flujo de distribución para la base de datos', () => {
    const datos: DatosProgramacionEntrega = {
      pedidoId: 'pedido-1',
      pedidoNumero: 'PED-001',
      ventaId: 'venta-1',
      ventaNumero: 'VEN-001',
      clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001',
      fechaEmision: '2026-09-01',
      fechaProgramada: '2026-09-02',
      fechaEntrega: '2026-09-02',
      tipoTransporte: 'externo',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      observaciones: 'Entrega urgente',
      evidencia: 'foto-1.jpg',
      estado: 'en_curso',
      seguimiento: 'en_curso',
      incidencias: ['Se confirma horario', 'Parada no programada'],
      lineas: [],
    }

    const payload = prepararPayloadEntrega('org-1', datos, [{
      id: 'linea-1',
      productoId: 'prod-1',
      productoCodigo: 'P-001',
      productoDescripcion: 'Producto',
      cantidad: 1,
      unidadMedida: 'UND',
      lote: 'L-001',
      fechaVencimiento: '2026-12-31',
      precioUnitario: 10,
    }])

    expect(payload).toMatchObject({
      organization_id: 'org-1',
      order_id: 'pedido-1',
      order_number: 'PED-001',
      customer_name: 'Cliente demo',
      delivery_status: 'en_curso',
      tracking_status: 'en_curso',
      transport_type: 'externo',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      evidencia: 'foto-1.jpg',
      incidencias: ['Se confirma horario', 'Parada no programada'],
      items: [{ id: 'linea-1', productoDescripcion: 'Producto', cantidad: 1, unidadMedida: 'UND' }],
    })

    const restaurado = mapearEntrega({
      id: 'ent-1',
      order_id: 'pedido-1',
      order_number: 'PED-001',
      customer_name: 'Cliente demo',
      issue_date: '2026-09-01',
      delivery_date: '2026-09-02',
      guide_number: 'G-001',
      transport_type: 'externo',
      tracking_status: 'en_curso',
      observations: 'Entrega urgente',
      delivery_status: 'en_curso',
      direction: 'Av. Central 123',
      numero_despacho: 'DES-001',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      evidencia: 'foto-1.jpg',
      incidencias: ['Se confirma horario', 'Parada no programada'],
      order_items: [{ id: 'linea-1', productoDescripcion: 'Producto', cantidad: 1, unidadMedida: 'UND' }],
      created_at: '2026-09-01T00:00:00Z',
    })

    expect(restaurado).toMatchObject({
      pedidoNumero: 'PED-001',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      evidencia: 'foto-1.jpg',
      estado: 'en_curso',
      incidencias: ['Se confirma horario', 'Parada no programada'],
    })
  })
})
