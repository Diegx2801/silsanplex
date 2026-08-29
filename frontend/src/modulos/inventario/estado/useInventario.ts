import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type {
  DatosMovimientoInventario,
  MovimientoInventario,
  ResumenStockInventario,
} from '@/modulos/inventario/modelo/inventario'
import { cargarInventario, registrarMovimientoInventario } from '@/modulos/inventario/servicios/inventarioService'

const movimientosVacios: MovimientoInventario[] = []
const resumenVacio: ResumenStockInventario[] = []

export function useInventario() {
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const queryKey = ['inventory', organizationId] as const
  const query = useQuery({
    queryKey,
    queryFn: () => cargarInventario(organizationId),
    enabled: Boolean(organizationId),
  })
  const mutation = useMutation({
    mutationFn: (datos: DatosMovimientoInventario) => registrarMovimientoInventario(organizationId, datos),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ['warehouse-management', organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-fefo', organizationId] }),
      ])
    },
  })

  return {
    movimientos: query.data?.movimientos ?? movimientosVacios,
    resumenStock: query.data?.resumenStock ?? resumenVacio,
    totalMovimientos: query.data?.total ?? 0,
    cargando: query.isLoading,
    error: query.error,
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
