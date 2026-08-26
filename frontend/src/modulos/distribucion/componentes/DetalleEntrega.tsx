import { AlertTriangle, CalendarDays, Download, ExternalLink, FileCheck2, MapPin, PackageCheck, Route, Truck, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import { etiquetasEstadoEntrega, type EstadoEntrega, type ProgramacionEntrega } from '@/modulos/distribucion/modelo/programacionEntrega'

interface DetalleEntregaProps {
  entrega: ProgramacionEntrega
  puedeGestionar: boolean
  alCerrar: () => void
  alGestionar: () => void
  alExportar: () => void
  alAbrirEvidencia: (ruta: string) => Promise<void>
}

const formatoFecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
const formatoFechaHora = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' })

const estiloEstado: Record<EstadoEntrega, string> = {
  programada: 'border-sky-200 bg-sky-50 text-sky-800',
  reprogramada: 'border-amber-200 bg-amber-50 text-amber-800',
  en_transito: 'border-blue-200 bg-blue-50 text-blue-800',
  entrega_parcial: 'border-orange-200 bg-orange-50 text-orange-800',
  entregada: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rechazada: 'border-red-200 bg-red-50 text-red-800',
  devuelta: 'border-violet-200 bg-violet-50 text-violet-800',
  cancelada: 'border-slate-200 bg-slate-100 text-slate-700',
}

export function EtiquetaEstadoEntrega({ estado }: { estado: EstadoEntrega }) {
  return <span className={`inline-flex border px-2.5 py-1 font-mono text-[0.68rem] font-semibold tracking-wide uppercase ${estiloEstado[estado]}`}>{etiquetasEstadoEntrega[estado]}</span>
}

export function DetalleEntrega({ entrega, puedeGestionar, alCerrar, alGestionar, alExportar, alAbrirEvidencia }: DetalleEntregaProps) {
  return (
    <DialogPrimitive.Root open onOpenChange={(abierto) => { if (!abierto) alCerrar() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content className="fixed inset-y-0 end-0 z-50 w-full max-w-2xl overflow-y-auto border-s bg-background shadow-2xl outline-none">
          <header className="sticky top-0 z-10 border-b bg-background/95 px-5 py-5 backdrop-blur sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[0.68rem] tracking-[0.08em] text-primary uppercase">Ruta {entrega.pedidoNumero} / {entrega.secuencia}</p>
                <DialogPrimitive.Title className="mt-2 text-xl font-semibold">Guía {entrega.numeroGuiaRemision}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{entrega.clienteNombre}</DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar detalle" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <EtiquetaEstadoEntrega estado={entrega.seguimiento} />
              <Button type="button" size="sm" variant="outline" onClick={alExportar}><Download aria-hidden="true" /> Constancia</Button>
              {puedeGestionar ? <Button type="button" size="sm" onClick={alGestionar}><Route aria-hidden="true" /> Registrar operación</Button> : null}
            </div>
          </header>

          <div className="space-y-7 px-5 py-6 sm:px-7">
            <section aria-labelledby="trayecto-title" className="grid gap-4 border-b pb-6 sm:grid-cols-2">
              <div><h2 id="trayecto-title" className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">Destino</h2><p className="mt-2 flex gap-2 text-sm leading-6"><MapPin aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />{entrega.direccionEntrega}</p>{entrega.referenciaEntrega ? <p className="ms-6 text-xs text-muted-foreground">{entrega.referenciaEntrega}</p> : null}</div>
              <div><p className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">Fecha comprometida</p><p className="mt-2 flex items-center gap-2 text-sm"><CalendarDays aria-hidden="true" className="size-4 text-primary" />{formatoFecha.format(new Date(`${entrega.fechaEntrega}T12:00:00`))}</p><p className="mt-1 text-xs text-muted-foreground">Contacto: {entrega.contactoNombre || 'No indicado'} {entrega.contactoTelefono ? `· ${entrega.contactoTelefono}` : ''}</p></div>
              <div><p className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">Unidad</p><p className="mt-2 flex items-center gap-2 text-sm"><Truck aria-hidden="true" className="size-4 text-primary" />{entrega.vehiculoPlaca} · {entrega.conductorNombre}</p><p className="mt-1 text-xs text-muted-foreground">{entrega.tipoTransporte === 'interno' ? 'Transporte interno' : entrega.transportistaNombre}</p></div>
              <div><p className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">Documento</p><p className="mt-2 text-sm">Licencia {entrega.conductorLicencia || 'no registrada'}</p><p className="mt-1 text-xs text-muted-foreground">{entrega.observaciones || 'Sin observaciones de programación.'}</p></div>
            </section>

            <section aria-labelledby="carga-title">
              <div className="flex items-center justify-between"><h2 id="carga-title" className="font-semibold">Carga y resultado</h2><PackageCheck aria-hidden="true" className="size-5 text-primary" /></div>
              <div className="mt-3 overflow-x-auto border"><table className="w-full min-w-[36rem] text-sm"><thead className="border-b bg-muted/40 text-start text-xs text-muted-foreground"><tr><th className="px-3 py-2.5 text-start font-medium">Producto</th><th className="px-3 py-2.5 text-end font-medium">Enviado</th><th className="px-3 py-2.5 text-end font-medium">Entregado</th><th className="px-3 py-2.5 text-end font-medium">Rechazado</th><th className="px-3 py-2.5 text-end font-medium">Devuelto</th></tr></thead><tbody className="divide-y">{entrega.lineas.map((linea) => <tr key={linea.id}><td className="px-3 py-3"><p className="font-medium">{linea.productoDescripcion}</p><p className="mt-0.5 font-mono text-[0.68rem] text-muted-foreground">{linea.productoCodigo}{linea.lote ? ` · Lote ${linea.lote}` : ''}</p></td>{[linea.cantidadEnviada, linea.cantidadEntregada, linea.cantidadRechazada, linea.cantidadDevuelta].map((cantidad, indice) => <td key={indice} className="px-3 py-3 text-end font-mono">{cantidad} <span className="text-[0.65rem] text-muted-foreground">{linea.unidadMedida}</span></td>)}</tr>)}</tbody></table></div>
            </section>

            {entrega.incidencias.length ? <section aria-labelledby="incidencias-title"><div className="flex items-center gap-2"><AlertTriangle aria-hidden="true" className="size-5 text-amber-600" /><h2 id="incidencias-title" className="font-semibold">Incidencias</h2></div><div className="mt-3 space-y-2">{entrega.incidencias.map((item) => <article key={item.id} className="border-s-2 border-amber-400 bg-amber-50/60 px-4 py-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium capitalize">{item.tipo.replace('_', ' ')} · {item.severidad}</p><span className="font-mono text-[0.65rem] uppercase text-amber-800">{item.estado}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.descripcion}</p>{item.resolucion ? <p className="mt-2 text-sm"><strong>Resolución:</strong> {item.resolucion}</p> : null}</article>)}</div></section> : null}

            <section aria-labelledby="evidencias-title"><div className="flex items-center gap-2"><FileCheck2 aria-hidden="true" className="size-5 text-primary" /><h2 id="evidencias-title" className="font-semibold">Evidencias privadas</h2></div>{entrega.evidencias.length ? <div className="mt-3 divide-y border">{entrega.evidencias.map((item) => <button key={item.id} type="button" className="flex w-full items-center justify-between gap-4 px-4 py-3 text-start hover:bg-muted/50" onClick={() => void alAbrirEvidencia(item.ruta)}><span><span className="block text-sm font-medium">{item.nombreArchivo}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.tipo} · {(item.tamano / 1024).toFixed(1)} KB</span></span><ExternalLink aria-hidden="true" className="size-4 shrink-0 text-primary" /></button>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Todavía no se adjuntaron archivos.</p>}</section>

            <section aria-labelledby="bitacora-title"><h2 id="bitacora-title" className="font-semibold">Bitácora inmutable</h2><ol className="mt-4 space-y-0">{entrega.eventos.map((evento, indice) => <li key={evento.id} className="relative grid grid-cols-[1rem_1fr] gap-3 pb-5 last:pb-0"><span className="relative mt-1 block size-3 rounded-full border-2 border-primary bg-background">{indice < entrega.eventos.length - 1 ? <span className="absolute start-[3px] top-3 h-[calc(100%+1.25rem)] w-px bg-border" /> : null}</span><div><p className="text-sm font-medium">{evento.descripcion || evento.tipo.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-muted-foreground">{formatoFechaHora.format(new Date(evento.ocurridoEn))}{evento.estadoNuevo ? ` · ${etiquetasEstadoEntrega[evento.estadoNuevo]}` : ''}</p></div></li>)}</ol></section>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
