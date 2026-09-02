import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { listarVentasPersistentes } from '@/modulos/ventas/servicios/ventasService'

export function useVentasPersistentes() {
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const query = useQuery({
    queryKey: ['sales', organizationId],
    queryFn: () => listarVentasPersistentes(organizationId),
    enabled: Boolean(organizationId),
  })

  return {
    ventas: query.data ?? [],
    cargando: query.isLoading,
    error: query.error,
    reintentar: query.refetch,
  }
}
