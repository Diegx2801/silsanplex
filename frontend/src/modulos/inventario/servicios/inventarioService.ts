import { supabase } from '@/lib/supabase'
import type {
  CandidatoFefo,
  DatosMovimientoInventario,
  MovimientoInventario,
  ResumenStockInventario,
} from '@/modulos/inventario/modelo/inventario'

interface MovimientoFila {
  id: string
  product_id: string
  product_code: string
  product_description: string
  unit_of_measure: string | null
  movement_type: MovimientoInventario['tipo']
  quantity: number
  warehouse: string
  warehouse_id: string
  location_id: string
  stock_status: MovimientoInventario['estadoStock']
  unit_cost: number
  lot: string | null
  expiration_date: string | null
  operation_date: string
  created_at: string
  reason: string
}

const columnasMovimiento =
  'id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,warehouse,warehouse_id,location_id,stock_status,unit_cost,lot,expiration_date,operation_date,created_at,reason' as const

const columnasResumen =
  'product_id,warehouse_id,physical_quantity,sanitary_available_quantity,reserved_quantity,assignable_quantity,quarantine_quantity,damaged_quantity,expired_quantity,inventory_value,bucket_count,lot_count' as const

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
    almacenId: fila.warehouse_id,
    ubicacionId: fila.location_id,
    estadoStock: fila.stock_status,
    costoUnitario: Number(fila.unit_cost),
    lote: fila.lot ?? '',
    fechaVencimiento: fila.expiration_date ?? '',
    fechaOperacion: fila.operation_date,
    fechaRegistro: fila.created_at,
    motivo: fila.reason,
  }
}

function mensajeError(error: { code?: string; message?: string }) {
  if (error.message?.includes('INVENTORY_INSUFFICIENT_STOCK')) return 'La cantidad supera el stock disponible'
  if (error.message?.includes('INVENTORY_RESERVED_STOCK')) return 'La cantidad afectaría unidades reservadas por otro proceso'
  if (error.message?.includes('INVENTORY_FEFO_VIOLATION')) return 'Debes utilizar primero el lote con vencimiento más próximo'
  if (error.message?.includes('INVENTORY_EXPIRED_STOCK')) return 'El lote seleccionado está vencido y no puede despacharse'
  if (error.message?.includes('INVENTORY_MAXIMUM_STOCK_EXCEEDED')) return 'La entrada superaría el stock máximo configurado para el producto'
  if (error.message?.includes('INVENTORY_EXPIRATION_REQUIRED')) return 'El producto requiere fecha de vencimiento'
  if (error.message?.includes('INVENTORY_BATCH_REQUIRED')) return 'El producto requiere lote'
  if (error.message?.includes('INVENTORY_PRODUCT_UNAVAILABLE')) return 'El producto ya no está disponible o requiere lote'
  if (error.code === '42501' || error.message?.includes('INVENTORY_FORBIDDEN')) return 'No tienes permiso para registrar movimientos'
  return 'No se pudo registrar el movimiento de inventario'
}

export async function listarMovimientosInventario(organizationId: string) {
  const { data, error, count } = await supabase
    .from('inventory_movements')
    .select(columnasMovimiento, { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(250)
  if (error) throw new Error(mensajeError(error))
  return {
    movimientos: ((data ?? []) as MovimientoFila[]).map(mapearMovimiento),
    total: count ?? 0,
  }
}

export async function listarResumenInventario(organizationId: string) {
  const { data, error } = await supabase
    .from('inventory_stock_summary')
    .select(columnasResumen)
    .eq('organization_id', organizationId)
    .order('product_id')
    .order('warehouse_id')
  if (error) throw new Error('No se pudo consultar el resumen de inventario')

  return (data ?? []).map((fila) => ({
    productoId: fila.product_id,
    almacenId: fila.warehouse_id,
    stockFisico: Number(fila.physical_quantity),
    stockDisponibleSanitario: Number(fila.sanitary_available_quantity),
    stockReservado: Number(fila.reserved_quantity),
    stockAsignable: Number(fila.assignable_quantity),
    stockCuarentena: Number(fila.quarantine_quantity),
    stockDanado: Number(fila.damaged_quantity),
    stockVencido: Number(fila.expired_quantity),
    valorInventario: Number(fila.inventory_value),
    bucketsConStock: Number(fila.bucket_count),
    lotesConStock: Number(fila.lot_count),
  })) as ResumenStockInventario[]
}

export async function listarCandidatosFefo(
  organizationId: string,
  productId: string,
  warehouseId: string,
) {
  const { data, error } = await supabase
    .from('inventory_fefo_candidates')
    .select('product_id,warehouse_id,location_id,location_code,location_name,lot,expiration_date,assignable_quantity,average_cost,fefo_rank')
    .eq('organization_id', organizationId)
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId)
    .order('fefo_rank')
  if (error) throw new Error('No se pudo consultar la selección FEFO')

  return (data ?? []).map((fila) => ({
    productoId: fila.product_id,
    almacenId: fila.warehouse_id,
    ubicacionId: fila.location_id,
    ubicacionCodigo: fila.location_code,
    ubicacionNombre: fila.location_name,
    lote: fila.lot ?? '',
    fechaVencimiento: fila.expiration_date ?? '',
    cantidadAsignable: Number(fila.assignable_quantity),
    costoPromedio: Number(fila.average_cost),
    ordenFefo: Number(fila.fefo_rank),
  })) as CandidatoFefo[]
}

export async function cargarInventario(organizationId: string) {
  const [historial, resumenStock] = await Promise.all([
    listarMovimientosInventario(organizationId),
    listarResumenInventario(organizationId),
  ])
  return { ...historial, resumenStock }
}

export async function registrarMovimientoInventario(organizationId: string, datos: DatosMovimientoInventario) {
  const esSalidaFefo = datos.tipo === 'salida' && (datos.estadoStock ?? 'available') === 'available'
  const { error } = await supabase.rpc(esSalidaFefo ? 'record_inventory_fefo_outbound' : 'record_inventory_movement', {
    payload: {
      organization_id: organizationId,
      product_id: datos.productoId,
      movement_type: datos.tipo,
      quantity: datos.cantidad,
      warehouse: datos.almacen,
      warehouse_id: datos.almacenId,
      location_id: datos.ubicacionId,
      stock_status: datos.estadoStock ?? 'available',
      unit_cost: datos.costoUnitario ?? '0',
      lot: datos.lote,
      expiration_date: datos.fechaVencimiento,
      operation_date: datos.fechaOperacion,
      reason: datos.motivo,
    },
  })
  if (error) throw new Error(mensajeError(error))
}
