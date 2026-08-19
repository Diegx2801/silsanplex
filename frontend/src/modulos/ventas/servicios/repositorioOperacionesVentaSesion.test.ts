import { describe, expect, it } from 'vitest'

import type { DatosOperacionesVenta } from './repositorioOperacionesVentaSesion'
import { crearRepositorioOperacionesVentaSesion } from './repositorioOperacionesVentaSesion'

function crearAlmacenamiento() {
  const datos = new Map<string, string>()
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => datos.set(clave, valor),
  }
}

const datosValidos = {
  pedidos: [{
    id: 'pedido-1', numero: 'PED-000001', cotizacionId: 'cotizacion-1', cotizacionNumero: 'COT-000001',
    clienteId: 'cliente-1', clienteDocumento: '20548796321', clienteNombre: 'Boticas El Sol SAC',
    preciosIncluyenIgv: true, observacion: '', estado: 'confirmado',
    fechaRegistro: '2026-08-19T20:00:00.000Z', fechaAtencion: null,
    lineas: [{ id: 'linea-1', productoId: 'producto-1', productoCodigo: 'MED-001', productoDescripcion: 'Paracetamol', unidadMedida: 'Caja', cantidad: 5, precioUnitario: 23.6, lote: '', fechaVencimiento: '' }],
  }],
  ventas: [],
} satisfies DatosOperacionesVenta

describe('repositorio de operaciones de venta', () => {
  it('guarda y recupera operaciones válidas', () => {
    const repositorio = crearRepositorioOperacionesVentaSesion(crearAlmacenamiento())
    repositorio.guardar(datosValidos)
    expect(repositorio.listar()).toEqual(datosValidos)
  })

  it('aísla contenido corrupto', () => {
    const almacenamiento = crearAlmacenamiento()
    almacenamiento.setItem('silsanplex.operaciones-venta-temporales.v1', '{inválido')
    expect(crearRepositorioOperacionesVentaSesion(almacenamiento).listar()).toEqual({ pedidos: [], ventas: [] })
  })
})
