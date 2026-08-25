import {
  ArrowLeft,
  ArrowRight,
  Barcode,
  Boxes,
  Building2,
  CirclePower,
  ExternalLink,
  FileClock,
  FileText,
  History,
  ImageIcon,
  GitCompareArrows,
  LoaderCircle,
  Paperclip,
  Pencil,
  ReceiptText,
  RotateCcw,
  Ruler,
  Scale,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  Upload,
  Save,
  X,
} from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useMemo,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import { useProductoDetalle } from '@/modulos/productos/estado/useProductoDetalle'
import {
  afectacionesIgv,
  type ArchivoProducto,
  type Producto,
  type TipoArchivoProducto,
  type VersionProducto,
} from '@/modulos/productos/modelo/producto'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})
const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const formatoBytes = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 })

interface DatoProductoProps {
  etiqueta: string
  valor: ReactNode
}

function DatoProducto({ etiqueta, valor }: DatoProductoProps) {
  return (
    <div className="border-t py-4 first:border-t-0">
      <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
        {etiqueta}
      </dt>
      <dd className="mt-1.5 text-sm leading-6">{valor}</dd>
    </div>
  )
}

function mostrarValor(valor: string) {
  return valor || 'Sin definir'
}

function mostrarPrecio(precio: string) {
  return precio ? formatoMoneda.format(Number(precio)) : 'Sin definir'
}

function mostrarAfectacionIgv(valor: Producto['afectacionIgv']) {
  return (
    afectacionesIgv.find((opcion) => opcion.valor === valor)?.etiqueta ??
    'Sin definir'
  )
}

function mostrarMedida(valor: string, unidad: string) {
  return valor ? `${valor} ${unidad}` : 'Sin definir'
}

function mostrarBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${formatoBytes.format(bytes / (1024 * 1024))} MB`
    : `${formatoBytes.format(bytes / 1024)} KB`
}

function etiquetaTipoArchivo(tipo: TipoArchivoProducto) {
  return {
    image: 'Imagen',
    'technical-sheet': 'Ficha técnica',
    attachment: 'Adjunto',
  }[tipo]
}

interface ListaArchivosProps {
  archivos: ArchivoProducto[]
  puedeGestionar: boolean
  retirando: boolean
  guardando: boolean
  alRetirar: (archivo: ArchivoProducto) => Promise<void>
  alGuardarDescripcion: (archivoId: string, descripcion: string) => Promise<void>
}

function ArchivoAdjunto({
  archivo,
  puedeGestionar,
  retirando,
  guardando,
  alRetirar,
  alGuardarDescripcion,
}: {
  archivo: ArchivoProducto
  puedeGestionar: boolean
  retirando: boolean
  guardando: boolean
  alRetirar: (archivo: ArchivoProducto) => Promise<void>
  alGuardarDescripcion: (archivoId: string, descripcion: string) => Promise<void>
}) {
  const [descripcion, setDescripcion] = useState(archivo.descripcion)
  const modificada = descripcion.trim() !== archivo.descripcion

  return (
    <article className="grid gap-3 border bg-background p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
      <span className="grid size-10 shrink-0 place-items-center bg-muted text-primary">
        {archivo.tipo === 'image' ? (
          <ImageIcon aria-hidden="true" className="size-4" />
        ) : archivo.tipo === 'technical-sheet' ? (
          <FileText aria-hidden="true" className="size-4" />
        ) : (
          <Paperclip aria-hidden="true" className="size-4" />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{archivo.nombre}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {etiquetaTipoArchivo(archivo.tipo)} · {mostrarBytes(archivo.bytes)}
          {archivo.principal ? ' · Imagen principal' : ''}
        </p>
        {puedeGestionar ? (
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor={`descripcion-${archivo.id}`}>
              Descripción de {archivo.nombre}
            </label>
            <input
              id={`descripcion-${archivo.id}`}
              value={descripcion}
              maxLength={240}
              placeholder="Descripción o referencia del archivo"
              className="field-control min-w-0 flex-1"
              onChange={(evento) => setDescripcion(evento.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!modificada || guardando}
              aria-label={`Guardar descripción de ${archivo.nombre}`}
              onClick={() => void alGuardarDescripcion(archivo.id, descripcion)}
            >
              <Save aria-hidden="true" />
            </Button>
          </div>
        ) : archivo.descripcion ? (
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            {archivo.descripcion}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-1">
        <Button asChild type="button" variant="ghost" size="icon">
          <a
            href={archivo.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir ${archivo.nombre}`}
          >
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
        {puedeGestionar ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={retirando}
            aria-label={`Retirar ${archivo.nombre}`}
            onClick={() => void alRetirar(archivo)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </article>
  )
}

function ListaArchivos({
  archivos,
  puedeGestionar,
  retirando,
  guardando,
  alRetirar,
  alGuardarDescripcion,
}: ListaArchivosProps) {
  if (!archivos.length) {
    return (
      <p className="border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        Todavía no hay imágenes, ficha técnica ni adjuntos.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {archivos.map((archivo) => (
        <ArchivoAdjunto
          key={archivo.id}
          archivo={archivo}
          puedeGestionar={puedeGestionar}
          retirando={retirando}
          guardando={guardando}
          alRetirar={alRetirar}
          alGuardarDescripcion={alGuardarDescripcion}
        />
      ))}
    </div>
  )
}

const camposComparables = [
  ['codigo', 'Código'],
  ['descripcion', 'Descripción'],
  ['descripcionAmpliada', 'Descripción ampliada'],
  ['codigoBarras', 'Código de barras'],
  ['categoria', 'Línea'],
  ['sublinea', 'Sublínea'],
  ['laboratorio', 'Marca'],
  ['presentacion', 'Presentación'],
  ['unidadMedida', 'Unidad de medida'],
  ['afectacionIgv', 'Afectación de IGV'],
  ['costo', 'Costo'],
  ['precioVenta', 'Precio de venta'],
  ['precioMinimo', 'Precio mínimo'],
  ['stockMaximo', 'Stock máximo'],
  ['anchoCm', 'Ancho'],
  ['altoCm', 'Alto'],
  ['largoCm', 'Largo'],
  ['pesoKg', 'Peso'],
  ['registroSanitario', 'Registro sanitario'],
  ['controlLote', 'Control por lote'],
  ['controlVencimiento', 'Control de vencimiento'],
  ['ventaReceta', 'Venta con receta'],
  ['activo', 'Estado'],
] as const satisfies readonly (readonly [keyof Producto, string])[]

function valorVersion(valor: unknown) {
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (valor === '' || valor === null || valor === undefined) return 'Sin definir'
  return String(valor)
}

function EventoVersion({
  version,
  puedeGestionar,
  comparando,
  restaurando,
  alComparar,
  alRestaurar,
}: {
  version: VersionProducto
  puedeGestionar: boolean
  comparando: boolean
  restaurando: boolean
  alComparar: () => void
  alRestaurar: () => void
}) {
  const cantidadCambios = Object.keys(version.cambios).length

  return (
    <li className="relative border-s ps-5 pb-5 last:pb-0">
      <span className="absolute -start-1.5 top-1.5 size-3 rounded-full border-2 border-background bg-primary" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{version.resumen}</p>
          <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground uppercase">
            Versión {version.numero} · {version.tipo}
          </p>
        </div>
        <time className="text-xs text-muted-foreground" dateTime={version.creadoEn}>
          {formatoFecha.format(new Date(version.creadoEn))}
        </time>
      </div>
      {cantidadCambios ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {cantidadCambios} {cantidadCambios === 1 ? 'campo modificado' : 'campos modificados'}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={comparando ? 'secondary' : 'outline'}
          onClick={alComparar}
        >
          <GitCompareArrows aria-hidden="true" />
          {comparando ? 'Comparando' : 'Comparar con actual'}
        </Button>
        {puedeGestionar ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={restaurando}
            onClick={alRestaurar}
          >
            <RotateCcw aria-hidden="true" />
            Restaurar
          </Button>
        ) : null}
      </div>
    </li>
  )
}

interface DetalleProductoProps {
  abierto: boolean
  producto: Producto
  alCambiarApertura: (abierto: boolean) => void
  alEditar?: () => void
  alSolicitarCambioEstado?: (
    evento: ReactMouseEvent<HTMLButtonElement>,
  ) => void
  alRestaurarFoco: () => void
}

export function DetalleProducto({
  abierto,
  producto,
  alCambiarApertura,
  alEditar,
  alSolicitarCambioEstado,
  alRestaurarFoco,
}: DetalleProductoProps) {
  const [tipoArchivo, setTipoArchivo] =
    useState<TipoArchivoProducto>('image')
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null)
  const [descripcionArchivo, setDescripcionArchivo] = useState('')
  const [mensajeArchivo, setMensajeArchivo] = useState('')
  const [versionComparadaNumero, setVersionComparadaNumero] = useState<number | null>(null)
  const {
    archivos,
    versiones,
    cargandoDetalle,
    errorDetalle,
    subiendoArchivo,
    retirandoArchivo,
    guardandoArchivo,
    restaurandoVersion,
    subirArchivo,
    retirarArchivo,
    actualizarDescripcion,
    organizarImagenes,
    restaurarVersion,
  } = useProductoDetalle(producto.id, abierto)
  const puedeGestionar = Boolean(alEditar)
  const imagenes = archivos.filter((archivo) => archivo.tipo === 'image')
  const principalId =
    imagenes.find((imagen) => imagen.principal)?.id ?? imagenes[0]?.id ?? ''
  const versionComparada = versiones.find(
    (version) => version.numero === versionComparadaNumero,
  )
  const diferenciasVersion = useMemo(
    () =>
      versionComparada
        ? camposComparables.flatMap(([campo, etiqueta]) => {
            const anterior = versionComparada.snapshot[campo]
            const actual = producto[campo]
            return JSON.stringify(anterior) === JSON.stringify(actual)
              ? []
              : [{ campo, etiqueta, anterior, actual }]
          })
        : [],
    [producto, versionComparada],
  )

  const cargarArchivo = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!archivoSeleccionado) return
    const formulario = evento.currentTarget

    setMensajeArchivo('')
    try {
      await subirArchivo({
        archivo: archivoSeleccionado,
        tipo: tipoArchivo,
        descripcion: descripcionArchivo,
      })
      setArchivoSeleccionado(null)
      setDescripcionArchivo('')
      formulario.reset()
      setMensajeArchivo('Archivo agregado correctamente.')
    } catch (error) {
      setMensajeArchivo(
        error instanceof Error ? error.message : 'No se pudo cargar el archivo',
      )
    }
  }

  const guardarDescripcion = async (archivoId: string, descripcion: string) => {
    setMensajeArchivo('')
    try {
      await actualizarDescripcion(archivoId, descripcion)
      setMensajeArchivo('Descripción actualizada correctamente.')
    } catch (error) {
      setMensajeArchivo(
        error instanceof Error ? error.message : 'No se pudo actualizar la descripción',
      )
    }
  }

  const guardarOrganizacion = async (
    siguientesImagenes: ArchivoProducto[],
    siguientePrincipalId: string,
  ) => {
    setMensajeArchivo('')
    try {
      await organizarImagenes(siguientesImagenes, siguientePrincipalId)
      setMensajeArchivo('Orden e imagen principal actualizados.')
    } catch (error) {
      setMensajeArchivo(
        error instanceof Error ? error.message : 'No se pudieron organizar las imágenes',
      )
    }
  }

  const moverImagen = (indice: number, direccion: -1 | 1) => {
    const destino = indice + direccion
    if (destino < 0 || destino >= imagenes.length) return
    const siguientes = [...imagenes]
    const [movida] = siguientes.splice(indice, 1)
    if (!movida) return
    siguientes.splice(destino, 0, movida)
    void guardarOrganizacion(siguientes, principalId)
  }

  const restaurar = async (version: VersionProducto) => {
    if (
      !window.confirm(
        `¿Restaurar los datos del producto desde la versión ${version.numero}? El estado actual se conservará como una nueva versión.`,
      )
    ) {
      return
    }

    try {
      await restaurarVersion(version.numero)
      setVersionComparadaNumero(null)
      setMensajeArchivo(`Versión ${version.numero} restaurada correctamente.`)
    } catch (error) {
      setMensajeArchivo(
        error instanceof Error ? error.message : 'No se pudo restaurar la versión',
      )
    }
  }

  const retirar = async (archivo: ArchivoProducto) => {
    if (!window.confirm(`¿Retirar ${archivo.nombre} del producto?`)) return
    setMensajeArchivo('')
    try {
      await retirarArchivo(archivo)
      setMensajeArchivo('Archivo retirado correctamente.')
    } catch (error) {
      setMensajeArchivo(
        error instanceof Error ? error.message : 'No se pudo retirar el archivo',
      )
    }
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 end-0 z-50 flex w-full max-w-3xl flex-col border-s bg-background shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <div className="flex items-center justify-between gap-4 border-b bg-muted/45 px-5 py-3 sm:px-7">
            <span className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">
              Ficha de catálogo / {producto.codigo}
            </span>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar detalle"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <header className="border-b px-5 py-6 sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-2xl font-semibold tracking-[-0.03em] text-balance">
                  {producto.descripcion}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                  Información comercial, técnica y trazabilidad del producto.
                </DialogPrimitive.Description>
              </div>
              <span
                className="status-label"
                data-tone={producto.activo ? 'listo' : 'revision'}
              >
                {producto.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {imagenes.length ? (
              <section aria-labelledby="detalle-imagenes" className="px-5 py-6 sm:px-7">
                <h2 id="detalle-imagenes" className="flex items-center gap-2 font-semibold">
                  <ImageIcon aria-hidden="true" className="size-4 text-primary" />
                  Imágenes
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {imagenes.map((imagen, indice) => (
                    <article key={imagen.id} className="border bg-background">
                      <a
                        href={imagen.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative block aspect-square overflow-hidden bg-muted"
                      >
                        <img
                          src={imagen.url}
                          alt={imagen.descripcion || imagen.nombre}
                          loading="lazy"
                          className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                        />
                        {imagen.principal ? (
                          <span className="absolute start-2 top-2 inline-flex items-center gap-1 bg-background/95 px-2 py-1 text-xs font-medium text-primary shadow-sm">
                            <Star aria-hidden="true" className="size-3.5 fill-current" />
                            Principal
                          </span>
                        ) : null}
                      </a>
                      <div className="min-w-0 border-t px-3 py-2">
                        <p className="truncate text-xs font-medium">
                          {imagen.descripcion || imagen.nombre}
                        </p>
                        {puedeGestionar ? (
                          <div className="mt-2 flex justify-between gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={indice === 0 || guardandoArchivo}
                              aria-label={`Mover ${imagen.nombre} a la izquierda`}
                              onClick={() => moverImagen(indice, -1)}
                            >
                              <ArrowLeft aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant={imagen.principal ? 'secondary' : 'ghost'}
                              size="icon"
                              disabled={imagen.principal || guardandoArchivo}
                              aria-label={`Usar ${imagen.nombre} como imagen principal`}
                              onClick={() =>
                                void guardarOrganizacion(imagenes, imagen.id)
                              }
                            >
                              <Star
                                aria-hidden="true"
                                className={imagen.principal ? 'fill-current' : undefined}
                              />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={indice === imagenes.length - 1 || guardandoArchivo}
                              aria-label={`Mover ${imagen.nombre} a la derecha`}
                              onClick={() => moverImagen(indice, 1)}
                            >
                              <ArrowRight aria-hidden="true" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section aria-labelledby="detalle-identificacion" className="border-t px-5 py-6 first:border-t-0 sm:px-7">
              <h2 id="detalle-identificacion" className="flex items-center gap-2 font-semibold">
                <Barcode aria-hidden="true" className="size-4 text-primary" />
                Identificación
              </h2>
              <dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-6">
                <DatoProducto etiqueta="Código interno" valor={producto.codigo} />
                <DatoProducto etiqueta="Código de barras" valor={mostrarValor(producto.codigoBarras)} />
                <DatoProducto etiqueta="Línea" valor={<span className="inline-flex items-center gap-2"><Tag aria-hidden="true" className="size-3.5 text-muted-foreground" />{mostrarValor(producto.categoria)}</span>} />
                <DatoProducto etiqueta="Sublínea" valor={mostrarValor(producto.sublinea ?? '')} />
                <DatoProducto etiqueta="Marca" valor={<span className="inline-flex items-center gap-2"><Building2 aria-hidden="true" className="size-3.5 text-muted-foreground" />{mostrarValor(producto.laboratorio)}</span>} />
                <DatoProducto etiqueta="Presentación" valor={mostrarValor(producto.presentacion)} />
                <DatoProducto etiqueta="Unidad de medida" valor={mostrarValor(producto.unidadMedida)} />
              </dl>
              {producto.descripcionAmpliada ? (
                <div className="mt-2 border-t pt-4">
                  <p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Descripción ampliada</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{producto.descripcionAmpliada}</p>
                </div>
              ) : null}
            </section>

            <section aria-labelledby="detalle-comercial" className="border-t px-5 py-6 sm:px-7">
              <h2 id="detalle-comercial" className="flex items-center gap-2 font-semibold">
                <ReceiptText aria-hidden="true" className="size-4 text-primary" />
                Información comercial y sanitaria
              </h2>
              <dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-6">
                <DatoProducto etiqueta="Costo base" valor={<span className="font-mono text-xs tabular-nums">{mostrarPrecio(producto.costo ?? '')}</span>} />
                <DatoProducto etiqueta="Precio de venta base" valor={<span className="font-mono text-xs tabular-nums">{mostrarPrecio(producto.precioVenta)}</span>} />
                <DatoProducto etiqueta="Precio mínimo" valor={<span className="font-mono text-xs tabular-nums">{mostrarPrecio(producto.precioMinimo)}</span>} />
                <DatoProducto etiqueta="Stock máximo global" valor={mostrarValor(producto.stockMaximo)} />
                <DatoProducto etiqueta="Afectación de IGV" valor={mostrarAfectacionIgv(producto.afectacionIgv)} />
                <DatoProducto etiqueta="Registro sanitario" valor={mostrarValor(producto.registroSanitario)} />
              </dl>
            </section>

            <section aria-labelledby="detalle-dimensiones" className="border-t px-5 py-6 sm:px-7">
              <h2 id="detalle-dimensiones" className="flex items-center gap-2 font-semibold">
                <Ruler aria-hidden="true" className="size-4 text-primary" />
                Dimensiones y peso
              </h2>
              <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 sm:gap-x-6">
                <DatoProducto etiqueta="Ancho" valor={mostrarMedida(producto.anchoCm, 'cm')} />
                <DatoProducto etiqueta="Alto" valor={mostrarMedida(producto.altoCm, 'cm')} />
                <DatoProducto etiqueta="Largo" valor={mostrarMedida(producto.largoCm, 'cm')} />
                <DatoProducto etiqueta="Peso" valor={<span className="inline-flex items-center gap-2"><Scale aria-hidden="true" className="size-3.5 text-muted-foreground" />{mostrarMedida(producto.pesoKg, 'kg')}</span>} />
              </dl>
            </section>

            <section aria-labelledby="detalle-control" className="border-t px-5 py-6 sm:px-7">
              <h2 id="detalle-control" className="flex items-center gap-2 font-semibold">
                <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
                Control operativo
              </h2>
              <dl className="mt-4 grid sm:grid-cols-3 sm:gap-x-6">
                <DatoProducto etiqueta="Control por lote" valor={producto.controlLote ? 'Sí' : 'No'} />
                <DatoProducto etiqueta="Control de vencimiento" valor={producto.controlVencimiento ? 'Sí' : 'No'} />
                <DatoProducto etiqueta="Venta con receta" valor={producto.ventaReceta ? 'Sí' : 'No'} />
              </dl>
              <div className="mt-2 flex items-start gap-3 border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">
                <Boxes aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                <p>
                  Lote y vencimiento se controlan de forma independiente para adaptar la recepción y el kardex al producto real.
                </p>
              </div>
            </section>

            <section aria-labelledby="detalle-archivos" className="border-t px-5 py-6 sm:px-7">
              <h2 id="detalle-archivos" className="flex items-center gap-2 font-semibold">
                <Paperclip aria-hidden="true" className="size-4 text-primary" />
                Ficha técnica y adjuntos
              </h2>
              <div className="mt-4">
                {cargandoDetalle ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Cargando archivos…</p>
                ) : (
                  <ListaArchivos
                    archivos={archivos}
                    puedeGestionar={puedeGestionar}
                    retirando={retirandoArchivo}
                    guardando={guardandoArchivo}
                    alRetirar={retirar}
                    alGuardarDescripcion={guardarDescripcion}
                  />
                )}
              </div>
              {puedeGestionar ? (
                <form className="mt-5 grid gap-3 border bg-muted/25 p-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end" onSubmit={cargarArchivo}>
                  <div>
                    <label htmlFor="tipo-archivo-producto" className="field-label">Tipo</label>
                    <select id="tipo-archivo-producto" className="field-control" value={tipoArchivo} onChange={(evento) => setTipoArchivo(evento.target.value as TipoArchivoProducto)}>
                      <option value="image">Imagen</option>
                      <option value="technical-sheet">Ficha técnica</option>
                      <option value="attachment">Adjunto</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="archivo-producto" className="field-label">Archivo</label>
                    <input id="archivo-producto" type="file" required className="field-control file:me-3 file:border-0 file:bg-transparent file:text-sm file:font-medium" accept={tipoArchivo === 'image' ? 'image/jpeg,image/png,image/webp' : '.pdf,.doc,.docx,.xls,.xlsx,.txt'} onChange={(evento) => setArchivoSeleccionado(evento.target.files?.[0] ?? null)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="descripcion-archivo-producto" className="field-label">
                      Descripción
                    </label>
                    <input
                      id="descripcion-archivo-producto"
                      value={descripcionArchivo}
                      maxLength={240}
                      className="field-control"
                      placeholder="Ej. Vista frontal o ficha técnica vigente"
                      onChange={(evento) => setDescripcionArchivo(evento.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={!archivoSeleccionado || subiendoArchivo}>
                    {subiendoArchivo ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />}
                    {subiendoArchivo ? 'Cargando…' : 'Agregar'}
                  </Button>
                </form>
              ) : null}
              {mensajeArchivo ? <p role="status" className="mt-3 text-sm text-muted-foreground">{mensajeArchivo}</p> : null}
              {errorDetalle ? <p role="alert" className="mt-3 text-sm text-destructive">{errorDetalle instanceof Error ? errorDetalle.message : 'No se pudo cargar el detalle documental'}</p> : null}
            </section>

            <section aria-labelledby="detalle-historial" className="border-t px-5 py-6 sm:px-7">
              <h2 id="detalle-historial" className="flex items-center gap-2 font-semibold">
                <History aria-hidden="true" className="size-4 text-primary" />
                Historial integrado
              </h2>
              {versionComparada ? (
                <div className="mt-4 border bg-muted/20">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        Versión {versionComparada.numero} frente al estado actual
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Solo se muestran los campos que cambiaron.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setVersionComparadaNumero(null)}
                    >
                      Cerrar comparación
                    </Button>
                  </div>
                  {diferenciasVersion.length ? (
                    <div className="divide-y">
                      {diferenciasVersion.map((diferencia) => (
                        <div
                          key={diferencia.campo}
                          className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[9rem_1fr_1fr] sm:gap-4"
                        >
                          <p className="font-medium">{diferencia.etiqueta}</p>
                          <div>
                            <span className="font-mono text-[0.68rem] text-muted-foreground uppercase">
                              Versión {versionComparada.numero}
                            </span>
                            <p className="mt-1 break-words text-muted-foreground">
                              {valorVersion(diferencia.anterior)}
                            </p>
                          </div>
                          <div>
                            <span className="font-mono text-[0.68rem] text-muted-foreground uppercase">
                              Actual
                            </span>
                            <p className="mt-1 break-words">
                              {valorVersion(diferencia.actual)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 py-5 text-sm text-muted-foreground">
                      Esta versión conserva los mismos datos de catálogo que el estado actual.
                    </p>
                  )}
                </div>
              ) : null}
              {versiones.length ? (
                <ol className="mt-5 ps-2">
                  {versiones.map((version) => (
                    <EventoVersion
                      key={version.id}
                      version={version}
                      puedeGestionar={puedeGestionar}
                      comparando={version.numero === versionComparadaNumero}
                      restaurando={restaurandoVersion}
                      alComparar={() => setVersionComparadaNumero(version.numero)}
                      alRestaurar={() => void restaurar(version)}
                    />
                  ))}
                </ol>
              ) : cargandoDetalle ? (
                <p className="mt-4 text-sm text-muted-foreground">Cargando historial…</p>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><FileClock aria-hidden="true" className="size-4" />Aún no hay versiones registradas.</p>
              )}
            </section>
          </div>

          {alEditar && alSolicitarCambioEstado ? (
            <footer className="grid grid-cols-2 gap-2 border-t bg-background px-5 py-4 sm:flex sm:justify-end sm:px-7">
              <Button type="button" variant="outline" size="lg" onClick={alEditar}>
                <Pencil aria-hidden="true" />
                Editar
              </Button>
              <Button type="button" variant={producto.activo ? 'destructive' : 'default'} size="lg" onClick={alSolicitarCambioEstado}>
                <CirclePower aria-hidden="true" />
                {producto.activo ? 'Desactivar' : 'Activar'}
              </Button>
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
