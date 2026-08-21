import { Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type {
  AnalisisImportacionClientes,
  ModoImportacionClientes,
  ResultadoImportacionClientes,
} from '@/modulos/clientes/modelo/importacionClientes'
import {
  analizarArchivoClientes,
  descargarIncidenciasImportacion,
  importarClientes,
} from '@/modulos/clientes/servicios/importarClientes'

interface Props {
  abierto: boolean
  alCambiarApertura: (open: boolean) => void
  alCompletar: (result: ResultadoImportacionClientes) => void
  alRestaurarFoco: () => void
}

export function DialogoImportarClientes({
  abierto,
  alCambiarApertura,
  alCompletar,
  alRestaurarFoco,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [analysis, setAnalysis] = useState<AnalisisImportacionClientes | null>(null)
  const [result, setResult] = useState<ResultadoImportacionClientes | null>(null)
  const [mode, setMode] = useState<ModoImportacionClientes>('SKIP')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectFile = async (file?: File) => {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      setAnalysis(await analizarArchivoClientes(file))
    } catch (cause) {
      setAnalysis(null)
      setError(cause instanceof Error ? cause.message : 'No se pudo analizar el archivo.')
    } finally {
      setLoading(false)
    }
  }

  const executeImport = async () => {
    if (!analysis) return
    setLoading(true)
    setError('')
    try {
      const importResult = await importarClientes(analysis.rows, mode)
      setResult(importResult)
      alCompletar(importResult)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo importar el archivo.')
    } finally {
      setLoading(false)
    }
  }

  const existingCount = analysis?.rows.filter((row) => row.status === 'VALID' && row.exists).length ?? 0
  const hasIncidents = Boolean(
    analysis && (analysis.invalidCount > 0 || analysis.warningCount > 0 || result?.skipped || result?.failed),
  )

  return <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
      <DialogPrimitive.Content
        className="fixed start-1/2 top-1/2 z-50 max-h-[92svh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none"
        onCloseAutoFocus={(event) => { event.preventDefault(); alRestaurarFoco() }}
      >
        <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
          <div>
            <DialogPrimitive.Title className="text-xl font-semibold">Importar clientes</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
              Revisa el archivo antes de incorporarlo al directorio de la organización.
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <button type="button" aria-label="Cerrar importación" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X className="size-5" /></button>
          </DialogPrimitive.Close>
        </header>

        <div className="space-y-5 px-5 py-6 sm:px-7">
          <section className="grid gap-4 border p-4 lg:grid-cols-[1fr_16rem] lg:items-end">
            <div>
              <h3 className="font-semibold">Archivo de origen</h3>
              <p className="mt-1 text-sm text-muted-foreground">Admite la exportación de Codeplex en XLSX y archivos XLS o CSV, hasta 500 filas y 5 MB.</p>
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => void selectFile(event.target.files?.[0])}
              />
              <Button type="button" className="mt-3" variant="outline" disabled={loading} onClick={() => inputRef.current?.click()}>
                <Upload /> {analysis ? 'Cambiar archivo' : 'Seleccionar archivo'}
              </Button>
              {analysis ? <p className="mt-2 text-sm"><FileSpreadsheet className="me-1 inline size-4" />{analysis.fileName}</p> : null}
            </div>
            <label>
              <span className="field-label">Si el documento ya existe</span>
              <select className="field-control" value={mode} onChange={(event) => setMode(event.target.value as ModoImportacionClientes)} disabled={loading || Boolean(result)}>
                <option value="SKIP">Omitir la fila</option>
                <option value="UPDATE">Actualizar datos disponibles</option>
              </select>
            </label>
          </section>

          {loading && !analysis ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Analizando archivo…</p> : null}
          {error ? <p role="alert" className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}
          {analysis ? <>
            <div className="grid gap-3 sm:grid-cols-5">
              <Resumen label="Filas" value={analysis.rows.length} />
              <Resumen label="Válidas" value={analysis.validCount} />
              <Resumen label="Advertencias" value={analysis.warningCount} />
              <Resumen label="Con errores" value={analysis.invalidCount} />
              <Resumen label="Ya existentes" value={existingCount} />
            </div>
            <div className="max-h-80 overflow-auto border">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="sticky top-0 border-b bg-muted"><tr><th className="px-4 py-3">Fila</th><th className="px-4 py-3">Documento</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Decisión</th></tr></thead>
                <tbody className="divide-y">{analysis.rows.map((row) => <tr key={row.rowNumber}>
                  <td className="px-4 py-3">{row.rowNumber}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.documentType} {row.documentNumber || 'Sin registrar'}</td>
                  <td className="px-4 py-3">{row.legalName || 'Sin razón social'}</td>
                  <td className="px-4 py-3">{row.status === 'INVALID'
                    ? <span className="text-destructive">{row.errors.join(' ')}</span>
                    : <div>
                      <span>{row.exists ? (mode === 'UPDATE' ? 'Actualizar existente' : 'Omitir existente') : 'Crear cliente'}</span>
                      {row.warnings.length > 0 ? <span className="mt-1 block text-amber-700">{row.warnings.join(' ')}</span> : null}
                    </div>}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </> : null}

          {result ? <p role="status" className="border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            Importación finalizada: {result.created} creados, {result.updated} actualizados, {result.skipped} omitidos y {result.failed} fallidos.
          </p> : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          {hasIncidents && analysis ? <Button type="button" variant="outline" onClick={() => void descargarIncidenciasImportacion(analysis.rows, result ?? undefined)}><Download /> Descargar incidencias</Button> : null}
          <DialogPrimitive.Close asChild><Button type="button" variant="outline">{result ? 'Cerrar' : 'Cancelar'}</Button></DialogPrimitive.Close>
          {!result ? <Button type="button" disabled={loading || !analysis?.validCount} onClick={() => void executeImport()}>{loading ? 'Importando…' : `Importar ${analysis?.validCount ?? 0} filas`}</Button> : null}
        </footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}

function Resumen({ label, value }: { label: string; value: number }) {
  return <div className="border px-4 py-3"><span className="block text-xs text-muted-foreground uppercase">{label}</span><strong className="mt-1 block text-xl">{value}</strong></div>
}
