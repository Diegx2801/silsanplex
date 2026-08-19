import { describe, expect, it } from 'vitest'

import type { MovimientoInventario } from '../modelo/inventario'
import { crearRepositorioInventarioSesion } from './repositorioInventarioSesion'

function crearAlmacenamiento() {
  const datos = new Map<string, string>()
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => datos.set(clave, valor),
    datos,
  }
}

const movimiento = {
  id: 'movimiento-1',
  productoId: 'producto-1',
  productoCodigo: 'MED-001',
  productoDescripcion: 'Paracetamol',
  unidadMedida: 'Caja',
  tipo: 'entrada',
  cantidad: 10,
  almacen: 'Almacén principal',
  lote: 'L-001',
  fechaVencimiento: '',
  fechaOperacion: '2026-08-19',
  fechaRegistro: '2026-08-19T16:00:00.000Z',
  motivo: 'Recepción',
} satisfies MovimientoInventario

describe('repositorioInventarioSesion', () => {
  it('guarda y recupera movimientos válidos', () => {
    const almacenamiento = crearAlmacenamiento()
    const repositorio = crearRepositorioInventarioSesion(almacenamiento)

    repositorio.guardar([movimiento])

    expect(repositorio.listar()).toEqual([movimiento])
  })

  it('descarta contenido corrupto sin interrumpir el módulo', () => {
    const almacenamiento = crearAlmacenamiento()
    almacenamiento.setItem('silsanplex.inventario-temporal.v1', '{invalido')

    expect(crearRepositorioInventarioSesion(almacenamiento).listar()).toEqual([])
  })
})
