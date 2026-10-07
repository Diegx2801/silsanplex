import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { consultarUnidadBaseEditable } from '@/modulos/productos/servicios/productosService'

export function useUnidadBaseProducto(productoId: string | undefined, habilitado: boolean) {
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const consulta = useQuery({
    queryKey: ['product-base-unit-editable', organizationId, productoId],
    queryFn: () => consultarUnidadBaseEditable(organizationId, productoId!),
    enabled: habilitado && Boolean(organizationId && productoId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })

  return {
    editable: !productoId || (!consulta.isError && !consulta.isFetching && consulta.data === true),
    comprobando: Boolean(productoId) && (consulta.isPending || consulta.isFetching) && !consulta.isError,
    error: consulta.isError,
    actualizar: consulta.refetch,
  }
}
