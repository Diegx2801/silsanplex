import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { PropsWithChildren } from 'react'

const mocks = vi.hoisted(() => ({
  consultar: vi.fn(),
  auth: { access: { organizationId: 'org-1' }, user: { id: 'u1' }, hasPermission: vi.fn() },
}))
vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/modulos/ventas/servicios/historialPreciosService', () => ({ consultarHistorialPreciosVenta: mocks.consultar }))
import { historialPreciosKey, useHistorialPreciosVenta } from './useHistorialPreciosVenta'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
  return { client, wrapper: Wrapper }
}
beforeEach(() => {
  mocks.consultar.mockReset().mockResolvedValue([])
  mocks.auth.access.organizationId = 'org-1'
  mocks.auth.user.id = 'u1'
  mocks.auth.hasPermission.mockReturnValue(true)
})
it('no consulta sin ambos permisos y oculta los datos al revocarlos', async () => {
  mocks.consultar.mockResolvedValue([{ sale_id: 'sale1' }])
  const { wrapper } = setup()
  const { result, rerender } = renderHook(() => useHistorialPreciosVenta('c1', {}), { wrapper })
  await waitFor(() => expect(result.current.filas).toHaveLength(1))
  mocks.auth.hasPermission.mockImplementation(permission => permission !== 'SALES_VIEW')
  const calls = mocks.consultar.mock.calls.length
  rerender()
  expect(result.current.permitido).toBe(false)
  expect(result.current.filas).toEqual([])
  expect(mocks.consultar).toHaveBeenCalledTimes(calls)
})
it('separa cachés por organización, usuario, cliente y producto; una invalidación vuelve a consultar', async () => {
  const { client, wrapper } = setup()
  const { result, rerender } = renderHook(({ customer, product }) => useHistorialPreciosVenta(customer, { productoId: product }), {
    wrapper, initialProps: { customer: 'c1', product: 'p1' },
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(mocks.consultar).toHaveBeenLastCalledWith('org-1', 'c1', { productoId: 'p1' })
  mocks.auth.access.organizationId = 'org-2'; mocks.auth.user.id = 'u2'
  rerender({ customer: 'c2', product: 'p2' })
  await waitFor(() => expect(mocks.consultar).toHaveBeenLastCalledWith('org-2', 'c2', { productoId: 'p2' }))
  const calls = mocks.consultar.mock.calls.length
  await client.invalidateQueries({ queryKey: historialPreciosKey('org-2') })
  await waitFor(() => expect(mocks.consultar.mock.calls.length).toBeGreaterThan(calls))
})
