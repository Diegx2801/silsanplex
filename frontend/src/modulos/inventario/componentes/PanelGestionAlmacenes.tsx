import { AlertTriangle, ArrowLeftRight, Boxes, MapPin, ShieldAlert, Warehouse } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { EstadoListadoInventario } from '@/modulos/inventario/componentes/EstadoListadoInventario'
import { PaginacionInventario } from '@/modulos/inventario/componentes/PaginacionInventario'
import { useDebounceInventario } from '@/modulos/inventario/estado/useDebounceInventario'
import { useListadosAlmacen } from '@/modulos/inventario/estado/useListadosAlmacen'
import {
  esquemaAlmacen,
  esquemaReclasificacion,
  esquemaTransferencia,
  esquemaUbicacion,
  etiquetasEstadoStock,
  type Almacen,
  type DatosAlmacen,
  type DatosReclasificacion,
  type DatosTransferencia,
  type DatosUbicacion,
  type UbicacionAlmacen,
} from '@/modulos/inventario/modelo/almacen'
import type { TamanioPaginaInventario } from '@/modulos/inventario/modelo/paginacionInventario'
import type { Producto } from '@/modulos/productos/modelo/producto'

interface Props {
  almacenes: Almacen[]
  ubicaciones: UbicacionAlmacen[]
  productos: Producto[]
  puedeGestionar: boolean
  crearAlmacen: (datos: DatosAlmacen) => Promise<string | undefined>
  crearUbicacion: (datos: DatosUbicacion) => Promise<string | undefined>
  transferir: (datos: DatosTransferencia) => Promise<string | undefined>
  reclasificar: (datos: DatosReclasificacion) => Promise<string | undefined>
  configurar: (datos: { productoId: string; almacenId: string; ubicacionId: string; stockMinimo: number; diasVencimiento: number }) => Promise<string | undefined>
}

const formatoCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })
const formatoMoneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })
const valor = (formulario: FormData, campo: string) => String(formulario.get(campo) ?? '')

function Mensaje({ texto }: { texto: string }) {
  if (!texto) return null
  return <p role="status" className="mt-3 text-sm text-muted-foreground">{texto}</p>
}

export function PanelGestionAlmacenes(props: Props) {
  const { almacenes, ubicaciones, productos, puedeGestionar } = props
  const [mensaje, setMensaje] = useState('')
  const [origenId, setOrigenId] = useState(props.almacenes[0]?.id ?? '')
  const [destinoId, setDestinoId] = useState(props.almacenes[1]?.id ?? '')
  const [reclasificacionAlmacenId, setReclasificacionAlmacenId] = useState(props.almacenes[0]?.id ?? '')
  const [politicaAlmacenId, setPoliticaAlmacenId] = useState(props.almacenes[0]?.id ?? '')
  const [stockConsulta, setStockConsulta] = useState({
    pagina: 1, tamanioPagina: 25 as TamanioPaginaInventario, busqueda: '',
    almacenId: '', ubicacionId: '', lote: '', estado: '' as '' | 'available' | 'quarantine' | 'damaged',
    vencimientoDesde: '', vencimientoHasta: '', orden: 'vencimiento-asc' as const,
  })
  const [alertasConsulta, setAlertasConsulta] = useState({
    pagina: 1, tamanioPagina: 25 as TamanioPaginaInventario, busqueda: '', almacenId: '', orden: 'producto-asc' as const,
  })
  const [vencimientosConsulta, setVencimientosConsulta] = useState({
    pagina: 1, tamanioPagina: 25 as TamanioPaginaInventario, busqueda: '', almacenId: '',
    estadoVencimiento: '' as '' | 'expired' | 'urgent' | 'upcoming', fechaDesde: '', fechaHasta: '', orden: 'vencimiento-asc' as const,
  })
  const [kardexConsulta, setKardexConsulta] = useState({
    pagina: 1, tamanioPagina: 25 as TamanioPaginaInventario, busqueda: '', almacenId: '', fechaDesde: '', fechaHasta: '', orden: 'fecha-desc' as const,
  })
  const [transferenciasConsulta, setTransferenciasConsulta] = useState({
    pagina: 1, tamanioPagina: 25 as TamanioPaginaInventario, busqueda: '', almacenId: '', fechaDesde: '', fechaHasta: '', orden: 'fecha-desc' as const,
  })
  const stockBusqueda = useDebounceInventario(stockConsulta.busqueda)
  const alertasBusqueda = useDebounceInventario(alertasConsulta.busqueda)
  const vencimientosBusqueda = useDebounceInventario(vencimientosConsulta.busqueda)
  const kardexBusqueda = useDebounceInventario(kardexConsulta.busqueda)
  const transferenciasBusqueda = useDebounceInventario(transferenciasConsulta.busqueda)
  const listados = useListadosAlmacen({
    stock: { ...stockConsulta, busqueda: stockBusqueda },
    alertas: { ...alertasConsulta, busqueda: alertasBusqueda },
    vencimientos: { ...vencimientosConsulta, busqueda: vencimientosBusqueda },
    kardex: { ...kardexConsulta, busqueda: kardexBusqueda },
    transferencias: { ...transferenciasConsulta, busqueda: transferenciasBusqueda },
  })
  const saldos = listados.stock.data?.elementos ?? []
  const alertas = listados.alertas.data?.elementos ?? []
  const vencimientos = listados.vencimientos.data?.elementos ?? []
  const kardex = listados.kardex.data?.elementos ?? []
  const transferencias = listados.transferencias.data?.elementos ?? []
  const ubicacionesOrigen = useMemo(() => props.ubicaciones.filter((item) => item.almacenId === origenId && item.activa), [origenId, props.ubicaciones])
  const ubicacionesDestino = useMemo(() => props.ubicaciones.filter((item) => item.almacenId === destinoId && item.activa), [destinoId, props.ubicaciones])
  const nombreAlmacen = (id: string) => props.almacenes.find((item) => item.id === id)?.nombre ?? 'Almacen'

  useEffect(() => {
    const activos = props.almacenes.filter((almacen) => almacen.activo)
    if (!activos.some((almacen) => almacen.id === origenId)) setOrigenId(activos[0]?.id ?? '')
    if (!activos.some((almacen) => almacen.id === destinoId) || destinoId === origenId) {
      setDestinoId(activos.find((almacen) => almacen.id !== (origenId || activos[0]?.id))?.id ?? '')
    }
    if (!activos.some((almacen) => almacen.id === reclasificacionAlmacenId)) setReclasificacionAlmacenId(activos[0]?.id ?? '')
    if (!activos.some((almacen) => almacen.id === politicaAlmacenId)) setPoliticaAlmacenId(activos[0]?.id ?? '')
  }, [destinoId, origenId, politicaAlmacenId, props.almacenes, reclasificacionAlmacenId])

  const resolver = async <T,>(resultado: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }, accion: (datos: T) => Promise<string | undefined>, exito: string) => {
    if (!resultado.success) {
      setMensaje(resultado.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
      return
    }
    const error = await accion(resultado.data)
    setMensaje(error ?? exito)
  }

  const guardarAlmacen = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    void resolver(esquemaAlmacen.safeParse({ codigo: valor(datos, 'codigo'), nombre: valor(datos, 'nombre'), direccion: valor(datos, 'direccion') }), props.crearAlmacen, 'Almacen creado correctamente.')
    evento.currentTarget.reset()
  }

  const guardarUbicacion = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    void resolver(esquemaUbicacion.safeParse({ almacenId: valor(datos, 'almacenId'), codigo: valor(datos, 'codigo'), nombre: valor(datos, 'nombre'), descripcion: valor(datos, 'descripcion') }), props.crearUbicacion, 'Ubicacion creada correctamente.')
    evento.currentTarget.reset()
  }

  const guardarTransferencia = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    const entrada = {
      referencia: valor(datos, 'referencia'), almacenOrigenId: origenId, ubicacionOrigenId: valor(datos, 'ubicacionOrigenId'),
      almacenDestinoId: destinoId, ubicacionDestinoId: valor(datos, 'ubicacionDestinoId'), productoId: valor(datos, 'productoId'),
      cantidad: valor(datos, 'cantidad'), lote: valor(datos, 'lote'), fechaVencimiento: valor(datos, 'fechaVencimiento'),
      estado: valor(datos, 'estado'), notas: valor(datos, 'notas'),
    }
    void resolver(esquemaTransferencia.safeParse(entrada), props.transferir, 'Transferencia completada y trazada en el kardex.')
  }

  const guardarReclasificacion = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    const entrada = {
      productoId: valor(datos, 'productoId'), almacenId: valor(datos, 'almacenId'), ubicacionId: valor(datos, 'ubicacionId'),
      estadoOrigen: valor(datos, 'estadoOrigen'), estadoDestino: valor(datos, 'estadoDestino'), cantidad: valor(datos, 'cantidad'),
      lote: valor(datos, 'lote'), fechaVencimiento: valor(datos, 'fechaVencimiento'), motivo: valor(datos, 'motivo'),
    }
    void resolver(esquemaReclasificacion.safeParse(entrada), props.reclasificar, 'Stock reclasificado correctamente.')
  }

  const guardarConfiguracion = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    const error = await props.configurar({
      productoId: valor(datos, 'productoId'), almacenId: valor(datos, 'almacenId'), ubicacionId: valor(datos, 'ubicacionId'),
      stockMinimo: Number(valor(datos, 'stockMinimo')), diasVencimiento: Number(valor(datos, 'diasVencimiento')),
    })
    setMensaje(error ?? 'Politica de alertas actualizada.')
  }

  return <div className="space-y-8">
    <Mensaje texto={mensaje} />

    <section aria-labelledby="stock-detallado" className="ledger-sheet">
      <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_13rem_11rem_11rem_13rem] xl:items-end">
        <div><h2 id="stock-detallado" className="text-lg font-semibold">Stock por almacén, ubicación y lote</h2><p className="mt-1 text-sm text-muted-foreground">{listados.stock.data?.total ?? 0} posiciones persistentes.</p></div>
        <label className="field-label">Buscar<input type="search" value={stockConsulta.busqueda} onChange={(e) => setStockConsulta((actual) => ({ ...actual, busqueda: e.target.value, pagina: 1 }))} className="field-control" placeholder="Producto o código" /></label>
        <label className="field-label">Almacén<select value={stockConsulta.almacenId} onChange={(e) => setStockConsulta((actual) => ({ ...actual, almacenId: e.target.value, ubicacionId: '', pagina: 1 }))} className="field-control"><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
        <label className="field-label">Condición<select value={stockConsulta.estado} onChange={(e) => setStockConsulta((actual) => ({ ...actual, estado: e.target.value as typeof actual.estado, pagina: 1 }))} className="field-control"><option value="">Todas</option><option value="available">Disponible</option><option value="quarantine">Cuarentena</option><option value="damaged">Dañado</option></select></label>
        <label className="field-label">Orden<select value={stockConsulta.orden} onChange={(e) => setStockConsulta((actual) => ({ ...actual, orden: e.target.value as typeof actual.orden, pagina: 1 }))} className="field-control"><option value="vencimiento-asc">Vencimiento próximo</option><option value="vencimiento-desc">Vencimiento lejano</option><option value="producto-asc">Producto A–Z</option></select></label>
      </div>
      <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6 lg:grid-cols-4">
        <label className="field-label">Ubicación<select value={stockConsulta.ubicacionId} onChange={(e) => setStockConsulta((actual) => ({ ...actual, ubicacionId: e.target.value, pagina: 1 }))} className="field-control"><option value="">Todas</option>{ubicaciones.filter((u) => !stockConsulta.almacenId || u.almacenId === stockConsulta.almacenId).map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}</select></label>
        <label className="field-label">Lote<input value={stockConsulta.lote} onChange={(e) => setStockConsulta((actual) => ({ ...actual, lote: e.target.value, pagina: 1 }))} className="field-control" placeholder="Número de lote" /></label>
        <label className="field-label">Vence desde<input type="date" value={stockConsulta.vencimientoDesde} onChange={(e) => setStockConsulta((actual) => ({ ...actual, vencimientoDesde: e.target.value, pagina: 1 }))} className="field-control" /></label>
        <label className="field-label">Vence hasta<input type="date" value={stockConsulta.vencimientoHasta} onChange={(e) => setStockConsulta((actual) => ({ ...actual, vencimientoHasta: e.target.value, pagina: 1 }))} className="field-control" /></label>
      </div>
      <EstadoListadoInventario cargando={listados.stock.isLoading} error={listados.stock.error} vacio={!saldos.length} mensajeVacio="No hay posiciones que coincidan con los filtros activos." alReintentar={() => void listados.stock.refetch()}>
      <div className={listados.stock.isFetching ? 'opacity-70' : undefined}><div className="overflow-x-auto"><table className="w-full min-w-[66rem] text-left text-sm"><thead><tr className="border-b bg-muted/45 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted-foreground">
        <th className="px-5 py-3">Producto</th><th className="px-4 py-3">Almacén / ubicación</th><th className="px-4 py-3">Lote / vencimiento</th><th className="px-4 py-3">Condición</th><th className="px-4 py-3 text-end">Cantidad</th><th className="px-5 py-3 text-end">Valor</th>
      </tr></thead><tbody className="divide-y">{saldos.map((saldo) => <tr key={`${saldo.productoId}-${saldo.almacenId}-${saldo.ubicacionId}-${saldo.estado}-${saldo.lote}-${saldo.fechaVencimiento}`}>
        <td className="px-5 py-4"><span className="font-mono text-xs text-primary">{saldo.productoCodigo}</span><p className="font-medium">{saldo.productoDescripcion}</p></td>
        <td className="px-4 py-4">{saldo.almacenNombre}<p className="text-xs text-muted-foreground">{saldo.ubicacionCodigo} · {saldo.ubicacionNombre}</p></td>
        <td className="px-4 py-4">{saldo.lote || 'Sin lote'}<p className="text-xs text-muted-foreground">{saldo.fechaVencimiento || 'Sin vencimiento'}</p></td>
        <td className="px-4 py-4"><span className="status-label" data-tone={saldo.estado === 'available' ? 'listo' : 'revision'}>{etiquetasEstadoStock[saldo.estado]}</span></td>
        <td className="px-4 py-4 text-end font-mono font-semibold">{formatoCantidad.format(saldo.cantidad)}</td><td className="px-5 py-4 text-end font-mono">{formatoMoneda.format(saldo.valorInventario)}</td>
      </tr>)}</tbody></table></div></div>
      </EstadoListadoInventario>
      {listados.stock.data ? <PaginacionInventario etiqueta="stock detallado" pagina={stockConsulta.pagina} tamanioPagina={stockConsulta.tamanioPagina} total={listados.stock.data.total} totalPaginas={listados.stock.data.totalPaginas} cantidadVisible={saldos.length} cargando={listados.stock.isFetching} alCambiarPagina={(pagina) => setStockConsulta((actual) => ({ ...actual, pagina }))} alCambiarTamanio={(tamanioPagina) => setStockConsulta((actual) => ({ ...actual, tamanioPagina, pagina: 1 }))} /> : null}
    </section>

    <section aria-labelledby="alertas-almacen" className="ledger-sheet">
      <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_14rem_12rem_12rem] xl:items-end"><div><h2 id="alertas-almacen" className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="size-5 text-[#9a6700]" />Alertas de stock mínimo</h2><p className="mt-1 text-sm text-muted-foreground">{listados.alertas.data?.total ?? 0} alertas activas.</p></div><label className="field-label">Buscar<input type="search" value={alertasConsulta.busqueda} onChange={(e) => setAlertasConsulta((actual) => ({ ...actual, busqueda: e.target.value, pagina: 1 }))} className="field-control" placeholder="Producto o código" /></label><label className="field-label">Almacén<select value={alertasConsulta.almacenId} onChange={(e) => setAlertasConsulta((actual) => ({ ...actual, almacenId: e.target.value, pagina: 1 }))} className="field-control"><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label className="field-label">Orden<select value={alertasConsulta.orden} onChange={(e) => setAlertasConsulta((actual) => ({ ...actual, orden: e.target.value as typeof actual.orden, pagina: 1 }))} className="field-control"><option value="producto-asc">Producto A–Z</option><option value="stock-asc">Menor asignable</option></select></label></div>
      <EstadoListadoInventario cargando={listados.alertas.isLoading} error={listados.alertas.error} vacio={!alertas.length} mensajeVacio="No hay alertas de stock mínimo para los filtros activos." alReintentar={() => void listados.alertas.refetch()}>
      <div className="grid gap-px bg-border md:grid-cols-2">{alertas.map((alerta) => <article key={`${alerta.productoId}-${alerta.almacenId}-stock`} className="bg-background px-5 py-5">
        <p className="font-medium">{alerta.productoDescripcion}</p><p className="mt-1 text-sm text-muted-foreground">{alerta.almacenNombre} · {alerta.lote || 'Sin lote'}</p>
        <div className="mt-3 flex flex-wrap gap-2">{alerta.alertaStockMinimo ? <span className="status-label" data-tone="revision">Asignable {formatoCantidad.format(alerta.cantidad)} / mínimo {formatoCantidad.format(alerta.stockMinimo)}</span> : null}{alerta.alertaVencimiento ? <span className="status-label" data-tone="revision">{alerta.estadoVencimiento === 'expired' ? 'Vencido' : alerta.estadoVencimiento === 'urgent' ? `Urgente · ${alerta.diasParaVencer} días` : `Próximo · ${alerta.diasParaVencer} días`}</span> : null}</div>
      </article>)}</div>
      </EstadoListadoInventario>
      {listados.alertas.data ? <PaginacionInventario etiqueta="alertas de stock" pagina={alertasConsulta.pagina} tamanioPagina={alertasConsulta.tamanioPagina} total={listados.alertas.data.total} totalPaginas={listados.alertas.data.totalPaginas} cantidadVisible={alertas.length} cargando={listados.alertas.isFetching} alCambiarPagina={(pagina) => setAlertasConsulta((actual) => ({ ...actual, pagina }))} alCambiarTamanio={(tamanioPagina) => setAlertasConsulta((actual) => ({ ...actual, tamanioPagina, pagina: 1 }))} /> : null}
    </section>

    <section aria-labelledby="vencimientos-almacen" className="ledger-sheet">
      <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_14rem_11rem_12rem] xl:items-end"><div><h2 id="vencimientos-almacen" className="text-lg font-semibold">Vencimientos</h2><p className="mt-1 text-sm text-muted-foreground">{listados.vencimientos.data?.total ?? 0} lotes vencidos o próximos a vencer.</p></div><label className="field-label">Buscar<input type="search" value={vencimientosConsulta.busqueda} onChange={(e) => setVencimientosConsulta((actual) => ({ ...actual, busqueda: e.target.value, pagina: 1 }))} className="field-control" placeholder="Producto o código" /></label><label className="field-label">Estado<select value={vencimientosConsulta.estadoVencimiento} onChange={(e) => setVencimientosConsulta((actual) => ({ ...actual, estadoVencimiento: e.target.value as typeof actual.estadoVencimiento, pagina: 1 }))} className="field-control"><option value="">Todos</option><option value="expired">Vencido</option><option value="urgent">Urgente</option><option value="upcoming">Próximo</option></select></label><label className="field-label">Orden<select value={vencimientosConsulta.orden} onChange={(e) => setVencimientosConsulta((actual) => ({ ...actual, orden: e.target.value as typeof actual.orden, pagina: 1 }))} className="field-control"><option value="vencimiento-asc">Más próximo</option><option value="vencimiento-desc">Más lejano</option></select></label></div>
      <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6 lg:grid-cols-3"><label className="field-label">Almacén<select value={vencimientosConsulta.almacenId} onChange={(e) => setVencimientosConsulta((actual) => ({ ...actual, almacenId: e.target.value, pagina: 1 }))} className="field-control"><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label className="field-label">Vence desde<input type="date" value={vencimientosConsulta.fechaDesde} onChange={(e) => setVencimientosConsulta((actual) => ({ ...actual, fechaDesde: e.target.value, pagina: 1 }))} className="field-control" /></label><label className="field-label">Vence hasta<input type="date" value={vencimientosConsulta.fechaHasta} onChange={(e) => setVencimientosConsulta((actual) => ({ ...actual, fechaHasta: e.target.value, pagina: 1 }))} className="field-control" /></label></div>
      <EstadoListadoInventario cargando={listados.vencimientos.isLoading} error={listados.vencimientos.error} vacio={!vencimientos.length} mensajeVacio="No hay vencimientos para los filtros activos." alReintentar={() => void listados.vencimientos.refetch()}>
      <div className="grid gap-px bg-border md:grid-cols-2">{vencimientos.map((alerta) => <article key={`${alerta.productoId}-${alerta.almacenId}-${alerta.ubicacionId}-${alerta.lote}-${alerta.fechaVencimiento}`} className="bg-background px-5 py-5"><p className="font-medium">{alerta.productoDescripcion}</p><p className="mt-1 text-sm text-muted-foreground">{alerta.almacenNombre} · {alerta.lote || 'Sin lote'} · {alerta.fechaVencimiento}</p><div className="mt-3"><span className="status-label" data-tone="revision">{alerta.estadoVencimiento === 'expired' ? 'Vencido' : alerta.estadoVencimiento === 'urgent' ? `Urgente · ${alerta.diasParaVencer} días` : `Próximo · ${alerta.diasParaVencer} días`}</span></div></article>)}</div>
      </EstadoListadoInventario>
      {listados.vencimientos.data ? <PaginacionInventario etiqueta="vencimientos" pagina={vencimientosConsulta.pagina} tamanioPagina={vencimientosConsulta.tamanioPagina} total={listados.vencimientos.data.total} totalPaginas={listados.vencimientos.data.totalPaginas} cantidadVisible={vencimientos.length} cargando={listados.vencimientos.isFetching} alCambiarPagina={(pagina) => setVencimientosConsulta((actual) => ({ ...actual, pagina }))} alCambiarTamanio={(tamanioPagina) => setVencimientosConsulta((actual) => ({ ...actual, tamanioPagina, pagina: 1 }))} /> : null}
    </section>

    {puedeGestionar ? <section aria-labelledby="operaciones-almacen" className="grid gap-6 xl:grid-cols-2">
      <h2 id="operaciones-almacen" className="sr-only">Operaciones de almacén</h2>
      <form className="ledger-sheet p-5 sm:p-6" onSubmit={guardarTransferencia}>
        <h3 className="flex items-center gap-2 font-semibold"><ArrowLeftRight className="size-5 text-primary" />Transferencia entre almacenes</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><label className="field-label" htmlFor="transferencia-referencia">Referencia</label><input id="transferencia-referencia" name="referencia" required className="field-control" placeholder="TR-0001" /></div>
          <div><label className="field-label" htmlFor="transferencia-producto">Producto</label><select id="transferencia-producto" name="productoId" className="field-control">{productos.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.descripcion}</option>)}</select></div>
          <div><label className="field-label" htmlFor="almacen-origen">Almacén origen</label><select id="almacen-origen" className="field-control" value={origenId} onChange={(e) => setOrigenId(e.target.value)}>{almacenes.filter((a) => a.activo).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
          <div><label className="field-label" htmlFor="ubicacion-origen">Ubicación origen</label><select id="ubicacion-origen" name="ubicacionOrigenId" className="field-control">{ubicacionesOrigen.map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}</select></div>
          <div><label className="field-label" htmlFor="almacen-destino">Almacén destino</label><select id="almacen-destino" className="field-control" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>{almacenes.filter((a) => a.activo).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
          <div><label className="field-label" htmlFor="ubicacion-destino">Ubicación destino</label><select id="ubicacion-destino" name="ubicacionDestinoId" className="field-control">{ubicacionesDestino.map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}</select></div>
          <div><label className="field-label" htmlFor="transferencia-cantidad">Cantidad</label><input id="transferencia-cantidad" name="cantidad" required inputMode="decimal" className="field-control" /></div>
          <div><label className="field-label" htmlFor="transferencia-lote">Lote</label><input id="transferencia-lote" name="lote" className="field-control" /></div>
          <div><label className="field-label" htmlFor="transferencia-vencimiento">Vencimiento</label><input id="transferencia-vencimiento" name="fechaVencimiento" type="date" className="field-control" /></div>
          <div><label className="field-label" htmlFor="transferencia-estado">Condición</label><select id="transferencia-estado" name="estado" className="field-control"><option value="available">Disponible</option><option value="quarantine">Cuarentena</option><option value="damaged">Dañado</option></select></div>
          <div className="sm:col-span-2"><label className="field-label" htmlFor="transferencia-notas">Notas</label><input id="transferencia-notas" name="notas" className="field-control" /></div>
        </div><Button className="mt-5" type="submit" disabled={!productos.length || almacenes.length < 2 || !ubicacionesOrigen.length || !ubicacionesDestino.length}>Confirmar transferencia</Button>
        {almacenes.length < 2 ? <p className="mt-3 text-sm text-muted-foreground">Crea un segundo almacén y su ubicación para habilitar transferencias.</p> : null}
      </form>

      <form className="ledger-sheet p-5 sm:p-6" onSubmit={guardarReclasificacion}>
        <h3 className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-5 text-primary" />Inmovilizar o liberar stock</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="field-label" htmlFor="reclasificar-producto">Producto</label><select id="reclasificar-producto" name="productoId" className="field-control">{productos.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.descripcion}</option>)}</select></div>
          <div><label className="field-label" htmlFor="reclasificar-almacen">Almacén</label><select id="reclasificar-almacen" name="almacenId" className="field-control" value={reclasificacionAlmacenId} onChange={(e) => setReclasificacionAlmacenId(e.target.value)}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
          <div><label className="field-label" htmlFor="reclasificar-ubicacion">Ubicación</label><select id="reclasificar-ubicacion" name="ubicacionId" className="field-control">{ubicaciones.filter((u) => u.almacenId === reclasificacionAlmacenId).map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}</select></div>
          <div><label className="field-label" htmlFor="estado-origen">Estado actual</label><select id="estado-origen" name="estadoOrigen" className="field-control"><option value="available">Disponible</option><option value="quarantine">Cuarentena</option><option value="damaged">Dañado</option></select></div>
          <div><label className="field-label" htmlFor="estado-destino">Nuevo estado</label><select id="estado-destino" name="estadoDestino" className="field-control"><option value="quarantine">Cuarentena</option><option value="damaged">Dañado</option><option value="available">Disponible</option></select></div>
          <div><label className="field-label" htmlFor="reclasificar-cantidad">Cantidad</label><input id="reclasificar-cantidad" name="cantidad" required className="field-control" /></div>
          <div><label className="field-label" htmlFor="reclasificar-lote">Lote</label><input id="reclasificar-lote" name="lote" className="field-control" /></div>
          <div><label className="field-label" htmlFor="reclasificar-vencimiento">Vencimiento</label><input id="reclasificar-vencimiento" name="fechaVencimiento" type="date" className="field-control" /></div>
          <div><label className="field-label" htmlFor="reclasificar-motivo">Motivo</label><input id="reclasificar-motivo" name="motivo" required className="field-control" placeholder="Daño, inspección o liberación" /></div>
        </div><Button className="mt-5" type="submit" disabled={(listados.stock.data?.total ?? 0) === 0}>Aplicar reclasificación</Button>
        {(listados.stock.data?.total ?? 0) === 0 ? <p className="mt-3 text-sm text-muted-foreground">Registra una entrada para poder inmovilizar o liberar stock.</p> : null}
      </form>
    </section> : null}

    {puedeGestionar ? <section aria-labelledby="maestros-almacen" className="ledger-sheet">
      <div className="border-b px-5 py-5 sm:px-6"><h2 id="maestros-almacen" className="flex items-center gap-2 text-lg font-semibold"><Warehouse className="size-5 text-primary" />Maestros y políticas</h2></div>
      <div className="grid gap-px bg-border lg:grid-cols-3">
        <form className="bg-background p-5" onSubmit={guardarAlmacen}><h3 className="font-medium">Nuevo almacén</h3><div className="mt-4 space-y-3"><label className="field-label">Código<input name="codigo" required className="field-control" placeholder="CENTRAL" /></label><label className="field-label">Nombre<input name="nombre" required className="field-control" placeholder="Almacén central" /></label><label className="field-label">Dirección<input name="direccion" className="field-control" placeholder="Dirección física" /></label></div><Button className="mt-4" variant="outline">Crear almacén</Button></form>
        <form className="bg-background p-5" onSubmit={guardarUbicacion}><h3 className="flex items-center gap-2 font-medium"><MapPin className="size-4" />Nueva ubicación</h3><div className="mt-4 space-y-3"><label className="field-label">Almacén<select name="almacenId" className="field-control">{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label className="field-label">Código<input name="codigo" required className="field-control" placeholder="A-01-N2" /></label><label className="field-label">Nombre<input name="nombre" required className="field-control" placeholder="Pasillo / anaquel" /></label><label className="field-label">Descripción<input name="descripcion" className="field-control" placeholder="Referencia física" /></label></div><Button className="mt-4" variant="outline">Crear ubicación</Button></form>
        <form className="bg-background p-5" onSubmit={guardarConfiguracion}><h3 className="flex items-center gap-2 font-medium"><Boxes className="size-4" />Política de alertas</h3><div className="mt-4 space-y-3"><label className="field-label">Producto<select name="productoId" className="field-control">{productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.descripcion}</option>)}</select></label><label className="field-label">Almacén<select name="almacenId" className="field-control" value={politicaAlmacenId} onChange={(e) => setPoliticaAlmacenId(e.target.value)}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label className="field-label">Ubicación predeterminada<select name="ubicacionId" className="field-control">{ubicaciones.filter((u) => u.almacenId === politicaAlmacenId).map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}</select></label><label className="field-label">Stock mínimo<input name="stockMinimo" type="number" min="0" step="0.001" className="field-control" placeholder="0" /></label><label className="field-label">Alerta de vencimiento (días)<input name="diasVencimiento" type="number" min="0" max="3650" defaultValue="30" className="field-control" /></label></div><Button className="mt-4" variant="outline" disabled={!productos.length}>Guardar política</Button></form>
      </div>
    </section> : null}

    <section aria-labelledby="kardex-title" className="ledger-sheet">
      <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_14rem_12rem_12rem] xl:items-end"><div><h2 id="kardex-title" className="text-lg font-semibold">Kardex valorizado</h2><p className="mt-1 text-sm text-muted-foreground">{listados.kardex.data?.total ?? 0} movimientos · orden determinista por fecha y secuencia.</p></div><label className="field-label">Buscar<input type="search" value={kardexConsulta.busqueda} onChange={(e) => setKardexConsulta((actual) => ({ ...actual, busqueda: e.target.value, pagina: 1 }))} className="field-control" placeholder="Producto o código" /></label><label className="field-label">Almacén<select value={kardexConsulta.almacenId} onChange={(e) => setKardexConsulta((actual) => ({ ...actual, almacenId: e.target.value, pagina: 1 }))} className="field-control"><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label className="field-label">Orden<select value={kardexConsulta.orden} onChange={(e) => setKardexConsulta((actual) => ({ ...actual, orden: e.target.value as typeof actual.orden, pagina: 1 }))} className="field-control"><option value="fecha-desc">Más reciente</option><option value="fecha-asc">Más antiguo</option></select></label></div>
      <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6 sm:grid-cols-2"><label className="field-label">Fecha desde<input type="date" value={kardexConsulta.fechaDesde} onChange={(e) => setKardexConsulta((actual) => ({ ...actual, fechaDesde: e.target.value, pagina: 1 }))} className="field-control" /></label><label className="field-label">Fecha hasta<input type="date" value={kardexConsulta.fechaHasta} onChange={(e) => setKardexConsulta((actual) => ({ ...actual, fechaHasta: e.target.value, pagina: 1 }))} className="field-control" /></label></div>
      <EstadoListadoInventario cargando={listados.kardex.isLoading} error={listados.kardex.error} vacio={!kardex.length} mensajeVacio="No hay movimientos de Kardex para los filtros activos." alReintentar={() => void listados.kardex.refetch()}>
      <div className="overflow-x-auto"><table className="w-full min-w-[72rem] text-left text-sm"><thead><tr className="border-b bg-muted/45 font-mono text-[0.68rem] uppercase text-muted-foreground"><th className="px-5 py-3">Fecha</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Referencia</th><th className="px-4 py-3 text-end">Entrada</th><th className="px-4 py-3 text-end">Salida</th><th className="px-4 py-3 text-end">Costo</th><th className="px-4 py-3 text-end">Saldo</th><th className="px-5 py-3 text-end">Valor saldo</th></tr></thead><tbody className="divide-y">{kardex.map((movimiento) => <tr key={movimiento.id}><td className="px-5 py-4 font-mono text-xs">{movimiento.fechaOperacion}</td><td className="px-4 py-4"><span className="font-mono text-xs">{movimiento.productoCodigo}</span><p>{movimiento.productoDescripcion}</p></td><td className="px-4 py-4">{movimiento.motivo}<p className="text-xs text-muted-foreground">{movimiento.almacen} · {movimiento.lote || 'Sin lote'}</p></td><td className="px-4 py-4 text-end font-mono">{movimiento.cantidadEntrada || '—'}</td><td className="px-4 py-4 text-end font-mono">{movimiento.cantidadSalida || '—'}</td><td className="px-4 py-4 text-end font-mono">{formatoMoneda.format(movimiento.costoUnitario)}</td><td className="px-4 py-4 text-end font-mono font-semibold">{formatoCantidad.format(movimiento.saldoCantidad)}</td><td className="px-5 py-4 text-end font-mono">{formatoMoneda.format(movimiento.saldoValor)}</td></tr>)}</tbody></table></div>
      </EstadoListadoInventario>
      {listados.kardex.data ? <PaginacionInventario etiqueta="Kardex" pagina={kardexConsulta.pagina} tamanioPagina={kardexConsulta.tamanioPagina} total={listados.kardex.data.total} totalPaginas={listados.kardex.data.totalPaginas} cantidadVisible={kardex.length} cargando={listados.kardex.isFetching} alCambiarPagina={(pagina) => setKardexConsulta((actual) => ({ ...actual, pagina }))} alCambiarTamanio={(tamanioPagina) => setKardexConsulta((actual) => ({ ...actual, tamanioPagina, pagina: 1 }))} /> : null}
    </section>

    <section aria-labelledby="transferencias-title" className="ledger-sheet"><div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_14rem_12rem_12rem] xl:items-end"><div><h2 id="transferencias-title" className="text-lg font-semibold">Historial de transferencias</h2><p className="mt-1 text-sm text-muted-foreground">{listados.transferencias.data?.total ?? 0} transferencias persistentes.</p></div><label className="field-label">Buscar<input type="search" value={transferenciasConsulta.busqueda} onChange={(e) => setTransferenciasConsulta((actual) => ({ ...actual, busqueda: e.target.value, pagina: 1 }))} className="field-control" placeholder="Referencia o nota" /></label><label className="field-label">Almacén<select value={transferenciasConsulta.almacenId} onChange={(e) => setTransferenciasConsulta((actual) => ({ ...actual, almacenId: e.target.value, pagina: 1 }))} className="field-control"><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label className="field-label">Orden<select value={transferenciasConsulta.orden} onChange={(e) => setTransferenciasConsulta((actual) => ({ ...actual, orden: e.target.value as typeof actual.orden, pagina: 1 }))} className="field-control"><option value="fecha-desc">Más reciente</option><option value="fecha-asc">Más antigua</option></select></label></div><div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6 sm:grid-cols-2"><label className="field-label">Fecha desde<input type="date" value={transferenciasConsulta.fechaDesde} onChange={(e) => setTransferenciasConsulta((actual) => ({ ...actual, fechaDesde: e.target.value, pagina: 1 }))} className="field-control" /></label><label className="field-label">Fecha hasta<input type="date" value={transferenciasConsulta.fechaHasta} onChange={(e) => setTransferenciasConsulta((actual) => ({ ...actual, fechaHasta: e.target.value, pagina: 1 }))} className="field-control" /></label></div><EstadoListadoInventario cargando={listados.transferencias.isLoading} error={listados.transferencias.error} vacio={!transferencias.length} mensajeVacio="No hay transferencias para los filtros activos." alReintentar={() => void listados.transferencias.refetch()}><div className="divide-y">{transferencias.map((transferencia) => <article key={transferencia.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-mono text-sm font-semibold">{transferencia.referencia}</p><p className="text-sm text-muted-foreground">{nombreAlmacen(transferencia.almacenOrigenId)} → {nombreAlmacen(transferencia.almacenDestinoId)}</p></div><time className="text-xs text-muted-foreground">{new Date(transferencia.fechaTransferencia).toLocaleString('es-PE')}</time></article>)}</div></EstadoListadoInventario>{listados.transferencias.data ? <PaginacionInventario etiqueta="transferencias" pagina={transferenciasConsulta.pagina} tamanioPagina={transferenciasConsulta.tamanioPagina} total={listados.transferencias.data.total} totalPaginas={listados.transferencias.data.totalPaginas} cantidadVisible={transferencias.length} cargando={listados.transferencias.isFetching} alCambiarPagina={(pagina) => setTransferenciasConsulta((actual) => ({ ...actual, pagina }))} alCambiarTamanio={(tamanioPagina) => setTransferenciasConsulta((actual) => ({ ...actual, tamanioPagina, pagina: 1 }))} /> : null}</section>
  </div>
}
