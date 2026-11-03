import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelMovimientosAlmacen } from './PanelMovimientosAlmacen'

const mocks = vi.hoisted(() => ({ listados: vi.fn() }))
vi.mock('../estado/useListadosAlmacen', () => ({
  useListadosAlmacen: mocks.listados,
}))
vi.mock('./FormularioTransferencia', () => ({
  FormularioTransferencia: () => (
    <input
      aria-label="Borrador de transferencia"
      defaultValue="Conservar producto seleccionado"
    />
  ),
}))
const inicial = {
  pagina: 1,
  tamanioPagina: 25,
  busqueda: '',
  almacenId: '',
  fechaDesde: '',
  fechaHasta: '',
  orden: 'fecha-desc',
}
function montar(vista: 'transferencias' | 'kardex' = 'transferencias') {
  render(
    <PanelMovimientosAlmacen
      organizationId="org-1"
      vista={vista}
      puedeGestionar
      almacenes={[
        {
          id: 'almacen-1',
          codigo: 'CENTRAL',
          nombre: 'Almacén central',
          direccion: '',
          activo: true,
        },
      ]}
      ubicaciones={[]}
      transferir={vi.fn()}
    />,
  )
  return within(
    screen.getByRole('region', {
      name:
        vista === 'transferencias'
          ? 'Historial de transferencias'
          : 'Kardex valorizado',
    }),
  )
}
const consultaActual = () => mocks.listados.mock.lastCall?.[0].transferencias
beforeEach(() => {
  vi.clearAllMocks()
  const listado = {
    data: { elementos: [], total: 1000, totalPaginas: 40 },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }
  mocks.listados.mockReturnValue({ kardex: listado, transferencias: listado })
})

describe('Filtros del historial de transferencias', () => {
  it('muestra el botón uniforme deshabilitado cuando ya están los valores predeterminados', () => {
    const historial = montar()
    expect(
      historial.getByRole('button', { name: 'Limpiar filtros' }),
    ).toBeDisabled()
    expect(consultaActual()).toEqual(inicial)
  })
  it('restablece búsqueda, almacén, fechas, orden y paginación sin tocar el borrador', async () => {
    const historial = montar()
    fireEvent.change(historial.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'TR-0052' },
    })
    await waitFor(() => expect(consultaActual().busqueda).toBe('TR-0052'))
    fireEvent.change(historial.getByLabelText('Almacén', { exact: true }), {
      target: { value: 'almacen-1' },
    })
    fireEvent.change(historial.getByLabelText('Orden', { exact: true }), {
      target: { value: 'fecha-asc' },
    })
    fireEvent.change(historial.getByLabelText('Fecha desde'), {
      target: { value: '2026-10-01' },
    })
    fireEvent.change(historial.getByLabelText('Fecha hasta'), {
      target: { value: '2026-10-15' },
    })
    fireEvent.change(
      historial.getByLabelText('Filas por página de transferencias'),
      { target: { value: '100' } },
    )
    fireEvent.click(
      historial.getByRole('button', {
        name: 'Página siguiente de transferencias',
      }),
    )
    expect(consultaActual()).toMatchObject({
      pagina: 2,
      tamanioPagina: 100,
      orden: 'fecha-asc',
    })
    fireEvent.click(historial.getByRole('button', { name: 'Limpiar filtros' }))
    // Clearing must bypass the previous debounced term immediately.
    expect(consultaActual()).toEqual(inicial)
    expect(historial.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('')
    expect(historial.getByLabelText('Almacén', { exact: true })).toHaveValue('')
    expect(historial.getByLabelText('Orden', { exact: true })).toHaveValue(
      'fecha-desc',
    )
    expect(historial.getByLabelText('Fecha desde')).toHaveValue('')
    expect(historial.getByLabelText('Fecha hasta')).toHaveValue('')
    expect(
      historial.getByLabelText('Filas por página de transferencias'),
    ).toHaveValue('25')
    expect(
      historial.getByRole('button', { name: 'Limpiar filtros' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Borrador de transferencia')).toHaveValue(
      'Conservar producto seleccionado',
    )
  })
  it('habilita limpiar aunque solo cambie el orden o la página', () => {
    const historial = montar()
    const limpiar = historial.getByRole('button', { name: 'Limpiar filtros' })
    fireEvent.change(historial.getByLabelText('Orden', { exact: true }), {
      target: { value: 'fecha-asc' },
    })
    expect(limpiar).toBeEnabled()
    fireEvent.click(limpiar)
    fireEvent.click(
      historial.getByRole('button', {
        name: 'Página siguiente de transferencias',
      }),
    )
    expect(limpiar).toBeEnabled()
    fireEvent.click(limpiar)
    expect(consultaActual()).toEqual(inicial)
  })
  it('no cambia el apartado de Kardex fuera del alcance solicitado', () => {
    montar('kardex')
    expect(
      screen.queryByRole('button', { name: 'Limpiar filtros' }),
    ).not.toBeInTheDocument()
  })
})

describe('Kardex adaptable', () => {
  it('muestra trazabilidad, cantidades, lote y saldos completos en tarjetas móviles', () => {
    const listado = {
      data: {
        elementos: [{
          id: 'movimiento-1',
          secuenciaLedger: 7,
          productoId: 'producto-1',
          productoCodigo: 'SKU-01',
          productoDescripcion: 'Producto de prueba',
          unidadMedida: 'Unidad',
          almacen: 'Almacén central',
          estado: 'available',
          lote: 'LOT-2026-01',
          fechaOperacion: '2026-10-20',
          fechaRegistro: '2026-10-20T15:00:00Z',
          motivo: 'Recepción de compra',
          documentoReferencia: 'REC-000014',
          costoUnitario: 5,
          cantidadEntrada: 10,
          cantidadSalida: 0,
          valorEntrada: 50,
          valorSalida: 0,
          saldoCantidad: 10,
          saldoValor: 50,
          cantidadCapturada: 1,
          unidadCapturada: 'Caja',
          factorConversion: 10,
        }],
        total: 1,
        totalPaginas: 1,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    mocks.listados.mockReturnValue({ kardex: listado, transferencias: listado })

    const historial = montar('kardex')
    const tarjetas = screen.getByRole('list', { name: 'Movimientos del Kardex' })

    expect(tarjetas).toHaveClass('xl:hidden')
    expect(within(tarjetas).getByText('Producto de prueba')).toBeVisible()
    expect(within(tarjetas).getByText('Almacén central · LOT-2026-01')).toBeVisible()
    expect(within(tarjetas).getByText('REC-000014')).toBeVisible()
    expect(within(tarjetas).getByText('Recepción de compra')).toBeVisible()
    expect(within(tarjetas).getByText('Equivale a 10 Unidad')).toBeVisible()
    expect(within(tarjetas).getByText('Valor del saldo')).toBeVisible()

    const tabla = historial.getByRole('table', { name: 'Kardex valorizado' })
    expect(tabla.parentElement).toHaveClass('hidden', 'xl:block')
  })
})
