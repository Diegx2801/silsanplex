import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type {
  Almacen,
  DatosAlmacen,
  DatosReclasificacion,
  DatosTransferencia,
  DatosUbicacion,
  UbicacionAlmacen,
} from '@/modulos/inventario/modelo/almacen'
import {
  cambiarEstadoAlmacen,
  cambiarEstadoUbicacion,
  cargarMaestrosAlmacen,
  configurarAlertas,
  crearAlmacen,
  crearUbicacion,
  editarAlmacen,
  editarUbicacion,
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
      return error instanceof Error ? error.message : 'No se pudo completar la operación.'
    }
  }

  const almacenMutation = useMutation({
    mutationFn: ({ datos, almacen }: { datos: DatosAlmacen; almacen?: Almacen }) =>
      almacen
        ? editarAlmacen(organizationId, almacen, datos)
        : crearAlmacen(organizationId, datos),
  })
  const ubicacionMutation = useMutation({
    mutationFn: ({ datos, ubicacion }: { datos: DatosUbicacion; ubicacion?: UbicacionAlmacen }) =>
      ubicacion
        ? editarUbicacion(organizationId, ubicacion, datos)
        : crearUbicacion(organizationId, datos),
  })
  const estadoAlmacenMutation = useMutation({
    mutationFn: (almacen: Almacen) => cambiarEstadoAlmacen(organizationId, almacen),
  })
  const estadoUbicacionMutation = useMutation({
    mutationFn: (ubicacion: UbicacionAlmacen) => cambiarEstadoUbicacion(organizationId, ubicacion),
  })
  const transferenciaMutation = useMutation({ mutationFn: (datos: DatosTransferencia) => transferirInventario(organizationId, datos) })
  const reclasificacionMutation = useMutation({ mutationFn: (datos: DatosReclasificacion) => reclasificarInventario(organizationId, datos) })

  return {
    ...(query.data ?? vacio),
    cargando: query.isLoading,
    error: query.error instanceof Error ? query.error.message : '',
    reintentar: async () => { await query.refetch() },
    guardarAlmacen: (datos: DatosAlmacen, almacen?: Almacen) =>
      ejecutar(() => almacenMutation.mutateAsync({ datos, almacen })),
    guardarUbicacion: (datos: DatosUbicacion, ubicacion?: UbicacionAlmacen) =>
      ejecutar(() => ubicacionMutation.mutateAsync({ datos, ubicacion })),
    cambiarEstadoAlmacen: (almacen: Almacen) =>
      ejecutar(() => estadoAlmacenMutation.mutateAsync(almacen)),
    cambiarEstadoUbicacion: (ubicacion: UbicacionAlmacen) =>
      ejecutar(() => estadoUbicacionMutation.mutateAsync(ubicacion)),
    transferir: (datos: DatosTransferencia) => ejecutar(() => transferenciaMutation.mutateAsync(datos)),
    reclasificar: (datos: DatosReclasificacion) => ejecutar(() => reclasificacionMutation.mutateAsync(datos)),
    configurar: (datos: Parameters<typeof configurarAlertas>[2]) => ejecutar(() => configurarAlertas(organizationId, userId, datos)),
  }
}
