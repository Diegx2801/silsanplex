import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import type { Producto } from '@/modulos/productos/modelo/producto'
import {
  validarCotizacion,
  type DatosCotizacion,
  type EntidadesSeleccionadasCotizacion,
} from '@/modulos/ventas/modelo/cotizacion'
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

  const combinarPorId = <T extends { id: string }>(base: readonly T[], seleccionadas: readonly T[]) => {
    const entidades = new Map(base.map((entidad) => [entidad.id, entidad]))
    seleccionadas.forEach((entidad) => entidades.set(entidad.id, entidad))
    return [...entidades.values()]
  }

  const guardarMutation = useMutation({
    mutationFn: ({
      datos,
      cotizacionId,
      clientesDisponibles,
      productosDisponibles,
    }: {
      datos: DatosCotizacion
      cotizacionId?: string
      clientesDisponibles: readonly Cliente[]
      productosDisponibles: readonly Producto[]
    }) =>
      guardarCotizacionPersistente(
        organizationId,
        datos,
        clientesDisponibles,
        productosDisponibles,
        cotizacionId,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const emitirMutation = useMutation({
    mutationFn: (cotizacionId: string) => emitirCotizacionPersistente(organizationId, cotizacionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const guardarCotizacion = async (
    datos: DatosCotizacion,
    cotizacionId?: string,
    entidadesSeleccionadas?: EntidadesSeleccionadasCotizacion,
  ) => {
    const clientesDisponibles = combinarPorId(
      clientes,
      entidadesSeleccionadas?.cliente ? [entidadesSeleccionadas.cliente] : [],
    )
    const productosDisponibles = combinarPorId(
      productos,
      entidadesSeleccionadas?.productos ?? [],
    )
    const cliente = clientesDisponibles.find(
      (item) => item.id === datos.clienteId && item.activo,
    )
    if (!cliente) return 'El cliente seleccionado ya no está disponible'
    const errorValidacion = validarCotizacion(datos, productosDisponibles)
    if (errorValidacion) return errorValidacion

    try {
      await guardarMutation.mutateAsync({
        datos,
        cotizacionId,
        clientesDisponibles,
        productosDisponibles,
      })
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
