import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DetalleCliente } from './DetalleCliente'
import type { Cliente } from '@/modulos/clientes/modelo/cliente'

const cliente: Cliente = {
  id: '11111111-1111-4111-8111-111111111111',
  organizacionId: '22222222-2222-4222-8222-222222222222',
  tipoDocumento: 'ruc',
  numeroDocumento: '20123456789',
  nombreRazonSocial: 'Cliente de prueba SAC',
  nombreComercial: 'Cliente prueba',
  contacto: 'Ana Pérez',
  email: 'ana@example.com',
  telefono: '+51999999999',
  direccion: 'Av. Principal 100',
  ubigeo: '130101',
  estadoSunat: 'ACTIVO',
  condicionDomicilio: 'HABIDO',
  fuenteDatosFiscales: 'MANUAL',
  fechaConsultaSunat: null,
  direccionesEntrega: [{
    id: '33333333-3333-4333-8333-333333333333',
    etiqueta: 'Almacén principal',
    direccion: 'Jr. Secundario 200',
    ubigeo: '130101',
    referencia: 'Frente al parque',
    principal: true,
  }],
  activo: true,
  fechaRegistro: '2026-01-01T00:00:00.000Z',
  fechaActualizacion: '2026-01-01T00:00:00.000Z',
}

describe('DetalleCliente', () => {
  it('expone una consulta de solo lectura con información fiscal y entregas', () => {
    render(
      <DetalleCliente
        abierto
        cliente={cliente}
        alCambiarApertura={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Detalle del cliente' })).toBeInTheDocument()
    expect(screen.getByText('Cliente de prueba SAC')).toBeInTheDocument()
    expect(screen.getByText('Av. Principal 100')).toBeInTheDocument()
    expect(screen.getByText('Almacén principal')).toBeInTheDocument()
    expect(screen.getByText('Principal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar detalle del cliente' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
  })
})
