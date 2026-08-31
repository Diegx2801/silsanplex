import { describe, expect, it } from 'vitest'

import {
  esquemaDatosProveedor,
  proveedorAFormulario,
  proveedorInicial,
  type Proveedor,
} from './proveedor'

describe('esquemaDatosProveedor', () => {
  it('acepta un proveedor fiscal y comercial válido', () => {
    expect(
      esquemaDatosProveedor.safeParse({
        ...proveedorInicial,
        numeroDocumento: '20123456789',
        razonSocial: 'Distribuidora Médica del Norte SAC',
      }).success,
    ).toBe(true)
  })

  it('valida RUC, DNI y formato del código interno', () => {
    expect(
      esquemaDatosProveedor.safeParse({
        ...proveedorInicial,
        numeroDocumento: '20123',
        razonSocial: 'Proveedor inválido',
      }).success,
    ).toBe(false)

    expect(
      esquemaDatosProveedor.safeParse({
        ...proveedorInicial,
        codigo: 'código con espacios',
        tipoDocumento: 'dni',
        numeroDocumento: '12345678',
        razonSocial: 'Proveedor con DNI',
      }).success,
    ).toBe(false)
  })

  it('mantiene consistencia entre condición y días de crédito', () => {
    expect(
      esquemaDatosProveedor.safeParse({
        ...proveedorInicial,
        numeroDocumento: '20123456789',
        razonSocial: 'Proveedor contado',
        diasCredito: '30',
      }).success,
    ).toBe(false)

    expect(
      esquemaDatosProveedor.safeParse({
        ...proveedorInicial,
        numeroDocumento: '20123456789',
        razonSocial: 'Proveedor crédito',
        condicionCredito: 'credito',
        diasCredito: '30',
      }).success,
    ).toBe(true)
  })
})

describe('proveedorAFormulario', () => {
  it('convierte los días de crédito a un control editable', () => {
    const proveedor = {
      id: 'proveedor-1',
      organizationId: 'organizacion-1',
      codigo: 'PRV-001',
      tipoDocumento: 'ruc',
      numeroDocumento: '20123456789',
      razonSocial: 'Proveedor Demo SAC',
      nombreComercial: '',
      contacto: '',
      cargoContacto: '',
      email: '',
      telefono: '',
      direccion: '',
      ubigeo: '',
      estadoContribuyente: '',
      condicionDomicilio: '',
      fuenteDatosFiscales: '',
      fechaConsultaSunat: null,
      condicionCredito: 'credito',
      diasCredito: 45,
      observaciones: '',
      activo: true,
      fechaRegistro: '2026-08-21T10:00:00.000Z',
      fechaActualizacion: '2026-08-21T10:00:00.000Z',
    } satisfies Proveedor

    expect(proveedorAFormulario(proveedor)).toMatchObject({
      diasCredito: '45',
      condicionCredito: 'credito',
    })
  })
})
