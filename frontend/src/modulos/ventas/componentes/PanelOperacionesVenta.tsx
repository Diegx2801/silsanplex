import { ClipboardCheck, PackageCheck, ReceiptText, Truck } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Producto } from '@/modulos/productos/modelo/producto'
import { DialogoDespachoVenta } from '@/modulos/ventas/componentes/DialogoDespachoVenta'
import { DialogoRegistroVenta } from '@/modulos/ventas/componentes/DialogoRegistroVenta'
import { calcularTotalesCotizacion } from '@/modulos/ventas/modelo/cotizacion'
import type {
  DatosDespacho,
  DatosVenta,
  PedidoVenta,
  Venta,
} from '@/modulos/ventas/modelo/operacionVenta'

const formatoMoneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })
const formatoFecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

interface PanelOperacionesVentaProps {
  pedidos: readonly PedidoVenta[]
  ventas: readonly Venta[]
  productos: readonly Producto[]
  alRegistrarVenta: (pedidoId: string, datos: DatosVenta) => string | undefined
  alDespacharVenta: (ventaId: string, datos: DatosDespacho) => string | undefined
  alNotificar: (mensaje: string) => void
}

export function PanelOperacionesVenta({
  pedidos,
  ventas,
  productos,
  alRegistrarVenta,
  alDespacharVenta,
  alNotificar,
}: PanelOperacionesVentaProps) {
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<PedidoVenta | null>(null)
  const [ventaSeleccionada, setVentaSeleccionada] = useState<Venta | null>(null)
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

      {!pedidosOrdenados.length ? (
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
                </div>
                <div className="grid grid-cols-3 gap-3 border-y py-3 text-sm lg:border-y-0 lg:border-s lg:ps-5">
                  <div><p className="text-xs text-muted-foreground">Productos</p><p className="mt-1 font-mono">{pedido.lineas.length}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-mono font-semibold">{formatoMoneda.format(total)}</p></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Documento</p>
                    <p className="mt-1 truncate font-mono text-xs">{venta ? `${venta.serie}-${venta.numeroDocumento}` : 'Pendiente'}</p>
                  </div>
                </div>
                <div className="flex justify-start lg:justify-end">
                  {!venta ? (
                    <Button type="button" onClick={() => setPedidoSeleccionado(pedido)}><ReceiptText aria-hidden="true" /> Registrar venta</Button>
                  ) : venta.estado === 'registrada' ? (
                    <Button type="button" onClick={() => setVentaSeleccionada(venta)}><Truck aria-hidden="true" /> Despachar</Button>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-primary"><PackageCheck aria-hidden="true" className="size-4" /> Stock descontado</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {pedidoSeleccionado ? (
        <DialogoRegistroVenta
          abierto
          pedido={pedidoSeleccionado}
          alCambiarApertura={(abierto) => { if (!abierto) setPedidoSeleccionado(null) }}
          alGuardar={(datos) => {
            const error = alRegistrarVenta(pedidoSeleccionado.id, datos)
            if (!error) alNotificar(`${pedidoSeleccionado.numero}: venta registrada correctamente.`)
            return error
          }}
        />
      ) : null}
      {ventaSeleccionada ? (
        <DialogoDespachoVenta
          abierto
          venta={ventaSeleccionada}
          productos={productos}
          alCambiarApertura={(abierto) => { if (!abierto) setVentaSeleccionada(null) }}
          alConfirmar={(datos) => {
            const error = alDespacharVenta(ventaSeleccionada.id, datos)
            if (!error) alNotificar(`${ventaSeleccionada.numeroInterno}: despacho completado e inventario actualizado.`)
            return error
          }}
        />
      ) : null}
    </section>
  )
}
