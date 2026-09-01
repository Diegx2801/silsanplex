import { keepPreviousData, useQuery } from '@tanstack/react-query'

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

interface ConsultasListadosAlmacen {
  stock: ConsultaStockDetallado
  alertas: ConsultaAlertasStock
  vencimientos: ConsultaVencimientos
  kardex: ConsultaKardex
  transferencias: ConsultaTransferencias
}

export function useListadosAlmacen(consultas: ConsultasListadosAlmacen) {
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const base = ['warehouse-management', organizationId, 'listados'] as const
  const comunes = {
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  }
  const stock = useQuery({
    ...comunes,
    queryKey: [...base, 'stock', consultas.stock],
    queryFn: () => listarStockDetallado(organizationId, consultas.stock),
  })
  const alertas = useQuery({
    ...comunes,
    queryKey: [...base, 'alertas-stock', consultas.alertas],
    queryFn: () => listarAlertasStock(organizationId, consultas.alertas),
  })
  const vencimientos = useQuery({
    ...comunes,
    queryKey: [...base, 'vencimientos', consultas.vencimientos],
    queryFn: () => listarVencimientos(organizationId, consultas.vencimientos),
  })
  const kardex = useQuery({
    ...comunes,
    queryKey: [...base, 'kardex', consultas.kardex],
    queryFn: () => listarKardex(organizationId, consultas.kardex),
  })
  const transferencias = useQuery({
    ...comunes,
    queryKey: [...base, 'transferencias', consultas.transferencias],
    queryFn: () => listarTransferencias(organizationId, consultas.transferencias),
  })

  return { stock, alertas, vencimientos, kardex, transferencias }
}
