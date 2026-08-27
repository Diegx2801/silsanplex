import { Barcode, Boxes, Building2, CirclePower, ImageIcon, LoaderCircle, Pencil, ReceiptText, ShieldCheck, Star, Trash2, Upload, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useProductoDetalle } from '@/modulos/productos/estado/useProductoDetalle'
import { afectacionesIgv, type ArchivoProducto, type Producto } from '@/modulos/productos/modelo/producto'

const formatoMoneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })

function DatoProducto({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return <div className="border-t py-4 first:border-t-0">
    <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">{etiqueta}</dt>
    <dd className="mt-1.5 text-sm leading-6">{valor}</dd>
  </div>
}

function mostrarValor(valor: string) { return valor || 'Sin definir' }
function mostrarPrecio(valor: string) { return valor ? formatoMoneda.format(Number(valor)) : 'Sin definir' }
function mostrarAfectacionIgv(valor: Producto['afectacionIgv']) {
  return afectacionesIgv.find((opcion) => opcion.valor === valor)?.etiqueta ?? 'Sin definir'
}

interface DetalleProductoProps {
  abierto: boolean
  producto: Producto
  alCambiarApertura: (abierto: boolean) => void
  alEditar?: () => void
  alSolicitarCambioEstado?: (evento: ReactMouseEvent<HTMLButtonElement>) => void
  alRestaurarFoco: () => void
}

export function DetalleProducto({ abierto, producto, alCambiarApertura, alEditar, alSolicitarCambioEstado, alRestaurarFoco }: DetalleProductoProps) {
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null)
  const [mensajeImagen, setMensajeImagen] = useState('')
  const {
    archivos,
    cargandoDetalle,
    errorDetalle,
    subiendoArchivo,
    retirandoArchivo,
    guardandoArchivo,
    subirArchivo,
    retirarArchivo,
    organizarImagenes,
  } = useProductoDetalle(producto.id, abierto)
  const imagenes = archivos.filter((archivo) => archivo.tipo === 'image')
  const puedeGestionar = Boolean(alEditar)

  const cargarImagen = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!archivoSeleccionado) return
    setMensajeImagen('')
    try {
      await subirArchivo({ archivo: archivoSeleccionado, tipo: 'image', descripcion: '' })
      setArchivoSeleccionado(null)
      evento.currentTarget.reset()
      setMensajeImagen('Imagen agregada correctamente.')
    } catch (error) {
      setMensajeImagen(error instanceof Error ? error.message : 'No se pudo cargar la imagen.')
    }
  }

  const usarComoPrincipal = async (imagen: ArchivoProducto) => {
    setMensajeImagen('')
    try {
      await organizarImagenes(imagenes, imagen.id)
      setMensajeImagen('Imagen principal actualizada.')
    } catch (error) {
      setMensajeImagen(error instanceof Error ? error.message : 'No se pudo actualizar la imagen principal.')
    }
  }

  const retirarImagen = async (imagen: ArchivoProducto) => {
    setMensajeImagen('')
    try {
      await retirarArchivo(imagen)
      setMensajeImagen('Imagen retirada correctamente.')
    } catch (error) {
      setMensajeImagen(error instanceof Error ? error.message : 'No se pudo retirar la imagen.')
    }
  }

  return <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
      <DialogPrimitive.Content className="fixed inset-y-0 end-0 z-50 flex w-full max-w-2xl flex-col border-s bg-background shadow-xl outline-none" onCloseAutoFocus={(evento) => { evento.preventDefault(); alRestaurarFoco() }}>
        <div className="flex items-center justify-between gap-4 border-b bg-muted/45 px-5 py-3 sm:px-7">
          <span className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">SKU / {producto.codigo}</span>
          <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar detalle" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-background focus-visible:ring-2"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
        </div>

        <header className="border-b px-5 py-6 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-2xl font-semibold tracking-[-0.03em]">{producto.descripcion}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">Ficha operativa de la presentación comercial.</DialogPrimitive.Description>
            </div>
            <span className="status-label" data-tone={producto.activo ? 'listo' : 'revision'}>{producto.activo ? 'Activo' : 'Inactivo'}</span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="px-5 py-6 sm:px-7" aria-labelledby="detalle-identificacion">
            <h2 id="detalle-identificacion" className="flex items-center gap-2 font-semibold"><Barcode aria-hidden="true" className="size-4 text-primary" />Identificación</h2>
            <dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-6">
              <DatoProducto etiqueta="SKU / código interno" valor={producto.codigo} />
              <DatoProducto etiqueta="Tipo" valor={producto.tipo === 'service' ? 'Servicio' : 'Producto físico'} />
              <DatoProducto etiqueta="Código de barras" valor={mostrarValor(producto.codigoBarras)} />
              <DatoProducto etiqueta="Presentación" valor={mostrarValor(producto.presentacion)} />
              <DatoProducto etiqueta="Unidad de medida" valor={mostrarValor(producto.unidadMedida)} />
              <DatoProducto etiqueta="Unidades alternativas" valor={producto.unidadesAlternativas.length ? producto.unidadesAlternativas.map((unidad) => `${unidad.unidadNombre || 'Unidad'} x ${unidad.equivalencia}`).join(', ') : 'Sin unidades alternativas'} />
              <DatoProducto etiqueta="Línea" valor={mostrarValor(producto.categoria)} />
              <DatoProducto etiqueta="Sublínea" valor={mostrarValor(producto.sublinea ?? '')} />
              <DatoProducto etiqueta="Marca o laboratorio" valor={<span className="inline-flex items-center gap-2"><Building2 aria-hidden="true" className="size-3.5 text-muted-foreground" />{mostrarValor(producto.laboratorio)}</span>} />
              <DatoProducto etiqueta="Registro sanitario" valor={mostrarValor(producto.registroSanitario)} />
            </dl>
          </section>

          <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-comercial">
            <h2 id="detalle-comercial" className="flex items-center gap-2 font-semibold"><ReceiptText aria-hidden="true" className="size-4 text-primary" />Información comercial</h2>
            <dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-6">
              <DatoProducto etiqueta="Precio de venta base" valor={<span className="font-mono text-xs tabular-nums">{mostrarPrecio(producto.precioVenta)}</span>} />
              <DatoProducto etiqueta="Afectación de IGV" valor={mostrarAfectacionIgv(producto.afectacionIgv)} />
            </dl>
          </section>

          <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-control">
            <h2 id="detalle-control" className="flex items-center gap-2 font-semibold"><ShieldCheck aria-hidden="true" className="size-4 text-primary" />Control operativo</h2>
            <dl className="mt-4 grid sm:grid-cols-3 sm:gap-x-6">
              <DatoProducto etiqueta="Control por lote" valor={producto.controlLote ? 'Sí' : 'No'} />
              <DatoProducto etiqueta="Control de vencimiento" valor={producto.controlVencimiento ? 'Sí' : 'No'} />
              <DatoProducto etiqueta="Venta con receta" valor={producto.ventaReceta ? 'Sí' : 'No'} />
            </dl>
            <div className="mt-2 flex items-start gap-3 border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground"><Boxes aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /><p>Los lotes, vencimientos, existencias y ubicaciones se administran en Inventario, sin crear productos adicionales.</p></div>
          </section>

          <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-imagenes">
            <h2 id="detalle-imagenes" className="flex items-center gap-2 font-semibold"><ImageIcon aria-hidden="true" className="size-4 text-primary" />Imágenes del producto</h2>
            {cargandoDetalle ? <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Cargando imágenes…</p> : null}
            {!cargandoDetalle && !imagenes.length ? <p className="mt-4 text-sm text-muted-foreground">Este SKU todavía no tiene imágenes.</p> : null}
            {imagenes.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{imagenes.map((imagen) => <article key={imagen.id} className="border bg-background">
              <a href={imagen.url} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden bg-muted"><img src={imagen.url} alt={imagen.descripcion || producto.descripcion} loading="lazy" className="size-full object-cover" />{imagen.principal ? <span className="absolute start-2 top-2 inline-flex items-center gap-1 bg-background/95 px-2 py-1 text-xs font-medium text-primary"><Star aria-hidden="true" className="size-3.5 fill-current" />Principal</span> : null}</a>
              {puedeGestionar ? <div className="flex justify-end gap-1 border-t p-2">
                <Button type="button" variant="ghost" size="icon" disabled={imagen.principal || guardandoArchivo} aria-label={`Usar ${imagen.nombre} como imagen principal`} onClick={() => void usarComoPrincipal(imagen)}><Star aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" disabled={retirandoArchivo} aria-label={`Retirar ${imagen.nombre}`} onClick={() => void retirarImagen(imagen)}><Trash2 aria-hidden="true" /></Button>
              </div> : null}
            </article>)}</div> : null}
            {puedeGestionar ? <form className="mt-5 flex flex-col gap-3 border bg-muted/25 p-4 sm:flex-row sm:items-end" onSubmit={cargarImagen}>
              <div className="min-w-0 flex-1"><label htmlFor="imagen-producto" className="field-label">Nueva imagen</label><input id="imagen-producto" type="file" required accept="image/jpeg,image/png,image/webp" className="field-control file:me-3 file:border-0 file:bg-transparent file:text-sm file:font-medium" onChange={(evento) => setArchivoSeleccionado(evento.target.files?.[0] ?? null)} /></div>
              <Button type="submit" disabled={!archivoSeleccionado || subiendoArchivo}>{subiendoArchivo ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />}{subiendoArchivo ? 'Cargando…' : 'Agregar imagen'}</Button>
            </form> : null}
            {mensajeImagen ? <p role="status" className="mt-3 text-sm text-muted-foreground">{mensajeImagen}</p> : null}
            {errorDetalle ? <p role="alert" className="mt-3 text-sm text-destructive">{errorDetalle instanceof Error ? errorDetalle.message : 'No se pudieron cargar las imágenes.'}</p> : null}
          </section>
        </div>

        {alEditar && alSolicitarCambioEstado ? <footer className="grid grid-cols-2 gap-2 border-t px-5 py-4 sm:flex sm:justify-end sm:px-7">
          <Button type="button" variant="outline" size="lg" onClick={alEditar}><Pencil aria-hidden="true" />Editar</Button>
          <Button type="button" variant={producto.activo ? 'destructive' : 'default'} size="lg" onClick={alSolicitarCambioEstado}><CirclePower aria-hidden="true" />{producto.activo ? 'Desactivar' : 'Activar'}</Button>
        </footer> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
