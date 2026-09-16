import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import type { Producto } from '@/modulos/productos/modelo/producto'
import type { DatosCotizacion } from '@/modulos/ventas/modelo/cotizacion'
import {
  emitirCotizacionPersistente,
  guardarCotizacionPersistente,
  listarCotizacionesPersistentes,
} from '@/modulos/ventas/servicios/cotizacionesService'

export const cotizacionesQueryKeys = {
  all: (organizationId: string) => ['sales-quotes', organizationId] as const,
}

export function useCotizacionesPersistentes(
  clientes: readonly Cliente[],
  productos: readonly Producto[],
) {
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const queryKey = cotizacionesQueryKeys.all(organizationId)
  const consulta = useQuery({
    queryKey,
    queryFn: () => listarCotizacionesPersistentes(organizationId),
    enabled: Boolean(organizationId),
  })

  const guardarMutation = useMutation({
    mutationFn: ({ datos, cotizacionId }: { datos: DatosCotizacion; cotizacionId?: string }) =>
      guardarCotizacionPersistente(organizationId, datos, clientes, productos, cotizacionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const emitirMutation = useMutation({
    mutationFn: (cotizacionId: string) => emitirCotizacionPersistente(organizationId, cotizacionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const guardarCotizacion = async (datos: DatosCotizacion, cotizacionId?: string) => {
    try {
      await guardarMutation.mutateAsync({ datos, cotizacionId })
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo guardar la cotización'
    }
  }

  const emitirCotizacion = async (cotizacionId: string) => {
    try {
      await emitirMutation.mutateAsync(cotizacionId)
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo emitir la cotización'
    }
  }

  return {
    cotizaciones: consulta.data ?? [],
    guardarCotizacion,
    emitirCotizacion,
    cargando: consulta.isLoading,
    guardando: guardarMutation.isPending,
    emitiendo: emitirMutation.isPending,
    error: consulta.error,
    reintentar: () => consulta.refetch(),
  }
}
