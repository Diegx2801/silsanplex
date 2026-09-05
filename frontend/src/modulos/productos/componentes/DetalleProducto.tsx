import { Barcode, Boxes, Building2, ImageIcon, LoaderCircle, ReceiptText, ShieldCheck, Star, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

import { useProductoDetalle } from '@/modulos/productos/estado/useProductoDetalle'
import { afectacionesIgv, type Producto } from '@/modulos/productos/modelo/producto'

const formatoMoneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })

function DatoProducto({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return <div className="border-t py-4 first:border-t-0"><dt className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">{etiqueta}</dt><dd className="mt-1.5 text-sm leading-6">{valor}</dd></div>
}

function mostrarValor(valor: string) { return valor || 'Sin definir' }
function mostrarPrecio(valor: string) { return valor ? formatoMoneda.format(Number(valor)) : 'Sin definir' }
function mostrarPrecioMinimo(valor: string) { return valor === '' ? 'Sin mínimo' : formatoMoneda.format(Number(valor)) }
function mostrarAfectacionIgv(valor: Producto['afectacionIgv']) { return afectacionesIgv.find((opcion) => opcion.valor === valor)?.etiqueta ?? 'Sin definir' }

interface DetalleProductoProps {
  abierto: boolean
  producto: Producto
  alCambiarApertura: (abierto: boolean) => void
  alRestaurarFoco: () => void
}

export function DetalleProducto({ abierto, producto, alCambiarApertura, alRestaurarFoco }: DetalleProductoProps) {
  const { archivos, cargandoDetalle, errorDetalle } = useProductoDetalle(producto.id, abierto)
  const imagenes = archivos.filter((archivo) => archivo.tipo === 'image')

  return <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
    <DialogPrimitive.Content className="fixed inset-0 z-50 m-auto flex h-dvh w-full flex-col bg-background shadow-xl outline-none sm:h-[min(90vh,860px)] sm:max-w-4xl sm:rounded-lg sm:border" onCloseAutoFocus={(evento) => { evento.preventDefault(); alRestaurarFoco() }}>
      <div className="flex items-center justify-between gap-4 border-b bg-muted/45 px-5 py-3 sm:px-7"><span className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">SKU / {producto.codigo}</span><DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar detalle" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-background focus-visible:ring-2"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close></div>
      <header className="border-b px-5 py-6 sm:px-7"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><DialogPrimitive.Title className="text-2xl font-semibold tracking-[-0.03em]">{producto.descripcion}</DialogPrimitive.Title><DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">Consulta de la presentación comercial.</DialogPrimitive.Description></div><span className="status-label" data-tone={producto.activo ? 'listo' : 'revision'}>{producto.activo ? 'Activo' : 'Inactivo'}</span></div></header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-5 py-6 sm:px-7" aria-labelledby="detalle-identificacion"><h2 id="detalle-identificacion" className="flex items-center gap-2 font-semibold"><Barcode aria-hidden="true" className="size-4 text-primary" />Identificación</h2><dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-8"><DatoProducto etiqueta="SKU / código interno" valor={producto.codigo} /><DatoProducto etiqueta="Tipo" valor={producto.tipo === 'service' ? 'Servicio' : 'Producto físico'} /><DatoProducto etiqueta="Código de barras" valor={mostrarValor(producto.codigoBarras)} /><DatoProducto etiqueta="Presentación" valor={mostrarValor(producto.presentacion)} /><DatoProducto etiqueta="Unidad de medida" valor={mostrarValor(producto.unidadMedida)} /><DatoProducto etiqueta="Unidades alternativas" valor={producto.unidadesAlternativas.length ? producto.unidadesAlternativas.map((unidad) => `${unidad.unidadNombre || 'Unidad'} x ${unidad.equivalencia}`).join(', ') : 'Sin unidades alternativas'} /><DatoProducto etiqueta="Línea" valor={mostrarValor(producto.categoria)} /><DatoProducto etiqueta="Sublínea" valor={mostrarValor(producto.sublinea ?? '')} /><DatoProducto etiqueta="Marca o laboratorio" valor={<span className="inline-flex items-center gap-2"><Building2 aria-hidden="true" className="size-3.5 text-muted-foreground" />{mostrarValor(producto.laboratorio)}</span>} /><DatoProducto etiqueta="Registro sanitario" valor={mostrarValor(producto.registroSanitario)} /></dl></section>
        <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-comercial"><h2 id="detalle-comercial" className="flex items-center gap-2 font-semibold"><ReceiptText aria-hidden="true" className="size-4 text-primary" />Información comercial</h2><dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-8"><DatoProducto etiqueta="Precio de venta final" valor={<span className="font-mono text-xs tabular-nums">{mostrarPrecio(producto.precioVenta)}</span>} /><DatoProducto etiqueta="Precio mínimo final" valor={<span className="font-mono text-xs tabular-nums">{mostrarPrecioMinimo(producto.precioMinimo)}</span>} /><DatoProducto etiqueta="Afectación de IGV" valor={mostrarAfectacionIgv(producto.afectacionIgv)} /></dl><p className="mt-2 text-xs text-muted-foreground">Los precios finales incluyen IGV cuando corresponde.</p></section>
        <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-control"><h2 id="detalle-control" className="flex items-center gap-2 font-semibold"><ShieldCheck aria-hidden="true" className="size-4 text-primary" />Control operativo</h2><dl className="mt-4 grid sm:grid-cols-4 sm:gap-x-6"><DatoProducto etiqueta="Control por lote" valor={producto.controlLote ? 'Sí' : 'No'} /><DatoProducto etiqueta="Control de vencimiento" valor={producto.controlVencimiento ? 'Sí' : 'No'} /><DatoProducto etiqueta="Control por serie" valor={producto.serialControl ? 'Sí' : 'No'} /><DatoProducto etiqueta="Venta con receta" valor={producto.ventaReceta ? 'Sí' : 'No'} /></dl><div className="mt-2 flex items-start gap-3 border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground"><Boxes aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /><p>Los lotes, vencimientos, existencias y ubicaciones se administran en Inventario, sin crear productos adicionales.</p></div></section>
        <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-imagenes"><h2 id="detalle-imagenes" className="flex items-center gap-2 font-semibold"><ImageIcon aria-hidden="true" className="size-4 text-primary" />Imágenes del producto</h2>{cargandoDetalle ? <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Cargando imágenes…</p> : null}{!cargandoDetalle && !imagenes.length ? <p className="mt-4 text-sm text-muted-foreground">Este SKU todavía no tiene imágenes.</p> : null}{imagenes.length ? <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">{imagenes.map((imagen) => <a key={imagen.id} href={imagen.url} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-md border bg-muted"><img src={imagen.url} alt={imagen.descripcion || producto.descripcion} loading="lazy" className="size-full object-cover" />{imagen.principal ? <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded bg-background/95 px-2 py-1 text-xs font-medium text-primary"><Star aria-hidden="true" className="size-3.5 fill-current" />Principal</span> : null}</a>)}</div> : null}{errorDetalle ? <p role="alert" className="mt-3 text-sm text-destructive">{errorDetalle instanceof Error ? errorDetalle.message : 'No se pudieron cargar las imágenes.'}</p> : null}</section>
      </div>
      <footer className="flex justify-end border-t px-5 py-4 sm:px-7"><DialogPrimitive.Close asChild><button type="button" className="inline-flex min-h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted">Cerrar</button></DialogPrimitive.Close></footer>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>
}
