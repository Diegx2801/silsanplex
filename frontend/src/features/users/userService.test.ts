import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invokeEdgeFunction: vi.fn() }))
vi.mock('@/lib/edgeFunctions', () => mocks)

import { listUsers, updateUser } from '@/features/users/userService'

describe('userService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normaliza permisos y versión de acceso devueltos por el backend', async () => {
    mocks.invokeEdgeFunction.mockResolvedValue({ users: [{
      user_id: '8e421220-7183-4df4-90dc-c93851bcbe89', organization_id: 'org-1',
      email: 'ventas@silsan.test', full_name: 'Usuario ventas', phone: null,
      is_active: true, auth_confirmed_at: null, is_admin: false,
      permission_codes: ['SALES_VIEW'], access_version: 4, created_at: '2026-09-01', updated_at: '2026-09-02',
    }] })

    await expect(listUsers()).resolves.toEqual([expect.objectContaining({
      isAdmin: false, permissionCodes: ['SALES_VIEW'], accessVersion: 4,
    })])
  })

  it('envía la versión esperada al actualizar accesos', async () => {
    mocks.invokeEdgeFunction.mockResolvedValue({ userId: '8e421220-7183-4df4-90dc-c93851bcbe89' })
    await updateUser(
      { id: '8e421220-7183-4df4-90dc-c93851bcbe89', accessVersion: 7 },
      { email: 'ventas@silsan.test', fullName: 'Usuario ventas', phone: '', isAdmin: false, permissionCodes: ['SALES_VIEW'] },
    )

    expect(mocks.invokeEdgeFunction).toHaveBeenCalledWith('admin-users', expect.objectContaining({
      action: 'update', accessVersion: 7, permissionCodes: ['SALES_VIEW'],
    }))
  })
})
