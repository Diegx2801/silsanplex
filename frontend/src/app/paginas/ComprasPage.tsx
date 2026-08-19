import {
  Building2,
  PackageCheck,
  Pencil,
  Plus,
  Search,
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
import { DialogoCompra } from '@/modulos/compras/componentes/DialogoCompra'
import { DialogoConfirmacionRecepcion } from '@/modulos/compras/componentes/DialogoConfirmacionRecepcion'
import { DialogoProveedor } from '@/modulos/compras/componentes/DialogoProveedor'
import { useComprasTemporales } from '@/modulos/compras/estado/useComprasTemporales'
import {
  calcularTotalesCompra,
  type Compra,
  type DatosCompra,
  type DatosProveedor,
  type EstadoCompra,
  type Proveedor,
} from '@/modulos/compras/modelo/compras'
import { useProductosTemporales } from '@/modulos/productos/estado/useProductosTemporales'

type FiltroEstado = 'todos' | EstadoCompra

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
    recibida: 'Recibida',
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
  const { productos } = useProductosTemporales()
  const productosActivos = useMemo(
    () => productos.filter((producto) => producto.activo),
    [productos],
  )
  const {
    proveedores,
    compras,
    guardarProveedor,
    guardarCompra,
    recibirCompra,
  } = useComprasTemporales(productos)
  const proveedoresActivos = useMemo(
    () => proveedores.filter((proveedor) => proveedor.activo),
    [proveedores],
  )
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos')
  const [proveedorSeleccionado, setProveedorSeleccionado] =
    useState<Proveedor | null>(null)
  const [compraSeleccionada, setCompraSeleccionada] = useState<Compra | null>(
    null,
  )
  const [compraPorRecibir, setCompraPorRecibir] = useState<Compra | null>(null)
  const [dialogoProveedorAbierto, setDialogoProveedorAbierto] = useState(false)
  const [dialogoCompraAbierto, setDialogoCompraAbierto] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const disparadorProveedor = useRef<HTMLButtonElement | null>(null)
  const disparadorCompra = useRef<HTMLButtonElement | null>(null)
  const disparadorRecepcion = useRef<HTMLButtonElement | null>(null)
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

  const abrirProveedor = (
    evento: ReactMouseEvent<HTMLButtonElement>,
    proveedor: Proveedor | null = null,
  ) => {
    disparadorProveedor.current = evento.currentTarget
    setProveedorSeleccionado(proveedor)
    setDialogoProveedorAbierto(true)
  }

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

  const confirmarRecepcion = () => {
    if (!compraPorRecibir) return
    const error = recibirCompra(compraPorRecibir.id)
    setMensaje(
      error ??
        `Compra ${compraPorRecibir.serie}-${compraPorRecibir.numero} recibida e inventario actualizado.`,
    )
    if (!error) setCompraPorRecibir(null)
  }

  const guardarNuevoProveedor = (
    datos: DatosProveedor,
    proveedorId?: string,
  ) => {
    const error = guardarProveedor(datos, proveedorId)
    if (!error) {
      setMensaje(
        proveedorId ? 'Proveedor actualizado.' : 'Proveedor registrado.',
      )
    }
    return error
  }

  const guardarNuevaCompra = (datos: DatosCompra, compraId?: string) => {
    const error = guardarCompra(datos, compraId)
    if (!error) {
      setMensaje(compraId ? 'Compra actualizada.' : 'Compra guardada como borrador.')
    }
    return error
  }

  const metricas = [
    {
      etiqueta: 'Proveedores activos',
      valor: proveedoresActivos.length,
      icono: Building2,
    },
    {
      etiqueta: 'Pendientes de recibir',
      valor: compras.filter((compra) => compra.estado === 'borrador').length,
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
            Registra proveedores y documentos multiproducto. El stock solo se
            incrementa al confirmar la recepción de mercadería.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={(evento) => abrirProveedor(evento)}
          >
            <Building2 aria-hidden="true" />
            Nuevo proveedor
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={!proveedoresActivos.length || !productosActivos.length}
            onClick={(evento) => abrirCompra(evento)}
          >
            <Plus aria-hidden="true" />
            Registrar compra
          </Button>
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

      {(!proveedoresActivos.length || !productosActivos.length) && (
        <aside className="border-s-4 border-primary bg-accent/60 px-5 py-4 text-sm leading-6">
          {!proveedoresActivos.length
            ? 'Registra al menos un proveedor activo para crear una compra.'
            : null}{' '}
          {!productosActivos.length ? (
            <>
              Necesitas al menos un producto activo.{' '}
              <Link className="font-medium text-primary underline" to="/productos">
                Abrir catálogo
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
              <option value="recibida">Recibidas</option>
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
                    {compra.estado === 'borrador' ? (
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
                          onClick={(evento) => solicitarRecepcion(evento, compra)}
                        >
                          <PackageCheck aria-hidden="true" /> Recibir
                        </Button>
                      </div>
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
                          {compra.estado === 'borrador' ? (
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
                                title="Recibir mercadería"
                                aria-label={`Recibir ${etiquetaDocumento(compra)}`}
                                onClick={(evento) =>
                                  solicitarRecepcion(evento, compra)
                                }
                              >
                                <PackageCheck aria-hidden="true" />
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

      <section aria-labelledby="proveedores-title" className="ledger-sheet">
        <div className="flex items-end justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id="proveedores-title" className="text-lg font-semibold">
              Proveedores
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Maestro local disponible para nuevas compras
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {proveedores.length} REG.
          </span>
        </div>
        {proveedores.length ? (
          <div className="divide-y">
            {proveedores.map((proveedor) => (
              <article
                key={proveedor.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{proveedor.razonSocial}</h3>
                    <span
                      className="status-label"
                      data-tone={proveedor.activo ? 'listo' : 'revision'}
                    >
                      {proveedor.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {proveedor.tipoDocumento.toUpperCase()} {proveedor.numeroDocumento}
                    {proveedor.contacto ? ` · ${proveedor.contacto}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar proveedor ${proveedor.razonSocial}`}
                  onClick={(evento) => abrirProveedor(evento, proveedor)}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-6">
            Los proveedores que registres aparecerán aquí.
          </div>
        )}
      </section>

      {dialogoProveedorAbierto ? (
        <DialogoProveedor
          key={proveedorSeleccionado?.id ?? 'nuevo'}
          abierto={dialogoProveedorAbierto}
          proveedor={proveedorSeleccionado}
          alCambiarApertura={setDialogoProveedorAbierto}
          alGuardar={guardarNuevoProveedor}
          alRestaurarFoco={() => disparadorProveedor.current?.focus()}
        />
      ) : null}

      {dialogoCompraAbierto ? (
        <DialogoCompra
          key={compraSeleccionada?.id ?? 'nueva'}
          abierto={dialogoCompraAbierto}
          compra={compraSeleccionada}
          proveedores={proveedoresActivos}
          productos={productosActivos}
          alCambiarApertura={setDialogoCompraAbierto}
          alGuardar={guardarNuevaCompra}
          alRestaurarFoco={() => disparadorCompra.current?.focus()}
        />
      ) : null}

      {compraPorRecibir ? (
        <DialogoConfirmacionRecepcion
          abierto={Boolean(compraPorRecibir)}
          compra={compraPorRecibir}
          alCambiarApertura={(abierto) => {
            if (!abierto) setCompraPorRecibir(null)
          }}
          alConfirmar={confirmarRecepcion}
          alRestaurarFoco={() => disparadorRecepcion.current?.focus()}
        />
      ) : null}
    </div>
  )
}
