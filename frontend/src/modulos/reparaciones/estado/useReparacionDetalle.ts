import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import {
  obtenerDetalleReparacion,
  obtenerLineasCotizacionReparacion,
} from '@/modulos/reparaciones/servicios/reparacionesService'

export function useReparacionDetalle(
  reparacionId: string | null,
  habilitado: boolean,
) {
  const { access } = useAuth()
  const queryClient = useQueryClient()
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
    cargarLineasCotizacion: (cotizacionId: string) => queryClient.fetchQuery({
      queryKey: ['repair-quote-lines', organizationId, cotizacionId],
      queryFn: () => obtenerLineasCotizacionReparacion(organizationId, cotizacionId),
      staleTime: 15_000,
    }),
  }
}
