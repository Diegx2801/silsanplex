import { describe, expect, it } from 'vitest'

import {
  esquemaAlmacen,
  esquemaConfiguracionAlertasStock,
  esquemaReclasificacion,
  esquemaTransferencia,
} from './almacen'

const id = (numero: number) => `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`

describe('modelo de almacenes', () => {
  it('normaliza el codigo del almacen', () => {
    const resultado = esquemaAlmacen.parse({ codigo: ' central-1 ', nombre: 'Almacen central', direccion: '' })
    expect(resultado.codigo).toBe('CENTRAL-1')
  })

  it('impide transferir al mismo almacen', () => {
    const resultado = esquemaTransferencia.safeParse({
      referencia: 'TR-001', almacenOrigenId: id(1), ubicacionOrigenId: id(2), almacenDestinoId: id(1),
      ubicacionDestinoId: id(3), productoId: id(4), cantidad: '2', lote: '', fechaVencimiento: '',
      estado: 'available', notas: '',
    })
    expect(resultado.success).toBe(false)
  })

  it('impide reclasificar al mismo estado', () => {
    const resultado = esquemaReclasificacion.safeParse({
      productoId: id(1), almacenId: id(2), ubicacionId: id(3), estadoOrigen: 'damaged',
      estadoDestino: 'damaged', cantidad: '1', lote: 'L-01', fechaVencimiento: '', motivo: 'Revision',
    })
    expect(resultado.success).toBe(false)
  })

  it('acepta stock mínimo cero para alertar cuando se agote', () => {
    expect(esquemaConfiguracionAlertasStock.safeParse({
      productoId: id(1), almacenId: id(2), ubicacionId: id(3),
      stockMinimo: '0', diasVencimiento: '30',
    }).success).toBe(true)
  })

  it.each(['-1', '1.1234', '1e3', '100000000000', ''])('rechaza stock mínimo inválido: %s', (stockMinimo) => {
    expect(esquemaConfiguracionAlertasStock.safeParse({
      productoId: id(1), almacenId: id(2), ubicacionId: id(3),
      stockMinimo, diasVencimiento: '30',
    }).success).toBe(false)
  })

  it.each(['-1', '1.5', '3651', ''])('rechaza días de alerta inválidos: %s', (diasVencimiento) => {
    expect(esquemaConfiguracionAlertasStock.safeParse({
      productoId: id(1), almacenId: id(2), ubicacionId: id(3),
      stockMinimo: '0', diasVencimiento,
    }).success).toBe(false)
  })
})
