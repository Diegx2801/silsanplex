import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'
import type { DatosVenta } from '@/modulos/ventas/modelo/operacionVenta'
import {
  actualizarCantidadesPedidoPersistente,
  cancelarPedidoPersistente,
  crearPedidoPersistente,
  despacharVentaPersistente,
  listarPedidosPersistentes,
  listarVentasPersistentes,
  registrarVentaPersistente,
  type CantidadLineaPedido,
  type CantidadDespacho,
} from '@/modulos/ventas/servicios/ventasService'

interface UseOperacionesVentaProps {
  cotizaciones: readonly Cotizacion[]
  aceptarCotizacion: (cotizacionId: string) => string | undefined
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
    mutationFn: async ({ cotizacionId, warehouseId }: { cotizacionId: string; warehouseId: string }) => {
      const cotizacion = cotizaciones.find((item) => item.id === cotizacionId)
      if (!cotizacion || cotizacion.estado !== 'emitida') {
        throw new Error('La cotización debe estar emitida para crear el pedido')
      }
      if (cotizacion.fechaValidez < new Date().toISOString().slice(0, 10)) {
        throw new Error('La cotización está vencida; emite una nueva propuesta antes de crear el pedido')
      }
      const pedidoId = await crearPedidoPersistente(organizationId, cotizacion, warehouseId)
      // La cotización sigue siendo un borrador temporal. Su actualización no
      // participa en la transacción del pedido y nunca decide su existencia.
      aceptarCotizacion(cotizacionId)
      return pedidoId
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pedidosQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: inventoryFefoQueryKey }),
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
        queryClient.invalidateQueries({ queryKey: ['inventory-kardex', organizationId] }),
      ])
    },
  })

  const crearPedido = async (cotizacionId: string, warehouseId: string) => {
    try {
      await crearPedidoMutation.mutateAsync({ cotizacionId, warehouseId })
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
    creandoPedido: crearPedidoMutation.isPending,
    registrandoVenta: registrarVentaMutation.isPending,
    actualizandoPedido: actualizarPedidoMutation.isPending,
    cancelandoPedido: cancelarPedidoMutation.isPending,
    despachandoVenta: despacharVentaMutation.isPending,
    cargando: pedidosQuery.isLoading || ventasQuery.isLoading,
    error: pedidosQuery.error ?? ventasQuery.error,
    reintentar,
  }
}
