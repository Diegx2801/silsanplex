import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardList,
  PackageCheck,
  PackageX,
  Plus,
  Search,
  Warehouse,
} from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { DialogoMovimientoInventario } from '@/modulos/inventario/componentes/DialogoMovimientoInventario'
import { useInventarioTemporal } from '@/modulos/inventario/estado/useInventarioTemporal'
import {
  calcularExistencias,
  movimientoEsSalida,
  resumirInventario,
  tiposMovimientoInventario,
  type DatosMovimientoInventario,
  type ExistenciaProducto,
  type MovimientoInventario,
} from '@/modulos/inventario/modelo/inventario'
import { useProductosTemporales } from '@/modulos/productos/estado/useProductosTemporales'

type FiltroStock = 'todos' | 'con-stock' | 'sin-stock'

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

function EstadoStock({ existencia }: { existencia: ExistenciaProducto }) {
  const tieneStock = existencia.stock > 0

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
  const { productos } = useProductosTemporales()
  const productosActivos = useMemo(
    () => productos.filter((producto) => producto.activo),
    [productos],
  )
  const { movimientos, registrarMovimiento } =
    useInventarioTemporal(productosActivos)
  const [busqueda, setBusqueda] = useState('')
  const [filtroStock, setFiltroStock] = useState<FiltroStock>('todos')
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const disparador = useRef<HTMLButtonElement | null>(null)
  const busquedaDiferida = useDeferredValue(busqueda)

  const existencias = useMemo(
    () => calcularExistencias(productos, movimientos),
    [movimientos, productos],
  )
  const resumen = useMemo(
    () => resumirInventario(existencias, movimientos),
    [existencias, movimientos],
  )
  const almacenes = useMemo(() => {
    const conocidos = new Map<string, string>()
    conocidos.set('almacén principal', 'Almacén principal')
    for (const movimiento of movimientos) {
      conocidos.set(
        movimiento.almacen.toLocaleLowerCase('es-PE'),
        movimiento.almacen,
      )
    }
    return [...conocidos.values()]
  }, [movimientos])
  const existenciasFiltradas = useMemo(() => {
    const termino = busquedaDiferida
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-PE')

    return existencias.filter((existencia) => {
      const coincideStock =
        filtroStock === 'todos' ||
        (filtroStock === 'con-stock' && existencia.stock > 0) ||
        (filtroStock === 'sin-stock' && existencia.stock <= 0)
      const texto = [
        existencia.producto.codigo,
        existencia.producto.descripcion,
        existencia.producto.laboratorio,
      ]
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es-PE')

      return coincideStock && (!termino || texto.includes(termino))
    })
  }, [busquedaDiferida, existencias, filtroStock])
  const historial = useMemo(
    () =>
      movimientos.toSorted((a, b) =>
        b.fechaRegistro.localeCompare(a.fechaRegistro),
      ),
    [movimientos],
  )

  const abrirMovimiento = (evento: ReactMouseEvent<HTMLButtonElement>) => {
    disparador.current = evento.currentTarget
    setDialogoAbierto(true)
  }

  const guardarMovimiento = (datos: DatosMovimientoInventario) => {
    const error = registrarMovimiento(datos)
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
      valor: resumen.movimientos,
      icono: ClipboardList,
    },
  ]

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">
            Control basado en movimientos
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Inventario
          </h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
            Consulta existencias y registra entradas, salidas o ajustes. La
            información permanece aislada en esta sesión local.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!productosActivos.length}
          onClick={abrirMovimiento}
        >
          <Plus aria-hidden="true" />
          Registrar movimiento
        </Button>
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
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[minmax(16rem,1fr)_13rem_auto] lg:items-end">
          <div>
            <h2 id="existencias-title" className="text-lg font-semibold">
              Existencias por producto
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {existenciasFiltradas.length} de {existencias.length} productos
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
                onChange={(evento) => setBusqueda(evento.target.value)}
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
              onChange={(evento) =>
                setFiltroStock(evento.target.value as FiltroStock)
              }
              className="field-control"
            >
              <option value="todos">Todos</option>
              <option value="con-stock">Con stock</option>
              <option value="sin-stock">Sin stock</option>
            </select>
          </div>
        </div>

        {!productos.length ? (
          <div className="px-5 py-14 text-center sm:px-6">
            <Warehouse aria-hidden="true" className="mx-auto size-8 text-primary" />
            <h3 className="mt-4 font-semibold">Primero registra productos</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              El inventario necesita productos activos para identificar cada
              entrada o salida.
            </p>
            <Button asChild className="mt-5">
              <Link to="/productos">Abrir catálogo</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="divide-y md:hidden">
              {existenciasFiltradas.map((existencia) => (
                <article key={existencia.producto.id} className="px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs text-primary">
                        {existencia.producto.codigo}
                      </p>
                      <h3 className="mt-1 font-semibold">
                        {existencia.producto.descripcion}
                      </h3>
                    </div>
                    <EstadoStock existencia={existencia} />
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Stock</dt>
                      <dd className="mt-1 font-mono font-semibold tabular-nums">
                        {formatoCantidad.format(existencia.stock)}
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
                    <th className="px-4 py-3 text-end font-medium">Stock</th>
                    <th className="px-4 py-3 text-end font-medium">Almacenes</th>
                    <th className="px-4 py-3 text-end font-medium">Lotes</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {existenciasFiltradas.map((existencia) => (
                    <tr key={existencia.producto.id} className="hover:bg-muted/35">
                      <td className="px-6 py-4 font-mono text-xs">
                        {existencia.producto.codigo}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium">{existencia.producto.descripcion}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {existencia.producto.laboratorio || 'Sin laboratorio'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-end font-mono font-semibold tabular-nums">
                        {formatoCantidad.format(existencia.stock)}{' '}
                        <span className="font-sans text-xs font-normal text-muted-foreground">
                          {existencia.producto.unidadMedida || 'unid.'}
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
        )}
      </section>

      <section aria-labelledby="historial-title" className="ledger-sheet">
        <div className="flex items-end justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id="historial-title" className="text-lg font-semibold">
              Historial de movimientos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Registro cronológico de esta sesión
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {historial.length} MOV.
          </span>
        </div>
        {historial.length ? (
          <div className="divide-y">
            {historial.map((movimiento) => (
              <MovimientoFila key={movimiento.id} movimiento={movimiento} />
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-6">
            Los movimientos que registres aparecerán aquí.
          </div>
        )}
      </section>

      {dialogoAbierto ? (
        <DialogoMovimientoInventario
          abierto={dialogoAbierto}
          productos={productosActivos}
          almacenes={almacenes}
          alCambiarApertura={setDialogoAbierto}
          alGuardar={guardarMovimiento}
          alRestaurarFoco={() => disparador.current?.focus()}
        />
      ) : null}
    </div>
  )
}
