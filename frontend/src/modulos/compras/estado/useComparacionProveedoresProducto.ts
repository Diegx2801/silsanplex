import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import type { PeriodoComparacionProveedoresProducto } from '@/modulos/compras/modelo/comparacionProveedoresProducto'
import { listarComparacionProveedoresProducto } from '@/modulos/compras/servicios/comparacionProveedoresProductoService'

interface Props {
  productoId: string
  habilitado?: boolean
}

function obtenerDesde(periodo: PeriodoComparacionProveedoresProducto): string | null {
  if (periodo === 'all') return null

  const desde = new Date()
  if (periodo === '30d') desde.setDate(desde.getDate() - 30)
  if (periodo === '90d') desde.setDate(desde.getDate() - 90)
  if (periodo === '6m') desde.setMonth(desde.getMonth() - 6)
  if (periodo === '1y') desde.setFullYear(desde.getFullYear() - 1)
  return desde.toISOString()
}

export function useComparacionProveedoresProducto({ productoId, habilitado = true }: Props) {
  const { access, hasPermission } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const puedeConsultar =
    hasPermission(PERMISSIONS.PURCHASES_VIEW) &&
    hasPermission(PERMISSIONS.SUPPLIERS_VIEW)
  const [periodo, setPeriodo] = useState<PeriodoComparacionProveedoresProducto>('all')
  const desde = useMemo(() => obtenerDesde(periodo), [periodo])
  const filtros = useMemo(
    () => ({ organizationId, productId: productoId, desde, hasta: null as string | null }),
    [desde, organizationId, productoId],
  )
  const query = useQuery({
    queryKey: ['product-supplier-comparison', filtros],
    queryFn: () => listarComparacionProveedoresProducto(filtros),
    enabled: Boolean(habilitado && organizationId && productoId && puedeConsultar),
  })

  return {
    puedeConsultar,
    periodo,
    cambiarPeriodo: setPeriodo,
    filas: query.data ?? [],
    cargando: query.isLoading,
    actualizando: query.isFetching && !query.isLoading,
    error: query.error,
    reintentar: query.refetch,
  }
}
