import { supabase } from '@/lib/supabase'
import {
  analizarRegistrosProveedores,
  type AnalisisImportacionProveedores,
  type FilaProveedorImportada,
  type ModoImportacionProveedores,
  type ResultadoImportacionProveedores,
} from '@/modulos/proveedores/modelo/importacionProveedores'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_ROWS = 500

export async function analizarArchivoProveedores(file: File): Promise<AnalisisImportacionProveedores> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Selecciona un archivo .xlsx, .xls o .csv.')
  if (file.size > MAX_FILE_SIZE) throw new Error('El archivo supera el límite de 5 MB.')
  const [{ read, utils }, buffer] = await Promise.all([import('xlsx'), file.arrayBuffer()])
  const workbook = read(buffer, { cellText: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) throw new Error('El archivo no contiene una hoja legible.')
  const records = utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: '', blankrows: false })
  if (!records.length) throw new Error('El archivo no contiene proveedores.')
  if (records.length > MAX_ROWS) throw new Error(`El archivo supera el límite de ${MAX_ROWS} filas por lote.`)

  const analysis = analizarRegistrosProveedores(records, file.name)
  const validRows = analysis.rows.filter((row) => row.status === 'VALID')
  if (!validRows.length) return analysis
  const numbers = [...new Set(validRows.map((row) => row.documentNumber))]
  const { data, error } = await supabase.from('suppliers').select('document_type,document_number').in('document_number', numbers)
  if (error) throw new Error('No se pudieron verificar los documentos existentes.')
  const existing = new Set((data ?? []).map((row) => `${String(row.document_type).toUpperCase()}:${row.document_number}`))
  analysis.rows = analysis.rows.map((row) => ({ ...row, exists: existing.has(`${row.documentType}:${row.documentNumber}`) }))
  return analysis
}

export async function importarProveedores(rows: readonly FilaProveedorImportada[], mode: ModoImportacionProveedores): Promise<ResultadoImportacionProveedores> {
  const validRows = rows.filter((row) => row.status === 'VALID')
  if (!validRows.length) throw new Error('No hay filas válidas para importar.')
  const { data, error } = await supabase.rpc('import_suppliers', { payload: { mode, rows: validRows } })
  if (error) {
    if (error.code === '42501') throw new Error('No tienes permiso para importar proveedores.')
    throw new Error('No se pudo completar la importación de proveedores.')
  }
  return data as unknown as ResultadoImportacionProveedores
}

export async function descargarIncidenciasProveedores(rows: readonly FilaProveedorImportada[], result?: ResultadoImportacionProveedores) {
  const XLSX = await import('xlsx')
  const serverRows = new Map(result?.rows.map((row) => [row.rowNumber, row]))
  const incidents = rows.filter((row) => row.status === 'INVALID' || row.warnings.length || ['SKIPPED', 'FAILED'].includes(serverRows.get(row.rowNumber)?.status ?? '')).map((row) => ({
    FILA: row.rowNumber, TIPO_DOCUMENTO: row.documentType, NUMERO_DOCUMENTO: row.documentNumber,
    RAZON_SOCIAL: row.legalName,
    INCIDENCIA: row.errors.join(' ') || row.warnings.join(' ') || serverRows.get(row.rowNumber)?.message || '',
  }))
  if (!incidents.length) throw new Error('No hay incidencias para descargar.')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(incidents), 'Incidencias')
  XLSX.writeFile(workbook, `incidencias-proveedores-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
