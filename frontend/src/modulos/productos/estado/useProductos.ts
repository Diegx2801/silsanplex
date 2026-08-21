import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type { DatosProducto, Producto } from '@/modulos/productos/modelo/producto'
import {
  cambiarEstadoProductoPersistente,
  guardarProductoPersistente,
  listarProductos,
} from '@/modulos/productos/servicios/productoService'

const productosVacios: Producto[] = []

export function useProductos() {
  const { access, user } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const queryKey = ['products', organizationId] as const
  const query = useQuery({
    queryKey,
    queryFn: () => listarProductos(organizationId),
    enabled: Boolean(organizationId),
  })
  const guardarMutation = useMutation({
    mutationFn: ({ datos, productoId }: { datos: DatosProducto; productoId?: string }) => {
      if (!user) throw new Error('La sesión ya no está disponible')
      return guardarProductoPersistente(organizationId, user.id, datos, productoId)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const estadoMutation = useMutation({
    mutationFn: (producto: Producto) => {
      if (!user) throw new Error('La sesión ya no está disponible')
      return cambiarEstadoProductoPersistente(organizationId, user.id, producto)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    productos: query.data ?? productosVacios,
    cargando: query.isLoading,
    error: query.error,
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
