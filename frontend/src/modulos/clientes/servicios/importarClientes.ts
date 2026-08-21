import {
  analizarRegistrosClientes,
  type AnalisisImportacionClientes,
  type FilaClienteImportada,
  type ModoImportacionClientes,
  type ResultadoImportacionClientes,
} from '@/modulos/clientes/modelo/importacionClientes'
import { supabase } from '@/lib/supabase'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_ROWS = 500

export async function analizarArchivoClientes(file: File): Promise<AnalisisImportacionClientes> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    throw new Error('Selecciona un archivo .xlsx, .xls o .csv.')
  }
  if (file.size > MAX_FILE_SIZE) throw new Error('El archivo supera el límite de 5 MB.')

  const [{ read, utils }, buffer] = await Promise.all([import('xlsx'), file.arrayBuffer()])
  const workbook = read(buffer, { cellText: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) throw new Error('El archivo no contiene una hoja legible.')
  const records = utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    defval: '',
    blankrows: false,
  })
  if (!records.length) throw new Error('El archivo no contiene clientes.')
  if (records.length > MAX_ROWS) throw new Error(`El archivo supera el límite de ${MAX_ROWS} filas por lote.`)

  const analysis = analizarRegistrosClientes(records, file.name)
  const validRows = analysis.rows.filter((row) => row.status === 'VALID')
  if (!validRows.length) return analysis

  const documentNumbers = [...new Set(validRows.map((row) => row.documentNumber))]
  const { data, error } = await supabase
    .from('customers')
    .select('document_type,document_number')
    .in('document_number', documentNumbers)
  if (error) throw new Error('No se pudieron verificar los documentos existentes.')
  const existing = new Set(
    (data ?? []).map((row) => `${row.document_type}:${row.document_number}`),
  )
  analysis.rows = analysis.rows.map((row) => ({
    ...row,
    exists: existing.has(`${row.documentType}:${row.documentNumber}`),
  }))
  return analysis
}

export async function importarClientes(
  rows: readonly FilaClienteImportada[],
  mode: ModoImportacionClientes,
): Promise<ResultadoImportacionClientes> {
  const validRows = rows.filter((row) => row.status === 'VALID')
  if (!validRows.length) throw new Error('No hay filas válidas para importar.')
  const { data, error } = await supabase.rpc('import_customers', {
    payload: { mode, rows: validRows },
  })
  if (error) throw new Error(error.message)
  return data as unknown as ResultadoImportacionClientes
}

export async function descargarIncidenciasImportacion(
  rows: readonly FilaClienteImportada[],
  result?: ResultadoImportacionClientes,
) {
  const XLSX = await import('xlsx')
  const serverRows = new Map(result?.rows.map((row) => [row.rowNumber, row]))
  const incidents = rows
    .filter((row) => row.status === 'INVALID' || ['SKIPPED', 'FAILED'].includes(serverRows.get(row.rowNumber)?.status ?? ''))
    .map((row) => ({
      FILA: row.rowNumber,
      TIPO_DOCUMENTO: row.documentType,
      NUMERO_DOCUMENTO: row.documentNumber,
      RAZON_SOCIAL: row.legalName,
      INCIDENCIA: row.errors.join(' ') || serverRows.get(row.rowNumber)?.message || '',
    }))
  if (!incidents.length) throw new Error('No hay incidencias para descargar.')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(incidents), 'Incidencias')
  XLSX.writeFile(workbook, `incidencias-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
