import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatearFechaCalendarioPeru } from '@/lib/fechas'
import { useHistorialPreciosVenta } from '@/modulos/ventas/estado/useHistorialPreciosVenta'
import type { PrecioVentaHistorico } from '@/modulos/ventas/servicios/historialPreciosService'
import { precioHistoricoCompatible } from '@/modulos/ventas/modelo/precioHistorico'

function Importe({ fila }: { fila: PrecioVentaHistorico }) {
  return <>{fila.currency} {fila.unit_price.toFixed(4)} · {fila.prices_include_tax ? 'Incluye IGV' : 'Sin IGV'} · {fila.tax_affectation || 'IGV histórico sin dato'}</>
}

export function HistorialPreciosVenta({ clienteId, productoId, habilitado = true }: {
  clienteId: string; productoId?: string; habilitado?: boolean
}) {
  const id = useId()
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pagina, setPagina] = useState(0)
  const fechasInvalidas = Boolean(desde && hasta && desde > hasta)
  const historial = useHistorialPreciosVenta(clienteId, {
    productoId, busqueda, desde, hasta, limite: 21, desplazamiento: pagina * 20,
  }, habilitado && !fechasInvalidas)
  if (!historial.permitido) return null
  return <section aria-label="Historial de precios de venta" className="space-y-4 border-t py-5">
    <h2 className="font-semibold">Historial de precios de venta</h2>
    <p className="text-xs text-muted-foreground">Ventas comerciales registradas y despachadas. Moneda actual: PEN. Descuentos por línea y vendedor no registrados en el modelo; se identifica al usuario que registró la venta.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      {!productoId && <label className="field-label" htmlFor={id + '-producto'}>Buscar producto
        <input id={id + '-producto'} className="field-control" maxLength={160} placeholder="Código o descripción" value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(0) }} />
      </label>}
      <label className="field-label" htmlFor={id + '-desde'}>Desde
        <input id={id + '-desde'} type="date" className="field-control" value={desde} onChange={e => { setDesde(e.target.value); setPagina(0) }} />
      </label>
      <label className="field-label" htmlFor={id + '-hasta'}>Hasta
        <input id={id + '-hasta'} type="date" className="field-control" value={hasta} onChange={e => { setHasta(e.target.value); setPagina(0) }} />
      </label>
    </div>
    {fechasInvalidas ? <p role="alert">La fecha inicial no puede ser posterior a la final.</p>
      : historial.isPending ? <p role="status">Cargando precios de venta…</p>
        : historial.error ? <div role="alert">No se pudo consultar el historial. <Button type="button" variant="outline" onClick={() => void historial.refetch()}>Reintentar</Button></div>
          : historial.filas.length === 0 ? <p>Este cliente no tiene ventas para el producto o período seleccionado.</p>
            : <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm">
              <caption className="sr-only">Precios vendidos al cliente, del más reciente al más antiguo</caption>
              <thead><tr>{['Fecha / documento', 'Producto / cliente', 'Cantidad / unidad', 'Precio unitario / IGV', 'Registrado por'].map(t => <th className="p-2" key={t}>{t}</th>)}</tr></thead>
              <tbody>{historial.filas.slice(0, 20).map(fila => <tr className="border-t" key={fila.sale_item_id}>
                <td className="p-2">{formatearFechaCalendarioPeru(fila.sale_date)}<br />{fila.document_type} {fila.document_reference}<br />{fila.internal_number}</td>
                <td className="p-2">{fila.product_code} · {fila.product_description}<br />{fila.customer_name}</td>
                <td className="p-2">{fila.quantity} {fila.unit_of_measure || 'Sin unidad registrada'}</td>
                <td className="p-2"><Importe fila={fila} /></td>
                <td className="break-all p-2">{fila.recorded_by || 'Sin dato verificable'}</td>
              </tr>)}</tbody>
            </table></div>}
    <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="outline" disabled={!pagina || historial.isFetching || fechasInvalidas} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
      <span className="text-xs">Página {pagina + 1}</span>
      <Button type="button" variant="outline" disabled={historial.filas.length <= 20 || historial.isFetching || fechasInvalidas || Boolean(historial.error)} onClick={() => setPagina(p => p + 1)}>Siguiente</Button>
    </div>
  </section>
}

export function UltimoPrecioVenta({ clienteId, productoId, unidad = '', afectacion = '', incluyeIgv, minimo, alUsar }: {
  clienteId: string; productoId: string; unidad?: string; afectacion?: string; incluyeIgv: boolean
  minimo?: number | null; alUsar?: (precio: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const historial = useHistorialPreciosVenta(clienteId, { productoId, limite: 1 }, Boolean(productoId))
  if (!clienteId || !productoId || !historial.permitido) return null
  const ultimo = historial.filas[0]
  const compatible = ultimo && precioHistoricoCompatible(ultimo, unidad, afectacion, incluyeIgv)
    && (minimo == null || ultimo.unit_price >= minimo)
  return <aside aria-label="Último precio vendido" className="mt-4 space-y-2 rounded-md border bg-background p-3 text-sm">
    {historial.isPending ? <p role="status">Consultando último precio…</p>
      : historial.error ? <p role="alert">No se pudo consultar el último precio. <Button type="button" variant="outline" onClick={() => void historial.refetch()}>Reintentar</Button></p>
        : !ultimo ? <p>Este cliente aún no compró este producto.</p>
          : <>
            <p className="font-medium">Último precio vendido: <Importe fila={ultimo} /></p>
            <p>{formatearFechaCalendarioPeru(ultimo.sale_date)} · {ultimo.quantity} {ultimo.unit_of_measure || 'Sin unidad'} · {ultimo.document_reference}</p>
            {alUsar && historial.puedeUsar && <><Button type="button" variant="outline" disabled={!compatible} onClick={() => alUsar(String(ultimo.unit_price))}>Utilizar último precio</Button>
              {!compatible && <p className="text-xs text-muted-foreground">Para utilizarlo deben coincidir moneda, unidad y tratamiento de IGV, y respetarse el precio mínimo actual.</p>}</>}
            <Button type="button" variant="ghost" onClick={() => setAbierto(v => !v)}>{abierto ? 'Ocultar historial' : 'Ver historial completo'}</Button>
          </>}
    {abierto && <HistorialPreciosVenta key={clienteId + productoId} clienteId={clienteId} productoId={productoId} />}
  </aside>
}
