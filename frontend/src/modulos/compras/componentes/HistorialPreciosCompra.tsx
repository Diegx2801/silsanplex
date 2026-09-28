import { ArrowDownRight, ArrowUpRight, Equal, Eye, History, LoaderCircle } from 'lucide-react'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { useHistorialPreciosCompra } from '@/modulos/compras/estado/useHistorialPreciosCompra'
import type {
  EventoPrecioCompra,
  ResumenPrecioCompra,
} from '@/modulos/compras/modelo/historialPrecios'
import type { PeriodoHistorialPrecios } from '@/modulos/compras/modelo/historialPrecios'

interface Props {
  modo: 'producto' | 'proveedor'
  productoId?: string
  proveedorId?: string
}

const periodos: Array<{ valor: PeriodoHistorialPrecios; etiqueta: string }> = [
  { valor: '30d', etiqueta: 'Últimos 30 días' },
  { valor: '90d', etiqueta: 'Últimos 90 días' },
  { valor: '6m', etiqueta: 'Últimos 6 meses' },
  { valor: '1y', etiqueta: 'Último año' },
  { valor: 'all', etiqueta: 'Histórico completo' },
]

const formatoNumero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 4 })
const formatoPorcentaje = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2, signDisplay: 'always' })
const formatoFecha = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' })
const formatoFechaHora = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' })

function formatearNumero(valor: number) {
  return formatoNumero.format(valor)
}

function formatearCosto(valor: number | null, moneda: string) {
  if (valor === null) return 'N/D'
  if (moneda === 'PEN' || moneda === 'USD') {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda, maximumFractionDigits: 4 }).format(valor)
  }
  return `${formatearNumero(valor)} ${moneda}`
}

function formatearFecha(valor: string, incluirHora = false) {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible'
  return (incluirHora ? formatoFechaHora : formatoFecha).format(fecha)
}

function etiquetaTributaria(valor: string) {
  if (valor === 'includes_igv') return 'Incluye IGV'
  if (valor === 'excludes_igv') return 'Sin IGV'
  if (valor === 'not_applicable') return 'IGV no aplica'
  return 'Base tributaria no disponible'
}

function etiquetaEstado(valor: string) {
  if (valor === 'closed_partial') return 'Cerrada parcial'
  if (valor === 'partially_received') return 'Recepción parcial'
  if (valor === 'received') return 'Recibida'
  return valor || 'Sin estado'
}

function variacion(resumen: ResumenPrecioCompra) {
  if (resumen.absoluteVariation === null || resumen.percentageVariation === null) {
    return <span className="text-muted-foreground">N/D</span>
  }

  const disminuyo = resumen.percentageVariation < 0
  const igual = resumen.percentageVariation === 0
  const Icono = igual ? Equal : disminuyo ? ArrowDownRight : ArrowUpRight
  const tono = igual ? 'text-muted-foreground' : disminuyo ? 'text-emerald-700' : 'text-amber-700'
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap ${tono}`} title="Variación contra la recepción anterior">
    <Icono aria-hidden="true" className="size-3.5" />
    {formatearCosto(resumen.absoluteVariation, resumen.currency)} ({formatoPorcentaje.format(resumen.percentageVariation)}%)
  </span>
}

function documento(evento: EventoPrecioCompra) {
  const partes = [evento.documentType, evento.series, evento.documentNumber].filter(Boolean)
  return partes.length ? partes.join(' ') : evento.purchaseOrderId.slice(0, 8)
}

function DetalleRecepciones({ eventos }: { eventos: EventoPrecioCompra[] }) {
  if (!eventos.length) return <p className="text-sm text-muted-foreground">No hay recepciones para esta dimensión de moneda y base tributaria.</p>
  return <div className="overflow-x-auto rounded-md border bg-background">
    <table className="w-full min-w-[760px] text-left text-xs">
      <caption className="sr-only">Recepciones que componen el historial de costos</caption>
      <thead className="bg-muted/50 text-muted-foreground"><tr>
        <th className="px-3 py-2 font-medium">Recepción</th>
        <th className="px-3 py-2 font-medium">Orden</th>
        <th className="px-3 py-2 text-right font-medium">Cantidad</th>
        <th className="px-3 py-2 text-right font-medium">Costo registrado</th>
        <th className="px-3 py-2 font-medium">Moneda / IGV</th>
        <th className="px-3 py-2 font-medium">Estado</th>
      </tr></thead>
      <tbody className="divide-y">
        {eventos.map((evento) => <tr key={evento.purchaseReceiptItemId}>
          <td className="px-3 py-2">{formatearFecha(evento.receivedAt, true)}</td>
          <td className="px-3 py-2 font-mono">{documento(evento)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{formatearNumero(evento.quantity)} {evento.unitOfMeasure}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatearCosto(evento.unitCost, evento.currency)}</td>
          <td className="px-3 py-2">{evento.currency} · {etiquetaTributaria(evento.taxBasis)}</td>
          <td className="px-3 py-2">{etiquetaEstado(evento.orderStatus)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>
}

export function HistorialPreciosCompra({ modo, productoId, proveedorId }: Props) {
  const historial = useHistorialPreciosCompra({ productoId, proveedorId })
  if (!historial.puedeConsultar) return null

  const titulo = modo === 'producto' ? 'Precios proveedores' : 'Historial de precios'
  const descripcion = modo === 'producto'
    ? 'Costos registrados por recepción, separados por proveedor, moneda y base tributaria.'
    : 'Productos recibidos de este proveedor, separados por moneda y base tributaria.'
  const columnas = modo === 'producto'
    ? ['Proveedor', 'Última compra', 'Último costo', 'Costo anterior', 'Variación', 'Mínimo', 'Promedio ponderado', 'Máximo', 'Cantidad', 'Recepciones', 'Moneda']
    : ['Producto', 'Última compra', 'Último costo', 'Costo anterior', 'Variación', 'Mínimo', 'Promedio ponderado', 'Máximo', 'Cantidad', 'Recepciones', 'Moneda']

  return <section className="border-t px-5 py-6 sm:px-7" aria-labelledby={`historial-precios-${modo}`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 id={`historial-precios-${modo}`} className="flex items-center gap-2 font-semibold"><History aria-hidden="true" className="size-4 text-primary" />{titulo}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{descripcion} El promedio es ponderado por la cantidad realmente recibida.</p>
      </div>
      <label className="flex shrink-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
        Periodo
        <select aria-label="Periodo del historial de precios" value={historial.periodo} onChange={(evento) => historial.cambiarPeriodo(evento.target.value as PeriodoHistorialPrecios)} className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground">
          {periodos.map((periodo) => <option key={periodo.valor} value={periodo.valor}>{periodo.etiqueta}</option>)}
        </select>
      </label>
    </div>

    {historial.cargandoResumen ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Cargando historial de precios…</p> : null}
    {historial.errorResumen ? <p role="alert" className="mt-5 text-sm text-destructive">{historial.errorResumen instanceof Error ? historial.errorResumen.message : 'No se pudo cargar el historial de precios.'}</p> : null}
    {!historial.cargandoResumen && !historial.errorResumen && !historial.resumen.length ? <p className="mt-5 text-sm text-muted-foreground">No hay recepciones de inventario para el periodo seleccionado.</p> : null}

    {historial.resumen.length ? <div className="mt-5 overflow-x-auto rounded-md border">
      <table className="w-full min-w-[1280px] text-left text-xs">
        <caption className="sr-only">{titulo}</caption>
        <thead className="bg-muted/50 text-muted-foreground"><tr>{columnas.map((columna) => <th key={columna} className={`px-3 py-2 font-medium ${['Último costo', 'Costo anterior', 'Mínimo', 'Promedio ponderado', 'Máximo', 'Cantidad', 'Recepciones'].includes(columna) ? 'text-right' : ''}`}>{columna}</th>)}<th className="px-3 py-2 font-medium">Detalle</th></tr></thead>
        <tbody className="divide-y">
          {historial.resumen.map((resumen) => {
            const clave = `${resumen.supplierId}-${resumen.productId}-${resumen.currency}-${resumen.unitOfMeasure}-${resumen.pricesIncludeTax}-${resumen.taxAffectation ?? 'sin-base'}`
            const abierto = historial.detalleClave?.supplierId === resumen.supplierId && historial.detalleClave.productId === resumen.productId && historial.detalleClave.currency === resumen.currency && historial.detalleClave.unitOfMeasure === resumen.unitOfMeasure && historial.detalleClave.pricesIncludeTax === resumen.pricesIncludeTax && historial.detalleClave.taxAffectation === resumen.taxAffectation
            return <Fragment key={clave}>
              <tr>
                <td className="px-3 py-3 font-medium">{modo === 'producto' ? resumen.supplierName : `${resumen.productCode} · ${resumen.productDescription}`}</td>
                <td className="px-3 py-3 whitespace-nowrap">{formatearFecha(resumen.lastReceivedAt)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{formatearCosto(resumen.latestUnitCost, resumen.currency)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{formatearCosto(resumen.previousUnitCost, resumen.currency)}</td>
                <td className="px-3 py-3">{variacion(resumen)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{formatearCosto(resumen.minimumUnitCost, resumen.currency)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{formatearCosto(resumen.weightedAverageUnitCost, resumen.currency)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{formatearCosto(resumen.maximumUnitCost, resumen.currency)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatearNumero(resumen.receivedQuantity)} {resumen.unitOfMeasure}</td>
                <td className="px-3 py-3 text-right tabular-nums">{resumen.receiptCount} / {resumen.purchaseCount}</td>
                <td className="px-3 py-3"><span className="font-mono">{resumen.currency}</span><span className="mt-1 block text-[0.68rem] text-muted-foreground">{resumen.unitOfMeasure || 'Unidad no disponible'} · {etiquetaTributaria(resumen.taxBasis)}</span></td>
                <td className="px-3 py-3"><Button type="button" variant="outline" size="sm" aria-expanded={abierto} onClick={() => abierto ? historial.cerrarDetalle() : historial.abrirDetalle({ supplierId: resumen.supplierId, productId: resumen.productId, currency: resumen.currency, unitOfMeasure: resumen.unitOfMeasure, pricesIncludeTax: resumen.pricesIncludeTax, taxAffectation: resumen.taxAffectation })}><Eye aria-hidden="true" />{abierto ? 'Ocultar recepciones' : 'Ver recepciones'}</Button></td>
              </tr>
              {abierto ? <tr key={`${clave}-detalle`}><td colSpan={12} className="bg-muted/20 px-3 py-4"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-medium">Recepciones · {resumen.currency} · {etiquetaTributaria(resumen.taxBasis)}</p><p className="text-xs text-muted-foreground">Costo mostrado: unit_cost registrado en la recepción</p></div>{historial.cargandoDetalle ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Cargando recepciones…</p> : null}{historial.errorDetalle ? <p role="alert" className="text-sm text-destructive">{historial.errorDetalle instanceof Error ? historial.errorDetalle.message : 'No se pudo cargar el detalle.'}</p> : null}{!historial.cargandoDetalle && !historial.errorDetalle ? <DetalleRecepciones eventos={historial.detalle} /> : null}</td></tr> : null}
            </Fragment>
          })}
        </tbody>
      </table>
    </div> : null}
    {historial.actualizandoResumen ? <p className="mt-2 text-xs text-muted-foreground">Actualizando…</p> : null}
  </section>
}
