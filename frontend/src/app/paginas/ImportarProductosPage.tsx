import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Info,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import type {
  FilaImportacionObservada,
  FilaImportacionRechazada,
  EstadoFilaImportacion,
  NivelHallazgo,
  ModoImportacionProductos,
  ResultadoImportacion,
  ResultadoImportacionPersistida,
} from '@/modulos/productos/modelo/analisisImportacion'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { consultarCodigosProductosExistentes, importarProductos } from '@/modulos/productos/servicios/productosService'

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

const configuracionFila: Record<
  FilaImportacionObservada['estado'],
  { etiqueta: string; tono: 'pendiente' | 'revision' }
> = {
  rechazada: { etiqueta: 'Rechazada', tono: 'pendiente' },
  duplicada: { etiqueta: 'Duplicada', tono: 'revision' },
  advertencia: { etiqueta: 'Advertencia', tono: 'revision' },
}

const filasPorPagina = 25

function FilasObservadas({ filas }: { filas: FilaImportacionObservada[] }) {
  const [filtro, setFiltro] = useState<'todas' | EstadoFilaImportacion>('todas')
  const [pagina, setPagina] = useState(1)
  if (!filas.length) return null

  const filtradas = filtro === 'todas' ? filas : filas.filter((fila) => fila.estado === filtro)
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / filasPorPagina))
  const paginaActual = Math.min(pagina, totalPaginas)
  const visibles = filtradas.slice((paginaActual - 1) * filasPorPagina, paginaActual * filasPorPagina)

  return (
    <section aria-labelledby="filas-importacion-title" className="ledger-sheet">
      <div className="flex flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
        <h2 id="filas-importacion-title" className="text-lg font-semibold">
          Filas que requieren atención
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtradas.length} de {filas.length} filas observadas; las rechazadas se excluirán de la importación.
        </p>
        </div>
        <div><label htmlFor="filtro-filas-importacion" className="field-label">Mostrar</label><select id="filtro-filas-importacion" className="field-control min-w-44" value={filtro} onChange={(evento) => { setFiltro(evento.target.value as 'todas' | EstadoFilaImportacion); setPagina(1) }}><option value="todas">Todas</option><option value="rechazada">Rechazadas</option><option value="advertencia">Advertencias</option><option value="duplicada">Duplicadas</option></select></div>
      </div>
      <div className="divide-y">
        {visibles.map((fila, indice) => {
          const configuracion = configuracionFila[fila.estado]

          return (
            <article
              key={`${fila.tipo}-${fila.fila}-${fila.codigo}-${indice}`}
              className="grid gap-3 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:px-6"
            >
              <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
                <span>{fila.tipo === 'producto' ? 'Producto' : 'Precio'}</span>
                <span>fila {fila.fila}</span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-medium text-primary">
                    {fila.codigo || 'Sin código'}
                  </span>
                  <span className="status-label" data-tone={configuracion.tono}>
                    {configuracion.etiqueta}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{fila.motivo}</p>
              </div>
            </article>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:px-6"><span>Página {paginaActual} de {totalPaginas}</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={paginaActual <= 1} onClick={() => setPagina((valor) => Math.max(1, valor - 1))}>Anterior</Button><Button type="button" variant="outline" size="sm" disabled={paginaActual >= totalPaginas} onClick={() => setPagina((valor) => Math.min(totalPaginas, valor + 1))}>Siguiente</Button></div></div>
    </section>
  )
}

function traducirMotivoRechazo(motivo: string) {
  return {
    PRODUCT_DUPLICATE_CONFLICT:
      'El código aparece con datos de producto distintos.',
    PRICE_DUPLICATE_CONFLICT:
      'El código tiene varias filas de precio distintas.',
    PRICE_PRODUCT_NOT_FOUND:
      'El código de precio no corresponde a un producto del archivo.',
    PRODUCT_EXISTING_CONFLICT:
      'El código ya existe con datos diferentes en el catálogo.',
  }[motivo] ?? 'La fila no cumple las reglas de importación.'
}

function convertirRechazos(
  filas: FilaImportacionRechazada[],
): FilaImportacionObservada[] {
  return filas.flatMap((fila) => {
    const numeros = fila.filas ?? (fila.fila === undefined ? [] : [fila.fila])

    return numeros.map((numero) => ({
      tipo: fila.tipo,
      fila: numero,
      codigo: fila.codigo ?? '',
      estado: 'rechazada' as const,
      motivo: traducirMotivoRechazo(fila.motivo),
    }))
  })
}

function ResultadoPersistencia({
  resultado,
}: {
  resultado: ResultadoImportacionPersistida
}) {
  const filas = convertirRechazos(resultado.filasRechazadas)
  const rechazado = resultado.estado === 'rechazado'

  return (
    <section aria-labelledby="resultado-persistencia-title" className="space-y-5">
      <div
        className="border px-5 py-5 sm:px-6"
        data-estado={rechazado ? 'bloqueado' : 'listo'}
      >
        <h2 id="resultado-persistencia-title" className="font-semibold">
          {rechazado
            ? 'La importación no modificó el catálogo'
            : resultado.estado === 'parcial' ? 'Importación completada con incidencias' : 'Importación completada'}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {rechazado
            ? 'Ningún SKU pudo procesarse de forma segura.'
            : 'Los SKU aceptados quedaron guardados; los fallidos permanecen disponibles para corregir.'}
        </p>
      </div>
      <div className="ledger-sheet">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <div className="border-b px-5 py-5 sm:border-e sm:px-6">
            <p className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">
              Productos creados
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
              {formatoEntero.format(resultado.creados)}
            </p>
          </div>
          <div className="border-b px-5 py-5 sm:px-6 xl:border-e">
            <p className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">Actualizados</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{formatoEntero.format(resultado.actualizados)}</p>
          </div>
          <div className="border-b px-5 py-5 sm:border-e sm:px-6 xl:border-b-0">
            <p className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">Omitidos</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{formatoEntero.format(resultado.omitidos)}</p>
          </div>
          <div className="px-5 py-5 sm:px-6">
            <p className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">
              Fallidos
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
              {formatoEntero.format(resultado.fallidos)}
            </p>
          </div>
        </div>
      </div>
      <FilasObservadas filas={filas} />
    </section>
  )
}

function ResultadoAnalisis({ resultado, compacto = false }: { resultado: ResultadoImportacion; compacto?: boolean }) {
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

      <details className="ledger-sheet" open={!compacto}>
        <summary className="cursor-pointer px-5 py-4 font-semibold sm:px-6">Ver detalles técnicos ({resultado.hallazgos.length} grupos)</summary>
      <div className="border-t">
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
      <FilasObservadas filas={resultado.filasObservadas} />
      </details>
    </section>
  )
}

function VistaPreviaSku({ resultado, existentes, modo }: { resultado: ResultadoImportacion; existentes: ReadonlySet<string>; modo: ModoImportacionProductos }) {
  const [pagina, setPagina] = useState(1)
  const totalPaginas = Math.max(1, Math.ceil(resultado.datos.productos.length / filasPorPagina))
  const paginaActual = Math.min(pagina, totalPaginas)
  const visibles = resultado.datos.productos.slice((paginaActual - 1) * filasPorPagina, paginaActual * filasPorPagina)
  return <section className="ledger-sheet" aria-labelledby="vista-previa-sku-title"><div className="border-b px-5 py-4 sm:px-6"><h2 id="vista-previa-sku-title" className="text-lg font-semibold">Vista previa de decisiones</h2><p className="mt-1 text-sm text-muted-foreground">{resultado.datos.productos.length - existentes.size} nuevos · {existentes.size} existentes · {resultado.filasObservadas.filter((fila) => fila.estado === 'rechazada').length} filas excluidas</p></div><div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="border-b bg-muted/50"><tr><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Producto</th><th className="px-5 py-3">Unidades/precios</th><th className="px-5 py-3">Decisión</th></tr></thead><tbody className="divide-y">{visibles.map((producto) => { const existe = existentes.has(producto.codigo); const precios = resultado.datos.precios.filter((precio) => precio.codigoProducto === producto.codigo).length; return <tr key={producto.codigo}><td className="px-5 py-3 font-mono text-xs">{producto.codigo}</td><td className="px-5 py-3">{producto.descripcion}</td><td className="px-5 py-3">{precios}</td><td className="px-5 py-3">{existe ? (modo === 'UPDATE' ? 'Actualizar existente' : 'Omitir existente') : 'Crear producto'}</td></tr> })}</tbody></table></div><div className="flex items-center justify-between border-t px-5 py-4 text-sm sm:px-6"><span>Página {paginaActual} de {totalPaginas}</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={paginaActual <= 1} onClick={() => setPagina((valor) => valor - 1)}>Anterior</Button><Button type="button" variant="outline" size="sm" disabled={paginaActual >= totalPaginas} onClick={() => setPagina((valor) => valor + 1)}>Siguiente</Button></div></div></section>
}

interface ImportarProductosPageProps { integrado?: boolean; alCompletar?: () => void; alCerrar?: () => void }

export function ImportarProductosPage({ integrado = false, alCompletar, alCerrar }: ImportarProductosPageProps = {}) {
  const { access, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const puedeImportar = hasPermission(PERMISSIONS.PRODUCTS_MANAGE)
  const [archivoProductos, setArchivoProductos] = useState<File | null>(null)
  const [archivoPrecios, setArchivoPrecios] = useState<File | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [resultadoPersistencia, setResultadoPersistencia] =
    useState<ResultadoImportacionPersistida | null>(null)
  const [error, setError] = useState('')
  const [analizando, setAnalizando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [versionSelectores, setVersionSelectores] = useState(0)
  const [mensajeEstado, setMensajeEstado] = useState('')
  const [modo, setModo] = useState<ModoImportacionProductos>('SKIP')
  const [codigosExistentes, setCodigosExistentes] = useState<Set<string>>(new Set())

  const cambiarProductos = (archivo: File | null) => {
    setArchivoProductos(archivo)
    setResultado(null)
    setResultadoPersistencia(null)
    setError('')
  }

  const cambiarPrecios = (archivo: File | null) => {
    setArchivoPrecios(archivo)
    setResultado(null)
    setResultadoPersistencia(null)
    setError('')
  }

  const analizar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!archivoProductos || !archivoPrecios) return

    setAnalizando(true)
    setError('')
    setResultadoPersistencia(null)

    try {
      const { analizarArchivosProductos } = await import(
        '@/modulos/productos/servicios/lectorArchivosProductos'
      )
      const nuevoResultado = await analizarArchivosProductos(
        archivoProductos,
        archivoPrecios,
      )
      setResultado(nuevoResultado)
      setCodigosExistentes(access?.organizationId
        ? await consultarCodigosProductosExistentes(access.organizationId, nuevoResultado.codigosImportables)
        : new Set())
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

  const importar = async () => {
    if (
      !resultado ||
      !puedeImportar ||
      !access?.organizationId ||
      importando
    ) {
      return
    }

    setImportando(true)
    setError('')
    setResultadoPersistencia(null)

    try {
      const nuevoResultado = await importarProductos(
        access.organizationId,
        resultado.datos,
        modo,
      )
      await queryClient.invalidateQueries({
        queryKey: ['products', access.organizationId],
      })
      setResultadoPersistencia(nuevoResultado)
      alCompletar?.()
      setMensajeEstado(
        nuevoResultado.estado === 'completado'
          ? `Importación completada: ${nuevoResultado.creados} creados y ${nuevoResultado.actualizados} actualizados.`
          : nuevoResultado.estado === 'parcial' ? 'Importación parcial completada con incidencias.' : 'La importación fue rechazada.',
      )
    } catch (causa) {
      setResultadoPersistencia(null)
      setError(
        causa instanceof Error
          ? causa.message
          : 'No pudimos importar el catálogo.',
      )
      setMensajeEstado('No se pudo completar la importación.')
    } finally {
      setImportando(false)
    }
  }

  const reiniciar = () => {
    setArchivoProductos(null)
    setArchivoPrecios(null)
    setResultado(null)
    setResultadoPersistencia(null)
    setError('')
    setMensajeEstado('Selección de archivos limpiada.')
    setCodigosExistentes(new Set())
    setVersionSelectores((version) => version + 1)
  }

  const descargarIncidencias = () => {
    const incidenciasServidor = resultadoPersistencia?.filasRechazadas.flatMap((fila) =>
      (fila.filas ?? (fila.fila === undefined ? [] : [fila.fila])).map((numero) => ({
        tipo: fila.tipo,
        fila: numero,
        codigo: fila.codigo ?? '',
        motivo: traducirMotivoRechazo(fila.motivo),
      })),
    ) ?? []
    const incidencias = incidenciasServidor.length ? incidenciasServidor : (resultado?.filasObservadas ?? [])
    const escapar = (valor: unknown) => `"${String(valor ?? '').replaceAll('"', '""')}"`
    const contenido = ['tipo,fila,codigo,estado,motivo', ...incidencias.map((fila) => [fila.tipo, fila.fila, fila.codigo, 'estado' in fila ? fila.estado : 'rechazada', fila.motivo].map(escapar).join(','))].join('\r\n')
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(new Blob(['\uFEFF', contenido], { type: 'text/csv;charset=utf-8' }))
    enlace.download = 'incidencias-importacion-productos.csv'
    enlace.click()
    URL.revokeObjectURL(enlace.href)
  }

  if (integrado) {
    const errores = resultado?.filasObservadas.filter((fila) => fila.estado === 'rechazada').length ?? 0
    const advertencias = resultado?.filasObservadas.filter((fila) => fila.estado !== 'rechazada').length ?? 0
    const hayIncidencias = errores + advertencias > 0 || Boolean(resultadoPersistencia?.fallidos)
    return <div className="space-y-4">
      <form onSubmit={analizar}>
        <section className="border">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="lg:border-e"><div className="border-b px-4 py-3"><h2 className="font-semibold">Archivos de origen</h2><p className="mt-1 text-sm text-muted-foreground">Selecciona las exportaciones de productos y precios de Codeplex.</p></div><SelectorArchivo key={`productos-${versionSelectores}`} id="archivo-productos" titulo="Catálogo de productos" descripcion="Código, producto, línea, sublínea y marca." archivo={archivoProductos} alCambiar={cambiarProductos} /><SelectorArchivo key={`precios-${versionSelectores}`} id="archivo-precios" titulo="Precios de los productos" descripcion="Código del producto, medida, precio e IGV." archivo={archivoPrecios} alCambiar={cambiarPrecios} /></div>
            <div className="flex flex-col justify-between gap-4 p-4"><label><span className="field-label">Si el SKU ya existe</span><select className="field-control" value={modo} onChange={(evento) => setModo(evento.target.value as ModoImportacionProductos)} disabled={importando || Boolean(resultadoPersistencia)}><option value="SKIP">Omitir el producto</option><option value="UPDATE">Actualizar datos disponibles</option></select></label><div className="flex flex-col gap-2">{archivoProductos || archivoPrecios ? <Button type="button" variant="outline" onClick={reiniciar} disabled={analizando || importando}><RotateCcw aria-hidden="true" />Limpiar</Button> : null}<Button type="submit" disabled={!archivoProductos || !archivoPrecios || analizando || Boolean(resultadoPersistencia)}>{analizando ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ShieldCheck aria-hidden="true" />}{analizando ? 'Analizando…' : 'Analizar archivos'}</Button></div></div>
          </div>
        </section>
        {error ? <div role="alert" className="mt-4 border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm text-destructive"><p className="font-medium">No se pudo completar la operación</p><p className="mt-1 text-muted-foreground">{error}</p></div> : null}
      </form>
      {resultado ? <><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[
        ['Filas', resultado.resumen.productos],
        ['Importables', resultado.datos.productos.length],
        ['Advertencias', advertencias],
        ['Con errores', errores],
        ['Ya existentes', codigosExistentes.size],
      ].map(([etiqueta, valor]) => <div key={etiqueta} className="border px-4 py-3"><span className="block text-xs uppercase text-muted-foreground">{etiqueta}</span><strong className="mt-1 block text-xl">{valor}</strong></div>)}</div><VistaPreviaSku resultado={resultado} existentes={codigosExistentes} modo={modo} /><details className="border"><summary className="cursor-pointer px-4 py-3 font-medium">Ver detalles técnicos ({resultado.hallazgos.length})</summary><div className="divide-y border-t">{resultado.hallazgos.map((hallazgo) => <div key={hallazgo.id} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="font-medium">{hallazgo.titulo}</span><span className="text-sm tabular-nums text-muted-foreground">{hallazgo.cantidad}</span></div><p className="mt-1 text-sm text-muted-foreground">{hallazgo.detalle}</p></div>)}</div><FilasObservadas filas={resultado.filasObservadas} /></details></> : null}
      {resultadoPersistencia ? <div role="status" className="border border-primary/30 bg-primary/5 px-4 py-3 text-sm">Importación finalizada: {resultadoPersistencia.creados} creados, {resultadoPersistencia.actualizados} actualizados, {resultadoPersistencia.omitidos} omitidos y {resultadoPersistencia.fallidos} fallidos.</div> : null}
      <footer className="sticky bottom-0 -mx-5 flex flex-col-reverse gap-2 border-t bg-background px-5 py-4 sm:-mx-7 sm:flex-row sm:justify-end sm:px-7">{hayIncidencias ? <Button type="button" variant="outline" onClick={descargarIncidencias}><Download aria-hidden="true" />Descargar incidencias</Button> : null}<Button type="button" variant="outline" onClick={alCerrar}>{resultadoPersistencia ? 'Cerrar' : 'Cancelar'}</Button>{!resultadoPersistencia && puedeImportar ? <Button type="button" disabled={importando || !resultado || resultado.tieneBloqueos} onClick={() => void importar()}>{importando ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ShieldCheck aria-hidden="true" />}{importando ? 'Importando…' : `Importar ${resultado?.datos.productos.length ?? 0} productos`}</Button> : null}</footer>
      <p role="status" aria-live="polite" className="sr-only">{mensajeEstado}</p>
    </div>
  }

  return (
    <div className={integrado ? 'space-y-5' : 'space-y-8'}>
      {!integrado ? <header className="border-b pb-7">
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
              Analiza los archivos localmente. Cada SKU válido se procesa de forma
              independiente y la base de datos vuelve a validarlo antes de guardar.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {puedeImportar ? 'PREVISUALIZACIÓN + IMPORTACIÓN' : 'SOLO VISTA PREVIA'}
          </span>
        </div>
      </header> : null}

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
            descripcion="Archivo con Código, Producto, Línea, SubLínea y Marca. Admite ficha técnica, dimensiones y controles como columnas opcionales."
            archivo={archivoProductos}
            alCambiar={cambiarProductos}
          />
          <SelectorArchivo
            key={`precios-${versionSelectores}`}
            id="archivo-precios"
            titulo="Precios de los productos"
            descripcion="Archivo con CódigoProducto, Medida, Precio_venta e IGV. Admite CostoBase y PrecioMinimo como columnas opcionales."
            archivo={archivoPrecios}
            alCambiar={cambiarPrecios}
          />
          <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="max-w-[62ch] text-xs leading-5 text-muted-foreground">
              El análisis ocurre en este navegador. Las filas rechazadas se excluyen;
              cada producto aceptado se guarda junto con sus unidades y precios.
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

      {resultado ? (
        <>
          <ResultadoAnalisis resultado={resultado} compacto={integrado} />
          <VistaPreviaSku resultado={resultado} existentes={codigosExistentes} modo={modo} />
          <section className="ledger-sheet">
              <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[1fr_18rem_auto] lg:items-end">
                <div>
                  <h2 className="font-semibold">Confirmar importación</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {resultado.tieneBloqueos
                      ? 'No quedó ningún SKU válido. Corrige las filas rechazadas antes de continuar.'
                      : puedeImportar
                      ? `${resultado.datos.productos.length} SKU válidos serán procesados; los rechazados no afectan al resto.`
                      : 'Tu rol puede revisar los archivos, pero no administrar el catálogo.'}
                  </p>
                </div>
                <label><span className="field-label">Si el SKU ya existe</span><select className="field-control" value={modo} onChange={(evento) => setModo(evento.target.value as ModoImportacionProductos)} disabled={importando}><option value="SKIP">Omitir producto</option><option value="UPDATE">Actualizar datos disponibles</option></select></label>
                {puedeImportar ? (
                  <Button
                    type="button"
                    disabled={importando || resultado.tieneBloqueos}
                    onClick={() => void importar()}
                  >
                    {importando ? (
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                    ) : (
                      <ShieldCheck aria-hidden="true" />
                    )}
                    {importando ? 'Importando…' : resultado.tieneBloqueos ? 'Importación bloqueada' : 'Importar catálogo'}
                  </Button>
                ) : null}
              </div>
            </section>
          {resultadoPersistencia ? (
            <><ResultadoPersistencia resultado={resultadoPersistencia} />{resultadoPersistencia.filasRechazadas.length ? <Button type="button" variant="outline" onClick={() => {
              const encabezado = 'tipo,fila,codigo,motivo'
              const escapar = (valor: unknown) => `"${String(valor ?? '').replaceAll('"', '""')}"`
              const contenido = [encabezado, ...resultadoPersistencia.filasRechazadas.map((fila) => [fila.tipo, fila.fila ?? fila.filas?.join('|') ?? '', fila.codigo ?? '', traducirMotivoRechazo(fila.motivo)].map(escapar).join(','))].join('\r\n')
              const enlace = document.createElement('a')
              enlace.href = URL.createObjectURL(new Blob(['\uFEFF', contenido], { type: 'text/csv;charset=utf-8' }))
              enlace.download = 'incidencias-importacion-productos.csv'
              enlace.click()
              URL.revokeObjectURL(enlace.href)
            }}><Download aria-hidden="true" />Descargar incidencias</Button> : null}</>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
