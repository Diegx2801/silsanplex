import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSIONS } from '@/features/auth/permissions'
import { ClientesPage } from './ClientesPage'

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  listarClientes: vi.fn(),
  guardarCliente: vi.fn(),
  cambiarEstadoCliente: vi.fn(),
  listarTodosLosClientes: vi.fn(),
  exportarClientes: vi.fn(),
  consultarRuc: vi.fn(),
  consultarDni: vi.fn(),
}))

const cliente = {
  id: 'cliente-1',
  tipoDocumento: 'ruc',
  numeroDocumento: '20548796321',
  nombreRazonSocial: 'Boticas El Sol S.A.C.',
  nombreComercial: 'El Sol',
  contacto: 'Ana Pérez',
  email: 'ana@example.test',
  telefono: '999111222',
  direccion: 'Av. Los Olivos 123, Lima',
  estadoSunat: 'ACTIVO',
  fuenteDatosFiscales: 'SUNAT',
  activo: true,
} as const

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ hasPermission: mocks.hasPermission }),
}))

vi.mock('@/modulos/clientes/servicios/customerService', () => ({
  listarClientes: mocks.listarClientes,
  guardarCliente: mocks.guardarCliente,
  cambiarEstadoCliente: mocks.cambiarEstadoCliente,
  listarTodosLosClientes: mocks.listarTodosLosClientes,
}))

vi.mock('@/modulos/clientes/servicios/exportarClientes', () => ({ exportarClientes: mocks.exportarClientes }))
vi.mock('@/modulos/clientes/servicios/rucLookupService', () => ({ consultarRuc: mocks.consultarRuc }))
vi.mock('@/modulos/clientes/servicios/dniLookupService', () => ({ consultarDni: mocks.consultarDni }))
vi.mock('@/modulos/clientes/componentes/DialogoCliente', () => ({ DialogoCliente: () => null }))
vi.mock('@/modulos/clientes/componentes/DialogoEstadoCliente', () => ({ DialogoEstadoCliente: () => null }))
vi.mock('@/modulos/clientes/componentes/DialogoImportarClientes', () => ({ DialogoImportarClientes: () => null }))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><ClientesPage /></QueryClientProvider>)
}

describe('ClientesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listarClientes.mockResolvedValue({ clientes: [], total: 0 })
  })

  it('mantiene ocultas las acciones de gestión para un usuario de consulta', async () => {
    mocks.hasPermission.mockImplementation((permission) => (
      permission === PERMISSIONS.CUSTOMERS_VIEW || permission === PERMISSIONS.CUSTOMERS_EXPORT
    ))

    renderPage()

    expect(await screen.findByText('0 registros')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Registrar cliente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeDisabled()
  })

  it('muestra las acciones de gestión únicamente con CUSTOMERS_MANAGE', async () => {
    mocks.hasPermission.mockImplementation((permission) => (
      permission === PERMISSIONS.CUSTOMERS_VIEW || permission === PERMISSIONS.CUSTOMERS_MANAGE
    ))

    renderPage()

    expect(await screen.findByText('0 registros')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Registrar cliente' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Importar' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument()
  })

  it('ofrece reintentar cuando falla la consulta del directorio', async () => {
    mocks.listarClientes
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ clientes: [], total: 0 })
    mocks.hasPermission.mockReturnValue(true)

    renderPage()

    expect(await screen.findByText('No se pudo cargar el directorio.')).toBeVisible()
    screen.getByRole('button', { name: 'Reintentar' }).click()
    expect(await screen.findByText('0 registros')).toBeVisible()
    expect(mocks.listarClientes).toHaveBeenCalledTimes(2)
  })

  it('presenta tarjetas táctiles con consulta y edición sin reemplazar la tabla de escritorio', async () => {
    mocks.hasPermission.mockImplementation((permission) => permission === PERMISSIONS.CUSTOMERS_MANAGE)
    mocks.listarClientes.mockResolvedValue({ clientes: [cliente], total: 1 })

    const { container } = renderPage()

    const tarjetas = await screen.findByRole('list', { name: 'Clientes' })
    expect(tarjetas).toHaveClass('lg:hidden')
    expect(within(tarjetas).getByRole('heading', { name: 'Boticas El Sol S.A.C.' })).toBeVisible()
    expect(within(tarjetas).getByText(/20548796321/)).toBeVisible()
    expect(within(tarjetas).getByText('Av. Los Olivos 123, Lima')).toBeVisible()
    expect(within(tarjetas).getByText(/ACTIVO · SUNAT/)).toBeVisible()
    expect(within(tarjetas).getByRole('button', { name: 'Ver detalle de Boticas El Sol S.A.C.' })).toBeVisible()
    expect(within(tarjetas).getByRole('button', { name: 'Editar' })).toBeVisible()
    expect(within(tarjetas).getByRole('button', { name: 'Desactivar cliente' })).toBeVisible()

    const tabla = screen.getByRole('table')
    expect(tabla.parentElement).toHaveClass('hidden', 'lg:block')
    expect(container.querySelector('[class*="min-w-[68rem]"]')).not.toBeNull()
  })

  it('mantiene consulta disponible pero oculta gestión en tarjetas para un usuario de solo lectura', async () => {
    mocks.hasPermission.mockImplementation((permission) => permission === PERMISSIONS.CUSTOMERS_VIEW)
    mocks.listarClientes.mockResolvedValue({ clientes: [cliente], total: 1 })

    renderPage()

    const tarjetas = await screen.findByRole('list', { name: 'Clientes' })
    expect(tarjetas).toHaveClass('lg:hidden')
    expect(within(tarjetas).getByRole('button', { name: 'Ver detalle de Boticas El Sol S.A.C.' })).toBeVisible()
    expect(within(tarjetas).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(tarjetas).queryByRole('button', { name: 'Desactivar cliente' })).not.toBeInTheDocument()
  })
})
