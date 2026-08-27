import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { obtenerDetalleReparacion } from '@/modulos/reparaciones/servicios/reparacionesService'

export function useReparacionDetalle(
  reparacionId: string | null,
  habilitado: boolean,
) {
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const query = useQuery({
    queryKey: ['repair-detail', organizationId, reparacionId],
    queryFn: () => obtenerDetalleReparacion(organizationId, reparacionId ?? ''),
    enabled: habilitado && Boolean(organizationId && reparacionId),
    staleTime: 15_000,
  })

  return {
    detalle: query.data,
    cargando: query.isLoading,
    error: query.error,
    reintentar: query.refetch,
  }
}
