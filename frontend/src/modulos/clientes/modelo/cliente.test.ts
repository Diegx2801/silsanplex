import { describe, expect, it } from 'vitest'

import {
  clienteCoincideBusqueda,
  esquemaDatosCliente,
  type Cliente,
} from './cliente'

const cliente = {
  id: 'cliente-1',
  tipoDocumento: 'ruc',
  numeroDocumento: '20123456789',
  nombreRazonSocial: 'Boticas El Sol SAC',
  nombreComercial: 'Boticas El Sol',
  contacto: 'María López',
  email: 'compras@elsol.pe',
  telefono: '999888777',
  direccion: 'Lima',
  activo: true,
  fechaRegistro: '2026-08-19T18:00:00.000Z',
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
})

describe('clienteCoincideBusqueda', () => {
  it('busca sin distinguir mayúsculas ni tildes', () => {
    expect(clienteCoincideBusqueda(cliente, 'maria')).toBe(true)
    expect(clienteCoincideBusqueda(cliente, 'EL SOL')).toBe(true)
    expect(clienteCoincideBusqueda(cliente, '2012345')).toBe(true)
    expect(clienteCoincideBusqueda(cliente, 'inexistente')).toBe(false)
  })
})
