import { supabase } from '@/lib/supabase'
import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
import type {
  ConsultaReparaciones,
  ConsultaReparacionesPaginada,
  ResultadoReparacionesPaginado,
} from '@/modulos/reparaciones/modelo/consultaReparaciones'
import {
  normalizarBusquedaReparaciones,
  normalizarTextoOpcional,
  limitarEnteroSeguro,
  type CotizacionReparacion,
  type DatosCotizacion,
  type DatosConsumoParte,
  type DatosDiagnostico,
  type DatosObservacionReparacion,
  type DatosPrueba,
  type DatosReparacion,
  type DatosReservaParte,
  type DatosSolucionReparacion,
  type DetalleReparacion,
  type DiagnosticoReparacion,
  type EventoReparacion,
  type LineaCotizacionReparacion,
  type OpcionClienteReparacion,
  type OpcionProductoReparacion,
  type ParteReparacion,
  type PruebaReparacion,
  type Reparacion,
  type ConsumoParteReparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

interface ErrorSupabase {
  code?: string
  message?: string
  details?: string
  hint?: string
}

interface FilaReparacion {
  id: string
  organization_id: string
  repair_code: string
  customer_id: string
  product_id: string
  serial_number: string | null
  received_at: string
  estimated_delivery_date: string | null
  delivered_at: string | null
  status: string
  priority: string
  problem_description: string
  diagnosis: string | null
  applied_solution: string | null
  notes: string | null
  customer_reference: string | null
  sale_document_id: string | null
  warranty_reference: string | null
  assigned_technician_id: string | null
  customer_name_snapshot: string
  customer_document_snapshot: string
  product_code_snapshot: string
  product_description_snapshot: string
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

interface FilaClienteReparacion {
  id: string
  document_type: string
  document_number: string
  legal_name: string
  trade_name: string | null
}

interface FilaProductoReparacion {
  id: string
  code: string
  description: string
  unit_of_measure: string | null
  serial_control: boolean | null
  batch_control: boolean | null
  expiration_control: boolean | null
}

interface FilaDiagnostico {
  id: string
  organization_id: string
  repair_id: string
  diagnosed_at: string
  technician_id: string
  symptoms: string
  cause_found: string | null
  recommended_solution: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

interface FilaCotizacion {
  id: string
  organization_id: string
  repair_id: string
  version_number: number
  is_current: boolean
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  currency: 'PEN' | 'USD'
  prices_include_tax: boolean
  tax_rate: number
  subtotal: number
  tax: number
  total: number
  approved_by: string | null
  approved_at: string | null
  approval_observation: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_observation: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

interface FilaLineaCotizacion {
  id: string
  organization_id: string
  quote_id: string
  line_type: 'labor' | 'part' | 'external_service'
  product_id: string | null
  description: string
  quantity: number
  unit_price: number
  taxable: boolean
  line_subtotal: number | null
  created_at: string
}

interface FilaParte {
  id: string
  organization_id: string
  repair_id: string
  product_id: string
  product_code_snapshot: string
  product_description_snapshot: string
  warehouse_id: string
  location_id: string
  stock_status: 'available' | 'quarantine' | 'damaged'
  lot: string | null
  expiration_date: string | null
  quantity_requested: number
  quantity_consumed: number
  status: 'reserved' | 'consumed' | 'cancelled'
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

interface FilaConsumoParte {
  id: string
  organization_id: string
  repair_part_id: string
  quantity: number
  warehouse_id: string
  location_id: string
  stock_status: 'available' | 'quarantine' | 'damaged'
  lot: string | null
  expiration_date: string | null
  unit_cost: number
  inventory_movement_id: string
  operation_key: string
  consumed_by: string | null
  consumed_at: string
  created_at: string
}

interface FilaPrueba {
  id: string
  organization_id: string
  repair_id: string
  test_type: string
  result: string
  passed: boolean
  performed_by: string
  notes: string | null
  completed_at: string
  created_by: string | null
  created_at: string
}

interface FilaEvento {
  id: number
  organization_id: string
  repair_id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  actor_user_id: string | null
  observation: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface FilaTecnico {
  user_id: string
  full_name: string
  email: string
}

interface FilaAlmacen {
  id: string
  code: string
  name: string
  address: string | null
  is_active: boolean
}

interface FilaUbicacion {
  id: string
  warehouse_id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
}

const columnasReparacion =
  'id,organization_id,repair_code,customer_id,product_id,serial_number,received_at,estimated_delivery_date,delivered_at,status,priority,problem_description,diagnosis,applied_solution,notes,customer_reference,sale_document_id,warranty_reference,assigned_technician_id,customer_name_snapshot,customer_document_snapshot,product_code_snapshot,product_description_snapshot,created_by,updated_by,created_at,updated_at' as const

const tamanioPaginaMaximo = 50
const paginaMaxima = 100_000

type ContextoError =
  | 'consultar'
  | 'crear'
  | 'editar'
  | 'asignar'
  | 'estado'
  | 'diagnostico'
  | 'solucion'
  | 'cotizacion'
  | 'aprobacion'
  | 'repuesto'
  | 'prueba'
  | 'entrega'
  | 'cancelacion'
  | 'tecnicos'
  | 'opciones'

function textoError(error: ErrorSupabase) {
  return [error.message, error.details, error.hint].filter(Boolean).join(' ')
}

const mensajesDominio: Array<[string, string]> = [
  ['REPAIR_PAYLOAD_INVALID', 'Los datos enviados no tienen un formato válido.'],
  ['REPAIR_SERIAL_NUMBER_RULE_VIOLATION', 'El número de serie no coincide con el control del producto seleccionado.'],
  ['REPAIR_CUSTOMER_REQUIRED', 'Selecciona un cliente activo.'],
  ['REPAIR_PRODUCT_REQUIRED', 'Selecciona un producto activo.'],
  ['REPAIR_CUSTOMER_NOT_FOUND', 'No se encontró el cliente de la reparación.'],
  ['REPAIR_CUSTOMER_UNAVAILABLE', 'El cliente ya no está activo o no pertenece a la organización.'],
  ['REPAIR_PRODUCT_UNAVAILABLE', 'El producto ya no está activo o no pertenece a la organización.'],
  ['REPAIR_PRODUCT_NOT_FOUND', 'No se encontró el producto de la reparación.'],
  ['REPAIR_INITIAL_STATUS_INVALID', 'El estado inicial de la reparación no es válido.'],
  ['REPAIR_PROBLEM_REQUIRED', 'Describe el problema de la reparación.'],
  ['REPAIR_NOT_FOUND', 'No se encontró la reparación solicitada.'],
  ['REPAIR_NOT_EDITABLE', 'La reparación ya no admite cambios.'],
  ['REPAIR_TECHNICAL_CHANGE_REQUIRES_REWORK', 'Vuelve la reparación a En reparación antes de realizar cambios técnicos.'],
  ['REPAIR_IDENTITY_LOCKED', 'La identidad de la reparación ya no puede modificarse porque la atención ya avanzó.'],
  ['REPAIR_ASSIGN_USE_ASSIGN_RPC', 'La asignación debe realizarse desde la acción de asignar técnico.'],
  ['REPAIR_DIAGNOSIS_USE_DIAGNOSIS_RPC', 'El diagnóstico debe registrarse desde la acción especializada.'],
  ['REPAIR_APPLIED_SOLUTION_USE_SOLUTION_RPC', 'La solución aplicada debe registrarse desde la acción especializada.'],
  ['REPAIR_RECEIVED_AT_IMMUTABLE', 'La fecha de recepción no puede modificarse.'],
  ['REPAIR_TECHNICIAN_UNAVAILABLE', 'El técnico seleccionado no está activo en la organización.'],
  ['REPAIR_NOT_ASSIGNABLE', 'La reparación ya no admite asignación.'],
  ['REPAIR_STATUS_USE_STATUS_RPC', 'El estado debe cambiarse desde la acción de flujo.'],
  ['REPAIR_SPECIALIZED_STATUS_REQUIRED', 'Ese estado se alcanza desde una acción especializada.'],
  ['REPAIR_STATUS_TRANSITION_INVALID', 'El cambio de estado no está permitido para el flujo actual.'],
  ['REPAIR_PENDING_QUOTE_REQUIRED', 'Primero debes enviar una cotización pendiente de aprobación.'],
  ['REPAIR_DIAGNOSIS_STATE_REQUIRED', 'La reparación debe estar en diagnóstico para registrar este dato.'],
  ['REPAIR_DIAGNOSIS_SYMPTOMS_REQUIRED', 'Describe los síntomas antes de guardar el diagnóstico.'],
  ['REPAIR_APPLIED_SOLUTION_REQUIRED', 'Describe la solución aplicada antes de guardar.'],
  ['REPAIR_QUOTE_ITEMS_REQUIRED', 'Agrega al menos una línea a la cotización.'],
  ['REPAIR_QUOTE_STATE_INVALID', 'La reparación no está en un estado que permita cotizar.'],
  ['REPAIR_QUOTE_NOT_FOUND', 'No se encontró la cotización indicada.'],
  ['REPAIR_QUOTE_NOT_EDITABLE', 'Solo se pueden editar cotizaciones en borrador.'],
  ['REPAIR_QUOTE_STALE_VERSION', 'La cotización cambió. Actualiza el detalle antes de continuar.'],
  ['REPAIR_QUOTE_REVISION_REQUIRED', 'Esta cotización requiere crear una revisión explícita.'],
  ['REPAIR_QUOTE_REVISION_STATE_INVALID', 'La reparación ya no permite crear esta revisión.'],
  ['REPAIR_QUOTE_REVISION_BASE_INVALID', 'La versión seleccionada no es una cotización rechazada.'],
  ['REPAIR_QUOTE_PRODUCT_NOT_FOUND', 'No se encontró el producto del repuesto.'],
  ['REPAIR_QUOTE_PRODUCT_UNAVAILABLE', 'El producto del repuesto ya no está activo.'],
  ['REPAIR_QUOTE_APPROVAL_STATE_INVALID', 'La reparación no está esperando aprobación del cliente.'],
  ['REPAIR_QUOTE_REJECTION_STATE_INVALID', 'La reparación no está esperando aprobación del cliente.'],
  ['REPAIR_QUOTE_NOT_PENDING', 'La cotización ya no está pendiente de aprobación.'],
  ['REPAIR_PART_RESERVATION_STATE_INVALID', 'La reparación no permite reservar repuestos en este estado.'],
  ['REPAIR_PART_PRODUCT_NOT_FOUND', 'No se encontró el producto del repuesto.'],
  ['REPAIR_PART_PRODUCT_UNAVAILABLE', 'El producto del repuesto ya no está activo.'],
  ['REPAIR_PART_LOT_REQUIRED', 'El producto requiere indicar un lote.'],
  ['REPAIR_PART_WAREHOUSE_UNAVAILABLE', 'El almacén seleccionado no está activo.'],
  ['REPAIR_PART_LOCATION_UNAVAILABLE', 'La ubicación seleccionada no está activa en ese almacén.'],
  ['REPAIR_PART_STOCK_NOT_ASSIGNABLE', 'Reparaciones solo puede reservar o consumir stock disponible.'],
  ['REPAIR_PART_QUANTITY_INVALID', 'La cantidad a reservar no es válida.'],
  ['REPAIR_INSUFFICIENT_STOCK', 'La cantidad supera el stock disponible en el almacén, ubicación y lote seleccionados.'],
  ['INVENTORY_FEFO_VIOLATION', 'Debes reservar primero el lote con vencimiento más próximo.'],
  ['INVENTORY_EXPIRED_STOCK', 'El lote está vencido y no puede reservarse.'],
  ['REPAIR_CONSUMPTION_KEYS_REQUIRED', 'No se pudo generar la clave única del consumo. Inténtalo nuevamente.'],
  ['REPAIR_CONSUMPTION_QUANTITY_INVALID', 'La cantidad a consumir no es válida.'],
  ['REPAIR_OPERATION_KEY_REUSED', 'El consumo ya fue registrado con otra cantidad o repuesto.'],
  ['REPAIR_PART_NOT_FOUND', 'No se encontró la reserva de repuesto.'],
  ['REPAIR_PART_CONSUMPTION_STATE_INVALID', 'La reparación no permite consumir repuestos en este estado.'],
  ['REPAIR_PART_NOT_CONSUMABLE', 'La reserva ya no tiene saldo consumible.'],
  ['REPAIR_CONSUMPTION_QUANTITY_EXCEEDED', 'La cantidad supera el saldo pendiente de la reserva.'],
  ['REPAIR_PART_NOT_CANCELLABLE', 'La reserva ya no puede cancelarse.'],
  ['REPAIR_TEST_RESULT_REQUIRED', 'Indica si la prueba fue aprobada o no.'],
  ['REPAIR_TESTING_STATE_REQUIRED', 'La reparación debe estar en pruebas para registrar este resultado.'],
  ['REPAIR_TEST_DATA_REQUIRED', 'Completa el tipo y el resultado de la prueba.'],
  ['REPAIR_DELIVERY_STATE_REQUIRED', 'La reparación debe estar lista para entrega.'],
  ['REPAIR_ASSIGNED_TECHNICIAN_REQUIRED', 'Asigna un técnico antes de marcar la reparación lista para entrega.'],
  ['REPAIR_APPROVED_TEST_REQUIRED', 'Registra al menos una prueba aprobada en el ciclo vigente.'],
  ['REPAIR_FAILED_TEST_PRESENT', 'El ciclo de pruebas vigente contiene una prueba fallida.'],
  ['REPAIR_PENDING_PARTS', 'Cancela o consume las reservas pendientes antes de marcar la reparación lista.'],
  ['REPAIR_NOT_CANCELLABLE', 'La reparación ya no puede cancelarse.'],
  ['REPAIR_FORBIDDEN', 'No tienes permiso para ejecutar esta acción.'],
  ['AUTHENTICATION_REQUIRED', 'Tu sesión ya no está disponible. Inicia sesión nuevamente.'],
  ['AUTH_SESSION_INACTIVE', 'Tu sesión ya no está activa. Inicia sesión nuevamente.'],
]

export function obtenerMensajeErrorReparacion(
  error: ErrorSupabase,
  contexto: ContextoError,
) {
  const mensaje = textoError(error)
  const dominio = mensajesDominio.find(([codigo]) => mensaje.includes(codigo))
  if (dominio) return dominio[1]
  if (error.code === '42501') return 'No tienes permiso para ejecutar esta acción.'
  if (error.code === '23505') return 'Ya existe un registro equivalente para esta operación.'

  return {
    consultar: 'No se pudo cargar la información de reparaciones.',
    crear: 'No se pudo registrar la reparación.',
    editar: 'No se pudo actualizar la reparación.',
    asignar: 'No se pudo asignar el técnico.',
    estado: 'No se pudo cambiar el estado de la reparación.',
    diagnostico: 'No se pudo registrar el diagnóstico.',
    solucion: 'No se pudo guardar la solución aplicada.',
    cotizacion: 'No se pudo guardar la cotización.',
    aprobacion: 'No se pudo actualizar la aprobación de la cotización.',
    repuesto: 'No se pudo actualizar el repuesto.',
    prueba: 'No se pudo registrar la prueba.',
    entrega: 'No se pudo entregar la reparación.',
    cancelacion: 'No se pudo cancelar la reparación.',
    tecnicos: 'No se pudo cargar la lista de técnicos.',
    opciones: 'No se pudieron cargar las opciones de reparaciones.',
  }[contexto]
}

function mapearReparacion(fila: FilaReparacion): Reparacion {
  return {
    id: fila.id,
    organizationId: fila.organization_id,
    codigo: fila.repair_code,
    clienteId: fila.customer_id,
    productoId: fila.product_id,
    numeroSerie: fila.serial_number ?? '',
    recibidaEn: fila.received_at,
    fechaEntregaEstimada: fila.estimated_delivery_date ?? '',
    entregadaEn: fila.delivered_at ?? '',
    estado: fila.status as Reparacion['estado'],
    prioridad: fila.priority as Reparacion['prioridad'],
    problema: fila.problem_description,
    diagnostico: fila.diagnosis ?? '',
    diagnosticoRegistrado: fila.diagnosis !== null,
    solucionAplicada: fila.applied_solution ?? '',
    solucionAplicadaRegistrada: fila.applied_solution !== null,
    notas: fila.notes ?? '',
    referenciaCliente: fila.customer_reference ?? '',
    documentoVentaId: fila.sale_document_id ?? '',
    referenciaGarantia: fila.warranty_reference ?? '',
    tecnicoAsignadoId: fila.assigned_technician_id,
    clienteNombreSnapshot: fila.customer_name_snapshot,
    clienteDocumentoSnapshot: fila.customer_document_snapshot,
    productoCodigoSnapshot: fila.product_code_snapshot,
    productoDescripcionSnapshot: fila.product_description_snapshot,
    creadoPor: fila.created_by,
    actualizadoPor: fila.updated_by,
    creadoEn: fila.created_at,
    actualizadoEn: fila.updated_at,
  }
}

function mapearDiagnostico(fila: FilaDiagnostico): DiagnosticoReparacion {
  return {
    id: fila.id,
    organizationId: fila.organization_id,
    reparacionId: fila.repair_id,
    diagnosticadoEn: fila.diagnosed_at,
    tecnicoId: fila.technician_id,
    sintomas: fila.symptoms,
    causaEncontrada: fila.cause_found ?? '',
    solucionRecomendada: fila.recommended_solution ?? '',
    notas: fila.notes ?? '',
    creadoPor: fila.created_by,
    creadoEn: fila.created_at,
  }
}

function mapearLineaCotizacion(fila: FilaLineaCotizacion): LineaCotizacionReparacion {
  return {
    id: fila.id,
    organizationId: fila.organization_id,
    cotizacionId: fila.quote_id,
    tipo: fila.line_type,
    productoId: fila.product_id,
    descripcion: fila.description,
    cantidad: Number(fila.quantity),
    precioUnitario: Number(fila.unit_price),
    gravable: fila.taxable,
    subtotalLinea: Number(fila.line_subtotal ?? 0),
    creadoEn: fila.created_at,
  }
}

function mapearCotizacion(
  fila: FilaCotizacion,
  lineas: LineaCotizacionReparacion[],
): CotizacionReparacion {
  return {
    id: fila.id,
    organizationId: fila.organization_id,
    reparacionId: fila.repair_id,
    version: fila.version_number,
    esActual: fila.is_current,
    estado: fila.status,
    moneda: fila.currency,
    preciosIncluyenImpuesto: fila.prices_include_tax,
    tasaImpuesto: Number(fila.tax_rate),
    subtotal: Number(fila.subtotal),
    impuesto: Number(fila.tax),
    total: Number(fila.total),
    aprobadoPor: fila.approved_by,
    aprobadoEn: fila.approved_at,
    observacionAprobacion: fila.approval_observation ?? '',
    rechazadoPor: fila.rejected_by,
    rechazadoEn: fila.rejected_at,
    observacionRechazo: fila.rejection_observation ?? '',
    creadoPor: fila.created_by,
    actualizadoPor: fila.updated_by,
    creadoEn: fila.created_at,
    actualizadoEn: fila.updated_at,
    lineas,
  }
}

export function seleccionarCotizacionActual(
  cotizaciones: readonly CotizacionReparacion[],
) {
  return cotizaciones.find((cotizacion) => cotizacion.esActual) ?? null
}

function mapearConsumo(fila: FilaConsumoParte): ConsumoParteReparacion {
  return {
    id: fila.id,
    organizationId: fila.organization_id,
    parteId: fila.repair_part_id,
    cantidad: Number(fila.quantity),
    almacenId: fila.warehouse_id,
    ubicacionId: fila.location_id,
    estadoStock: fila.stock_status,
    lote: fila.lot ?? '',
    fechaVencimiento: fila.expiration_date ?? '',
    costoUnitario: Number(fila.unit_cost),
    movimientoInventarioId: fila.inventory_movement_id,
    claveOperacion: fila.operation_key,
    consumidoPor: fila.consumed_by,
    consumidoEn: fila.consumed_at,
    creadoEn: fila.created_at,
  }
}

function mapearParte(
  fila: FilaParte,
  consumos: ConsumoParteReparacion[],
): ParteReparacion {
  return {
    id: fila.id,
    organizationId: fila.organization_id,
    reparacionId: fila.repair_id,
    productoId: fila.product_id,
    productoCodigoSnapshot: fila.product_code_snapshot,
    productoDescripcionSnapshot: fila.product_description_snapshot,
    almacenId: fila.warehouse_id,
    ubicacionId: fila.location_id,
    estadoStock: fila.stock_status,
    lote: fila.lot ?? '',
    fechaVencimiento: fila.expiration_date ?? '',
    cantidadSolicitada: Number(fila.quantity_requested),
    cantidadConsumida: Number(fila.quantity_consumed),
    estado: fila.status,
    notas: fila.notes ?? '',
    creadoPor: fila.created_by,
    actualizadoPor: fila.updated_by,
    creadoEn: fila.created_at,
    actualizadoEn: fila.updated_at,
    consumos,
  }
}

function mapearPrueba(fila: FilaPrueba): PruebaReparacion {
  return {
    id: fila.id,
    organizationId: fila.organization_id,
    reparacionId: fila.repair_id,
    tipo: fila.test_type,
    resultado: fila.result,
    aprobada: fila.passed,
    realizadaPor: fila.performed_by,
    notas: fila.notes ?? '',
    completadaEn: fila.completed_at,
    creadoPor: fila.created_by,
    creadoEn: fila.created_at,
  }
}

function mapearEvento(fila: FilaEvento): EventoReparacion {
  return {
    id: fila.id,
    organizationId: fila.organization_id,
    reparacionId: fila.repair_id,
    tipo: fila.event_type,
    estadoAnterior: fila.from_status,
    estadoNuevo: fila.to_status,
    actorId: fila.actor_user_id,
    observacion: fila.observation ?? '',
    metadata: fila.metadata ?? {},
    creadoEn: fila.created_at,
  }
}

function escaparPatronIlike(valor: string) {
  return valor.trim().replace(/[\\%_]/g, '\\$&')
}

function construirConsultaReparaciones(
  organizationId: string,
  consulta: ConsultaReparaciones,
) {
  let query = supabase
    .from('repair_list')
    .select(columnasReparacion, { count: 'exact' })
    .eq('organization_id', organizationId)

  if (consulta.estado !== 'todos') query = query.eq('status', consulta.estado)
  if (consulta.prioridad !== 'todas') query = query.eq('priority', consulta.prioridad)

  const termino = escaparPatronIlike(normalizarBusquedaReparaciones(consulta.busqueda))
  if (termino) {
    query = query.or(
      [
        'repair_code',
        'customer_name_snapshot',
        'customer_document_snapshot',
         'product_code_snapshot',
         'product_description_snapshot',
        'serial_number',
        'customer_reference',
        'warranty_reference',
      ]
        .map((columna) => `${columna}.ilike.%${termino}%`)
        .join(','),
    )
  }

  return query.order('received_at', { ascending: false }).order('id', {
    ascending: false,
  })
}

export async function listarReparacionesPaginadas(
  organizationId: string,
  consulta: ConsultaReparacionesPaginada,
): Promise<ResultadoReparacionesPaginado> {
  const pagina = limitarEnteroSeguro(consulta.pagina, 1, paginaMaxima)
  const tamanioPagina = limitarEnteroSeguro(
    consulta.tamanioPagina,
    1,
    tamanioPaginaMaximo,
  )
  const indiceInicial = (pagina - 1) * tamanioPagina
  const { data, error, count } = await construirConsultaReparaciones(
    organizationId,
    consulta,
  ).range(indiceInicial, indiceInicial + tamanioPagina - 1)

  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'consultar'))
  return {
    elementos: ((data ?? []) as FilaReparacion[]).map(mapearReparacion),
    totalFiltrado: count ?? 0,
  }
}

export async function obtenerResumenReparaciones(organizationId: string) {
  const contar = () =>
    supabase
      .from('repair_list')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)

  const [total, abiertas, esperandoAprobacion, listasParaEntrega] = await Promise.all([
    contar(),
    contar().neq('status', 'delivered').neq('status', 'cancelled').neq('status', 'rejected'),
    contar().eq('status', 'waiting_customer_approval'),
    contar().eq('status', 'ready_for_delivery'),
  ])
  const fallo = [total, abiertas, esperandoAprobacion, listasParaEntrega].find(
    (resultado) => resultado.error,
  )
  if (fallo?.error) {
    throw new Error(obtenerMensajeErrorReparacion(fallo.error, 'consultar'))
  }

  return {
    total: total.count ?? 0,
    abiertas: abiertas.count ?? 0,
    esperandoAprobacion: esperandoAprobacion.count ?? 0,
    listasParaEntrega: listasParaEntrega.count ?? 0,
  }
}

export async function obtenerDetalleReparacion(
  organizationId: string,
  repairId: string,
): Promise<DetalleReparacion> {
  const [repairResult, quotesResult, diagnosticsResult, partsResult, testsResult, eventsResult] =
    await Promise.all([
      supabase
        .from('repair_list')
        .select(columnasReparacion)
        .eq('organization_id', organizationId)
        .eq('id', repairId)
        .maybeSingle(),
      supabase
        .from('repair_quotes')
        .select('id,organization_id,repair_id,version_number,is_current,status,currency,prices_include_tax,tax_rate,subtotal,tax,total,approved_by,approved_at,approval_observation,rejected_by,rejected_at,rejection_observation,created_by,updated_by,created_at,updated_at')
        .eq('organization_id', organizationId)
        .eq('repair_id', repairId)
        .order('version_number', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('repair_diagnostics')
        .select('id,organization_id,repair_id,diagnosed_at,technician_id,symptoms,cause_found,recommended_solution,notes,created_by,created_at')
        .eq('organization_id', organizationId)
        .eq('repair_id', repairId)
        .order('diagnosed_at', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('repair_parts')
        .select('id,organization_id,repair_id,product_id,product_code_snapshot,product_description_snapshot,warehouse_id,location_id,stock_status,lot,expiration_date,quantity_requested,quantity_consumed,status,notes,created_by,updated_by,created_at,updated_at')
        .eq('organization_id', organizationId)
        .eq('repair_id', repairId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
      supabase
        .from('repair_tests')
        .select('id,organization_id,repair_id,test_type,result,passed,performed_by,notes,completed_at,created_by,created_at')
        .eq('organization_id', organizationId)
        .eq('repair_id', repairId)
        .order('completed_at', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('repair_events')
        .select('id,organization_id,repair_id,event_type,from_status,to_status,actor_user_id,observation,metadata,created_at', { count: 'exact' })
        .eq('organization_id', organizationId)
        .eq('repair_id', repairId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    ])

  const fallo = [
    repairResult,
    quotesResult,
    diagnosticsResult,
    partsResult,
    testsResult,
    eventsResult,
  ].find((resultado) => resultado.error)
  if (fallo?.error) {
    throw new Error(obtenerMensajeErrorReparacion(fallo.error, 'consultar'))
  }
  if (!repairResult.data) throw new Error('No se encontró la reparación solicitada.')

  const quotes = (quotesResult.data as FilaCotizacion[]).map((fila) =>
    mapearCotizacion(fila, []),
  )
  const quoteIds = quotes.map((quote) => quote.id)
  const lineasResult = quoteIds.length
    ? await supabase
        .from('repair_quote_items')
        .select('id,organization_id,quote_id,line_type,product_id,description,quantity,unit_price,taxable,line_subtotal,created_at')
        .eq('organization_id', organizationId)
        .in('quote_id', quoteIds)
        .order('id', { ascending: true })
    : { data: [], error: null }
  if (lineasResult.error) {
    throw new Error(obtenerMensajeErrorReparacion(lineasResult.error, 'consultar'))
  }

  const lineasPorCotizacion = new Map<string, LineaCotizacionReparacion[]>()
  for (const fila of (lineasResult.data as FilaLineaCotizacion[])) {
    const lineas = lineasPorCotizacion.get(fila.quote_id) ?? []
    lineas.push(mapearLineaCotizacion(fila))
    lineasPorCotizacion.set(fila.quote_id, lineas)
  }
  const cotizaciones = (quotesResult.data as FilaCotizacion[]).map((fila) =>
    mapearCotizacion(fila, lineasPorCotizacion.get(fila.id) ?? []),
  )

  const partes = partsResult.data as FilaParte[]
  const parteIds = partes.map((parte) => parte.id)
  const consumosResult = parteIds.length
    ? await supabase
        .from('repair_part_consumptions')
        .select('id,organization_id,repair_part_id,quantity,warehouse_id,location_id,stock_status,lot,expiration_date,unit_cost,inventory_movement_id,operation_key,consumed_by,consumed_at,created_at')
        .eq('organization_id', organizationId)
        .in('repair_part_id', parteIds)
        .order('consumed_at', { ascending: false })
        .order('id', { ascending: false })
    : { data: [], error: null }
  if (consumosResult.error) {
    throw new Error(obtenerMensajeErrorReparacion(consumosResult.error, 'consultar'))
  }

  const consumosPorParte = new Map<string, ConsumoParteReparacion[]>()
  for (const fila of (consumosResult.data as FilaConsumoParte[])) {
    const consumos = consumosPorParte.get(fila.repair_part_id) ?? []
    consumos.push(mapearConsumo(fila))
    consumosPorParte.set(fila.repair_part_id, consumos)
  }

  const cotizacionActiva = seleccionarCotizacionActual(cotizaciones)
  const eventos = ((eventsResult.data ?? []) as FilaEvento[]).map(mapearEvento)
  return {
    reparacion: mapearReparacion(repairResult.data as FilaReparacion),
    diagnosticos: (diagnosticsResult.data as FilaDiagnostico[]).map(mapearDiagnostico),
    cotizaciones,
    cotizacionActiva,
    partes: partes.map((parte) =>
      mapearParte(parte, consumosPorParte.get(parte.id) ?? []),
    ),
    pruebas: (testsResult.data as FilaPrueba[]).map(mapearPrueba),
    eventos,
    eventosCompletos: eventsResult.count === eventos.length,
  }
}

export async function listarOpcionesClientesReparacion(
  organizationId: string,
): Promise<OpcionClienteReparacion[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id,document_type,document_number,legal_name,trade_name')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('legal_name', { ascending: true })
    .limit(1000)
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'opciones'))

  return ((data ?? []) as FilaClienteReparacion[]).map((fila) => ({
    id: fila.id,
    nombre: fila.legal_name,
    nombreComercial: fila.trade_name ?? '',
    documento: `${fila.document_type} ${fila.document_number}`,
  }))
}

export async function listarOpcionesProductosReparacion(
  organizationId: string,
): Promise<OpcionProductoReparacion[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id,code,description,unit_of_measure,serial_control,batch_control,expiration_control')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('description', { ascending: true })
    .order('code', { ascending: true })
    .limit(1000)
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'opciones'))

  return ((data ?? []) as FilaProductoReparacion[]).map((fila) => ({
    id: fila.id,
    codigo: fila.code,
    descripcion: fila.description,
    unidadMedida: fila.unit_of_measure ?? '',
    serialControl: fila.serial_control ?? false,
    controlLote: fila.batch_control ?? false,
    controlVencimiento: fila.expiration_control ?? false,
  }))
}

export async function listarAlmacenesReparacion(
  organizationId: string,
): Promise<{ almacenes: Almacen[]; ubicaciones: UbicacionAlmacen[] }> {
  const [almacenesResult, ubicacionesResult] = await Promise.all([
    supabase
      .from('warehouses')
      .select('id,code,name,address,is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('warehouse_locations')
      .select('id,warehouse_id,code,name,description,is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ])
  const fallo = [almacenesResult, ubicacionesResult].find((resultado) => resultado.error)
  if (fallo?.error) {
    throw new Error(obtenerMensajeErrorReparacion(fallo.error, 'opciones'))
  }

  return {
    almacenes: ((almacenesResult.data ?? []) as FilaAlmacen[]).map((fila) => ({
      id: fila.id,
      codigo: fila.code,
      nombre: fila.name,
      direccion: fila.address ?? '',
      activo: fila.is_active,
    })),
    ubicaciones: ((ubicacionesResult.data ?? []) as FilaUbicacion[]).map((fila) => ({
      id: fila.id,
      almacenId: fila.warehouse_id,
      codigo: fila.code,
      nombre: fila.name,
      descripcion: fila.description ?? '',
      activa: fila.is_active,
    })),
  }
}

export async function listarTecnicosReparacion(
  organizationId: string,
  busqueda = '',
  limite = 100,
) {
  const { data, error } = await supabase.rpc('list_repair_technicians', {
    requested_organization_id: organizationId,
    requested_search: busqueda.trim().slice(0, 100),
    requested_limit: limitarEnteroSeguro(limite, 1, 500),
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'tecnicos'))
  return ((data ?? []) as FilaTecnico[]).map((fila) => ({
    id: fila.user_id,
    nombre: fila.full_name,
    correo: fila.email,
  }))
}

function payloadGeneralReparacion(
  organizationId: string,
  datos: DatosReparacion,
) {
  return {
    organization_id: organizationId,
    estimated_delivery_date: normalizarTextoOpcional(datos.fechaEstimadaEntrega),
    priority: datos.prioridad,
    problem_description: datos.problema.trim(),
    notes: normalizarTextoOpcional(datos.notas),
    customer_reference: normalizarTextoOpcional(datos.referenciaCliente),
    sale_document_id: normalizarTextoOpcional(datos.documentoVentaId),
    warranty_reference: normalizarTextoOpcional(datos.referenciaGarantia),
  }
}

function payloadIdentidadReparacion(datos: DatosReparacion) {
  return {
    customer_id: datos.clienteId,
    product_id: datos.productoId,
    serial_number: normalizarTextoOpcional(datos.numeroSerie),
  }
}

export async function crearReparacion(
  organizationId: string,
  datos: DatosReparacion,
) {
  const { data, error } = await supabase.rpc('create_repair', {
    payload: {
      ...payloadGeneralReparacion(organizationId, datos),
      ...payloadIdentidadReparacion(datos),
      status: datos.esGarantia ? 'warranty' : 'received',
    },
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'crear'))
  return data as string
}

export async function actualizarReparacion(
  organizationId: string,
  reparacionId: string,
  datos: DatosReparacion,
  identidadEditable: boolean,
) {
  const { error } = await supabase.rpc('update_repair', {
    payload: {
      id: reparacionId,
      ...payloadGeneralReparacion(organizationId, datos),
      ...(identidadEditable ? payloadIdentidadReparacion(datos) : {}),
    },
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'editar'))
}

export async function asignarReparacion(
  organizationId: string,
  reparacionId: string,
  tecnicoId: string,
) {
  const { error } = await supabase.rpc('assign_repair', {
    requested_organization_id: organizationId,
    requested_repair_id: reparacionId,
    requested_technician_id: tecnicoId,
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'asignar'))
}

export async function cambiarEstadoReparacion(
  organizationId: string,
  reparacionId: string,
  estado: string,
  observacion: string,
) {
  const { error } = await supabase.rpc('change_repair_status', {
    requested_organization_id: organizationId,
    requested_repair_id: reparacionId,
    requested_status: estado,
    requested_observation: normalizarTextoOpcional(observacion),
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'estado'))
}

export async function registrarDiagnosticoReparacion(
  organizationId: string,
  reparacionId: string,
  datos: DatosDiagnostico,
) {
  const { data, error } = await supabase.rpc('record_repair_diagnosis', {
    payload: {
      organization_id: organizationId,
      repair_id: reparacionId,
      technician_id: normalizarTextoOpcional(datos.tecnicoId),
      symptoms: datos.sintomas.trim(),
      cause_found: normalizarTextoOpcional(datos.causaEncontrada),
      recommended_solution: normalizarTextoOpcional(datos.solucionRecomendada),
      notes: normalizarTextoOpcional(datos.notas),
    },
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'diagnostico'))
  return data as string
}

export async function registrarSolucionReparacion(
  organizationId: string,
  reparacionId: string,
  datos: DatosSolucionReparacion,
) {
  const { error } = await supabase.rpc('record_repair_solution', {
    payload: {
      organization_id: organizationId,
      repair_id: reparacionId,
      applied_solution: datos.solucionAplicada.trim(),
    },
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'solucion'))
}

export async function guardarCotizacionReparacion(
  organizationId: string,
  reparacionId: string,
  datos: DatosCotizacion,
  enviar: boolean,
) {
  const { data, error } = await supabase.rpc('save_repair_quote', {
    payload: {
      organization_id: organizationId,
      repair_id: reparacionId,
      ...(datos.id ? { id: datos.id } : {}),
      currency: datos.moneda,
      prices_include_tax: datos.preciosIncluyenImpuesto,
      tax_rate: Number(datos.tasaImpuesto),
      submit: enviar,
      items: datos.lineas.map((linea) => ({
        line_type: linea.tipo,
        product_id: linea.tipo === 'part' ? linea.productoId : null,
        description: linea.descripcion.trim(),
        quantity: Number(linea.cantidad),
        unit_price: Number(linea.precioUnitario),
        taxable: linea.gravable,
      })),
    },
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'cotizacion'))
  return data as string
}

export async function revisarCotizacionReparacion(
  organizationId: string,
  reparacionId: string,
  cotizacionRechazadaId: string,
  datos: DatosCotizacion,
  enviar: boolean,
) {
  const { data, error } = await supabase.rpc('revise_repair_quote', {
    payload: {
      organization_id: organizationId,
      repair_id: reparacionId,
      rejected_quote_id: cotizacionRechazadaId,
      currency: datos.moneda,
      prices_include_tax: datos.preciosIncluyenImpuesto,
      tax_rate: Number(datos.tasaImpuesto),
      submit: enviar,
      items: datos.lineas.map((linea) => ({
        line_type: linea.tipo,
        product_id: linea.tipo === 'part' ? linea.productoId : null,
        description: linea.descripcion.trim(),
        quantity: Number(linea.cantidad),
        unit_price: Number(linea.precioUnitario),
        taxable: linea.gravable,
      })),
    },
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'cotizacion'))
  return data as string
}

export async function aprobarCotizacionReparacion(
  organizationId: string,
  reparacionId: string,
  cotizacionId: string,
  datos: DatosObservacionReparacion,
) {
  const { error } = await supabase.rpc('approve_repair_quote', {
    requested_organization_id: organizationId,
    requested_repair_id: reparacionId,
    requested_quote_id: cotizacionId,
    requested_observation: normalizarTextoOpcional(datos.observacion),
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'aprobacion'))
}

export async function rechazarCotizacionReparacion(
  organizationId: string,
  reparacionId: string,
  cotizacionId: string,
  datos: DatosObservacionReparacion,
) {
  const { error } = await supabase.rpc('reject_repair_quote', {
    requested_organization_id: organizationId,
    requested_repair_id: reparacionId,
    requested_quote_id: cotizacionId,
    requested_observation: normalizarTextoOpcional(datos.observacion),
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'aprobacion'))
}

export async function reservarParteReparacion(
  organizationId: string,
  reparacionId: string,
  datos: DatosReservaParte,
) {
  const { data, error } = await supabase.rpc('reserve_repair_part', {
    payload: {
      organization_id: organizationId,
      repair_id: reparacionId,
      product_id: datos.productoId,
      warehouse_id: datos.almacenId,
      location_id: datos.ubicacionId,
      stock_status: 'available',
      lot: normalizarTextoOpcional(datos.lote),
      expiration_date: normalizarTextoOpcional(datos.fechaVencimiento),
      quantity_requested: Number(datos.cantidadSolicitada),
      notes: normalizarTextoOpcional(datos.notas),
    },
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'repuesto'))
  return data as string
}

export async function consumirParteReparacion(
  organizationId: string,
  parteId: string,
  datos: DatosConsumoParte,
  operationKey: string,
) {
  const { data, error } = await supabase.rpc('consume_repair_part', {
    payload: {
      organization_id: organizationId,
      repair_part_id: parteId,
      quantity: Number(datos.cantidad),
      operation_key: operationKey,
    },
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'repuesto'))
  return data as string
}

export async function cancelarParteReparacion(
  organizationId: string,
  parteId: string,
  datos: DatosObservacionReparacion,
) {
  const { error } = await supabase.rpc('cancel_repair_part', {
    requested_organization_id: organizationId,
    requested_repair_part_id: parteId,
    requested_observation: normalizarTextoOpcional(datos.observacion),
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'repuesto'))
}

export async function registrarPruebaReparacion(
  organizationId: string,
  reparacionId: string,
  datos: DatosPrueba,
) {
  const { data, error } = await supabase.rpc('record_repair_test', {
    payload: {
      organization_id: organizationId,
      repair_id: reparacionId,
      performed_by: normalizarTextoOpcional(datos.realizadaPor),
      test_type: datos.tipo.trim(),
      result: datos.resultado.trim(),
      passed: datos.aprobada,
      notes: normalizarTextoOpcional(datos.notas),
    },
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'prueba'))
  return data as string
}

export async function entregarReparacion(
  organizationId: string,
  reparacionId: string,
  datos: DatosObservacionReparacion,
) {
  const { error } = await supabase.rpc('deliver_repair', {
    requested_organization_id: organizationId,
    requested_repair_id: reparacionId,
    requested_observation: normalizarTextoOpcional(datos.observacion),
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'entrega'))
}

export async function cancelarReparacion(
  organizationId: string,
  reparacionId: string,
  datos: DatosObservacionReparacion,
) {
  const { error } = await supabase.rpc('cancel_repair', {
    requested_organization_id: organizationId,
    requested_repair_id: reparacionId,
    requested_observation: normalizarTextoOpcional(datos.observacion),
  })
  if (error) throw new Error(obtenerMensajeErrorReparacion(error, 'cancelacion'))
}
