import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  leerRespuestaReadInventario,
  listarOpcionesProductoInventario,
} from './productoInventarioReadService'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

describe('leerRespuestaReadInventario', () => {
  it('normaliza el contrato JSON paginado', () => {
    expect(leerRespuestaReadInventario<string>({
      items: ['uno'],
      total_count: 1,
    })).toEqual({ items: ['uno'], totalCount: 1 })
  })

  it.each([
    null,
    {},
    { items: 'invalido', total_count: 1 },
    { items: [], total_count: -1 },
    { items: [], total_count: 1.5 },
  ])('rechaza respuestas inválidas: %j', (respuesta) => {
    expect(() => leerRespuestaReadInventario(respuesta)).toThrow(/respuesta de Inventario/i)
  })
})

describe('listarOpcionesProductoInventario', () => {
  beforeEach(() => rpc.mockReset())

  it('consulta el DTO mínimo y lo adapta al modelo del frontend', async () => {
    rpc.mockResolvedValue({
      data: {
        items: [{
          product_id: 'producto-1',
          product_code: 'SKU-001',
          product_description: 'Producto uno',
          barcode: null,
          unit_of_measure: 'UND',
          batch_control: true,
          expiration_control: false,
        }],
        total_count: 72,
      },
      error: null,
    })

    const resultado = await listarOpcionesProductoInventario('org-1', 'sku', 25, 50)

    expect(rpc).toHaveBeenCalledWith('inventory_product_options', {
      requested_organization_id: 'org-1',
      search_term: 'sku',
      requested_limit: 25,
      requested_offset: 50,
    })
    expect(resultado).toEqual({
      totalCount: 72,
      items: [{
        id: 'producto-1',
        codigo: 'SKU-001',
        descripcion: 'Producto uno',
        codigoBarras: '',
        unidadMedida: 'UND',
        controlLote: true,
        controlVencimiento: false,
      }],
    })
  })

  it('expone un error estable sin filtrar detalles de Supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'detalle interno' } })

    await expect(listarOpcionesProductoInventario('org-1', '')).rejects.toThrow(
      'No se pudieron consultar los productos de Inventario',
    )
  })
})
