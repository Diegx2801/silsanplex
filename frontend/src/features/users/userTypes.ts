export const roleOptions = [
  { code: 'ADMIN', label: 'Administración' },
  { code: 'GERENCIA', label: 'Gerencia' },
  { code: 'LOGISTICA', label: 'Logística' },
  { code: 'ALMACEN', label: 'Almacén' },
  { code: 'COMPRAS', label: 'Compras' },
  { code: 'VENTAS', label: 'Ventas' },
  { code: 'CONTABILIDAD', label: 'Contabilidad' },
  { code: 'TECNICO_REPARACIONES', label: 'Técnico de reparaciones' },
] as const

export type RoleCode = (typeof roleOptions)[number]['code']

export interface ManagedUser {
  id: string
  organizationId: string
  email: string
  fullName: string
  phone: string | null
  isActive: boolean
  authConfirmedAt: string | null
  roleCodes: RoleCode[]
  createdAt: string
  updatedAt: string
}

export interface UserInput {
  email: string
  fullName: string
  phone: string
  roleCodes: RoleCode[]
}
