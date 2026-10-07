import { supabase } from '@/lib/supabase'
import type {
  ProductoInventarioOpcion,
  RespuestaReadInventario,
  UnidadInventarioDisponible,
} from '@/modulos/inventario/modelo/productoInventarioRead'

interface OpcionProductoFila {
  product_id: string
  product_code: string
  product_description: string
  barcode: string | null
  unit_of_measure: string | null
  base_unit_id?: string | null
  alternative_units?: unknown
  batch_control: boolean
  expiration_control: boolean
}

function adaptarOpcionProducto(fila: OpcionProductoFila): ProductoInventarioOpcion {
  const unidadesAlternativas = Array.isArray(fila.alternative_units)
    ? fila.alternative_units.flatMap((unidad): UnidadInventarioDisponible[] => {
      if (!unidad || typeof unidad !== 'object') return []
      const registro = unidad as Record<string, unknown>
      const id = typeof registro.unit_id === 'string' ? registro.unit_id : ''
      const nombre = typeof registro.unit_name === 'string' ? registro.unit_name : ''
      const factorConversion = Number(registro.conversion_factor)
      return id && nombre && Number.isFinite(factorConversion) && factorConversion > 0
        ? [{ id, nombre, factorConversion }]
        : []
    })
    : []
  const unidadBaseId = fila.base_unit_id ?? undefined

  return {
    id: fila.product_id,
    codigo: fila.product_code,
    descripcion: fila.product_description,
    codigoBarras: fila.barcode ?? '',
    unidadMedida: fila.unit_of_measure ?? '',
    unidadBaseId,
    unidadesEntrada: unidadBaseId
      ? [
        { id: unidadBaseId, nombre: fila.unit_of_measure ?? '', factorConversion: 1 },
        ...unidadesAlternativas.filter((unidad) => unidad.id !== unidadBaseId),
      ].filter((unidad) => unidad.nombre)
      : [],
    controlLote: Boolean(fila.batch_control),
    controlVencimiento: Boolean(fila.expiration_control),
  }
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
    items: respuesta.items.map(adaptarOpcionProducto),
  }
}

export async function obtenerOpcionProductoInventarioPorId(
  organizationId: string,
  productoId: string,
): Promise<ProductoInventarioOpcion | null> {
  const { data, error } = await supabase.rpc('inventory_product_option_read_by_id', {
    requested_organization_id: organizationId,
    requested_product_id: productoId,
  })

  if (error) throw new Error('No se pudo preparar el producto para la operación de Inventario')

  const respuesta = leerRespuestaReadInventario<OpcionProductoFila>(data)
  const fila = respuesta.items.find((item) => item.product_id === productoId)
  return fila ? adaptarOpcionProducto(fila) : null
}
