import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { ConsultaResumenMovimientos } from '@/modulos/reportes/modelo/reporteMovimientos'
import { listarResumenMovimientos } from '@/modulos/reportes/servicios/reporteService'

export function useReporteMovimientos(
  organizationId: string,
  consulta: ConsultaResumenMovimientos,
  habilitado = true,
) {
  return useQuery({
    queryKey: ['reports', 'inventory-movement-summary', organizationId, consulta],
    queryFn: () => listarResumenMovimientos(organizationId, consulta),
    enabled: Boolean(organizationId && habilitado),
    placeholderData: keepPreviousData,
  })
}
