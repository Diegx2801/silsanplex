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

describe('capacidades económicas R14 explícitas',()=>{
 it('no se incluyen en Operar reparaciones y gestionar no concede confirmar',()=>{
  const operar=operationalAccessModules.find(m=>m.code==='repairs')?.capabilities.find(c=>c.code==='repairs-operate')?.permissionCodes
  expect(operar).not.toContain(PERMISSIONS.REPAIRS_MANAGE_ACTUAL_COST)
  expect(operar).not.toContain(PERMISSIONS.REPAIRS_CONFIRM_ACTUAL_COST)
  expect(expandPermissionDependencies([PERMISSIONS.REPAIRS_MANAGE_ACTUAL_COST])).toEqual([PERMISSIONS.REPAIRS_MANAGE_ACTUAL_COST,PERMISSIONS.REPAIRS_VIEW])
  expect(expandPermissionDependencies([PERMISSIONS.REPAIRS_CONFIRM_ACTUAL_COST])).toEqual([PERMISSIONS.REPAIRS_CONFIRM_ACTUAL_COST,PERMISSIONS.REPAIRS_VIEW])
 })
})
