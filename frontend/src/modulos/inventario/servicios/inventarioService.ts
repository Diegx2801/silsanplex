import { supabase } from '@/lib/supabase'
import type { DatosMovimientoInventario, MovimientoInventario } from '@/modulos/inventario/modelo/inventario'

interface MovimientoFila {
  id: string
  product_id: string
  product_code: string
  product_description: string
  unit_of_measure: string | null
  movement_type: MovimientoInventario['tipo']
  quantity: number
  warehouse: string
  lot: string | null
  expiration_date: string | null
  operation_date: string
  created_at: string
  reason: string
}

const columnasMovimiento =
  'id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,warehouse,lot,expiration_date,operation_date,created_at,reason' as const

function mapearMovimiento(fila: MovimientoFila): MovimientoInventario {
  return {
    id: fila.id,
    productoId: fila.product_id,
    productoCodigo: fila.product_code,
    productoDescripcion: fila.product_description,
    unidadMedida: fila.unit_of_measure ?? '',
    tipo: fila.movement_type,
    cantidad: Number(fila.quantity),
    almacen: fila.warehouse,
    lote: fila.lot ?? '',
    fechaVencimiento: fila.expiration_date ?? '',
    fechaOperacion: fila.operation_date,
    fechaRegistro: fila.created_at,
    motivo: fila.reason,
  }
}

function mensajeError(error: { code?: string; message?: string }) {
  if (error.message?.includes('INVENTORY_INSUFFICIENT_STOCK')) return 'La cantidad supera el stock disponible'
  if (error.message?.includes('INVENTORY_PRODUCT_UNAVAILABLE')) return 'El producto ya no está disponible o requiere lote'
  if (error.code === '42501' || error.message?.includes('INVENTORY_FORBIDDEN')) return 'No tienes permiso para registrar movimientos'
  return 'No se pudo registrar el movimiento de inventario'
}

export async function listarMovimientosInventario(organizationId: string) {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select(columnasMovimiento)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error(mensajeError(error))
  return ((data ?? []) as MovimientoFila[]).map(mapearMovimiento)
}

export async function registrarMovimientoInventario(organizationId: string, datos: DatosMovimientoInventario) {
  const { error } = await supabase.rpc('record_inventory_movement', {
    payload: {
      organization_id: organizationId,
      product_id: datos.productoId,
      movement_type: datos.tipo,
      quantity: datos.cantidad,
      warehouse: datos.almacen,
      lot: datos.lote,
      expiration_date: datos.fechaVencimiento,
      operation_date: datos.fechaOperacion,
      reason: datos.motivo,
    },
  })
  if (error) throw new Error(mensajeError(error))
}
