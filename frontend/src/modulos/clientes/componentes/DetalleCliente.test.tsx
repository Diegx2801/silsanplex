import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'

const mocks = vi.hoisted(() => ({
  historial: {
    cotizaciones: [] as Cotizacion[],
    cargando: false,
    error: null as Error | null,
    reintentar: vi.fn(),
  },
  hasPermission: vi.fn((permission: string) => permission === 'CUSTOMERS_VIEW' || permission === 'SALES_VIEW'),
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ hasPermission: mocks.hasPermission }),
}))
vi.mock('@/modulos/ventas/estado/useCotizacionesPersistentes', () => ({
  useCotizacionesPersistentesPorCliente: () => mocks.historial,
}))

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
  beforeEach(() => {
    mocks.historial = { cotizaciones: [], cargando: false, error: null, reintentar: vi.fn() }
    mocks.hasPermission.mockImplementation((permission: string) => permission === 'CUSTOMERS_VIEW' || permission === 'SALES_VIEW')
  })

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

  it('muestra el estado vacio del historial persistente', () => {
    render(<DetalleCliente abierto cliente={cliente} alCambiarApertura={vi.fn()} alRestaurarFoco={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Cotizaciones' })).toBeInTheDocument()
    expect(screen.getByText(/Este cliente.*cotizaciones registradas/)).toBeInTheDocument()
  })

  it('muestra loading y error del historial', () => {
    mocks.historial = { cotizaciones: [], cargando: true, error: null, reintentar: vi.fn() }
    const { rerender } = render(<DetalleCliente abierto cliente={cliente} alCambiarApertura={vi.fn()} alRestaurarFoco={vi.fn()} />)
    expect(screen.getByText(/Cargando cotizaciones/)).toBeInTheDocument()

    mocks.historial = { cotizaciones: [], cargando: false, error: new Error('fallo'), reintentar: vi.fn() }
    rerender(<DetalleCliente abierto cliente={cliente} alCambiarApertura={vi.fn()} alRestaurarFoco={vi.fn()} />)
    expect(screen.getByText(/No se pudo cargar el historial/)).toBeInTheDocument()
  })

  it('lista varias cotizaciones, filtra vencidas y abre el detalle persistente', async () => {
    const cotizaciones = [
      {
        id: 'cot-accepted', numero: 'COT-000002', clienteId: cliente.id, clienteDocumento: cliente.numeroDocumento, clienteNombre: cliente.nombreRazonSocial,
        fechaEmision: '2026-09-20', fechaValidez: '2026-10-20', preciosIncluyenIgv: true, observacion: 'Historica',
        lineas: [{ id: 'linea-2', productoId: 'producto-2', productoCodigo: 'P-2', productoDescripcion: 'Producto snapshot', unidadMedida: 'UND', cantidad: 2, precioUnitario: 59, subtotal: 118, afectacionIgv: 'gravado' }],
        estado: 'aceptada', fechaRegistro: '2026-09-20T12:00:00.000Z', fechaCambioEstado: null,
        totalesPersistidos: { subtotal: 100, igv: 18, total: 118 }, pedidoRelacionado: { id: 'order-1', numero: 'PED-000001' },
      },
      {
        id: 'cot-expired', numero: 'COT-000001', clienteId: cliente.id, clienteDocumento: cliente.numeroDocumento, clienteNombre: cliente.nombreRazonSocial,
        fechaEmision: '2026-08-01', fechaValidez: '2026-08-10', preciosIncluyenIgv: true, observacion: '',
        lineas: [{ id: 'linea-1', productoId: 'producto-1', productoCodigo: 'P-1', productoDescripcion: 'Producto antiguo', unidadMedida: 'UND', cantidad: 1, precioUnitario: 10, afectacionIgv: 'gravado' }],
        estado: 'emitida', fechaRegistro: '2026-08-01T12:00:00.000Z', fechaCambioEstado: null,
        totalesPersistidos: { subtotal: 8.47, igv: 1.53, total: 10 },
      },
    ] satisfies Cotizacion[]
    mocks.historial = { cotizaciones, cargando: false, error: null, reintentar: vi.fn() }
    render(<DetalleCliente abierto cliente={cliente} alCambiarApertura={vi.fn()} alRestaurarFoco={vi.fn()} />)

    expect(screen.getByText('COT-000002')).toBeInTheDocument()
    expect(screen.getByText('COT-000001')).toBeInTheDocument()
    expect(screen.getByText('PED-000001')).toBeInTheDocument()
    expect(screen.getAllByText('Vencida')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Vencida' }))
    expect(screen.getByText('COT-000001')).toBeInTheDocument()
    expect(screen.queryByText('COT-000002')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
    expect(screen.getByRole('dialog', { name: 'Detalle de COT-000001' })).toBeInTheDocument()
    expect(screen.getByText('Producto antiguo')).toBeInTheDocument()
  })

  it('oculta cotizaciones cuando falta SALES_VIEW', () => {
    mocks.hasPermission.mockReturnValue(false)
    render(<DetalleCliente abierto cliente={cliente} alCambiarApertura={vi.fn()} alRestaurarFoco={vi.fn()} />)
    expect(screen.queryByRole('heading', { name: 'Cotizaciones' })).not.toBeInTheDocument()
  })
})
