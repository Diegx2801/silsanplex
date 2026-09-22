import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { fechaActualPeru } from '@/lib/fechas'
import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'
import type { DatosVenta, ModoCumplimientoPedido } from '@/modulos/ventas/modelo/operacionVenta'
import { inventoryQueryKeys } from '@/modulos/inventario/estado/inventoryQueryKeys'
import {
  actualizarCantidadesPedidoPersistente,
  cancelarPedidoPersistente,
  completarServiciosPersistente,
  crearPedidoPersistente,
  despacharVentaPersistente,
  listarPedidosPersistentes,
  listarVentasPersistentes,
  registrarVentaPersistente,
  type CantidadLineaPedido,
  type CantidadDespacho,
  type CantidadCumplimientoServicio,
} from '@/modulos/ventas/servicios/ventasService'
import { cotizacionesQueryKeys } from '@/modulos/ventas/estado/useCotizacionesPersistentes'

interface UseOperacionesVentaProps {
  cotizaciones: readonly Cotizacion[]
  /** Kept optional for legacy consumers; persistent quotes are accepted by the DB RPC. */
  aceptarCotizacion?: (cotizacionId: string) => string | undefined
}

export function useOperacionesVenta({
  cotizaciones,
  aceptarCotizacion,
}: UseOperacionesVentaProps) {
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const pedidosQueryKey = ['sales-orders', organizationId] as const
  const ventasQueryKey = ['sales', organizationId] as const
  const inventoryQueryKey = ['inventory', organizationId] as const
  const inventoryFefoQueryKey = ['inventory-fefo', organizationId] as const
  const pedidosQuery = useQuery({
    queryKey: pedidosQueryKey,
    queryFn: () => listarPedidosPersistentes(organizationId),
    enabled: Boolean(organizationId),
  })
  const ventasQuery = useQuery({
    queryKey: ventasQueryKey,
    queryFn: () => listarVentasPersistentes(organizationId),
    enabled: Boolean(organizationId),
  })

  const crearPedidoMutation = useMutation({
    mutationFn: async ({ cotizacionId, warehouseId, fulfillmentMode }: { cotizacionId: string; warehouseId: string; fulfillmentMode: ModoCumplimientoPedido }) => {
      const cotizacion = cotizaciones.find((item) => item.id === cotizacionId)
      if (!cotizacion || cotizacion.estado !== 'emitida') {
        throw new Error('La cotización debe estar emitida para crear el pedido')
      }
      if (cotizacion.fechaValidez < fechaActualPeru()) {
        throw new Error('La cotización está vencida; emite una nueva propuesta antes de crear el pedido')
      }
      const pedidoId = await crearPedidoPersistente(organizationId, cotizacion, warehouseId, fulfillmentMode)
      // New persistent quotes are accepted atomically by create_order. The
      // optional callback only preserves compatibility with legacy consumers.
      aceptarCotizacion?.(cotizacionId)
      return pedidoId
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pedidosQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryFefoQueryKey }),
        queryClient.invalidateQueries({ queryKey: cotizacionesQueryKeys.all(organizationId) }),
      ])
    },
  })

  const registrarVentaMutation = useMutation({
    mutationFn: ({ pedidoId, datos }: { pedidoId: string; datos: DatosVenta }) =>
      registrarVentaPersistente(organizationId, pedidoId, datos),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ventasQueryKey }),
        queryClient.invalidateQueries({ queryKey: pedidosQueryKey }),
      ])
    },
  })

  const actualizarPedidoMutation = useMutation({
    mutationFn: ({
      pedidoId,
      lineas,
      operationKey,
    }: {
      pedidoId: string
      lineas: readonly CantidadLineaPedido[]
      operationKey?: string
    }) => actualizarCantidadesPedidoPersistente(organizationId, pedidoId, lineas, operationKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pedidosQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryFefoQueryKey }),
      ])
    },
  })

  const cancelarPedidoMutation = useMutation({
    mutationFn: ({ pedidoId, operationKey }: { pedidoId: string; operationKey?: string }) =>
      cancelarPedidoPersistente(organizationId, pedidoId, operationKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pedidosQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryFefoQueryKey }),
      ])
    },
  })

  const despacharVentaMutation = useMutation({
    mutationFn: ({ pedidoId, ventaId, lineas, operationKey, operationDate }: {
      pedidoId: string
      ventaId: string
      lineas: readonly CantidadDespacho[]
      operationKey?: string
      operationDate?: string
    }) => despacharVentaPersistente(organizationId, pedidoId, ventaId, lineas, operationKey, operationDate),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ventasQueryKey }),
        queryClient.invalidateQueries({ queryKey: pedidosQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryFefoQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.kardexRoot(organizationId) }),
      ])
    },
  })

  const completarServiciosMutation = useMutation({
    mutationFn: ({ pedidoId, ventaId, lineas, operationKey }: {
      pedidoId: string
      ventaId: string
      lineas: readonly CantidadCumplimientoServicio[]
      operationKey?: string
    }) => completarServiciosPersistente(organizationId, pedidoId, ventaId, lineas, operationKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ventasQueryKey }),
        queryClient.invalidateQueries({ queryKey: pedidosQueryKey }),
      ])
    },
  })

  const crearPedido = async (cotizacionId: string, warehouseId: string, fulfillmentMode: ModoCumplimientoPedido = 'delivery') => {
    try {
      await crearPedidoMutation.mutateAsync({ cotizacionId, warehouseId, fulfillmentMode })
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo crear el pedido'
    }
  }

  const registrarVenta = async (pedidoId: string, datos: DatosVenta) => {
    try {
      await registrarVentaMutation.mutateAsync({ pedidoId, datos })
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo registrar la venta'
    }
  }

  const actualizarPedido = async (
    pedidoId: string,
    lineas: readonly CantidadLineaPedido[],
    operationKey?: string,
  ) => {
    try {
      await actualizarPedidoMutation.mutateAsync({ pedidoId, lineas, operationKey })
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo modificar el pedido'
    }
  }

  const cancelarPedido = async (pedidoId: string, operationKey?: string) => {
    try {
      await cancelarPedidoMutation.mutateAsync({ pedidoId, operationKey })
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo cancelar el pedido'
    }
  }

  const despacharVenta = async (
    pedidoId: string,
    ventaId: string,
    lineas: readonly CantidadDespacho[],
    operationKey?: string,
    operationDate?: string,
  ) => {
    try {
      await despacharVentaMutation.mutateAsync({ pedidoId, ventaId, lineas, operationKey, operationDate })
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo despachar la venta'
    }
  }

  const completarServicios = async (
    pedidoId: string,
    ventaId: string,
    lineas: readonly CantidadCumplimientoServicio[],
    operationKey?: string,
  ) => {
    try {
      await completarServiciosMutation.mutateAsync({ pedidoId, ventaId, lineas, operationKey })
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudieron completar los servicios'
    }
  }

  const reintentar = async () => {
    await Promise.all([pedidosQuery.refetch(), ventasQuery.refetch()])
  }

  return {
    pedidos: pedidosQuery.data ?? [],
    ventas: ventasQuery.data ?? [],
    crearPedido,
    registrarVenta,
    actualizarPedido,
    cancelarPedido,
    despacharVenta,
    completarServicios,
    creandoPedido: crearPedidoMutation.isPending,
    registrandoVenta: registrarVentaMutation.isPending,
    actualizandoPedido: actualizarPedidoMutation.isPending,
    cancelandoPedido: cancelarPedidoMutation.isPending,
    despachandoVenta: despacharVentaMutation.isPending,
    completandoServicios: completarServiciosMutation.isPending,
    cargando: pedidosQuery.isLoading || ventasQuery.isLoading,
    error: pedidosQuery.error ?? ventasQuery.error,
    reintentar,
  }
}
