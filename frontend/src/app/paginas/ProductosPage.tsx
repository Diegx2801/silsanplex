import {
  CirclePower,
  Download,
  Eye,
  FileSpreadsheet,
  ImageIcon,
  LoaderCircle,
  PackageSearch,
  Pencil,
  Plus,
} from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Link, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { DetalleProducto } from '@/modulos/productos/componentes/DetalleProducto'
import { DialogoConfirmacionEstado } from '@/modulos/productos/componentes/DialogoConfirmacionEstado'
import { DialogoProducto } from '@/modulos/productos/componentes/DialogoProducto'
import { FiltrosProductos } from '@/modulos/productos/componentes/FiltrosProductos'
import { PaginacionProductos } from '@/modulos/productos/componentes/PaginacionProductos'
import { useProductos } from '@/modulos/productos/estado/useProductos'
import type {
  FiltroEstadoProducto,
  OrdenProductos,
} from '@/modulos/productos/modelo/consultaProductos'
import type {
  DatosProducto,
  Producto,
} from '@/modulos/productos/modelo/producto'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

function mostrarPrecio(precio: string) {
  return precio ? formatoMoneda.format(Number(precio)) : 'Sin definir'
}

function MiniaturaProducto({ producto }: { producto: Producto }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden border bg-muted text-muted-foreground">
      {producto.miniaturaUrl ? (
        <img
          src={producto.miniaturaUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <ImageIcon aria-hidden="true" className="size-4" />
      )}
    </span>
  )
}

interface ContenidoVacioProps {
  hayProductos: boolean
  puedeGestionar: boolean
  alRegistrar: (evento: ReactMouseEvent<HTMLButtonElement>) => void
}

function ContenidoVacio({ hayProductos, puedeGestionar, alRegistrar }: ContenidoVacioProps) {
  return (
    <div className="px-5 py-14 text-center sm:px-6">
      <PackageSearch
        aria-hidden="true"
        className="mx-auto size-8 text-primary"
      />
      <p className="mt-4 font-semibold">
        {hayProductos
          ? 'No hay coincidencias'
          : 'Aún no hay productos registrados'}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {hayProductos
          ? 'Prueba con otro término o cambia el filtro de estado.'
          : 'Registra el primer producto con los datos esenciales. Quedará disponible para toda la organización.'}
      </p>
      {!hayProductos && puedeGestionar ? (
        <Button type="button" className="mt-5" onClick={alRegistrar}>
          <Plus aria-hidden="true" />
          Registrar producto
        </Button>
      ) : null}
    </div>
  )
}

export function ProductosPage() {
  const { hasPermission } = useAuth()
  const puedeGestionar = hasPermission(PERMISSIONS.PRODUCTS_MANAGE)
  const [busqueda, setBusqueda] = useState('')
  const busquedaDiferida = useDeferredValue(busqueda)
  const [parametros, setParametros] = useSearchParams()
  const [filtroEstado, setFiltroEstado] =
    useState<FiltroEstadoProducto>('activos')
  const [orden, setOrden] = useState<OrdenProductos>('codigo-asc')
  const [pagina, setPagina] = useState(1)
  const [tamanioPagina, setTamanioPagina] = useState(10)
  const [formularioAbierto, setFormularioAbierto] = useState(
    () => parametros.get('nuevo') === '1',
  )
  const [productoSeleccionado, setProductoSeleccionado] =
    useState<Producto | null>(null)
  const [productoDetalleId, setProductoDetalleId] = useState<string | null>(null)
  const [productoCambioEstadoId, setProductoCambioEstadoId] = useState<
    string | null
  >(null)
  const [mensaje, setMensaje] = useState('')
  const [exportando, setExportando] = useState(false)
  const disparadorFormulario = useRef<HTMLButtonElement | null>(null)
  const disparadorDetalle = useRef<HTMLButtonElement | null>(null)
  const disparadorEstado = useRef<HTMLButtonElement | null>(null)
  const consulta = {
    busqueda: busquedaDiferida,
    estado: filtroEstado,
    categoria: '',
    laboratorio: '',
    orden,
  }
  const {
    productos,
    guardarProducto,
    cambiarEstado,
    cargando,
    error,
    reintentar,
    cambiandoEstado,
    totalFiltrado,
    totalProductos,
    unidadesMedida,
    exportarProductos,
  } = useProductos('', { consulta, pagina, tamanioPagina })
  const mensajeErrorProductos =
    error instanceof Error
      ? error.message
      : 'No se pudo cargar el catálogo de productos.'

  const productoDetalle =
    productos.find((producto) => producto.id === productoDetalleId) ?? null
  const productoCambioEstado =
    productos.find((producto) => producto.id === productoCambioEstadoId) ?? null

  const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / tamanioPagina))
  const paginaActual = cargando
    ? Math.max(1, pagina)
    : Math.min(totalPaginas, Math.max(1, pagina))
  const paginaProductos = {
    elementos: productos,
    inicio: productos.length ? (paginaActual - 1) * tamanioPagina + 1 : 0,
    fin: productos.length
      ? (paginaActual - 1) * tamanioPagina + productos.length
      : 0,
    pagina: paginaActual,
    totalPaginas,
  }

  useEffect(() => {
    if (!cargando && pagina !== paginaActual) setPagina(paginaActual)
  }, [cargando, pagina, paginaActual])

  const cantidadFiltrosActivos =
    Number(Boolean(busqueda.trim())) +
    Number(filtroEstado !== 'todos')

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroEstado('todos')
    setPagina(1)
  }

  const abrirRegistro = (evento: ReactMouseEvent<HTMLButtonElement>) => {
    disparadorFormulario.current = evento.currentTarget
    setProductoSeleccionado(null)
    setFormularioAbierto(true)
  }

  const abrirEdicion = (
    producto: Producto,
    evento: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    disparadorFormulario.current = evento.currentTarget
    setProductoSeleccionado(producto)
    setFormularioAbierto(true)
  }

  const guardar = async (datos: DatosProducto, productoId?: string, imagenPrincipal?: File | null) => {
    const resultado = await guardarProducto(datos, productoId, imagenPrincipal)
    if (!resultado.error) {
      setMensaje(resultado.advertencia ?? (productoId
        ? 'Los cambios se guardaron correctamente.'
        : 'El producto se registró correctamente.'))
    }
    return resultado
  }

  const abrirDetalle = (
    producto: Producto,
    evento: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    disparadorDetalle.current = evento.currentTarget
    setProductoDetalleId(producto.id)
  }

  const solicitarCambioEstado = (
    producto: Producto,
    evento: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    disparadorEstado.current = evento.currentTarget
    setProductoCambioEstadoId(producto.id)
  }

  const confirmarCambioEstado = async () => {
    if (!productoCambioEstado) return

    const error = await cambiarEstado(productoCambioEstado)
    if (error) {
      setMensaje(error)
      return
    }
    setMensaje(
      productoCambioEstado.activo
        ? 'El producto quedó inactivo.'
        : 'El producto quedó activo.',
    )
    setProductoCambioEstadoId(null)
  }

  const exportarCatalogo = async () => {
    if (!totalFiltrado || exportando) return

    setExportando(true)

    try {
      const productosParaExportar = await exportarProductos(consulta)
      if (!productosParaExportar.length) {
        setMensaje('No se encontraron productos para exportar.')
        return
      }

      const { descargarCatalogoProductos } = await import(
        '@/modulos/productos/servicios/exportadorProductos'
      )
      descargarCatalogoProductos(productosParaExportar)
      setMensaje(
        `Se exportaron ${productosParaExportar.length} ${
          productosParaExportar.length === 1 ? 'producto' : 'productos'
        } a Excel.`,
      )
    } catch {
      setMensaje('No se pudo exportar el catálogo. Inténtalo nuevamente.')
    } finally {
      setExportando(false)
    }
  }

  const cambiarAperturaFormulario = (abierto: boolean) => {
    setFormularioAbierto(abierto)

    if (!abierto && parametros.has('nuevo')) {
      const siguientesParametros = new URLSearchParams(parametros)
      siguientesParametros.delete('nuevo')
      setParametros(siguientesParametros, { replace: true })
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Productos
          </h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
            Registro persistente del catálogo para compras, inventario y ventas.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:self-end">
          <Button asChild size="lg" variant="outline">
            <Link to="/productos/importar">
              <FileSpreadsheet aria-hidden="true" />
              Revisar importación
            </Link>
          </Button>
          {puedeGestionar ? (
            <Button size="lg" onClick={abrirRegistro}>
              <Plus aria-hidden="true" />
              Registrar producto
            </Button>
          ) : null}
        </div>
      </header>

      <FiltrosProductos
        busqueda={busqueda}
        estado={filtroEstado}
        orden={orden}
        cantidadActivos={cantidadFiltrosActivos}
        alCambiarBusqueda={(valor) => {
          setBusqueda(valor)
          setPagina(1)
        }}
        alCambiarEstado={(valor) => {
          setFiltroEstado(valor)
          setPagina(1)
        }}
        alCambiarOrden={(valor) => {
          setOrden(valor)
          setPagina(1)
        }}
        alLimpiar={limpiarFiltros}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {mensaje}
      </p>

      <section
        aria-labelledby="registro-productos-title"
        className="ledger-sheet"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div>
            <h2
              id="registro-productos-title"
              className="text-lg font-semibold"
            >
              Registro de productos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {productos.length} de {totalFiltrado} productos visibles
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              CATÁLOGO CENTRAL
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={!totalFiltrado || exportando}
              title={`Exportar ${totalFiltrado} productos filtrados`}
              onClick={exportarCatalogo}
            >
              {exportando ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Download aria-hidden="true" />
              )}
              {exportando ? 'Preparando…' : 'Exportar Excel'}
            </Button>
          </div>
        </div>

        {cargando ? (
          <div
            role="status"
            className="flex min-h-56 flex-col items-center justify-center gap-3 px-5 py-14 text-center sm:px-6"
          >
            <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-primary" />
            <p className="font-semibold">Cargando productos</p>
            <p className="text-sm text-muted-foreground">
              Consultando el catálogo de tu organización.
            </p>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex min-h-56 flex-col items-center justify-center gap-3 px-5 py-14 text-center sm:px-6"
          >
            <PackageSearch aria-hidden="true" className="size-8 text-destructive" />
            <p className="font-semibold">No se pudo cargar el catálogo</p>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              {mensajeErrorProductos}
            </p>
            <Button type="button" variant="outline" onClick={() => void reintentar()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
          <div className="divide-y md:hidden">
          {paginaProductos.elementos.length ? (
            paginaProductos.elementos.map((producto) => (
              <article key={producto.id} className="px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <MiniaturaProducto producto={producto} />
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium tabular-nums text-primary">
                        {producto.codigo}
                      </p>
                      <h3 className="mt-1 line-clamp-2 font-semibold">
                        {producto.descripcion}
                      </h3>
                    </div>
                  </div>
                  <span
                    className="status-label"
                    data-tone={producto.activo ? 'listo' : 'revision'}
                  >
                    {producto.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Marca</dt>
                    <dd className="mt-1">{producto.laboratorio || 'Sin definir'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Precio base</dt>
                    <dd className="mt-1 font-mono text-xs tabular-nums">
                      {mostrarPrecio(producto.precioVenta)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 grid grid-cols-2 gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="col-span-2"
                    onClick={(evento) => abrirDetalle(producto, evento)}
                  >
                    <Eye aria-hidden="true" />
                    Ver detalle
                  </Button>
                  {puedeGestionar ? <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={(evento) => abrirEdicion(producto, evento)}
                  >
                    <Pencil aria-hidden="true" />
                    Editar
                  </Button> : null}
                  {puedeGestionar ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      disabled={cambiandoEstado}
                      onClick={(evento) =>
                        solicitarCambioEstado(producto, evento)
                      }
                    >
                      <CirclePower aria-hidden="true" />
                      {producto.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <ContenidoVacio
              hayProductos={Boolean(totalProductos)}
              puedeGestionar={puedeGestionar}
              alRegistrar={abrirRegistro}
            />
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                <th scope="col" className="px-5 py-3 font-medium sm:px-6">
                  SKU
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Producto
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Marca
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Presentación
                </th>
                <th scope="col" className="px-4 py-3 text-end font-medium">
                  Precio base
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Estado
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-end font-medium sm:px-6"
                >
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginaProductos.elementos.length ? (
                paginaProductos.elementos.map((producto) => (
                  <tr key={producto.id} className="hover:bg-muted/35">
                    <td className="px-5 py-4 font-mono text-xs font-medium tabular-nums sm:px-6">
                      {producto.codigo}
                    </td>
                    <td className="max-w-sm px-4 py-4">
                      <div className="flex items-center gap-3">
                        <MiniaturaProducto producto={producto} />
                        <div className="min-w-0">
                          <p className="font-medium">{producto.descripcion}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {producto.categoria || 'Sin línea'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {producto.laboratorio || 'Sin definir'}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {producto.presentacion || 'Sin definir'}
                    </td>
                    <td className="px-4 py-4 text-end font-mono text-xs tabular-nums">
                      {mostrarPrecio(producto.precioVenta)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="status-label"
                        data-tone={producto.activo ? 'listo' : 'revision'}
                      >
                        {producto.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-4 sm:px-6">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Ver detalle de ${producto.descripcion}`}
                          title="Ver detalle"
                          onClick={(evento) => abrirDetalle(producto, evento)}
                        >
                          <Eye aria-hidden="true" />
                        </Button>
                        {puedeGestionar ? <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${producto.descripcion}`}
                          title="Editar producto"
                          onClick={(evento) => abrirEdicion(producto, evento)}
                        >
                          <Pencil aria-hidden="true" />
                        </Button> : null}
                        {puedeGestionar ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={cambiandoEstado}
                            aria-label={`${producto.activo ? 'Desactivar' : 'Activar'} ${producto.descripcion}`}
                            title={
                              producto.activo
                                ? 'Desactivar producto'
                                : 'Activar producto'
                            }
                            onClick={(evento) =>
                              solicitarCambioEstado(producto, evento)
                            }
                          >
                            <CirclePower aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                      <ContenidoVacio
                        hayProductos={Boolean(totalProductos)}
                        puedeGestionar={puedeGestionar}
                        alRegistrar={abrirRegistro}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginacionProductos
          inicio={paginaProductos.inicio}
          fin={paginaProductos.fin}
          totalFiltrado={totalFiltrado}
          total={totalProductos}
          pagina={paginaProductos.pagina}
          totalPaginas={paginaProductos.totalPaginas}
          tamanioPagina={tamanioPagina}
          alCambiarPagina={setPagina}
          alCambiarTamanio={(valor) => {
            setTamanioPagina(valor)
            setPagina(1)
          }}
        />
          </>
        )}
      </section>

      {formularioAbierto && puedeGestionar ? (
        <DialogoProducto
          key={productoSeleccionado?.id ?? 'nuevo'}
          abierto={formularioAbierto}
          producto={productoSeleccionado}
          unidadesMedida={unidadesMedida}
          alCambiarApertura={cambiarAperturaFormulario}
          alGuardar={guardar}
          alRestaurarFoco={() => disparadorFormulario.current?.focus()}
        />
      ) : null}

      {productoDetalle ? (
        <DetalleProducto
          abierto={Boolean(productoDetalleId)}
          producto={productoDetalle}
          alCambiarApertura={(abierto) => {
            if (!abierto) setProductoDetalleId(null)
          }}
          alRestaurarFoco={() => disparadorDetalle.current?.focus()}
        />
      ) : null}

      {productoCambioEstado && puedeGestionar ? (
        <DialogoConfirmacionEstado
          abierto={Boolean(productoCambioEstadoId)}
          producto={productoCambioEstado}
          cambiandoEstado={cambiandoEstado}
          alCambiarApertura={(abierto) => {
            if (!abierto) setProductoCambioEstadoId(null)
          }}
          alConfirmar={confirmarCambioEstado}
          alRestaurarFoco={() => disparadorEstado.current?.focus()}
        />
      ) : null}
    </div>
  )
}
