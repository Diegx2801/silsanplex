import { describe, expect, it } from 'vitest'

import {
  datosReparacionInicial,
  esquemaDatosReparacion,
  esquemaDatosReservaParte,
  estadoStockReparacionEsConsumible,
  identidadReparacionEsEditable,
  limitarEnteroSeguro,
  normalizarBusquedaReparaciones,
  normalizarTextoOpcional,
  obtenerTransicionesGenericas,
  validarNumeroSerie,
  type DetalleReparacion,
} from './reparacion'

describe('modelo de reparaciones', () => {
  it('normaliza textos opcionales y búsquedas sin permitir patrones de PostgREST', () => {
    expect(normalizarTextoOpcional('  referencia  ')).toBe('referencia')
    expect(normalizarTextoOpcional('   ')).toBeNull()
    expect(normalizarBusquedaReparaciones(' REP-001, cliente_% ')).toBe('REP-001 cliente')
  })

  it('limita números de página a enteros seguros', () => {
    expect(limitarEnteroSeguro(Number.NaN, 1, 50)).toBe(1)
    expect(limitarEnteroSeguro(3.9, 1, 50)).toBe(3)
    expect(limitarEnteroSeguro(100, 1, 50)).toBe(50)
  })

  it('exige serie únicamente cuando el producto controla series', () => {
    expect(validarNumeroSerie('', true)).toBe('El número de serie es obligatorio para este producto')
    expect(validarNumeroSerie('SERIE-01', true)).toBeUndefined()
    expect(validarNumeroSerie('', false)).toBeUndefined()
  })

  it('valida los datos mínimos y conserva el estado inicial de garantía', () => {
    const datos = datosReparacionInicial()
    expect(datos.esGarantia).toBe(false)
    expect(datos).not.toHaveProperty('diagnostico')
    expect(datos).not.toHaveProperty('solucionAplicada')

    expect(esquemaDatosReparacion.safeParse({
      ...datos,
      clienteId: '00000000-0000-0000-0000-000000000001',
      productoId: '00000000-0000-0000-0000-000000000002',
      problema: 'No enciende',
    }).success).toBe(true)
  })

  it('expone solo transiciones comunes del estado actual', () => {
    expect(obtenerTransicionesGenericas('waiting_customer_approval')).toEqual([])
    expect(obtenerTransicionesGenericas('testing')).toEqual(['in_repair', 'ready_for_delivery'])
    expect(obtenerTransicionesGenericas('ready_for_delivery')).toEqual(['in_repair'])
  })

  it('mantiene editable la identidad al crear y en recepción o garantía inicial', () => {
    const detalleInicial = {
      reparacion: {
        estado: 'received',
        diagnostico: '',
        diagnosticoRegistrado: false,
        solucionAplicada: '',
        solucionAplicadaRegistrada: false,
      },
      diagnosticos: [],
      cotizaciones: [],
      partes: [],
      pruebas: [],
      eventos: [
        { id: 1, tipo: 'CREATED', estadoAnterior: null, estadoNuevo: 'received' },
        {
          id: 2,
          tipo: 'UPDATED',
          estadoAnterior: 'received',
          estadoNuevo: 'received',
          metadata: { assigned_technician_after: 'tecnico-1' },
        },
      ],
    } as unknown as DetalleReparacion

    expect(identidadReparacionEsEditable()).toBe(true)
    expect(identidadReparacionEsEditable(detalleInicial)).toBe(true)
    expect(identidadReparacionEsEditable({
      ...detalleInicial,
      reparacion: { ...detalleInicial.reparacion, estado: 'warranty' },
      eventos: [{
        ...detalleInicial.eventos[0],
        estadoNuevo: 'warranty',
      }],
    })).toBe(true)
  })

  it('bloquea la identidad ante progreso o historial técnico especializado', () => {
    const detalleInicial = {
      reparacion: {
        estado: 'received',
        diagnostico: '',
        diagnosticoRegistrado: false,
        solucionAplicada: '',
        solucionAplicadaRegistrada: false,
      },
      diagnosticos: [],
      cotizaciones: [],
      partes: [],
      pruebas: [],
      eventos: [{
        id: 1,
        tipo: 'CREATED',
        estadoAnterior: null,
        estadoNuevo: 'received',
      }],
    } as unknown as DetalleReparacion

    expect(identidadReparacionEsEditable({
      ...detalleInicial,
      reparacion: { ...detalleInicial.reparacion, estado: 'diagnosis' },
    })).toBe(false)
    expect(identidadReparacionEsEditable({
      ...detalleInicial,
      eventos: [
        ...detalleInicial.eventos,
        {
          ...detalleInicial.eventos[0],
          id: 2,
          tipo: 'DIAGNOSIS_CREATED',
          estadoAnterior: 'received',
          estadoNuevo: 'received',
        },
      ],
    })).toBe(false)
    expect(identidadReparacionEsEditable({
      ...detalleInicial,
      reparacion: {
        ...detalleInicial.reparacion,
        diagnostico: 'Fuente dañada',
        diagnosticoRegistrado: true,
      },
    })).toBe(false)
    expect(identidadReparacionEsEditable({
      ...detalleInicial,
      reparacion: {
        ...detalleInicial.reparacion,
        solucionAplicada: '',
        solucionAplicadaRegistrada: true,
      },
    })).toBe(false)
    expect(identidadReparacionEsEditable({
      ...detalleInicial,
      eventos: [{
        ...detalleInicial.eventos[0],
        id: 2,
        tipo: 'UPDATED',
        estadoAnterior: 'received',
        estadoNuevo: 'warranty',
      }],
    })).toBe(false)
    expect(identidadReparacionEsEditable({
      ...detalleInicial,
      eventos: [
        ...detalleInicial.eventos,
        {
          ...detalleInicial.eventos[0],
          id: 2,
          tipo: 'UPDATED',
          estadoAnterior: 'diagnosis',
          estadoNuevo: 'diagnosis',
        },
      ],
    })).toBe(false)
    expect(identidadReparacionEsEditable({
      ...detalleInicial,
      reparacion: { ...detalleInicial.reparacion, estado: 'warranty' },
      eventos: [],
    })).toBe(false)
    expect(identidadReparacionEsEditable({
      ...detalleInicial,
      eventosCompletos: false,
    })).toBe(false)
  })

  it('limita nuevas reservas y consumos de Reparaciones a stock available', () => {
    const reserva = {
      productoId: '00000000-0000-0000-0000-000000000001',
      almacenId: '00000000-0000-0000-0000-000000000002',
      ubicacionId: '00000000-0000-0000-0000-000000000003',
      estadoStock: 'available',
      lote: '',
      fechaVencimiento: '',
      cantidadSolicitada: '1',
      notas: '',
    }

    expect(esquemaDatosReservaParte.safeParse(reserva).success).toBe(true)
    expect(esquemaDatosReservaParte.safeParse({ ...reserva, estadoStock: 'damaged' }).success).toBe(false)
    expect(esquemaDatosReservaParte.safeParse({ ...reserva, estadoStock: 'quarantine' }).success).toBe(false)
    expect(estadoStockReparacionEsConsumible('available')).toBe(true)
    expect(estadoStockReparacionEsConsumible('damaged')).toBe(false)
    expect(estadoStockReparacionEsConsumible('quarantine')).toBe(false)
  })
})
