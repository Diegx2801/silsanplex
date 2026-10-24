import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { supabase } from '@/lib/supabase'

export const INTERVALO_REVALIDACION_PERMISO_FISCAL_MS = 3_000
export const VIGENCIA_MAXIMA_PERMISO_FISCAL_MS = 5_000
const TIEMPO_LIMITE_REVALIDACION_MS = 4_000

export type EstadoVigenciaPermisoFiscal =
  | 'verificando'
  | 'permitido'
  | 'denegado'
  | 'no_verificable'

interface ResultadoVigencia {
  identidad: string | null
  estado: EstadoVigenciaPermisoFiscal
}

/**
 * Mantiene una autorización breve para la vista fiscal. La RPC vuelve a
 * comprobar la sesión y el permiso efectivo en PostgreSQL; si la comprobación
 * vence, falla o detecta una revocación, elimina los snapshots de React Query.
 */
export function useVigenciaPermisoFiscal(organizationId: string) {
  const queryClient = useQueryClient()
  const { user, session } = useAuth()
  const userId = user?.id ?? null
  const sessionKey = session?.expires_at ?? null
  const accessToken = session?.access_token ?? null
  const tieneSesion = Boolean(session)
  const identidad = userId && session && organizationId
    ? `${userId}:${organizationId}:${sessionKey ?? 'sesion'}`
    : null
  const [resultado, setResultado] = useState<ResultadoVigencia>({
    identidad: null,
    estado: 'verificando',
  })
  const estado = identidad && resultado.identidad === identidad
    ? resultado.estado
    : identidad
      ? 'verificando'
      : 'denegado'

  useEffect(() => {
    let montado = true
    let enVuelo = false
    let generacionSolicitud = 0
    let controlador: AbortController | null = null
    let intervalo: ReturnType<typeof setInterval> | undefined
    let expiracion: ReturnType<typeof setTimeout> | undefined
    let limiteSolicitud: ReturnType<typeof setTimeout> | undefined
    let ultimoEstado: EstadoVigenciaPermisoFiscal | null = null

    const eliminarSnapshotsFiscales = () => {
      const filtros = { queryKey: ['electronic-document'] as const }
      void queryClient.cancelQueries(filtros).finally(() => {
        if (montado && ultimoEstado === 'permitido') return
        queryClient.getQueryCache().findAll(filtros).forEach((query) => {
          query.setState({
            data: undefined,
            dataUpdatedAt: 0,
            error: null,
            errorUpdatedAt: 0,
            fetchFailureCount: 0,
            fetchFailureReason: null,
            fetchMeta: null,
            isInvalidated: false,
            status: 'pending',
            fetchStatus: 'idle',
          })
        })
        queryClient.removeQueries(filtros)
      })
    }

    const actualizarEstado = (nuevoEstado: EstadoVigenciaPermisoFiscal) => {
      if (!montado) return
      if (ultimoEstado === nuevoEstado) return
      ultimoEstado = nuevoEstado
      setResultado({ identidad, estado: nuevoEstado })
      if (nuevoEstado !== 'permitido') eliminarSnapshotsFiscales()
    }

    const invalidarSolicitud = () => {
      generacionSolicitud += 1
      controlador?.abort()
      controlador = null
      enVuelo = false
      if (limiteSolicitud) clearTimeout(limiteSolicitud)
      limiteSolicitud = undefined
    }

    const denegarPorVencimiento = () => {
      if (expiracion) clearTimeout(expiracion)
      expiracion = undefined
      invalidarSolicitud()
      actualizarEstado('no_verificable')
    }

    const verificar = async () => {
      if (!montado || enVuelo) return
      if (document.visibilityState !== 'visible') {
        denegarPorVencimiento()
        return
      }

      enVuelo = true
      const solicitud = ++generacionSolicitud
      const venceEn = performance.now() + VIGENCIA_MAXIMA_PERMISO_FISCAL_MS
      const controller = new AbortController()
      controlador = controller
      limiteSolicitud = setTimeout(() => {
        if (solicitud !== generacionSolicitud) return
        controller.abort()
        controlador = null
        enVuelo = false
        actualizarEstado('no_verificable')
      }, TIEMPO_LIMITE_REVALIDACION_MS)

      try {
        const [sesionResult, permisoResult] = await Promise.all([
          supabase.rpc('current_auth_session_is_active').abortSignal(controller.signal),
          supabase.rpc('has_organization_permission', {
            requested_organization_id: organizationId,
            requested_permission_code: 'BILLING_VIEW',
          }).abortSignal(controller.signal),
        ])

        if (!montado || solicitud !== generacionSolicitud || controller.signal.aborted) return
        if (sesionResult.error || permisoResult.error) {
          actualizarEstado('no_verificable')
          return
        }

        if (sesionResult.data !== true || permisoResult.data !== true) {
          if (expiracion) clearTimeout(expiracion)
          expiracion = undefined
          actualizarEstado('denegado')
          return
        }

        const tiempoRestante = venceEn - performance.now()
        if (tiempoRestante <= 0) {
          denegarPorVencimiento()
          return
        }
        if (expiracion) clearTimeout(expiracion)
        // Una respuesta positiva atrasada solo conserva la vigencia que resta
        // desde el inicio de su comprobación, no otros cinco segundos.
        expiracion = setTimeout(denegarPorVencimiento, tiempoRestante)
        actualizarEstado('permitido')
      } catch {
        if (montado && solicitud === generacionSolicitud && !controller.signal.aborted) {
          actualizarEstado('no_verificable')
        }
      } finally {
        if (solicitud === generacionSolicitud) {
          if (limiteSolicitud) clearTimeout(limiteSolicitud)
          limiteSolicitud = undefined
          controlador = null
          enVuelo = false
        }
      }
    }

    const gestionarVisibilidad = () => {
      if (document.visibilityState !== 'visible') {
        denegarPorVencimiento()
        return
      }
      void verificar()
    }

    if (!identidad || !userId || !tieneSesion) {
      actualizarEstado('denegado')
      eliminarSnapshotsFiscales()
      return () => { montado = false }
    }

    actualizarEstado('verificando')
    void verificar()
    intervalo = setInterval(() => void verificar(), INTERVALO_REVALIDACION_PERMISO_FISCAL_MS)
    document.addEventListener('visibilitychange', gestionarVisibilidad)
    return () => {
      montado = false
      invalidarSolicitud()
      if (intervalo) clearInterval(intervalo)
      if (expiracion) clearTimeout(expiracion)
      document.removeEventListener('visibilitychange', gestionarVisibilidad)
    }
  }, [accessToken, identidad, organizationId, queryClient, tieneSesion, userId])

  return { estado, permitido: estado === 'permitido' }
}
