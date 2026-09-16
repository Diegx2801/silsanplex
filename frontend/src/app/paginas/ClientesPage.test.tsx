import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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
})
