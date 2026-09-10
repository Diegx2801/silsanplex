import type { ConsultaKardex } from '@/modulos/inventario/modelo/almacen'

export const inventoryQueryKeys = {
  warehouseManagement: (organizationId: string) =>
    ['warehouse-management', organizationId] as const,
  listings: (organizationId: string) =>
    [...inventoryQueryKeys.warehouseManagement(organizationId), 'listados'] as const,
  kardexRoot: (organizationId: string) =>
    [...inventoryQueryKeys.listings(organizationId), 'kardex'] as const,
  kardex: (organizationId: string, filters: ConsultaKardex) =>
    [...inventoryQueryKeys.kardexRoot(organizationId), filters] as const,
}
