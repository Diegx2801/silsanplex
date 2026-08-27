import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type {
  ConsultaProductos,
  ResultadoProductosPaginados,
} from '@/modulos/productos/modelo/consultaProductos'
import type { DatosProducto, Producto } from '@/modulos/productos/modelo/producto'
import {
  buscarProductos as buscarProductosEnSupabase,
  cambiarEstadoProducto,
  contarProductos,
  crearProducto,
  editarProducto,
  listarOpcionesProductos,
  listarUnidadesMedida,
  listarProductosFiltrados,
  listarProductosPaginados,
  listarProductos,
} from '@/modulos/productos/servicios/productosService'

const productosVacios: Producto[] = []
const opcionesVacias = { categorias: [], laboratorios: [] }

interface ConfiguracionConsultaProductos {
  consulta?: ConsultaProductos
  pagina?: number
  tamanioPagina?: number
}

export function useProductos(
  busqueda = '',
  configuracion: ConfiguracionConsultaProductos = {},
) {
  const { access, user } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const terminoBusqueda = busqueda.trim()
  const consultaPaginada = configuracion.consulta
  const pagina = configuracion.pagina ?? 1
  const tamanioPagina = configuracion.tamanioPagina ?? 10
  const productosQueryKey = ['products', organizationId] as const
  const queryKey = consultaPaginada
    ? [...productosQueryKey, 'pagina', consultaPaginada, pagina, tamanioPagina]
    : [...productosQueryKey, terminoBusqueda]
  const query = useQuery({
    queryKey,
    queryFn: (): Promise<Producto[] | ResultadoProductosPaginados> => {
      if (consultaPaginada) {
        return listarProductosPaginados(organizationId, {
          ...consultaPaginada,
          pagina,
          tamanioPagina,
        })
      }

      return terminoBusqueda
        ? buscarProductosEnSupabase(organizationId, terminoBusqueda)
        : listarProductos(organizationId)
    },
    enabled: Boolean(organizationId),
  })
  const totalQuery = useQuery({
    queryKey: [...productosQueryKey, 'total'],
    queryFn: () => contarProductos(organizationId),
    enabled: Boolean(organizationId) && Boolean(consultaPaginada),
    staleTime: 30_000,
  })
  const opcionesQuery = useQuery({
    queryKey: [...productosQueryKey, 'opciones'],
    queryFn: () => listarOpcionesProductos(organizationId),
    enabled: Boolean(organizationId) && Boolean(consultaPaginada),
    staleTime: 5 * 60_000,
  })
  const unidadesQuery = useQuery({
    queryKey: [...productosQueryKey, 'unidades-medida'],
    queryFn: () => listarUnidadesMedida(organizationId),
    enabled: Boolean(organizationId) && Boolean(consultaPaginada),
    staleTime: 30 * 60_000,
  })
  const guardarMutation = useMutation({
    mutationFn: ({ datos, productoId }: { datos: DatosProducto; productoId?: string }) => {
      if (!user) throw new Error('La sesión ya no está disponible')
      return productoId
        ? editarProducto(organizationId, user.id, productoId, datos)
        : crearProducto(organizationId, user.id, datos)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: productosQueryKey }),
  })
  const estadoMutation = useMutation({
    mutationFn: (producto: Producto) => {
      if (!user) throw new Error('La sesión ya no está disponible')
      return cambiarEstadoProducto(organizationId, user.id, producto)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: productosQueryKey }),
  })

  const data = query.data
  const productos = Array.isArray(data)
    ? data
    : data?.elementos ?? productosVacios
  const totalFiltrado = Array.isArray(data)
    ? data.length
    : data?.totalFiltrado ?? 0
  const reintentar = async () => {
    await query.refetch()
    if (consultaPaginada) {
      await Promise.all([totalQuery.refetch(), opcionesQuery.refetch(), unidadesQuery.refetch()])
    }
  }

  return {
    productos,
    totalFiltrado,
    totalProductos: consultaPaginada
      ? totalQuery.data ?? totalFiltrado
      : productos.length,
    categorias: opcionesQuery.data?.categorias ?? opcionesVacias.categorias,
    laboratorios:
      opcionesQuery.data?.laboratorios ?? opcionesVacias.laboratorios,
    unidadesMedida: unidadesQuery.data ?? [],
    cargando:
      query.isLoading ||
      (Boolean(consultaPaginada) &&
        (totalQuery.isLoading || opcionesQuery.isLoading || unidadesQuery.isLoading)),
    error: query.error ?? totalQuery.error ?? opcionesQuery.error ?? unidadesQuery.error,
    reintentar,
    guardando: guardarMutation.isPending,
    cambiandoEstado: estadoMutation.isPending,
    buscarProductos: (busqueda: string) =>
      buscarProductosEnSupabase(organizationId, busqueda),
    exportarProductos: (consulta: ConsultaProductos) =>
      listarProductosFiltrados(organizationId, consulta),
    guardarProducto: async (datos: DatosProducto, productoId?: string) => {
      try {
        await guardarMutation.mutateAsync({ datos, productoId })
        return undefined
      } catch (error) {
        return error instanceof Error ? error.message : 'No se pudo guardar el producto'
      }
    },
    cambiarEstado: async (producto: Producto) => {
      try {
        await estadoMutation.mutateAsync(producto)
        return undefined
      } catch (error) {
        return error instanceof Error ? error.message : 'No se pudo cambiar el estado'
      }
    },
  }
}
