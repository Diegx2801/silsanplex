import { z } from 'zod'

export type ModoImportacionProveedores = 'SKIP' | 'UPDATE'
export interface FilaProveedorImportada {
  rowNumber: number; documentType: 'RUC' | 'DNI' | 'CE' | 'OTHER'; documentNumber: string
  code: string; legalName: string; tradeName: string; contactName: string; email: string
  phone: string; fiscalAddress: string; ubigeoCode: string; taxpayerStatus: string
  domicileCondition: string; isActive: boolean; status: 'VALID' | 'INVALID'
  errors: string[]; warnings: string[]; exists: boolean
}
export interface AnalisisImportacionProveedores { fileName: string; rows: FilaProveedorImportada[]; validCount: number; invalidCount: number; warningCount: number }
export interface ResultadoFilaImportacionProveedor { rowNumber: number; documentNumber: string; status: 'CREATED' | 'UPDATED' | 'SKIPPED' | 'FAILED'; message: string }
export interface ResultadoImportacionProveedores { created: number; updated: number; skipped: number; failed: number; rows: ResultadoFilaImportacionProveedor[] }

const emailSchema = z.string().email()
const emptyMarkers = new Set(['-', '.', '10'])
const normalizeHeader = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase()
function value(record: Record<string, unknown>, aliases: readonly string[]) { const normalized = new Map(Object.entries(record).map(([key, item]) => [normalizeHeader(key), item])); for (const alias of aliases) { const item = normalized.get(alias); if (item !== undefined && item !== null) return String(item).trim() } return '' }
function optionalValue(record: Record<string, unknown>, aliases: readonly string[]) { const result = value(record, aliases); return emptyMarkers.has(result) ? '' : result }
function documentType(raw: string, document: string) { const type = normalizeHeader(raw); if (type.includes('RUC') || type.includes('REGISTRO_UNICO')) return 'RUC' as const; if (type.includes('DNI') || type.includes('DOCUMENTO_NACIONAL')) return 'DNI' as const; if (type.includes('EXTRANJERIA') || type === 'CE') return 'CE' as const; if (/^\d{11}$/.test(document)) return 'RUC' as const; if (/^\d{8}$/.test(document)) return 'DNI' as const; return 'OTHER' as const }
function active(raw: string) { return !['NO', 'N', '0', 'FALSE', 'INACTIVO'].includes(normalizeHeader(raw)) }

export function analizarRegistrosProveedores(records: readonly Record<string, unknown>[], fileName = 'proveedores.xlsx'): AnalisisImportacionProveedores {
  const seen = new Set<string>()
  const rows = records.map((record, index): FilaProveedorImportada => {
    let documentNumber = value(record, ['RUC_DNI', 'NUMERO_DOCUMENTO', 'DOCUMENTO', 'RUC', 'DNI']).replace(/\.0$/, '').replace(/\s+/g, '')
    const type = documentType(value(record, ['TIPO_DOCUMENTO_IDENTIDAD', 'TIPO_DOCUMENTO', 'TIPO_DOCUM', 'TIPO_DOC']), documentNumber)
    if (type === 'DNI' && /^\d{1,7}$/.test(documentNumber)) documentNumber = documentNumber.padStart(8, '0')
    const legalName = value(record, ['RAZON_SOCIAL', 'RAZ_SOCIAL', 'PROVEEDOR', 'NOMBRE_RAZON_SOCIAL'])
    const code = optionalValue(record, ['CODIGO', 'CODIGO_INTERNO'])
    const tradeName = optionalValue(record, ['NOMBRE_COMERCIAL', 'NOMBRE_COM'])
    const contactName = optionalValue(record, ['CONTACTO', 'PERSONA_CONTACTO'])
    const email = optionalValue(record, ['EMAIL', 'CORREO'])
    const phone = optionalValue(record, ['TELEFONO', 'CELULAR'])
    const fiscalAddress = optionalValue(record, ['DIRECCION', 'DIRECCION_FISCAL', 'DOMICILIO_FISCAL'])
    const ubigeoCode = optionalValue(record, ['UBIGEO', 'UBIGEO_FISCAL'])
    const taxpayerStatus = optionalValue(record, ['ESTADO_SUNAT', 'ESTADO_CONTRIBUYENTE'])
    const domicileCondition = optionalValue(record, ['CONDICION_DOMICILIO', 'CONDICION'])
    const errors: string[] = []; const warnings: string[] = []; const key = `${type}:${documentNumber}`
    if (!documentNumber) errors.push('Falta el documento.')
    if (type === 'RUC' && !/^\d{11}$/.test(documentNumber)) errors.push('El RUC debe tener 11 dígitos.')
    if (type === 'DNI' && !/^\d{8}$/.test(documentNumber)) errors.push('El DNI debe tener 8 dígitos.')
    if (documentNumber.length > 30) errors.push('El documento supera 30 caracteres.')
    if (legalName.length < 2 || legalName.length > 160) errors.push('La razón social es obligatoria y admite hasta 160 caracteres.')
    if (code && !/^[A-Z0-9][A-Z0-9._-]{1,29}$/i.test(code)) errors.push('El código interno no tiene un formato válido.')
    if (tradeName && (tradeName.length < 2 || tradeName.length > 160)) errors.push('El nombre comercial debe tener entre 2 y 160 caracteres.')
    if (contactName && (contactName.length < 2 || contactName.length > 120)) errors.push('El contacto debe tener entre 2 y 120 caracteres.')
    if (email && (!emailSchema.safeParse(email).success || email.length > 254)) errors.push('El correo no es válido.')
    if (phone && (phone.length < 6 || phone.length > 30)) errors.push('El teléfono debe tener entre 6 y 30 caracteres.')
    if (fiscalAddress && (fiscalAddress.length < 3 || fiscalAddress.length > 250)) errors.push('La dirección fiscal debe tener entre 3 y 250 caracteres.')
    if (ubigeoCode && !/^\d{6}$/.test(ubigeoCode)) errors.push('El ubigeo debe tener 6 dígitos.')
    if (seen.has(key)) errors.push('Documento repetido dentro del archivo.'); if (documentNumber) seen.add(key)
    if (!fiscalAddress) warnings.push('Se importará sin dirección fiscal.')
    return { rowNumber: index + 2, documentType: type, documentNumber, code: code.toUpperCase(), legalName, tradeName, contactName, email, phone, fiscalAddress, ubigeoCode, taxpayerStatus, domicileCondition, isActive: active(value(record, ['ACTIVO', 'ESTADO'])), status: errors.length ? 'INVALID' : 'VALID', errors, warnings, exists: false }
  })
  return { fileName, rows, validCount: rows.filter((row) => row.status === 'VALID').length, invalidCount: rows.filter((row) => row.status === 'INVALID').length, warningCount: rows.filter((row) => row.status === 'VALID' && row.warnings.length > 0).length }
}
