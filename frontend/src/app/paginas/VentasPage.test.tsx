import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSIONS } from '@/features/auth/permissions'

import { VentasPage } from './VentasPage'

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  useClientes: vi.fn(),
  useProductos: vi.fn(),
  useAlmacenes: vi.fn(),
  useCotizacionesPersistentes: vi.fn(),
  useOperacionesVenta: vi.fn(),
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ hasPermission: mocks.hasPermission }),
}))
vi.mock('@/modulos/clientes/estado/useClientes', () => ({ useClientes: mocks.useClientes }))
vi.mock('@/modulos/productos/estado/useProductos', () => ({ useProductos: mocks.useProductos }))
vi.mock('@/modulos/inventario/estado/useAlmacenes', () => ({ useAlmacenes: mocks.useAlmacenes }))
vi.mock('@/modulos/ventas/estado/useCotizacionesPersistentes', () => ({
  useCotizacionesPersistentes: mocks.useCotizacionesPersistentes,
}))
vi.mock('@/modulos/ventas/estado/useOperacionesVenta', () => ({
  useOperacionesVenta: mocks.useOperacionesVenta,
}))

const cliente = {
  id: 'cliente-1',
  organizacionId: 'organizacion-1',
  tipoDocumento: 'ruc',
  numeroDocumento: '20548796321',
  nombreRazonSocial: 'Boticas El Sol SAC',
  nombreComercial: '',
  contacto: '',
  email: '',
  telefono: '',
  direccion: '',
  ubigeo: '',
  estadoSunat: 'ACTIVO',
  condicionDomicilio: 'HABIDO',
  direccionesEntrega: [],
  activo: true,
  fechaRegistro: '2026-09-16T00:00:00.000Z',
  fechaActualizacion: '2026-09-16T00:00:00.000Z',
  fechaConsultaSunat: null,
}

const producto = {
  id: 'producto-1',
  codigo: 'MED-001',
  descripcion: 'Paracetamol 500 mg',
  descripcionAmpliada: '',
  codigoBarras: '',
  categoria: '',
  sublinea: '',
  laboratorio: '',
  presentacion: 'Caja',
  tipo: 'good',
  unidadBaseId: '11111111-1111-4111-8111-111111111111',
  unidadMedida: 'Unidad',
  afectacionIgv: 'gravado',
  precioVenta: '23.60',
  precioMinimo: '',
  stockMaximo: '',
  anchoCm: '',
  altoCm: '',
  largoCm: '',
  pesoKg: '',
  registroSanitario: '',
  controlLote: false,
  controlVencimiento: false,
  serialControl: false,
  ventaReceta: false,
  activo: true,
  unidadesAlternativas: [],
}

const almacen = {
  id: 'almacen-1',
  codigo: 'CENTRAL',
  nombre: 'Almacén central',
  direccion: '',
  activo: true,
}

function renderPage() {
  return render(<VentasPage />)
}

describe('VentasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasPermission.mockImplementation(
      (permission: string) => permission === PERMISSIONS.SALES_MANAGE,
    )
    mocks.useClientes.mockReturnValue({ clientes: [cliente] })
    mocks.useProductos.mockReturnValue({ productos: [producto] })
    mocks.useAlmacenes.mockReturnValue({ almacenes: [almacen], cargando: false, error: null })
    mocks.useCotizacionesPersistentes.mockReturnValue({
      cotizaciones: [],
      guardarCotizacion: vi.fn().mockResolvedValue(undefined),
      emitirCotizacion: vi.fn().mockResolvedValue(undefined),
      cargando: false,
      emitiendo: false,
      error: null,
      reintentar: vi.fn(),
    })
    mocks.useOperacionesVenta.mockReturnValue({
      pedidos: [],
      ventas: [],
      crearPedido: vi.fn().mockResolvedValue(undefined),
      registrarVenta: vi.fn().mockResolvedValue(undefined),
      actualizarPedido: vi.fn().mockResolvedValue(undefined),
      cancelarPedido: vi.fn().mockResolvedValue(undefined),
      despacharVenta: vi.fn().mockResolvedValue(undefined),
      completarServicios: vi.fn().mockResolvedValue(undefined),
      creandoPedido: false,
      actualizandoPedido: false,
      cancelandoPedido: false,
      despachandoVenta: false,
      completandoServicios: false,
      cargando: false,
      error: null,
      reintentar: vi.fn(),
    })
  })

  it('abre la cotización con el diálogo centrado y los selectores buscables', async () => {
    renderPage()
    screen.getByRole('button', { name: 'Nueva cotización' }).click()

    expect(await screen.findByRole('dialog', { name: 'Nueva cotización' })).toBeVisible()
    expect(await screen.findByRole('combobox', { name: 'Cliente' })).toBeVisible()
    expect(await screen.findByRole('combobox', { name: 'Producto 1' })).toBeVisible()
  })
})
