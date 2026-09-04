import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  aprobarCotizacionReparacion,
  asignarReparacion,
  actualizarReparacion,
  cancelarParteReparacion,
  cancelarReparacion,
  cambiarEstadoReparacion,
  consumirParteReparacion,
  crearReparacion,
  entregarReparacion,
  ErrorReparacion,
  esConflictoVersionReparacion,
  guardarCotizacionReparacion,
  listarOpcionesProductosReparacion,
  listarReparacionesPaginadas,
  obtenerDetalleReparacion,
  obtenerMensajeErrorReparacion,
  rechazarCotizacionReparacion,
  registrarDiagnosticoReparacion,
  registrarSolucionReparacion,
  registrarPruebaReparacion,
  reservarParteReparacion,
  revisarCotizacionReparacion,
  seleccionarCotizacionActual,
} from './reparacionesService'
import type { CotizacionReparacion, DatosCotizacion } from '@/modulos/reparaciones/modelo/reparacion'

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
    in: vi.fn(),
    maybeSingle: vi.fn(),
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
  cadena.in.mockReturnValue(cadena)
  cadena.maybeSingle.mockImplementation(() => Promise.resolve(respuestaActual()))

  return cadena
}

function crearFilaReparacion(lockVersion: number) {
  return {
    id: 'repair-1',
    organization_id: 'org-1',
    lock_version: lockVersion,
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
    serial_control_snapshot: true,
    created_by: null,
    updated_by: null,
    created_at: '2026-08-27T12:00:00Z',
    updated_at: '2026-08-27T12:00:00Z',
  }
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
        lock_version: 7,
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
        lockVersion: 7,
        numeroSerie: 'SER-1',
        diagnostico: 'Fuente dañada',
        diagnosticoRegistrado: true,
        solucionAplicada: 'Fuente reemplazada',
        solucionAplicadaRegistrada: true,
      }],
    })
  })

  it('rechaza versiones de concurrencia que no pueden existir en la base de datos', async () => {
    respuesta = { data: [crearFilaReparacion(0)], error: null, count: 1 }

    await expect(listarReparacionesPaginadas('org-1', {
      busqueda: '',
      estado: 'todos',
      prioridad: 'todas',
      pagina: 1,
      tamanioPagina: 10,
    })).rejects.toThrow('La versión de la reparación recibida no es válida.')
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
    await actualizarReparacion('org-1', 'repair-1', datos, true, 7)

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
      payload: expect.objectContaining({ id: 'repair-1', organization_id: 'org-1', expected_lock_version: 7 }),
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

    await actualizarReparacion('org-1', 'repair-1', datos, false, 8)

    const payload = supabaseMock.rpc.mock.calls[0][1].payload
    expect(payload).not.toHaveProperty('customer_id')
    expect(payload).not.toHaveProperty('product_id')
    expect(payload).not.toHaveProperty('serial_number')
    expect(payload).toEqual(expect.objectContaining({
      id: 'repair-1',
      organization_id: 'org-1',
      expected_lock_version: 8,
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
    }, 9)
    await registrarSolucionReparacion('org-1', 'repair-1', {
      solucionAplicada: '  Se reemplazó la fuente  ',
    }, 10)

    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(1, 'record_repair_diagnosis', {
      payload: {
        organization_id: 'org-1',
        repair_id: 'repair-1',
        expected_lock_version: 9,
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
        expected_lock_version: 10,
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
      11,
    )

    expect(supabaseMock.rpc).toHaveBeenCalledWith('consume_repair_part', {
      payload: {
        organization_id: 'org-1',
        repair_part_id: 'part-1',
        expected_lock_version: 11,
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
    }, 12)

    expect(supabaseMock.rpc).toHaveBeenCalledWith('reserve_repair_part', {
      payload: expect.objectContaining({
        organization_id: 'org-1',
        repair_id: 'repair-1',
        expected_lock_version: 12,
        stock_status: 'available',
      }),
    })
  })

  it('selecciona la cotización marcada vigente y no la versión numérica mayor', () => {
    const cotizacionBase = {
      organizationId: 'org-1',
      reparacionId: 'repair-1',
      estado: 'draft',
      moneda: 'PEN',
      preciosIncluyenImpuesto: false,
      tasaImpuesto: 0,
      subtotal: 10,
      impuesto: 0,
      total: 10,
      aprobadoPor: null,
      aprobadoEn: null,
      observacionAprobacion: '',
      rechazadoPor: null,
      rechazadoEn: null,
      observacionRechazo: '',
      creadoPor: null,
      actualizadoPor: null,
      creadoEn: '2026-09-01T00:00:00Z',
      actualizadoEn: '2026-09-01T00:00:00Z',
      lineas: [],
    } satisfies Omit<CotizacionReparacion, 'id' | 'version' | 'esActual'>
    const cotizaciones: CotizacionReparacion[] = [
      { ...cotizacionBase, id: 'quote-2', version: 2, esActual: false },
      { ...cotizacionBase, id: 'quote-1', version: 1, esActual: true, estado: 'pending' },
    ]

    expect(seleccionarCotizacionActual(cotizaciones)?.id).toBe('quote-1')
  })

  it('envía la revisión por la RPC especializada con su cotización rechazada', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'quote-2', error: null })

    await revisarCotizacionReparacion('org-1', 'repair-1', 'quote-1', {
      moneda: 'PEN',
      preciosIncluyenImpuesto: false,
      tasaImpuesto: '18',
      lineas: [{
        tipo: 'labor',
        productoId: '',
        descripcion: 'Mano de obra ajustada',
        cantidad: '1',
        precioUnitario: '80',
        gravable: true,
      }],
    }, true, 13)

    expect(supabaseMock.rpc).toHaveBeenCalledWith('revise_repair_quote', {
      payload: expect.objectContaining({
        organization_id: 'org-1',
        repair_id: 'repair-1',
        rejected_quote_id: 'quote-1',
        expected_lock_version: 13,
        submit: true,
        items: [{
          line_type: 'labor',
          product_id: null,
          description: 'Mano de obra ajustada',
          quantity: 1,
          unit_price: 80,
          taxable: true,
        }],
      }),
    })
  })

  it('reintenta el detalle completo cuando cambia la versión agregada', async () => {
    const ordenConsultas: string[] = []
    const respuestasRaiz: RespuestaSupabase[] = [
      { data: crearFilaReparacion(1), error: null },
      { data: { lock_version: 2 }, error: null },
      { data: crearFilaReparacion(2), error: null },
      { data: { lock_version: 2 }, error: null },
    ]
    supabaseMock.from.mockImplementation((tabla: string) => {
      ordenConsultas.push(tabla)
      const respuestaTabla = tabla === 'repair_list'
        ? respuestasRaiz.shift() ?? { data: null, error: null }
        : { data: [], error: null, count: 0 }
      return crearCadena(() => respuestaTabla)
    })

    const detalle = await obtenerDetalleReparacion('org-1', 'repair-1')

    expect(detalle.reparacion.lockVersion).toBe(2)
    expect(ordenConsultas[0]).toBe('repair_list')
    expect(ordenConsultas.filter((tabla) => tabla === 'repair_list')).toHaveLength(4)
    expect(ordenConsultas.filter((tabla) => tabla === 'repair_quotes')).toHaveLength(2)
  })

  it('envía la versión esperada en todas las formas de mutación restantes', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'result-1', error: null })
    const observacion = { observacion: 'Confirmado' }
    const cotizacion: DatosCotizacion = {
      moneda: 'PEN',
      preciosIncluyenImpuesto: false,
      tasaImpuesto: '18',
      lineas: [{
        tipo: 'labor',
        productoId: '',
        descripcion: 'Mano de obra',
        cantidad: '1',
        precioUnitario: '100',
        gravable: true,
      }],
    }

    await asignarReparacion('org-1', 'repair-1', 'technician-1', 20)
    await cambiarEstadoReparacion('org-1', 'repair-1', 'diagnosis', 'Revisión', 21)
    await guardarCotizacionReparacion('org-1', 'repair-1', cotizacion, true, 22)
    await aprobarCotizacionReparacion('org-1', 'repair-1', 'quote-1', observacion, 23)
    await rechazarCotizacionReparacion('org-1', 'repair-1', 'quote-1', observacion, 24)
    await cancelarParteReparacion('org-1', 'part-1', observacion, 25)
    await registrarPruebaReparacion('org-1', 'repair-1', {
      realizadaPor: '',
      tipo: 'Encendido',
      resultado: 'Correcto',
      aprobada: true,
      notas: '',
    }, 26)
    await entregarReparacion('org-1', 'repair-1', observacion, 27)
    await cancelarReparacion('org-1', 'repair-1', observacion, 28)

    expect(supabaseMock.rpc).toHaveBeenCalledWith('assign_repair', expect.objectContaining({ requested_expected_lock_version: 20 }))
    expect(supabaseMock.rpc).toHaveBeenCalledWith('change_repair_status', expect.objectContaining({ requested_expected_lock_version: 21 }))
    expect(supabaseMock.rpc).toHaveBeenCalledWith('save_repair_quote', { payload: expect.objectContaining({ expected_lock_version: 22 }) })
    expect(supabaseMock.rpc).toHaveBeenCalledWith('approve_repair_quote', expect.objectContaining({ requested_expected_lock_version: 23 }))
    expect(supabaseMock.rpc).toHaveBeenCalledWith('reject_repair_quote', expect.objectContaining({ requested_expected_lock_version: 24 }))
    expect(supabaseMock.rpc).toHaveBeenCalledWith('cancel_repair_part', expect.objectContaining({ requested_expected_lock_version: 25 }))
    expect(supabaseMock.rpc).toHaveBeenCalledWith('record_repair_test', { payload: expect.objectContaining({ expected_lock_version: 26 }) })
    expect(supabaseMock.rpc).toHaveBeenCalledWith('deliver_repair', expect.objectContaining({ requested_expected_lock_version: 27 }))
    expect(supabaseMock.rpc).toHaveBeenCalledWith('cancel_repair', expect.objectContaining({ requested_expected_lock_version: 28 }))
  })

  it('conserva el código de conflicto junto con su mensaje explícito', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'REPAIR_VERSION_CONFLICT' },
    })

    const promesa = asignarReparacion('org-1', 'repair-1', 'technician-1', 3)

    await expect(promesa).rejects.toMatchObject({
      codigo: 'REPAIR_VERSION_CONFLICT',
      message: 'La reparación cambió mientras realizabas esta acción. Revisa la información actualizada antes de volver a intentarlo.',
    })
    await promesa.catch((error: unknown) => {
      expect(error).toBeInstanceOf(ErrorReparacion)
      expect(esConflictoVersionReparacion(error)).toBe(true)
    })
    expect(obtenerMensajeErrorReparacion(
      { message: 'REPAIR_VERSION_REQUIRED' },
      'editar',
    )).toBe('No se pudo verificar la versión de la reparación. Actualiza el detalle e inténtalo nuevamente.')
    expect(obtenerMensajeErrorReparacion(
      { code: 'REPAIR_VERSION_CONFLICT' },
      'editar',
    )).toContain('La reparación cambió')
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
    expect(obtenerMensajeErrorReparacion(
      { message: 'REPAIR_QUOTE_STALE_VERSION' },
      'cotizacion',
    )).toBe('La cotización cambió. Actualiza el detalle antes de continuar.')
  })
})
