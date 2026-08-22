import type { PostgrestError } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type {
  ConsultaProductos,
  ConsultaProductosPaginada,
  OpcionesProductos,
  OrdenProductos,
  ResultadoProductosPaginados,
} from '@/modulos/productos/modelo/consultaProductos'
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

interface OpcionProductoFila {
  category: string | null
  laboratory: string | null
}

const columnasProducto =
  'id,code,description,barcode,category,subline,laboratory,presentation,unit_of_measure,tax_affectation,cost,sale_price,health_registry,batch_control,prescription_sale,is_active' as const
const columnasOpcionesProducto = 'category,laboratory' as const
const tamanioPaginaMaximo = 50
const comparadorOpciones = new Intl.Collator('es-PE', {
  numeric: true,
  sensitivity: 'base',
})

const textoONulo = (valor: string) => valor.trim() || null

type ContextoError = 'consultar' | 'crear' | 'editar' | 'cambiarEstado'

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

function mensajeError(error: PostgrestError, contexto: ContextoError) {
  if (error.code === '23505') return 'Ya existe un producto con este código o código de barras'
  if (error.code === '42501') {
    return contexto === 'consultar'
      ? 'No tienes permiso para consultar productos'
      : 'No tienes permiso para administrar productos'
  }
  if (error.code === '23514') return 'Los datos del producto no cumplen las reglas del catálogo'

  return {
    consultar: 'No se pudo cargar el catálogo de productos',
    crear: 'No se pudo registrar el producto',
    editar: 'No se pudo actualizar el producto',
    cambiarEstado: 'No se pudo cambiar el estado del producto',
  }[contexto]
}

function normalizarTerminoBusqueda(valor: string) {
  return valor
    .trim()
    .replace(/[\\%_(),*]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 100)
}

function escaparPatronIlike(valor: string) {
  return valor.trim().replace(/[\\%_]/g, '\\$&')
}

function normalizarOpcion(valor: string) {
  return valor
    .trim()
    .toLocaleLowerCase('es-PE')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function obtenerOpcionesUnicas(valores: readonly (string | null)[]) {
  const opciones = new Map<string, string>()

  for (const valorOriginal of valores) {
    const valor = valorOriginal?.trim() ?? ''
    const clave = normalizarOpcion(valor)
    if (valor && !opciones.has(clave)) opciones.set(clave, valor)
  }

  return [...opciones.values()].toSorted(comparadorOpciones.compare)
}

function limitarEntero(valor: number, minimo: number, maximo: number) {
  if (!Number.isFinite(valor)) return minimo
  return Math.min(maximo, Math.max(minimo, Math.trunc(valor)))
}

function construirConsultaProductos(
  organizationId: string,
  consulta: ConsultaProductos,
  incluirConteo: boolean,
) {
  const seleccion = incluirConteo
    ? supabase
        .from('products')
        .select(columnasProducto, { count: 'exact' })
    : supabase.from('products').select(columnasProducto)

  let query = seleccion.eq('organization_id', organizationId)
  const termino = normalizarTerminoBusqueda(consulta.busqueda)

  if (consulta.estado === 'activos') query = query.eq('is_active', true)
  if (consulta.estado === 'inactivos') query = query.eq('is_active', false)
  if (consulta.categoria.trim()) {
    query = query.ilike('category', escaparPatronIlike(consulta.categoria))
  }
  if (consulta.laboratorio.trim()) {
    query = query.ilike('laboratory', escaparPatronIlike(consulta.laboratorio))
  }
  if (termino) {
    query = query.or(
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
  }

  switch (consulta.orden as OrdenProductos) {
    case 'codigo-desc':
      query = query.order('code', { ascending: false }).order('id', { ascending: true })
      break
    case 'descripcion-asc':
      query = query.order('description', { ascending: true }).order('id', { ascending: true })
      break
    case 'precio-asc':
      query = query
        .order('sale_price', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
      break
    case 'precio-desc':
      query = query
        .order('sale_price', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
      break
    case 'codigo-asc':
      query = query.order('code', { ascending: true }).order('id', { ascending: true })
      break
  }

  return query
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

  if (error) throw new Error(mensajeError(error, 'consultar'))
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

  if (error) throw new Error(mensajeError(error, 'consultar'))
  return ((data ?? []) as ProductoFila[]).map(mapearProducto)
}

export async function listarProductosPaginados(
  organizationId: string,
  consulta: ConsultaProductosPaginada,
): Promise<ResultadoProductosPaginados> {
  const pagina = limitarEntero(consulta.pagina, 1, Number.MAX_SAFE_INTEGER)
  const tamanioPagina = limitarEntero(consulta.tamanioPagina, 1, tamanioPaginaMaximo)
  const indiceInicial = (pagina - 1) * tamanioPagina

  const { data, error, count } = await construirConsultaProductos(
    organizationId,
    consulta,
    true,
  ).range(indiceInicial, indiceInicial + tamanioPagina - 1)

  if (error) throw new Error(mensajeError(error, 'consultar'))

  return {
    elementos: ((data ?? []) as ProductoFila[]).map(mapearProducto),
    totalFiltrado: count ?? 0,
  }
}

export async function listarProductosFiltrados(
  organizationId: string,
  consulta: ConsultaProductos,
): Promise<Producto[]> {
  const { data, error } = await construirConsultaProductos(
    organizationId,
    consulta,
    false,
  )

  if (error) throw new Error(mensajeError(error, 'consultar'))
  return ((data ?? []) as ProductoFila[]).map(mapearProducto)
}

export async function contarProductos(organizationId: string): Promise<number> {
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)

  if (error) throw new Error(mensajeError(error, 'consultar'))
  return count ?? 0
}

export async function listarOpcionesProductos(
  organizationId: string,
): Promise<OpcionesProductos> {
  const { data, error } = await supabase
    .from('product_catalog_options')
    .select(columnasOpcionesProducto)
    .eq('organization_id', organizationId)
    .order('category', { ascending: true })
    .order('laboratory', { ascending: true })

  if (error) throw new Error(mensajeError(error, 'consultar'))

  const filas = (data ?? []) as OpcionProductoFila[]
  return {
    categorias: obtenerOpcionesUnicas(filas.map((fila) => fila.category)),
    laboratorios: obtenerOpcionesUnicas(filas.map((fila) => fila.laboratory)),
  }
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
  if (error) throw new Error(mensajeError(error, 'crear'))
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
  if (error) throw new Error(mensajeError(error, 'editar'))
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
  if (error) throw new Error(mensajeError(error, 'cambiarEstado'))
}
