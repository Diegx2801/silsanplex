import { supabase } from '@/lib/supabase'

export interface PrecioVentaHistorico {
  sale_id: string
  sale_item_id: string
  sale_date: string
  recorded_at: string
  product_id: string
  product_code: string
  product_description: string
  customer_id: string
  customer_name: string
  internal_number: string
  document_type: string
  document_reference: string
  quantity: number
  unit_of_measure: string | null
  unit_price: number
  currency: string
  prices_include_tax: boolean
  tax_affectation: string | null
  recorded_by: string | null
}

export interface FiltrosPreciosVenta {
  productoId?: string
  desde?: string
  hasta?: string
  busqueda?: string
  limite?: number
  desplazamiento?: number
}

export async function consultarHistorialPreciosVenta(
  organizacionId: string, clienteId: string, filtros: FiltrosPreciosVenta = {},
): Promise<PrecioVentaHistorico[]> {
  const { data, error } = await supabase.rpc('get_customer_sale_price_history', {
    requested_organization_id: organizacionId,
    requested_customer_id: clienteId,
    requested_product_id: filtros.productoId || null,
    date_from: filtros.desde || null,
    date_to: filtros.hasta || null,
    product_search: filtros.busqueda || '',
    page_size: filtros.limite ?? 21,
    page_offset: filtros.desplazamiento ?? 0,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((fila: PrecioVentaHistorico) => ({
    ...fila, quantity: Number(fila.quantity), unit_price: Number(fila.unit_price),
  }))
}
