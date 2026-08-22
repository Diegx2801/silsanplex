import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type { DatosProducto, Producto } from '@/modulos/productos/modelo/producto'
import {
  buscarProductos as buscarProductosEnSupabase,
  cambiarEstadoProducto,
  crearProducto,
  editarProducto,
  listarProductos,
} from '@/modulos/productos/servicios/productosService'

const productosVacios: Producto[] = []

export function useProductos(busqueda = '') {
  const { access, user } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const terminoBusqueda = busqueda.trim()
  const queryKey = ['products', organizationId, terminoBusqueda] as const
  const query = useQuery({
    queryKey,
    queryFn: () =>
      terminoBusqueda
        ? buscarProductosEnSupabase(organizationId, terminoBusqueda)
        : listarProductos(organizationId),
    enabled: Boolean(organizationId),
  })
  const guardarMutation = useMutation({
    mutationFn: ({ datos, productoId }: { datos: DatosProducto; productoId?: string }) => {
      if (!user) throw new Error('La sesión ya no está disponible')
      return productoId
        ? editarProducto(organizationId, user.id, productoId, datos)
        : crearProducto(organizationId, user.id, datos)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const estadoMutation = useMutation({
    mutationFn: (producto: Producto) => {
      if (!user) throw new Error('La sesión ya no está disponible')
      return cambiarEstadoProducto(organizationId, user.id, producto)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    productos: query.data ?? productosVacios,
    cargando: query.isLoading,
    error: query.error,
    reintentar: query.refetch,
    guardando: guardarMutation.isPending,
    cambiandoEstado: estadoMutation.isPending,
    buscarProductos: (busqueda: string) =>
      buscarProductosEnSupabase(organizationId, busqueda),
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
