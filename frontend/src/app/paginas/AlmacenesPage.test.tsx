import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PERMISSIONS } from '@/features/auth/permissions'
import { AlmacenesPage } from './AlmacenesPage'

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  directorio: vi.fn(),
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ hasPermission: mocks.hasPermission }),
}))
vi.mock('@/modulos/inventario/estado/useAlmacenes', () => ({
  useAlmacenes: () => ({
    almacenes: [], ubicaciones: [], cargando: false, error: '',
    reintentar: vi.fn(), guardarAlmacen: vi.fn(), guardarUbicacion: vi.fn(),
    cambiarEstadoAlmacen: vi.fn(), cambiarEstadoUbicacion: vi.fn(),
  }),
}))
vi.mock('@/modulos/inventario/componentes/DirectorioAlmacenes', () => ({
  DirectorioAlmacenes: (props: { puedeGestionar: boolean }) => {
    mocks.directorio(props)
    return <p>Mantenedor aislado</p>
  },
}))

describe('AlmacenesPage', () => {
  it('reutiliza el directorio y separa el permiso de consulta del de gestión', () => {
    mocks.hasPermission.mockImplementation((permiso) => permiso === PERMISSIONS.INVENTORY_MANAGE)

    render(<AlmacenesPage />)

    expect(screen.getByText('Mantenedor aislado')).toBeVisible()
    expect(mocks.directorio).toHaveBeenCalledWith(expect.objectContaining({ puedeGestionar: true }))
  })
})
