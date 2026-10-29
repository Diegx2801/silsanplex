import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listarResumenMovimientos } from './reporteService'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

const consulta = {
  pagina: 2,
  fechaDesde: '2026-09-01',
  fechaHasta: '2026-09-30',
  busqueda: 'para',
  almacenId: 'warehouse-1',
}

describe('listarResumenMovimientos', () => {
  beforeEach(() => rpc.mockReset())

  it('consulta el agregado del servidor con filtros y paginación acotada', async () => {
    rpc.mockResolvedValue({
      data: {
        items: [{
          product_id: 'product-1', product_code: 'PAR-01', product_description: 'Paracetamol',
          unit_of_measure: 'Caja', warehouse_id: 'warehouse-1', warehouse: 'Central',
          stock_status: 'available', inbound_quantity: '12.000', outbound_quantity: '4.000',
          net_quantity: '8.000', movement_count: '3',
        }],
        total_count: 31,
        total_movements: 72,
      },
      error: null,
    })

    await expect(listarResumenMovimientos('org-1', consulta)).resolves.toMatchObject({
      total: 31,
      totalMovimientos: 72,
      totalPaginas: 2,
      elementos: [{ entradas: 12, salidas: 4, variacionNeta: 8, cantidadMovimientos: 3 }],
    })
    expect(rpc).toHaveBeenCalledWith('inventory_movement_summary_read', {
      requested_organization_id: 'org-1',
      requested_date_from: '2026-09-01',
      requested_date_to: '2026-09-30',
      search_term: 'para',
      requested_warehouse_id: 'warehouse-1',
      requested_limit: 25,
      requested_offset: 25,
    })
  })

  it('traduce los errores del contrato a mensajes recuperables', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } })

    await expect(listarResumenMovimientos('org-1', consulta))
      .rejects.toThrow('No tienes permiso para consultar reportes de inventario.')
  })

  it('rechaza una respuesta incompleta antes de mostrar datos incorrectos', async () => {
    rpc.mockResolvedValue({ data: { items: [], total_count: 'incorrecto', total_movements: 0 }, error: null })

    await expect(listarResumenMovimientos('org-1', consulta))
      .rejects.toThrow('El reporte devolvió una cantidad inválida.')
  })
})
