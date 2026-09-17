import { supabase } from '@/lib/supabase'
import type {
  ProductoInventarioOpcion,
  RespuestaReadInventario,
} from '@/modulos/inventario/modelo/productoInventarioRead'

interface OpcionProductoFila {
  product_id: string
  product_code: string
  product_description: string
  barcode: string | null
  unit_of_measure: string | null
  batch_control: boolean
  expiration_control: boolean
}

export function leerRespuestaReadInventario<T>(data: unknown): RespuestaReadInventario<T> {
  if (!data || typeof data !== 'object') {
    throw new Error('La respuesta de Inventario no tiene un formato válido')
  }

  const respuesta = data as { items?: unknown; total_count?: unknown }
  if (!Array.isArray(respuesta.items)) {
    throw new Error('La respuesta de Inventario no contiene una lista válida')
  }

  const totalCount = Number(respuesta.total_count)
  if (!Number.isSafeInteger(totalCount) || totalCount < 0) {
    throw new Error('La respuesta de Inventario no contiene un total válido')
  }

  return { items: respuesta.items as T[], totalCount }
}

export async function listarOpcionesProductoInventario(
  organizationId: string,
  busqueda: string,
  limite = 50,
  offset = 0,
): Promise<RespuestaReadInventario<ProductoInventarioOpcion>> {
  const { data, error } = await supabase.rpc('inventory_product_options', {
    requested_organization_id: organizationId,
    search_term: busqueda,
    requested_limit: limite,
    requested_offset: offset,
  })

  if (error) throw new Error('No se pudieron consultar los productos de Inventario')

  const respuesta = leerRespuestaReadInventario<OpcionProductoFila>(data)
  return {
    totalCount: respuesta.totalCount,
    items: respuesta.items.map((fila) => ({
      id: fila.product_id,
      codigo: fila.product_code,
      descripcion: fila.product_description,
      codigoBarras: fila.barcode ?? '',
      unidadMedida: fila.unit_of_measure ?? '',
      controlLote: Boolean(fila.batch_control),
      controlVencimiento: Boolean(fila.expiration_control),
    })),
  }
}
