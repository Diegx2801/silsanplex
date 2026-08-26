import { MapPin, PackageCheck, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import {
  esquemaDatosEntrega,
  fechaLocalISO,
  type DatosEntrega,
  type PedidoFuenteDistribucion,
  type ProgramacionEntrega,
} from '@/modulos/distribucion/modelo/programacionEntrega'

interface DialogoProgramarEntregaProps {
  pedidoInicial: PedidoFuenteDistribucion
  entrega?: ProgramacionEntrega
  saldoLinea: (pedidoId: string, lineaId: string, entregaId?: string) => number
  guardando: boolean
  alCerrar: () => void
  alGuardar: (datos: DatosEntrega, id?: string) => Promise<void>
}

function datosIniciales(
  pedido: PedidoFuenteDistribucion,
  saldoLinea: DialogoProgramarEntregaProps['saldoLinea'],
  entrega?: ProgramacionEntrega,
): DatosEntrega {
  return {
    pedido,
    fechaEntrega: entrega?.fechaEntrega ?? fechaLocalISO(),
    numeroGuiaRemision: entrega?.numeroGuiaRemision ?? '',
    tipoTransporte: entrega?.tipoTransporte ?? 'interno',
    transportistaNombre: entrega?.transportistaNombre ?? '',
    transportistaDocumento: entrega?.transportistaDocumento ?? '',
    conductorNombre: entrega?.conductorNombre ?? '',
    conductorDocumento: entrega?.conductorDocumento ?? '',
    conductorLicencia: entrega?.conductorLicencia ?? '',
    vehiculoPlaca: entrega?.vehiculoPlaca ?? '',
    direccionEntrega: entrega?.direccionEntrega ?? pedido.direccionEntrega,
    referenciaEntrega: entrega?.referenciaEntrega ?? pedido.referenciaEntrega,
    contactoNombre: entrega?.contactoNombre ?? pedido.contactoNombre,
    contactoTelefono: entrega?.contactoTelefono ?? pedido.contactoTelefono,
    observaciones: entrega?.observaciones ?? '',
    lineas: pedido.lineas
      .map((linea) => {
        const actual = entrega?.lineas.find((item) => item.fuenteLineaId === linea.id)
        const saldo = saldoLinea(pedido.id, linea.id, entrega?.id)
        return {
          fuenteLineaId: linea.id,
          cantidad: actual?.cantidadEnviada ?? saldo,
          lote: actual?.lote ?? '',
          fechaVencimiento: actual?.fechaVencimiento ?? '',
        }
      })
      .filter((linea) => linea.cantidad > 0),
  }
}

export function DialogoProgramarEntrega({
  pedidoInicial,
  entrega,
  saldoLinea,
  guardando,
  alCerrar,
  alGuardar,
}: DialogoProgramarEntregaProps) {
  const [datos, setDatos] = useState(() => datosIniciales(pedidoInicial, saldoLinea, entrega))
  const [error, setError] = useState('')

  const actualizarLinea = (fuenteLineaId: string, campo: 'cantidad' | 'lote' | 'fechaVencimiento', valor: string) => {
    setDatos((actuales) => ({
      ...actuales,
      lineas: actuales.lineas.map((linea) => linea.fuenteLineaId === fuenteLineaId
        ? { ...linea, [campo]: campo === 'cantidad' ? Number(valor) : valor }
        : linea),
    }))
  }

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    const resultado = esquemaDatosEntrega.safeParse(datos)
    if (!resultado.success) {
      setError(resultado.error.issues[0]?.message ?? 'Revisa los datos de la entrega')
      return
    }
    try {
      setError('')
      await alGuardar(resultado.data, entrega?.id)
    } catch (problema) {
      setError(problema instanceof Error ? problema.message : 'No se pudo guardar la entrega')
    }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(abierto) => { if (!abierto) alCerrar() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content className="fixed inset-y-0 end-0 z-50 flex w-full max-w-4xl flex-col border-s bg-background shadow-2xl outline-none">
          <header className="flex items-start justify-between gap-5 border-b px-5 py-5 sm:px-7">
            <div>
              <p className="font-mono text-[0.68rem] tracking-[0.08em] text-primary uppercase">Hoja de ruta · {pedidoInicial.numero}</p>
              <DialogPrimitive.Title className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                {entrega ? 'Editar programación' : 'Programar entrega'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Define destino, transporte y cantidades de este despacho. Las cantidades pendientes podrán salir en entregas posteriores.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="Cerrar programación" className="grid size-10 place-items-center rounded-md hover:bg-muted">
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-7">
              <section className="grid gap-4 border-b pb-7 sm:grid-cols-2" aria-labelledby="destino-entrega-title">
                <div className="sm:col-span-2 flex items-center gap-2">
                  <MapPin aria-hidden="true" className="size-4 text-primary" />
                  <h3 id="destino-entrega-title" className="font-semibold">Destino y contacto</h3>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="direccion-entrega" className="field-label">Dirección de entrega *</label>
                  <input id="direccion-entrega" required className="field-control" value={datos.direccionEntrega} onChange={(e) => setDatos({ ...datos, direccionEntrega: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="referencia-entrega" className="field-label">Referencia</label>
                  <input id="referencia-entrega" className="field-control" value={datos.referenciaEntrega} onChange={(e) => setDatos({ ...datos, referenciaEntrega: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="contacto-entrega" className="field-label">Contacto receptor</label>
                  <input id="contacto-entrega" className="field-control" value={datos.contactoNombre} onChange={(e) => setDatos({ ...datos, contactoNombre: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="telefono-entrega" className="field-label">Teléfono</label>
                  <input id="telefono-entrega" className="field-control" value={datos.contactoTelefono} onChange={(e) => setDatos({ ...datos, contactoTelefono: e.target.value })} />
                </div>
              </section>

              <section className="grid gap-4 border-b pb-7 sm:grid-cols-2" aria-labelledby="transporte-entrega-title">
                <div className="sm:col-span-2 flex items-center gap-2">
                  <Truck aria-hidden="true" className="size-4 text-primary" />
                  <h3 id="transporte-entrega-title" className="font-semibold">Transporte y guía</h3>
                </div>
                <div>
                  <label htmlFor="fecha-entrega" className="field-label">Fecha programada *</label>
                  <input id="fecha-entrega" required min={fechaLocalISO()} type="date" className="field-control" value={datos.fechaEntrega} onChange={(e) => setDatos({ ...datos, fechaEntrega: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="guia-entrega" className="field-label">Guía de remisión *</label>
                  <input id="guia-entrega" required className="field-control uppercase" value={datos.numeroGuiaRemision} onChange={(e) => setDatos({ ...datos, numeroGuiaRemision: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="tipo-transporte" className="field-label">Tipo de transporte</label>
                  <select id="tipo-transporte" className="field-control" value={datos.tipoTransporte} onChange={(e) => setDatos({ ...datos, tipoTransporte: e.target.value as DatosEntrega['tipoTransporte'] })}>
                    <option value="interno">Interno · Movilidad SILSAN</option>
                    <option value="externo">Externo · Tercero</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="placa-entrega" className="field-label">Placa *</label>
                  <input id="placa-entrega" required className="field-control uppercase" value={datos.vehiculoPlaca} onChange={(e) => setDatos({ ...datos, vehiculoPlaca: e.target.value })} />
                </div>
                {datos.tipoTransporte === 'externo' ? (
                  <>
                    <div>
                      <label htmlFor="transportista-entrega" className="field-label">Transportista *</label>
                      <input id="transportista-entrega" required className="field-control" value={datos.transportistaNombre} onChange={(e) => setDatos({ ...datos, transportistaNombre: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="documento-transportista" className="field-label">RUC / documento</label>
                      <input id="documento-transportista" className="field-control" value={datos.transportistaDocumento} onChange={(e) => setDatos({ ...datos, transportistaDocumento: e.target.value })} />
                    </div>
                  </>
                ) : null}
                <div>
                  <label htmlFor="conductor-entrega" className="field-label">Conductor *</label>
                  <input id="conductor-entrega" required className="field-control" value={datos.conductorNombre} onChange={(e) => setDatos({ ...datos, conductorNombre: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="documento-conductor" className="field-label">Documento del conductor</label>
                  <input id="documento-conductor" className="field-control" value={datos.conductorDocumento} onChange={(e) => setDatos({ ...datos, conductorDocumento: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="licencia-conductor" className="field-label">Licencia</label>
                  <input id="licencia-conductor" className="field-control uppercase" value={datos.conductorLicencia} onChange={(e) => setDatos({ ...datos, conductorLicencia: e.target.value })} />
                </div>
              </section>

              <section className="space-y-4" aria-labelledby="productos-entrega-title">
                <div className="flex items-center gap-2">
                  <PackageCheck aria-hidden="true" className="size-4 text-primary" />
                  <h3 id="productos-entrega-title" className="font-semibold">Productos del despacho</h3>
                </div>
                <div className="divide-y border">
                  {datos.lineas.map((linea) => {
                    const producto = pedidoInicial.lineas.find((item) => item.id === linea.fuenteLineaId)
                    const maximo = saldoLinea(pedidoInicial.id, linea.fuenteLineaId, entrega?.id)
                    if (!producto) return null
                    return (
                      <div key={linea.fuenteLineaId} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_8rem_9rem_10rem] md:items-end">
                        <div>
                          <p className="font-mono text-xs text-primary">{producto.productoCodigo}</p>
                          <p className="mt-1 text-sm font-medium">{producto.productoDescripcion}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Pedido: {producto.cantidadOrdenada} {producto.unidadMedida} · Disponible: {maximo}</p>
                        </div>
                        <div>
                          <label className="field-label" htmlFor={`cantidad-${linea.fuenteLineaId}`}>Cantidad</label>
                          <input id={`cantidad-${linea.fuenteLineaId}`} required min="0.001" max={maximo} step="0.001" type="number" className="field-control" value={linea.cantidad} onChange={(e) => actualizarLinea(linea.fuenteLineaId, 'cantidad', e.target.value)} />
                        </div>
                        <div>
                          <label className="field-label" htmlFor={`lote-${linea.fuenteLineaId}`}>Lote</label>
                          <input id={`lote-${linea.fuenteLineaId}`} className="field-control" value={linea.lote} onChange={(e) => actualizarLinea(linea.fuenteLineaId, 'lote', e.target.value)} />
                        </div>
                        <div>
                          <label className="field-label" htmlFor={`vence-${linea.fuenteLineaId}`}>Vencimiento</label>
                          <input id={`vence-${linea.fuenteLineaId}`} type="date" className="field-control" value={linea.fechaVencimiento} onChange={(e) => actualizarLinea(linea.fuenteLineaId, 'fechaVencimiento', e.target.value)} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div>
                  <label htmlFor="observaciones-entrega" className="field-label">Observaciones</label>
                  <textarea id="observaciones-entrega" rows={3} className="field-control" value={datos.observaciones} onChange={(e) => setDatos({ ...datos, observaciones: e.target.value })} />
                </div>
              </section>
            </div>

            <footer className="border-t bg-background px-5 py-4 sm:px-7">
              <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={alCerrar}>Cancelar</Button>
                <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : entrega ? 'Guardar cambios' : 'Programar entrega'}</Button>
              </div>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
