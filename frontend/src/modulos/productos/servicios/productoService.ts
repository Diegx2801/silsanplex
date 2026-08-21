import type { PostgrestError } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type { DatosProducto, Producto } from '@/modulos/productos/modelo/producto'

interface ProductoFila {
  id: string
  code: string
  description: string
  barcode: string | null
  category: string | null
  laboratory: string | null
  presentation: string | null
  unit_of_measure: string | null
  tax_affectation: 'por-definir' | 'gravado' | 'exonerado' | 'inafecto'
  sale_price: number | null
  health_registry: string | null
  batch_control: boolean
  prescription_sale: boolean
  is_active: boolean
}

const columnasProducto =
  'id,code,description,barcode,category,laboratory,presentation,unit_of_measure,tax_affectation,sale_price,health_registry,batch_control,prescription_sale,is_active' as const

const textoONulo = (valor: string) => valor.trim() || null

function mapearProducto(fila: ProductoFila): Producto {
  return {
    id: fila.id,
    codigo: fila.code,
    descripcion: fila.description,
    codigoBarras: fila.barcode ?? '',
    categoria: fila.category ?? '',
    laboratorio: fila.laboratory ?? '',
    presentacion: fila.presentation ?? '',
    unidadMedida: fila.unit_of_measure ?? '',
    afectacionIgv: fila.tax_affectation === 'por-definir' ? '' : fila.tax_affectation,
    precioVenta: fila.sale_price === null ? '' : String(fila.sale_price),
    registroSanitario: fila.health_registry ?? '',
    controlLote: fila.batch_control,
    ventaReceta: fila.prescription_sale,
    activo: fila.is_active,
  }
}

function mensajeError(error: PostgrestError) {
  if (error.code === '23505') return 'Ya existe un producto con este código o código de barras'
  if (error.code === '42501') return 'No tienes permiso para administrar productos'
  if (error.code === '23514') return 'Los datos del producto no cumplen las reglas del catálogo'
  return 'No se pudo guardar el producto'
}

export async function listarProductos(organizationId: string): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('products')
    .select(columnasProducto)
    .eq('organization_id', organizationId)
    .order('code', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw new Error(mensajeError(error))
  return ((data ?? []) as ProductoFila[]).map(mapearProducto)
}

export async function guardarProductoPersistente(
  organizationId: string,
  userId: string,
  datos: DatosProducto,
  productoId?: string,
) {
  const fila = {
    organization_id: organizationId,
    code: datos.codigo.trim().toUpperCase(),
    description: datos.descripcion.trim(),
    barcode: textoONulo(datos.codigoBarras),
    category: textoONulo(datos.categoria),
    laboratory: textoONulo(datos.laboratorio),
    presentation: textoONulo(datos.presentacion),
    unit_of_measure: textoONulo(datos.unidadMedida),
    tax_affectation: datos.afectacionIgv || 'por-definir',
    sale_price: datos.precioVenta ? Number(datos.precioVenta) : null,
    health_registry: textoONulo(datos.registroSanitario),
    batch_control: datos.controlLote,
    prescription_sale: datos.ventaReceta,
    is_active: datos.activo,
    updated_by: userId,
  }

  const consulta = productoId
    ? supabase.from('products').update(fila).eq('id', productoId).eq('organization_id', organizationId)
    : supabase.from('products').insert({ ...fila, created_by: userId })
  const { error } = await consulta
  if (error) throw new Error(mensajeError(error))
}

export async function cambiarEstadoProductoPersistente(
  organizationId: string,
  userId: string,
  producto: Producto,
) {
  const { error } = await supabase
    .from('products')
    .update({ is_active: !producto.activo, updated_by: userId })
    .eq('id', producto.id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(mensajeError(error))
}
