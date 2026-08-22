import type { PostgrestError } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type { DatosProducto, Producto } from '@/modulos/productos/modelo/producto'

interface ProductoFila {
  id: string
  code: string
  description: string
  barcode: string | null
  category: string | null
  subline: string | null
  laboratory: string | null
  presentation: string | null
  unit_of_measure: string | null
  tax_affectation: 'por-definir' | 'gravado' | 'exonerado' | 'inafecto'
  cost: number | null
  sale_price: number | null
  health_registry: string | null
  batch_control: boolean
  prescription_sale: boolean
  is_active: boolean
}

const columnasProducto =
  'id,code,description,barcode,category,subline,laboratory,presentation,unit_of_measure,tax_affectation,cost,sale_price,health_registry,batch_control,prescription_sale,is_active' as const

const textoONulo = (valor: string) => valor.trim() || null

function mapearProducto(fila: ProductoFila): Producto {
  return {
    id: fila.id,
    codigo: fila.code,
    descripcion: fila.description,
    codigoBarras: fila.barcode ?? '',
    categoria: fila.category ?? '',
    sublinea: fila.subline ?? '',
    laboratorio: fila.laboratory ?? '',
    presentacion: fila.presentation ?? '',
    unidadMedida: fila.unit_of_measure ?? '',
    afectacionIgv: fila.tax_affectation === 'por-definir' ? '' : fila.tax_affectation,
    costo: fila.cost === null ? '' : String(fila.cost),
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

function normalizarTerminoBusqueda(valor: string) {
  return valor
    .trim()
    .replace(/[\\%_(),*]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 100)
}

function construirFilaProducto(
  organizationId: string,
  userId: string,
  datos: DatosProducto,
) {
  return {
    organization_id: organizationId,
    code: datos.codigo.trim().toUpperCase(),
    description: datos.descripcion.trim(),
    barcode: textoONulo(datos.codigoBarras),
    category: textoONulo(datos.categoria),
    subline: textoONulo(datos.sublinea),
    laboratory: textoONulo(datos.laboratorio),
    presentation: textoONulo(datos.presentacion),
    unit_of_measure: textoONulo(datos.unidadMedida),
    tax_affectation: datos.afectacionIgv || 'por-definir',
    cost: datos.costo ? Number(datos.costo) : null,
    sale_price: datos.precioVenta ? Number(datos.precioVenta) : null,
    health_registry: textoONulo(datos.registroSanitario),
    batch_control: datos.controlLote,
    prescription_sale: datos.ventaReceta,
    is_active: datos.activo,
    updated_by: userId,
  }
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

export async function buscarProductos(
  organizationId: string,
  busqueda: string,
): Promise<Producto[]> {
  const termino = normalizarTerminoBusqueda(busqueda)
  if (!termino) return listarProductos(organizationId)

  const { data, error } = await supabase
    .from('products')
    .select(columnasProducto)
    .eq('organization_id', organizationId)
    .or(
      [
        'code',
        'description',
        'barcode',
        'category',
        'subline',
        'laboratory',
        'presentation',
        'unit_of_measure',
      ]
        .map((columna) => `${columna}.ilike.%${termino}%`)
        .join(','),
    )
    .order('code', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw new Error(mensajeError(error))
  return ((data ?? []) as ProductoFila[]).map(mapearProducto)
}

export async function crearProducto(
  organizationId: string,
  userId: string,
  datos: DatosProducto,
) {
  const { error } = await supabase
    .from('products')
    .insert({
      ...construirFilaProducto(organizationId, userId, datos),
      created_by: userId,
    })
  if (error) throw new Error(mensajeError(error))
}

export async function editarProducto(
  organizationId: string,
  userId: string,
  productoId: string,
  datos: DatosProducto,
) {
  const { error } = await supabase
    .from('products')
    .update(construirFilaProducto(organizationId, userId, datos))
    .eq('id', productoId)
    .eq('organization_id', organizationId)
  if (error) throw new Error(mensajeError(error))
}

export async function cambiarEstadoProducto(
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
