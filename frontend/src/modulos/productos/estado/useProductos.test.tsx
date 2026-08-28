import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { productoInicial, type Producto } from '@/modulos/productos/modelo/producto'

const mocks = vi.hoisted(() => ({
  buscarProductos: vi.fn(),
  contarProductos: vi.fn(),
  listarUnidadesMedida: vi.fn(),
  listarProductosFiltrados: vi.fn(),
  listarProductosPaginados: vi.fn(),
  listarProductos: vi.fn(),
  crearProducto: vi.fn(),
  editarProducto: vi.fn(),
  cambiarEstadoProducto: vi.fn(),
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    access: { organizationId: 'org-1' },
    user: { id: 'user-1' },
  }),
}))

vi.mock('@/modulos/productos/servicios/productosService', () => mocks)

import { useProductos } from './useProductos'

const producto = {
  ...productoInicial,
  id: 'producto-1',
  codigo: 'MED-001',
  descripcion: 'Producto de prueba',
} satisfies Producto

function crearCliente() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
}

function GuardarProbe() {
  const { guardarProducto } = useProductos('med')

  return (
    <button
      type="button"
      onClick={() =>
        void guardarProducto({
          ...productoInicial,
          codigo: 'MED-001',
          descripcion: 'Producto de prueba',
        })
      }
    >
      Guardar
    </button>
  )
}

function EstadoProbe() {
  const { cambiarEstado } = useProductos()

  return (
    <button type="button" onClick={() => void cambiarEstado(producto)}>
      Cambiar estado
    </button>
  )
}

function PaginaProbe() {
  const { productos, totalFiltrado, totalProductos } = useProductos('', {
    consulta: {
      busqueda: 'med',
      estado: 'todos',
      categoria: '',
      laboratorio: '',
      orden: 'codigo-asc',
    },
    pagina: 2,
    tamanioPagina: 10,
  })

  return (
    <output>
      {productos.length}:{totalFiltrado}:{totalProductos}
    </output>
  )
}

describe('useProductos', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buscarProductos.mockResolvedValue([])
    mocks.contarProductos.mockResolvedValue(30)
    mocks.listarUnidadesMedida.mockResolvedValue([])
    mocks.listarProductosFiltrados.mockResolvedValue([])
    mocks.listarProductosPaginados.mockResolvedValue({
      elementos: [producto],
      totalFiltrado: 21,
    })
    mocks.listarProductos.mockResolvedValue([])
    mocks.crearProducto.mockResolvedValue('producto-1')
    mocks.editarProducto.mockResolvedValue('producto-1')
    mocks.cambiarEstadoProducto.mockResolvedValue(undefined)
  })

  it('invalida todas las búsquedas de la organización al guardar', async () => {
    const queryClient = crearCliente()
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries')

    render(
      <QueryClientProvider client={queryClient}>
        <GuardarProbe />
      </QueryClientProvider>,
    )

    fireEvent.click(document.querySelector('button')!)

    await waitFor(() =>
      expect(invalidar).toHaveBeenCalledWith({
        queryKey: ['products', 'org-1'],
      }),
    )
  })

  it('invalida todas las búsquedas de la organización al cambiar estado', async () => {
    const queryClient = crearCliente()
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries')

    render(
      <QueryClientProvider client={queryClient}>
        <EstadoProbe />
      </QueryClientProvider>,
    )

    fireEvent.click(document.querySelector('button')!)

    await waitFor(() =>
      expect(invalidar).toHaveBeenCalledWith({
        queryKey: ['products', 'org-1'],
      }),
      )
  })

  it('consulta la página y los totales server-side cuando recibe filtros', async () => {
    const queryClient = crearCliente()

    render(
      <QueryClientProvider client={queryClient}>
        <PaginaProbe />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(mocks.listarProductosPaginados).toHaveBeenCalledWith('org-1', {
        busqueda: 'med',
        estado: 'todos',
        categoria: '',
        laboratorio: '',
        orden: 'codigo-asc',
        pagina: 2,
        tamanioPagina: 10,
      })
      expect(mocks.contarProductos).toHaveBeenCalledWith('org-1')
      expect(mocks.listarUnidadesMedida).toHaveBeenCalledWith('org-1')
    })

    await waitFor(() =>
      expect(document.querySelector('output')).toHaveTextContent('1:21:30'),
    )
  })
})
