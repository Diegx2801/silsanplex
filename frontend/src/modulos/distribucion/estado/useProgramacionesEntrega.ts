import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type { DatosProgramacionEntrega, ProgramacionEntrega } from '@/modulos/distribucion/modelo/programacionEntrega'
import { guardarEntrega, listarEntregas } from '@/modulos/distribucion/servicios/distribucionService'

export function useProgramacionesEntrega() {
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const queryKey = ['distribution-deliveries', organizationId] as const
  const query = useQuery({ queryKey, queryFn: () => listarEntregas(organizationId), enabled: Boolean(organizationId) })
  const guardarMutation = useMutation({ mutationFn: ({ datos, lineas, id }: { datos: DatosProgramacionEntrega; lineas: ProgramacionEntrega['lineas']; id?: string }) => guardarEntrega(organizationId, datos, lineas, id), onSuccess: () => queryClient.invalidateQueries({ queryKey }) })

  const ejecutar = async (operacion: () => Promise<unknown>) => {
    try {
      await operacion()
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo completar la operación'
    }
  }

  const programaciones = query.data ?? []
  const guardar = (datos: DatosProgramacionEntrega, id?: string, lineas: ProgramacionEntrega['lineas'] = []) => {
    if (programaciones.some((item) => item.pedidoId === datos.pedidoId && item.id !== id)) return Promise.resolve('Este pedido ya tiene una entrega programada')
    return ejecutar(() => guardarMutation.mutateAsync({ datos, lineas, id }))
  }

  const actualizarSeguimiento = (entrega: ProgramacionEntrega, seguimiento: ProgramacionEntrega['seguimiento']) => guardar({ ...entrega, seguimiento }, entrega.id, entrega.lineas)

  return { programaciones, guardar, actualizarSeguimiento, cargando: query.isLoading, error: query.error }
}