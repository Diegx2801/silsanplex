import { supabase } from '@/lib/supabase'
import {
  esquemaReferenciaComprobanteSandbox,
  leerComprobanteSandbox,
} from '@/modulos/facturacion/modelo/comprobanteSandbox'
import { z } from 'zod'

const uuidFiscal = z.string().uuid().transform((valor) => valor.toLowerCase())
const versionFiscal = z.string().regex(/^(0|[1-9]\d{0,18})$/).refine(
  (valor) => BigInt(valor) <= 9223372036854775807n,
)
const versionPositiva = versionFiscal.refine((valor) => valor !== '0')
const fechaFiscal = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((valor) => {
  const fecha = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
})
const direccionFiscal = z.object({
  line: z.string().trim().min(2).max(240),
  district: z.string().trim().min(2).max(240),
  province: z.string().trim().min(2).max(240),
  department: z.string().trim().min(2).max(240),
  ubigeo: z.string().regex(/^\d{6}$/),
  country: z.literal('PE'),
}).strict()
const pagoFiscal = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('contado') }).strict(),
  z.object({
    kind: z.literal('credito'),
    outstanding: z.string().regex(/^(0|[1-9]\d{0,11})\.\d{2}$/),
    installments: z.array(z.object({
      id: z.string().regex(/^Cuota(?!000)\d{3}$/),
      amount: z.string().regex(/^(0|[1-9]\d{0,11})\.\d{2}$/),
      dueDate: fechaFiscal,
    }).strict()).min(1).max(999),
  }).strict(),
])

const solicitudSnapshot = z.object({
  schemaVersion: z.literal('CPE-PE-DOM-PEN-1'),
  organizationId: uuidFiscal,
  environment: z.literal('sandbox'),
  saleId: uuidFiscal,
  issuerProfileId: uuidFiscal,
  expectedIssuerVersion: versionPositiva,
  seriesId: uuidFiscal,
  expectedSeriesVersion: versionPositiva,
  issueDate: fechaFiscal,
  buyerFiscalAddressId: uuidFiscal.nullable().optional(),
  payment: pagoFiscal,
}).strict()

const resultadoConfiguracionFiscal = z.object({
  id: uuidFiscal,
  version: versionPositiva,
}).strict()
const serieConfigurada = z.object({
  id: uuidFiscal,
  issuerProfileId: uuidFiscal,
  version: versionPositiva,
  documentType: z.enum(['01', '03']),
  series: z.string().regex(/^[FB][A-Z0-9]{3}$/),
  nextNumber: versionPositiva,
  enabled: z.boolean(),
}).strict()
const perfilConfigurado = z.object({
  id: uuidFiscal,
  version: versionPositiva,
  ruc: z.string().regex(/^\d{11}$/),
  legalName: z.string().startsWith('SANDBOX '),
  fiscalAddress: direccionFiscal,
  establishmentCode: z.string().regex(/^\d{4}$/),
  series: z.array(serieConfigurada),
}).strict()
const resultadoConfiguracionEmision = z.object({
  organizationId: uuidFiscal,
  profiles: z.array(perfilConfigurado),
}).strict()
const resultadoDocumentoFiscal = z.object({
  documentId: uuidFiscal,
  state: z.enum(['prepared', 'frozen']),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  version: versionPositiva,
  fiscalIdentity: z.object({
    environment: z.literal('sandbox'),
    ruc: z.string().regex(/^\d{11}$/),
    documentType: z.enum(['01', '03']),
    series: z.string().regex(/^[FB][A-Z0-9]{3}$/),
    number: z.string().regex(/^[1-9]\d{0,7}$/),
  }).strict().nullable(),
}).strict().superRefine((resultado, contexto) => {
  const congelado = resultado.state === 'frozen'
  if ((congelado && resultado.fiscalIdentity === null) || (!congelado && resultado.fiscalIdentity !== null)) {
    contexto.addIssue({ code: 'custom', path: ['fiscalIdentity'], message: 'Estado fiscal y numeración inconsistentes' })
  }
})

const perfilEmisorSandbox = z.object({
  organizationId: uuidFiscal,
  environment: z.literal('sandbox'),
  operationKey: uuidFiscal,
  id: uuidFiscal,
  expectedVersion: versionFiscal,
  ruc: z.string().regex(/^\d{11}$/),
  legalName: z.string().trim().min(3).max(1500),
  fiscalAddress: direccionFiscal,
  establishmentCode: z.string().regex(/^\d{4}$/),
  ruleSetHash: z.string().regex(/^[a-f0-9]{64}$/),
  testOnly: z.literal(true),
}).strict()

const serieSandbox = z.object({
  organizationId: uuidFiscal,
  environment: z.literal('sandbox'),
  operationKey: uuidFiscal,
  id: uuidFiscal,
  expectedVersion: versionFiscal,
  issuerProfileId: uuidFiscal,
  documentType: z.enum(['01', '03']),
  series: z.string().regex(/^[FB][A-Z0-9]{3}$/),
  nextNumber: versionPositiva,
  enabled: z.boolean(),
}).strict().superRefine((value, context) => {
  const prefijoEsperado = value.documentType === '01' ? 'F' : 'B'
  if (!value.series.startsWith(prefijoEsperado)) {
    context.addIssue({ code: 'custom', path: ['series'], message: 'La serie no corresponde al tipo de documento' })
  }
})

const prepararSandbox = solicitudSnapshot.extend({ operationKey: uuidFiscal }).strict()
const revisarSandbox = z.object({
  organizationId: uuidFiscal,
  environment: z.literal('sandbox'),
  operationKey: uuidFiscal,
  documentId: uuidFiscal,
  expectedVersion: versionPositiva,
  request: solicitudSnapshot,
}).strict()
const confirmarSandbox = z.object({
  organizationId: uuidFiscal,
  environment: z.literal('sandbox'),
  operationKey: uuidFiscal,
  documentId: uuidFiscal,
  expectedVersion: versionPositiva,
}).strict()

export type SolicitudSnapshotSandbox = z.infer<typeof solicitudSnapshot>
export type SolicitudPrepararSandbox = z.infer<typeof prepararSandbox>
export type SolicitudRevisarSandbox = z.infer<typeof revisarSandbox>
export type SolicitudConfirmarSandbox = z.infer<typeof confirmarSandbox>
export type ConfiguracionEmisionSandbox = z.infer<typeof resultadoConfiguracionEmision>

export function crearClaveOperacionFiscal(): string {
  // Generar una vez por acción y reutilizarla ante reintentos del mismo comando.
  return crypto.randomUUID()
}

export class ErrorComandoFiscal extends Error {
  readonly codigo: 'PAYLOAD_INVALIDO' | 'SIN_ACCESO' | 'VERSION_DESACTUALIZADA'
    | 'CLAVE_IDEMPOTENCIA_REUTILIZADA' | 'SOLO_SANDBOX' | 'COMANDO_FALLIDO' | 'RESPUESTA_INVALIDA'
    | 'VENTA_NO_DISPONIBLE' | 'DIRECCION_FISCAL_REQUERIDA' | 'COMPROBANTE_EXISTE'

  constructor(codigo: ErrorComandoFiscal['codigo']) {
    const mensajes: Record<ErrorComandoFiscal['codigo'], string> = {
      PAYLOAD_INVALIDO: 'Los datos del comprobante sandbox no cumplen el contrato fiscal',
      SIN_ACCESO: 'No tienes permiso para realizar esta operación fiscal',
      VERSION_DESACTUALIZADA: 'La configuración o el comprobante cambió; vuelve a consultar y reintenta',
      CLAVE_IDEMPOTENCIA_REUTILIZADA: 'La clave de operación ya se utilizó con otros datos',
      SOLO_SANDBOX: 'Esta operación todavía está limitada al entorno sandbox',
      COMANDO_FALLIDO: 'No se pudo completar la operación fiscal sandbox',
      RESPUESTA_INVALIDA: 'La respuesta no corresponde al contrato fiscal sandbox esperado',
      VENTA_NO_DISPONIBLE: 'La venta no cumple las condiciones fiscales para preparar un comprobante; revisa su estado y los datos del cliente',
      DIRECCION_FISCAL_REQUERIDA: 'La factura requiere una dirección fiscal activa del cliente con ubigeo',
      COMPROBANTE_EXISTE: 'Esta venta ya tiene un comprobante sandbox y no puede duplicarse',
    }
    super(mensajes[codigo])
    this.codigo = codigo
    this.name = 'ErrorComandoFiscal'
  }
}

type ResultadoRpc = { data: unknown; error: { code?: string; message?: string } | null }
type EsquemaEntrada<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }
type EsquemaSalida<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }

async function ejecutarComandoFiscal<TEntrada, TSalida>(
  nombre: string,
  payload: unknown,
  entrada: EsquemaEntrada<TEntrada>,
  salida: EsquemaSalida<TSalida>,
  signal?: AbortSignal,
): Promise<TSalida> {
  const validado = entrada.safeParse(payload)
  if (!validado.success) throw new ErrorComandoFiscal('PAYLOAD_INVALIDO')

  let respuesta: ResultadoRpc
  try {
    const consulta = supabase.rpc(nombre, { payload: validado.data })
    respuesta = await (signal ? consulta.abortSignal(signal) : consulta)
  } catch {
    throw new ErrorComandoFiscal('COMANDO_FALLIDO')
  }
  if (respuesta.error) {
    if (respuesta.error.code === '42501') throw new ErrorComandoFiscal('SIN_ACCESO')
    if (respuesta.error.code === '40001') throw new ErrorComandoFiscal('VERSION_DESACTUALIZADA')
    if (respuesta.error.message === 'CPE_ORIGINAL_EXISTS' || respuesta.error.code === '23505') {
      throw new ErrorComandoFiscal('COMPROBANTE_EXISTE')
    }
    if (respuesta.error.message === 'CPE_BUYER_ADDRESS_REQUIRED') {
      throw new ErrorComandoFiscal('DIRECCION_FISCAL_REQUERIDA')
    }
    if (['CPE_SALE_UNSUPPORTED', 'CPE_BUYER_INVALID', 'CPE_SERIES_INVALID',
      'CPE_LINE_UNSUPPORTED', 'CPE_SALE_TOTALS_MISMATCH'].includes(respuesta.error.message ?? '')) {
      throw new ErrorComandoFiscal('VENTA_NO_DISPONIBLE')
    }
    if (respuesta.error.message === 'CPE_OPERATION_KEY_REUSED') throw new ErrorComandoFiscal('CLAVE_IDEMPOTENCIA_REUTILIZADA')
    if (respuesta.error.message === 'CPE_SANDBOX_ONLY') throw new ErrorComandoFiscal('SOLO_SANDBOX')
    throw new ErrorComandoFiscal('COMANDO_FALLIDO')
  }

  const resultado = salida.safeParse(respuesta.data)
  if (!resultado.success) throw new ErrorComandoFiscal('RESPUESTA_INVALIDA')
  return resultado.data
}

/** RPC autenticadas; la autorización y la organización efectiva las vuelve a validar PostgreSQL. */
export function guardarPerfilEmisorSandbox(payload: unknown, signal?: AbortSignal) {
  return ejecutarComandoFiscal('save_electronic_issuer_profile', payload, perfilEmisorSandbox, resultadoConfiguracionFiscal, signal)
}

export function configurarSerieSandbox(payload: unknown, signal?: AbortSignal) {
  return ejecutarComandoFiscal('configure_electronic_series', payload, serieSandbox, resultadoConfiguracionFiscal, signal)
}

export function prepararComprobanteSandbox(payload: unknown, signal?: AbortSignal) {
  return ejecutarComandoFiscal('prepare_electronic_document', payload, prepararSandbox, resultadoDocumentoFiscal, signal)
}

export function revisarComprobanteSandbox(payload: unknown, signal?: AbortSignal) {
  return ejecutarComandoFiscal('revise_electronic_document', payload, revisarSandbox, resultadoDocumentoFiscal, signal)
}

export function confirmarComprobanteSandbox(payload: unknown, signal?: AbortSignal) {
  return ejecutarComandoFiscal('confirm_electronic_document', payload, confirmarSandbox, resultadoDocumentoFiscal, signal)
}

export class ErrorConfiguracionFiscal extends Error {
  readonly codigo: 'SIN_ACCESO' | 'CONSULTA_FALLIDA' | 'RESPUESTA_INVALIDA'

  constructor(codigo: ErrorConfiguracionFiscal['codigo']) {
    const mensajes = {
      SIN_ACCESO: 'No tienes permiso vigente para consultar la configuración fiscal sandbox',
      CONSULTA_FALLIDA: 'No se pudo cargar la configuración fiscal sandbox; puedes reintentar',
      RESPUESTA_INVALIDA: 'La configuración recibida no corresponde al contrato fiscal sandbox esperado',
    }
    super(mensajes[codigo])
    this.codigo = codigo
    this.name = 'ErrorConfiguracionFiscal'
  }
}

/** Lee una proyección sandbox autorizada; las tablas fiscales siguen sin SELECT directo. */
export async function consultarConfiguracionEmisionSandbox(
  organizationId: string,
  signal?: AbortSignal,
): Promise<ConfiguracionEmisionSandbox> {
  const org = uuidFiscal.safeParse(organizationId)
  if (!org.success) throw new ErrorConfiguracionFiscal('RESPUESTA_INVALIDA')

  let respuesta: ResultadoRpc
  try {
    const consulta = supabase.rpc('get_electronic_billing_configuration', {
      requested_organization_id: org.data,
    })
    respuesta = await (signal ? consulta.abortSignal(signal) : consulta)
  } catch {
    throw new ErrorConfiguracionFiscal('CONSULTA_FALLIDA')
  }
  if (respuesta.error) {
    if (respuesta.error.code === '42501') throw new ErrorConfiguracionFiscal('SIN_ACCESO')
    throw new ErrorConfiguracionFiscal('CONSULTA_FALLIDA')
  }
  const resultado = resultadoConfiguracionEmision.safeParse(respuesta.data)
  if (!resultado.success || resultado.data.organizationId !== org.data) {
    throw new ErrorConfiguracionFiscal('RESPUESTA_INVALIDA')
  }
  return resultado.data
}

export class ErrorConsultaFiscal extends Error {
  readonly codigo: 'REFERENCIA_INVALIDA' | 'SIN_ACCESO' | 'NO_ENCONTRADO'
    | 'NO_DISPONIBLE' | 'CONSULTA_FALLIDA' | 'RESPUESTA_INVALIDA'

  constructor(codigo: 'REFERENCIA_INVALIDA' | 'SIN_ACCESO' | 'NO_ENCONTRADO'
    | 'NO_DISPONIBLE' | 'CONSULTA_FALLIDA' | 'RESPUESTA_INVALIDA') {
    const mensajes = {
      REFERENCIA_INVALIDA: 'Selecciona una organización y un comprobante válidos',
      SIN_ACCESO: 'No tienes acceso a la consulta fiscal de esta organización',
      NO_ENCONTRADO: 'El comprobante no existe o no está disponible para esta consulta',
      NO_DISPONIBLE: 'La persistencia fiscal sandbox no está disponible en este entorno',
      CONSULTA_FALLIDA: 'No se pudo consultar el comprobante sandbox; puedes reintentar',
      RESPUESTA_INVALIDA: 'La respuesta no corresponde al contrato fiscal sandbox esperado',
    }
    super(mensajes[codigo])
    this.codigo = codigo
    this.name = 'ErrorConsultaFiscal'
  }
}

export async function consultarComprobanteSandbox(organizationId: string, documentId: string, signal?: AbortSignal) {
  const referencia = esquemaReferenciaComprobanteSandbox.safeParse({ organizationId, documentId })
  if (!referencia.success) throw new ErrorConsultaFiscal('REFERENCIA_INVALIDA')
  const consulta = supabase.rpc('get_electronic_document', {
    organization_id: referencia.data.organizationId,
    document_id: referencia.data.documentId,
  })
  const respuesta = await (signal ? consulta.abortSignal(signal) : consulta).then(
    (resultado) => resultado,
    () => { throw new ErrorConsultaFiscal('CONSULTA_FALLIDA') },
  )
  const { data, error } = respuesta
  if (error) {
    if (error.code === '42501') throw new ErrorConsultaFiscal('SIN_ACCESO')
    if (error.message === 'CPE_DOCUMENT_NOT_FOUND') throw new ErrorConsultaFiscal('NO_ENCONTRADO')
    if (['42883', 'PGRST202'].includes(error.code)) throw new ErrorConsultaFiscal('NO_DISPONIBLE')
    throw new ErrorConsultaFiscal('CONSULTA_FALLIDA')
  }
  try {
    return leerComprobanteSandbox(data, referencia.data.organizationId, referencia.data.documentId)
  } catch {
    throw new ErrorConsultaFiscal('RESPUESTA_INVALIDA')
  }
}
