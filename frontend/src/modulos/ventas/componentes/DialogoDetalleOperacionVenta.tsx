import { Eye, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import { fechaPeruDesdeTimestamp, formatearFechaCalendarioPeru } from '@/lib/fechas'
import type { PedidoVenta, Venta } from '@/modulos/ventas/modelo/operacionVenta'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})
const formatoCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })
interface DialogoDetalleOperacionVentaProps {
  abierto: boolean
  pedido: PedidoVenta
  venta?: Venta
  alCambiarApertura: (abierto: boolean) => void
  alRestaurarFoco: () => void
}

function fechaPedido(pedido: PedidoVenta) {
  return pedido.fechaPedido ?? fechaPeruDesdeTimestamp(pedido.fechaRegistro)
}

function etiquetaEstado(pedido: PedidoVenta, venta?: Venta) {
  if (pedido.estado === 'cancelado') return 'Pedido cancelado'
  if (!venta) return 'Pedido confirmado'
  if (venta.estado === 'despachada') return 'Completado'
  return 'Venta pendiente de despacho'
}

export function DialogoDetalleOperacionVenta({
  abierto,
  pedido,
  venta,
  alCambiarApertura,
  alRestaurarFoco,
}: DialogoDetalleOperacionVentaProps) {
  const estado = etiquetaEstado(pedido, venta)

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
        <DialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-70 flex max-h-[92svh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <div className="grid size-10 place-items-center rounded-full bg-accent text-primary">
                <Eye aria-hidden="true" className="size-5" />
              </div>
              <DialogPrimitive.Title className="mt-4 text-xl font-semibold">
                Detalle de {pedido.numero}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Consulta el pedido y su cumplimiento sin modificar reservas ni inventario.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar detalle de operación"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <section className="px-5 py-6 sm:px-7" aria-labelledby="detalle-operacion-resumen">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs tracking-[0.08em] text-primary uppercase">Ejecución comercial</p>
                  <h2 id="detalle-operacion-resumen" className="mt-2 text-lg font-semibold">{pedido.clienteNombre}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{pedido.clienteDocumento}</p>
                </div>
                <span className="status-label" data-tone={estado === 'Completado' ? 'listo' : estado === 'Pedido cancelado' ? 'revision' : 'pendiente'}>
                  {estado}
                </span>
              </div>

              <dl className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-6">
                <div><dt className="text-xs text-muted-foreground">Origen</dt><dd className="mt-1 font-mono">{pedido.cotizacionNumero}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Fecha del pedido</dt><dd className="mt-1">{formatearFechaCalendarioPeru(fechaPedido(pedido))}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Almacén</dt><dd className="mt-1">{pedido.almacenNombre ?? 'No definido'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Precios</dt><dd className="mt-1">{pedido.preciosIncluyenIgv ? 'Incluyen IGV' : 'No incluyen IGV'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Modalidad</dt><dd className="mt-1">{pedido.modalidadCumplimiento === 'pickup' ? 'Recojo del cliente' : 'Entrega al cliente'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Estado logístico</dt><dd className="mt-1">{pedido.estadoCumplimiento === 'delivered' ? 'Entregado' : pedido.estadoCumplimiento === 'dispatched' ? 'Despachado' : pedido.estadoCumplimiento === 'partially_fulfilled' ? 'Cumplimiento parcial' : pedido.estadoCumplimiento === 'cancelled' ? 'Cancelado' : 'Pendiente'}</dd></div>
              </dl>
            </section>

            <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-operacion-productos">
              <div className="mb-4 border-b pb-3">
                <h2 id="detalle-operacion-productos" className="font-semibold">Productos del pedido</h2>
                <p className="mt-1 text-sm text-muted-foreground">{pedido.lineas.length} {pedido.lineas.length === 1 ? 'línea' : 'líneas'} comprometidas.</p>
              </div>
              <div className="overflow-x-auto border">
                <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                      <th className="px-4 py-3 font-medium">Producto</th>
                      <th className="px-4 py-3 text-end font-medium">Pedido</th>
                      <th className="px-4 py-3 text-end font-medium">Precio</th>
                      <th className="px-4 py-3 text-end font-medium">Importe</th>
                      <th className="px-4 py-3 font-medium">Cumplimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pedido.lineas.map((linea) => {
                      const lineaVenta = venta?.lineas.find((item) => item.pedidoLineaId === linea.id)
                      const pendiente = lineaVenta?.cantidadPendiente ?? linea.cantidad
                      const cumplida = lineaVenta
                        ? Math.max(lineaVenta.cantidad - pendiente, 0)
                        : 0
                      return (
                        <tr key={linea.id}>
                          <td className="px-4 py-4">
                            <p className="font-medium">{linea.productoDescripcion}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{linea.productoCodigo} · {linea.unidadMedida || 'Sin unidad'}</p>
                          </td>
                          <td className="px-4 py-4 text-end font-mono tabular-nums">{formatoCantidad.format(linea.cantidad)}</td>
                          <td className="px-4 py-4 text-end font-mono tabular-nums">{formatoMoneda.format(linea.precioUnitario)}</td>
                          <td className="px-4 py-4 text-end font-mono font-semibold tabular-nums">{formatoMoneda.format(linea.cantidad * linea.precioUnitario)}</td>
                          <td className="px-4 py-4 text-muted-foreground">
                            {venta ? `${formatoCantidad.format(cumplida)} entregadas · ${formatoCantidad.format(pendiente)} pendientes` : 'Pendiente de venta'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-6 border-t px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div>
                <h2 className="font-semibold">Venta relacionada</h2>
                <div className="mt-3 border bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
                  {venta ? (
                    <dl className="grid gap-2 sm:grid-cols-3">
                      <div><dt className="text-xs">Comprobante</dt><dd className="font-mono text-foreground">{venta.serie}-{venta.numeroDocumento}</dd></div>
                      <div><dt className="text-xs">Fecha</dt><dd className="text-foreground">{formatearFechaCalendarioPeru(venta.fechaVenta)}</dd></div>
                      <div><dt className="text-xs">Estado</dt><dd className="text-foreground">{venta.estado === 'despachada' ? 'Despachada' : 'Registrada'}</dd></div>
                    </dl>
                  ) : 'Todavía no se ha registrado una venta para este pedido.'}
                </div>
              </div>
              <dl className="border px-4 py-4 text-sm">
                <div className="flex justify-between gap-4 border-b py-2"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-mono tabular-nums">{formatoMoneda.format(pedido.subtotal)}</dd></div>
                <div className="flex justify-between gap-4 border-b py-2"><dt className="text-muted-foreground">IGV</dt><dd className="font-mono tabular-nums">{formatoMoneda.format(pedido.igv)}</dd></div>
                <div className="flex justify-between gap-4 pt-3 font-semibold"><dt>Total</dt><dd className="font-mono tabular-nums">{formatoMoneda.format(pedido.total)}</dd></div>
              </dl>
            </section>
          </div>

          <footer className="flex justify-end border-t px-5 py-4 sm:px-7">
            <Button type="button" variant="outline" onClick={() => alCambiarApertura(false)}>Cerrar</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
