import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type { BucketAjusteStock } from '@/modulos/inventario/modelo/inventario'
import { listarBucketsAjusteStock } from '@/modulos/inventario/servicios/inventarioService'

const bucketsVacios: BucketAjusteStock[] = []

export function useBucketsAjusteStock(
  productoId: string,
  almacenId: string,
  organizationIdOverride?: string,
) {
  const { access } = useAuth()
  const organizationId = organizationIdOverride ?? access?.organizationId ?? ''
  const query = useQuery({
    queryKey: ['inventory-adjustment-buckets', organizationId, productoId, almacenId],
    queryFn: () => listarBucketsAjusteStock(organizationId, productoId, almacenId),
    enabled: Boolean(organizationId && productoId && almacenId),
    staleTime: 5_000,
  })

  return {
    buckets: query.data ?? bucketsVacios,
    cargando: query.isLoading,
    error: query.error instanceof Error ? query.error.message : '',
  }
}
