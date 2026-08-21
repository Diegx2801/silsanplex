import { describe, expect, it } from 'vitest'

import {
  clienteCoincideBusqueda,
  esquemaDatosCliente,
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
})

describe('clienteCoincideBusqueda', () => {
  it('busca sin distinguir mayúsculas ni tildes', () => {
    expect(clienteCoincideBusqueda(cliente, 'maria')).toBe(true)
    expect(clienteCoincideBusqueda(cliente, 'EL SOL')).toBe(true)
    expect(clienteCoincideBusqueda(cliente, '2012345')).toBe(true)
    expect(clienteCoincideBusqueda(cliente, 'inexistente')).toBe(false)
  })
})
