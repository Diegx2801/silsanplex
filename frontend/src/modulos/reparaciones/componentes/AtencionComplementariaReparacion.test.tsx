import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reparacion } from '../modelo/reparacion'
const service = vi.hoisted(() => ({ listar: vi.fn(), ejecutar: vi.fn(), recuperar: vi.fn(), proveedores: vi.fn() }))
vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ access: { organizationId: 'org' }, user: { id: 'user' } }) }))
vi.mock('../servicios/atencionComplementariaService', () => ({ listarAtencionComplementaria: service.listar,
  ejecutarAtencionComplementaria: service.ejecutar, recuperarAtencionPendiente: service.recuperar, buscarProveedoresServicio: service.proveedores }))
import { AtencionComplementariaReparacion } from './AtencionComplementariaReparacion'

function show(estado = 'in_repair', edit = true, warranty = true) {
  const reparacion = { id: 'repair', lockVersion: 9, estado } as Reparacion
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><AtencionComplementariaReparacion reparacion={reparacion} puedeEditar={edit} puedeGarantia={warranty} /></QueryClientProvider>)
  return client
}
function open() {
  const details = screen.getByText('Servicio externo y garantía').closest('details')!
  details.open = true
  fireEvent(details, new Event('toggle'))
}

describe('Servicio externo y garantía: permisos y claridad', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    service.listar.mockResolvedValue({ servicios: [], garantia: null })
    service.recuperar.mockReturnValue(null)
    service.proveedores.mockResolvedValue({ elementos: [], total: 0 })
    service.ejecutar.mockResolvedValue(undefined)
  })

  it('carga bajo demanda y el usuario de consulta no recibe acciones de escritura', async () => {
    show('ready_for_delivery', false, false)
    expect(service.listar).not.toHaveBeenCalled()
    open()
    await screen.findByText('No se ha otorgado una garantía de servicio.')
    expect(service.listar).toHaveBeenCalledWith('org', 'repair')
    expect(screen.queryByRole('button', { name: /Configurar garantía|Enviar a proveedor|Registrar retorno/ })).not.toBeInTheDocument()
  })

  it('distingue el costo total del proveedor de un costo unitario o compra', async () => {
    service.listar.mockResolvedValue({ servicios: [{ id: 'external', supplier_name_snapshot: 'Taller Norte', description: 'Revisar motor', sent_at: '2026-10-01T14:00:00Z', expected_return_date: null, returned_at: null, cost_amount: null, currency: 'PEN' }], garantia: null })
    show()
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar retorno' }))
    expect(screen.queryByRole('button', { name: 'Enviar a proveedor' })).not.toBeInTheDocument()
    expect(screen.getByText('Registra 0 si no tuvo costo. No genera una compra ni un pago.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Costo total del servicio *'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }))
    await waitFor(() => expect(service.ejecutar).toHaveBeenCalledWith('org:user:repair:complementary', 'org', 'repair', 'receive_repair_external_service', { external_service_id: 'external', cost_amount: '0', currency: 'PEN' }, 9, expect.any(String)))
  })

  it('antes de entregar no inventa fechas de garantía', async () => {
    service.listar.mockResolvedValue({ servicios: [], garantia: { warranty_days: 90, coverage: 'Mano de obra', starts_at: null, ends_at: null } })
    show('ready_for_delivery')
    open()
    expect(await screen.findByText('Inicio: Pendiente de entrega · Fin: Pendiente de entrega')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar garantía antes de entregar' })).toBeInTheDocument()
  })

  it('la garantía entregada muestra las fechas reales y no puede editarse', async () => {
    service.listar.mockResolvedValue({ servicios: [], garantia: { warranty_days: 90, coverage: 'Mano de obra', starts_at: '2026-10-20T17:00:00Z', ends_at: '2027-01-18T17:00:00Z' } })
    show('delivered')
    open()
    expect(await screen.findByText(/Inicio: 20 oct.*2026.*Fin: 18 ene.*2027/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar garantía|Configurar garantía/ })).not.toBeInTheDocument()
  })

  it('conserva una promesa anterior sin mostrar cobertura iniciada por devolver sin reparar', async () => {
    service.listar.mockResolvedValue({ servicios: [], garantia: { warranty_days: 90, coverage: 'Promesa anterior', starts_at: null, ends_at: null } })
    show('returned_unrepaired')
    open()
    expect(await screen.findByText(/No iniciada por este resultado/)).toHaveTextContent('Promesa anterior')
    expect(screen.queryByRole('button', { name: /Editar garantía|Configurar garantía/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Inicio:/)).not.toBeInTheDocument()
  })

  it('recupera el retorno pendiente con sus datos, clave y versión originales', async () => {
    const pending = { tipo: 'receive_repair_external_service', datos: { external_service_id: 'external', cost_amount: '120.50', currency: 'PEN' }, expectedLockVersion: 4, clave: 'bc900000-0000-4000-8000-000000000001' }
    service.recuperar.mockReturnValue(pending)
    show()
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a proveedor' }))
    expect(screen.getByLabelText('Costo total del servicio *')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar operación' }))
    await waitFor(() => expect(service.ejecutar).toHaveBeenCalledWith('org:user:repair:complementary', 'org', 'repair', pending.tipo, pending.datos, 4, pending.clave))
  })

  it('no ofrece reintentar una garantía si se perdió el permiso de entrega', async () => {
    service.recuperar.mockReturnValue({ tipo: 'configure_repair_service_warranty', datos: { warranty_days: '90', coverage: 'Motor' }, expectedLockVersion: 4, clave: 'bc900000-0000-4000-8000-000000000001' })
    show('in_repair', true, false)
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a proveedor' }))
    expect(screen.queryByRole('button', { name: 'Reintentar operación' })).not.toBeInTheDocument()
    expect(service.ejecutar).not.toHaveBeenCalled()
  })
})
