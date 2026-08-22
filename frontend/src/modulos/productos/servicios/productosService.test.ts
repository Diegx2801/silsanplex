import { beforeEach, describe, expect, it, vi } from 'vitest'

import { productoInicial } from '@/modulos/productos/modelo/producto'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  buscarProductos,
  cambiarEstadoProducto,
  crearProducto,
  editarProducto,
  listarProductos,
} from './productosService'

interface RespuestaSupabase {
  data: unknown
  error: { code: string } | null
}

function crearCadena(respuestaActual: () => RespuestaSupabase) {
  const cadena = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    or: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    then: (
      resolver: (respuesta: RespuestaSupabase) => unknown,
      rechazador?: (motivo: unknown) => unknown,
    ) => Promise.resolve(respuestaActual()).then(resolver, rechazador),
  }

  cadena.select.mockReturnValue(cadena)
  cadena.eq.mockReturnValue(cadena)
  cadena.order.mockReturnValue(cadena)
  cadena.or.mockReturnValue(cadena)
  cadena.insert.mockReturnValue(cadena)
  cadena.update.mockReturnValue(cadena)

  return cadena
}

const productoFila = {
  id: 'producto-1',
  code: 'MED-001',
  description: 'Producto de prueba',
  barcode: '775000000001',
  category: 'Línea',
  subline: 'Sublínea',
  laboratory: 'Marca',
  presentation: 'Caja',
  unit_of_measure: 'Unidad',
  tax_affectation: 'por-definir' as const,
  cost: 10,
  sale_price: 15,
  health_registry: null,
  batch_control: true,
  prescription_sale: false,
  is_active: true,
}

describe('productosService', () => {
  let respuesta: RespuestaSupabase
  let cadena: ReturnType<typeof crearCadena>

  beforeEach(() => {
    respuesta = { data: [], error: null }
    cadena = crearCadena(() => respuesta)
    supabaseMock.from.mockReset()
    supabaseMock.from.mockReturnValue(cadena)
  })

  it('lista únicamente los productos de la organización recibida', async () => {
    respuesta = { data: [productoFila], error: null }

    const productos = await listarProductos('org-1')

    expect(supabaseMock.from).toHaveBeenCalledWith('products')
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(productos[0]).toMatchObject({
      id: 'producto-1',
      codigo: 'MED-001',
      sublinea: 'Sublínea',
      costo: '10',
    })
  })

  it('usa un mensaje específico cuando falla la consulta', async () => {
    respuesta = { data: null, error: { code: 'XX000' } }

    await expect(listarProductos('org-1')).rejects.toThrow(
      'No se pudo cargar el catálogo de productos',
    )
  })

  it('busca en los campos del catálogo sin perder el filtro de organización', async () => {
    respuesta = { data: [productoFila], error: null }

    const productos = await buscarProductos('org-1', 'producto')

    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(cadena.or).toHaveBeenCalledWith(
      expect.stringContaining('description.ilike.%producto%'),
    )
    expect(productos).toHaveLength(1)
  })

  it('usa un mensaje específico cuando falla la búsqueda', async () => {
    respuesta = { data: null, error: { code: 'XX000' } }

    await expect(buscarProductos('org-1', 'producto')).rejects.toThrow(
      'No se pudo cargar el catálogo de productos',
    )
  })

  it('crea un producto normalizando el código y enviando el actor', async () => {
    const datos = {
      ...productoInicial,
      codigo: ' med-001 ',
      descripcion: 'Producto de prueba',
      costo: '10.00',
      precioVenta: '15.00',
    }

    await crearProducto('org-1', 'user-1', datos)

    const payload = cadena.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload).toMatchObject({
      organization_id: 'org-1',
      code: 'MED-001',
      cost: 10,
      sale_price: 15,
      created_by: 'user-1',
      updated_by: 'user-1',
    })
  })

  it('usa un mensaje específico cuando falla el registro', async () => {
    respuesta = { data: null, error: { code: 'XX000' } }

    await expect(
      crearProducto('org-1', 'user-1', {
        ...productoInicial,
        codigo: 'MED-001',
        descripcion: 'Producto de prueba',
      }),
    ).rejects.toThrow('No se pudo registrar el producto')
  })

  it('edita un producto dentro de la organización indicada', async () => {
    const datos = {
      ...productoInicial,
      codigo: 'MED-001',
      descripcion: 'Producto actualizado',
    }

    await editarProducto('org-1', 'user-1', 'producto-1', datos)

    expect(cadena.update).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        code: 'MED-001',
        updated_by: 'user-1',
      }),
    )
    expect(cadena.eq).toHaveBeenCalledWith('id', 'producto-1')
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it('usa un mensaje específico cuando falla la edición', async () => {
    respuesta = { data: null, error: { code: 'XX000' } }

    await expect(
      editarProducto('org-1', 'user-1', 'producto-1', {
        ...productoInicial,
        codigo: 'MED-001',
        descripcion: 'Producto actualizado',
      }),
    ).rejects.toThrow('No se pudo actualizar el producto')
  })

  it('cambia el estado usando el id y la organización', async () => {
    await cambiarEstadoProducto('org-1', 'user-1', {
      ...productoInicial,
      id: 'producto-1',
    })

    expect(cadena.update).toHaveBeenCalledWith({
      is_active: false,
      updated_by: 'user-1',
    })
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it('usa un mensaje específico cuando falla el cambio de estado', async () => {
    respuesta = { data: null, error: { code: 'XX000' } }

    await expect(
      cambiarEstadoProducto('org-1', 'user-1', {
        ...productoInicial,
        id: 'producto-1',
      }),
    ).rejects.toThrow('No se pudo cambiar el estado del producto')
  })

  it('traduce el duplicado de código o barras a un error de dominio', async () => {
    respuesta = { data: null, error: { code: '23505' } }

    await expect(
      crearProducto('org-1', 'user-1', {
        ...productoInicial,
        codigo: 'MED-001',
        descripcion: 'Producto duplicado',
      }),
    ).rejects.toThrow('Ya existe un producto con este código o código de barras')
  })
})
