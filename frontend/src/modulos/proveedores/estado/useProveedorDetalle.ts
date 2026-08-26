import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type {
  DatosDevolucionProveedor,
  DatosEvaluacionProveedor,
  DatosIncidenciaProveedor,
} from '@/modulos/proveedores/modelo/proveedorDetalle'
import {
  completarDevolucionProveedor,
  guardarIncidenciaProveedor,
  listarDetalleOperativoProveedor,
  registrarDevolucionProveedor,
  registrarEvaluacionProveedor,
} from '@/modulos/proveedores/servicios/proveedorDetalleService'

export function useProveedorDetalle(proveedorId: string, habilitado: boolean) {
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const queryKey = ['supplier-detail', organizationId, proveedorId] as const

  const detalleQuery = useQuery({
    queryKey,
    queryFn: () => listarDetalleOperativoProveedor(organizationId, proveedorId),
    enabled: habilitado && Boolean(organizationId && proveedorId),
  })

  const invalidar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['suppliers', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['supplier-comparison', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['inventory', organizationId] }),
    ])
  }

  const evaluacionMutation = useMutation({
    mutationFn: (datos: DatosEvaluacionProveedor) => registrarEvaluacionProveedor(organizationId, proveedorId, datos),
    onSuccess: invalidar,
  })
  const incidenciaMutation = useMutation({
    mutationFn: ({ datos, incidenciaId }: { datos: DatosIncidenciaProveedor; incidenciaId?: string }) =>
      guardarIncidenciaProveedor(organizationId, proveedorId, datos, incidenciaId),
    onSuccess: invalidar,
  })
  const devolucionMutation = useMutation({
    mutationFn: (datos: DatosDevolucionProveedor) => registrarDevolucionProveedor(organizationId, proveedorId, datos),
    onSuccess: invalidar,
  })
  const completarMutation = useMutation({
    mutationFn: (devolucionId: string) => completarDevolucionProveedor(organizationId, devolucionId),
    onSuccess: invalidar,
  })

  return {
    detalle: detalleQuery.data,
    cargando: detalleQuery.isLoading,
    error: detalleQuery.error,
    guardarEvaluacion: evaluacionMutation.mutateAsync,
    guardandoEvaluacion: evaluacionMutation.isPending,
    guardarIncidencia: (datos: DatosIncidenciaProveedor, incidenciaId?: string) =>
      incidenciaMutation.mutateAsync({ datos, incidenciaId }),
    guardandoIncidencia: incidenciaMutation.isPending,
    registrarDevolucion: devolucionMutation.mutateAsync,
    registrandoDevolucion: devolucionMutation.isPending,
    completarDevolucion: completarMutation.mutateAsync,
    completandoDevolucion: completarMutation.isPending,
  }
}
