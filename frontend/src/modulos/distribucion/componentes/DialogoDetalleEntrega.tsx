import { Eye, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import { formatearFechaDistribucion } from '@/modulos/distribucion/servicios/formatoDistribucion'
import type { ProgramacionEntrega } from '@/modulos/distribucion/modelo/programacionEntrega'

const etiquetasEstado: Record<ProgramacionEntrega['estado'], string> = {
  programado: 'Programado',
  preparando: 'Preparando',
  en_curso: 'En curso',
  en_destino: 'En destino',
  entregado: 'Entregado',
  entrega_parcial: 'Entrega parcial',
  reprogramado: 'Reprogramado',
  rechazado: 'Rechazado',
  devuelto: 'Devuelto',
  cancelado: 'Cancelado',
}

function tonoEstado(estado: ProgramacionEntrega['estado']) {
  if (estado === 'entregado') return 'listo'
  if (estado === 'rechazado' || estado === 'devuelto' || estado === 'cancelado') return 'revision'
  return 'pendiente'
}

interface DialogoDetalleEntregaProps {
  abierto: boolean
  entrega: ProgramacionEntrega
  alCambiarApertura: (abierto: boolean) => void
}

export function DialogoDetalleEntrega({ abierto, entrega, alCambiarApertura }: DialogoDetalleEntregaProps) {
  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-70 flex max-h-[92svh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <div className="grid size-10 place-items-center rounded-full bg-accent text-primary"><Eye aria-hidden="true" className="size-5" /></div>
              <DialogPrimitive.Title className="mt-4 text-xl font-semibold">Detalle de entrega</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">Consulta la programación y el avance operativo sin modificar la entrega.</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="Cerrar detalle de entrega" className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button>
            </DialogPrimitive.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <section className="px-5 py-6 sm:px-7" aria-labelledby="detalle-entrega-resumen">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="font-mono text-xs tracking-[0.08em] text-primary uppercase">Seguimiento de entregas</p><h2 id="detalle-entrega-resumen" className="mt-2 text-lg font-semibold">{entrega.pedidoNumero} · {entrega.clienteNombre}</h2><p className="mt-1 text-sm text-muted-foreground">Guía {entrega.numeroGuiaRemision} · Despacho {entrega.numeroDespacho}</p></div>
                <span className="status-label" data-tone={tonoEstado(entrega.estado)}>{etiquetasEstado[entrega.estado]}</span>
              </div>
              <dl className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-4">
                <div><dt className="text-xs text-muted-foreground">Fecha programada</dt><dd className="mt-1">{formatearFechaDistribucion(entrega.fechaProgramada)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Entrega real</dt><dd className="mt-1">{formatearFechaDistribucion(entrega.fechaEntrega)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Modalidad</dt><dd className="mt-1">{entrega.modalidad === 'recojo_cliente' ? 'Recojo del cliente' : entrega.modalidad === 'movilidad_externa' ? 'Movilidad externa' : 'Movilidad propia'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Transporte</dt><dd className="mt-1">{entrega.tipoTransporte === 'externo' ? 'Externo' : 'Interno'}</dd></div>
              </dl>
            </section>

            <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-entrega-destino">
              <div className="mb-4 border-b pb-3"><h2 id="detalle-entrega-destino" className="font-semibold">Destino y transporte</h2><p className="mt-1 text-sm text-muted-foreground">Datos registrados para la ejecución de la entrega.</p></div>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Dirección de entrega</dt><dd className="mt-1">{entrega.direccionEntrega || 'Sin dirección registrada'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Transportista</dt><dd className="mt-1">{entrega.transportista || 'No aplica o no registrado'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Conductor</dt><dd className="mt-1">{entrega.conductor || 'No registrado'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Vehículo / placa</dt><dd className="mt-1">{[entrega.vehiculo, entrega.placa].filter(Boolean).join(' · ') || 'No registrado'}</dd></div>
              </dl>
            </section>

            <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-entrega-productos">
              <div className="mb-4 border-b pb-3"><h2 id="detalle-entrega-productos" className="font-semibold">Despacho y recepción</h2><p className="mt-1 text-sm text-muted-foreground">Ventas registra la salida de inventario; Distribución registra lo que recibió el cliente y el saldo pendiente.</p></div>
              {entrega.requiereConciliacionCantidades ? <p role="status" className="mb-4 border-s-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">Entrega histórica: el sistema no guardaba cantidades recibidas por producto. No se muestran saldos estimados para evitar datos engañosos.</p> : null}
              <div className="overflow-x-auto border">
                <table className="w-full min-w-[54rem] border-collapse text-left text-sm">
                  <thead><tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase"><th className="px-4 py-3 font-medium">Producto</th><th className="px-4 py-3 text-end font-medium">Pedido</th><th className="px-4 py-3 text-end font-medium">Despachado en Ventas</th><th className="px-4 py-3 text-end font-medium">Recibido por cliente</th><th className="px-4 py-3 text-end font-medium">Saldo de entrega</th></tr></thead>
                  <tbody className="divide-y">{entrega.lineas.map((linea) => <tr key={linea.id}><td className="px-4 py-4"><p className="font-medium">{linea.productoDescripcion}</p><p className="mt-1 text-xs text-muted-foreground">{linea.productoCodigo} · {linea.unidadMedida || 'Sin unidad'}</p></td><td className="px-4 py-4 text-end font-mono tabular-nums">{linea.cantidad} {linea.unidadMedida}</td><td className="px-4 py-4 text-end font-mono tabular-nums">{linea.cantidadDespachada ?? linea.cantidad} {linea.unidadMedida}</td><td className="px-4 py-4 text-end font-mono tabular-nums">{entrega.requiereConciliacionCantidades ? 'Sin conciliar' : `${linea.cantidadEntregadaCliente ?? 0} ${linea.unidadMedida}`}</td><td className="px-4 py-4 text-end font-mono tabular-nums">{entrega.requiereConciliacionCantidades ? 'Sin conciliar' : `${linea.cantidadPendienteCliente ?? 0} ${linea.unidadMedida}`}</td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-entrega-eventos">
              <div className="mb-4 border-b pb-3"><h2 id="detalle-entrega-eventos" className="font-semibold">Historial de resultados</h2><p className="mt-1 text-sm text-muted-foreground">Registro cronológico de recepciones e intentos; la evidencia queda asociada a cada evento.</p></div>
              {!entrega.resultadosEntrega.length ? <p className="border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">Aún no se ha registrado el resultado de la entrega.</p> : <ol className="space-y-3">{entrega.resultadosEntrega.map((evento) => <li key={evento.id} className="border bg-muted/15 px-4 py-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{etiquetasEstado[evento.resultado]}</p><time className="text-sm text-muted-foreground">{formatearFechaDistribucion(evento.fecha)}</time></div>{evento.lineas.length ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{evento.lineas.map((lineaEvento) => { const linea = entrega.lineas.find((item) => item.id === lineaEvento.orderLineId); return <li key={lineaEvento.orderLineId}>{linea?.productoDescripcion ?? 'Producto'}: <span className="font-mono tabular-nums">{lineaEvento.cantidad} {linea?.unidadMedida ?? ''}</span></li> })}</ul> : null}<p className="mt-2 text-xs text-muted-foreground">{evento.evidencia ? `Evidencia: ${evento.evidencia}` : 'Sin evidencia de recepción'}{evento.incidencias.length ? ` · Incidencia: ${evento.incidencias.join(' · ')}` : ''}</p></li>)}</ol>}
            </section>

            <section className="grid gap-6 border-t px-5 py-6 sm:px-7 lg:grid-cols-2" aria-labelledby="detalle-entrega-seguimiento">
              <div><h2 id="detalle-entrega-seguimiento" className="font-semibold">Seguimiento</h2><dl className="mt-3 space-y-3 border bg-muted/20 px-4 py-3 text-sm"><div><dt className="text-xs text-muted-foreground">Evidencia</dt><dd className="mt-1">{entrega.evidencia || 'Sin evidencia registrada'}</dd></div><div><dt className="text-xs text-muted-foreground">Incidencias</dt><dd className="mt-1">{entrega.incidencias.length ? entrega.incidencias.join(' · ') : 'Sin incidencias registradas'}</dd></div></dl></div>
              <div><h2 className="font-semibold">Observaciones</h2><p className="mt-3 min-h-20 border bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">{entrega.observaciones || 'Sin observaciones registradas.'}</p></div>
            </section>
          </div>

          <footer className="flex justify-end border-t px-5 py-4 sm:px-7"><Button type="button" variant="outline" onClick={() => alCambiarApertura(false)}>Cerrar</Button></footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
