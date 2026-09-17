import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const servicios = vi.hoisted(() => ({
  listarCompras: vi.fn().mockResolvedValue([]),
  guardarCompraPersistente: vi.fn(),
  emitirCompraPersistente: vi.fn(),
  recibirCompraPersistente: vi.fn().mockResolvedValue(undefined),
  anularCompraPersistente: vi.fn(),
}))
vi.mock('@/modulos/compras/servicios/compraService', () => servicios)
vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ access: { organizationId: 'org-1' } }),
}))

import { useCompras } from './useCompras'

function Probe() {
  const { recibirCompra } = useCompras([], [])
  return <button type="button" onClick={() => void recibirCompra('compra-1', {
    operationKey: 'op-1', observacion: '', lineas: [],
  })}>Recibir</button>
}

function QueryProbe() {
  const { error, reintentar } = useCompras([], [])
  return <>
    <span>{error ? 'error' : 'ok'}</span>
    <button type="button" onClick={() => void reintentar()}>Reintentar</button>
  </>
}

describe('useCompras', () => {
  it('refresca todas las consultas de inventario después de recibir', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidar = vi.spyOn(cliente, 'invalidateQueries')
    render(<QueryClientProvider client={cliente}><Probe /></QueryClientProvider>)

    fireEvent.click(document.querySelector('button')!)

    await waitFor(() => expect(servicios.recibirCompraPersistente).toHaveBeenCalled())
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['inventory', 'org-1'] })
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['warehouse-management', 'org-1'] })
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['inventory-fefo', 'org-1'] })
  })

  it('expone reintento cuando la consulta de compras falla', async () => {
    servicios.listarCompras.mockReset()
      .mockRejectedValueOnce(new Error('Fallo temporal'))
      .mockResolvedValueOnce([])
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={cliente}><QueryProbe /></QueryClientProvider>)

    await waitFor(() => expect(screen.getByText('error')).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByText('ok')).toBeVisible())
    expect(servicios.listarCompras).toHaveBeenCalledTimes(2)
  })
})
