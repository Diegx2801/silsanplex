import { BarChart3, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDesempenoProveedor } from '@/modulos/proveedores/estado/useDesempenoProveedor'
import type { PeriodoDesempenoProveedor } from '@/modulos/proveedores/modelo/desempenoProveedor'

interface Props {
  proveedorId: string
  abierto: boolean
}

const periodos: Array<{ valor: PeriodoDesempenoProveedor; etiqueta: string }> = [
  { valor: '30d', etiqueta: 'Ultimos 30 dias' },
  { valor: '90d', etiqueta: 'Ultimos 90 dias' },
  { valor: '6m', etiqueta: 'Ultimos 6 meses' },
  { valor: '1y', etiqueta: 'Ultimo ano' },
  { valor: 'all', etiqueta: 'Historico completo' },
]

const formatoNumero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 })

function numero(valor: number | null): string {
  return valor === null ? 'N/D' : formatoNumero.format(valor)
}

function porcentaje(valor: number | null): string {
  return valor === null ? 'N/D' : `${formatoNumero.format(valor)} %`
}

function Metric({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return <div><dt className="font-mono text-[0.68rem] uppercase text-muted-foreground">{etiqueta}</dt><dd className="mt-1 text-sm font-medium tabular-nums">{valor}</dd>{nota ? <p className="mt-1 text-xs text-muted-foreground">{nota}</p> : null}</div>
}

function SeccionIndicadores({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section className="rounded-md border bg-muted/10 p-4"><h3 className="font-medium">{titulo}</h3><dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl></section>
}

export function ResumenDesempenoProveedor({ proveedorId, abierto }: Props) {
  const desempeno = useDesempenoProveedor({ proveedorId, habilitado: abierto })
  if (!desempeno.puedeConsultar) return null

  return <section className="border-t pt-6" aria-labelledby="desempeno-operativo-proveedor">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 id="desempeno-operativo-proveedor" className="flex items-center gap-2 font-semibold"><BarChart3 aria-hidden="true" className="size-4 text-primary" />Desempeno operativo</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Indicadores descriptivos calculados con ordenes de bienes fisicos, recepciones y devoluciones registradas. No es una recomendacion ni un score.</p>
      </div>
      <label className="flex shrink-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Periodo<select aria-label="Periodo del desempeno operativo" value={desempeno.periodo} onChange={(evento) => desempeno.cambiarPeriodo(evento.target.value as PeriodoDesempenoProveedor)} className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground">{periodos.map((periodo) => <option key={periodo.valor} value={periodo.valor}>{periodo.etiqueta}</option>)}</select></label>
    </div>

    {desempeno.cargando ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Cargando desempeno operativo...</p> : null}
    {desempeno.error ? <p role="alert" className="mt-5 text-sm text-destructive">{desempeno.error instanceof Error ? desempeno.error.message : 'No se pudo cargar el desempeno operativo.'}</p> : null}
    {!desempeno.cargando && !desempeno.error && !desempeno.resumen ? <p className="mt-5 text-sm text-muted-foreground">No hay ordenes de bienes fisicos para el periodo seleccionado.</p> : null}

    {desempeno.resumen ? <div className="mt-5 space-y-4">
      <p className="text-sm text-muted-foreground">Muestra: <span className="font-medium text-foreground">{desempeno.resumen.sampleSize} {desempeno.resumen.sampleSize === 1 ? 'orden' : 'ordenes'}</span></p>
      <SeccionIndicadores titulo="Compras y cantidades">
        <Metric etiqueta="Ordenes consideradas" valor={numero(desempeno.resumen.totalOrders)} />
        <Metric etiqueta="Ordenes recibidas" valor={numero(desempeno.resumen.receivedOrders)} />
        <Metric etiqueta="Ordenes actualmente parciales" valor={numero(desempeno.resumen.partiallyReceivedOrders)} />
        <Metric etiqueta="Ordenes cerradas parciales" valor={numero(desempeno.resumen.closedPartialOrders)} nota="Categoria separada; no implica incumplimiento confirmado." />
        <Metric etiqueta="Lineas completas" valor={numero(desempeno.resumen.completeLines)} />
        <Metric etiqueta="Lineas incompletas" valor={numero(desempeno.resumen.incompleteLines)} />
        <Metric etiqueta="Sobre-recepciones" valor={numero(desempeno.resumen.overReceivedLines)} />
        <Metric etiqueta="Cantidad ordenada" valor={desempeno.resumen.totalOrderedQuantity === null ? 'N/D' : `${numero(desempeno.resumen.totalOrderedQuantity)} ${desempeno.resumen.quantityUnit ?? ''}`} nota={desempeno.resumen.quantityDimensions > 1 ? 'Hay unidades incompatibles; se muestran conteos de lineas y ordenes.' : undefined} />
        <Metric etiqueta="Cantidad recibida" valor={desempeno.resumen.totalReceivedQuantity === null ? 'N/D' : `${numero(desempeno.resumen.totalReceivedQuantity)} ${desempeno.resumen.quantityUnit ?? ''}`} />
        <Metric etiqueta="Cumplimiento agregado" valor={porcentaje(desempeno.resumen.fulfillmentPercentage)} />
      </SeccionIndicadores>
      <SeccionIndicadores titulo="Entregas">
        <Metric etiqueta="Primera recepcion promedio" valor={desempeno.resumen.avgDaysToFirstReceipt === null ? 'N/D' : `${numero(desempeno.resumen.avgDaysToFirstReceipt)} dias`} nota={`Muestra: ${desempeno.resumen.firstReceiptSampleSize} ordenes`} />
        <Metric etiqueta="Ultima recepcion promedio" valor={desempeno.resumen.avgDaysToLastReceipt === null ? 'N/D' : `${numero(desempeno.resumen.avgDaysToLastReceipt)} dias`} nota={`Muestra: ${desempeno.resumen.lastReceiptSampleSize} ordenes`} />
        <Metric etiqueta="Recepcion completa promedio" valor={desempeno.resumen.avgDaysToComplete === null ? 'N/D' : `${numero(desempeno.resumen.avgDaysToComplete)} dias`} nota={`Muestra: ${desempeno.resumen.completeDeliverySampleSize} ordenes recibidas`} />
        <Metric etiqueta="Ordenes con fecha prometida" valor={numero(desempeno.resumen.ordersWithExpectedDelivery)} />
        <Metric etiqueta="Entregas a tiempo" valor={desempeno.resumen.ordersWithExpectedDelivery ? `${desempeno.resumen.onTimeOrders} de ${desempeno.resumen.ordersWithExpectedDelivery}` : 'Sin muestra'} />
        <Metric etiqueta="Entregas retrasadas" valor={desempeno.resumen.ordersWithExpectedDelivery ? `${desempeno.resumen.lateOrders} de ${desempeno.resumen.ordersWithExpectedDelivery}` : 'Sin muestra'} nota={desempeno.resumen.onTimePercentage === null ? undefined : `Puntualidad: ${porcentaje(desempeno.resumen.onTimePercentage)}`} />
      </SeccionIndicadores>
      <SeccionIndicadores titulo="Devoluciones registradas">
        <Metric etiqueta="Devoluciones completadas" valor={numero(desempeno.resumen.completedReturnsCount)} />
        <Metric etiqueta="Productos afectados" valor={numero(desempeno.resumen.returnedProductCount)} />
        <Metric etiqueta="Cantidad devuelta" valor={desempeno.resumen.returnedQuantity === null ? 'N/D' : `${numero(desempeno.resumen.returnedQuantity)} ${desempeno.resumen.returnedQuantityUnit ?? ''}`} />
        <Metric etiqueta="Porcentaje devuelto" valor={porcentaje(desempeno.resumen.returnedQuantityPercentage)} nota="Solo usa cantidades recibidas y devueltas con unidad compatible." />
      </SeccionIndicadores>
      {desempeno.actualizando ? <p className="text-xs text-muted-foreground">Actualizando...</p> : null}
    </div> : null}
  </section>
}
