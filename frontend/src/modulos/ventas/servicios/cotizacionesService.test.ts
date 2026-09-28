import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import { listarCotizacionesPersistentesPorCliente } from './cotizacionesService'

function cadena(respuesta: { data: unknown; error: { message: string } | null }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    then: (resolve: (value: typeof respuesta) => unknown) => Promise.resolve(respuesta).then(resolve),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.order.mockReturnValue(query)
  return query
}

describe('cotizacionesService - historial por cliente', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filtra en Supabase por organizacion y customer_id, conserva snapshots, totales, estados y pedido', async () => {
    const quoteQuery = cadena({
      data: [
        {
          id: 'quote-2', organization_id: 'org-1', quote_number: 'COT-000002', customer_id: 'customer-1',
          issue_date: '2026-09-20', valid_until: '2026-10-20', prices_include_tax: true, status: 'aceptada', notes: 'Aceptada',
          created_at: '2026-09-20T12:00:00.000Z', updated_at: '2026-09-20T12:00:00.000Z', issued_at: '2026-09-20T12:00:00.000Z', accepted_at: '2026-09-21T12:00:00.000Z', rejected_at: null,
          subtotal: '100.00', taxable_base: '100.00', exempt_amount: '0.00', unaffected_amount: '0.00', tax: '18.00', total: '118.00',
          created_by: 'user-1', issued_by: 'user-1', accepted_order_id: 'order-1',
        },
        {
          id: 'quote-1', organization_id: 'org-1', quote_number: 'COT-000001', customer_id: 'customer-1',
          issue_date: '2026-08-01', valid_until: '2026-08-10', prices_include_tax: true, status: 'emitida', notes: '',
          created_at: '2026-08-01T12:00:00.000Z', updated_at: '2026-08-01T12:00:00.000Z', issued_at: '2026-08-01T12:00:00.000Z', accepted_at: null, rejected_at: null,
          subtotal: '8.47', taxable_base: '8.47', exempt_amount: '0.00', unaffected_amount: '0.00', tax: '1.53', total: '10.00',
          created_by: null, issued_by: null, accepted_order_id: null,
        },
      ],
      error: null,
    })
    const itemsQuery = cadena({
      data: [{ id: 'item-1', quote_id: 'quote-2', product_id: 'product-1', product_code: 'P-OLD', product_description: 'Snapshot historico', unit_of_measure: 'UND', quantity: '2', unit_price: '59', tax_affectation: 'gravado', line_subtotal: '118.0000' }],
      error: null,
    })
    const customersQuery = cadena({ data: [{ id: 'customer-1', document_number: '20123456789', legal_name: 'Cliente Uno' }], error: null })
    const ordersQuery = cadena({ data: [{ id: 'order-1', order_number: 'PED-000001' }], error: null })
    const profilesQuery = cadena({ data: [{ id: 'user-1', full_name: 'Usuario de Ventas', email: 'ventas@example.com' }], error: null })
    supabaseMock.from
      .mockReturnValueOnce(quoteQuery)
      .mockReturnValueOnce(itemsQuery)
      .mockReturnValueOnce(customersQuery)
      .mockReturnValueOnce(ordersQuery)
      .mockReturnValueOnce(profilesQuery)

    const resultado = await listarCotizacionesPersistentesPorCliente('org-1', 'customer-1')

    expect(quoteQuery.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(quoteQuery.eq).toHaveBeenCalledWith('customer_id', 'customer-1')
    expect(quoteQuery.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: false })
    expect(resultado).toHaveLength(2)
    expect(resultado.map((cotizacion) => cotizacion.id)).toEqual(['quote-2', 'quote-1'])
    expect(resultado[0]).toMatchObject({
      estado: 'aceptada',
      totalesPersistidos: { subtotal: 100, igv: 18, total: 118 },
      creadoPor: 'Usuario de Ventas',
      emitidoPor: 'Usuario de Ventas',
      pedidoRelacionado: { id: 'order-1', numero: 'PED-000001' },
    })
    expect(resultado[0].lineas[0]).toMatchObject({
      productoCodigo: 'P-OLD',
      productoDescripcion: 'Snapshot historico',
      precioUnitario: 59,
      subtotal: 118,
    })
    expect(resultado[1]).toMatchObject({ estado: 'emitida', fechaValidez: '2026-08-10' })
    expect(itemsQuery.in).toHaveBeenCalledWith('quote_id', ['quote-2', 'quote-1'])
    expect(ordersQuery.in).toHaveBeenCalledWith('id', ['order-1'])
  })

  it('no mezcla clientes porque el customer_id forma parte de la consulta remota', async () => {
    const quoteQuery = cadena({
      data: [],
      error: null,
    })
    supabaseMock.from.mockReturnValueOnce(quoteQuery)

    const resultado = await listarCotizacionesPersistentesPorCliente('org-1', 'customer-1')

    expect(quoteQuery.eq).toHaveBeenCalledWith('customer_id', 'customer-1')
    expect(resultado).toEqual([])
  })
})
