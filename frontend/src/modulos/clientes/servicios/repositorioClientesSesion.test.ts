import { describe, expect, it } from 'vitest'

import type { Cliente } from '@/modulos/clientes/modelo/cliente'

import { crearRepositorioClientesSesion } from './repositorioClientesSesion'

function crearAlmacenamiento() {
  const datos = new Map<string, string>()
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => datos.set(clave, valor),
  }
}

const cliente = {
  id: 'cliente-1',
  tipoDocumento: 'dni',
  numeroDocumento: '12345678',
  nombreRazonSocial: 'Cliente Demo',
  nombreComercial: '',
  contacto: '',
  email: '',
  telefono: '',
  direccion: '',
  activo: true,
  fechaRegistro: '2026-08-19T18:00:00.000Z',
} satisfies Cliente

describe('repositorioClientesSesion', () => {
  it('guarda y recupera clientes válidos', () => {
    const almacenamiento = crearAlmacenamiento()
    const repositorio = crearRepositorioClientesSesion(almacenamiento)

    repositorio.guardar([cliente])

    expect(repositorio.listar()).toEqual([cliente])
  })

  it('descarta contenido corrupto', () => {
    const almacenamiento = crearAlmacenamiento()
    almacenamiento.setItem('silsanplex.clientes-temporales.v1', '{inválido')

    expect(crearRepositorioClientesSesion(almacenamiento).listar()).toEqual([])
  })
})
