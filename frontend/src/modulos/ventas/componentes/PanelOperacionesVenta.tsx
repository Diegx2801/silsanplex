import { Ban, ClipboardCheck, Eye, PackageCheck, Pencil, ReceiptText, Search } from 'lucide-react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import { useDeferredValue, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { PaginacionListado, type TamanioPaginaListado } from '@/components/ui/PaginacionListado'
import { fechaPeruDesdeTimestamp, formatearFechaCalendarioPeru } from '@/lib/fechas'
import { DialogoDespachoPersistente } from '@/modulos/ventas/componentes/DialogoDespachoPersistente'
import { DialogoCumplimientoServicios } from '@/modulos/ventas/componentes/DialogoCumplimientoServicios'
import { DialogoDetalleOperacionVenta } from '@/modulos/ventas/componentes/DialogoDetalleOperacionVenta'
import { DialogoModificacionPedido } from '@/modulos/ventas/componentes/DialogoModificacionPedido'
import { DialogoRegistroVenta } from '@/modulos/ventas/componentes/DialogoRegistroVenta'
import {
  estadoOperacionVenta,
  etiquetasEstadoOperacionVenta,
  etiquetaEstadoLogisticoPedido,
  type EstadoOperacionVenta,
} from '@/modulos/ventas/modelo/estadoCumplimientoPedido'
import type {
  DatosVenta,
  PedidoVenta,
  Venta,
} from '@/modulos/ventas/modelo/operacionVenta'
import type { CantidadLineaPedido } from '@/modulos/ventas/servicios/ventasService'
import type { CantidadDespacho } from '@/modulos/ventas/servicios/ventasService'
import type { CantidadCumplimientoServicio } from '@/modulos/ventas/servicios/ventasService'

interface AlmacenOperacion {
  id: string
  nombre: string
}

function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE')
}

const formatoMoneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })

function fechaPedidoOperacion(pedido: PedidoVenta) {
  return pedido.fechaPedido ?? fechaPeruDesdeTimestamp(pedido.fechaRegistro)
}

function etiquetaCumplimiento(
  bienes: Venta['lineas'],
  servicios: Venta['lineas'],
) {
  const bienesDespachados = bienes.length > 0
    && bienes.every((linea) => (linea.cantidadDespachada ?? 0) >= linea.cantidad)
  const serviciosCompletados = servicios.length > 0
    && servicios.every((linea) => (linea.cantidadCompletadaServicio ?? 0) >= linea.cantidad)

  if (bienes.length > 0 && servicios.length > 0) {
    if (bienesDespachados && serviciosCompletados) return 'Bienes despachados y servicios completados'
    if (bienesDespachados) return 'Bienes despachados y servicios pendientes'
    if (serviciosCompletados) return 'Servicios completados y bienes pendientes'
    return 'Cumplimiento pendiente'
  }
  if (servicios.length > 0) return serviciosCompletados ? 'Servicio completado' : 'Servicio pendiente'
  if (bienes.length > 0) return bienesDespachados ? 'Stock descontado' : 'Despacho pendiente'
  return 'Cumplimiento registrado'
}

interface PanelOperacionesVentaProps {
  pedidos: readonly PedidoVenta[]
  ventas: readonly Venta[]
  almacenes?: readonly AlmacenOperacion[]
  buscarAlmacenes?: (busqueda: string) => Promise<readonly AlmacenOperacion[]>
  alRegistrarVenta?: (pedidoId: string, datos: DatosVenta) => string | undefined | Promise<string | undefined>
  alActualizarPedido?: (pedidoId: string, lineas: readonly CantidadLineaPedido[], operationKey: string) => string | undefined | Promise<string | undefined>
  alCancelarPedido?: (pedidoId: string, operationKey: string) => string | undefined | Promise<string | undefined>
  alDespacharVenta?: (pedidoId: string, ventaId: string, lineas: readonly CantidadDespacho[], operationKey: string, operationDate: string) => string | undefined | Promise<string | undefined>
  alCompletarServicios?: (pedidoId: string, ventaId: string, lineas: readonly CantidadCumplimientoServicio[], operationKey: string) => string | undefined | Promise<string | undefined>
  alNotificar: (mensaje: string) => void
  cargando?: boolean
  error?: unknown
  alReintentar?: () => Promise<unknown>
  actualizandoPedido?: boolean
  cancelandoPedido?: boolean
  despachandoVenta?: boolean
  completandoServicios?: boolean
}

export function PanelOperacionesVenta({
  pedidos,
  ventas,
  almacenes = [],
  buscarAlmacenes,
  alRegistrarVenta,
  alActualizarPedido,
  alCancelarPedido,
  alDespacharVenta,
  alCompletarServicios,
  alNotificar,
  cargando = false,
  error,
  alReintentar,
  actualizandoPedido = false,
  cancelandoPedido = false,
  despachandoVenta = false,
  completandoServicios = false,
}: PanelOperacionesVentaProps) {
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<PedidoVenta | null>(null)
  const [pedidoPorModificar, setPedidoPorModificar] = useState<PedidoVenta | null>(null)
  const [pedidoPorCancelar, setPedidoPorCancelar] = useState<PedidoVenta | null>(null)
  const [errorCancelacion, setErrorCancelacion] = useState('')
  const [ventaPorDespachar, setVentaPorDespachar] = useState<Venta | null>(null)
  const [ventaPorCompletarServicios, setVentaPorCompletarServicios] = useState<Venta | null>(null)
  const [pedidoPorConsultar, setPedidoPorConsultar] = useState<PedidoVenta | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<EstadoOperacionVenta>('todos')
  const [filtroAlmacen, setFiltroAlmacen] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [pagina, setPagina] = useState(1)
  const [tamanioPagina, setTamanioPagina] = useState<TamanioPaginaListado>(10)
  const rangoFechasInvalido = Boolean(fechaDesde && fechaHasta && fechaDesde > fechaHasta)
  const claveCancelacion = useRef<string | null>(null)
  const disparadorDetalle = useRef<HTMLButtonElement | null>(null)
  const ventasPorPedido = useMemo(
    () => new Map(ventas.map((venta) => [venta.pedidoId, venta])),
    [ventas],
  )
  const resumenEstados = useMemo(() => {
    const resumen = { porDespachar: 0, porEntregar: 0, serviciosPendientes: 0, completados: 0 }
    for (const pedido of pedidos) {
      const venta = ventasPorPedido.get(pedido.id)
      const estado = estadoOperacionVenta(pedido, venta)
      if (estado === 'por-despachar' || estado === 'despacho-parcial') resumen.porDespachar += 1
      if (estado === 'por-entregar' || estado === 'entrega-parcial') resumen.porEntregar += 1
      if (estado === 'servicios-pendientes') resumen.serviciosPendientes += 1
      if (estado === 'completado') resumen.completados += 1
    }
    return resumen
  }, [pedidos, ventasPorPedido])
  const pedidosOrdenados = useMemo(
    () => pedidos.toSorted((a, b) => {
      const diferenciaFecha = fechaPedidoOperacion(b).localeCompare(fechaPedidoOperacion(a))
      return diferenciaFecha || b.fechaRegistro.localeCompare(a.fechaRegistro)
    }),
    [pedidos],
  )
  const opcionesAlmacenes = useMemo<ComboboxOption[]>(
    () => almacenes.map((almacen) => ({
      value: almacen.id,
      label: almacen.nombre,
      keywords: [almacen.nombre],
    })),
    [almacenes],
  )
  const busquedaDiferida = useDeferredValue(busqueda)
  const operacionesFiltradas = useMemo(() => {
    if (rangoFechasInvalido) return []
    const termino = normalizar(busquedaDiferida.trim())
    return pedidosOrdenados.filter((pedido) => {
      const venta = ventasPorPedido.get(pedido.id)
      const estado = estadoOperacionVenta(pedido, venta)
      const texto = normalizar([
        pedido.numero,
        pedido.cotizacionNumero,
        pedido.clienteNombre,
        pedido.clienteDocumento,
        pedido.almacenNombre ?? '',
        ...(pedido.lineas.flatMap((linea) => [linea.productoCodigo, linea.productoDescripcion])),
        venta?.numeroInterno ?? '',
        venta ? `${venta.serie}-${venta.numeroDocumento}` : '',
      ].join(' '))
      const fecha = fechaPedidoOperacion(pedido)
      return (
        (filtroEstado === 'todos' || estado === filtroEstado)
        && (!filtroAlmacen || pedido.almacenId === filtroAlmacen)
        && (!fechaDesde || fecha >= fechaDesde)
        && (!fechaHasta || fecha <= fechaHasta)
        && (!termino || texto.includes(termino))
      )
    })
  }, [busquedaDiferida, fechaDesde, fechaHasta, filtroAlmacen, filtroEstado, pedidosOrdenados, rangoFechasInvalido, ventasPorPedido])
  const totalPaginas = Math.max(1, Math.ceil(operacionesFiltradas.length / tamanioPagina))
  const paginaVisible = Math.min(pagina, totalPaginas)
  const pedidosVisibles = operacionesFiltradas.slice(
    (paginaVisible - 1) * tamanioPagina,
    paginaVisible * tamanioPagina,
  )

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroEstado('todos')
    setFiltroAlmacen('')
    setFechaDesde('')
    setFechaHasta('')
    setPagina(1)
  }

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
          <span className="border px-2.5 py-1.5">{resumenEstados.porDespachar} {resumenEstados.porDespachar === 1 ? 'despacho pendiente' : 'despachos pendientes'}</span>
          <span className="border px-2.5 py-1.5">{resumenEstados.porEntregar} {resumenEstados.porEntregar === 1 ? 'entrega pendiente' : 'entregas pendientes'}</span>
          <span className="border px-2.5 py-1.5">{resumenEstados.serviciosPendientes} {resumenEstados.serviciosPendientes === 1 ? 'servicio pendiente' : 'servicios pendientes'}</span>
          <span className="border px-2.5 py-1.5">{resumenEstados.completados} completados</span>
        </div>
      </div>

      <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[minmax(18rem,1fr)_14rem_14rem] lg:items-end">
        <div>
          <label htmlFor="buscar-operacion-venta" className="field-label">Buscar</label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="buscar-operacion-venta"
              type="search"
              value={busqueda}
              onChange={(evento) => { setBusqueda(evento.target.value); setPagina(1) }}
              className="field-control ps-9"
              placeholder="Pedido, cliente, producto o comprobante"
            />
          </div>
        </div>
        <div>
          <label htmlFor="estado-operacion-venta" className="field-label">Estado operativo</label>
          <select
            id="estado-operacion-venta"
            value={filtroEstado}
            onChange={(evento) => { setFiltroEstado(evento.target.value as EstadoOperacionVenta); setPagina(1) }}
            className="field-control"
          >
            {(Object.entries(etiquetasEstadoOperacionVenta) as Array<[EstadoOperacionVenta, string]>).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>{etiqueta}</option>
            ))}
          </select>
        </div>
        <Combobox
          id="almacen-operacion-venta"
          label="Almacén"
          value={filtroAlmacen}
          options={opcionesAlmacenes}
          loadOptions={buscarAlmacenes ? async (busqueda) => (await buscarAlmacenes(busqueda)).map((almacen) => ({
            value: almacen.id,
            label: almacen.nombre,
            keywords: [almacen.nombre],
          })) : undefined}
          onChange={(valor) => { setFiltroAlmacen(valor); setPagina(1) }}
          placeholder="Todos los almacenes"
          noOptionsMessage="No hay almacenes disponibles."
        />
      </div>
      <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-[14rem_14rem_1fr] lg:items-end">
        <div>
          <label htmlFor="fecha-desde-operacion-venta" className="field-label">Fecha desde</label>
          <input id="fecha-desde-operacion-venta" type="date" value={fechaDesde} aria-invalid={rangoFechasInvalido} onChange={(evento) => { setFechaDesde(evento.target.value); setPagina(1) }} className="field-control" />
        </div>
        <div>
          <label htmlFor="fecha-hasta-operacion-venta" className="field-label">Fecha hasta</label>
          <input id="fecha-hasta-operacion-venta" type="date" value={fechaHasta} aria-invalid={rangoFechasInvalido} onChange={(evento) => { setFechaHasta(evento.target.value); setPagina(1) }} className="field-control" />
        </div>
        <div className="flex items-end justify-end">
          {(busqueda || filtroEstado !== 'todos' || filtroAlmacen || fechaDesde || fechaHasta) ? (
            <Button type="button" variant="ghost" onClick={limpiarFiltros}>Limpiar filtros</Button>
          ) : null}
        </div>
      </div>
      {rangoFechasInvalido ? (
        <p role="alert" className="border-b border-s-4 border-destructive bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-6">
          La fecha desde no puede ser posterior a la fecha hasta.
        </p>
      ) : null}

      <div className="border-b px-5 py-4 text-sm text-muted-foreground sm:px-6">
        {operacionesFiltradas.length} de {pedidos.length} operaciones visibles
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
      ) : !pedidosVisibles.length ? (
        <div className="px-5 py-14 text-center sm:px-6">
          <ClipboardCheck aria-hidden="true" className="mx-auto size-8 text-primary" />
          <h3 className="mt-4 font-semibold">No hay operaciones que coincidan</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Prueba con otro término o limpia los filtros activos.</p>
          <Button type="button" variant="outline" className="mt-5" onClick={limpiarFiltros}>Limpiar filtros</Button>
        </div>
      ) : (
        <div className="divide-y">
          {pedidosVisibles.map((pedido) => {
            const venta = ventasPorPedido.get(pedido.id)
            const fiscalCalculado = pedido.estadoCalculoTributario === 'calculated'
            const bienes = venta?.lineas.filter((linea) => linea.tipoProducto === 'good') ?? []
            const servicios = venta?.lineas.filter((linea) => linea.tipoProducto === 'service') ?? []
            const totalCumplido = (lineas: Venta['lineas']) => lineas.reduce((totalLinea, linea) => totalLinea + (linea.tipoProducto === 'service' ? (linea.cantidadCompletadaServicio ?? 0) : (linea.cantidadDespachada ?? 0)), 0)
            const totalPendiente = (lineas: Venta['lineas']) => lineas.reduce((totalLinea, linea) => totalLinea + (linea.cantidadPendiente ?? linea.cantidad), 0)
            const cumplimiento = venta ? etiquetaCumplimiento(bienes, servicios) : ''
            const estadoLogistico = etiquetaEstadoLogisticoPedido(pedido, venta)
            const soloServicios = servicios.length > 0 && bienes.length === 0
            return (
              <article key={pedido.id} className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(15rem,1fr)_minmax(20rem,1.35fr)_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs text-primary">{pedido.numero}</p>
                    <span className="status-label" data-tone={pedido.estado === 'atendido' ? 'listo' : 'revision'}>{pedido.estado}</span>
                  </div>
                  <h3 className="mt-2 font-semibold">{pedido.clienteNombre}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Origen: {pedido.cotizacionNumero} · {formatearFechaCalendarioPeru(fechaPedidoOperacion(pedido))}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Almacén: {pedido.almacenNombre ?? 'No definido (histórico)'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Cumplimiento: {pedido.modalidadCumplimiento === 'pickup' ? 'Recojo del cliente' : 'Entrega al cliente'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Estado logístico: {estadoLogistico}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 border-y py-3 text-sm lg:border-y-0 lg:border-s lg:ps-5">
                  <div><p className="text-xs text-muted-foreground">Productos</p><p className="mt-1 font-mono">{pedido.lineas.length}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-mono font-semibold">{formatoMoneda.format(pedido.total)}</p></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Documento</p>
                    <p className="mt-1 truncate font-mono text-xs">{venta ? `${venta.serie}-${venta.numeroDocumento}` : 'Pendiente'}</p>
                    {venta ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Bienes {totalCumplido(bienes)} / pendiente {totalPendiente(bienes)} · servicios {totalCumplido(servicios)} / pendiente {totalPendiente(servicios)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={(evento) => { disparadorDetalle.current = evento.currentTarget; setPedidoPorConsultar(pedido) }}>
                    <Eye aria-hidden="true" /> Ver detalle
                  </Button>
                  {!venta && pedido.estado === 'confirmado' && !fiscalCalculado ? (
                    <span className="text-sm font-medium text-muted-foreground">Cálculo tributario {pedido.estadoCalculoTributario === 'pending' ? 'pendiente' : 'no reconstruible'}</span>
                  ) : !venta && pedido.estado === 'confirmado' ? (
                    alRegistrarVenta ? (
                      <Button type="button" onClick={() => setPedidoSeleccionado(pedido)}><ReceiptText aria-hidden="true" /> Registrar venta</Button>
                    ) : <span className="text-sm font-medium text-muted-foreground">Solo consulta</span>
                  ) : venta?.estado === 'registrada' && venta.estadoCalculoTributario !== 'calculated' ? (
                    <span className="text-sm font-medium text-muted-foreground">Cálculo tributario {venta.estadoCalculoTributario === 'pending' ? 'pendiente' : 'no reconstruible'}</span>
                  ) : venta?.estado === 'registrada' ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      {alCompletarServicios && venta.lineas.some((linea) => linea.tipoProducto === 'service' && (linea.cantidadPendiente ?? linea.cantidad) > 0) ? (
                        <Button type="button" variant="outline" disabled={completandoServicios} onClick={() => setVentaPorCompletarServicios(venta)}>
                          <ClipboardCheck aria-hidden="true" /> Completar servicios
                        </Button>
                      ) : null}
                      {venta.lineas.some((linea) => linea.tipoProducto === 'good' && (linea.cantidadPendiente ?? linea.cantidad) > 0) ? (
                        alDespacharVenta ? (
                          <Button type="button" disabled={despachandoVenta} onClick={() => setVentaPorDespachar(venta)}>
                            <PackageCheck aria-hidden="true" /> Despachar bienes
                          </Button>
                        ) : <Button type="button" disabled title="El despacho canónico requiere configuración"><PackageCheck aria-hidden="true" /> Despacho pendiente</Button>
                      ) : null}
                    </div>
                  ) : venta?.estado === 'despachada' ? (
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                      {soloServicios
                        ? <ClipboardCheck aria-hidden="true" className="size-4" />
                        : <PackageCheck aria-hidden="true" className="size-4" />}
                      {cumplimiento}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">Pedido cancelado</span>
                  )}
                </div>
                {!venta && pedido.estado === 'confirmado' && (alActualizarPedido || alCancelarPedido) ? (
                  <div className="flex flex-wrap gap-2 lg:col-start-3 lg:justify-end">
                    {alActualizarPedido ? (
                      <Button type="button" variant="outline" size="sm" disabled={actualizandoPedido || cancelandoPedido || !fiscalCalculado} onClick={() => setPedidoPorModificar(pedido)}>
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
      {operacionesFiltradas.length ? (
        <PaginacionListado
          etiqueta="operaciones comerciales"
          pagina={paginaVisible}
          tamanioPagina={tamanioPagina}
          total={operacionesFiltradas.length}
          totalPaginas={totalPaginas}
          cantidadVisible={pedidosVisibles.length}
          alCambiarPagina={setPagina}
          alCambiarTamanio={(siguiente) => { setTamanioPagina(siguiente); setPagina(1) }}
        />
      ) : null}

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

      {pedidoPorConsultar ? (
        <DialogoDetalleOperacionVenta
          abierto
          pedido={pedidoPorConsultar}
          venta={ventasPorPedido.get(pedidoPorConsultar.id)}
          alCambiarApertura={(abierto) => { if (!abierto) setPedidoPorConsultar(null) }}
          alRestaurarFoco={() => disparadorDetalle.current?.focus()}
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
              const soloServicios = ventaPorDespachar.lineas.length > 0
                && ventaPorDespachar.lineas.every((linea) => linea.tipoProducto === 'service')
              alNotificar(`${ventaPorDespachar.numeroInterno}: ${soloServicios ? 'atención comercial registrada.' : 'despacho registrado y stock actualizado.'}`)
            }
            return error
          }}
        />
      ) : null}

      {ventaPorCompletarServicios && alCompletarServicios ? (
        <DialogoCumplimientoServicios
          abierto
          venta={ventaPorCompletarServicios}
          guardando={completandoServicios}
          alCambiarApertura={(abierto) => { if (!abierto && !completandoServicios) setVentaPorCompletarServicios(null) }}
          alGuardar={async (lineas, operationKey) => {
            const error = await alCompletarServicios(ventaPorCompletarServicios.pedidoId, ventaPorCompletarServicios.id, lineas, operationKey)
            if (!error) alNotificar(`${ventaPorCompletarServicios.numeroInterno}: cumplimiento de servicios registrado.`)
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
