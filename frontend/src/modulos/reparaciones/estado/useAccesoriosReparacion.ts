import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import type { Reparacion } from '../modelo/reparacion'
import type { ComandoAccesorios } from '../modelo/accesorios'
import { consultarAccesorios, ejecutarComandoAccesorios, recuperarComandoAccesorios } from '../servicios/accesoriosService'

export function useAccesoriosReparacion(reparacion: Reparacion, habilitado = true, operacion = 'custody') {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const org = reparacion.organizationId
  const ambito = `${org}:${user?.id ?? ''}:${reparacion.id}:accessories:${operacion}`
  const consulta = useQuery({
    queryKey: ['repair-accessories', org, reparacion.id, reparacion.lockVersion],
    queryFn: () => consultarAccesorios(org, reparacion.id), enabled: habilitado && Boolean(org && user),
  })
  const invalidar = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['repair-accessories', org, reparacion.id] }),
    queryClient.invalidateQueries({ queryKey: ['repair-detail', org, reparacion.id] }),
    queryClient.invalidateQueries({ queryKey: ['repairs', org] }),
  ])
  const recuperar = useCallback(() => recuperarComandoAccesorios(ambito), [ambito])
  return { consulta, recuperar,
    guardar: async (comando: ComandoAccesorios, clave: string) => {
      try { await ejecutarComandoAccesorios(ambito, org, reparacion.id, comando, clave) }
      finally { await invalidar() }
    },
  }
}
