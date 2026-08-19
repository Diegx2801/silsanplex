import { describe, expect, it } from 'vitest'

import type { DatosComprasSesion } from './repositorioComprasSesion'
import { crearRepositorioComprasSesion } from './repositorioComprasSesion'

function crearAlmacenamiento() {
  const datos = new Map<string, string>()
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => datos.set(clave, valor),
    datos,
  }
}

const datosValidos = {
  proveedores: [
    {
      id: 'proveedor-1',
      tipoDocumento: 'ruc',
      numeroDocumento: '20123456789',
      razonSocial: 'Distribuidora Demo SAC',
      contacto: '',
      email: '',
      telefono: '',
      direccion: '',
      activo: true,
      fechaRegistro: '2026-08-19T16:00:00.000Z',
    },
  ],
  compras: [
    {
      id: 'compra-1',
      proveedorId: 'proveedor-1',
      proveedorDocumento: '20123456789',
      proveedorNombre: 'Distribuidora Demo SAC',
      tipoDocumento: 'factura',
      serie: 'F001',
      numero: '000001',
      fechaEmision: '2026-08-19',
      fechaVencimientoPago: '',
      almacen: 'Almacén principal',
      preciosIncluyenIgv: true,
      observacion: '',
      lineas: [
        {
          id: 'linea-1',
          productoId: 'producto-1',
          productoCodigo: 'MED-001',
          productoDescripcion: 'Paracetamol',
          unidadMedida: 'Caja',
          controlLote: true,
          cantidad: 5,
          costoUnitario: 11.8,
          lote: 'L-001',
          fechaVencimiento: '',
        },
      ],
      estado: 'borrador',
      fechaRegistro: '2026-08-19T17:00:00.000Z',
      fechaRecepcion: null,
    },
  ],
} satisfies DatosComprasSesion

describe('repositorioComprasSesion', () => {
  it('guarda y recupera proveedores y compras válidas', () => {
    const almacenamiento = crearAlmacenamiento()
    const repositorio = crearRepositorioComprasSesion(almacenamiento)

    repositorio.guardar(datosValidos)

    expect(repositorio.leer()).toEqual(datosValidos)
  })

  it('aísla contenido corrupto y vuelve al estado vacío', () => {
    const almacenamiento = crearAlmacenamiento()
    almacenamiento.setItem('silsanplex.compras-temporales.v1', '{inválido')

    expect(crearRepositorioComprasSesion(almacenamiento).leer()).toEqual({
      proveedores: [],
      compras: [],
    })
  })
})
