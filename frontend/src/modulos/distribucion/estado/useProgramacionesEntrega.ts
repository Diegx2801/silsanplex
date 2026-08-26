import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import type {
  DatosDevolucionEntrega,
  DatosEntrega,
  DatosIncidenciaEntrega,
  DatosTransicionEntrega,
  TipoEvidencia,
} from '@/modulos/distribucion/modelo/programacionEntrega'
import {
  guardarEntrega,
  guardarIncidencia,
  listarDistribucion,
  registrarDevolucion,
  subirEvidencia,
  transicionarEntrega,
} from '@/modulos/distribucion/servicios/distribucionService'

export function useProgramacionesEntrega() {
  const { access, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const queryKey = ['distribution', organizationId] as const
  const consulta = useQuery({
    queryKey,
    queryFn: () => listarDistribucion(organizationId),
    enabled: Boolean(organizationId),
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey })
  const guardarMutation = useMutation({
    mutationFn: ({ datos, id }: { datos: DatosEntrega; id?: string }) => guardarEntrega(organizationId, datos, id),
    onSuccess: invalidar,
  })
  const transicionMutation = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: DatosTransicionEntrega }) => transicionarEntrega(organizationId, id, datos),
    onSuccess: invalidar,
  })
  const incidenciaMutation = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: DatosIncidenciaEntrega }) => guardarIncidencia(organizationId, id, datos),
    onSuccess: invalidar,
  })
  const devolucionMutation = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: DatosDevolucionEntrega }) => registrarDevolucion(organizationId, id, datos),
    onSuccess: invalidar,
  })
  const evidenciaMutation = useMutation({
    mutationFn: ({ id, archivo, tipo, notas }: { id: string; archivo: File; tipo: TipoEvidencia; notas: string }) => subirEvidencia(organizationId, id, archivo, tipo, notas),
    onSuccess: invalidar,
  })

  return {
    pedidosPersistidos: consulta.data?.pedidos ?? [],
    programaciones: consulta.data?.programaciones ?? [],
    cargando: consulta.isLoading,
    actualizando: consulta.isFetching,
    error: consulta.error instanceof Error ? consulta.error.message : null,
    guardar: (datos: DatosEntrega, id?: string) => guardarMutation.mutateAsync({ datos, id }),
    transicionar: (id: string, datos: DatosTransicionEntrega) => transicionMutation.mutateAsync({ id, datos }),
    guardarIncidencia: (id: string, datos: DatosIncidenciaEntrega) => incidenciaMutation.mutateAsync({ id, datos }),
    registrarDevolucion: (id: string, datos: DatosDevolucionEntrega) => devolucionMutation.mutateAsync({ id, datos }),
    subirEvidencia: (id: string, archivo: File, tipo: TipoEvidencia, notas: string) => evidenciaMutation.mutateAsync({ id, archivo, tipo, notas }),
    puedeAdministrar: hasPermission(PERMISSIONS.DISTRIBUTION_MANAGE),
    puedeSeguir: hasPermission(PERMISSIONS.DISTRIBUTION_TRACK),
    puedeAdjuntar: hasPermission(PERMISSIONS.DISTRIBUTION_EVIDENCE),
    guardando: guardarMutation.isPending || transicionMutation.isPending || incidenciaMutation.isPending || devolucionMutation.isPending || evidenciaMutation.isPending,
  }
}
