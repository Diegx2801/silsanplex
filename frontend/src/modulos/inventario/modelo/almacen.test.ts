import { describe, expect, it } from 'vitest'

import { esquemaAlmacen, esquemaReclasificacion, esquemaTransferencia } from './almacen'

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
})
