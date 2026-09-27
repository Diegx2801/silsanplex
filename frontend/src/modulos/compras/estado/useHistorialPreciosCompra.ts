import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import type {
  ClaveDetallePrecioCompra,
  PeriodoHistorialPrecios,
} from '@/modulos/compras/modelo/historialPrecios'
import {
  listarHistorialPreciosCompra,
  listarResumenPreciosCompra,
} from '@/modulos/compras/servicios/historialPreciosService'

interface UseHistorialPreciosCompraProps {
  productoId?: string
  proveedorId?: string
}

function obtenerDesde(periodo: PeriodoHistorialPrecios): string | null {
  if (periodo === 'all') return null

  const desde = new Date()
  if (periodo === '30d') desde.setDate(desde.getDate() - 30)
  if (periodo === '90d') desde.setDate(desde.getDate() - 90)
  if (periodo === '6m') desde.setMonth(desde.getMonth() - 6)
  if (periodo === '1y') desde.setFullYear(desde.getFullYear() - 1)
  return desde.toISOString()
}

export function useHistorialPreciosCompra({ productoId, proveedorId }: UseHistorialPreciosCompraProps) {
  const { access, hasPermission } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const puedeConsultar =
    hasPermission(PERMISSIONS.PURCHASES_VIEW) &&
    (!proveedorId || hasPermission(PERMISSIONS.SUPPLIERS_VIEW))
  const [periodo, setPeriodo] = useState<PeriodoHistorialPrecios>('all')
  const [detalleClave, setDetalleClave] = useState<ClaveDetallePrecioCompra | null>(null)
  const desde = useMemo(() => obtenerDesde(periodo), [periodo])
  const filtros = useMemo(
    () => ({
      organizationId,
      productoId: productoId ?? null,
      proveedorId: proveedorId ?? null,
      desde,
      hasta: null,
    }),
    [desde, organizationId, productoId, proveedorId],
  )
  const tieneEntidad = Boolean(productoId || proveedorId)
  const resumenQuery = useQuery({
    queryKey: ['supplier-purchase-price-summary', filtros],
    queryFn: () => listarResumenPreciosCompra(filtros),
    enabled: Boolean(organizationId && tieneEntidad && puedeConsultar),
  })

  useEffect(() => {
    setDetalleClave(null)
  }, [productoId, proveedorId])

  const detalleQuery = useQuery({
    queryKey: ['supplier-purchase-price-history', filtros, detalleClave],
    queryFn: () => listarHistorialPreciosCompra({
      ...filtros,
      productoId: detalleClave?.productId ?? null,
      proveedorId: detalleClave?.supplierId ?? null,
    }),
    enabled: Boolean(organizationId && puedeConsultar && detalleClave),
  })
  const detalle = useMemo(() => {
    if (!detalleClave || !detalleQuery.data) return []
    return detalleQuery.data.filter((evento) =>
      evento.currency === detalleClave.currency &&
      evento.unitOfMeasure === detalleClave.unitOfMeasure &&
      evento.pricesIncludeTax === detalleClave.pricesIncludeTax &&
      evento.taxAffectation === detalleClave.taxAffectation,
    )
  }, [detalleClave, detalleQuery.data])

  return {
    puedeConsultar,
    periodo,
    cambiarPeriodo: setPeriodo,
    resumen: resumenQuery.data ?? [],
    cargandoResumen: resumenQuery.isLoading,
    actualizandoResumen: resumenQuery.isFetching && !resumenQuery.isLoading,
    errorResumen: resumenQuery.error,
    reintentarResumen: resumenQuery.refetch,
    detalleClave,
    detalle,
    cargandoDetalle: detalleQuery.isLoading,
    errorDetalle: detalleQuery.error,
    abrirDetalle: (clave: ClaveDetallePrecioCompra) => setDetalleClave(clave),
    cerrarDetalle: () => setDetalleClave(null),
  }
}
