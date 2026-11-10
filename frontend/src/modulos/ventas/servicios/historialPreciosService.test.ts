import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: mocks }))
import { consultarHistorialPreciosVenta } from './historialPreciosService'
describe('consulta de precios vendidos', () => {
  beforeEach(() => vi.clearAllMocks())
  it('envía todos los límites al servidor y preserva los snapshots sin conversiones de moneda', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ unit_price: '12.3456', quantity: '2.500', currency: 'PEN', tax_affectation: null, unit_of_measure: 'CAJA' }], error: null })
    const filas = await consultarHistorialPreciosVenta('org', 'customer', { productoId: 'product', desde: '2026-01-01', hasta: '2026-11-10', busqueda: 'OLD', limite: 1, desplazamiento: 20 })
    expect(mocks.rpc).toHaveBeenCalledWith('get_customer_sale_price_history', {
      requested_organization_id: 'org', requested_customer_id: 'customer', requested_product_id: 'product',
      date_from: '2026-01-01', date_to: '2026-11-10', product_search: 'OLD', page_size: 1, page_offset: 20,
    })
    expect(filas[0]).toMatchObject({ unit_price: 12.3456, quantity: 2.5, currency: 'PEN', tax_affectation: null, unit_of_measure: 'CAJA' })
  })
  it('retorna vacío sin ventas y propaga los errores de autorización', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await consultarHistorialPreciosVenta('org', 'customer')).toEqual([])
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'CUSTOMER_SALE_HISTORY_FORBIDDEN' } })
    await expect(consultarHistorialPreciosVenta('org', 'customer')).rejects.toThrow('CUSTOMER_SALE_HISTORY_FORBIDDEN')
  })
})
