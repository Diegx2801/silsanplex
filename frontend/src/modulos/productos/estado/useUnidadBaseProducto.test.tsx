import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ consultarUnidadBaseEditable: vi.fn() }))
vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ access: { organizationId: 'org-1' } }) }))
vi.mock('@/modulos/productos/servicios/productosService', () => mocks)
import { useUnidadBaseProducto } from './useUnidadBaseProducto'

function crearWrapper() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
}

beforeEach(() => { mocks.consultarUnidadBaseEditable.mockReset() })
afterEach(cleanup)

describe('useUnidadBaseProducto', () => {
  it('no consulta historial para un producto nuevo', () => {
    const { result } = renderHook(() => useUnidadBaseProducto(undefined, true), { wrapper: crearWrapper() })
    expect(result.current.editable).toBe(true)
    expect(mocks.consultarUnidadBaseEditable).not.toHaveBeenCalled()
  })

  it('bloquea mientras consulta y permite solo tras la autorización del servidor', async () => {
    let resolver!: (editable: boolean) => void
    mocks.consultarUnidadBaseEditable.mockImplementation(() => new Promise<boolean>((resolve) => { resolver = resolve }))
    const { result } = renderHook(() => useUnidadBaseProducto('prod-1', true), { wrapper: crearWrapper() })
    expect(result.current.editable).toBe(false)
    expect(result.current.comprobando).toBe(true)
    await act(async () => resolver(true))
    await waitFor(() => expect(result.current.editable).toBe(true))
    expect(mocks.consultarUnidadBaseEditable).toHaveBeenCalledWith('org-1', 'prod-1')
  })

  it('no utiliza un true anterior cuando falla una nueva comprobación', async () => {
    mocks.consultarUnidadBaseEditable.mockResolvedValueOnce(true)
    const { result } = renderHook(() => useUnidadBaseProducto('prod-1', true), { wrapper: crearWrapper() })
    await waitFor(() => expect(result.current.editable).toBe(true))
    mocks.consultarUnidadBaseEditable.mockRejectedValueOnce(new Error('sin conexión'))
    await act(async () => { await result.current.actualizar() })
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.editable).toBe(false)
  })
})
