import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type {
  ConsultaExistenciasInventario,
  ConsultaMovimientosInventario,
  DatosMovimientoInventario,
} from '@/modulos/inventario/modelo/inventario'
import {
  contarResumenExistencias,
  listarExistenciasInventario,
  listarMovimientosInventario,
  registrarMovimientoInventario,
} from '@/modulos/inventario/servicios/inventarioService'

interface ConsultasInventario {
  existencias: ConsultaExistenciasInventario
  movimientos: ConsultaMovimientosInventario
}

export function useInventario(consultas: ConsultasInventario) {
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const inventoryQueryKey = ['inventory', organizationId] as const
  const existenciasQuery = useQuery({
    queryKey: [...inventoryQueryKey, 'existencias', consultas.existencias],
    queryFn: () => listarExistenciasInventario(organizationId, consultas.existencias),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  })
  const resumenQuery = useQuery({
    queryKey: [...inventoryQueryKey, 'resumen-existencias'],
    queryFn: () => contarResumenExistencias(organizationId),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  })
  const movimientosQuery = useQuery({
    queryKey: [...inventoryQueryKey, 'movimientos', consultas.movimientos],
    queryFn: () => listarMovimientosInventario(organizationId, consultas.movimientos),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  })
  const mutation = useMutation({
    mutationFn: (datos: DatosMovimientoInventario) => registrarMovimientoInventario(organizationId, datos),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['warehouse-management', organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-fefo', organizationId] }),
      ])
    },
  })

  return {
    existencias: existenciasQuery.data,
    resumenExistencias: resumenQuery.data,
    movimientos: movimientosQuery.data,
    cargandoExistencias: existenciasQuery.isLoading,
    actualizandoExistencias: existenciasQuery.isFetching,
    errorExistencias: existenciasQuery.error,
    cargandoMovimientos: movimientosQuery.isLoading,
    actualizandoMovimientos: movimientosQuery.isFetching,
    errorMovimientos: movimientosQuery.error,
    reintentarExistencias: () => existenciasQuery.refetch(),
    reintentarMovimientos: () => movimientosQuery.refetch(),
    registrarMovimiento: async (datos: DatosMovimientoInventario) => {
      try {
        await mutation.mutateAsync(datos)
        return undefined
      } catch (error) {
        return error instanceof Error ? error.message : 'No se pudo registrar el movimiento'
      }
    },
  }
}
