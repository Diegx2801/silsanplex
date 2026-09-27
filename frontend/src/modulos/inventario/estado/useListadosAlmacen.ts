import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type {
  ConsultaAlertasStock,
  ConsultaKardex,
  ConsultaStockDetallado,
  ConsultaTransferencias,
  ConsultaVencimientos,
} from '@/modulos/inventario/modelo/almacen'
import {
  listarAlertasStock,
  listarKardex,
  listarStockDetallado,
  listarTransferencias,
  listarVencimientos,
} from '@/modulos/inventario/servicios/almacenService'
import { inventoryQueryKeys } from './inventoryQueryKeys'

interface ConsultasListadosAlmacen {
  stock?: ConsultaStockDetallado
  alertas?: ConsultaAlertasStock
  vencimientos?: ConsultaVencimientos
  kardex?: ConsultaKardex
  transferencias?: ConsultaTransferencias
}

export function useListadosAlmacen(consultas: ConsultasListadosAlmacen) {
  const {
    stock: stockConsulta,
    alertas: alertasConsulta,
    vencimientos: vencimientosConsulta,
    kardex: kardexConsulta,
    transferencias: transferenciasConsulta,
  } = consultas
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const base = inventoryQueryKeys.listings(organizationId)
  const comunes = {
    placeholderData: keepPreviousData,
  }
  const stock = useQuery({
    ...comunes,
    enabled: Boolean(organizationId && stockConsulta),
    queryKey: [...base, 'stock', consultas.stock],
    queryFn: stockConsulta
      ? () => listarStockDetallado(organizationId, stockConsulta)
      : skipToken,
  })
  const alertas = useQuery({
    ...comunes,
    enabled: Boolean(organizationId && alertasConsulta),
    queryKey: [...base, 'alertas-stock', consultas.alertas],
    queryFn: alertasConsulta
      ? () => listarAlertasStock(organizationId, alertasConsulta)
      : skipToken,
  })
  const vencimientos = useQuery({
    ...comunes,
    enabled: Boolean(organizationId && vencimientosConsulta),
    queryKey: [...base, 'vencimientos', consultas.vencimientos],
    queryFn: vencimientosConsulta
      ? () => listarVencimientos(organizationId, vencimientosConsulta)
      : skipToken,
  })
  const kardex = useQuery({
    ...comunes,
    enabled: Boolean(organizationId && kardexConsulta),
    queryKey: [
      ...inventoryQueryKeys.kardexRoot(organizationId),
      consultas.kardex,
    ],
    queryFn: kardexConsulta
      ? () => listarKardex(organizationId, kardexConsulta)
      : skipToken,
  })
  const transferencias = useQuery({
    ...comunes,
    enabled: Boolean(organizationId && transferenciasConsulta),
    queryKey: [...base, 'transferencias', consultas.transferencias],
    queryFn: transferenciasConsulta
      ? () => listarTransferencias(organizationId, transferenciasConsulta)
      : skipToken,
  })

  return { stock, alertas, vencimientos, kardex, transferencias }
}
