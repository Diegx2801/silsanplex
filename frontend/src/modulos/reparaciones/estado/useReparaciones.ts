import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
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
  guardarCotizacionReparacion,
  listarReparacionesPaginadas,
  obtenerResumenReparaciones,
  rechazarCotizacionReparacion,
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
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
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

  const invalidar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: reparacionesKey }),
      queryClient.invalidateQueries({
        queryKey: ['repair-detail', organizationId],
      }),
      queryClient.invalidateQueries({ queryKey: ['inventory', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['warehouse-management', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-fefo', organizationId] }),
    ])
  }

  const crearMutation = useMutation({
    mutationFn: (datos: DatosReparacion) => crearReparacion(organizationId, datos),
    onSuccess: invalidar,
  })
  const actualizarMutation = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: DatosReparacion }) =>
      actualizarReparacion(organizationId, id, datos),
    onSuccess: invalidar,
  })
  const asignarMutation = useMutation({
    mutationFn: ({ id, tecnicoId }: { id: string; tecnicoId: string }) =>
      asignarReparacion(organizationId, id, tecnicoId),
    onSuccess: invalidar,
  })
  const estadoMutation = useMutation({
    mutationFn: ({
      id,
      estado,
      observacion,
    }: {
      id: string
      estado: string
      observacion: string
    }) => cambiarEstadoReparacion(organizationId, id, estado, observacion),
    onSuccess: invalidar,
  })
  const diagnosticoMutation = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: DatosDiagnostico }) =>
      registrarDiagnosticoReparacion(organizationId, id, datos),
    onSuccess: invalidar,
  })
  const solucionMutation = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: DatosSolucionReparacion }) =>
      registrarSolucionReparacion(organizationId, id, datos),
    onSuccess: invalidar,
  })
  const cotizacionMutation = useMutation({
    mutationFn: ({
      id,
      datos,
      enviar,
    }: {
      id: string
      datos: DatosCotizacion
      enviar: boolean
    }) => guardarCotizacionReparacion(organizationId, id, datos, enviar),
    onSuccess: invalidar,
  })
  const aprobarCotizacionMutation = useMutation({
    mutationFn: ({
      repairId,
      quoteId,
      datos,
    }: {
      repairId: string
      quoteId: string
      datos: DatosObservacionReparacion
    }) => aprobarCotizacionReparacion(organizationId, repairId, quoteId, datos),
    onSuccess: invalidar,
  })
  const rechazarCotizacionMutation = useMutation({
    mutationFn: ({
      repairId,
      quoteId,
      datos,
    }: {
      repairId: string
      quoteId: string
      datos: DatosObservacionReparacion
    }) => rechazarCotizacionReparacion(organizationId, repairId, quoteId, datos),
    onSuccess: invalidar,
  })
  const reservaMutation = useMutation({
    mutationFn: ({
      repairId,
      datos,
    }: {
      repairId: string
      datos: DatosReservaParte
    }) => reservarParteReparacion(organizationId, repairId, datos),
    onSuccess: invalidar,
  })
  const consumoMutation = useMutation({
    mutationFn: ({
      partId,
      datos,
      operationKey,
    }: {
      partId: string
      datos: DatosConsumoParte
      operationKey: string
    }) => consumirParteReparacion(organizationId, partId, datos, operationKey),
    onSuccess: invalidar,
  })
  const cancelacionParteMutation = useMutation({
    mutationFn: ({
      partId,
      datos,
    }: {
      partId: string
      datos: DatosObservacionReparacion
    }) => cancelarParteReparacion(organizationId, partId, datos),
    onSuccess: invalidar,
  })
  const pruebaMutation = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: DatosPrueba }) =>
      registrarPruebaReparacion(organizationId, id, datos),
    onSuccess: invalidar,
  })
  const entregaMutation = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: DatosObservacionReparacion }) =>
      entregarReparacion(organizationId, id, datos),
    onSuccess: invalidar,
  })
  const cancelacionMutation = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: DatosObservacionReparacion }) =>
      cancelarReparacion(organizationId, id, datos),
    onSuccess: invalidar,
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
    aprobandoCotizacion: aprobarCotizacionMutation.isPending,
    rechazandoCotizacion: rechazarCotizacionMutation.isPending,
    reservandoParte: reservaMutation.isPending,
    consumiendoParte: consumoMutation.isPending,
    cancelandoParte: cancelacionParteMutation.isPending,
    registrandoPrueba: pruebaMutation.isPending,
    entregando: entregaMutation.isPending,
    cancelando: cancelacionMutation.isPending,
    crear: async (datos: DatosReparacion) => {
      try {
        await crearMutation.mutateAsync(datos)
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo registrar la reparación.')
      }
    },
    actualizar: async (id: string, datos: DatosReparacion) => {
      try {
        await actualizarMutation.mutateAsync({ id, datos })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo actualizar la reparación.')
      }
    },
    asignar: async (id: string, tecnicoId: string) => {
      try {
        await asignarMutation.mutateAsync({ id, tecnicoId })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo asignar el técnico.')
      }
    },
    cambiarEstado: async (id: string, estado: string, observacion: string) => {
      try {
        await estadoMutation.mutateAsync({ id, estado, observacion })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo cambiar el estado.')
      }
    },
    registrarDiagnostico: async (id: string, datos: DatosDiagnostico) => {
      try {
        await diagnosticoMutation.mutateAsync({ id, datos })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo registrar el diagnóstico.')
      }
    },
    registrarSolucion: async (id: string, datos: DatosSolucionReparacion) => {
      try {
        await solucionMutation.mutateAsync({ id, datos })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo guardar la solución aplicada.')
      }
    },
    guardarCotizacion: async (id: string, datos: DatosCotizacion, enviar: boolean) => {
      try {
        await cotizacionMutation.mutateAsync({ id, datos, enviar })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo guardar la cotización.')
      }
    },
    aprobarCotizacion: async (
      repairId: string,
      quoteId: string,
      datos: DatosObservacionReparacion,
    ) => {
      try {
        await aprobarCotizacionMutation.mutateAsync({ repairId, quoteId, datos })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo aprobar la cotización.')
      }
    },
    rechazarCotizacion: async (
      repairId: string,
      quoteId: string,
      datos: DatosObservacionReparacion,
    ) => {
      try {
        await rechazarCotizacionMutation.mutateAsync({ repairId, quoteId, datos })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo rechazar la cotización.')
      }
    },
    reservarParte: async (repairId: string, datos: DatosReservaParte) => {
      try {
        await reservaMutation.mutateAsync({ repairId, datos })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo reservar el repuesto.')
      }
    },
    consumirParte: async (partId: string, datos: DatosConsumoParte, operationKey: string) => {
      try {
        await consumoMutation.mutateAsync({ partId, datos, operationKey })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo consumir el repuesto.')
      }
    },
    cancelarParte: async (
      partId: string,
      datos: DatosObservacionReparacion,
    ) => {
      try {
        await cancelacionParteMutation.mutateAsync({ partId, datos })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo cancelar la reserva.')
      }
    },
    registrarPrueba: async (id: string, datos: DatosPrueba) => {
      try {
        await pruebaMutation.mutateAsync({ id, datos })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo registrar la prueba.')
      }
    },
    entregar: async (id: string, datos: DatosObservacionReparacion) => {
      try {
        await entregaMutation.mutateAsync({ id, datos })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo entregar la reparación.')
      }
    },
    cancelar: async (id: string, datos: DatosObservacionReparacion) => {
      try {
        await cancelacionMutation.mutateAsync({ id, datos })
        return undefined
      } catch (error) {
        return mensajeDeError(error, 'No se pudo cancelar la reparación.')
      }
    },
  }
}
