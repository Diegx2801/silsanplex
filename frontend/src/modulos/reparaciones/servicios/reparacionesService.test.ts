import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  consumirParteReparacion,
  crearReparacion,
  listarOpcionesProductosReparacion,
  listarReparacionesPaginadas,
  reservarParteReparacion,
} from './reparacionesService'

interface RespuestaSupabase {
  data: unknown
  error: { code?: string; message?: string } | null
  count?: number | null
}

function crearCadena(respuestaActual: () => RespuestaSupabase) {
  const cadena = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    limit: vi.fn(),
    then: (
      resolver: (respuesta: RespuestaSupabase) => unknown,
      rechazador?: (motivo: unknown) => unknown,
    ) => Promise.resolve(respuestaActual()).then(resolver, rechazador),
  }

  cadena.select.mockReturnValue(cadena)
  cadena.eq.mockReturnValue(cadena)
  cadena.or.mockReturnValue(cadena)
  cadena.order.mockReturnValue(cadena)
  cadena.range.mockReturnValue(cadena)
  cadena.limit.mockReturnValue(cadena)

  return cadena
}

describe('reparacionesService', () => {
  let respuesta: RespuestaSupabase
  let cadena: ReturnType<typeof crearCadena>

  beforeEach(() => {
    respuesta = { data: [], error: null, count: 0 }
    cadena = crearCadena(() => respuesta)
    supabaseMock.from.mockReset()
    supabaseMock.from.mockReturnValue(cadena)
    supabaseMock.rpc.mockReset()
  })

  it('consulta la vista de lista con organización, filtros y rango server-side', async () => {
    respuesta = {
      data: [{
        id: 'repair-1',
        organization_id: 'org-1',
        repair_code: 'REP-00000001',
        customer_id: 'customer-1',
        product_id: 'product-1',
        serial_number: 'SER-1',
        received_at: '2026-08-27T12:00:00Z',
        estimated_delivery_date: null,
        delivered_at: null,
        status: 'received',
        priority: 'high',
        problem_description: 'No enciende',
        diagnosis: null,
        applied_solution: null,
        notes: null,
        customer_reference: null,
        sale_document_id: null,
        warranty_reference: null,
        assigned_technician_id: null,
        customer_name_snapshot: 'Cliente de prueba',
        customer_document_snapshot: 'DNI 00000001',
        product_code_snapshot: 'PROD-1',
        product_description_snapshot: 'Equipo de prueba',
        created_by: null,
        updated_by: null,
        created_at: '2026-08-27T12:00:00Z',
        updated_at: '2026-08-27T12:00:00Z',
      }],
      error: null,
      count: 7,
    }

    const resultado = await listarReparacionesPaginadas('org-1', {
      busqueda: 'REP-00000001',
      estado: 'received',
      prioridad: 'high',
      pagina: 2,
      tamanioPagina: 5,
    })

    expect(supabaseMock.from).toHaveBeenCalledWith('repair_list')
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(cadena.eq).toHaveBeenCalledWith('status', 'received')
    expect(cadena.eq).toHaveBeenCalledWith('priority', 'high')
    expect(cadena.range).toHaveBeenCalledWith(5, 9)
    expect(resultado).toMatchObject({
      totalFiltrado: 7,
      elementos: [{ id: 'repair-1', numeroSerie: 'SER-1' }],
    })
  })

  it('mapea productos activos para validar series y lotes', async () => {
    respuesta = {
      data: [{
        id: 'product-1',
        code: 'PROD-1',
        description: 'Equipo de prueba',
        unit_of_measure: 'unidad',
        serial_control: true,
        batch_control: false,
      }],
      error: null,
    }

    await expect(listarOpcionesProductosReparacion('org-1')).resolves.toEqual([{
      id: 'product-1',
      codigo: 'PROD-1',
      descripcion: 'Equipo de prueba',
      unidadMedida: 'unidad',
      serialControl: true,
      controlLote: false,
      controlVencimiento: false,
    }])
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(cadena.eq).toHaveBeenCalledWith('is_active', true)
  })

  it('crea una reparación con estado inicial controlado por garantía', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'repair-1', error: null })

    await crearReparacion('org-1', {
      clienteId: '00000000-0000-0000-0000-000000000001',
      productoId: '00000000-0000-0000-0000-000000000002',
      numeroSerie: 'SER-1',
      prioridad: 'normal',
      fechaEstimadaEntrega: '',
      problema: 'No enciende',
      diagnostico: '',
      solucionAplicada: '',
      notas: '',
      referenciaCliente: '',
      documentoVentaId: '',
      referenciaGarantia: 'GAR-1',
      esGarantia: true,
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('create_repair', {
      payload: expect.objectContaining({
        organization_id: 'org-1',
        status: 'warranty',
        serial_number: 'SER-1',
      }),
    })
  })

  it('envía la operation_key estable para hacer idempotente el consumo', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'consumption-1', error: null })

    await consumirParteReparacion(
      'org-1',
      'part-1',
      { cantidad: '2' },
      '00000000-0000-0000-0000-000000000003',
    )

    expect(supabaseMock.rpc).toHaveBeenCalledWith('consume_repair_part', {
      payload: {
        organization_id: 'org-1',
        repair_part_id: 'part-1',
        quantity: 2,
        operation_key: '00000000-0000-0000-0000-000000000003',
      },
    })
  })

  it('reserva repuestos únicamente como stock available', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'part-1', error: null })

    await reservarParteReparacion('org-1', 'repair-1', {
      productoId: '00000000-0000-0000-0000-000000000001',
      almacenId: '00000000-0000-0000-0000-000000000002',
      ubicacionId: '00000000-0000-0000-0000-000000000003',
      estadoStock: 'available',
      lote: '',
      fechaVencimiento: '',
      cantidadSolicitada: '2',
      notas: '',
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('reserve_repair_part', {
      payload: expect.objectContaining({
        organization_id: 'org-1',
        repair_id: 'repair-1',
        stock_status: 'available',
      }),
    })
  })
})
