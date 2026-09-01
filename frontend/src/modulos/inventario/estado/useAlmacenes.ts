import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type { DatosAlmacen, DatosReclasificacion, DatosTransferencia, DatosUbicacion } from '@/modulos/inventario/modelo/almacen'
import {
  cargarMaestrosAlmacen,
  configurarAlertas,
  crearAlmacen,
  crearUbicacion,
  reclasificarInventario,
  transferirInventario,
} from '@/modulos/inventario/servicios/almacenService'

const vacio = {
  almacenes: [], ubicaciones: [],
}

export function useAlmacenes() {
  const { access, user } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const userId = user?.id ?? ''
  const queryKey = ['warehouse-management', organizationId] as const
  const query = useQuery({
    queryKey,
    queryFn: () => cargarMaestrosAlmacen(organizationId),
    enabled: Boolean(organizationId),
  })

  const invalidar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['inventory', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-fefo', organizationId] }),
    ])
  }
  const ejecutar = async (operacion: () => Promise<void>) => {
    try {
      await operacion()
      await invalidar()
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo completar la operacion.'
    }
  }

  const almacenMutation = useMutation({ mutationFn: (datos: DatosAlmacen) => crearAlmacen(organizationId, userId, datos) })
  const ubicacionMutation = useMutation({ mutationFn: (datos: DatosUbicacion) => crearUbicacion(organizationId, userId, datos) })
  const transferenciaMutation = useMutation({ mutationFn: (datos: DatosTransferencia) => transferirInventario(organizationId, datos) })
  const reclasificacionMutation = useMutation({ mutationFn: (datos: DatosReclasificacion) => reclasificarInventario(organizationId, datos) })

  return {
    ...(query.data ?? vacio),
    cargando: query.isLoading,
    error: query.error instanceof Error ? query.error.message : '',
    crearAlmacen: (datos: DatosAlmacen) => ejecutar(() => almacenMutation.mutateAsync(datos)),
    crearUbicacion: (datos: DatosUbicacion) => ejecutar(() => ubicacionMutation.mutateAsync(datos)),
    transferir: (datos: DatosTransferencia) => ejecutar(() => transferenciaMutation.mutateAsync(datos)),
    reclasificar: (datos: DatosReclasificacion) => ejecutar(() => reclasificacionMutation.mutateAsync(datos)),
    configurar: (datos: Parameters<typeof configurarAlertas>[2]) => ejecutar(() => configurarAlertas(organizationId, userId, datos)),
  }
}
