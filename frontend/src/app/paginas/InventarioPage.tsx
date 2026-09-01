import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardList,
  PackageCheck,
  PackageX,
  Plus,
  Search,
} from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { DialogoMovimientoInventario } from '@/modulos/inventario/componentes/DialogoMovimientoInventario'
import { EstadoListadoInventario } from '@/modulos/inventario/componentes/EstadoListadoInventario'
import { PaginacionInventario } from '@/modulos/inventario/componentes/PaginacionInventario'
import { PanelGestionAlmacenes } from '@/modulos/inventario/componentes/PanelGestionAlmacenes'
import { useAlmacenes } from '@/modulos/inventario/estado/useAlmacenes'
import { useDebounceInventario } from '@/modulos/inventario/estado/useDebounceInventario'
import { useInventario } from '@/modulos/inventario/estado/useInventario'
import {
  movimientoEsSalida,
  tiposMovimientoInventario,
  type DatosMovimientoInventario,
  type ExistenciaInventario,
  type FiltroStockInventario,
  type MovimientoInventario,
  type OrdenExistenciasInventario,
} from '@/modulos/inventario/modelo/inventario'
import type { TamanioPaginaInventario } from '@/modulos/inventario/modelo/paginacionInventario'
import { useProductos } from '@/modulos/productos/estado/useProductos'

const formatoCantidad = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 3,
})
const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function etiquetaTipo(tipo: MovimientoInventario['tipo']) {
  return tiposMovimientoInventario.find((item) => item.valor === tipo)!.etiqueta
}

function EstadoStock({ existencia }: { existencia: ExistenciaInventario }) {
  const tieneStock = existencia.stockAsignable > 0

  return (
    <span className="status-label" data-tone={tieneStock ? 'listo' : 'revision'}>
      {tieneStock ? 'Disponible' : 'Sin stock'}
    </span>
  )
}

function MovimientoFila({ movimiento }: { movimiento: MovimientoInventario }) {
  const esSalida = movimientoEsSalida(movimiento.tipo)
  const Icono = esSalida ? ArrowUpFromLine : ArrowDownToLine

  return (
    <article className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${
            esSalida
              ? 'bg-[#f4e7c6] text-[#79520d]'
              : 'bg-accent text-primary'
          }`}
        >
          <Icono aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-medium">{movimiento.productoDescripcion}</h3>
            <span className="font-mono text-xs text-muted-foreground">
              {movimiento.productoCodigo}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {movimiento.motivo} · {movimiento.almacen}
            {movimiento.lote ? ` · Lote ${movimiento.lote}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 lg:block lg:text-end">
        <p
          className={`font-mono text-sm font-semibold tabular-nums ${
            esSalida ? 'text-[#79520d]' : 'text-primary'
          }`}
        >
          {esSalida ? '−' : '+'}
          {formatoCantidad.format(movimiento.cantidad)}{' '}
          <span className="font-sans text-xs font-normal text-muted-foreground">
            {movimiento.unidadMedida || 'unid.'}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {etiquetaTipo(movimiento.tipo)} ·{' '}
          {formatoFecha.format(new Date(`${movimiento.fechaOperacion}T12:00:00`))}
        </p>
      </div>
    </article>
  )
}

export function InventarioPage() {
  const { hasPermission } = useAuth()
  const puedeGestionar = hasPermission(PERMISSIONS.INVENTORY_MANAGE)
  const { productos } = useProductos()
  const productosActivos = useMemo(
    () => productos.filter((producto) => producto.activo),
    [productos],
  )
  const [busqueda, setBusqueda] = useState('')
  const busquedaDebounced = useDebounceInventario(busqueda)
  const [filtroStock, setFiltroStock] = useState<FiltroStockInventario>('todos')
  const [ordenExistencias, setOrdenExistencias] = useState<OrdenExistenciasInventario>('producto-asc')
  const [paginaExistencias, setPaginaExistencias] = useState(1)
  const [tamanioExistencias, setTamanioExistencias] = useState<TamanioPaginaInventario>(25)
  const [busquedaMovimientos, setBusquedaMovimientos] = useState('')
  const busquedaMovimientosDebounced = useDebounceInventario(busquedaMovimientos)
  const [paginaMovimientos, setPaginaMovimientos] = useState(1)
  const [tamanioMovimientos, setTamanioMovimientos] = useState<TamanioPaginaInventario>(25)
  const [tipoMovimiento, setTipoMovimiento] = useState<MovimientoInventario['tipo'] | ''>('')
  const [almacenMovimientos, setAlmacenMovimientos] = useState('')
  const [fechaMovimientosDesde, setFechaMovimientosDesde] = useState('')
  const [fechaMovimientosHasta, setFechaMovimientosHasta] = useState('')
  const inventario = useInventario({
    existencias: {
      pagina: paginaExistencias,
      tamanioPagina: tamanioExistencias,
      busqueda: busquedaDebounced,
      filtroStock,
      orden: ordenExistencias,
    },
    movimientos: {
      pagina: paginaMovimientos,
      tamanioPagina: tamanioMovimientos,
      busqueda: busquedaMovimientosDebounced,
      almacenId: almacenMovimientos,
      tipo: tipoMovimiento,
      fechaDesde: fechaMovimientosDesde,
      fechaHasta: fechaMovimientosHasta,
      orden: 'fecha-desc',
    },
  })
  const gestionAlmacenes = useAlmacenes()
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const disparador = useRef<HTMLButtonElement | null>(null)
  const existencias = inventario.existencias?.elementos ?? []
  const historial = inventario.movimientos?.elementos ?? []
  const resumen = inventario.resumenExistencias ?? {
    productos: inventario.existencias?.total ?? 0,
    productosConStock: 0,
    productosSinStock: 0,
  }

  const abrirMovimiento = (evento: ReactMouseEvent<HTMLButtonElement>) => {
    disparador.current = evento.currentTarget
    setDialogoAbierto(true)
  }

  const guardarMovimiento = async (datos: DatosMovimientoInventario) => {
    const error = await inventario.registrarMovimiento(datos)
    if (!error) {
      setMensaje('Movimiento registrado y existencia actualizada.')
    }
    return error
  }

  const metricas = [
    {
      etiqueta: 'Productos con stock',
      valor: resumen.productosConStock,
      icono: PackageCheck,
    },
    {
      etiqueta: 'Productos controlados',
      valor: resumen.productos,
      icono: Boxes,
    },
    {
      etiqueta: 'Productos sin stock',
      valor: resumen.productosSinStock,
      icono: PackageX,
    },
    {
      etiqueta: 'Movimientos registrados',
      valor: inventario.movimientos?.total ?? 0,
      icono: ClipboardList,
    },
  ]

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">
            Existencias autoritativas en PostgreSQL
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Inventario
          </h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
            Consulta existencias y registra entradas, salidas o ajustes con
            trazabilidad persistente por usuario y fecha.
          </p>
        </div>
        {puedeGestionar ? <Button
          type="button"
          size="lg"
          disabled={!productosActivos.length || !gestionAlmacenes.almacenes.length}
          onClick={abrirMovimiento}
        >
          <Plus aria-hidden="true" />
          Registrar movimiento
        </Button> : null}
      </header>

      <section aria-label="Resumen de inventario" className="ledger-sheet">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {metricas.map((metrica) => {
            const Icono = metrica.icono
            return (
              <article
                key={metrica.etiqueta}
                className="border-b px-5 py-5 last:border-b-0 sm:border-e sm:[&:nth-child(2)]:border-e-0 xl:border-b-0 xl:[&:nth-child(2)]:border-e xl:last:border-e-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                    {metrica.etiqueta}
                  </p>
                  <Icono aria-hidden="true" className="size-4 text-primary" />
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold tabular-nums">
                  {metrica.valor}
                </p>
              </article>
            )
          })}
        </div>
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {mensaje}
      </p>

      <section aria-labelledby="existencias-title" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(14rem,1fr)_15rem_11rem_13rem] xl:items-end">
          <div>
            <h2 id="existencias-title" className="text-lg font-semibold">
              Existencias por producto
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {inventario.existencias?.total ?? 0} productos coincidentes
            </p>
          </div>
          <div>
            <label htmlFor="buscar-inventario" className="field-label">
              Buscar
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id="buscar-inventario"
                type="search"
                value={busqueda}
                onChange={(evento) => {
                  setBusqueda(evento.target.value)
                  setPaginaExistencias(1)
                }}
                className="field-control ps-9"
                placeholder="Código, producto o laboratorio"
              />
            </div>
          </div>
          <div>
            <label htmlFor="filtro-stock" className="field-label">
              Disponibilidad
            </label>
            <select
              id="filtro-stock"
              value={filtroStock}
              onChange={(evento) => {
                setFiltroStock(evento.target.value as FiltroStockInventario)
                setPaginaExistencias(1)
              }}
              className="field-control"
            >
              <option value="todos">Todos</option>
              <option value="con-stock">Con stock</option>
              <option value="sin-stock">Sin stock</option>
            </select>
          </div>
          <div>
            <label htmlFor="orden-existencias" className="field-label">Ordenar</label>
            <select
              id="orden-existencias"
              value={ordenExistencias}
              onChange={(evento) => {
                setOrdenExistencias(evento.target.value as OrdenExistenciasInventario)
                setPaginaExistencias(1)
              }}
              className="field-control"
            >
              <option value="producto-asc">Producto A–Z</option>
              <option value="producto-desc">Producto Z–A</option>
              <option value="codigo-asc">Código A–Z</option>
              <option value="codigo-desc">Código Z–A</option>
              <option value="stock-desc">Mayor stock</option>
              <option value="stock-asc">Menor stock</option>
            </select>
          </div>
        </div>

        <EstadoListadoInventario
          cargando={inventario.cargandoExistencias}
          error={inventario.errorExistencias}
          vacio={!existencias.length}
          mensajeVacio="No hay productos que coincidan con la búsqueda y filtros activos."
          alReintentar={() => void inventario.reintentarExistencias()}
        >
          <>
            <div className="divide-y md:hidden">
              {existencias.map((existencia) => (
                <article key={existencia.productoId} className="px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs text-primary">
                        {existencia.productoCodigo}
                      </p>
                      <h3 className="mt-1 font-semibold">
                        {existencia.productoDescripcion}
                      </h3>
                    </div>
                    <EstadoStock existencia={existencia} />
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Asignable</dt>
                      <dd className="mt-1 font-mono font-semibold tabular-nums">
                        {formatoCantidad.format(existencia.stockAsignable)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Almacenes</dt>
                      <dd className="mt-1 font-mono tabular-nums">
                        {existencia.almacenes}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Lotes</dt>
                      <dd className="mt-1 font-mono tabular-nums">
                        {existencia.lotesConStock}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                    <th className="px-6 py-3 font-medium">Código</th>
                    <th className="px-4 py-3 font-medium">Producto</th>
                    <th className="px-4 py-3 text-end font-medium">Asignable</th>
                    <th className="px-4 py-3 text-end font-medium">Almacenes</th>
                    <th className="px-4 py-3 text-end font-medium">Lotes</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {existencias.map((existencia) => (
                    <tr key={existencia.productoId} className="hover:bg-muted/35">
                      <td className="px-6 py-4 font-mono text-xs">
                        {existencia.productoCodigo}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium">{existencia.productoDescripcion}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {existencia.laboratorio || 'Sin laboratorio'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-end font-mono font-semibold tabular-nums">
                        {formatoCantidad.format(existencia.stockAsignable)}{' '}
                        <span className="font-sans text-xs font-normal text-muted-foreground">
                          {existencia.unidadMedida || 'unid.'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-end font-mono tabular-nums">
                        {existencia.almacenes}
                      </td>
                      <td className="px-4 py-4 text-end font-mono tabular-nums">
                        {existencia.lotesConStock}
                      </td>
                      <td className="px-6 py-4">
                        <EstadoStock existencia={existencia} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        </EstadoListadoInventario>
        {inventario.existencias && !inventario.errorExistencias ? (
          <PaginacionInventario
            etiqueta="existencias"
            pagina={paginaExistencias}
            tamanioPagina={tamanioExistencias}
            total={inventario.existencias.total}
            totalPaginas={inventario.existencias.totalPaginas}
            cantidadVisible={existencias.length}
            cargando={inventario.actualizandoExistencias}
            alCambiarPagina={setPaginaExistencias}
            alCambiarTamanio={(tamanio) => {
              setTamanioExistencias(tamanio)
              setPaginaExistencias(1)
            }}
          />
        ) : null}
      </section>

      <section aria-labelledby="historial-title" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(14rem,1fr)_14rem_11rem_12rem_11rem] xl:items-end">
          <div>
            <h2 id="historial-title" className="text-lg font-semibold">
              Historial de movimientos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {inventario.movimientos?.total ?? 0} movimientos persistentes
            </p>
          </div>
          <label className="field-label">
            Buscar
            <input
              type="search"
              value={busquedaMovimientos}
              onChange={(evento) => {
                setBusquedaMovimientos(evento.target.value)
                setPaginaMovimientos(1)
              }}
              className="field-control"
              placeholder="Producto, código o lote"
            />
          </label>
          <label className="field-label">
            Tipo
            <select
              value={tipoMovimiento}
              onChange={(evento) => {
                setTipoMovimiento(evento.target.value as MovimientoInventario['tipo'] | '')
                setPaginaMovimientos(1)
              }}
              className="field-control"
            >
              <option value="">Todos</option>
              {tiposMovimientoInventario.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>{tipo.etiqueta}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Almacén
            <select
              value={almacenMovimientos}
              onChange={(evento) => {
                setAlmacenMovimientos(evento.target.value)
                setPaginaMovimientos(1)
              }}
              className="field-control"
            >
              <option value="">Todos</option>
              {gestionAlmacenes.almacenes.map((almacen) => (
                <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field-label">
              Desde
              <input
                type="date"
                value={fechaMovimientosDesde}
                onChange={(evento) => {
                  setFechaMovimientosDesde(evento.target.value)
                  setPaginaMovimientos(1)
                }}
                className="field-control"
              />
            </label>
            <label className="field-label">
              Hasta
              <input
                type="date"
                value={fechaMovimientosHasta}
                onChange={(evento) => {
                  setFechaMovimientosHasta(evento.target.value)
                  setPaginaMovimientos(1)
                }}
                className="field-control"
              />
            </label>
          </div>
        </div>
        <EstadoListadoInventario
          cargando={inventario.cargandoMovimientos}
          error={inventario.errorMovimientos}
          vacio={!historial.length}
          mensajeVacio="No hay movimientos que coincidan con los filtros activos."
          alReintentar={() => void inventario.reintentarMovimientos()}
        >
          <div className="divide-y">
            {historial.map((movimiento) => (
              <MovimientoFila key={movimiento.id} movimiento={movimiento} />
            ))}
          </div>
        </EstadoListadoInventario>
        {inventario.movimientos && !inventario.errorMovimientos ? (
          <PaginacionInventario
            etiqueta="movimientos"
            pagina={paginaMovimientos}
            tamanioPagina={tamanioMovimientos}
            total={inventario.movimientos.total}
            totalPaginas={inventario.movimientos.totalPaginas}
            cantidadVisible={historial.length}
            cargando={inventario.actualizandoMovimientos}
            alCambiarPagina={setPaginaMovimientos}
            alCambiarTamanio={(tamanio) => {
              setTamanioMovimientos(tamanio)
              setPaginaMovimientos(1)
            }}
          />
        ) : null}
      </section>

      <PanelGestionAlmacenes
        almacenes={gestionAlmacenes.almacenes}
        ubicaciones={gestionAlmacenes.ubicaciones}
        productos={productos}
        puedeGestionar={puedeGestionar}
        crearAlmacen={gestionAlmacenes.crearAlmacen}
        crearUbicacion={gestionAlmacenes.crearUbicacion}
        transferir={gestionAlmacenes.transferir}
        reclasificar={gestionAlmacenes.reclasificar}
        configurar={gestionAlmacenes.configurar}
      />

      {dialogoAbierto && puedeGestionar ? (
        <DialogoMovimientoInventario
          abierto={dialogoAbierto}
          productos={productosActivos}
          almacenes={gestionAlmacenes.almacenes.filter((almacen) => almacen.activo)}
          ubicaciones={gestionAlmacenes.ubicaciones}
          alCambiarApertura={setDialogoAbierto}
          alGuardar={guardarMovimiento}
          alRestaurarFoco={() => disparador.current?.focus()}
        />
      ) : null}
    </div>
  )
}
