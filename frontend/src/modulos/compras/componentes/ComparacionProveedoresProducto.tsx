import { ArrowDownRight, ArrowUpRight, BarChart3, Equal, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

import { useComparacionProveedoresProducto } from '@/modulos/compras/estado/useComparacionProveedoresProducto'
import type {
  ComparacionProveedorProducto,
  PeriodoComparacionProveedoresProducto,
} from '@/modulos/compras/modelo/comparacionProveedoresProducto'

interface Props {
  productoId: string
  abierto: boolean
}

const periodos: Array<{ valor: PeriodoComparacionProveedoresProducto; etiqueta: string }> = [
  { valor: '30d', etiqueta: 'Últimos 30 días' },
  { valor: '90d', etiqueta: 'Últimos 90 días' },
  { valor: '6m', etiqueta: 'Últimos 6 meses' },
  { valor: '1y', etiqueta: 'Último año' },
  { valor: 'all', etiqueta: 'Histórico completo' },
]

const formatoNumero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 })
const formatoPorcentaje = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2, signDisplay: 'always' })
const formatoFecha = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' })

function numero(valor: number | null): string {
  return valor === null ? 'N/D' : formatoNumero.format(valor)
}

function porcentaje(valor: number | null): string {
  return valor === null ? 'N/D' : `${formatoNumero.format(valor)} %`
}

function fecha(valor: string | null): string {
  if (!valor) return 'N/D'
  const fechaValor = new Date(valor)
  return Number.isNaN(fechaValor.getTime()) ? 'N/D' : formatoFecha.format(fechaValor)
}

function costo(valor: number | null, moneda: string | null): string {
  if (valor === null) return 'N/D'
  if (moneda === 'PEN' || moneda === 'USD') {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda, maximumFractionDigits: 4 }).format(valor)
  }
  return `${formatoNumero.format(valor)}${moneda ? ` ${moneda}` : ''}`
}

function cantidad(valor: number | null, unidad: string | null): string {
  if (valor === null) return 'N/D'
  return `${numero(valor)}${unidad ? ` ${unidad}` : ''}`
}

function tributo(valor: string | null): string {
  if (valor === 'includes_igv') return 'Incluye IGV'
  if (valor === 'excludes_igv') return 'Sin IGV'
  if (valor === 'not_applicable') return 'IGV no aplica'
  return valor || 'Base tributaria N/D'
}

function estadoOrden(valor: string | null): string {
  if (valor === 'received') return 'Recibida'
  if (valor === 'partially_received') return 'Recepción parcial'
  if (valor === 'closed_partial') return 'Cerrada parcial'
  if (valor === 'issued') return 'Emitida'
  return valor || 'N/D'
}

function variacion(fila: ComparacionProveedorProducto): ReactNode {
  if (fila.absoluteVariation === null || fila.percentageVariation === null) return 'N/D'
  const disminuyo = fila.percentageVariation < 0
  const igual = fila.percentageVariation === 0
  const Icono = igual ? Equal : disminuyo ? ArrowDownRight : ArrowUpRight
  const tono = igual ? 'text-muted-foreground' : disminuyo ? 'text-emerald-700' : 'text-amber-700'
  return <span className={`inline-flex items-center gap-1 ${tono}`} title="Variación contra el costo anterior"><Icono aria-hidden="true" className="size-3.5" />{costo(fila.absoluteVariation, fila.currency)} ({formatoPorcentaje.format(fila.percentageVariation)}%)</span>
}

function Metric({ etiqueta, valor, nota }: { etiqueta: string; valor: ReactNode; nota?: string }) {
  return <div><dt className="font-mono text-[0.68rem] tracking-[0.04em] text-muted-foreground uppercase">{etiqueta}</dt><dd className="mt-1 text-sm font-medium tabular-nums">{valor}</dd>{nota ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{nota}</p> : null}</div>
}

function Dimensiones({ fila }: { fila: ComparacionProveedorProducto }) {
  return <p className="mt-2 text-xs text-muted-foreground">{fila.currency ?? 'Moneda N/D'} · {fila.unitOfMeasure ?? 'Unidad N/D'} · {tributo(fila.taxBasis)}{fila.pricesIncludeTax === null ? '' : ` · ${fila.pricesIncludeTax ? 'precio con IGV' : 'precio sin IGV'}`}</p>
}

function FilaComparacion({ fila }: { fila: ComparacionProveedorProducto }) {
  const puntualidad = fila.ordersWithExpectedDelivery > 0
    ? `${fila.onTimeOrders} de ${fila.ordersWithExpectedDelivery}`
    : 'Sin fecha prometida'

  return <tr className="align-top">
    <td className="px-3 py-4">
      <div className="font-medium">{fila.supplierName}</div>
      <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-medium ${fila.comparisonStatus === 'comparable' ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border bg-muted text-muted-foreground'}`}>{fila.comparisonStatus === 'comparable' ? 'Comparable' : 'No comparable'}</span>
      <Dimensiones fila={fila} />
      {fila.comparisonStatus === 'no_comparable' ? <p className="mt-1 max-w-[18rem] text-xs leading-5 text-muted-foreground">No hay una recepción con dimensiones de precio comparables.</p> : null}
    </td>
    <td className="px-3 py-4">
      <div className="space-y-1.5 whitespace-nowrap">
        <Metric etiqueta="Último" valor={costo(fila.latestUnitCost, fila.currency)} />
        <Metric etiqueta="Promedio ponderado" valor={costo(fila.weightedAverageUnitCost, fila.currency)} />
        <Metric etiqueta="Variación" valor={variacion(fila)} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{fila.priceReceiptCount ? `${fila.priceReceiptCount} recepciones` : 'Sin recepciones de precio'} · última: {fecha(fila.lastPriceReceivedAt)}</p>
    </td>
    <td className="px-3 py-4">
      <div className="space-y-1.5 whitespace-nowrap">
        <Metric etiqueta="Cumplimiento" valor={porcentaje(fila.fulfillmentPercentage)} />
        <Metric etiqueta="Cantidad" valor={`${cantidad(fila.receivedQuantity, fila.unitOfMeasure)} / ${cantidad(fila.orderedQuantity, fila.unitOfMeasure)}`} nota="Recibida / ordenada" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Líneas: {fila.completeLines} completas · {fila.incompleteLines} incompletas</p>
    </td>
    <td className="px-3 py-4">
      <div className="space-y-1.5 whitespace-nowrap">
        <Metric etiqueta="Primera recepción" valor={fila.avgDaysToFirstReceipt === null ? 'N/D' : `${numero(fila.avgDaysToFirstReceipt)} días`} />
        <Metric etiqueta="Recepción completa" valor={fila.avgDaysToComplete === null ? 'N/D' : `${numero(fila.avgDaysToComplete)} días`} />
        <Metric etiqueta="Puntualidad" valor={puntualidad} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{fila.closedPartialOrders} cerradas parciales · no implica incumplimiento confirmado</p>
    </td>
    <td className="px-3 py-4">
      <Metric etiqueta="Completadas" valor={fila.completedReturnsCount} />
      <p className="mt-2 text-xs text-muted-foreground">Cantidad: {cantidad(fila.returnedQuantity, fila.unitOfMeasure)} · {porcentaje(fila.returnedQuantityPercentage)}</p>
      <p className="mt-1 text-xs text-muted-foreground">Recepciones afectadas: {fila.affectedReceiptsCount}</p>
    </td>
    <td className="px-3 py-4">
      <p className="font-medium">{fila.totalOrders} órdenes</p>
      <p className="mt-1 text-xs text-muted-foreground">{fila.totalOrderLines} líneas · {fila.operationalReceiptCount} recepciones</p>
      <p className="mt-1 text-xs text-muted-foreground">{fila.ordersWithExpectedDelivery} con fecha prometida</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2">Ver detalle objetivo</summary>
        <dl className="mt-3 grid gap-2 border-t pt-3">
          <Metric etiqueta="Órdenes recibidas" valor={fila.receivedOrders} />
          <Metric etiqueta="Órdenes parciales" valor={fila.partiallyReceivedOrders} />
          <Metric etiqueta="Sobre-recepciones" valor={fila.overReceivedLines} />
          <Metric etiqueta="Último estado" valor={estadoOrden(fila.latestOrderStatus)} />
          <Metric etiqueta="Última recepción" valor={fecha(fila.lastPriceReceivedAt)} />
          <Metric etiqueta="Muestra de primera recepción" valor={fila.firstReceiptSampleSize} />
          <Metric etiqueta="Muestra de recepción completa" valor={fila.completeDeliverySampleSize} />
        </dl>
      </details>
    </td>
  </tr>
}

export function ComparacionProveedoresProducto({ productoId, abierto }: Props) {
  const comparacion = useComparacionProveedoresProducto({ productoId, habilitado: abierto })
  if (!comparacion.puedeConsultar) return null

  return <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="comparacion-proveedores-producto">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 id="comparacion-proveedores-producto" className="flex items-center gap-2 font-semibold"><BarChart3 aria-hidden="true" className="size-4 text-primary" />Comparar proveedores</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Comparación objetiva de costos E2, recepciones, cumplimiento, tiempos y devoluciones para este producto. No calcula un ganador ni un score.</p>
      </div>
      <label className="flex shrink-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Periodo<select aria-label="Periodo de comparación de proveedores" value={comparacion.periodo} onChange={(evento) => comparacion.cambiarPeriodo(evento.target.value as PeriodoComparacionProveedoresProducto)} className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground">{periodos.map((periodo) => <option key={periodo.valor} value={periodo.valor}>{periodo.etiqueta}</option>)}</select></label>
    </div>

    <p className="mt-3 max-w-4xl border-l-2 border-primary/40 pl-3 text-xs leading-5 text-muted-foreground">Cada fila conserva moneda, unidad y base tributaria. Solo son comparables las filas con la misma clave de dimensión; los tamaños de muestra se muestran para dar contexto.</p>
    {comparacion.cargando ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Cargando comparación de proveedores…</p> : null}
    {comparacion.error ? <p role="alert" className="mt-5 text-sm text-destructive">{comparacion.error instanceof Error ? comparacion.error.message : 'No se pudo cargar la comparación de proveedores.'}</p> : null}
    {!comparacion.cargando && !comparacion.error && !comparacion.filas.length ? <p className="mt-5 text-sm text-muted-foreground">No hay compras o recepciones de este producto para el periodo seleccionado.</p> : null}

    {comparacion.filas.length ? <div className="mt-5 overflow-x-auto rounded-md border">
      <table className="w-full min-w-[1180px] text-left text-xs">
        <caption className="sr-only">Comparación objetiva de proveedores para el producto</caption>
        <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Proveedor / dimensión</th><th className="px-3 py-2 font-medium">Precio E2</th><th className="px-3 py-2 font-medium">Cumplimiento</th><th className="px-3 py-2 font-medium">Entregas</th><th className="px-3 py-2 font-medium">Devoluciones</th><th className="px-3 py-2 font-medium">Muestra</th></tr></thead>
        <tbody className="divide-y">{comparacion.filas.map((fila) => <FilaComparacion key={`${fila.supplierId}-${fila.comparisonKey ?? fila.unitOfMeasure ?? 'sin-dimension'}`} fila={fila} />)}</tbody>
      </table>
    </div> : null}
    {comparacion.actualizando ? <p className="mt-2 text-xs text-muted-foreground">Actualizando…</p> : null}
  </section>
}
