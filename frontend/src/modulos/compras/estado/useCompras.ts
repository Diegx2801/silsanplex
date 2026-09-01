import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { validarCompra, type Compra, type DatosCompra, type DatosRecepcionCompra } from '@/modulos/compras/modelo/compras'
import {
  anularCompraPersistente,
  emitirCompraPersistente,
  guardarCompraPersistente,
  listarCompras,
  recibirCompraPersistente,
} from '@/modulos/compras/servicios/compraService'
import type { Producto } from '@/modulos/productos/modelo/producto'
import type { Proveedor } from '@/modulos/proveedores/modelo/proveedor'

const comprasVacias: Compra[] = []

export function useCompras(productos: readonly Producto[], proveedores: readonly Proveedor[]) {
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const queryKey = ['purchase-orders', organizationId] as const
  const query = useQuery({ queryKey, queryFn: () => listarCompras(organizationId), enabled: Boolean(organizationId) })

  const invalidar = async (incluyeInventario = false) => {
    await queryClient.invalidateQueries({ queryKey })
    if (incluyeInventario) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory', organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['warehouse-management', organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-fefo', organizationId] }),
      ])
    }
  }
  const guardarMutation = useMutation({ mutationFn: ({ datos, compraId }: { datos: DatosCompra; compraId?: string }) => guardarCompraPersistente(organizationId, datos, compraId), onSuccess: () => invalidar() })
  const emitirMutation = useMutation({ mutationFn: (id: string) => emitirCompraPersistente(organizationId, id), onSuccess: () => invalidar() })
  const recibirMutation = useMutation({ mutationFn: ({ id, datos }: { id: string; datos: DatosRecepcionCompra }) => recibirCompraPersistente(organizationId, id, datos), onSuccess: () => invalidar(true) })
  const anularMutation = useMutation({ mutationFn: ({ id, motivo }: { id: string; motivo: string }) => anularCompraPersistente(organizationId, id, motivo), onSuccess: () => invalidar() })

  const ejecutar = async (operacion: () => Promise<unknown>) => {
    try {
      await operacion()
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo completar la operación'
    }
  }

  return {
    compras: query.data ?? comprasVacias,
    cargando: query.isLoading,
    error: query.error,
    guardarCompra: async (datos: DatosCompra, compraId?: string) => {
      const compraActual = compraId ? (query.data ?? []).find((item) => item.id === compraId) : undefined
      const proveedor = proveedores.find(
        (item) => item.id === datos.proveedorId && (item.activo || compraActual?.proveedorId === item.id),
      )
      if (!proveedor) return 'El proveedor seleccionado ya no está disponible'
      const errorValidacion = validarCompra(datos, productos)
      if (errorValidacion) return errorValidacion
      return ejecutar(() => guardarMutation.mutateAsync({ datos, compraId }))
    },
    emitirCompra: (id: string) => ejecutar(() => emitirMutation.mutateAsync(id)),
    recibirCompra: (id: string, datos: DatosRecepcionCompra) => ejecutar(() => recibirMutation.mutateAsync({ id, datos })),
    anularCompra: (id: string, motivo: string) => ejecutar(() => anularMutation.mutateAsync({ id, motivo })),
  }
}
