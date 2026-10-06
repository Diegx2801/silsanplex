import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Almacen, SaldoInventario, UbicacionAlmacen } from '../modelo/almacen'
import { PanelExistenciasLotes } from './PanelExistenciasLotes'

const mocks = vi.hoisted(() => ({ useListadosAlmacen: vi.fn() }))

vi.mock('../estado/useListadosAlmacen', () => ({ useListadosAlmacen: mocks.useListadosAlmacen }))

const almacen: Almacen = {
  id: 'warehouse-1', codigo: 'CENTRAL', nombre: 'Almacén central', direccion: '', activo: true,
}
const ubicacion: UbicacionAlmacen = {
  id: 'location-1', almacenId: almacen.id, codigo: 'A-01', nombre: 'Anaquel A', descripcion: '', activa: true,
}
const saldo: SaldoInventario = {
  productoId: 'product-1', productoCodigo: 'SKU-001', productoDescripcion: 'Producto uno', unidadMedida: 'Caja',
  almacenId: almacen.id, almacenCodigo: almacen.codigo, almacenNombre: almacen.nombre,
  ubicacionId: ubicacion.id, ubicacionCodigo: ubicacion.codigo, ubicacionNombre: ubicacion.nombre,
  estado: 'available', lote: 'LOTE-1', fechaVencimiento: '2027-12-31', cantidad: 8,
  cantidadReservada: 2, cantidadAsignable: 6, valorInventario: 80, costoPromedio: 10,
}

describe('PanelExistenciasLotes acciones contextuales', () => {
  beforeEach(() => {
    mocks.useListadosAlmacen.mockReset().mockReturnValue({
      stock: {
        data: { elementos: [saldo], pagina: 1, tamanioPagina: 25, total: 1, totalPaginas: 1 },
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
      },
    })
  })

  it('envía la posición exacta elegida a los flujos de ajuste y movimiento', () => {
    const onAjustar = vi.fn()
    const onMovimiento = vi.fn()
    render(
      <PanelExistenciasLotes
        almacenes={[almacen]}
        ubicaciones={[ubicacion]}
        puedeGestionar
        accionesDeshabilitadas={false}
        onAjustar={onAjustar}
        onMovimiento={onMovimiento}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Ajustar stock de Producto uno' })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Registrar movimiento para Producto uno' })[0]!)

    expect(onAjustar).toHaveBeenCalledWith(saldo, expect.anything())
    expect(onMovimiento).toHaveBeenCalledWith(saldo, expect.anything())
  })

  it('alinea la columna Acciones con los botones de la tabla de lotes', () => {
    render(
      <PanelExistenciasLotes
        almacenes={[almacen]}
        ubicaciones={[ubicacion]}
        puedeGestionar
        accionesDeshabilitadas={false}
        onAjustar={vi.fn()}
        onMovimiento={vi.fn()}
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'Acciones' })).toHaveClass('text-center')
    const botonesAjuste = screen.getAllByRole('button', { name: 'Ajustar stock de Producto uno' })
    expect(botonesAjuste[1]?.parentElement).toHaveClass('justify-center')
  })

  it('permite ajustar stock no asignable si queda cantidad física sin reservar', () => {
    mocks.useListadosAlmacen.mockReturnValue({
      stock: {
        data: { elementos: [{ ...saldo, estado: 'damaged', cantidadAsignable: 0 }], pagina: 1, tamanioPagina: 25, total: 1, totalPaginas: 1 },
        isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
      },
    })
    render(
      <PanelExistenciasLotes
        almacenes={[almacen]}
        ubicaciones={[ubicacion]}
        puedeGestionar
        accionesDeshabilitadas={false}
        onAjustar={vi.fn()}
        onMovimiento={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Ajustar stock de Producto uno' })[0]).toBeEnabled()
  })

  it('bloquea el descuento si toda la cantidad está reservada', () => {
    mocks.useListadosAlmacen.mockReturnValue({
      stock: {
        data: { elementos: [{ ...saldo, cantidadReservada: saldo.cantidad, cantidadAsignable: 0 }], pagina: 1, tamanioPagina: 25, total: 1, totalPaginas: 1 },
        isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
      },
    })
    render(
      <PanelExistenciasLotes
        almacenes={[almacen]}
        ubicaciones={[ubicacion]}
        puedeGestionar
        accionesDeshabilitadas={false}
        onAjustar={vi.fn()}
        onMovimiento={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Ajustar stock de Producto uno' })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Registrar movimiento para Producto uno' })[0]).toBeEnabled()
  })
})
