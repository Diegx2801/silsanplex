import { RotateCcw, Settings2, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { DialogoCondicionStock } from './DialogoCondicionStock'
import { DialogoConfiguracionAlertas } from './DialogoConfiguracionAlertas'
import { EstadoListadoInventario } from './EstadoListadoInventario'
import { PaginacionInventario } from './PaginacionInventario'
import { VistasInventario } from './VistasInventario'
import { useDebounceInventario } from '../estado/useDebounceInventario'
import { useListadosAlmacen } from '../estado/useListadosAlmacen'
import {
  etiquetasEstadoStock,
  type Almacen,
  type UbicacionAlmacen,
  type DatosReclasificacion,
  type ConsultaAlertasStock,
  type ConsultaVencimientos,
} from '../modelo/almacen'

interface Props {
  organizationId: string
  almacenes: Almacen[]
  ubicaciones: UbicacionAlmacen[]
  puedeGestionar: boolean
  reclasificar: (datos: DatosReclasificacion, operationKey?: string) => Promise<string | undefined>
  configurar: (datos: {
    productoId: string
    almacenId: string
    ubicacionId: string
    stockMinimo: number
    diasVencimiento: number
  }) => Promise<string | undefined>
}
const formatoCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })
const formatoFecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
const alertasInicial: ConsultaAlertasStock = {
  pagina: 1, tamanioPagina: 25, busqueda: '', almacenId: '', orden: 'producto-asc',
}
const vencimientosInicial: ConsultaVencimientos = {
  pagina: 1, tamanioPagina: 25, busqueda: '', almacenId: '', estadoVencimiento: '',
  fechaDesde: '', fechaHasta: '', orden: 'vencimiento-asc',
}

export function PanelControlStock(props: Props) {
  const [parametros] = useSearchParams()
  const vencimientosActivos = parametros.get('vista') === 'vencimientos'
  const [alertasConsulta, setAlertasConsulta] = useState(alertasInicial)
  const [vencimientosConsulta, setVencimientosConsulta] = useState(vencimientosInicial)
  const [dialogo, setDialogo] = useState<'condicion' | 'alertas' | null>(null)
  const [mensaje, setMensaje] = useState('')
  const botonCondicion = useRef<HTMLButtonElement>(null)
  const botonAlertas = useRef<HTMLButtonElement>(null)
  const consulta = vencimientosActivos ? vencimientosConsulta : alertasConsulta
  const busquedaDebounced = useDebounceInventario(consulta.busqueda)
  const busqueda = consulta.busqueda ? busquedaDebounced : ''
  const fechasInvalidas = vencimientosActivos && Boolean(vencimientosConsulta.fechaDesde
    && vencimientosConsulta.fechaHasta && vencimientosConsulta.fechaDesde > vencimientosConsulta.fechaHasta)
  const listados = useListadosAlmacen(vencimientosActivos
    ? fechasInvalidas ? {} : { vencimientos: { ...vencimientosConsulta, busqueda } }
    : { alertas: { ...alertasConsulta, busqueda } })
  const listado = vencimientosActivos ? listados.vencimientos : listados.alertas
  const elementos = listado.data?.elementos ?? []
  const hayFiltros = Boolean(consulta.busqueda || consulta.almacenId || (vencimientosActivos && (
    vencimientosConsulta.estadoVencimiento || vencimientosConsulta.fechaDesde || vencimientosConsulta.fechaHasta
  )))
  const hayCambiosConsulta = hayFiltros || consulta.pagina !== 1 || consulta.tamanioPagina !== 25
    || consulta.orden !== (vencimientosActivos ? 'vencimiento-asc' : 'producto-asc')
  const cambiarComunes = (cambios: Partial<Pick<ConsultaAlertasStock, 'busqueda' | 'almacenId' | 'pagina' | 'tamanioPagina'>>) => {
    if (vencimientosActivos) setVencimientosConsulta((actual) => ({ ...actual, pagina: 1, ...cambios }))
    else setAlertasConsulta((actual) => ({ ...actual, pagina: 1, ...cambios }))
  }
  return (
    <div className="space-y-6">
      {props.puedeGestionar ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button ref={botonAlertas} variant="outline" onClick={() => setDialogo('alertas')}>
            <Settings2 aria-hidden="true" />Configurar alertas
          </Button>
          <Button ref={botonCondicion} onClick={() => setDialogo('condicion')}>
            <ShieldCheck aria-hidden="true" />Cambiar condición
          </Button>
        </div>
      ) : null}
      {mensaje ? <p role="status" className="text-sm text-primary">{mensaje}</p> : null}
      <VistasInventario etiqueta="Vistas de control de stock" vista={vencimientosActivos ? 'vencimientos' : 'minimos'} opciones={[
        { valor: 'minimos', etiqueta: 'Stock mínimo' }, { valor: 'vencimientos', etiqueta: 'Vencimientos' },
      ]} />
      <section aria-labelledby="control-listado-titulo" className="ledger-sheet">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-5 sm:px-6">
          <div>
            <h2 id="control-listado-titulo" className="text-lg font-semibold">{vencimientosActivos ? 'Vencimientos' : 'Alertas de stock mínimo'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {listado.isLoading ? 'Consultando alertas…' : listado.isError ? 'No se pudo consultar el total.' : `${listado.data?.total ?? 0} ${vencimientosActivos ? 'posiciones con stock vencido o próximo a vencer' : 'alertas por producto y almacén'}.`}
            </p>
            {!vencimientosActivos ? <p className="mt-1 text-sm text-muted-foreground">El disponible excluye reservas, vencidos y stock bloqueado.</p> : null}
          </div>
          <Button variant="outline" disabled={!hayCambiosConsulta} onClick={() => vencimientosActivos
            ? setVencimientosConsulta(vencimientosInicial) : setAlertasConsulta(alertasInicial)}>
            <RotateCcw aria-hidden="true" />Limpiar filtros
          </Button>
        </div>
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
          <label className="field-label">Buscar
            <input type="search" className="field-control" placeholder="Producto o código" value={consulta.busqueda}
              onChange={(e) => cambiarComunes({ busqueda: e.target.value })} />
          </label>
          <label className="field-label">Almacén
            <select className="field-control" value={consulta.almacenId} onChange={(e) => cambiarComunes({ almacenId: e.target.value })}>
              <option value="">Todos</option>
              {props.almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          <label className="field-label">Orden
            <select className="field-control" value={consulta.orden} onChange={(e) => vencimientosActivos
              ? setVencimientosConsulta((actual) => ({ ...actual, pagina: 1, orden: e.target.value as ConsultaVencimientos['orden'] }))
              : setAlertasConsulta((actual) => ({ ...actual, pagina: 1, orden: e.target.value as ConsultaAlertasStock['orden'] }))}>
              {vencimientosActivos ? <><option value="vencimiento-asc">Más próximo</option><option value="vencimiento-desc">Más lejano</option></>
                : <><option value="producto-asc">Producto A–Z</option><option value="stock-asc">Menor disponible</option></>}
            </select>
          </label>
          {vencimientosActivos ? <>
            <label className="field-label">Estado del vencimiento
              <select className="field-control" value={vencimientosConsulta.estadoVencimiento ?? ''}
                onChange={(e) => setVencimientosConsulta((actual) => ({ ...actual, pagina: 1, estadoVencimiento: e.target.value as ConsultaVencimientos['estadoVencimiento'] }))}>
                <option value="">Todos</option><option value="expired">Vencido</option><option value="urgent">Urgente</option><option value="upcoming">Próximo</option>
              </select>
            </label>
            <label className="field-label">Vence desde
              <input className="field-control" type="date" value={vencimientosConsulta.fechaDesde} max={vencimientosConsulta.fechaHasta || undefined}
                onChange={(e) => setVencimientosConsulta((actual) => ({ ...actual, pagina: 1, fechaDesde: e.target.value }))} />
            </label>
            <label className="field-label">Vence hasta
              <input className="field-control" type="date" value={vencimientosConsulta.fechaHasta} min={vencimientosConsulta.fechaDesde || undefined}
                aria-invalid={fechasInvalidas || undefined} aria-describedby={fechasInvalidas ? 'control-fechas-error' : undefined}
                onChange={(e) => setVencimientosConsulta((actual) => ({ ...actual, pagina: 1, fechaHasta: e.target.value }))} />
            </label>
          </> : null}
        </div>
        {fechasInvalidas ? <p id="control-fechas-error" role="alert" className="field-error px-5 py-5">La fecha hasta debe ser igual o posterior a la fecha desde.</p> : (
          <EstadoListadoInventario cargando={listado.isLoading} error={listado.error} vacio={!elementos.length}
            mensajeVacio={hayFiltros ? 'No hay coincidencias para estos filtros. Prueba con otros valores o limpia los filtros.'
              : vencimientosActivos ? 'No hay alertas de vencimiento registradas. Se mostrarán aquí cuando haya existencias dentro del plazo de aviso.'
                : 'No hay alertas de stock mínimo registradas. Configura un mínimo por producto y almacén para controlar la reposición.'}
            alReintentar={() => void listado.refetch()}>
            <div className="divide-y" aria-busy={listado.isFetching}>
              {elementos.map((alerta) => (
                <article key={vencimientosActivos
                  ? `${alerta.productoId}-${alerta.almacenId}-${alerta.ubicacionId}-${alerta.lote}-${alerta.fechaVencimiento}-${alerta.estado}`
                  : `${alerta.productoId}-${alerta.almacenId}`} className="grid gap-3 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <h3 className="font-medium">{alerta.productoDescripcion} <span className="ml-2 font-mono text-xs text-muted-foreground">{alerta.productoCodigo}</span></h3>
                    <p className="mt-1 text-sm text-muted-foreground">{alerta.almacenNombre}{vencimientosActivos
                      ? ` · ${alerta.ubicacionCodigo} · ${alerta.ubicacionNombre}${alerta.lote ? ` · Lote ${alerta.lote}` : ''}` : ''}</p>
                    {vencimientosActivos ? <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <span>Vence {formatoFecha.format(new Date(`${alerta.fechaVencimiento}T12:00:00`))}</span>
                      <span className="status-label" data-tone={alerta.estado === 'available' ? 'listo' : 'revision'}>{etiquetasEstadoStock[alerta.estado]}</span>
                      <span className="status-label" data-tone="pendiente">{alerta.estadoVencimiento === 'expired' ? 'Vencido'
                        : alerta.diasParaVencer === 0 ? 'Vence hoy' : `${alerta.estadoVencimiento === 'urgent' ? 'Urgente' : 'Próximo'} · ${alerta.diasParaVencer} días`}</span>
                    </div> : null}
                  </div>
                  <div className="text-sm lg:text-end">
                    <p className="font-medium tabular-nums">{formatoCantidad.format(alerta.cantidad)} {alerta.unidadMedida || 'unidades'}{!vencimientosActivos ? ' disponibles' : ''}</p>
                    {!vencimientosActivos ? <p className="mt-1 text-muted-foreground">Mínimo: {formatoCantidad.format(alerta.stockMinimo)} {alerta.unidadMedida || 'unidades'}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </EstadoListadoInventario>
        )}
        {listado.data && !fechasInvalidas ? <PaginacionInventario etiqueta={vencimientosActivos ? 'vencimientos' : 'alertas de stock'}
          pagina={consulta.pagina} tamanioPagina={consulta.tamanioPagina} total={listado.data.total} totalPaginas={listado.data.totalPaginas}
          cantidadVisible={elementos.length} cargando={listado.isFetching}
          alCambiarPagina={(pagina) => cambiarComunes({ pagina })}
          alCambiarTamanio={(tamanioPagina) => cambiarComunes({ tamanioPagina })} /> : null}
      </section>
      {props.puedeGestionar && dialogo === 'condicion' ? <DialogoCondicionStock {...props} abierto
        alCambiarAbierto={(abierto) => { if (!abierto) setDialogo(null) }}
        reclasificar={async (datos, key) => { const error = await props.reclasificar(datos, key); if (!error) setMensaje('Condición actualizada. El stock físico total no cambió.'); return error }}
        alRestaurarFoco={() => botonCondicion.current?.focus()} /> : null}
      {props.puedeGestionar && dialogo === 'alertas' ? <DialogoConfiguracionAlertas {...props} abierto
        alCambiarAbierto={(abierto) => { if (!abierto) setDialogo(null) }}
        configurar={async (datos) => { const error = await props.configurar(datos); if (!error) setMensaje('Configuración de alertas guardada.'); return error }}
        alRestaurarFoco={() => botonAlertas.current?.focus()} /> : null}
    </div>
  )
}
