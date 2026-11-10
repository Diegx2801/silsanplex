import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import { consultarHistorialPreciosVenta, type FiltrosPreciosVenta } from '@/modulos/ventas/servicios/historialPreciosService'

export const historialPreciosKey = (organizacionId: string) => ['customer-sale-prices', organizacionId] as const

export function useHistorialPreciosVenta(clienteId: string, filtros: FiltrosPreciosVenta, habilitado = true) {
  const { access, user, hasPermission } = useAuth()
  const organizacionId = access?.organizationId ?? ''
  const permitido = hasPermission(PERMISSIONS.SALES_VIEW) && hasPermission(PERMISSIONS.CUSTOMERS_VIEW)
  const query = useQuery({
    queryKey: [...historialPreciosKey(organizacionId), user?.id, clienteId, filtros],
    queryFn: () => consultarHistorialPreciosVenta(organizacionId, clienteId, filtros),
    enabled: Boolean(organizacionId && user?.id && clienteId && habilitado && permitido),
    staleTime: 0,
  })
  return { ...query, permitido, puedeUsar: hasPermission(PERMISSIONS.SALES_MANAGE), filas: permitido && habilitado ? query.data ?? [] : [] }
}
