import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PanelControlStock } from './PanelControlStock'

const { obtenerConfiguracion, useListados } = vi.hoisted(() => ({
  obtenerConfiguracion: vi.fn(),
  useListados: vi.fn(),
}))

vi.mock('../servicios/almacenService', () => ({
  obtenerConfiguracionAlertasStock: obtenerConfiguracion,
}))

vi.mock('../estado/useListadosAlmacen', () => ({
  useListadosAlmacen: useListados,
}))

vi.mock('../estado/useDebounceInventario', () => ({
  useDebounceInventario: (valor: string) => valor,
}))

vi.mock('./SelectorProductoInventario', () => ({
  SelectorProductoInventario: ({
    id,
    name,
    value,
    onValueChange,
  }: {
    id: string
    name: string
    value?: string
    onValueChange?: (value: string, option?: { id: string; controlLote: boolean; controlVencimiento: boolean }) => void
  }) => (
    <select
      id={id}
      name={name}
      aria-label={id}
      value={value ?? ''}
      onChange={(event) => onValueChange?.(event.target.value, {
        id: event.target.value,
        controlLote: true,
        controlVencimiento: true,
      })}
    >
      <option value="">Selecciona un producto</option>
      <option value="30000000-0000-4000-8000-000000000001">Medicamento de prueba</option>
    </select>
  ),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const productId = '30000000-0000-4000-8000-000000000001'
const warehouseId = '20000000-0000-4000-8000-000000000001'
const locationId = '40000000-0000-4000-8000-000000000001'

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PanelControlStock
        organizationId={organizationId}
        almacenes={[{ id: warehouseId, codigo: 'CENTRAL', nombre: 'Central', direccion: '', activo: true }]}
        ubicaciones={[{ id: locationId, almacenId: warehouseId, codigo: 'A-01', nombre: 'Anaquel 1', descripcion: '', activa: true }]}
        puedeGestionar
        reclasificar={vi.fn().mockResolvedValue(undefined)}
        configurar={vi.fn().mockResolvedValue(undefined)}
      />
    </QueryClientProvider>,
  )
}

describe('PanelControlStock', () => {
  beforeEach(() => {
    obtenerConfiguracion.mockReset()
    useListados.mockReset()
    useListados.mockReturnValue({
      alertas: { data: { elementos: [], total: 0, totalPaginas: 1 }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() },
      vencimientos: { data: { elementos: [], total: 0, totalPaginas: 1 }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() },
    })
  })

  it('carga la política existente para que editar no sobrescriba valores previos con defaults', async () => {
    obtenerConfiguracion.mockResolvedValue({
      ubicacionId: locationId,
      stockMinimo: 5.25,
      diasVencimiento: 45,
    })
    renderPanel()

    fireEvent.change(screen.getByLabelText('politica-producto'), { target: { value: productId } })

    await waitFor(() => {
      expect(screen.getByLabelText('Stock mínimo')).toHaveValue(5.25)
      expect(screen.getByLabelText('Alerta de vencimiento (días)')).toHaveValue(45)
      expect(screen.getByRole('combobox', { name: 'Ubicación predeterminada' })).toHaveValue(locationId)
    })
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Se cargó la política actual')
  })

  it('explica los valores aplicados cuando el producto aún no tiene política', async () => {
    obtenerConfiguracion.mockResolvedValue(null)
    renderPanel()

    fireEvent.change(screen.getByLabelText('politica-producto'), { target: { value: productId } })

    await waitFor(() => {
      expect(screen.getByLabelText('Stock mínimo')).toHaveValue(0)
      expect(screen.getByLabelText('Alerta de vencimiento (días)')).toHaveValue(30)
      expect(screen.getByText(/Aún no hay política guardada/)).toBeVisible()
    })
  })

  it('muestra la condición del lote junto con su alerta de vencimiento', () => {
    useListados.mockReturnValue({
      alertas: { data: { elementos: [], total: 0, totalPaginas: 1 }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() },
      vencimientos: {
        data: {
          elementos: [{
            productoId: productId,
            productoCodigo: 'MED-001',
            productoDescripcion: 'Medicamento de prueba',
            unidadMedida: 'Caja',
            almacenId: warehouseId,
            almacenCodigo: 'CENTRAL',
            almacenNombre: 'Central',
            ubicacionId: locationId,
            ubicacionCodigo: 'A-01',
            ubicacionNombre: 'Anaquel 1',
            estado: 'quarantine',
            lote: 'LOT-001',
            fechaVencimiento: '2026-09-27',
            cantidad: 4,
            valorInventario: 20,
            costoPromedio: 5,
            stockMinimo: 0,
            diasAlertaVencimiento: 30,
            alertaStockMinimo: false,
            alertaVencimiento: true,
            diasParaVencer: 0,
            estadoVencimiento: 'urgent',
          }],
          total: 1,
          totalPaginas: 1,
        },
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
      },
    })

    renderPanel()

    expect(
      screen.getAllByText('Cuarentena').some((element) => element.getAttribute('data-tone') === 'revision'),
    ).toBe(true)
    expect(screen.getByText('Urgente · 0 días')).toBeVisible()
  })
})
