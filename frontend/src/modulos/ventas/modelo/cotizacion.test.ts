import { describe, expect, it } from 'vitest'

import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import { productoInicial, type Producto } from '@/modulos/productos/modelo/producto'

import {
  calcularTotalesCotizacion,
  crearCotizacion,
  esquemaDatosCotizacion,
  validarCotizacion,
  type DatosCotizacion,
} from './cotizacion'

const cliente = {
  id: 'a78b7ca1-b83d-4f6e-ac72-f8cd18fe1f01',
  organizacionId: 'a78b7ca1-b83d-4f6e-ac72-f8cd18fe1f02',
  tipoDocumento: 'ruc',
  numeroDocumento: '20548796321',
  nombreRazonSocial: 'Boticas El Sol SAC',
  nombreComercial: '',
  contacto: '',
  email: '',
  telefono: '',
  direccion: '',
  ubigeo: '',
  estadoSunat: '',
  condicionDomicilio: '',
  direccionesEntrega: [],
  activo: true,
  fechaRegistro: '2026-08-19T18:00:00.000Z',
  fechaActualizacion: '2026-08-19T18:00:00.000Z',
  fechaConsultaSunat: null,
} satisfies Cliente

const producto = {
  ...productoInicial,
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
  precioMinimo: '20.00',
  registroSanitario: '',
  controlLote: true,
  ventaReceta: false,
  activo: true,
} satisfies Producto

const datos = {
  clienteId: cliente.id,
  fechaEmision: '2026-08-19',
  fechaValidez: '2026-08-26',
  preciosIncluyenIgv: true,
  observacion: '',
  lineas: [
    { productoId: producto.id, cantidad: '5', precioUnitario: '23.60' },
  ],
} satisfies DatosCotizacion

describe('cotizaciones', () => {
  it('rechaza una vigencia anterior a la emisión', () => {
    expect(
      esquemaDatosCotizacion.safeParse({
        ...datos,
        fechaValidez: '2026-08-18',
      }).success,
    ).toBe(false)
  })

  it('calcula subtotal, IGV y total', () => {
    expect(
      calcularTotalesCotizacion(
        [{ cantidad: 5, precioUnitario: 23.6 }],
        true,
      ),
    ).toEqual({ subtotal: 100, igv: 18, total: 118 })
  })

  it('rechaza productos duplicados', () => {
    expect(
      validarCotizacion(
        { ...datos, lineas: [...datos.lineas, datos.lineas[0]] },
        [producto],
      ),
    ).toContain('una sola vez')
  })

  it('impide cotizar por debajo del precio mínimo del producto', () => {
    expect(
      validarCotizacion(
        {
          ...datos,
          lineas: [{ ...datos.lineas[0], precioUnitario: '19.99' }],
        },
        [producto],
      ),
    ).toContain('no puede ser menor a S/ 20.00')
  })

  it('crea un borrador con instantáneas comerciales', () => {
    const cotizacion = crearCotizacion(
      datos,
      cliente,
      [producto],
      'COT-000001',
      new Date('2026-08-19T19:00:00.000Z'),
      'cotizacion-1',
    )

    expect(cotizacion).toMatchObject({
      id: 'cotizacion-1',
      numero: 'COT-000001',
      clienteNombre: cliente.nombreRazonSocial,
      estado: 'borrador',
      fechaCambioEstado: null,
    })
    expect(cotizacion.lineas[0]).toMatchObject({
      productoCodigo: producto.codigo,
      cantidad: 5,
      precioUnitario: 23.6,
    })
  })
})
