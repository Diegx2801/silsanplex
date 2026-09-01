import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { listarPedidosPersistentes } from '@/modulos/ventas/servicios/ventasService'

export function usePedidosPersistentes() {
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const query = useQuery({
    queryKey: ['sales-orders', organizationId],
    queryFn: () => listarPedidosPersistentes(organizationId),
    enabled: Boolean(organizationId),
  })

  return {
    pedidos: query.data ?? [],
    cargando: query.isLoading,
    error: query.error,
    reintentar: query.refetch,
  }
}
