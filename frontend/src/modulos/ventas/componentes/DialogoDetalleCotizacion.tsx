import { Eye, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import {
  calcularTotalesCotizacion,
  type Cotizacion,
  type EstadoCotizacion,
} from '@/modulos/ventas/modelo/cotizacion'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})
const formatoCantidad = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 4,
})
const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const etiquetasEstado: Record<EstadoCotizacion | 'vencida', string> = {
  borrador: 'Borrador',
  emitida: 'Emitida',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
}

const etiquetasAfectacion = {
  gravado: 'Gravado',
  exonerado: 'Exonerado',
  inafecto: 'Inafecto',
  'por-definir': 'Por definir',
} as const

interface DialogoDetalleCotizacionProps {
  abierto: boolean
  cotizacion: Cotizacion
  alCambiarApertura: (abierto: boolean) => void
  alRestaurarFoco: () => void
}

function fechaLocal(fecha: string) {
  return formatoFecha.format(new Date(`${fecha}T12:00:00`))
}

function estadoCotizacion(cotizacion: Cotizacion): 'borrador' | 'emitida' | 'aceptada' | 'rechazada' | 'vencida' {
  const hoy = new Date().toISOString().slice(0, 10)
  return cotizacion.estado === 'emitida' && cotizacion.fechaValidez < hoy
    ? 'vencida'
    : cotizacion.estado
}

export function DialogoDetalleCotizacion({
  abierto,
  cotizacion,
  alCambiarApertura,
  alRestaurarFoco,
}: DialogoDetalleCotizacionProps) {
  const totales = calcularTotalesCotizacion(
    cotizacion.lineas,
    cotizacion.preciosIncluyenIgv,
  )
  const estado = estadoCotizacion(cotizacion)

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
              <DialogPrimitive.Title className="mt-4 text-xl font-semibold tracking-[-0.025em]">
                Detalle de {cotizacion.numero}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Consulta la propuesta comercial sin modificarla ni reservar inventario.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar detalle de cotización"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <section aria-labelledby="detalle-cotizacion-resumen" className="px-5 py-6 sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs tracking-[0.08em] text-primary uppercase">
                    Cotización comercial
                  </p>
                  <h2 id="detalle-cotizacion-resumen" className="mt-2 text-lg font-semibold">
                    {cotizacion.clienteNombre}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {cotizacion.clienteDocumento}
                  </p>
                </div>
                <span
                  className="status-label"
                  data-tone={estado === 'emitida' || estado === 'aceptada' ? 'listo' : 'revision'}
                >
                  {etiquetasEstado[estado]}
                </span>
              </div>

              <dl className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Emisión</dt>
                  <dd className="mt-1">{fechaLocal(cotizacion.fechaEmision)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Válida hasta</dt>
                  <dd className="mt-1">{fechaLocal(cotizacion.fechaValidez)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Precios</dt>
                  <dd className="mt-1">{cotizacion.preciosIncluyenIgv ? 'Incluyen IGV' : 'No incluyen IGV'}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="detalle-cotizacion-productos" className="border-t px-5 py-6 sm:px-7">
              <div className="mb-4 border-b pb-3">
                <h2 id="detalle-cotizacion-productos" className="font-semibold">Productos cotizados</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {cotizacion.lineas.length} {cotizacion.lineas.length === 1 ? 'línea' : 'líneas'} en la propuesta.
                </p>
              </div>
              <div className="overflow-x-auto border">
                <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                      <th className="px-4 py-3 font-medium">Producto</th>
                      <th className="px-4 py-3 text-end font-medium">Cantidad</th>
                      <th className="px-4 py-3 text-end font-medium">Precio unitario</th>
                      <th className="px-4 py-3 text-end font-medium">Importe</th>
                      <th className="px-4 py-3 font-medium">IGV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cotizacion.lineas.map((linea) => (
                      <tr key={linea.id}>
                        <td className="px-4 py-4">
                          <p className="font-medium">{linea.productoDescripcion}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {linea.productoCodigo} · {linea.unidadMedida || 'Sin unidad'}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-end font-mono tabular-nums">
                          {formatoCantidad.format(linea.cantidad)}
                        </td>
                        <td className="px-4 py-4 text-end font-mono tabular-nums">
                          {formatoMoneda.format(linea.precioUnitario)}
                        </td>
                        <td className="px-4 py-4 text-end font-mono font-semibold tabular-nums">
                          {formatoMoneda.format(linea.cantidad * linea.precioUnitario)}
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {etiquetasAfectacion[linea.afectacionIgv ?? 'gravado']}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-6 border-t px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div>
                <h2 className="font-semibold">Observaciones</h2>
                <p className="mt-3 min-h-24 border bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
                  {cotizacion.observacion || 'Sin observaciones registradas.'}
                </p>
              </div>
              <dl className="border px-4 py-4 text-sm">
                <div className="flex justify-between gap-4 border-b py-2">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-mono tabular-nums">{formatoMoneda.format(totales.subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b py-2">
                  <dt className="text-muted-foreground">IGV</dt>
                  <dd className="font-mono tabular-nums">{formatoMoneda.format(totales.igv)}</dd>
                </div>
                <div className="flex justify-between gap-4 pt-3 font-semibold">
                  <dt>Total</dt>
                  <dd className="font-mono tabular-nums">{formatoMoneda.format(totales.total)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <footer className="flex justify-end border-t px-5 py-4 sm:px-7">
            <Button type="button" variant="outline" onClick={() => alCambiarApertura(false)}>
              Cerrar
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
