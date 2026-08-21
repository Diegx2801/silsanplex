import { z } from 'zod'

export type ModoImportacionClientes = 'SKIP' | 'UPDATE'
export type EstadoFilaImportacion = 'VALID' | 'INVALID'

export interface FilaClienteImportada {
  rowNumber: number
  documentType: 'RUC' | 'DNI' | 'CE' | 'OTHER'
  documentNumber: string
  legalName: string
  tradeName: string
  contactName: string
  email: string
  phone: string
  fiscalAddress: string
  ubigeoCode: string
  taxpayerStatus: string
  domicileCondition: string
  isActive: boolean
  status: EstadoFilaImportacion
  errors: string[]
  exists: boolean
}

export interface AnalisisImportacionClientes {
  fileName: string
  rows: FilaClienteImportada[]
  validCount: number
  invalidCount: number
}

export interface ResultadoFilaImportacionCliente {
  rowNumber: number
  documentNumber: string
  status: 'CREATED' | 'UPDATED' | 'SKIPPED' | 'FAILED'
  message: string
}

export interface ResultadoImportacionClientes {
  created: number
  updated: number
  skipped: number
  failed: number
  rows: ResultadoFilaImportacionCliente[]
}

const esquemaEmail = z.string().email()

export function normalizarEncabezadoCliente(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

function valor(row: Record<string, unknown>, aliases: readonly string[]) {
  const normalized = new Map(
    Object.entries(row).map(([key, item]) => [normalizarEncabezadoCliente(key), item]),
  )
  for (const alias of aliases) {
    const item = normalized.get(alias)
    if (item !== undefined && item !== null) return String(item).trim()
  }
  return ''
}

function inferirTipoDocumento(typeValue: string, documentNumber: string) {
  const normalized = normalizarEncabezadoCliente(typeValue)
  if (normalized.includes('RUC') || normalized.includes('REGISTRO_UNICO')) return 'RUC' as const
  if (normalized.includes('DNI') || normalized.includes('DOCUMENTO_NACIONAL')) return 'DNI' as const
  if (normalized.includes('EXTRANJERIA') || normalized === 'CE') return 'CE' as const
  if (/^\d{11}$/.test(documentNumber)) return 'RUC' as const
  if (/^\d{8}$/.test(documentNumber)) return 'DNI' as const
  return 'OTHER' as const
}

function interpretarActivo(value: string) {
  if (!value) return true
  return !['NO', 'N', '0', 'FALSE', 'INACTIVO'].includes(normalizarEncabezadoCliente(value))
}

export function analizarRegistrosClientes(
  records: readonly Record<string, unknown>[],
  fileName = 'clientes.xlsx',
): AnalisisImportacionClientes {
  const seen = new Set<string>()
  const rows = records.map((record, index): FilaClienteImportada => {
    let documentNumber = valor(record, ['RUC_DNI', 'NUMERO_DOCUMENTO', 'DOCUMENTO', 'RUC', 'DNI'])
      .replace(/\.0$/, '')
      .replace(/\s+/g, '')
    const documentType = inferirTipoDocumento(
      valor(record, ['TIPO_DOCUMENTO', 'TIPO_DOCUM', 'TIPO_DOC']),
      documentNumber,
    )
    if (documentType === 'DNI' && /^\d{1,7}$/.test(documentNumber)) {
      documentNumber = documentNumber.padStart(8, '0')
    }
    const legalName = valor(record, ['RAZON_SOCIAL', 'RAZ_SOCIAL', 'CLIENTE', 'NOMBRE_RAZON_SOCIAL'])
    const tradeName = valor(record, ['NOMBRE_COMERCIAL', 'NOMBRE_COM', 'NOMBRE_CORTO'])
    const contactName = valor(record, ['CONTACTO', 'RESPONSABLE', 'PERSONA_CONTACTO'])
    const email = valor(record, ['EMAIL', 'CORREO'])
    const phone = valor(record, ['TELEFONO', 'CELULAR'])
    const fiscalAddress = valor(record, ['DIRECCION', 'DIRECCION_FISCAL', 'DOMICILIO_FISCAL'])
    const ubigeoCode = valor(record, ['UBIGEO', 'UBIGEO_FISCAL', 'CODIGO_UBIGEO'])
    const taxpayerStatus = valor(record, ['ESTADO_SUNAT', 'EST_SUNAT', 'ESTADO_CONTRIBUYENTE'])
    const domicileCondition = valor(record, ['CONDICION_DOMICILIO', 'CONDICION'])
    const errors: string[] = []
    const key = `${documentType}:${documentNumber}`

    if (!documentNumber) errors.push('Falta el documento.')
    if (documentType === 'RUC' && !/^\d{11}$/.test(documentNumber)) errors.push('El RUC debe tener 11 dígitos.')
    if (documentType === 'DNI' && !/^\d{8}$/.test(documentNumber)) errors.push('El DNI debe tener 8 dígitos.')
    if (documentNumber.length > 20) errors.push('El documento supera 20 caracteres.')
    if (legalName.length < 2 || legalName.length > 160) errors.push('La razón social es obligatoria y admite hasta 160 caracteres.')
    if (email && !esquemaEmail.safeParse(email).success) errors.push('El correo no es válido.')
    if (tradeName.length > 120) errors.push('El nombre comercial supera 120 caracteres.')
    if (contactName.length > 120) errors.push('El contacto supera 120 caracteres.')
    if (email.length > 254) errors.push('El correo supera 254 caracteres.')
    if (phone.length > 30) errors.push('El teléfono supera 30 caracteres.')
    if (fiscalAddress && (fiscalAddress.length < 3 || fiscalAddress.length > 240)) errors.push('La dirección fiscal debe tener entre 3 y 240 caracteres.')
    if (ubigeoCode && !/^\d{6}$/.test(ubigeoCode)) errors.push('El ubigeo debe tener 6 dígitos.')
    if (taxpayerStatus.length > 40 || domicileCondition.length > 40) errors.push('Los datos SUNAT superan 40 caracteres.')
    if (seen.has(key)) errors.push('Documento repetido dentro del archivo.')
    if (documentNumber) seen.add(key)

    return {
      rowNumber: index + 2,
      documentType,
      documentNumber,
      legalName,
      tradeName,
      contactName,
      email,
      phone,
      fiscalAddress,
      ubigeoCode,
      taxpayerStatus,
      domicileCondition,
      isActive: interpretarActivo(valor(record, ['ACTIVO', 'ESTADO'])),
      status: errors.length ? 'INVALID' : 'VALID',
      errors,
      exists: false,
    }
  })

  return {
    fileName,
    rows,
    validCount: rows.filter((row) => row.status === 'VALID').length,
    invalidCount: rows.filter((row) => row.status === 'INVALID').length,
  }
}
