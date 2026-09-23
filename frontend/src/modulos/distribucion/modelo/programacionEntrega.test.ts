import { describe, expect, it } from 'vitest'

import {
  crearProgramacionEntrega,
  obtenerAccionPrincipalDistribucion,
  esquemaDatosProgramacionEntrega,
  esquemaProgramacionEntrega,
  esquemaResultadoEntrega,
  filtrarProgramacionesEntrega,
  inferirResultadoEntrega,
  listarEntregasAtrasadas,
  obtenerResumenFechaEntrega,
  obtenerEstadosSiguientes,
  puedeTransicionarEntrega,
  resumirEntregas,
  tipoTransporteParaModalidad,
  type DatosProgramacionEntrega,
} from './programacionEntrega'
import { mapearEntrega, prepararPayloadEntrega } from '../servicios/distribucionService'
import { fechaActualPeru } from '@/lib/fechas'

describe('programación de entrega', () => {
  it('deriva el cierre completo o parcial a partir del saldo por producto', () => {
    const lineas = [{ id: 'linea-1', cantidad: 5, cantidadEntregadaCliente: 2 }]

    expect(inferirResultadoEntrega(lineas, { 'linea-1': 3 })).toBe('entregado')
    expect(inferirResultadoEntrega(lineas, { 'linea-1': 1 })).toBe('entrega_parcial')
    expect(inferirResultadoEntrega(lineas, { 'linea-1': 4 })).toBeUndefined()
    expect(inferirResultadoEntrega(lineas, { 'linea-1': 0 })).toBeUndefined()
  })

  it('deriva el tipo de transporte de la modalidad para evitar opciones duplicadas', () => {
    expect(tipoTransporteParaModalidad('movilidad_propia')).toBe('interno')
    expect(tipoTransporteParaModalidad('movilidad_externa')).toBe('externo')
    expect(tipoTransporteParaModalidad('recojo_cliente', 'externo')).toBe('externo')
  })

  it('usa el calendario de Lima cuando falta la fecha de emisión', () => {
    const datos = {
      pedidoId: 'pedido-1',
      pedidoNumero: 'PED-001',
      ventaId: '',
      ventaNumero: '',
      clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001',
      fechaEmision: '',
      fechaProgramada: '2026-09-02',
      fechaEntrega: '',
      tipoTransporte: 'interno' as const,
      modalidad: 'movilidad_propia' as const,
      transportista: '',
      conductor: '',
      vehiculo: '',
      placa: '',
      observaciones: '',
      evidencia: '',
      estado: 'programado' as const,
      incidencias: [],
      lineas: [],
    }

    expect(crearProgramacionEntrega(datos).fechaEmision).toBe(fechaActualPeru())
  })

  it('incluye los datos principales de distribución y la modalidad de transporte', () => {
    const programacion = crearProgramacionEntrega({
      pedidoId: 'pedido-1',
      pedidoNumero: 'PED-001',
      ventaId: 'venta-1',
      ventaNumero: 'VEN-001',
      clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001',
      fechaProgramada: '2026-09-02',
      fechaEntrega: '2026-09-02',
      tipoTransporte: 'externo',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      fechaEmision: '2026-09-01',
      observaciones: 'Entrega urgente',
      evidencia: 'foto-1.jpg',
      estado: 'programado',
      incidencias: ['Se confirma horario'],
      lineas: [],
    })

    expect(programacion).toMatchObject({
      numeroDespacho: 'DES-001',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      estado: 'programado',
      incidencias: ['Se confirma horario'],
    })
  })

  it('acepta los estados principales y alternos de una entrega', () => {
    const estados = [
      'programado',
      'preparando',
      'en_curso',
      'en_destino',
      'entregado',
      'entrega_parcial',
      'reprogramado',
      'rechazado',
      'devuelto',
      'cancelado',
    ] as const

    estados.forEach((estado) => {
      const resultado = esquemaProgramacionEntrega.safeParse({
        id: 'id-1',
        pedidoId: 'pedido-1',
        pedidoNumero: 'PED-001',
        ventaId: 'venta-1',
        ventaNumero: 'VEN-001',
        clienteNombre: 'Cliente demo',
        direccionEntrega: 'Av. Central 123',
        numeroDespacho: 'DES-001',
        numeroGuiaRemision: 'G-001',
        fechaEmision: '2026-09-01',
        fechaProgramada: '2026-09-02',
        fechaEntrega: '2026-09-02',
        tipoTransporte: 'externo',
        modalidad: 'movilidad_externa',
        transportista: 'Transportes Sol',
        conductor: 'Luis Pérez',
        vehiculo: 'Camión',
        placa: 'ABC-123',
        observaciones: '',
        evidencia: estado === 'entregado' ? 'foto-entrega.jpg' : '',
        estado,
        incidencias: estado === 'rechazado' || estado === 'devuelto' ? ['Motivo registrado'] : [],
        lineas: [],
      })

      expect(resultado.success).toBe(true)
    })
  })

  it('aplica la matriz de transiciones operativas', () => {
    expect(obtenerEstadosSiguientes('programado')).toEqual(['preparando', 'reprogramado', 'cancelado'])
    expect(puedeTransicionarEntrega('programado', 'preparando')).toBe(true)
    expect(puedeTransicionarEntrega('preparando', 'en_curso')).toBe(true)
    expect(puedeTransicionarEntrega('programado', 'devuelto')).toBe(false)
    expect(puedeTransicionarEntrega('en_curso', 'reprogramado')).toBe(false)
    expect(puedeTransicionarEntrega('entrega_parcial', 'reprogramado')).toBe(true)
    expect(puedeTransicionarEntrega('rechazado', 'reprogramado')).toBe(true)
    expect(puedeTransicionarEntrega('entregado', 'en_curso')).toBe(false)
    expect(puedeTransicionarEntrega('en_destino', 'en_destino')).toBe(true)
  })

  it('distingue la fecha de cierre de la última recepción o intento', () => {
    const resultadosEntrega = [
      { id: 'resultado-1', resultado: 'entrega_parcial' as const, fecha: '2026-09-02', evidencia: 'firma parcial', incidencias: [], lineas: [] },
      { id: 'resultado-2', resultado: 'rechazado' as const, fecha: '2026-09-03', evidencia: '', incidencias: ['Cliente ausente'], lineas: [] },
    ]

    expect(obtenerResumenFechaEntrega({ estado: 'entrega_parcial', fechaEntrega: '2026-09-02', resultadosEntrega: resultadosEntrega.slice(0, 1) }))
      .toEqual({ etiqueta: 'Última recepción', fecha: '2026-09-02' })
    expect(obtenerResumenFechaEntrega({ estado: 'rechazado', fechaEntrega: '2026-09-02', resultadosEntrega }))
      .toEqual({ etiqueta: 'Último intento', fecha: '2026-09-03' })
    expect(obtenerResumenFechaEntrega({ estado: 'entregado', fechaEntrega: '2026-09-04', resultadosEntrega }))
      .toEqual({ etiqueta: 'Entrega completada', fecha: '2026-09-04' })
  })

  it('exige clasificar y describir un intento sin entrega', () => {
    const base = {
      entregaId: 'entrega-1', lockVersion: 1, resultado: 'rechazado' as const,
      fecha: '2026-09-03', evidencia: '', incidencias: ['El cliente rechazó recibir el pedido'], lineas: [],
    }

    expect(esquemaResultadoEntrega.safeParse(base).success).toBe(false)
    expect(esquemaResultadoEntrega.safeParse({ ...base, categoriaIncidencia: 'cliente_rechaza_recepcion' }).success).toBe(true)
  })

  it('reconoce los campos del formulario de programación', () => {
    const resultado = esquemaDatosProgramacionEntrega.safeParse({
      pedidoId: 'pedido-1',
      pedidoNumero: 'PED-001',
      ventaId: 'venta-1',
      ventaNumero: 'VEN-001',
      clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001',
      fechaEmision: '2026-09-01',
      fechaProgramada: '2026-09-02',
      fechaEntrega: '2026-09-02',
      tipoTransporte: 'externo',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      observaciones: 'Entrega urgente',
      evidencia: 'foto-1.jpg',
      estado: 'programado',
      incidencias: ['Se confirma horario'],
    })

    expect(resultado.success).toBe(true)
  })

  it('ofrece acciones principales que avanzan por la ruta operativa válida', () => {
    expect(obtenerAccionPrincipalDistribucion('programado')).toEqual({ estado: 'preparando', etiqueta: 'Iniciar preparación' })
    expect(obtenerAccionPrincipalDistribucion('preparando')).toEqual({ estado: 'en_curso', etiqueta: 'Iniciar traslado' })
    expect(obtenerAccionPrincipalDistribucion('en_curso')).toEqual({ estado: 'en_destino', etiqueta: 'Marcar en destino' })
    expect(obtenerAccionPrincipalDistribucion('entrega_parcial')).toEqual({ estado: 'en_curso', etiqueta: 'Reanudar traslado' })
    expect(obtenerAccionPrincipalDistribucion('entregado')).toBeUndefined()
    expect(obtenerAccionPrincipalDistribucion('rechazado')).toBeUndefined()
  })

  it('exige datos de cierre y transporte antes de confirmar una entrega', () => {
    const base = {
      pedidoId: 'pedido-1', pedidoNumero: 'PED-001', clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123', numeroDespacho: 'DES-001', numeroGuiaRemision: 'G-001',
      fechaEmision: '2026-09-01', fechaProgramada: '2026-09-02', tipoTransporte: 'interno' as const,
      modalidad: 'movilidad_propia' as const, estado: 'entregado' as const,
      transportista: '', conductor: '', vehiculo: '', placa: '', fechaEntrega: '', evidencia: '', incidencias: [],
    }

    const incompleto = esquemaDatosProgramacionEntrega.safeParse(base)
    expect(incompleto.success).toBe(false)
    expect(incompleto.error?.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(['fechaEntrega', 'evidencia', 'conductor', 'vehiculo', 'placa']))

    const completo = esquemaDatosProgramacionEntrega.safeParse({
      ...base,
      fechaEntrega: '2026-09-03', evidencia: 'foto-entrega.jpg', conductor: 'Luis Pérez', vehiculo: 'Camioneta', placa: 'ABC-123',
    })
    expect(completo.success).toBe(true)
  })

  it('valida fechas calendario y permite el recojo sin datos de transporte', () => {
    const resultado = esquemaDatosProgramacionEntrega.safeParse({
      pedidoId: 'pedido-1', pedidoNumero: 'PED-001', clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123', numeroDespacho: 'DES-001', numeroGuiaRemision: 'G-001',
      fechaEmision: '2026-09-04', fechaProgramada: '2026-09-03', tipoTransporte: 'interno',
      modalidad: 'recojo_cliente', estado: 'programado',
    })

    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues.some((issue) => issue.message.includes('anterior a la emisión'))).toBe(true)

    const recojo = esquemaDatosProgramacionEntrega.safeParse({
      pedidoId: 'pedido-1', pedidoNumero: 'PED-001', clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123', numeroDespacho: 'DES-001', numeroGuiaRemision: 'G-001',
      fechaEmision: '2026-09-01', fechaProgramada: '2026-09-02', tipoTransporte: 'interno',
      modalidad: 'recojo_cliente', estado: 'en_destino', fechaEntrega: '2026-09-02',
    })

    expect(recojo.success).toBe(true)
  })

  it('serializa y restaura todos los campos del flujo de distribución para la base de datos', () => {
    const datos: DatosProgramacionEntrega = {
      pedidoId: 'pedido-1',
      pedidoNumero: 'PED-001',
      ventaId: 'venta-1',
      ventaNumero: 'VEN-001',
      clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001',
      fechaEmision: '2026-09-01',
      fechaProgramada: '2026-09-02',
      fechaEntrega: '2026-09-02',
      tipoTransporte: 'externo',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      observaciones: 'Entrega urgente',
      evidencia: 'foto-1.jpg',
      estado: 'en_curso',
      seguimiento: 'en_curso',
      incidencias: ['Se confirma horario', 'Parada no programada'],
      lockVersion: 7,
      lineas: [],
    }

    const payload = prepararPayloadEntrega('org-1', datos, [{
      id: 'linea-1',
      productoId: 'prod-1',
      tipoProducto: 'good',
      productoCodigo: 'P-001',
      productoDescripcion: 'Producto',
      cantidad: 1,
      unidadMedida: 'UND',
      lote: 'L-001',
      fechaVencimiento: '2026-12-31',
      precioUnitario: 10,
    }], 'entrega-1', '11111111-1111-4111-8111-111111111111')

    expect(payload).toMatchObject({
      expected_lock_version: 7,
      operation_key: '11111111-1111-4111-8111-111111111111',
      organization_id: 'org-1',
      scheduled_date: '2026-09-02',
      order_id: 'pedido-1',
      order_number: 'PED-001',
      customer_name: 'Cliente demo',
      delivery_status: 'en_curso',
      tracking_status: 'en_curso',
      transport_type: 'externo',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      evidencia: 'foto-1.jpg',
      incidencias: ['Se confirma horario', 'Parada no programada'],
      items: [{ id: 'linea-1', productoDescripcion: 'Producto', cantidad: 1, unidadMedida: 'UND' }],
    })

    expect(prepararPayloadEntrega('org-1', { ...datos, fechaEmision: '' }, []).issue_date).toBe(fechaActualPeru())

    const restaurado = mapearEntrega({
      id: 'ent-1',
      order_id: 'pedido-1',
      order_number: 'PED-001',
      customer_name: 'Cliente demo',
      issue_date: '2026-09-01',
      delivery_date: '2026-09-02',
      guide_number: 'G-001',
      transport_type: 'externo',
      tracking_status: 'en_curso',
      observations: 'Entrega urgente',
      delivery_status: 'en_curso',
      direction: 'Av. Central 123',
      numero_despacho: 'DES-001',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      evidencia: 'foto-1.jpg',
      incidencias: ['Se confirma horario', 'Parada no programada'],
      order_items: [{ id: 'linea-1', productoDescripcion: 'Producto', cantidad: 1, unidadMedida: 'UND' }],
      created_at: '2026-09-01T00:00:00Z',
    })

    expect(restaurado).toMatchObject({
      pedidoNumero: 'PED-001',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      modalidad: 'movilidad_externa',
      transportista: 'Transportes Sol',
      conductor: 'Luis Pérez',
      vehiculo: 'Camión',
      placa: 'ABC-123',
      evidencia: 'foto-1.jpg',
      estado: 'en_curso',
      incidencias: ['Se confirma horario', 'Parada no programada'],
    })

    const entregaConFechasSeparadas = mapearEntrega({
      id: 'ent-2', order_id: 'pedido-2', order_number: 'PED-002', customer_name: 'Cliente demo',
      issue_date: '2026-09-01', delivery_date: '2026-09-04', scheduled_date: '2026-09-03', actual_delivery_date: '2026-09-04',
      guide_number: 'G-002', transport_type: 'interno', tracking_status: 'en_destino', delivery_status: 'entregado', observations: '',
      direction: 'Av. Central 123', numero_despacho: 'DES-002', modalidad: 'movilidad_propia',
      transportista: '', conductor: 'Luis Pérez', vehiculo: 'Camioneta', placa: 'ABC-123', evidencia: 'foto.jpg', incidencias: [],
      order_items: [{ id: 'linea-2', productoDescripcion: 'Producto', cantidad: 1, unidadMedida: 'UND' }], created_at: '2026-09-01T00:00:00Z',
    })

    expect(entregaConFechasSeparadas).toMatchObject({ fechaProgramada: '2026-09-03', fechaEntrega: '2026-09-04' })
  })

  it('lee una entrega histórica sin exigir los campos añadidos por la migración', () => {
    const restaurado = mapearEntrega({
      id: 'ent-historica',
      order_id: 'pedido-historico',
      order_number: 'PED-H-001',
      customer_name: 'Cliente histórico',
      issue_date: '2026-08-30',
      delivery_date: '2026-08-31',
      guide_number: 'G-H-001',
      transport_type: 'interno',
      tracking_status: 'en_curso',
      observations: '',
      order_items: [{ id: 'linea-h', productoDescripcion: 'Producto histórico', cantidad: 1, unidadMedida: 'UND' }],
      created_at: '2026-08-30T00:00:00Z',
    })

    expect(restaurado).toMatchObject({
      id: 'ent-historica',
      direccionEntrega: '',
      numeroDespacho: '',
      modalidad: 'movilidad_propia',
      estado: 'programado',
      incidencias: [],
    })
  })

  it('exige dirección, despacho y guía al registrar una entrega nueva', () => {
    const base = {
      pedidoId: 'pedido-1',
      pedidoNumero: 'PED-001',
      clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001',
      fechaEmision: '2026-09-01',
      fechaProgramada: '2026-09-02',
      tipoTransporte: 'interno' as const,
      modalidad: 'movilidad_propia' as const,
    }

    expect(esquemaDatosProgramacionEntrega.safeParse({ ...base, direccionEntrega: '' }).success).toBe(false)
    expect(esquemaDatosProgramacionEntrega.safeParse({ ...base, numeroDespacho: '' }).success).toBe(false)
    expect(esquemaDatosProgramacionEntrega.safeParse({ ...base, numeroGuiaRemision: '' }).success).toBe(false)
  })

  it('representa el recojo del cliente mediante la modalidad y no como tipo de transporte', () => {
    const recojoCliente = esquemaDatosProgramacionEntrega.safeParse({
      pedidoId: 'pedido-1',
      pedidoNumero: 'PED-001',
      clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001',
      fechaEmision: '2026-09-01',
      fechaProgramada: '2026-09-02',
      tipoTransporte: 'externo',
      modalidad: 'recojo_cliente',
    })

    const resultado = esquemaDatosProgramacionEntrega.safeParse({
      pedidoId: 'pedido-1',
      pedidoNumero: 'PED-001',
      clienteNombre: 'Cliente demo',
      direccionEntrega: 'Av. Central 123',
      numeroDespacho: 'DES-001',
      numeroGuiaRemision: 'G-001',
      fechaProgramada: '2026-09-02',
      tipoTransporte: 'cliente',
      modalidad: 'recojo_cliente',
    })

    expect(recojoCliente.success).toBe(true)
    expect(resultado.success).toBe(false)
  })

  it('filtra entregas por estado y fecha programada', () => {
    const entregas = [
      crearProgramacionEntrega({
        pedidoId: 'pedido-1',
        pedidoNumero: 'PED-001',
        clienteNombre: 'Cliente A',
        direccionEntrega: 'Av. A',
        numeroDespacho: 'DES-001',
        numeroGuiaRemision: 'G-001',
        fechaProgramada: '2026-09-02',
        fechaEntrega: '2026-09-02',
        tipoTransporte: 'externo',
        modalidad: 'movilidad_externa',
        estado: 'en_curso',
        observado: '',
        observaciones: '',
        evidencia: '',
        incidencias: [],
        lineas: [],
      } as unknown as DatosProgramacionEntrega),
      crearProgramacionEntrega({
        pedidoId: 'pedido-2',
        pedidoNumero: 'PED-002',
        clienteNombre: 'Cliente B',
        direccionEntrega: 'Av. B',
        numeroDespacho: 'DES-002',
        numeroGuiaRemision: 'G-002',
        fechaProgramada: '2026-09-03',
        fechaEntrega: '2026-09-03',
        tipoTransporte: 'interno',
        modalidad: 'movilidad_propia',
        estado: 'programado',
        observaciones: '',
        evidencia: '',
        incidencias: [],
        lineas: [],
      } as unknown as DatosProgramacionEntrega),
    ]

    const porEstado = filtrarProgramacionesEntrega(entregas, { estado: 'en_curso' })
    const porFecha = filtrarProgramacionesEntrega(entregas, { fecha: '2026-09-03' })
    const porRango = filtrarProgramacionesEntrega(entregas, { fechaDesde: '2026-09-02', fechaHasta: '2026-09-03' })
    const combinado = filtrarProgramacionesEntrega(entregas, { estado: 'en_curso', fecha: '2026-09-02', busqueda: 'cliente a' })

    expect(porEstado).toHaveLength(1)
    expect(porFecha).toHaveLength(1)
    expect(porRango).toHaveLength(2)
    expect(combinado).toHaveLength(1)
  })

  it('resume entregas por estado, incidencia y retraso', () => {
    const hoy = '2026-09-01'
    const entregas = [
      crearProgramacionEntrega({
        pedidoId: 'pedido-1',
        pedidoNumero: 'PED-001',
        clienteNombre: 'Cliente A',
        direccionEntrega: 'Av. A',
        numeroDespacho: 'DES-001',
        numeroGuiaRemision: 'G-001',
        fechaProgramada: '2026-08-30',
        fechaEntrega: '2026-08-31',
        tipoTransporte: 'externo',
        modalidad: 'movilidad_externa',
        estado: 'en_curso',
        observaciones: 'Retraso',
        evidencia: '',
        incidencias: ['Sin documento'],
        lineas: [],
      } as unknown as DatosProgramacionEntrega),
      crearProgramacionEntrega({
        pedidoId: 'pedido-2',
        pedidoNumero: 'PED-002',
        clienteNombre: 'Cliente B',
        direccionEntrega: 'Av. B',
        numeroDespacho: 'DES-002',
        numeroGuiaRemision: 'G-002',
        fechaProgramada: '2026-09-01',
        fechaEntrega: '2026-09-01',
        tipoTransporte: 'interno',
        modalidad: 'movilidad_propia',
        estado: 'programado',
        observaciones: '',
        evidencia: '',
        incidencias: [],
        lineas: [],
      } as unknown as DatosProgramacionEntrega),
      crearProgramacionEntrega({
        pedidoId: 'pedido-3',
        pedidoNumero: 'PED-003',
        clienteNombre: 'Cliente C',
        direccionEntrega: 'Av. C',
        numeroDespacho: 'DES-003',
        numeroGuiaRemision: 'G-003',
        fechaProgramada: '2026-09-02',
        fechaEntrega: '2026-09-02',
        tipoTransporte: 'interno',
        modalidad: 'movilidad_propia',
        estado: 'entregado',
        observaciones: '',
        evidencia: '',
        incidencias: [],
        lineas: [],
      } as unknown as DatosProgramacionEntrega),
    ]

    const resumen = resumirEntregas(entregas, hoy)

    expect(resumen.total).toBe(3)
    expect(resumen.programados).toBe(1)
    expect(resumen.enCurso).toBe(1)
    expect(resumen.entregados).toBe(1)
    expect(resumen.atrasadas).toBe(1)
    expect(resumen.conIncidencias).toBe(1)
  })

  it('lista alertas de entregas atrasadas para priorizar acciones operativas', () => {
    const hoy = '2026-09-01'
    const entregas = [
      crearProgramacionEntrega({
        pedidoId: 'pedido-1',
        pedidoNumero: 'PED-001',
        clienteNombre: 'Cliente A',
        direccionEntrega: 'Av. A',
        numeroDespacho: 'DES-001',
        numeroGuiaRemision: 'G-001',
        fechaProgramada: '2026-08-30',
        fechaEntrega: '',
        tipoTransporte: 'externo',
        modalidad: 'movilidad_externa',
        estado: 'en_curso',
        observaciones: 'Retraso por tráfico',
        evidencia: '',
        incidencias: ['Sin documento'],
        lineas: [],
      } as unknown as DatosProgramacionEntrega),
      crearProgramacionEntrega({
        pedidoId: 'pedido-2',
        pedidoNumero: 'PED-002',
        clienteNombre: 'Cliente B',
        direccionEntrega: 'Av. B',
        numeroDespacho: 'DES-002',
        numeroGuiaRemision: 'G-002',
        fechaProgramada: '2026-09-02',
        fechaEntrega: '',
        tipoTransporte: 'interno',
        modalidad: 'movilidad_propia',
        estado: 'programado',
        observaciones: '',
        evidencia: '',
        incidencias: [],
        lineas: [],
      } as unknown as DatosProgramacionEntrega),
      crearProgramacionEntrega({
        pedidoId: 'pedido-3',
        pedidoNumero: 'PED-003',
        clienteNombre: 'Cliente C',
        direccionEntrega: 'Av. C',
        numeroDespacho: 'DES-003',
        numeroGuiaRemision: 'G-003',
        fechaProgramada: '2026-08-31',
        fechaEntrega: '2026-08-31',
        tipoTransporte: 'interno',
        modalidad: 'movilidad_propia',
        estado: 'entregado',
        observaciones: '',
        evidencia: '',
        incidencias: [],
        lineas: [],
      } as unknown as DatosProgramacionEntrega),
    ]

    const atrasadas = listarEntregasAtrasadas(entregas, hoy)

    expect(atrasadas).toHaveLength(1)
    expect(atrasadas[0].pedidoNumero).toBe('PED-001')
    expect(atrasadas[0].incidencias).toContain('Sin documento')
  })
})
