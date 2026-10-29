import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ReporteResumenMovimientos } from './ReporteResumenMovimientos'

const { useReporteMovimientos } = vi.hoisted(() => ({ useReporteMovimientos: vi.fn() }))
vi.mock('@/modulos/reportes/estado/useReporteMovimientos', () => ({ useReporteMovimientos }))

describe('ReporteResumenMovimientos', () => {
  it('muestra cantidades con su unidad y aclara que la variación no es stock actual', () => {
    useReporteMovimientos.mockReturnValue({
      data: {
        elementos: [
          {
            productoId: 'product-1', productoCodigo: 'PAR-01', productoDescripcion: 'Paracetamol 500 mg',
            unidadMedida: 'Caja', almacenId: 'warehouse-1', almacen: 'Central', estado: 'available',
            entradas: 12, salidas: 4, variacionNeta: 8, cantidadMovimientos: 3,
          },
          {
            productoId: 'product-2', productoCodigo: 'GAS-01', productoDescripcion: 'Gasas',
            unidadMedida: 'Unidad', almacenId: 'warehouse-1', almacen: 'Central', estado: 'quarantine',
            entradas: 2, salidas: 0, variacionNeta: 2, cantidadMovimientos: 1,
          },
        ],
        total: 2, totalMovimientos: 4, pagina: 1, tamanioPagina: 25, totalPaginas: 1,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<ReporteResumenMovimientos organizationId="org-1" almacenes={[]} />)

    expect(screen.getByRole('heading', { name: 'Resumen de movimientos de inventario' })).toBeVisible()
    expect(screen.getByText('Unidad: Caja')).toBeVisible()
    expect(screen.getByText('Unidad: Unidad')).toBeVisible()
    expect(screen.getByText('Disponible')).toBeVisible()
    expect(screen.getByText('Cuarentena')).toBeVisible()
    expect(screen.getByText(/no representa el stock actual/i)).toBeVisible()
    expect(screen.getByText('2 grupos · 4 movimientos')).toBeVisible()
  })

  it('impide consultar un intervalo invertido y lo explica junto al filtro', () => {
    useReporteMovimientos.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<ReporteResumenMovimientos organizationId="org-1" almacenes={[]} />)
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-01' } })

    expect(screen.getByRole('alert')).toHaveTextContent('La fecha inicial no puede ser posterior a la fecha final.')
  })
})
