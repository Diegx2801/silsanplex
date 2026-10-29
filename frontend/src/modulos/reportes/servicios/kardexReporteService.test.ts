import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAXIMO_FILAS_EXPORTACION_KARDEX } from '@/modulos/reportes/modelo/reporteKardex'
import { listarKardexReporte } from './kardexReporteService'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

const consulta = {
  pagina: 2,
  fechaDesde: '2026-09-01',
  fechaHasta: '2026-09-30',
  productoId: 'product-1',
  almacenId: 'warehouse-1',
  lote: 'LOT-1',
}

const fila = {
  id: 'movement-1', ledger_sequence: 12, operation_date: '2026-09-03',
  created_at: '2026-09-03T15:00:00Z', product_id: 'product-1', product_code: 'SKU-01',
  product_description: 'Producto uno', unit_of_measure: 'Caja', warehouse_id: 'warehouse-1',
  warehouse: 'Central', location_code: 'A-01', location_name: 'Anaquel 1',
  stock_status: 'available', lot: 'LOT-1', expiration_date: '2030-12-31',
  movement_type: 'salida', inbound_quantity: 0, outbound_quantity: 2,
  opening_quantity: 8, closing_quantity: 6, document_reference: 'GUIA-01',
  source_type: 'manual', reason: 'Despacho confirmado', responsible: 'Almacenero',
}

describe('listarKardexReporte', () => {
  beforeEach(() => rpc.mockReset())

  it('consulta el saldo por filtro de producto con paginación y mapea trazabilidad', async () => {
    rpc.mockResolvedValue({ data: { items: [fila], total_count: 31 }, error: null })

    await expect(listarKardexReporte('org-1', consulta)).resolves.toMatchObject({
      total: 31,
      totalPaginas: 2,
      pagina: 2,
      elementos: [{
        id: 'movement-1', entrada: 0, salida: 2, saldoAnterior: 8, saldoPosterior: 6,
        lote: 'LOT-1', responsable: 'Almacenero', ubicacionNombre: 'Anaquel 1',
      }],
    })
    expect(rpc).toHaveBeenCalledWith('inventory_kardex_report_read', {
      requested_organization_id: 'org-1',
      requested_product_id: 'product-1',
      requested_date_from: '2026-09-01',
      requested_date_to: '2026-09-30',
      requested_warehouse_id: 'warehouse-1',
      requested_lot: 'LOT-1',
      requested_limit: 25,
      requested_offset: 25,
      requested_export: false,
    })
  })

  it('solicita el conjunto filtrado completo y acotado para exportación', async () => {
    rpc.mockResolvedValue({ data: { items: [fila], total_count: 1 }, error: null })
    await expect(listarKardexReporte('org-1', consulta, true)).resolves.toMatchObject({ total: 1, tamanioPagina: MAXIMO_FILAS_EXPORTACION_KARDEX })
    expect(rpc).toHaveBeenCalledWith('inventory_kardex_report_read', expect.objectContaining({
      requested_limit: MAXIMO_FILAS_EXPORTACION_KARDEX,
      requested_offset: 0,
      requested_export: true,
    }))
  })

  it('no acepta una respuesta truncada como exportación completa', async () => {
    rpc.mockResolvedValue({ data: { items: [fila], total_count: 2 }, error: null })
    await expect(listarKardexReporte('org-1', consulta, true))
      .rejects.toThrow('La exportación no contiene todos los movimientos del filtro.')
  })

  it('traduce permiso y límite excedido en mensajes accionables', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    await expect(listarKardexReporte('org-1', consulta, true))
      .rejects.toThrow('No tienes permiso para exportar reportes de inventario.')

    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'INVENTORY_REPORT_EXPORT_LIMIT_EXCEEDED' } })
    await expect(listarKardexReporte('org-1', consulta, true))
      .rejects.toThrow('El resultado supera el límite seguro de 10 000 movimientos.')
  })
})
