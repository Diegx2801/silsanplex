import { PERMISSIONS, type Permission } from '@/features/auth/permissions'

export type PermissionCode = Permission

export interface AccessCapability {
  code: string
  label: string
  permissionCodes: readonly PermissionCode[]
}

export interface AccessModule {
  code: string
  label: string
  description: string
  capabilities: readonly AccessCapability[]
}

export const operationalAccessModules: readonly AccessModule[] = [
  { code: 'products', label: 'Productos', description: 'Catálogo, precios y datos comerciales.', capabilities: [
    { code: 'products-view', label: 'Consultar', permissionCodes: [PERMISSIONS.PRODUCTS_VIEW] },
    { code: 'products-manage', label: 'Administrar', permissionCodes: [PERMISSIONS.PRODUCTS_MANAGE] },
  ] },
  { code: 'inventory', label: 'Inventario', description: 'Almacenes, ubicaciones, existencias y movimientos.', capabilities: [
    { code: 'inventory-view', label: 'Consultar', permissionCodes: [PERMISSIONS.INVENTORY_VIEW] },
    { code: 'inventory-manage', label: 'Administrar', permissionCodes: [PERMISSIONS.INVENTORY_MANAGE] },
  ] },
  { code: 'suppliers', label: 'Proveedores', description: 'Directorio fiscal y comercial de proveedores.', capabilities: [
    { code: 'suppliers-view', label: 'Consultar', permissionCodes: [PERMISSIONS.SUPPLIERS_VIEW] },
    { code: 'suppliers-manage', label: 'Administrar', permissionCodes: [PERMISSIONS.SUPPLIERS_MANAGE] },
  ] },
  { code: 'purchases', label: 'Compras', description: 'Órdenes de compra y recepción de mercadería.', capabilities: [
    { code: 'purchases-view', label: 'Consultar', permissionCodes: [PERMISSIONS.PURCHASES_VIEW] },
    { code: 'purchases-manage', label: 'Administrar', permissionCodes: [PERMISSIONS.PURCHASES_MANAGE] },
    { code: 'purchases-receive', label: 'Recibir', permissionCodes: [PERMISSIONS.PURCHASES_RECEIVE] },
  ] },
  { code: 'customers', label: 'Clientes', description: 'Directorio fiscal, contactos y direcciones.', capabilities: [
    { code: 'customers-view', label: 'Consultar', permissionCodes: [PERMISSIONS.CUSTOMERS_VIEW] },
    { code: 'customers-manage', label: 'Administrar', permissionCodes: [PERMISSIONS.CUSTOMERS_MANAGE] },
    { code: 'customers-export', label: 'Exportar', permissionCodes: [PERMISSIONS.CUSTOMERS_EXPORT] },
  ] },
  { code: 'repairs', label: 'Reparaciones', description: 'Órdenes de servicio y operación técnica.', capabilities: [
    { code: 'repairs-view', label: 'Consultar', permissionCodes: [PERMISSIONS.REPAIRS_VIEW] },
    { code: 'repairs-operate', label: 'Operar', permissionCodes: [
      PERMISSIONS.REPAIRS_CREATE, PERMISSIONS.REPAIRS_UPDATE, PERMISSIONS.REPAIRS_ASSIGN,
      PERMISSIONS.REPAIRS_CHANGE_STATUS, PERMISSIONS.REPAIRS_APPROVE_QUOTE,
      PERMISSIONS.REPAIRS_USE_PARTS, PERMISSIONS.REPAIRS_DELIVER,
      PERMISSIONS.REPAIRS_PERFORM_TECHNICAL,
    ] },
  ] },
  { code: 'sales', label: 'Ventas', description: 'Cotizaciones, pedidos y despacho.', capabilities: [
    { code: 'sales-view', label: 'Consultar', permissionCodes: [PERMISSIONS.SALES_VIEW] },
    { code: 'sales-manage', label: 'Administrar', permissionCodes: [PERMISSIONS.SALES_MANAGE] },
  ] },
  { code: 'distribution', label: 'Distribución', description: 'Rutas, asignaciones y entregas.', capabilities: [
    { code: 'distribution-view', label: 'Consultar', permissionCodes: [PERMISSIONS.DISTRIBUTION_VIEW] },
    { code: 'distribution-manage', label: 'Administrar', permissionCodes: [PERMISSIONS.DISTRIBUTION_MANAGE] },
  ] },
] as const

export const assignablePermissionCodes = [
  ...new Set(
    operationalAccessModules.flatMap((module) =>
      module.capabilities.flatMap((capability) => capability.permissionCodes),
    ),
  ),
] as PermissionCode[]

const permissionDependencies: Partial<Record<PermissionCode, readonly PermissionCode[]>> = {
  [PERMISSIONS.PRODUCTS_MANAGE]: [PERMISSIONS.PRODUCTS_VIEW],
  [PERMISSIONS.INVENTORY_MANAGE]: [PERMISSIONS.INVENTORY_VIEW],
  [PERMISSIONS.SUPPLIERS_MANAGE]: [PERMISSIONS.SUPPLIERS_VIEW],
  [PERMISSIONS.PURCHASES_VIEW]: [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.SUPPLIERS_VIEW, PERMISSIONS.INVENTORY_VIEW],
  [PERMISSIONS.PURCHASES_MANAGE]: [PERMISSIONS.PURCHASES_VIEW],
  [PERMISSIONS.PURCHASES_RECEIVE]: [PERMISSIONS.PURCHASES_VIEW, PERMISSIONS.INVENTORY_MANAGE],
  [PERMISSIONS.CUSTOMERS_MANAGE]: [PERMISSIONS.CUSTOMERS_VIEW],
  [PERMISSIONS.CUSTOMERS_EXPORT]: [PERMISSIONS.CUSTOMERS_VIEW],
  [PERMISSIONS.SALES_VIEW]: [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.CUSTOMERS_VIEW, PERMISSIONS.INVENTORY_VIEW],
  [PERMISSIONS.SALES_MANAGE]: [PERMISSIONS.SALES_VIEW],
  [PERMISSIONS.DISTRIBUTION_VIEW]: [PERMISSIONS.SALES_VIEW, PERMISSIONS.INVENTORY_VIEW],
  [PERMISSIONS.DISTRIBUTION_MANAGE]: [PERMISSIONS.DISTRIBUTION_VIEW],
  [PERMISSIONS.REPAIRS_CREATE]: [PERMISSIONS.REPAIRS_VIEW],
  [PERMISSIONS.REPAIRS_UPDATE]: [PERMISSIONS.REPAIRS_VIEW],
  [PERMISSIONS.REPAIRS_ASSIGN]: [PERMISSIONS.REPAIRS_VIEW],
  [PERMISSIONS.REPAIRS_CHANGE_STATUS]: [PERMISSIONS.REPAIRS_VIEW],
  [PERMISSIONS.REPAIRS_APPROVE_QUOTE]: [PERMISSIONS.REPAIRS_VIEW],
  [PERMISSIONS.REPAIRS_USE_PARTS]: [PERMISSIONS.REPAIRS_VIEW, PERMISSIONS.INVENTORY_VIEW],
  [PERMISSIONS.REPAIRS_DELIVER]: [PERMISSIONS.REPAIRS_VIEW],
  [PERMISSIONS.REPAIRS_PERFORM_TECHNICAL]: [PERMISSIONS.REPAIRS_VIEW],
}

export function expandPermissionDependencies(codes: readonly PermissionCode[]) {
  const expanded = new Set<PermissionCode>()
  const add = (code: PermissionCode) => {
    if (expanded.has(code)) return
    expanded.add(code)
    permissionDependencies[code]?.forEach(add)
  }
  codes.forEach(add)
  return [...expanded]
}

export function removePermissionWithDependents(codes: readonly PermissionCode[], removedCodes: readonly PermissionCode[]) {
  const removed = new Set(removedCodes)
  let changed = true
  while (changed) {
    changed = false
    for (const code of codes) {
      if (!removed.has(code) && expandPermissionDependencies([code]).some((dependency) => removed.has(dependency))) {
        removed.add(code)
        changed = true
      }
    }
  }
  return codes.filter((code) => !removed.has(code))
}

export interface ManagedUser {
  id: string
  organizationId: string
  email: string
  fullName: string
  phone: string | null
  isActive: boolean
  authConfirmedAt: string | null
  isAdmin: boolean
  permissionCodes: PermissionCode[]
  accessVersion: number
  createdAt: string
  updatedAt: string
}

export interface UserInput {
  email: string
  fullName: string
  phone: string
  isAdmin: boolean
  permissionCodes: PermissionCode[]
}
