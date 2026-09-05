import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { crearConReintentoPersistente, leerCreacionPendiente } from './creacionPendiente'
import type {
  ConsultaReparaciones,
  ResultadoReparacionesPaginado,
} from '@/modulos/reparaciones/modelo/consultaReparaciones'
import type {
  DatosCotizacion,
  DatosConsumoParte,
  DatosDiagnostico,
  DatosObservacionReparacion,
  DatosPrueba,
  DatosReparacion,
  DatosReservaParte,
  DatosSolucionReparacion,
  Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'
import {
  aprobarCotizacionReparacion,
  asignarReparacion,
  actualizarReparacion,
  cancelarParteReparacion,
  cancelarReparacion,
  cambiarEstadoReparacion,
  consumirParteReparacion,
  crearReparacion,
  entregarReparacion,
  esConflictoVersionReparacion,
  guardarCotizacionReparacion,
  listarReparacionesPaginadas,
  obtenerResumenReparaciones,
  rechazarCotizacionReparacion,
  revisarCotizacionReparacion,
  registrarDiagnosticoReparacion,
  registrarSolucionReparacion,
  registrarPruebaReparacion,
  reservarParteReparacion,
} from '@/modulos/reparaciones/servicios/reparacionesService'

interface ConfiguracionConsultaReparaciones {
  consulta?: ConsultaReparaciones
  pagina?: number
  tamanioPagina?: number
}

const consultaInicial: ConsultaReparaciones = {
  busqueda: '',
  estado: 'todos',
  prioridad: 'todas',
}

const reparacionesVacias: Reparacion[] = []
const resumenVacio = {
  total: 0,
  abiertas: 0,
  esperandoAprobacion: 0,
  listasParaEntrega: 0,
}

function mensajeDeError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useReparaciones(
  configuracion: ConfiguracionConsultaReparaciones = {},
) {
  const { access, user } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const ambitoCreacion = `${organizationId}:${user?.id ?? ''}`
  const consulta = configuracion.consulta ?? consultaInicial
  const pagina = configuracion.pagina ?? 1
  const tamanioPagina = configuracion.tamanioPagina ?? 10
  const reparacionesKey = ['repairs', organizationId] as const

  const listaQuery = useQuery({
    queryKey: [...reparacionesKey, 'list', consulta, pagina, tamanioPagina],
    queryFn: (): Promise<ResultadoReparacionesPaginado> =>
      listarReparacionesPaginadas(organizationId, {
        ...consulta,
        pagina,
        tamanioPagina,
      }),
    enabled: Boolean(organizationId),
  })
  const resumenQuery = useQuery({
    queryKey: [...reparacionesKey, 'summary'],
    queryFn: () => obtenerResumenReparaciones(organizationId),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  })

  const invalidarLecturasReparacion = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: reparacionesKey }),
      queryClient.invalidateQueries({
        queryKey: ['repair-detail', organizationId],
      }),
    ])
  }

  const invalidar = async () => {
    await Promise.all([
      invalidarLecturasReparacion(),
      queryClient.invalidateQueries({ queryKey: ['inventory', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['warehouse-management', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-fefo', organizationId] }),
    ])
  }

  const invalidarSiHayConflicto = async (error: unknown) => {
    if (esConflictoVersionReparacion(error)) await invalidarLecturasReparacion()
  }

  const crearMutation = useMutation({
    mutationFn: ({ datos, operationKey }: { datos: DatosReparacion; operationKey: string }) =>
      crearReparacion(organizationId, datos, operationKey),
    onSuccess: invalidar,
  })
  const actualizarMutation = useMutation({
    mutationFn: ({ id, datos, identidadEditable, expectedLockVersion }: { id: string; datos: DatosReparacion; identidadEditable: boolean; expectedLockVersion: number }) =>
      actualizarReparacion(organizationId, id, datos, identidadEditable, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const asignarMutation = useMutation({
    mutationFn: ({ id, tecnicoId, expectedLockVersion }: { id: string; tecnicoId: string; expectedLockVersion: number }) =>
      asignarReparacion(organizationId, id, tecnicoId, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const estadoMutation = useMutation({
    mutationFn: ({
      id,
      estado,
      observacion,
      expectedLockVersion,
    }: {
      id: string
      estado: string
      observacion: string
      expectedLockVersion: number
    }) => cambiarEstadoReparacion(organizationId, id, estado, observacion, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const diagnosticoMutation = useMutation({
    mutationFn: ({ id, datos, expectedLockVersion }: { id: string; datos: DatosDiagnostico; expectedLockVersion: number }) =>
      registrarDiagnosticoReparacion(organizationId, id, datos, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const solucionMutation = useMutation({
    mutationFn: ({ id, datos, expectedLockVersion }: { id: string; datos: DatosSolucionReparacion; expectedLockVersion: number }) =>
      registrarSolucionReparacion(organizationId, id, datos, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const cotizacionMutation = useMutation({
    mutationFn: ({
      id,
      datos,
      enviar,
      operationKey,
      expectedLockVersion,
    }: {
      id: string
      datos: DatosCotizacion
      enviar: boolean
      operationKey: string
      expectedLockVersion: number
    }) => guardarCotizacionReparacion(organizationId, id, datos, enviar, operationKey, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const aprobarCotizacionMutation = useMutation({
    mutationFn: ({
      repairId,
      quoteId,
      datos,
      expectedLockVersion,
    }: {
      repairId: string
      quoteId: string
      datos: DatosObservacionReparacion
      expectedLockVersion: number
    }) => aprobarCotizacionReparacion(organizationId, repairId, quoteId, datos, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const revisarCotizacionMutation = useMutation({
    mutationFn: ({
      repairId,
      quoteId,
      datos,
      enviar,
      operationKey,
      expectedLockVersion,
    }: {
      repairId: string
      quoteId: string
      datos: DatosCotizacion
      enviar: boolean
      operationKey: string
      expectedLockVersion: number
    }) => revisarCotizacionReparacion(organizationId, repairId, quoteId, datos, enviar, operationKey, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const rechazarCotizacionMutation = useMutation({
    mutationFn: ({
      repairId,
      quoteId,
      datos,
      expectedLockVersion,
    }: {
      repairId: string
      quoteId: string
      datos: DatosObservacionReparacion
      expectedLockVersion: number
    }) => rechazarCotizacionReparacion(organizationId, repairId, quoteId, datos, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const reservaMutation = useMutation({
    mutationFn: ({
      repairId,
      datos,
      operationKey,
      expectedLockVersion,
    }: {
      repairId: string
      datos: DatosReservaParte
      operationKey: string
      expectedLockVersion: number
    }) => reservarParteReparacion(organizationId, repairId, datos, operationKey, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const consumoMutation = useMutation({
    mutationFn: ({
      partId,
      datos,
      operationKey,
      expectedLockVersion,
    }: {
      partId: string
      datos: DatosConsumoParte
      operationKey: string
      expectedLockVersion: number
    }) => consumirParteReparacion(organizationId, partId, datos, operationKey, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const cancelacionParteMutation = useMutation({
    mutationFn: ({
      partId,
      datos,
      expectedLockVersion,
    }: {
      partId: string
      datos: DatosObservacionReparacion
      expectedLockVersion: number
    }) => cancelarParteReparacion(organizationId, partId, datos, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const pruebaMutation = useMutation({
    mutationFn: ({ id, datos, expectedLockVersion }: { id: string; datos: DatosPrueba; expectedLockVersion: number }) =>
      registrarPruebaReparacion(organizationId, id, datos, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const entregaMutation = useMutation({
    mutationFn: ({ id, datos, expectedLockVersion }: { id: string; datos: DatosObservacionReparacion; expectedLockVersion: number }) =>
      entregarReparacion(organizationId, id, datos, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })
  const cancelacionMutation = useMutation({
    mutationFn: ({ id, datos, expectedLockVersion }: { id: string; datos: DatosObservacionReparacion; expectedLockVersion: number }) =>
      cancelarReparacion(organizationId, id, datos, expectedLockVersion),
    onSuccess: invalidar,
    onError: invalidarSiHayConflicto,
  })

  return {
    reparaciones: listaQuery.data?.elementos ?? reparacionesVacias,
    totalFiltrado: listaQuery.data?.totalFiltrado ?? 0,
    resumen: resumenQuery.data ?? resumenVacio,
    cargando: listaQuery.isLoading || resumenQuery.isLoading,
    error: listaQuery.error ?? resumenQuery.error,
    reintentar: async () => {
      await Promise.all([listaQuery.refetch(), resumenQuery.refetch()])
    },
    creando: crearMutation.isPending,
    actualizando: actualizarMutation.isPending,
    asignando: asignarMutation.isPending,
    cambiandoEstado: estadoMutation.isPending,
    registrandoDiagnostico: diagnosticoMutation.isPending,
    guardandoSolucion: solucionMutation.isPending,
    guardandoCotizacion: cotizacionMutation.isPending,
    revisandoCotizacion: revisarCotizacionMutation.isPending,
    aprobandoCotizacion: aprobarCotizacionMutation.isPending,
    rechazandoCotizacion: rechazarCotizacionMutation.isPending,
    reservandoParte: reservaMutation.isPending,
    consumiendoParte: consumoMutation.isPending,
    cancelandoParte: cancelacionParteMutation.isPending,
    registrandoPrueba: pruebaMutation.isPending,
    entregando: entregaMutation.isPending,
    cancelando: cancelacionMutation.isPending,
    recuperarCreacionPendiente: () => leerCreacionPendiente(ambitoCreacion)?.datos,
    crear: async (datos: DatosReparacion, operationKey: string) => {
      try {
        await crearConReintentoPersistente(ambitoCreacion, datos, operationKey,
          (datosPendientes, clave) => crearMutation.mutateAsync({ datos: datosPendientes, operationKey: clave }))
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo registrar la reparación.')
      }
    },
    actualizar: async (id: string, datos: DatosReparacion, identidadEditable: boolean, expectedLockVersion: number) => {
      try {
        await actualizarMutation.mutateAsync({ id, datos, identidadEditable, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo actualizar la reparación.')
      }
    },
    asignar: async (id: string, tecnicoId: string, expectedLockVersion: number) => {
      try {
        await asignarMutation.mutateAsync({ id, tecnicoId, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo asignar el técnico.')
      }
    },
    cambiarEstado: async (id: string, estado: string, observacion: string, expectedLockVersion: number) => {
      try {
        await estadoMutation.mutateAsync({ id, estado, observacion, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo cambiar el estado.')
      }
    },
    registrarDiagnostico: async (id: string, datos: DatosDiagnostico, expectedLockVersion: number) => {
      try {
        await diagnosticoMutation.mutateAsync({ id, datos, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo registrar el diagnóstico.')
      }
    },
    registrarSolucion: async (id: string, datos: DatosSolucionReparacion, expectedLockVersion: number) => {
      try {
        await solucionMutation.mutateAsync({ id, datos, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo guardar la solución aplicada.')
      }
    },
    guardarCotizacion: async (id: string, datos: DatosCotizacion, enviar: boolean, operationKey: string, expectedLockVersion: number) => {
      try {
        await cotizacionMutation.mutateAsync({ id, datos, enviar, operationKey, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo guardar la cotización.')
      }
    },
    revisarCotizacion: async (
      repairId: string,
      quoteId: string,
      datos: DatosCotizacion,
      enviar: boolean,
      operationKey: string,
      expectedLockVersion: number,
    ) => {
      try {
        await revisarCotizacionMutation.mutateAsync({ repairId, quoteId, datos, enviar, operationKey, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo crear la revisión de la cotización.')
      }
    },
    aprobarCotizacion: async (
      repairId: string,
      quoteId: string,
      datos: DatosObservacionReparacion,
      expectedLockVersion: number,
    ) => {
      try {
        await aprobarCotizacionMutation.mutateAsync({ repairId, quoteId, datos, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo aprobar la cotización.')
      }
    },
    rechazarCotizacion: async (
      repairId: string,
      quoteId: string,
      datos: DatosObservacionReparacion,
      expectedLockVersion: number,
    ) => {
      try {
        await rechazarCotizacionMutation.mutateAsync({ repairId, quoteId, datos, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo rechazar la cotización.')
      }
    },
    reservarParte: async (repairId: string, datos: DatosReservaParte, operationKey: string, expectedLockVersion: number) => {
      try {
        await reservaMutation.mutateAsync({ repairId, datos, operationKey, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo reservar el repuesto.')
      }
    },
    consumirParte: async (partId: string, datos: DatosConsumoParte, operationKey: string, expectedLockVersion: number) => {
      try {
        await consumoMutation.mutateAsync({ partId, datos, operationKey, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo consumir el repuesto.')
      }
    },
    cancelarParte: async (
      partId: string,
      datos: DatosObservacionReparacion,
      expectedLockVersion: number,
    ) => {
      try {
        await cancelacionParteMutation.mutateAsync({ partId, datos, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo cancelar la reserva.')
      }
    },
    registrarPrueba: async (id: string, datos: DatosPrueba, expectedLockVersion: number) => {
      try {
        await pruebaMutation.mutateAsync({ id, datos, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo registrar la prueba.')
      }
    },
    entregar: async (id: string, datos: DatosObservacionReparacion, expectedLockVersion: number) => {
      try {
        await entregaMutation.mutateAsync({ id, datos, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo entregar la reparación.')
      }
    },
    cancelar: async (id: string, datos: DatosObservacionReparacion, expectedLockVersion: number) => {
      try {
        await cancelacionMutation.mutateAsync({ id, datos, expectedLockVersion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo cancelar la reparación.')
      }
    },
  }
}
