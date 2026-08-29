import { ImagePlus, LoaderCircle, Star, Trash2, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useProductoDetalle } from '@/modulos/productos/estado/useProductoDetalle'
import type { ArchivoProducto, Producto } from '@/modulos/productos/modelo/producto'

export function GestorImagenesProducto({ producto }: { producto: Producto }) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null)
  const [mensaje, setMensaje] = useState('')
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
  } = useProductoDetalle(producto.id, true)
  const imagenes = archivos.filter((archivo) => archivo.tipo === 'image')

  const cargarImagen = async () => {
    if (!archivoSeleccionado) return
    setMensaje('')
    try {
      await subirArchivo({ archivo: archivoSeleccionado, tipo: 'image', descripcion: '' })
      setArchivoSeleccionado(null)
      if (inputRef.current) inputRef.current.value = ''
      setMensaje('Imagen agregada correctamente.')
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo cargar la imagen.')
    }
  }

  const usarComoPrincipal = async (imagen: ArchivoProducto) => {
    setMensaje('')
    try {
      await organizarImagenes(imagenes, imagen.id)
      setMensaje('Imagen principal actualizada.')
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo actualizar la imagen principal.')
    }
  }

  const retirarImagen = async (imagen: ArchivoProducto) => {
    setMensaje('')
    try {
      await retirarArchivo(imagen)
      setMensaje('Imagen retirada correctamente.')
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo retirar la imagen.')
    }
  }

  return <div className="space-y-4">
    {cargandoDetalle ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Cargando imágenes…</p> : null}
    {!cargandoDetalle && !imagenes.length ? <p className="text-sm text-muted-foreground">Este SKU todavía no tiene imágenes.</p> : null}
    {imagenes.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{imagenes.map((imagen) => <article key={imagen.id} className="overflow-hidden rounded-md border bg-background">
      <a href={imagen.url} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden bg-muted"><img src={imagen.url} alt={imagen.descripcion || producto.descripcion} loading="lazy" className="size-full object-cover" />{imagen.principal ? <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded bg-background/95 px-2 py-1 text-xs font-medium text-primary"><Star aria-hidden="true" className="size-3.5 fill-current" />Principal</span> : null}</a>
      <div className="flex justify-end gap-1 border-t p-2"><Button type="button" variant="ghost" size="icon" disabled={imagen.principal || guardandoArchivo} aria-label={`Usar ${imagen.nombre} como imagen principal`} onClick={() => void usarComoPrincipal(imagen)}><Star aria-hidden="true" /></Button><Button type="button" variant="ghost" size="icon" disabled={retirandoArchivo} aria-label={`Retirar ${imagen.nombre}`} onClick={() => void retirarImagen(imagen)}><Trash2 aria-hidden="true" /></Button></div>
    </article>)}</div> : null}
    <div className="rounded-md border border-dashed p-4">
      <span className="field-label">Agregar imagen</span>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input ref={inputRef} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(evento) => setArchivoSeleccionado(evento.target.files?.[0] ?? null)} />
        <label htmlFor={inputId} className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted"><ImagePlus aria-hidden="true" className="size-4" />Seleccionar imagen</label>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{archivoSeleccionado?.name ?? 'Ningún archivo seleccionado'}</span>
        <Button type="button" disabled={!archivoSeleccionado || subiendoArchivo} onClick={() => void cargarImagen()}>{subiendoArchivo ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />}{subiendoArchivo ? 'Cargando…' : 'Agregar'}</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">JPG, PNG o WEBP; máximo 5 MB.</p>
    </div>
    {mensaje ? <p role="status" className="text-sm text-muted-foreground">{mensaje}</p> : null}
    {errorDetalle ? <p role="alert" className="text-sm text-destructive">{errorDetalle instanceof Error ? errorDetalle.message : 'No se pudieron cargar las imágenes.'}</p> : null}
  </div>
}
