import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@/features/auth/permissions'
import {
  assignablePermissionCodes,
  expandPermissionDependencies,
  operationalAccessModules,
} from './userTypes'

describe('capacidad de exportar inventario', () => {
  it('se asigna como permiso distinto y conserva consultar como requisito', () => {
    const inventario = operationalAccessModules.find((module) => module.code === 'inventory')

    expect(inventario?.capabilities).toContainEqual({
      code: 'inventory-export',
      label: 'Exportar',
      permissionCodes: [PERMISSIONS.INVENTORY_EXPORT],
    })
    expect(assignablePermissionCodes).toContain(PERMISSIONS.INVENTORY_EXPORT)
    expect(expandPermissionDependencies([PERMISSIONS.INVENTORY_EXPORT]))
      .toEqual(expect.arrayContaining([PERMISSIONS.INVENTORY_EXPORT, PERMISSIONS.INVENTORY_VIEW]))
  })
})
