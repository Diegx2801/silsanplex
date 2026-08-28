import type { PostgrestError } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type {
  ConsultaProductos,
  ConsultaProductosPaginada,
  OpcionesProductos,
  OrdenProductos,
  ResultadoProductosPaginados,
} from '@/modulos/productos/modelo/consultaProductos'
import type {
  DatosImportacionProductos,
  FilaImportacionRechazada,
  ResultadoImportacionPersistida,
  ModoImportacionProductos,
} from '@/modulos/productos/modelo/analisisImportacion'
import type {
  ArchivoProducto,
  DatosProducto,
  Producto,
  TipoArchivoProducto,
  TipoEventoProducto,
  UnidadMedida,
  VersionProducto,
} from '@/modulos/productos/modelo/producto'

interface ProductoFila {
  id: string
  code: string
  description: string
  extended_description: string | null
  barcode: string | null
  category: string | null
  subline: string | null
  laboratory: string | null
  presentation: string | null
  unit_of_measure: string | null
  product_type: 'good' | 'service'
  base_unit_id: string
  product_unit_conversions: Array<{
    id: string
    unit_id: string
    conversion_factor: number
    barcode: string | null
    sale_price: number | null
    measurement_units: Array<{ name: string }> | null
  }> | null
  tax_affectation: 'por-definir' | 'gravado' | 'exonerado' | 'inafecto'
  cost: number | null
  sale_price: number | null
  minimum_sale_price: number | null
  maximum_stock: number | null
  width_cm: number | null
  height_cm: number | null
  length_cm: number | null
  weight_kg: number | null
  health_registry: string | null
  batch_control: boolean
  expiration_control: boolean
  prescription_sale: boolean
  is_active: boolean
}

interface ArchivoProductoFila {
  id: string
  kind: TipoArchivoProducto
  storage_path: string
  file_name: string
  mime_type: string
  byte_size: number
  description: string | null
  is_primary: boolean
  sort_order: number
  created_at: string
}

interface VersionProductoFila {
  id: number
  version_number: number
  event_type: TipoEventoProducto
  summary: string
  snapshot: ProductoFila
  changes: Record<string, { before?: unknown; after?: unknown }>
  actor_user_id: string | null
  created_at: string
}

interface OpcionProductoFila {
  category: string | null
  laboratory: string | null
}

const columnasProducto =
  'id,code,description,extended_description,barcode,category,subline,laboratory,presentation,unit_of_measure,product_type,base_unit_id,product_unit_conversions(id,unit_id,conversion_factor,barcode,sale_price,measurement_units(name)),tax_affectation,cost,sale_price,minimum_sale_price,maximum_stock,width_cm,height_cm,length_cm,weight_kg,health_registry,batch_control,expiration_control,prescription_sale,is_active' as const
const columnasOpcionesProducto = 'category,laboratory' as const
const tamanioPaginaMaximo = 50
const comparadorOpciones = new Intl.Collator('es-PE', {
  numeric: true,
  sensitivity: 'base',
})

const textoONulo = (valor: string) => valor.trim() || null
const numeroONulo = (valor: string) => (valor ? Number(valor) : null)

type ContextoError =
  | 'consultar'
  | 'crear'
  | 'editar'
  | 'cambiarEstado'
  | 'importar'

function mapearProducto(fila: ProductoFila): Producto {
  return {
    id: fila.id,
    codigo: fila.code,
    descripcion: fila.description,
    descripcionAmpliada: fila.extended_description ?? '',
    codigoBarras: fila.barcode ?? '',
    categoria: fila.category ?? '',
    sublinea: fila.subline ?? '',
    laboratorio: fila.laboratory ?? '',
    presentacion: fila.presentation ?? '',
    tipo: fila.product_type,
    unidadBaseId: fila.base_unit_id,
    unidadMedida: fila.unit_of_measure ?? '',
    afectacionIgv: fila.tax_affectation === 'por-definir' ? '' : fila.tax_affectation,
    costo: fila.cost === null ? '' : String(fila.cost),
    precioVenta: fila.sale_price === null ? '' : String(fila.sale_price),
    precioMinimo:
      fila.minimum_sale_price === null ? '' : String(fila.minimum_sale_price),
    stockMaximo: fila.maximum_stock === null ? '' : String(fila.maximum_stock),
    anchoCm: fila.width_cm === null ? '' : String(fila.width_cm),
    altoCm: fila.height_cm === null ? '' : String(fila.height_cm),
    largoCm: fila.length_cm === null ? '' : String(fila.length_cm),
    pesoKg: fila.weight_kg === null ? '' : String(fila.weight_kg),
    registroSanitario: fila.health_registry ?? '',
    controlLote: fila.batch_control,
    controlVencimiento: fila.expiration_control,
    ventaReceta: fila.prescription_sale,
    activo: fila.is_active,
    unidadesAlternativas: (fila.product_unit_conversions ?? []).map((unidad) => {
      const relacion = unidad.measurement_units as unknown
      const unidadRelacionada = Array.isArray(relacion)
        ? relacion[0] as { name?: string } | undefined
        : relacion as { name?: string } | null
      return {
        id: unidad.id,
        unidadId: unidad.unit_id,
        unidadNombre: unidadRelacionada?.name ?? '',
        equivalencia: String(unidad.conversion_factor),
        codigoBarras: unidad.barcode ?? '',
        precioVenta: unidad.sale_price === null ? '' : String(unidad.sale_price),
      }
    }),
  }
}

function mensajeError(error: PostgrestError, contexto: ContextoError) {
  if (error.code === '23505') return 'Ya existe un producto con este código o código de barras'
  if (error.code === '42501') {
    return contexto === 'consultar'
      ? 'No tienes permiso para consultar productos'
      : 'No tienes permiso para administrar productos'
  }
  if (
    error.code === 'P0001' &&
    error.message === 'PRODUCT_IMPORT_INVALID_PAYLOAD'
  ) {
    return 'La carga de importación no tiene un formato válido'
  }
  if (error.code === '23514') return 'Los datos del producto no cumplen las reglas del catálogo'

  return {
    consultar: 'No se pudo cargar el catálogo de productos',
    crear: 'No se pudo registrar el producto',
    editar: 'No se pudo actualizar el producto',
    cambiarEstado: 'No se pudo cambiar el estado del producto',
    importar: 'No se pudo importar el catálogo de productos',
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
        'extended_description',
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

function construirPayloadProducto(datos: DatosProducto) {
  return {
    code: datos.codigo.trim().toUpperCase(),
    description: datos.descripcion.trim(),
    extended_description: textoONulo(datos.descripcionAmpliada),
    barcode: textoONulo(datos.codigoBarras),
    category: textoONulo(datos.categoria),
    subline: textoONulo(datos.sublinea),
    laboratory: textoONulo(datos.laboratorio),
    presentation: textoONulo(datos.presentacion),
    product_type: datos.tipo,
    base_unit_id: datos.unidadBaseId,
    tax_affectation: datos.afectacionIgv || 'por-definir',
    cost: numeroONulo(datos.costo),
    sale_price: numeroONulo(datos.precioVenta),
    minimum_sale_price: numeroONulo(datos.precioMinimo),
    maximum_stock: numeroONulo(datos.stockMaximo),
    width_cm: numeroONulo(datos.anchoCm),
    height_cm: numeroONulo(datos.altoCm),
    length_cm: numeroONulo(datos.largoCm),
    weight_kg: numeroONulo(datos.pesoKg),
    health_registry: textoONulo(datos.registroSanitario),
    batch_control: datos.controlLote,
    expiration_control: datos.controlVencimiento,
    prescription_sale: datos.ventaReceta,
    is_active: datos.activo,
    alternate_units: datos.unidadesAlternativas.map((unidad) => ({
      unit_id: unidad.unidadId,
      conversion_factor: unidad.equivalencia,
      barcode: unidad.codigoBarras.trim(),
      sale_price: unidad.precioVenta,
    })),
  }
}

export async function listarUnidadesMedida(organizationId: string): Promise<UnidadMedida[]> {
  const { data, error } = await supabase
    .from('measurement_units')
    .select('id,code,name')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw new Error(mensajeError(error, 'consultar'))
  return (data ?? []).map((unidad) => ({ id: unidad.id, codigo: unidad.code, nombre: unidad.name }))
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
        'extended_description',
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

  const productos = ((data ?? []) as ProductoFila[]).map(mapearProducto)

  return {
    elementos: await adjuntarMiniaturas(organizationId, productos),
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

function construirPayloadImportacion(datos: DatosImportacionProductos) {
  return {
    productos: datos.productos.map((fila) => ({
      fila: fila.fila,
      codigo: fila.codigo,
      descripcion: fila.descripcion,
      categoria: fila.categoria,
      sublinea: fila.sublinea,
      laboratorio: fila.laboratorio,
      descripcion_ampliada: fila.descripcionAmpliada,
      codigo_barras: fila.codigoBarras,
      presentacion: fila.presentacion,
      registro_sanitario: fila.registroSanitario,
      stock_maximo: fila.stockMaximo,
      ancho_cm: fila.anchoCm,
      alto_cm: fila.altoCm,
      largo_cm: fila.largoCm,
      peso_kg: fila.pesoKg,
      control_lote: fila.controlLote,
      control_vencimiento: fila.controlVencimiento,
      venta_receta: fila.ventaReceta,
    })),
    precios: datos.precios.map((fila) => ({
      fila: fila.fila,
      codigo_producto: fila.codigoProducto,
      producto: fila.producto,
      unidad_medida: fila.unidadMedida,
      precio_venta: fila.precioVenta,
      inc_igv: fila.incIgv,
      costo_base: fila.costoBase,
      precio_minimo: fila.precioMinimo,
      equivalencia: fila.equivalencia,
      codigo_barras: fila.codigoBarras,
    })),
  }
}

interface RespuestaImportacion {
  estado: 'completado' | 'parcial' | 'rechazado'
  hash: string
  id_lote: string
  creados: number
  actualizados: number
  omitidos: number
  fallidos: number
  sin_cambios: number
  filas_rechazadas: FilaImportacionRechazada[]
}

export async function importarProductos(
  organizationId: string,
  datos: DatosImportacionProductos,
  modo: ModoImportacionProductos = 'SKIP',
): Promise<ResultadoImportacionPersistida> {
  const { data, error } = await supabase.rpc('import_products_partial', {
    requested_organization_id: organizationId,
    payload: { ...construirPayloadImportacion(datos), modo },
  })

  if (error) throw new Error(mensajeError(error, 'importar'))
  if (!data) throw new Error(mensajeError({ code: 'XX000' } as PostgrestError, 'importar'))

  const resultado = data as RespuestaImportacion
  return {
    estado: resultado.estado,
    hash: resultado.hash,
    idLote: resultado.id_lote,
    creados: resultado.creados,
    actualizados: resultado.actualizados ?? 0,
    omitidos: resultado.omitidos ?? 0,
    fallidos: resultado.fallidos ?? 0,
    sinCambios: resultado.sin_cambios,
    filasRechazadas: Array.isArray(resultado.filas_rechazadas)
      ? resultado.filas_rechazadas
      : [],
  }
}

export async function crearProducto(
  organizationId: string,
  _userId: string,
  datos: DatosProducto,
) {
  const { data, error } = await supabase.rpc('save_product_catalog', {
    requested_organization_id: organizationId,
    requested_product_id: null,
    payload: construirPayloadProducto(datos),
  })
  if (error) throw new Error(mensajeError(error, 'crear'))
  if (!data) throw new Error('El producto se guardó sin devolver un identificador válido')
  return data as string
}

export async function consultarCodigosProductosExistentes(
  organizationId: string,
  codigos: string[],
) {
  const existentes = new Set<string>()
  for (let inicio = 0; inicio < codigos.length; inicio += 100) {
    const lote = codigos.slice(inicio, inicio + 100)
    if (!lote.length) continue
    const { data, error } = await supabase
      .from('products')
      .select('code')
      .eq('organization_id', organizationId)
      .in('code', lote)
    if (error) throw new Error(mensajeError(error, 'consultar'))
    for (const fila of data ?? []) existentes.add(String(fila.code).toUpperCase())
  }
  return existentes
}

export async function editarProducto(
  organizationId: string,
  _userId: string,
  productoId: string,
  datos: DatosProducto,
) {
  const { data, error } = await supabase.rpc('save_product_catalog', {
    requested_organization_id: organizationId,
    requested_product_id: productoId,
    payload: construirPayloadProducto(datos),
  })
  if (error) throw new Error(mensajeError(error, 'editar'))
  if (!data) throw new Error('El producto se actualizó sin devolver un identificador válido')
  return data as string
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

const bucketArchivosProducto = 'product-files'
const bytesImagenMaximo = 5 * 1024 * 1024
const bytesArchivoMaximo = 6 * 1024 * 1024
const mimeImagen = new Set(['image/jpeg', 'image/png', 'image/webp'])
const mimeDocumento = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
])

function nombreSeguroArchivo(nombre: string) {
  const partes = nombre.trim().split('.')
  const extension = partes.length > 1 ? `.${partes.pop()?.toLowerCase()}` : ''
  const base = partes
    .join('.')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'archivo'

  return `${base}${extension.slice(0, 12)}`
}

function validarArchivoProducto(archivo: File, tipo: TipoArchivoProducto) {
  const limite = tipo === 'image' ? bytesImagenMaximo : bytesArchivoMaximo
  const tiposPermitidos = tipo === 'image' ? mimeImagen : mimeDocumento

  if (!archivo.size || archivo.size > limite) {
    throw new Error(
      tipo === 'image'
        ? 'La imagen debe pesar como máximo 5 MB'
        : 'El archivo debe pesar como máximo 6 MB',
    )
  }
  if (!tiposPermitidos.has(archivo.type)) {
    throw new Error(
      tipo === 'image'
        ? 'Usa una imagen JPG, PNG o WebP'
        : 'Usa un archivo PDF, Word, Excel o texto',
    )
  }
}

interface MiniaturaProductoFila {
  product_id: string
  storage_path: string
  is_primary: boolean
  sort_order: number
}

async function adjuntarMiniaturas(
  organizationId: string,
  productos: Producto[],
) {
  if (!productos.length) return productos

  const { data, error } = await supabase
    .from('product_files')
    .select('product_id,storage_path,is_primary,sort_order')
    .eq('organization_id', organizationId)
    .in('product_id', productos.map((producto) => producto.id))
    .eq('kind', 'image')
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return productos

  const primeraPorProducto = new Map<string, MiniaturaProductoFila>()
  for (const fila of (data ?? []) as MiniaturaProductoFila[]) {
    if (
      fila.product_id &&
      fila.storage_path &&
      !primeraPorProducto.has(fila.product_id)
    ) {
      primeraPorProducto.set(fila.product_id, fila)
    }
  }

  const miniaturas = [...primeraPorProducto.values()]
  if (!miniaturas.length) return productos

  const { data: firmas, error: errorFirmas } = await supabase.storage
    .from(bucketArchivosProducto)
    .createSignedUrls(
      miniaturas.map((miniatura) => miniatura.storage_path),
      15 * 60,
    )

  if (errorFirmas) return productos

  const urlPorProducto = new Map<string, string>()
  miniaturas.forEach((miniatura, indice) => {
    const url = firmas?.[indice]?.signedUrl
    if (url) urlPorProducto.set(miniatura.product_id, url)
  })

  return productos.map((producto) => ({
    ...producto,
    miniaturaUrl: urlPorProducto.get(producto.id),
  }))
}

export async function listarArchivosProducto(
  organizationId: string,
  productoId: string,
): Promise<ArchivoProducto[]> {
  const { data, error } = await supabase
    .from('product_files')
    .select(
      'id,kind,storage_path,file_name,mime_type,byte_size,description,is_primary,sort_order,created_at',
    )
    .eq('organization_id', organizationId)
    .eq('product_id', productoId)
    .is('deleted_at', null)
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error('No se pudieron cargar los archivos del producto')

  return Promise.all(
    ((data ?? []) as ArchivoProductoFila[]).map(async (fila) => {
      const { data: firma, error: errorFirma } = await supabase.storage
        .from(bucketArchivosProducto)
        .createSignedUrl(fila.storage_path, 15 * 60)

      if (errorFirma) throw new Error('No se pudo preparar un archivo para consulta')

      return {
        id: fila.id,
        ruta: fila.storage_path,
        tipo: fila.kind,
        nombre: fila.file_name,
        mimeType: fila.mime_type,
        bytes: fila.byte_size,
        descripcion: fila.description ?? '',
        principal: fila.is_primary,
        orden: fila.sort_order ?? 0,
        creadoEn: fila.created_at,
        url: firma.signedUrl,
      }
    }),
  )
}

interface NuevoArchivoProducto {
  archivo: File
  tipo: TipoArchivoProducto
  descripcion?: string
}

export async function subirArchivoProducto(
  organizationId: string,
  productoId: string,
  userId: string,
  datos: NuevoArchivoProducto,
) {
  validarArchivoProducto(datos.archivo, datos.tipo)
  const ruta = `${organizationId}/${productoId}/${crypto.randomUUID()}-${nombreSeguroArchivo(datos.archivo.name)}`
  const { error: errorCarga } = await supabase.storage
    .from(bucketArchivosProducto)
    .upload(ruta, datos.archivo, {
      cacheControl: '3600',
      contentType: datos.archivo.type,
      upsert: false,
    })

  if (errorCarga) throw new Error('No se pudo cargar el archivo')

  const { error: errorMetadata } = await supabase.from('product_files').insert({
    organization_id: organizationId,
    product_id: productoId,
    kind: datos.tipo,
    storage_path: ruta,
    file_name: datos.archivo.name.slice(0, 180),
    mime_type: datos.archivo.type,
    byte_size: datos.archivo.size,
    description: textoONulo(datos.descripcion ?? ''),
    created_by: userId,
  })

  if (errorMetadata) {
    await supabase.storage.from(bucketArchivosProducto).remove([ruta])
    throw new Error('El archivo se cargó, pero no pudo vincularse al producto')
  }
}

export async function retirarArchivoProducto(
  organizationId: string,
  productoId: string,
  archivo: ArchivoProducto,
) {
  const { error: errorStorage } = await supabase.storage
    .from(bucketArchivosProducto)
    .remove([archivo.ruta])

  if (errorStorage) throw new Error('No se pudo retirar el archivo del almacenamiento')

  const { error } = await supabase
    .from('product_files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', archivo.id)
    .eq('product_id', productoId)
    .eq('organization_id', organizationId)

  if (error) throw new Error('El archivo fue retirado, pero no se pudo actualizar su historial')
}

export async function actualizarDescripcionArchivoProducto(
  organizationId: string,
  productoId: string,
  archivoId: string,
  descripcion: string,
) {
  const { error } = await supabase.rpc('update_product_file_description', {
    requested_organization_id: organizationId,
    requested_product_id: productoId,
    requested_file_id: archivoId,
    requested_description: descripcion,
  })

  if (error) throw new Error('No se pudo actualizar la descripción del archivo')
}

export async function organizarImagenesProducto(
  organizationId: string,
  productoId: string,
  imagenes: readonly ArchivoProducto[],
  principalId: string,
) {
  const { error } = await supabase.rpc('organize_product_images', {
    requested_organization_id: organizationId,
    requested_product_id: productoId,
    ordered_image_ids: imagenes.map((imagen) => imagen.id),
    primary_image_id: principalId,
  })

  if (error) throw new Error('No se pudo guardar el orden de las imágenes')
}

export async function restaurarVersionProducto(
  organizationId: string,
  productoId: string,
  versionNumero: number,
) {
  const { error } = await supabase.rpc('restore_product_version', {
    requested_organization_id: organizationId,
    requested_product_id: productoId,
    requested_version_number: versionNumero,
  })

  if (error?.code === '23505') {
    throw new Error(
      'No se puede restaurar porque el código o código de barras ya está en uso',
    )
  }
  if (error) throw new Error('No se pudo restaurar la versión seleccionada')
}

export async function listarVersionesProducto(
  organizationId: string,
  productoId: string,
): Promise<VersionProducto[]> {
  const { data, error } = await supabase
    .from('product_versions')
    .select('id,version_number,event_type,summary,snapshot,changes,actor_user_id,created_at')
    .eq('organization_id', organizationId)
    .eq('product_id', productoId)
    .order('version_number', { ascending: false })
    .limit(50)

  if (error) throw new Error('No se pudo cargar el historial del producto')

  return ((data ?? []) as VersionProductoFila[]).map((fila) => ({
    id: fila.id,
    numero: fila.version_number,
    tipo: fila.event_type,
    resumen: fila.summary,
    cambios: fila.changes ?? {},
    actorId: fila.actor_user_id,
    creadoEn: fila.created_at,
    snapshot: mapearProducto(fila.snapshot),
  }))
}
