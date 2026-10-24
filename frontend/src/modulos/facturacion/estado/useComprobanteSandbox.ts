import { useQuery } from '@tanstack/react-query'

import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import {
  AMBIENTE_FISCAL_SANDBOX,
  esquemaReferenciaComprobanteSandbox,
} from '@/modulos/facturacion/modelo/comprobanteSandbox'
import { consultarComprobanteSandbox, ErrorConsultaFiscal } from '@/modulos/facturacion/servicios/comprobantesSandboxService'

export function useComprobanteSandbox(documentId?: string) {
  const { access, user, session, isLoading, hasPermission } = useAuth()
  const referencia = esquemaReferenciaComprobanteSandbox.safeParse({
    organizationId: access?.organizationId ?? '', documentId: documentId ?? '',
  })
  const puedeConsultar = Boolean(!isLoading && user && session && referencia.success
    && hasPermission(PERMISSIONS.BILLING_VIEW))
  const query = useQuery({
    queryKey: ['electronic-document', referencia.success ? referencia.data.organizationId : null,
      AMBIENTE_FISCAL_SANDBOX, referencia.success ? referencia.data.documentId : null, user?.id ?? null],
    enabled: puedeConsultar,
    queryFn: ({ signal }) => {
      if (!puedeConsultar || !referencia.success) throw new ErrorConsultaFiscal('SIN_ACCESO')
      return consultarComprobanteSandbox(referencia.data.organizationId, referencia.data.documentId, signal)
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })

  return {
    puedeConsultar,
    // No mostrar caché previa si cambia la sesión o se revoca el permiso visible.
    comprobante: puedeConsultar && !query.isError ? query.data : undefined,
    cargando: puedeConsultar && query.isFetching,
    error: puedeConsultar ? query.error : null,
    reintentar: () => puedeConsultar ? query.refetch() : Promise.resolve(undefined),
  }
}
