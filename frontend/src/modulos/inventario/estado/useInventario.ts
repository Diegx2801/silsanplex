import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type { DatosMovimientoInventario, MovimientoInventario } from '@/modulos/inventario/modelo/inventario'
import { listarMovimientosInventario, registrarMovimientoInventario } from '@/modulos/inventario/servicios/inventarioService'

const movimientosVacios: MovimientoInventario[] = []

export function useInventario() {
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const queryKey = ['inventory-movements', organizationId] as const
  const query = useQuery({
    queryKey,
    queryFn: () => listarMovimientosInventario(organizationId),
    enabled: Boolean(organizationId),
  })
  const mutation = useMutation({
    mutationFn: (datos: DatosMovimientoInventario) => registrarMovimientoInventario(organizationId, datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    movimientos: query.data ?? movimientosVacios,
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
