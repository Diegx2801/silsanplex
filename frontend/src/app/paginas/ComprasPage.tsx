import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  Building2,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Truck,
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
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { DialogoCompra } from '@/modulos/compras/componentes/DialogoCompra'
import { DialogoConfirmacionAnulacion } from '@/modulos/compras/componentes/DialogoConfirmacionAnulacion'
import { DialogoConfirmacionRecepcion } from '@/modulos/compras/componentes/DialogoConfirmacionRecepcion'
import { useCompras } from '@/modulos/compras/estado/useCompras'
import {
  calcularTotalesCompra,
  type Compra,
  type DatosCompra,
  type DatosRecepcionCompra,
  type EstadoCompra,
} from '@/modulos/compras/modelo/compras'
import { useProductos } from '@/modulos/productos/estado/useProductos'
import { listarAlmacenesCompra, listarUbicacionesCompra } from '@/modulos/compras/servicios/compraService'
import { listarProveedores } from '@/modulos/proveedores/servicios/proveedorService'

type FiltroEstado = 'todos' | EstadoCompra
const proveedoresVacios = [] as const
const almacenesVacios = [] as const

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})
const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function normalizar(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
}

function etiquetaDocumento(compra: Compra) {
  return `${compra.tipoDocumento} ${compra.serie}-${compra.numero}`
}

function EstadoCompraEtiqueta({ estado }: { estado: EstadoCompra }) {
  const etiquetas: Record<EstadoCompra, string> = {
    borrador: 'Pendiente',
    emitida: 'Emitida',
    'parcialmente-recibida': 'Recepción parcial',
    recibida: 'Recibida',
    'cerrada-parcial': 'Cerrada parcial',
    anulada: 'Anulada',
  }

  return (
    <span
      className="status-label"
      data-tone={estado === 'recibida' ? 'listo' : 'revision'}
    >
      {etiquetas[estado]}
    </span>
  )
}

export function ComprasPage() {
  const { access, hasPermission } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const puedeConsultarProveedores = hasPermission(PERMISSIONS.SUPPLIERS_VIEW)
  const puedeGestionar = hasPermission(PERMISSIONS.PURCHASES_MANAGE)
  const puedeRecibir = hasPermission(PERMISSIONS.PURCHASES_RECEIVE)
  const proveedoresQuery = useQuery({
    queryKey: ['suppliers', organizationId],
    queryFn: () => listarProveedores(organizationId),
    enabled: Boolean(organizationId && puedeConsultarProveedores),
  })
  const proveedores = proveedoresQuery.data ?? proveedoresVacios
  const almacenesQuery = useQuery({
    queryKey: ['purchase-warehouses', organizationId],
    queryFn: () => listarAlmacenesCompra(organizationId),
    enabled: Boolean(organizationId),
  })
  const almacenes = almacenesQuery.data ?? almacenesVacios
  const ubicacionesQuery = useQuery({
    queryKey: ['purchase-locations', organizationId],
    queryFn: () => listarUbicacionesCompra(organizationId),
    enabled: Boolean(organizationId),
  })
  const almacenesActivos = useMemo(
    () => almacenes.filter((almacen) => almacen.activo),
    [almacenes],
  )
  const { productos } = useProductos()
  const productosActivos = useMemo(
    () => productos.filter((producto) => producto.activo),
    [productos],
  )
  const { compras, guardarCompra, emitirCompra, recibirCompra, anularCompra } = useCompras(
    productos,
    proveedores,
  )
  const proveedoresActivos = useMemo(
    () => proveedores.filter((proveedor) => proveedor.activo),
    [proveedores],
  )
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos')
  const [compraSeleccionada, setCompraSeleccionada] = useState<Compra | null>(
    null,
  )
  const [compraPorRecibir, setCompraPorRecibir] = useState<Compra | null>(null)
  const [compraPorAnular, setCompraPorAnular] = useState<Compra | null>(null)
  const [dialogoCompraAbierto, setDialogoCompraAbierto] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const disparadorCompra = useRef<HTMLButtonElement | null>(null)
  const disparadorRecepcion = useRef<HTMLButtonElement | null>(null)
  const disparadorAnulacion = useRef<HTMLButtonElement | null>(null)
  const busquedaDiferida = useDeferredValue(busqueda)

  const comprasFiltradas = useMemo(() => {
    const termino = normalizar(busquedaDiferida.trim())

    return compras
      .filter((compra) => {
        const coincideEstado =
          filtroEstado === 'todos' || compra.estado === filtroEstado
        const texto = normalizar(
          `${etiquetaDocumento(compra)} ${compra.proveedorNombre} ${compra.proveedorDocumento}`,
        )
        return coincideEstado && (!termino || texto.includes(termino))
      })
      .toSorted((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro))
  }, [busquedaDiferida, compras, filtroEstado])

  const totalRecibido = useMemo(
    () =>
      compras
        .filter((compra) => compra.estado === 'recibida')
        .reduce(
          (total, compra) =>
            total +
            calcularTotalesCompra(compra.lineas, compra.preciosIncluyenIgv)
              .total,
          0,
        ),
    [compras],
  )

  const abrirCompra = (
    evento: ReactMouseEvent<HTMLButtonElement>,
    compra: Compra | null = null,
  ) => {
    disparadorCompra.current = evento.currentTarget
    setCompraSeleccionada(compra)
    setDialogoCompraAbierto(true)
  }

  const solicitarRecepcion = (
    evento: ReactMouseEvent<HTMLButtonElement>,
    compra: Compra,
  ) => {
    disparadorRecepcion.current = evento.currentTarget
    setCompraPorRecibir(compra)
  }

  const confirmarRecepcion = async (datos: DatosRecepcionCompra) => {
    if (!compraPorRecibir) return undefined
    const error = await recibirCompra(compraPorRecibir.id, datos)
    setMensaje(
      error ??
        `Recepción de ${compraPorRecibir.serie}-${compraPorRecibir.numero} registrada e inventario actualizado.`,
    )
    return error
  }

  const solicitarAnulacion = (
    evento: ReactMouseEvent<HTMLButtonElement>,
    compra: Compra,
  ) => {
    disparadorAnulacion.current = evento.currentTarget
    setCompraPorAnular(compra)
  }

  const confirmarAnulacion = async (motivo: string) => {
    if (!compraPorAnular) return undefined
    const error = await anularCompra(compraPorAnular.id, motivo)
    setMensaje(error ?? `Orden ${compraPorAnular.serie}-${compraPorAnular.numero} cerrada con motivo registrado.`)
    return error
  }

  const guardarNuevaCompra = async (datos: DatosCompra, compraId?: string) => {
    const error = await guardarCompra(datos, compraId)
    if (!error) {
      setMensaje(compraId ? 'Compra actualizada.' : 'Compra guardada como borrador.')
    }
    return error
  }

  const emitirOrden = async (compra: Compra) => {
    const error = await emitirCompra(compra.id)
    setMensaje(error ?? `Orden ${compra.serie}-${compra.numero} emitida y pendiente de recepción.`)
  }

  const metricas = [
    {
      etiqueta: 'Proveedores activos',
      valor: proveedoresActivos.length,
      icono: Building2,
    },
    {
      etiqueta: 'Pendientes de recibir',
      valor: compras.filter((compra) => ['emitida', 'parcialmente-recibida'].includes(compra.estado)).length,
      icono: Truck,
    },
    {
      etiqueta: 'Compras recibidas',
      valor: compras.filter((compra) => compra.estado === 'recibida').length,
      icono: PackageCheck,
    },
    {
      etiqueta: 'Total recibido',
      valor: formatoMoneda.format(totalRecibido),
      icono: ShoppingCart,
    },
  ]

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">
            Abastecimiento y recepción
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Compras
          </h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
            Registra documentos multiproducto con proveedores autorizados. El
            stock solo se incrementa al confirmar la recepción de mercadería.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {puedeConsultarProveedores ? (
            <Button asChild variant="outline" size="lg">
              <Link to="/proveedores">
                <Building2 aria-hidden="true" />
                Abrir proveedores
              </Link>
            </Button>
          ) : null}
          {puedeGestionar ? <Button
            type="button"
            size="lg"
            disabled={
              proveedoresQuery.isLoading ||
              almacenesQuery.isLoading ||
              !proveedoresActivos.length ||
              !productosActivos.length ||
              !almacenesActivos.length
            }
            onClick={(evento) => abrirCompra(evento)}
          >
            <Plus aria-hidden="true" />
            Registrar compra
          </Button> : null}
        </div>
      </header>

      <section aria-label="Resumen de compras" className="ledger-sheet">
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

      {proveedoresQuery.isError ? (
        <aside role="alert" className="border-s-4 border-destructive bg-destructive/5 px-5 py-4 text-sm text-destructive">
          No se pudo cargar el maestro de proveedores. Abre el módulo de Proveedores y vuelve a intentarlo.
        </aside>
      ) : null}

      {almacenesQuery.isError ? (
        <aside role="alert" className="border-s-4 border-destructive bg-destructive/5 px-5 py-4 text-sm text-destructive">
          No se pudo cargar el maestro de almacenes. Revisa Inventario antes de registrar una compra.
        </aside>
      ) : null}

      {(!proveedoresActivos.length || !productosActivos.length || !almacenesActivos.length) && (
        <aside className="border-s-4 border-primary bg-accent/60 px-5 py-4 text-sm leading-6">
          {!proveedoresActivos.length
            ? 'Necesitas al menos un proveedor activo del maestro persistente para crear una compra.'
            : null}{' '}
          {!proveedoresActivos.length && puedeConsultarProveedores ? (
            <Link className="font-medium text-primary underline" to="/proveedores">
              Abrir proveedores
            </Link>
          ) : null}{!proveedoresActivos.length ? ' ' : null}
          {!productosActivos.length ? (
            <>
              Necesitas al menos un producto activo.{' '}
              <Link className="font-medium text-primary underline" to="/productos">
                Abrir catálogo
              </Link>
              .
            </>
          ) : null}
          {!almacenesActivos.length ? (
            <>
              Necesitas al menos un almacén activo con una ubicación configurada.{' '}
              <Link className="font-medium text-primary underline" to="/inventario">
                Abrir inventario
              </Link>
              .
            </>
          ) : null}
        </aside>
      )}

      <section aria-labelledby="compras-title" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[minmax(14rem,1fr)_16rem_12rem] lg:items-end">
          <div>
            <h2 id="compras-title" className="text-lg font-semibold">
              Documentos de compra
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {comprasFiltradas.length} de {compras.length} documentos
            </p>
          </div>
          <div>
            <label htmlFor="buscar-compra" className="field-label">
              Buscar
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id="buscar-compra"
                type="search"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                className="field-control ps-9"
                placeholder="Documento o proveedor"
              />
            </div>
          </div>
          <div>
            <label htmlFor="estado-compra" className="field-label">
              Estado
            </label>
            <select
              id="estado-compra"
              value={filtroEstado}
              onChange={(evento) =>
                setFiltroEstado(evento.target.value as FiltroEstado)
              }
              className="field-control"
            >
              <option value="todos">Todos</option>
              <option value="borrador">Pendientes</option>
              <option value="emitida">Emitidas</option>
              <option value="parcialmente-recibida">Recepción parcial</option>
              <option value="recibida">Recibidas</option>
              <option value="cerrada-parcial">Cerradas parciales</option>
              <option value="anulada">Anuladas</option>
            </select>
          </div>
        </div>

        {!comprasFiltradas.length ? (
          <div className="px-5 py-14 text-center sm:px-6">
            <ShoppingCart aria-hidden="true" className="mx-auto size-8 text-primary" />
            <h3 className="mt-4 font-semibold">
              {compras.length ? 'No hay coincidencias' : 'Aún no hay compras'}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {compras.length
                ? 'Prueba con otro término o estado.'
                : 'Crea un borrador y confírmalo cuando la mercadería llegue al almacén.'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y md:hidden">
              {comprasFiltradas.map((compra) => {
                const totales = calcularTotalesCompra(
                  compra.lineas,
                  compra.preciosIncluyenIgv,
                )
                return (
                  <article key={compra.id} className="px-5 py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-primary uppercase">
                          {etiquetaDocumento(compra)}
                        </p>
                        <h3 className="mt-1 font-semibold">{compra.proveedorNombre}</h3>
                      </div>
                      <EstadoCompraEtiqueta estado={compra.estado} />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Emisión</dt>
                        <dd className="mt-1">
                          {formatoFecha.format(new Date(`${compra.fechaEmision}T12:00:00`))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Productos</dt>
                        <dd className="mt-1 font-mono">{compra.lineas.length}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Total</dt>
                        <dd className="mt-1 font-mono font-semibold">
                          {formatoMoneda.format(totales.total)}
                        </dd>
                      </div>
                    </dl>
                    {compra.estado === 'borrador' && puedeGestionar ? (
                      <div className="mt-4 flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={(evento) => abrirCompra(evento, compra)}
                        >
                          <Pencil aria-hidden="true" /> Editar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void emitirOrden(compra)}
                        >
                          <Send aria-hidden="true" /> Emitir
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={(evento) => solicitarAnulacion(evento, compra)}
                        >
                          <Ban aria-hidden="true" /> Anular
                        </Button>
                      </div>
                    ) : ['emitida', 'parcialmente-recibida'].includes(compra.estado) && puedeRecibir ? (
                      <div className="mt-4 flex gap-2">
                        <Button type="button" onClick={(evento) => solicitarRecepcion(evento, compra)}>
                          <PackageCheck aria-hidden="true" /> Recibir
                        </Button>
                        {puedeGestionar ? (
                          <Button type="button" variant="ghost" onClick={(evento) => solicitarAnulacion(evento, compra)}>
                            <Ban aria-hidden="true" /> Anular
                          </Button>
                        ) : null}
                      </div>
                    ) : compra.estado === 'emitida' && puedeGestionar ? (
                      <Button type="button" variant="ghost" className="mt-4" onClick={(evento) => solicitarAnulacion(evento, compra)}>
                        <Ban aria-hidden="true" /> Anular
                      </Button>
                    ) : null}
                  </article>
                )
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                    <th className="px-6 py-3 font-medium">Documento</th>
                    <th className="px-4 py-3 font-medium">Proveedor</th>
                    <th className="px-4 py-3 font-medium">Emisión</th>
                    <th className="px-4 py-3 text-end font-medium">Productos</th>
                    <th className="px-4 py-3 text-end font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 text-end font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {comprasFiltradas.map((compra) => {
                    const totales = calcularTotalesCompra(
                      compra.lineas,
                      compra.preciosIncluyenIgv,
                    )
                    return (
                      <tr key={compra.id} className="hover:bg-muted/35">
                        <td className="px-6 py-4 font-mono text-xs uppercase">
                          {etiquetaDocumento(compra)}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium">{compra.proveedorNombre}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {compra.proveedorDocumento}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {formatoFecha.format(new Date(`${compra.fechaEmision}T12:00:00`))}
                        </td>
                        <td className="px-4 py-4 text-end font-mono tabular-nums">
                          {compra.lineas.length}
                        </td>
                        <td className="px-4 py-4 text-end font-mono font-semibold tabular-nums">
                          {formatoMoneda.format(totales.total)}
                        </td>
                        <td className="px-4 py-4">
                          <EstadoCompraEtiqueta estado={compra.estado} />
                        </td>
                        <td className="px-6 py-4">
                          {compra.estado === 'borrador' && puedeGestionar ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title="Editar compra"
                                aria-label={`Editar ${etiquetaDocumento(compra)}`}
                                onClick={(evento) => abrirCompra(evento, compra)}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title="Emitir orden"
                                aria-label={`Emitir ${etiquetaDocumento(compra)}`}
                                onClick={() => void emitirOrden(compra)}
                              >
                                <Send aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title="Anular orden"
                                aria-label={`Anular ${etiquetaDocumento(compra)}`}
                                onClick={(evento) => solicitarAnulacion(evento, compra)}
                              >
                                <Ban aria-hidden="true" />
                              </Button>
                            </div>
                          ) : ['emitida', 'parcialmente-recibida'].includes(compra.estado) && puedeRecibir ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title="Recibir mercadería"
                                aria-label={`Recibir ${etiquetaDocumento(compra)}`}
                                onClick={(evento) => solicitarRecepcion(evento, compra)}
                              >
                                <PackageCheck aria-hidden="true" />
                              </Button>
                              {puedeGestionar ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  title="Anular orden"
                                  aria-label={`Anular ${etiquetaDocumento(compra)}`}
                                  onClick={(evento) => solicitarAnulacion(evento, compra)}
                                >
                                  <Ban aria-hidden="true" />
                                </Button>
                              ) : null}
                            </div>
                          ) : compra.estado === 'emitida' && puedeGestionar ? (
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title="Anular orden"
                                aria-label={`Anular ${etiquetaDocumento(compra)}`}
                                onClick={(evento) => solicitarAnulacion(evento, compra)}
                              >
                                <Ban aria-hidden="true" />
                              </Button>
                            </div>
                          ) : (
                            <span className="block text-end text-xs text-muted-foreground">
                              Cerrada
                            </span>
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

      {dialogoCompraAbierto && puedeGestionar ? (
        <DialogoCompra
          key={compraSeleccionada?.id ?? 'nueva'}
          abierto={dialogoCompraAbierto}
          compra={compraSeleccionada}
          proveedores={proveedoresActivos}
          productos={productosActivos}
          almacenes={almacenes}
          alCambiarApertura={setDialogoCompraAbierto}
          alGuardar={guardarNuevaCompra}
          alRestaurarFoco={() => disparadorCompra.current?.focus()}
        />
      ) : null}

      {compraPorRecibir && puedeRecibir ? (
        <DialogoConfirmacionRecepcion
          abierto={Boolean(compraPorRecibir)}
          compra={compraPorRecibir}
          ubicaciones={ubicacionesQuery.data ?? []}
          alCambiarApertura={(abierto) => {
            if (!abierto) setCompraPorRecibir(null)
          }}
          alConfirmar={confirmarRecepcion}
          alRestaurarFoco={() => disparadorRecepcion.current?.focus()}
        />
      ) : null}

      {compraPorAnular && puedeGestionar ? (
        <DialogoConfirmacionAnulacion
          abierto={Boolean(compraPorAnular)}
          compra={compraPorAnular}
          alCambiarApertura={(abierto) => {
            if (!abierto) setCompraPorAnular(null)
          }}
          alConfirmar={confirmarAnulacion}
          alRestaurarFoco={() => disparadorAnulacion.current?.focus()}
        />
      ) : null}
    </div>
  )
}
