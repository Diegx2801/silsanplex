import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { listarKardexReporte } from '@/modulos/reportes/servicios/kardexReporteService'
import type { ConsultaKardexReporte } from '@/modulos/reportes/modelo/reporteKardex'

export function useReporteKardex(
  organizationId: string,
  consulta: ConsultaKardexReporte,
  habilitado = true,
) {
  return useQuery({
    queryKey: ['reports', 'inventory-kardex', organizationId, consulta],
    queryFn: () => listarKardexReporte(organizationId, consulta),
    enabled: Boolean(organizationId && consulta.productoId && habilitado),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}
