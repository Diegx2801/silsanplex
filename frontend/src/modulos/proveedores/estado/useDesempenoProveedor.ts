import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import type { PeriodoDesempenoProveedor } from '@/modulos/proveedores/modelo/desempenoProveedor'
import { obtenerDesempenoProveedor } from '@/modulos/proveedores/servicios/desempenoProveedorService'

interface Props {
  proveedorId: string
  habilitado?: boolean
}

function obtenerDesde(periodo: PeriodoDesempenoProveedor): string | null {
  if (periodo === 'all') return null

  const desde = new Date()
  if (periodo === '30d') desde.setDate(desde.getDate() - 30)
  if (periodo === '90d') desde.setDate(desde.getDate() - 90)
  if (periodo === '6m') desde.setMonth(desde.getMonth() - 6)
  if (periodo === '1y') desde.setFullYear(desde.getFullYear() - 1)
  return desde.toISOString()
}

export function useDesempenoProveedor({ proveedorId, habilitado = true }: Props) {
  const { access, hasPermission } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const puedeConsultar =
    hasPermission(PERMISSIONS.PURCHASES_VIEW) &&
    hasPermission(PERMISSIONS.SUPPLIERS_VIEW)
  const [periodo, setPeriodo] = useState<PeriodoDesempenoProveedor>('all')
  const desde = useMemo(() => obtenerDesde(periodo), [periodo])
  const filtros = useMemo(
    () => ({ organizationId, proveedorId, desde, hasta: null as string | null }),
    [desde, organizationId, proveedorId],
  )
  const query = useQuery({
    queryKey: ['supplier-operational-performance', filtros],
    queryFn: () => obtenerDesempenoProveedor(filtros.organizationId, filtros.proveedorId, filtros.desde, filtros.hasta),
    enabled: Boolean(habilitado && organizationId && proveedorId && puedeConsultar),
  })

  return {
    puedeConsultar,
    periodo,
    cambiarPeriodo: setPeriodo,
    resumen: query.data ?? null,
    cargando: query.isLoading,
    actualizando: query.isFetching && !query.isLoading,
    error: query.error,
    reintentar: query.refetch,
  }
}
