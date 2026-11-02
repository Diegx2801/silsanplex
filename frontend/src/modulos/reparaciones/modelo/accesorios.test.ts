import { describe, expect, it } from 'vitest'
import { accesorioInicial, accesoriosPendientes, esquemaAccesorioRecepcion, esquemaComandoAccesorios, payloadAccesorio, type DetalleAccesorios } from './accesorios'
import { datosReparacionInicial, esquemaDatosReparacion } from './reparacion'

describe('Accesorios y contratos compatibles', () => {
  it('mantiene la ausencia de la colección en el contrato anterior', () => {
    const datos = { ...datosReparacionInicial(), tipoSolicitante: 'internal', areaSolicitante: 'Laboratorio', tipoEquipo: 'external', descripcionEquipoExterno: 'Equipo externo', problema: 'No enciende' }
    expect(esquemaDatosReparacion.parse(datos)).not.toHaveProperty('accesorios')
    expect(esquemaDatosReparacion.parse({ ...datos, accesorios: [] }).accesorios).toEqual([])
  })
  it('admite nombre y cantidad con condición y observaciones opcionales vacías', () => {
    expect(payloadAccesorio(esquemaAccesorioRecepcion.parse({ ...accesorioInicial(), nombre: ' Cable ' })))
      .toEqual({ name: 'Cable', quantity_received: 1, received_condition: null, observations: null })
  })
  it.each([0, -1, 1.5, NaN, 1_000_001])('rechaza cantidad inválida %s', cantidadRecibida => {
    expect(esquemaAccesorioRecepcion.safeParse({ ...accesorioInicial(), nombre: 'Cable', cantidadRecibida }).success).toBe(false)
  })
  it('rechaza nombre en blanco', () => expect(esquemaAccesorioRecepcion.safeParse({ ...accesorioInicial(), nombre: ' ' }).success).toBe(false))
  it('conserva condición y observaciones por separado', () => {
    expect(payloadAccesorio({ nombre: 'Sensor', cantidadRecibida: 2, condicion: ' Regular ', observaciones: ' Etiquetado ' }))
      .toMatchObject({ received_condition: 'Regular', observations: 'Etiquetado', quantity_received: 2 })
  })
  it('exige motivo para entrega excepcional', () => {
    expect(esquemaComandoAccesorios.safeParse({ tipo: 'deliver_repair_with_accessories', expectedLockVersion: 1,
      datos: { returns: [], authorize_exception: true, exception_reason: ' ' } }).success).toBe(false)
  })
  it('permite entrega ordinaria sin devolución ficticia', () => {
    expect(esquemaComandoAccesorios.parse({ tipo: 'deliver_repair_with_accessories', expectedLockVersion: 1,
      datos: { returns: [], authorize_exception: false, exception_reason: '' } }).datos).toMatchObject({ returns: [] })
  })
  it('exige motivo de anulación', () => {
    expect(esquemaComandoAccesorios.safeParse({ tipo: 'save_repair_accessories', expectedLockVersion: 1,
      datos: { accessories: [{ id: 'a0000000-0000-4000-8000-000000000001', void: true, reason: ' ' }] } }).success).toBe(false)
  })
  it('pendientes excluye devueltos y anulados', () => {
    const detalle = { accessories: [{ id: 'a', quantity_pending: 1, voided_at: null }, { id: 'b', quantity_pending: 0, voided_at: null }, { id: 'c', quantity_pending: 1, voided_at: 'date' }] } as DetalleAccesorios
    expect(accesoriosPendientes(detalle).map(a => a.id)).toEqual(['a'])
  })
})
