import type { Producto } from './producto'

export type FiltroEstadoProducto = 'todos' | 'activos' | 'inactivos'
export type OrdenProductos =
  | 'codigo-asc'
  | 'codigo-desc'
  | 'descripcion-asc'
  | 'precio-asc'
  | 'precio-desc'

export interface ConsultaProductos {
  busqueda: string
  estado: FiltroEstadoProducto
  categoria: string
  laboratorio: string
  orden: OrdenProductos
}

export interface PaginaProductos {
  elementos: Producto[]
  inicio: number
  fin: number
  pagina: number
  totalPaginas: number
}

const comparadorTexto = new Intl.Collator('es-PE', {
  numeric: true,
  sensitivity: 'base',
})

function normalizar(valor: string) {
  return valor
    .trim()
    .toLocaleLowerCase('es-PE')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function compararPrecios(
  primerPrecio: string,
  segundoPrecio: string,
  direccion: 'asc' | 'desc',
) {
  if (!primerPrecio && !segundoPrecio) return 0
  if (!primerPrecio) return 1
  if (!segundoPrecio) return -1

  const diferencia = Number(primerPrecio) - Number(segundoPrecio)
  return direccion === 'asc' ? diferencia : -diferencia
}

function ordenarProductos(
  primerProducto: Producto,
  segundoProducto: Producto,
  orden: OrdenProductos,
) {
  switch (orden) {
    case 'codigo-desc':
      return comparadorTexto.compare(
        segundoProducto.codigo,
        primerProducto.codigo,
      )
    case 'descripcion-asc':
      return comparadorTexto.compare(
        primerProducto.descripcion,
        segundoProducto.descripcion,
      )
    case 'precio-asc':
      return compararPrecios(
        primerProducto.precioVenta,
        segundoProducto.precioVenta,
        'asc',
      )
    case 'precio-desc':
      return compararPrecios(
        primerProducto.precioVenta,
        segundoProducto.precioVenta,
        'desc',
      )
    case 'codigo-asc':
      return comparadorTexto.compare(
        primerProducto.codigo,
        segundoProducto.codigo,
      )
  }
}

export function consultarProductos(
  productos: readonly Producto[],
  consulta: ConsultaProductos,
) {
  const termino = normalizar(consulta.busqueda)
  const categoria = normalizar(consulta.categoria)
  const laboratorio = normalizar(consulta.laboratorio)

  return productos
    .filter((producto) => {
      const coincideEstado =
        consulta.estado === 'todos' ||
        (consulta.estado === 'activos' && producto.activo) ||
        (consulta.estado === 'inactivos' && !producto.activo)
      const coincideCategoria =
        !categoria || normalizar(producto.categoria) === categoria
      const coincideLaboratorio =
        !laboratorio || normalizar(producto.laboratorio) === laboratorio
      const coincideBusqueda =
        !termino ||
        [
          producto.codigo,
          producto.codigoBarras,
          producto.descripcion,
          producto.categoria,
          producto.sublinea ?? '',
          producto.laboratorio,
          producto.unidadMedida,
        ].some((valor) => normalizar(valor).includes(termino))

      return (
        coincideEstado &&
        coincideCategoria &&
        coincideLaboratorio &&
        coincideBusqueda
      )
    })
    .toSorted((primerProducto, segundoProducto) =>
      ordenarProductos(primerProducto, segundoProducto, consulta.orden),
    )
}

export function obtenerOpcionesProducto(
  productos: readonly Producto[],
  campo: 'categoria' | 'laboratorio',
) {
  const opciones = new Map<string, string>()

  for (const producto of productos) {
    const valor = producto[campo].trim()
    const clave = normalizar(valor)
    if (valor && !opciones.has(clave)) opciones.set(clave, valor)
  }

  return [...opciones.values()].toSorted(comparadorTexto.compare)
}

export function paginarProductos(
  productos: readonly Producto[],
  paginaSolicitada: number,
  tamanioPagina: number,
): PaginaProductos {
  const tamanioValido = Math.max(1, Math.trunc(tamanioPagina))
  const totalPaginas = Math.max(1, Math.ceil(productos.length / tamanioValido))
  const pagina = Math.min(
    totalPaginas,
    Math.max(1, Math.trunc(paginaSolicitada)),
  )
  const indiceInicial = (pagina - 1) * tamanioValido
  const elementos = productos.slice(indiceInicial, indiceInicial + tamanioValido)

  return {
    elementos,
    inicio: elementos.length ? indiceInicial + 1 : 0,
    fin: indiceInicial + elementos.length,
    pagina,
    totalPaginas,
  }
}
