import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  actualizarReparacion,
  consumirParteReparacion,
  crearReparacion,
  listarOpcionesProductosReparacion,
  listarReparacionesPaginadas,
  obtenerMensajeErrorReparacion,
  registrarDiagnosticoReparacion,
  registrarSolucionReparacion,
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
        diagnosis: 'Fuente dañada',
        applied_solution: 'Fuente reemplazada',
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
      elementos: [{
        id: 'repair-1',
        numeroSerie: 'SER-1',
        diagnostico: 'Fuente dañada',
        diagnosticoRegistrado: true,
        solucionAplicada: 'Fuente reemplazada',
        solucionAplicadaRegistrada: true,
      }],
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

  it('crea y actualiza una reparación sin campos técnicos en el payload general', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'repair-1', error: null })

    const datos = {
      clienteId: '00000000-0000-0000-0000-000000000001',
      productoId: '00000000-0000-0000-0000-000000000002',
      numeroSerie: 'SER-1',
      prioridad: 'normal',
      fechaEstimadaEntrega: '',
      problema: 'No enciende',
      notas: '',
      referenciaCliente: '',
      documentoVentaId: '',
      referenciaGarantia: 'GAR-1',
      esGarantia: true,
    } as const

    await crearReparacion('org-1', datos)
    await actualizarReparacion('org-1', 'repair-1', datos, true)

    for (const [, llamada] of supabaseMock.rpc.mock.calls) {
      expect(llamada.payload).not.toHaveProperty('diagnosis')
      expect(llamada.payload).not.toHaveProperty('applied_solution')
    }
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(1, 'create_repair', {
      payload: expect.objectContaining({
        organization_id: 'org-1',
        status: 'warranty',
        serial_number: 'SER-1',
      }),
    })
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(2, 'update_repair', {
      payload: expect.objectContaining({ id: 'repair-1', organization_id: 'org-1' }),
    })
  })

  it('omite identidad en una actualización tardía y conserva los campos generales', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null })
    const datos = {
      clienteId: '00000000-0000-0000-0000-000000000001',
      productoId: '00000000-0000-0000-0000-000000000002',
      numeroSerie: 'SER-1',
      prioridad: 'high',
      fechaEstimadaEntrega: '2026-09-15',
      problema: 'No enciende al conectar',
      notas: 'Incluye cargador',
      referenciaCliente: 'VENTAS-10',
      documentoVentaId: '',
      referenciaGarantia: '',
      esGarantia: false,
    } as const

    await actualizarReparacion('org-1', 'repair-1', datos, false)

    const payload = supabaseMock.rpc.mock.calls[0][1].payload
    expect(payload).not.toHaveProperty('customer_id')
    expect(payload).not.toHaveProperty('product_id')
    expect(payload).not.toHaveProperty('serial_number')
    expect(payload).toEqual(expect.objectContaining({
      id: 'repair-1',
      organization_id: 'org-1',
      priority: 'high',
      problem_description: 'No enciende al conectar',
      notes: 'Incluye cargador',
    }))
  })

  it('mantiene diagnóstico y solución aplicada en RPC especializadas', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'technical-record-1', error: null })

    await registrarDiagnosticoReparacion('org-1', 'repair-1', {
      tecnicoId: '',
      sintomas: 'No enciende',
      causaEncontrada: 'Fuente dañada',
      solucionRecomendada: 'Cambiar fuente',
      notas: '',
    })
    await registrarSolucionReparacion('org-1', 'repair-1', {
      solucionAplicada: '  Se reemplazó la fuente  ',
    })

    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(1, 'record_repair_diagnosis', {
      payload: {
        organization_id: 'org-1',
        repair_id: 'repair-1',
        technician_id: null,
        symptoms: 'No enciende',
        cause_found: 'Fuente dañada',
        recommended_solution: 'Cambiar fuente',
        notes: null,
      },
    })
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(2, 'record_repair_solution', {
      payload: {
        organization_id: 'org-1',
        repair_id: 'repair-1',
        applied_solution: 'Se reemplazó la fuente',
      },
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

  it('explica los rechazos del gate sobre el ciclo de pruebas vigente', () => {
    expect(obtenerMensajeErrorReparacion(
      { message: 'REPAIR_FAILED_TEST_PRESENT' },
      'estado',
    )).toBe('El ciclo de pruebas vigente contiene una prueba fallida.')
    expect(obtenerMensajeErrorReparacion(
      { message: 'REPAIR_APPROVED_TEST_REQUIRED' },
      'estado',
    )).toBe('Registra al menos una prueba aprobada en el ciclo vigente.')
  })

  it('traduce los gates de escritura técnica y los errores de solución', () => {
    expect(obtenerMensajeErrorReparacion(
      { message: 'REPAIR_IDENTITY_LOCKED' },
      'editar',
    )).toBe('La identidad de la reparación ya no puede modificarse porque la atención ya avanzó.')
    expect(obtenerMensajeErrorReparacion(
      { message: 'REPAIR_DIAGNOSIS_USE_DIAGNOSIS_RPC' },
      'editar',
    )).toBe('El diagnóstico debe registrarse desde la acción especializada.')
    expect(obtenerMensajeErrorReparacion(
      { message: 'REPAIR_APPLIED_SOLUTION_USE_SOLUTION_RPC' },
      'editar',
    )).toBe('La solución aplicada debe registrarse desde la acción especializada.')
    expect(obtenerMensajeErrorReparacion(
      { message: 'REPAIR_APPLIED_SOLUTION_REQUIRED' },
      'solucion',
    )).toBe('Describe la solución aplicada antes de guardar.')
    expect(obtenerMensajeErrorReparacion(
      { message: 'REPAIR_TECHNICAL_CHANGE_REQUIRES_REWORK' },
      'solucion',
    )).toBe('Vuelve la reparación a En reparación antes de realizar cambios técnicos.')
    expect(obtenerMensajeErrorReparacion({}, 'solucion')).toBe(
      'No se pudo guardar la solución aplicada.',
    )
  })
})
