import { describe, expect, it } from 'vitest'

import {
  clienteCoincideBusqueda,
  esquemaDatosCliente,
  limitesDocumentoCliente,
  normalizarFechaConsulta,
  type Cliente,
} from './cliente'

const cliente = {
  id: 'a78b7ca1-b83d-4f6e-ac72-f8cd18fe1f01',
  organizacionId: 'a78b7ca1-b83d-4f6e-ac72-f8cd18fe1f02',
  tipoDocumento: 'ruc',
  numeroDocumento: '20123456789',
  nombreRazonSocial: 'Boticas El Sol SAC',
  nombreComercial: 'Boticas El Sol',
  contacto: 'María López',
  email: 'compras@elsol.pe',
  telefono: '999888777',
  direccion: 'Lima',
  ubigeo: '150101',
  estadoSunat: 'ACTIVO',
  condicionDomicilio: 'HABIDO',
  direccionesEntrega: [],
  activo: true,
  fechaRegistro: '2026-08-19T18:00:00.000Z',
  fechaActualizacion: '2026-08-19T18:00:00.000Z',
  fechaConsultaSunat: null,
} satisfies Cliente

describe('esquemaDatosCliente', () => {
  it('expone límites por tipo de documento', () => {
    expect(limitesDocumentoCliente).toEqual({ ruc: 11, dni: 8, ce: 20, otro: 20 })
  })

  it('acepta un RUC válido y limpia espacios', () => {
    const resultado = esquemaDatosCliente.parse({
      ...cliente,
      nombreRazonSocial: '  Boticas El Sol SAC  ',
    })

    expect(resultado.nombreRazonSocial).toBe('Boticas El Sol SAC')
  })

  it('rechaza un DNI o RUC con longitud inválida', () => {
    expect(
      esquemaDatosCliente.safeParse({
        ...cliente,
        tipoDocumento: 'dni',
        numeroDocumento: '123',
      }).success,
    ).toBe(false)
    expect(
      esquemaDatosCliente.safeParse({
        ...cliente,
        numeroDocumento: '2012',
      }).success,
    ).toBe(false)
    expect(
      esquemaDatosCliente.safeParse({
        ...cliente,
        tipoDocumento: 'dni',
        numeroDocumento: '1234567A',
      }).success,
    ).toBe(false)
    expect(
      esquemaDatosCliente.safeParse({
        ...cliente,
        tipoDocumento: 'ruc',
        numeroDocumento: '201234567890',
      }).success,
    ).toBe(false)
    expect(
      esquemaDatosCliente.safeParse({
        ...cliente,
        tipoDocumento: 'ce',
        numeroDocumento: 'A'.repeat(20),
      }).success,
    ).toBe(true)
    expect(
      esquemaDatosCliente.safeParse({
        ...cliente,
        tipoDocumento: 'ce',
        numeroDocumento: 'A'.repeat(21),
      }).success,
    ).toBe(false)
  })

  it('normaliza fechas con offset y descarta metadata inválida', () => {
    expect(normalizarFechaConsulta('2026-09-11T19:51:00+00:00')).toBe('2026-09-11T19:51:00.000Z')
    expect(normalizarFechaConsulta('fecha inválida')).toBeNull()
    expect(esquemaDatosCliente.parse({ ...cliente, fechaConsultaSunat: '2026-09-11T19:51:00+00:00' }).fechaConsultaSunat).toBe('2026-09-11T19:51:00+00:00')
    expect(esquemaDatosCliente.safeParse({ ...cliente, fechaConsultaSunat: 'fecha inválida' }).success).toBe(false)
  })

  it('rechaza más de una dirección de entrega principal', () => {
    const direccion = {
      etiqueta: '',
      direccion: 'Av. Prueba 123',
      ubigeo: '150101',
      referencia: '',
      principal: true,
    }
    expect(
      esquemaDatosCliente.safeParse({
        ...cliente,
        direccionesEntrega: [direccion, { ...direccion, direccion: 'Jr. Dos 456' }],
      }).success,
    ).toBe(false)
  })

  it('rechaza ubigeos que no contienen seis dígitos', () => {
    expect(esquemaDatosCliente.safeParse({ ...cliente, ubigeo: '1501' }).success).toBe(false)
  })

  it('permite omitir el teléfono y acepta únicamente dígitos cuando se ingresa', () => {
    expect(esquemaDatosCliente.safeParse({ ...cliente, telefono: '' }).success).toBe(true)
    expect(esquemaDatosCliente.safeParse({ ...cliente, telefono: '987654321' }).success).toBe(true)

    const resultado = esquemaDatosCliente.safeParse({ ...cliente, telefono: '+51 987-654-321' })
    expect(resultado.success).toBe(false)
    if (!resultado.success) {
      expect(resultado.error.flatten().fieldErrors.telefono).toContain(
        'El teléfono debe contener solo números',
      )
    }
  })
})

describe('clienteCoincideBusqueda', () => {
  it('busca sin distinguir mayúsculas ni tildes', () => {
    expect(clienteCoincideBusqueda(cliente, 'maria')).toBe(true)
    expect(clienteCoincideBusqueda(cliente, 'EL SOL')).toBe(true)
    expect(clienteCoincideBusqueda(cliente, '2012345')).toBe(true)
    expect(clienteCoincideBusqueda(cliente, 'inexistente')).toBe(false)
  })
})
