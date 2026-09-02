import { Ban, ClipboardCheck, PackageCheck, Pencil, ReceiptText } from 'lucide-react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DialogoDespachoPersistente } from '@/modulos/ventas/componentes/DialogoDespachoPersistente'
import { DialogoModificacionPedido } from '@/modulos/ventas/componentes/DialogoModificacionPedido'
import { DialogoRegistroVenta } from '@/modulos/ventas/componentes/DialogoRegistroVenta'
import { calcularTotalesCotizacion } from '@/modulos/ventas/modelo/cotizacion'
import type {
  DatosVenta,
  PedidoVenta,
  Venta,
} from '@/modulos/ventas/modelo/operacionVenta'
import type { CantidadLineaPedido } from '@/modulos/ventas/servicios/ventasService'
import type { CantidadDespacho } from '@/modulos/ventas/servicios/ventasService'

const formatoMoneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })
const formatoFecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

interface PanelOperacionesVentaProps {
  pedidos: readonly PedidoVenta[]
  ventas: readonly Venta[]
  alRegistrarVenta?: (pedidoId: string, datos: DatosVenta) => string | undefined | Promise<string | undefined>
  alActualizarPedido?: (pedidoId: string, lineas: readonly CantidadLineaPedido[], operationKey: string) => string | undefined | Promise<string | undefined>
  alCancelarPedido?: (pedidoId: string, operationKey: string) => string | undefined | Promise<string | undefined>
  alDespacharVenta?: (pedidoId: string, ventaId: string, lineas: readonly CantidadDespacho[], operationKey: string, operationDate: string) => string | undefined | Promise<string | undefined>
  alNotificar: (mensaje: string) => void
  cargando?: boolean
  error?: unknown
  alReintentar?: () => Promise<unknown>
  actualizandoPedido?: boolean
  cancelandoPedido?: boolean
  despachandoVenta?: boolean
}

export function PanelOperacionesVenta({
  pedidos,
  ventas,
  alRegistrarVenta,
  alActualizarPedido,
  alCancelarPedido,
  alDespacharVenta,
  alNotificar,
  cargando = false,
  error,
  alReintentar,
  actualizandoPedido = false,
  cancelandoPedido = false,
  despachandoVenta = false,
}: PanelOperacionesVentaProps) {
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<PedidoVenta | null>(null)
  const [pedidoPorModificar, setPedidoPorModificar] = useState<PedidoVenta | null>(null)
  const [pedidoPorCancelar, setPedidoPorCancelar] = useState<PedidoVenta | null>(null)
  const [errorCancelacion, setErrorCancelacion] = useState('')
  const [ventaPorDespachar, setVentaPorDespachar] = useState<Venta | null>(null)
  const claveCancelacion = useRef<string | null>(null)
  const ventasPorPedido = new Map(ventas.map((venta) => [venta.pedidoId, venta]))
  const pedidosOrdenados = pedidos.toSorted((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro))

  return (
    <section aria-labelledby="operaciones-venta-title" className="ledger-sheet">
      <div className="flex flex-col gap-3 border-b px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <span className="font-mono text-[0.68rem] tracking-[0.06em] text-primary uppercase">Ejecución comercial</span>
          <h2 id="operaciones-venta-title" className="mt-1 text-lg font-semibold">Pedidos, ventas y despachos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cada etapa conserva el documento que le dio origen.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="border px-2.5 py-1.5">{pedidos.length} pedidos</span>
          <span className="border px-2.5 py-1.5">{ventas.filter((item) => item.estado === 'registrada').length} por despachar</span>
          <span className="border px-2.5 py-1.5">{ventas.filter((item) => item.estado === 'despachada').length} despachadas</span>
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-s-4 border-destructive bg-destructive/10 px-5 py-5 sm:px-6">
          <p className="text-sm">No se pudieron cargar los pedidos o ventas persistentes.</p>
          {alReintentar ? <Button type="button" variant="outline" onClick={() => void alReintentar()}>Reintentar</Button> : null}
        </div>
      ) : cargando ? (
        <p className="px-5 py-8 text-sm text-muted-foreground sm:px-6">Cargando operaciones comerciales…</p>
      ) : !pedidosOrdenados.length ? (
        <div className="px-5 py-14 text-center sm:px-6">
          <ClipboardCheck aria-hidden="true" className="mx-auto size-8 text-primary" />
          <h3 className="mt-4 font-semibold">Todavía no hay pedidos</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Emite una cotización y usa “Crear pedido” para iniciar el flujo operativo.</p>
        </div>
      ) : (
        <div className="divide-y">
          {pedidosOrdenados.map((pedido) => {
            const venta = ventasPorPedido.get(pedido.id)
            const total = calcularTotalesCotizacion(pedido.lineas, pedido.preciosIncluyenIgv).total
            return (
              <article key={pedido.id} className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(15rem,1fr)_minmax(20rem,1.35fr)_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs text-primary">{pedido.numero}</p>
                    <span className="status-label" data-tone={pedido.estado === 'atendido' ? 'listo' : 'revision'}>{pedido.estado}</span>
                  </div>
                  <h3 className="mt-2 font-semibold">{pedido.clienteNombre}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Origen: {pedido.cotizacionNumero} · {formatoFecha.format(new Date(pedido.fechaRegistro))}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Almacén: {pedido.almacenNombre ?? 'No definido (histórico)'}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 border-y py-3 text-sm lg:border-y-0 lg:border-s lg:ps-5">
                  <div><p className="text-xs text-muted-foreground">Productos</p><p className="mt-1 font-mono">{pedido.lineas.length}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-mono font-semibold">{formatoMoneda.format(total)}</p></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Documento</p>
                    <p className="mt-1 truncate font-mono text-xs">{venta ? `${venta.serie}-${venta.numeroDocumento}` : 'Pendiente'}</p>
                    {venta ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Despachado {venta.lineas.reduce((totalLinea, linea) => totalLinea + (linea.cantidadDespachada ?? 0), 0)} · pendiente {venta.lineas.reduce((totalLinea, linea) => totalLinea + (linea.cantidadPendiente ?? linea.cantidad), 0)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex justify-start lg:justify-end">
                  {!venta && pedido.estado === 'confirmado' ? (
                    alRegistrarVenta ? (
                      <Button type="button" onClick={() => setPedidoSeleccionado(pedido)}><ReceiptText aria-hidden="true" /> Registrar venta</Button>
                    ) : <span className="text-sm font-medium text-muted-foreground">Solo consulta</span>
                  ) : venta?.estado === 'registrada' ? (
                    alDespacharVenta ? (
                      <Button
                        type="button"
                        disabled={despachandoVenta || venta.lineas.every((linea) => (linea.cantidadPendiente ?? linea.cantidad) <= 0)}
                        onClick={() => setVentaPorDespachar(venta)}
                      >
                        <PackageCheck aria-hidden="true" /> Despachar venta
                      </Button>
                    ) : <Button type="button" disabled title="El despacho canónico requiere configuración"> <PackageCheck aria-hidden="true" /> Despacho pendiente</Button>
                  ) : venta?.estado === 'despachada' ? (
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-primary"><PackageCheck aria-hidden="true" className="size-4" /> Stock descontado</span>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">Pedido cancelado</span>
                  )}
                </div>
                {!venta && pedido.estado === 'confirmado' && (alActualizarPedido || alCancelarPedido) ? (
                  <div className="flex flex-wrap gap-2 lg:col-start-3 lg:justify-end">
                    {alActualizarPedido ? (
                      <Button type="button" variant="outline" size="sm" disabled={actualizandoPedido || cancelandoPedido} onClick={() => setPedidoPorModificar(pedido)}>
                        <Pencil aria-hidden="true" /> Modificar cantidades
                      </Button>
                    ) : null}
                    {alCancelarPedido ? (
                      <Button type="button" variant="destructive" size="sm" disabled={actualizandoPedido || cancelandoPedido} onClick={() => { claveCancelacion.current = crypto.randomUUID(); setErrorCancelacion(''); setPedidoPorCancelar(pedido) }}>
                        <Ban aria-hidden="true" /> Cancelar pedido
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}

      {pedidoSeleccionado && alRegistrarVenta ? (
        <DialogoRegistroVenta
          abierto
          pedido={pedidoSeleccionado}
          alCambiarApertura={(abierto) => { if (!abierto) setPedidoSeleccionado(null) }}
          alGuardar={async (datos) => {
            const error = await alRegistrarVenta!(pedidoSeleccionado.id, datos)
            if (!error) alNotificar(`${pedidoSeleccionado.numero}: venta registrada correctamente.`)
            return error
          }}
        />
      ) : null}

      {pedidoPorModificar && alActualizarPedido ? (
        <DialogoModificacionPedido
          abierto
          pedido={pedidoPorModificar}
          guardando={actualizandoPedido}
          alCambiarApertura={(abierto) => { if (!abierto && !actualizandoPedido) setPedidoPorModificar(null) }}
          alGuardar={async (lineas, operationKey) => {
            const error = await alActualizarPedido(pedidoPorModificar.id, lineas, operationKey)
            if (!error) {
              alNotificar(`${pedidoPorModificar.numero}: cantidades actualizadas correctamente.`)
            }
            return error
          }}
        />
      ) : null}

      {ventaPorDespachar && alDespacharVenta ? (
        <DialogoDespachoPersistente
          abierto
          venta={ventaPorDespachar}
          guardando={despachandoVenta}
          alCambiarApertura={(abierto) => { if (!abierto && !despachandoVenta) setVentaPorDespachar(null) }}
          alGuardar={async (lineas, operationKey, operationDate) => {
            const error = await alDespacharVenta(ventaPorDespachar.pedidoId, ventaPorDespachar.id, lineas, operationKey, operationDate)
            if (!error) {
              alNotificar(`${ventaPorDespachar.numeroInterno}: despacho registrado y stock actualizado.`)
            }
            return error
          }}
        />
      ) : null}

      {pedidoPorCancelar && alCancelarPedido ? (
        <AlertDialogPrimitive.Root open onOpenChange={(abierto) => { if (!abierto && !cancelandoPedido) setPedidoPorCancelar(null) }}>
          <AlertDialogPrimitive.Portal>
            <AlertDialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
            <AlertDialogPrimitive.Content className="fixed start-1/2 top-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background p-5 shadow-xl outline-none sm:p-6">
              <div className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive"><Ban aria-hidden="true" className="size-5" /></div>
              <AlertDialogPrimitive.Title className="mt-5 text-xl font-semibold">Cancelar {pedidoPorCancelar.numero}</AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                Se liberarán sus reservas pendientes y no se descontará stock físico. Esta acción no se puede deshacer.
              </AlertDialogPrimitive.Description>
              {errorCancelacion ? <p role="alert" className="mt-5 border-s-4 border-destructive bg-destructive/10 px-4 py-3 text-sm">{errorCancelacion}</p> : null}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialogPrimitive.Cancel asChild><Button type="button" variant="outline" disabled={cancelandoPedido}>Conservar pedido</Button></AlertDialogPrimitive.Cancel>
                <AlertDialogPrimitive.Action asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={cancelandoPedido}
                    onClick={async () => {
                      const error = await alCancelarPedido(pedidoPorCancelar.id, claveCancelacion.current ?? crypto.randomUUID())
                      if (error) {
                        setErrorCancelacion(error)
                        return
                      }
                      alNotificar(`${pedidoPorCancelar.numero}: pedido cancelado y reservas liberadas.`)
                      setPedidoPorCancelar(null)
                    }}
                  >
                    {cancelandoPedido ? 'Cancelando…' : 'Confirmar cancelación'}
                  </Button>
                </AlertDialogPrimitive.Action>
              </div>
            </AlertDialogPrimitive.Content>
          </AlertDialogPrimitive.Portal>
        </AlertDialogPrimitive.Root>
      ) : null}
    </section>
  )
}
