import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { useDebounceInventario } from '@/modulos/inventario/estado/useDebounceInventario'
import { listarOpcionesProductoInventario } from '@/modulos/inventario/servicios/productoInventarioReadService'

export function useOpcionesProductoInventario(
  busqueda: string,
  habilitado = true,
  organizationIdOverride?: string,
) {
  const { access } = useAuth()
  const organizationId = organizationIdOverride ?? access?.organizationId ?? ''
  const busquedaDebounced = useDebounceInventario(busqueda)

  return useQuery({
    queryKey: ['inventory-product-options', organizationId, busquedaDebounced],
    queryFn: () => listarOpcionesProductoInventario(organizationId, busquedaDebounced, 50, 0),
    enabled: Boolean(organizationId) && habilitado,
    staleTime: 30_000,
  })
}
