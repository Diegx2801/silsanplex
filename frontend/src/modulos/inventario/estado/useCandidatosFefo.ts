import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type { CandidatoFefo } from '@/modulos/inventario/modelo/inventario'
import { listarCandidatosFefo } from '@/modulos/inventario/servicios/inventarioService'

const candidatosVacios: CandidatoFefo[] = []

export function useCandidatosFefo(
  productoId: string,
  almacenId: string,
  habilitado = true,
) {
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const query = useQuery({
    queryKey: ['inventory-fefo', organizationId, productoId, almacenId],
    queryFn: () => listarCandidatosFefo(organizationId, productoId, almacenId),
    enabled: habilitado && Boolean(organizationId && productoId && almacenId),
    staleTime: 15_000,
  })

  return {
    candidatos: query.data ?? candidatosVacios,
    cargando: query.isLoading,
    error: query.error instanceof Error ? query.error.message : '',
  }
}
