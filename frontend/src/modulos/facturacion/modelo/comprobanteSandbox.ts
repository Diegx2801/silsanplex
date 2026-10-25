import { z } from 'zod'

export const AMBIENTE_FISCAL_SANDBOX = 'sandbox' as const
export const AVISO_FISCAL_SANDBOX = 'Prueba local, sin envío y sin validez tributaria'

const uuid = z.string().uuid().transform((valor) => valor.toLowerCase())
const version = z.string().regex(/^[1-9]\d{0,18}$/).refine(
  (valor) => /^[1-9]\d{0,18}$/.test(valor) && BigInt(valor) <= 9223372036854775807n,
)
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((valor) => {
  const instante = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === valor
})
const decimal = (enteros: number, decimales: number) => z.string().regex(
  new RegExp(`^(0|[1-9]\\d{0,${enteros - 1}})\\.\\d{${decimales}}$`),
)
const importe = decimal(12, 2)
const tipoDocumento = z.enum(['01', '03'])
const serie = z.string().regex(/^[FB][A-Z0-9]{3}$/)
const numero = z.string().regex(/^[1-9]\d{0,7}$/)
const pago = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('contado') }).strict(),
  z.object({
    kind: z.literal('credito'),
    outstanding: importe,
    paidAtIssue: importe,
    installments: z.array(z.object({
      id: z.string().regex(/^Cuota(?!000)\d{3}$/),
      amount: importe,
      dueDate: fecha,
    }).strict()).min(1).max(999),
  }).strict(),
])

const esquemaSnapshot = z.object({
  schemaVersion: z.literal('CPE-PE-DOM-PEN-1'),
  ruleSetHash: z.string().regex(/^[a-f0-9]{64}$/),
  modality: z.literal('local_test'),
  organizationId: uuid,
  environment: z.literal(AMBIENTE_FISCAL_SANDBOX),
  saleId: uuid,
  orderId: uuid,
  saleDate: fecha,
  issuer: z.object({
    id: uuid,
    version,
    ruc: z.string().regex(/^\d{11}$/),
    legalName: z.string().startsWith('SANDBOX '),
    address: z.object({
      line: z.string(), district: z.string(), province: z.string(),
      department: z.string(), ubigeo: z.string().regex(/^\d{6}$/), country: z.literal('PE'),
    }).strict(),
    establishmentCode: z.string().regex(/^\d{4}$/),
  }).strict(),
  buyer: z.object({
    customerId: uuid,
    type: z.enum(['6', '1', '4']),
    number: z.string(),
    name: z.string(),
    address: z.object({
      id: uuid, line: z.string(), ubigeo: z.string().regex(/^\d{6}$/), country: z.literal('PE'),
    }).strict().nullable(),
  }).strict(),
  currency: z.literal('PEN'),
  operationType: z.literal('0101'),
  issueDate: fecha,
  documentType: tipoDocumento,
  series: serie,
  pricesIncludeTax: z.boolean(),
  items: z.array(z.object({
    saleItemId: uuid,
    productId: uuid,
    code: z.string(),
    description: z.string(),
    unit: z.enum(['NIU', 'ZZ', 'KGM', 'LTR', 'MTR']),
    quantity: decimal(11, 3),
    commercialPrice: decimal(12, 4),
    unitNet: decimal(12, 10),
    unitGross: decimal(12, 10),
    affectation: z.enum(['10', '20', '30']),
    taxCode: z.enum(['1000', '9997', '9998']),
    rate: decimal(3, 5),
    base: importe, tax: importe, total: importe,
  }).strict()).min(1),
  payment: pago,
  totals: z.object({
    taxableBase: importe, exemptAmount: importe, unaffectedAmount: importe,
    subtotal: importe, tax: importe, total: importe,
  }).strict(),
  number: numero.optional(),
  confirmedBy: uuid.optional(),
  confirmedAt: z.string().datetime({ offset: true }).optional(),
  issueTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/).optional(),
  taxValidity: z.literal('NONE_SANDBOX').optional(),
}).strict()

export const esquemaReferenciaComprobanteSandbox = z.object({
  organizationId: uuid,
  documentId: uuid,
})

const esquemaComprobante = z.object({
  documentId: uuid,
  state: z.enum(['prepared', 'frozen']),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  version,
  fiscalIdentity: z.object({
    environment: z.literal(AMBIENTE_FISCAL_SANDBOX),
    ruc: z.string().regex(/^\d{11}$/),
    documentType: tipoDocumento,
    series: serie,
    number: numero,
  }).strict().nullable(),
  snapshot: esquemaSnapshot,
}).strict().superRefine((documento, contexto) => {
  const { snapshot, fiscalIdentity: identidad } = documento
  const tipoSerieValido = snapshot.series.startsWith(snapshot.documentType === '01' ? 'F' : 'B')
  const congelado = documento.state === 'frozen'
  const confirmacionCompleta = snapshot.number !== undefined && snapshot.confirmedBy !== undefined
    && snapshot.confirmedAt !== undefined && snapshot.issueTime !== undefined
    && snapshot.taxValidity === 'NONE_SANDBOX'
  const borradorLimpio = snapshot.number === undefined && snapshot.confirmedBy === undefined
    && snapshot.confirmedAt === undefined && snapshot.issueTime === undefined && snapshot.taxValidity === undefined
  if (!tipoSerieValido || (congelado ? !confirmacionCompleta || !identidad : !borradorLimpio || identidad !== null)) {
    contexto.addIssue({ code: 'custom', message: 'Estado fiscal sandbox incoherente' })
  }
  if (identidad && (identidad.ruc !== snapshot.issuer.ruc || identidad.documentType !== snapshot.documentType
    || identidad.series !== snapshot.series || identidad.number !== snapshot.number)) {
    contexto.addIssue({ code: 'custom', message: 'Identidad fiscal distinta del snapshot' })
  }
})

export type ComprobanteSandbox = z.infer<typeof esquemaComprobante>

// El backend sigue siendo autoritativo para cálculos, autorización y hash.
export function leerComprobanteSandbox(data: unknown, organizationId: string, documentId: string): ComprobanteSandbox {
  const referencia = esquemaReferenciaComprobanteSandbox.parse({ organizationId, documentId })
  const documento = esquemaComprobante.parse(data)
  if (documento.documentId !== referencia.documentId || documento.snapshot.organizationId !== referencia.organizationId) {
    throw new Error('El comprobante no corresponde a la consulta fiscal')
  }
  return documento
}
