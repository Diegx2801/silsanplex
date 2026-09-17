import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SelectorProductoInventario } from './SelectorProductoInventario'

const { useOpcionesProductoInventario } = vi.hoisted(() => ({
  useOpcionesProductoInventario: vi.fn(),
}))

vi.mock('@/modulos/inventario/estado/useOpcionesProductoInventario', () => ({
  useOpcionesProductoInventario,
}))

const opcionUno = {
  id: 'producto-1',
  codigo: 'SKU-001',
  descripcion: 'Producto uno',
  codigoBarras: '',
  unidadMedida: 'UND',
  controlLote: false,
  controlVencimiento: false,
}

describe('SelectorProductoInventario', () => {
  beforeEach(() => {
    useOpcionesProductoInventario.mockReset()
    useOpcionesProductoInventario.mockReturnValue({
      data: { items: [opcionUno], totalCount: 72 },
      isLoading: false,
      error: null,
    })
  })

  it('selecciona la primera opción remota y conserva el nombre de formulario', async () => {
    const onValueChange = vi.fn()
    render(
      <SelectorProductoInventario
        id="producto"
        name="productoId"
        etiqueta="Producto"
        organizationId="org-1"
        onValueChange={onValueChange}
      />,
    )

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('producto-1', opcionUno))
    expect(screen.getByRole('combobox', { name: 'Producto' })).toHaveAttribute('name', 'productoId')
    expect(screen.getByText('1 opciones encontradas de 72')).toBeVisible()
  })

  it('envía la búsqueda al hook y comunica cambios de selección', () => {
    const opcionDos = { ...opcionUno, id: 'producto-2', codigo: 'SKU-002' }
    useOpcionesProductoInventario.mockReturnValue({
      data: { items: [opcionUno, opcionDos], totalCount: 2 },
      isLoading: false,
      error: null,
    })
    const onValueChange = vi.fn()
    render(
      <SelectorProductoInventario
        id="producto"
        name="productoId"
        etiqueta="Producto"
        organizationId="org-1"
        value="producto-1"
        selectedOption={opcionUno}
        onValueChange={onValueChange}
      />,
    )

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar producto' }), {
      target: { value: 'SKU-002' },
    })
    expect(useOpcionesProductoInventario).toHaveBeenLastCalledWith('SKU-002', true, 'org-1')

    fireEvent.change(screen.getByRole('combobox', { name: 'Producto' }), {
      target: { value: 'producto-2' },
    })
    expect(onValueChange).toHaveBeenLastCalledWith('producto-2', opcionDos)
  })

  it('muestra el fallo de consulta y bloquea el selector vacío', () => {
    useOpcionesProductoInventario.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('No se pudieron consultar los productos de Inventario'),
    })

    render(
      <SelectorProductoInventario
        id="producto"
        name="productoId"
        etiqueta="Producto"
        organizationId="org-1"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron consultar los productos')
    expect(screen.getByRole('combobox', { name: 'Producto' })).toBeDisabled()
  })
})
