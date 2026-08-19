import { describe, expect, it } from 'vitest'

import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'

import { crearRepositorioCotizacionesSesion } from './repositorioCotizacionesSesion'

function crearAlmacenamiento() {
  const datos = new Map<string, string>()
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => datos.set(clave, valor),
  }
}

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
  lineas: [
    {
      id: 'linea-1',
      productoId: 'producto-1',
      productoCodigo: 'MED-001',
      productoDescripcion: 'Paracetamol',
      unidadMedida: 'Caja',
      cantidad: 5,
      precioUnitario: 23.6,
    },
  ],
  estado: 'borrador',
  fechaRegistro: '2026-08-19T19:00:00.000Z',
  fechaCambioEstado: null,
} satisfies Cotizacion

describe('repositorioCotizacionesSesion', () => {
  it('guarda y recupera cotizaciones válidas', () => {
    const almacenamiento = crearAlmacenamiento()
    const repositorio = crearRepositorioCotizacionesSesion(almacenamiento)

    repositorio.guardar([cotizacion])

    expect(repositorio.listar()).toEqual([cotizacion])
  })

  it('descarta contenido corrupto', () => {
    const almacenamiento = crearAlmacenamiento()
    almacenamiento.setItem('silsanplex.cotizaciones-temporales.v1', 'inválido')

    expect(crearRepositorioCotizacionesSesion(almacenamiento).listar()).toEqual([])
  })
})
