import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SelectorProductoInventario } from './SelectorProductoInventario'

const mocks = vi.hoisted(() => ({
  useOpcionesProductoInventario: vi.fn(),
  listarOpcionesProductoInventario: vi.fn(),
}))

vi.mock('@/modulos/inventario/estado/useOpcionesProductoInventario', () => ({
  useOpcionesProductoInventario: mocks.useOpcionesProductoInventario,
}))

vi.mock('@/modulos/inventario/servicios/productoInventarioReadService', () => ({
  listarOpcionesProductoInventario: mocks.listarOpcionesProductoInventario,
}))

const opcionUno = {
  id: 'producto-1',
  codigo: 'SKU-001',
  descripcion: 'Producto uno',
  codigoBarras: '750000000001',
  unidadMedida: 'Caja',
  controlLote: false,
  controlVencimiento: false,
}
const opcionDos = {
  ...opcionUno,
  id: 'producto-2',
  codigo: 'SKU-002',
  descripcion: 'Producto dos',
  codigoBarras: '750000000002',
}

function renderSelector(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>)
}

describe('SelectorProductoInventario', () => {
  beforeEach(() => {
    mocks.useOpcionesProductoInventario.mockReset()
    mocks.listarOpcionesProductoInventario.mockReset()
    mocks.useOpcionesProductoInventario.mockReturnValue({
      data: { items: [opcionUno], totalCount: 72 },
      isLoading: false,
      error: null,
    })
    mocks.listarOpcionesProductoInventario.mockResolvedValue({
      items: [opcionUno],
      totalCount: 72,
    })
  })

  it('selecciona la primera opción y conserva el identificador para el formulario', async () => {
    const onValueChange = vi.fn()
    const { container } = renderSelector(
      <SelectorProductoInventario
        id="producto"
        name="productoId"
        etiqueta="Producto"
        organizationId="org-1"
        onValueChange={onValueChange}
      />,
    )

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('producto-1', opcionUno))
    const combo = screen.getByRole('combobox', { name: 'Producto' })
    expect(combo).toHaveValue('SKU-001 · Producto uno')
    expect(container.querySelector('input[name="productoId"]')).toHaveValue('producto-1')
    fireEvent.focus(combo)
    expect(await screen.findByRole('option', { name: /SKU-001 · Producto uno/ })).toBeVisible()
    expect(screen.getByText('Unidad: Caja')).toBeInTheDocument()
  })

  it('permite buscar dentro del mismo combo y devuelve el producto completo', async () => {
    mocks.useOpcionesProductoInventario.mockReturnValue({
      data: { items: [opcionUno], totalCount: 72 },
      isLoading: false,
      error: null,
    })
    mocks.listarOpcionesProductoInventario.mockImplementation(async (_orgId, termino) => ({
      items: termino ? [opcionDos] : [opcionUno],
      totalCount: termino ? 1 : 72,
    }))
    const onValueChange = vi.fn()
    renderSelector(
      <SelectorProductoInventario
        id="producto"
        name="productoId"
        etiqueta="Producto"
        organizationId="org-1"
        selectedOption={opcionUno}
        onValueChange={onValueChange}
      />,
    )

    const combo = screen.getByRole('combobox', { name: 'Producto' })
    fireEvent.focus(combo)
    fireEvent.change(combo, { target: { value: 'SKU-002' } })

    const opcion = await screen.findByRole('option', { name: /SKU-002 · Producto dos/ })
    fireEvent.click(opcion)

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('producto-2', opcionDos))
    expect(combo).toHaveValue('SKU-002 · Producto dos')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('permite exigir una selección explícita', async () => {
    const onValueChange = vi.fn()
    renderSelector(
      <SelectorProductoInventario
        id="producto"
        name="productoId"
        etiqueta="Producto"
        organizationId="org-1"
        autoSeleccionarPrimeraOpcion={false}
        onValueChange={onValueChange}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Producto' })).toHaveValue('')
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('informa un fallo inicial y permite volver a intentar desde el combo', () => {
    mocks.useOpcionesProductoInventario.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('No se pudieron consultar los productos de Inventario'),
    })

    renderSelector(
      <SelectorProductoInventario
        id="producto"
        name="productoId"
        etiqueta="Producto"
        organizationId="org-1"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar la lista de productos')
    expect(screen.getByRole('combobox', { name: 'Producto' })).toBeEnabled()
  })
})
