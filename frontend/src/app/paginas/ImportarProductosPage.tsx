import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  FileSpreadsheet,
  Info,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { type ChangeEvent, type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import type {
  NivelHallazgo,
  ResultadoImportacion,
} from '@/modulos/productos/modelo/analisisImportacion'

const formatoEntero = new Intl.NumberFormat('es-PE')

function pluralizar(unidad: string, cantidad: number) {
  if (cantidad === 1) return unidad
  if (unidad.endsWith('ción')) return `${unidad.slice(0, -4)}ciones`
  return `${unidad}s`
}

interface SelectorArchivoProps {
  id: string
  titulo: string
  descripcion: string
  archivo: File | null
  alCambiar: (archivo: File | null) => void
}

function SelectorArchivo({
  id,
  titulo,
  descripcion,
  archivo,
  alCambiar,
}: SelectorArchivoProps) {
  const seleccionar = (evento: ChangeEvent<HTMLInputElement>) => {
    alCambiar(evento.target.files?.[0] ?? null)
  }

  return (
    <div className="border-b px-5 py-5 last:border-b-0 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            {archivo ? (
              <FileCheck2 aria-hidden="true" className="size-4" />
            ) : (
              <FileSpreadsheet aria-hidden="true" className="size-4" />
            )}
          </span>
          <div className="min-w-0">
            <label htmlFor={id} className="font-semibold">
              {titulo}
            </label>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {descripcion}
            </p>
            {archivo ? (
              <p className="mt-2 truncate font-mono text-xs text-primary">
                {archivo.name}
              </p>
            ) : null}
          </div>
        </div>
        <label
          htmlFor={id}
          className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted focus-within:ring-3 focus-within:ring-ring/50"
        >
          <Upload aria-hidden="true" className="size-4" />
          {archivo ? 'Cambiar archivo' : 'Elegir archivo'}
          <input
            id={id}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={seleccionar}
          />
        </label>
      </div>
    </div>
  )
}

const configuracionNivel: Record<
  NivelHallazgo,
  { etiqueta: string; tono: 'pendiente' | 'revision'; icono: typeof Info }
> = {
  bloqueo: {
    etiqueta: 'Requiere corrección',
    tono: 'pendiente',
    icono: AlertTriangle,
  },
  advertencia: {
    etiqueta: 'Revisar',
    tono: 'pendiente',
    icono: AlertTriangle,
  },
  informativo: {
    etiqueta: 'Informativo',
    tono: 'revision',
    icono: Info,
  },
}

function ResultadoAnalisis({ resultado }: { resultado: ResultadoImportacion }) {
  const metricas = [
    ['Filas de productos', resultado.resumen.productos],
    ['Códigos únicos', resultado.resumen.codigosProducto],
    ['Filas de precios', resultado.resumen.precios],
    ['Códigos relacionados', resultado.resumen.coincidencias],
  ] as const

  return (
    <section aria-labelledby="resultado-importacion-title" className="space-y-6">
      <div
        className="border px-5 py-5 sm:px-6"
        data-estado={resultado.tieneBloqueos ? 'bloqueado' : 'listo'}
      >
        <div className="flex items-start gap-3">
          {resultado.tieneBloqueos ? (
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-[#79520d]"
            />
          ) : (
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-primary"
            />
          )}
          <div>
            <h2 id="resultado-importacion-title" className="font-semibold">
              {resultado.tieneBloqueos
                ? 'La información necesita correcciones'
                : 'La estructura puede continuar a revisión'}
            </h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
              {resultado.tieneBloqueos
                ? 'Hay códigos ambiguos o relaciones faltantes que impedirían una importación segura.'
                : 'No encontramos conflictos de identidad entre los dos archivos. Las advertencias siguen necesitando confirmación.'}
            </p>
          </div>
        </div>
      </div>

      <div className="ledger-sheet">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {metricas.map(([etiqueta, valor]) => (
            <div
              key={etiqueta}
              className="border-b px-5 py-5 last:border-b-0 sm:border-e sm:[&:nth-child(2)]:border-e-0 xl:border-b-0 xl:[&:nth-child(2)]:border-e xl:last:border-e-0"
            >
              <p className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">
                {etiqueta}
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                {formatoEntero.format(valor)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="ledger-sheet">
        <div className="border-b px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">Hallazgos para revisar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {resultado.hallazgos.length} grupos encontrados en los archivos
          </p>
        </div>
        {resultado.hallazgos.length ? (
          <div className="divide-y">
            {resultado.hallazgos.map((hallazgo) => {
              const configuracion = configuracionNivel[hallazgo.nivel]
              const Icono = configuracion.icono

              return (
                <article
                  key={hallazgo.id}
                  className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Icono
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{hallazgo.titulo}</h3>
                        <span
                          className="status-label"
                          data-tone={configuracion.tono}
                        >
                          {configuracion.etiqueta}
                        </span>
                      </div>
                      <p className="mt-2 max-w-[72ch] text-sm leading-6 text-muted-foreground">
                        {hallazgo.detalle}
                      </p>
                      {hallazgo.ejemplos.length ? (
                        <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
                          Ejemplos: {hallazgo.ejemplos.join(' · ')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <p className="font-mono text-sm font-semibold tabular-nums lg:text-end">
                    {formatoEntero.format(hallazgo.cantidad)}{' '}
                    <span className="font-sans text-xs font-normal text-muted-foreground">
                      {pluralizar(hallazgo.unidad, hallazgo.cantidad)}
                    </span>
                  </p>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="flex items-start gap-3 px-5 py-8 sm:px-6">
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-5 text-primary"
            />
            <p className="text-sm leading-6">
              No se encontraron observaciones con las reglas actuales.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

export function ImportarProductosPage() {
  const [archivoProductos, setArchivoProductos] = useState<File | null>(null)
  const [archivoPrecios, setArchivoPrecios] = useState<File | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [error, setError] = useState('')
  const [analizando, setAnalizando] = useState(false)
  const [versionSelectores, setVersionSelectores] = useState(0)
  const [mensajeEstado, setMensajeEstado] = useState('')

  const cambiarProductos = (archivo: File | null) => {
    setArchivoProductos(archivo)
    setResultado(null)
    setError('')
  }

  const cambiarPrecios = (archivo: File | null) => {
    setArchivoPrecios(archivo)
    setResultado(null)
    setError('')
  }

  const analizar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!archivoProductos || !archivoPrecios) return

    setAnalizando(true)
    setError('')

    try {
      const { analizarArchivosProductos } = await import(
        '@/modulos/productos/servicios/lectorArchivosProductos'
      )
      const nuevoResultado = await analizarArchivosProductos(
        archivoProductos,
        archivoPrecios,
      )
      setResultado(nuevoResultado)
      setMensajeEstado(
        nuevoResultado.tieneBloqueos
          ? `Análisis completado con ${nuevoResultado.hallazgos.length} grupos de hallazgos y correcciones requeridas.`
          : `Análisis completado con ${nuevoResultado.hallazgos.length} grupos de hallazgos.`,
      )
    } catch (causa) {
      setResultado(null)
      setError(
        causa instanceof Error
          ? causa.message
          : 'No pudimos analizar los archivos seleccionados.',
      )
      setMensajeEstado('No se pudo completar el análisis de los archivos.')
    } finally {
      setAnalizando(false)
    }
  }

  const reiniciar = () => {
    setArchivoProductos(null)
    setArchivoPrecios(null)
    setResultado(null)
    setError('')
    setMensajeEstado('Selección de archivos limpiada.')
    setVersionSelectores((version) => version + 1)
  }

  return (
    <div className="space-y-8">
      <header className="border-b pb-7">
        <Button asChild variant="ghost" className="-ms-2 mb-4">
          <Link to="/productos">
            <ArrowLeft aria-hidden="true" />
            Volver a Productos
          </Link>
        </Button>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Revisar archivos de productos
            </h1>
            <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
              Comprueba la exportación actual antes de diseñar la importación
              definitiva. El análisis ocurre en este navegador y no guarda datos.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            SOLO VISTA PREVIA
          </span>
        </div>
      </header>

      <form onSubmit={analizar} className="space-y-5">
        <section aria-labelledby="archivos-importacion-title" className="ledger-sheet">
          <div className="border-b px-5 py-4 sm:px-6">
            <h2 id="archivos-importacion-title" className="text-lg font-semibold">
              Selecciona los dos archivos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deben ser archivos .xlsx de hasta 5 MB, exportados con una hoja llamada “data”.
            </p>
          </div>
          <SelectorArchivo
            key={`productos-${versionSelectores}`}
            id="archivo-productos"
            titulo="Catálogo de productos"
            descripcion="Archivo con Código, Producto, Línea, SubLínea y Marca o laboratorio."
            archivo={archivoProductos}
            alCambiar={cambiarProductos}
          />
          <SelectorArchivo
            key={`precios-${versionSelectores}`}
            id="archivo-precios"
            titulo="Precios de los productos"
            descripcion="Archivo con CódigoProducto, Medida, Precio_venta e indicador de IGV."
            archivo={archivoPrecios}
            alCambiar={cambiarPrecios}
          />
          <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="max-w-[62ch] text-xs leading-5 text-muted-foreground">
              Los archivos no se suben a un servidor ni modifican el catálogo de esta sesión.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {archivoProductos || archivoPrecios ? (
                <Button type="button" variant="outline" onClick={reiniciar}>
                  <RotateCcw aria-hidden="true" />
                  Limpiar
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={!archivoProductos || !archivoPrecios || analizando}
              >
                {analizando ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )}
                {analizando ? 'Analizando…' : 'Analizar archivos'}
              </Button>
            </div>
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 border border-destructive/35 bg-destructive/5 px-5 py-4 text-sm sm:px-6"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-destructive"
            />
            <div>
              <p className="font-medium">No se pudo completar el análisis</p>
              <p className="mt-1 leading-6 text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : null}
      </form>

      <p role="status" aria-live="polite" className="sr-only">
        {mensajeEstado}
      </p>

      {resultado ? <ResultadoAnalisis resultado={resultado} /> : null}
    </div>
  )
}
