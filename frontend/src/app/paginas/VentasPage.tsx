import {
  CalendarClock,
  FileCheck2,
  FilePenLine,
  Pencil,
  Plus,
  Search,
  Send,
  ShoppingCart,
  UsersRound,
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
import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useClientes } from '@/modulos/clientes/estado/useClientes'
import { useAlmacenes } from '@/modulos/inventario/estado/useAlmacenes'
import { useProductos } from '@/modulos/productos/estado/useProductos'
import { DialogoConfirmacionEmision } from '@/modulos/ventas/componentes/DialogoConfirmacionEmision'
import { DialogoCotizacion } from '@/modulos/ventas/componentes/DialogoCotizacion'
import { DialogoSeleccionAlmacenPedido } from '@/modulos/ventas/componentes/DialogoSeleccionAlmacenPedido'
import { PanelOperacionesVenta } from '@/modulos/ventas/componentes/PanelOperacionesVenta'
import { useCotizacionesTemporales } from '@/modulos/ventas/estado/useCotizacionesTemporales'
import { useOperacionesVenta } from '@/modulos/ventas/estado/useOperacionesVenta'
import {
  calcularTotalesCotizacion,
  type Cotizacion,
  type DatosCotizacion,
  type EstadoCotizacion,
} from '@/modulos/ventas/modelo/cotizacion'

type FiltroEstado = 'todos' | EstadoCotizacion | 'vencida'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})
const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
const hoy = new Date().toISOString().slice(0, 10)

function normalizar(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
}

function estadoVisible(cotizacion: Cotizacion): FiltroEstado {
  if (
    cotizacion.estado === 'emitida' &&
    cotizacion.fechaValidez < hoy
  ) {
    return 'vencida'
  }
  return cotizacion.estado
}

function EstadoCotizacionEtiqueta({ cotizacion }: { cotizacion: Cotizacion }) {
  const estado = estadoVisible(cotizacion)
  const etiquetas: Record<FiltroEstado, string> = {
    todos: 'Todos',
    borrador: 'Borrador',
    emitida: 'Emitida',
    aceptada: 'Aceptada',
    rechazada: 'Rechazada',
    vencida: 'Vencida',
  }
  return (
    <span
      className="status-label"
      data-tone={
        estado === 'emitida' || estado === 'aceptada' ? 'listo' : 'revision'
      }
    >
      {etiquetas[estado]}
    </span>
  )
}

export function VentasPage() {
  const { hasPermission } = useAuth()
  const puedeGestionarVentas = hasPermission(PERMISSIONS.SALES_MANAGE)
  const puedeDespachar =
    hasPermission(PERMISSIONS.DISTRIBUTION_MANAGE) &&
    hasPermission(PERMISSIONS.INVENTORY_MANAGE)
  const { clientes } = useClientes()
  const { productos } = useProductos()
  const { almacenes, cargando: cargandoAlmacenes, error: errorAlmacenes } = useAlmacenes()
  const clientesActivos = useMemo(
    () => clientes.filter((cliente) => cliente.activo),
    [clientes],
  )
  const productosActivos = useMemo(
    () => productos.filter((producto) => producto.activo),
    [productos],
  )
  const almacenesActivos = useMemo(
    () => almacenes.filter((almacen) => almacen.activo),
    [almacenes],
  )
  const {
    cotizaciones,
    guardarCotizacion,
    emitirCotizacion,
    aceptarCotizacion,
  } = useCotizacionesTemporales(clientes, productos)
  const {
    pedidos,
    ventas,
    crearPedido,
    registrarVenta,
    actualizarPedido,
    cancelarPedido,
    despacharVenta,
    creandoPedido,
    actualizandoPedido,
    cancelandoPedido,
    despachandoVenta,
    cargando: cargandoOperaciones,
    error: errorOperaciones,
    reintentar: reintentarOperaciones,
  } = useOperacionesVenta({
    cotizaciones,
    aceptarCotizacion,
  })
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos')
  const [cotizacionSeleccionada, setCotizacionSeleccionada] =
    useState<Cotizacion | null>(null)
  const [cotizacionPorEmitir, setCotizacionPorEmitir] =
    useState<Cotizacion | null>(null)
  const [cotizacionPorCrearPedido, setCotizacionPorCrearPedido] =
    useState<Cotizacion | null>(null)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const disparadorFormulario = useRef<HTMLButtonElement | null>(null)
  const disparadorEmision = useRef<HTMLButtonElement | null>(null)
  const disparadorPedido = useRef<HTMLButtonElement | null>(null)
  const busquedaDiferida = useDeferredValue(busqueda)

  const cotizacionesFiltradas = useMemo(() => {
    const termino = normalizar(busquedaDiferida.trim())
    return cotizaciones
      .filter((cotizacion) => {
        const coincideEstado =
          filtroEstado === 'todos' || estadoVisible(cotizacion) === filtroEstado
        const texto = normalizar(
          `${cotizacion.numero} ${cotizacion.clienteNombre} ${cotizacion.clienteDocumento}`,
        )
        return coincideEstado && (!termino || texto.includes(termino))
      })
      .toSorted((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro))
  }, [busquedaDiferida, cotizaciones, filtroEstado])

  let borradores = 0
  let emitidas = 0
  let totalEmitido = 0
  for (const cotizacion of cotizaciones) {
    if (cotizacion.estado === 'borrador') borradores += 1
    if (cotizacion.estado === 'emitida') {
      emitidas += 1
      totalEmitido += calcularTotalesCotizacion(
        cotizacion.lineas,
        cotizacion.preciosIncluyenIgv,
      ).total
    }
  }

  const abrirFormulario = (
    evento: ReactMouseEvent<HTMLButtonElement>,
    cotizacion: Cotizacion | null = null,
  ) => {
    disparadorFormulario.current = evento.currentTarget
    setCotizacionSeleccionada(cotizacion)
    setDialogoAbierto(true)
  }

  const guardar = (datos: DatosCotizacion, cotizacionId?: string) => {
    if (!puedeGestionarVentas) return 'No tienes permiso para administrar ventas'
    const error = guardarCotizacion(datos, cotizacionId)
    if (!error) {
      setMensaje(
        cotizacionId
          ? 'Cotización actualizada.'
          : 'Cotización guardada como borrador.',
      )
    }
    return error
  }

  const solicitarEmision = (
    evento: ReactMouseEvent<HTMLButtonElement>,
    cotizacion: Cotizacion,
  ) => {
    disparadorEmision.current = evento.currentTarget
    setCotizacionPorEmitir(cotizacion)
  }

  const confirmarEmision = () => {
    if (!puedeGestionarVentas) {
      setMensaje('No tienes permiso para administrar ventas')
      return
    }
    if (!cotizacionPorEmitir) return
    const error = emitirCotizacion(cotizacionPorEmitir.id)
    setMensaje(error ?? `${cotizacionPorEmitir.numero} emitida correctamente.`)
    if (!error) setCotizacionPorEmitir(null)
  }

  const solicitarCreacionPedido = (
    evento: ReactMouseEvent<HTMLButtonElement>,
    cotizacion: Cotizacion,
  ) => {
    disparadorPedido.current = evento.currentTarget
    setCotizacionPorCrearPedido(cotizacion)
  }

  const confirmarPedido = async (almacenId: string) => {
    if (!puedeGestionarVentas) return 'No tienes permiso para administrar ventas'
    if (!cotizacionPorCrearPedido) return 'Selecciona una cotización válida'
    const cotizacion = cotizacionPorCrearPedido
    const error = await crearPedido(cotizacion.id, almacenId)
    if (error) {
      setMensaje(error)
      return error
    }
    setMensaje(`${cotizacion.numero} convertida en pedido correctamente.`)
    setCotizacionPorCrearPedido(null)
    return undefined
  }

  const metricas = [
    { etiqueta: 'Borradores', valor: borradores, icono: FilePenLine },
    { etiqueta: 'Cotizaciones emitidas', valor: emitidas, icono: FileCheck2 },
    { etiqueta: 'Clientes disponibles', valor: clientesActivos.length, icono: UsersRound },
    { etiqueta: 'Importe emitido', valor: formatoMoneda.format(totalEmitido), icono: CalendarClock },
  ]

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">
            Flujo comercial
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Ventas
          </h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
            Convierte propuestas aceptadas en pedidos y ventas persistentes. El
            despacho consume las reservas y descuenta inventario de forma
            transaccional.
          </p>
        </div>
        {puedeGestionarVentas ? (
          <Button
            type="button"
            size="lg"
            disabled={!clientesActivos.length || !productosActivos.length}
            onClick={(evento) => abrirFormulario(evento)}
          >
            <Plus aria-hidden="true" /> Nueva cotización
          </Button>
        ) : null}
      </header>

      <section aria-label="Resumen comercial" className="ledger-sheet">
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

      <p role="status" aria-live="polite" className="sr-only">{mensaje}</p>

      {puedeGestionarVentas && (!clientesActivos.length || !productosActivos.length) ? (
        <aside className="border-s-4 border-primary bg-accent/60 px-5 py-4 text-sm leading-6">
          {!clientesActivos.length ? (
            <>
              Registra un cliente activo.{' '}
              <Link className="font-medium text-primary underline" to="/clientes">
                Abrir clientes
              </Link>
              .{' '}
            </>
          ) : null}
          {!productosActivos.length ? (
            <>
              Registra un producto activo con precio de venta.{' '}
              <Link className="font-medium text-primary underline" to="/productos">
                Abrir productos
              </Link>
              .
            </>
          ) : null}
        </aside>
      ) : null}

      {errorAlmacenes ? (
        <aside role="alert" className="border-s-4 border-destructive bg-destructive/10 px-5 py-4 text-sm leading-6">
          No se pudieron cargar los almacenes persistentes. No es posible confirmar pedidos hasta reintentar la carga.
        </aside>
      ) : !cargandoAlmacenes && !almacenesActivos.length ? (
        <aside className="border-s-4 border-primary bg-accent/60 px-5 py-4 text-sm leading-6">
          Registra al menos un almacén activo para poder confirmar pedidos.{' '}
          <Link className="font-medium text-primary underline" to="/inventario">
            Abrir inventario
          </Link>
          .
        </aside>
      ) : null}

      <section aria-labelledby="cotizaciones-title" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[minmax(14rem,1fr)_17rem_12rem] lg:items-end">
          <div>
            <h2 id="cotizaciones-title" className="text-lg font-semibold">
              Cotizaciones
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {cotizacionesFiltradas.length} de {cotizaciones.length} documentos
            </p>
          </div>
          <div>
            <label htmlFor="buscar-cotizacion" className="field-label">Buscar</label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="buscar-cotizacion"
                type="search"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                className="field-control ps-9"
                placeholder="Número, cliente o documento"
              />
            </div>
          </div>
          <div>
            <label htmlFor="estado-cotizacion" className="field-label">Estado</label>
            <select
              id="estado-cotizacion"
              value={filtroEstado}
              onChange={(evento) => setFiltroEstado(evento.target.value as FiltroEstado)}
              className="field-control"
            >
              <option value="todos">Todos</option>
              <option value="borrador">Borradores</option>
              <option value="emitida">Emitidas</option>
              <option value="vencida">Vencidas</option>
              <option value="aceptada">Aceptadas</option>
              <option value="rechazada">Rechazadas</option>
            </select>
          </div>
        </div>

        {!cotizacionesFiltradas.length ? (
          <div className="px-5 py-14 text-center sm:px-6">
            <FilePenLine aria-hidden="true" className="mx-auto size-8 text-primary" />
            <h3 className="mt-4 font-semibold">
              {cotizaciones.length ? 'No hay coincidencias' : 'Aún no hay cotizaciones'}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {cotizaciones.length
                ? 'Prueba con otro término o estado.'
                : 'Crea un borrador para presentar una propuesta comercial al cliente.'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y md:hidden">
              {cotizacionesFiltradas.map((cotizacion) => {
                const total = calcularTotalesCotizacion(
                  cotizacion.lineas,
                  cotizacion.preciosIncluyenIgv,
                ).total
                return (
                  <article key={cotizacion.id} className="px-5 py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-primary">{cotizacion.numero}</p>
                        <h3 className="mt-1 font-semibold">{cotizacion.clienteNombre}</h3>
                      </div>
                      <EstadoCotizacionEtiqueta cotizacion={cotizacion} />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Válida hasta</dt>
                        <dd className="mt-1">{formatoFecha.format(new Date(`${cotizacion.fechaValidez}T12:00:00`))}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Productos</dt>
                        <dd className="mt-1 font-mono">{cotizacion.lineas.length}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Total</dt>
                        <dd className="mt-1 font-mono font-semibold">{formatoMoneda.format(total)}</dd>
                      </div>
                    </dl>
                    {puedeGestionarVentas && cotizacion.estado === 'borrador' ? (
                      <div className="mt-4 flex gap-2">
                        <Button type="button" variant="outline" onClick={(evento) => abrirFormulario(evento, cotizacion)}>
                          <Pencil aria-hidden="true" /> Editar
                        </Button>
                        <Button type="button" onClick={(evento) => solicitarEmision(evento, cotizacion)}>
                          <Send aria-hidden="true" /> Emitir
                        </Button>
                      </div>
                    ) : puedeGestionarVentas && estadoVisible(cotizacion) === 'emitida' ? (
                      <Button type="button" className="mt-4" disabled={creandoPedido || cargandoAlmacenes || !almacenesActivos.length} onClick={(evento) => solicitarCreacionPedido(evento, cotizacion)}>
                        <ShoppingCart aria-hidden="true" /> {creandoPedido ? 'Creando pedido…' : 'Crear pedido'}
                      </Button>
                    ) : puedeGestionarVentas ? null : (
                      <p className="mt-4 text-sm text-muted-foreground">Solo consulta</p>
                    )}
                  </article>
                )
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                    <th className="px-6 py-3 font-medium">Número</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Vigencia</th>
                    <th className="px-4 py-3 text-end font-medium">Productos</th>
                    <th className="px-4 py-3 text-end font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 text-end font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cotizacionesFiltradas.map((cotizacion) => {
                    const total = calcularTotalesCotizacion(
                      cotizacion.lineas,
                      cotizacion.preciosIncluyenIgv,
                    ).total
                    return (
                      <tr key={cotizacion.id} className="hover:bg-muted/35">
                        <td className="px-6 py-4 font-mono text-xs">{cotizacion.numero}</td>
                        <td className="px-4 py-4">
                          <p className="font-medium">{cotizacion.clienteNombre}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{cotizacion.clienteDocumento}</p>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          <p>{formatoFecha.format(new Date(`${cotizacion.fechaEmision}T12:00:00`))}</p>
                          <p className="mt-1 text-xs">hasta {formatoFecha.format(new Date(`${cotizacion.fechaValidez}T12:00:00`))}</p>
                        </td>
                        <td className="px-4 py-4 text-end font-mono">{cotizacion.lineas.length}</td>
                        <td className="px-4 py-4 text-end font-mono font-semibold">{formatoMoneda.format(total)}</td>
                        <td className="px-4 py-4"><EstadoCotizacionEtiqueta cotizacion={cotizacion} /></td>
                        <td className="px-6 py-4">
                          {puedeGestionarVentas && cotizacion.estado === 'borrador' ? (
                            <div className="flex justify-end gap-1">
                              <Button type="button" variant="ghost" size="icon" title="Editar cotización" aria-label={`Editar ${cotizacion.numero}`} onClick={(evento) => abrirFormulario(evento, cotizacion)}>
                                <Pencil aria-hidden="true" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" title="Emitir cotización" aria-label={`Emitir ${cotizacion.numero}`} onClick={(evento) => solicitarEmision(evento, cotizacion)}>
                                <Send aria-hidden="true" />
                              </Button>
                            </div>
                          ) : puedeGestionarVentas && estadoVisible(cotizacion) === 'emitida' ? (
                            <div className="flex justify-end">
                              <Button type="button" variant="outline" size="sm" disabled={creandoPedido || cargandoAlmacenes || !almacenesActivos.length} onClick={(evento) => solicitarCreacionPedido(evento, cotizacion)}>
                                <ShoppingCart aria-hidden="true" /> {creandoPedido ? 'Creando pedido…' : 'Crear pedido'}
                              </Button>
                            </div>
                          ) : puedeGestionarVentas ? (
                            <span className="block text-end text-xs text-muted-foreground">
                              {cotizacion.estado === 'aceptada' ? 'Pedido creado' : 'Sin acciones'}
                            </span>
                          ) : (
                            <span className="block text-end text-xs text-muted-foreground">Solo consulta</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <PanelOperacionesVenta
        pedidos={pedidos}
        ventas={ventas}
        alRegistrarVenta={puedeGestionarVentas ? registrarVenta : undefined}
        alActualizarPedido={puedeGestionarVentas ? actualizarPedido : undefined}
        alCancelarPedido={puedeGestionarVentas ? cancelarPedido : undefined}
        alDespacharVenta={puedeDespachar ? despacharVenta : undefined}
        alNotificar={setMensaje}
        cargando={cargandoOperaciones}
        error={errorOperaciones}
        alReintentar={reintentarOperaciones}
        actualizandoPedido={actualizandoPedido}
        cancelandoPedido={cancelandoPedido}
        despachandoVenta={despachandoVenta}
      />

      {puedeGestionarVentas && dialogoAbierto ? (
        <DialogoCotizacion
          key={cotizacionSeleccionada?.id ?? 'nueva'}
          abierto={dialogoAbierto}
          cotizacion={cotizacionSeleccionada}
          clientes={clientesActivos}
          productos={productosActivos}
          alCambiarApertura={setDialogoAbierto}
          alGuardar={guardar}
          alRestaurarFoco={() => disparadorFormulario.current?.focus()}
        />
      ) : null}

      {puedeGestionarVentas && cotizacionPorEmitir ? (
        <DialogoConfirmacionEmision
          abierto={Boolean(cotizacionPorEmitir)}
          cotizacion={cotizacionPorEmitir}
          alCambiarApertura={(abierto) => {
            if (!abierto) setCotizacionPorEmitir(null)
          }}
          alConfirmar={confirmarEmision}
          alRestaurarFoco={() => disparadorEmision.current?.focus()}
        />
      ) : null}

      {puedeGestionarVentas && cotizacionPorCrearPedido ? (
        <DialogoSeleccionAlmacenPedido
          abierto={Boolean(cotizacionPorCrearPedido)}
          cotizacion={cotizacionPorCrearPedido}
          almacenes={almacenesActivos}
          guardando={creandoPedido}
          alCambiarApertura={(abierto) => {
            if (!abierto) setCotizacionPorCrearPedido(null)
          }}
          alConfirmar={confirmarPedido}
          alRestaurarFoco={() => disparadorPedido.current?.focus()}
        />
      ) : null}
    </div>
  )
}
