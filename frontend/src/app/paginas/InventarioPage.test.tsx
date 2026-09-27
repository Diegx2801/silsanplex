import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'

import { InventarioPage } from './InventarioPage'

const mocks = vi.hoisted(() => ({
  useInventario: vi.fn(),
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ hasPermission: () => false }),
}))
vi.mock('@/modulos/productos/estado/useProductos', () => ({
  useProductos: () => ({ productos: [] }),
}))
vi.mock('@/modulos/inventario/estado/useAlmacenes', () => ({
  useAlmacenes: () => ({
    almacenes: [], ubicaciones: [], cargando: false, error: '', reintentar: vi.fn(),
    guardarAlmacen: vi.fn(), guardarUbicacion: vi.fn(),
    cambiarEstadoAlmacen: vi.fn(), cambiarEstadoUbicacion: vi.fn(),
    transferir: vi.fn(), reclasificar: vi.fn(), configurar: vi.fn(),
  }),
}))
vi.mock('@/modulos/inventario/estado/useInventario', () => ({
  useInventario: mocks.useInventario,
}))
vi.mock('@/modulos/inventario/componentes/PanelExistenciasLotes', () => ({
  PanelExistenciasLotes: () => <div data-testid="panel-lotes" />,
}))
vi.mock('@/modulos/inventario/componentes/DialogoMovimientoInventario', () => ({
  DialogoMovimientoInventario: () => null,
}))

const existencia = {
  productoId: 'producto-1', productoCodigo: 'SKU-1', productoDescripcion: 'Producto uno',
  laboratorio: 'Laboratorio', unidadMedida: 'UND', stockFisico: 8,
  stockDisponibleSanitario: 8, stockReservado: 0, stockAsignable: 8,
  stockCuarentena: 0, stockDanado: 0, stockVencido: 0, valorInventario: 80,
  almacenes: 1, bucketsConStock: 1, lotesConStock: 1,
}

describe('InventarioPage paginada', () => {
  beforeEach(() => {
    mocks.useInventario.mockReset()
    mocks.useInventario.mockReturnValue({
      existencias: { elementos: [existencia], pagina: 1, tamanioPagina: 25, total: 60, totalPaginas: 3 },
      resumenExistencias: { productos: 60, productosConStock: 40, productosSinStock: 20 },
      movimientos: { elementos: [], pagina: 1, tamanioPagina: 25, total: 0, totalPaginas: 1 },
      cargandoExistencias: false, actualizandoExistencias: false, errorExistencias: null,
      cargandoMovimientos: false, actualizandoMovimientos: false, errorMovimientos: null,
      reintentarExistencias: vi.fn(), reintentarMovimientos: vi.fn(), registrarMovimiento: vi.fn(),
    })
  })

  it('muestra físico, reservado y disponible sin cargar movimientos', () => {
    render(<MemoryRouter><InventarioPage /></MemoryRouter>)
    expect(screen.getByRole('columnheader', { name: 'Físico' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'Reservado' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'Disponible' })).toBeVisible()
    expect(mocks.useInventario.mock.calls.at(-1)?.[0].movimientos).toBeUndefined()
    expect(screen.queryByRole('heading', { name: 'Historial de movimientos' })).not.toBeInTheDocument()
  })

  it('abre directamente lotes sin consultar el resumen por producto', () => {
    render(<MemoryRouter initialEntries={['/inventario?vista=lotes']}><InventarioPage /></MemoryRouter>)
    expect(screen.getByTestId('panel-lotes')).toBeVisible()
    expect(mocks.useInventario).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Por almacén y lote' })).toHaveAttribute('aria-current', 'page')
  })

  it('reinicia Existencias a página 1 al cambiar búsqueda, filtro y tamaño', () => {
    render(<MemoryRouter><InventarioPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente de existencias' }))
    expect(mocks.useInventario.mock.calls.at(-1)?.[0].existencias.pagina).toBe(2)

    fireEvent.change(screen.getByPlaceholderText('Código, producto o laboratorio'), {
      target: { value: 'nuevo' },
    })
    expect(mocks.useInventario.mock.calls.at(-1)?.[0].existencias.pagina).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente de existencias' }))
    fireEvent.change(screen.getByLabelText('Disponibilidad'), { target: { value: 'con-stock' } })
    expect(mocks.useInventario.mock.calls.at(-1)?.[0].existencias).toMatchObject({
      pagina: 1,
      filtroStock: 'con-stock',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente de existencias' }))
    fireEvent.change(screen.getByLabelText('Filas por página de existencias'), { target: { value: '50' } })
    expect(mocks.useInventario.mock.calls.at(-1)?.[0].existencias).toMatchObject({
      pagina: 1,
      tamanioPagina: 50,
    })
  })
})
