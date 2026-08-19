import {
  CirclePower,
  FileSpreadsheet,
  PackageSearch,
  Pencil,
  Plus,
  Search,
} from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { DialogoProducto } from '@/modulos/productos/componentes/DialogoProducto'
import { useProductosTemporales } from '@/modulos/productos/estado/useProductosTemporales'
import type {
  DatosProducto,
  Producto,
} from '@/modulos/productos/modelo/producto'

type FiltroEstado = 'todos' | 'activos' | 'inactivos'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

function mostrarPrecio(precio: string) {
  return precio ? formatoMoneda.format(Number(precio)) : 'Sin definir'
}

interface ContenidoVacioProps {
  hayProductos: boolean
  alRegistrar: (evento: ReactMouseEvent<HTMLButtonElement>) => void
}

function ContenidoVacio({ hayProductos, alRegistrar }: ContenidoVacioProps) {
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
          : 'Registra el primer producto con los datos esenciales. Podrás editarlo durante esta sesión.'}
      </p>
      {!hayProductos ? (
        <Button type="button" className="mt-5" onClick={alRegistrar}>
          <Plus aria-hidden="true" />
          Registrar producto
        </Button>
      ) : null}
    </div>
  )
}

export function ProductosPage() {
  const { productos, guardarProducto, cambiarEstado } =
    useProductosTemporales()
  const [parametros, setParametros] = useSearchParams()
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos')
  const [formularioAbierto, setFormularioAbierto] = useState(
    () => parametros.get('nuevo') === '1',
  )
  const [productoSeleccionado, setProductoSeleccionado] =
    useState<Producto | null>(null)
  const [mensaje, setMensaje] = useState('')
  const ultimoDisparador = useRef<HTMLButtonElement | null>(null)
  const busquedaDiferida = useDeferredValue(busqueda)

  const productosFiltrados = useMemo(() => {
    const termino = busquedaDiferida.trim().toLocaleLowerCase('es-PE')

    return productos.filter((producto) => {
      const coincideEstado =
        filtroEstado === 'todos' ||
        (filtroEstado === 'activos' && producto.activo) ||
        (filtroEstado === 'inactivos' && !producto.activo)
      const coincideBusqueda =
        !termino ||
        [
          producto.codigo,
          producto.codigoBarras,
          producto.descripcion,
          producto.laboratorio,
        ].some((valor) =>
          valor.toLocaleLowerCase('es-PE').includes(termino),
        )

      return coincideEstado && coincideBusqueda
    })
  }, [busquedaDiferida, filtroEstado, productos])

  const abrirRegistro = (evento: ReactMouseEvent<HTMLButtonElement>) => {
    ultimoDisparador.current = evento.currentTarget
    setProductoSeleccionado(null)
    setFormularioAbierto(true)
  }

  const abrirEdicion = (
    producto: Producto,
    evento: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    ultimoDisparador.current = evento.currentTarget
    setProductoSeleccionado(producto)
    setFormularioAbierto(true)
  }

  const guardar = (datos: DatosProducto, productoId?: string) => {
    const error = guardarProducto(datos, productoId)

    if (!error) {
      setMensaje(
        productoId
          ? 'Los cambios se guardaron temporalmente.'
          : 'El producto se registró temporalmente.',
      )
    }

    return error
  }

  const alternarEstado = (producto: Producto) => {
    cambiarEstado(producto.id)
    setMensaje(
      producto.activo
        ? 'El producto quedó inactivo temporalmente.'
        : 'El producto quedó activo temporalmente.',
    )
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
            Registro esencial del catálogo. Los datos se mantienen únicamente
            en esta sesión mientras Supabase continúa pendiente.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:self-end">
          <Button asChild size="lg" variant="outline">
            <Link to="/productos/importar">
              <FileSpreadsheet aria-hidden="true" />
              Revisar importación
            </Link>
          </Button>
          <Button size="lg" onClick={abrirRegistro}>
            <Plus aria-hidden="true" />
            Registrar producto
          </Button>
        </div>
      </header>

      <section
        aria-label="Filtros de productos"
        className="grid gap-4 md:grid-cols-[minmax(16rem,1fr)_13rem]"
      >
        <div>
          <label htmlFor="buscar-productos" className="field-label">
            Buscar
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="buscar-productos"
              type="search"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              className="field-control ps-9"
              placeholder="Código interno, barras, producto o laboratorio"
            />
          </div>
        </div>
        <div>
          <label htmlFor="filtro-estado" className="field-label">
            Estado
          </label>
          <select
            id="filtro-estado"
            value={filtroEstado}
            onChange={(evento) =>
              setFiltroEstado(evento.target.value as FiltroEstado)
            }
            className="field-control"
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>
      </section>

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
              {productosFiltrados.length} de {productos.length} productos visibles
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            SESIÓN LOCAL
          </span>
        </div>

        <div className="divide-y md:hidden">
          {productosFiltrados.length ? (
            productosFiltrados.map((producto) => (
              <article key={producto.id} className="px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs font-medium tabular-nums text-primary">
                      {producto.codigo}
                    </p>
                    <h3 className="mt-2 font-semibold">{producto.descripcion}</h3>
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
                    <dt className="text-xs text-muted-foreground">Laboratorio</dt>
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
                    variant="outline"
                    size="lg"
                    onClick={(evento) => abrirEdicion(producto, evento)}
                  >
                    <Pencil aria-hidden="true" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => alternarEstado(producto)}
                  >
                    <CirclePower aria-hidden="true" />
                    {producto.activo ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <ContenidoVacio
              hayProductos={Boolean(productos.length)}
              alRegistrar={abrirRegistro}
            />
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                <th scope="col" className="px-5 py-3 font-medium sm:px-6">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Producto
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Laboratorio
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
              {productosFiltrados.length ? (
                productosFiltrados.map((producto) => (
                  <tr key={producto.id} className="hover:bg-muted/35">
                    <td className="px-5 py-4 font-mono text-xs font-medium tabular-nums sm:px-6">
                      {producto.codigo}
                    </td>
                    <td className="max-w-xs px-4 py-4">
                      <p className="font-medium">{producto.descripcion}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {producto.categoria || 'Sin categoría'}
                      </p>
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
                          aria-label={`Editar ${producto.descripcion}`}
                          title="Editar producto"
                          onClick={(evento) => abrirEdicion(producto, evento)}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`${producto.activo ? 'Desactivar' : 'Activar'} ${producto.descripcion}`}
                          title={
                            producto.activo
                              ? 'Desactivar producto'
                              : 'Activar producto'
                          }
                          onClick={() => alternarEstado(producto)}
                        >
                          <CirclePower aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <ContenidoVacio
                      hayProductos={Boolean(productos.length)}
                      alRegistrar={abrirRegistro}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {formularioAbierto ? (
        <DialogoProducto
          key={productoSeleccionado?.id ?? 'nuevo'}
          abierto={formularioAbierto}
          producto={productoSeleccionado}
          alCambiarApertura={cambiarAperturaFormulario}
          alGuardar={guardar}
          alRestaurarFoco={() => ultimoDisparador.current?.focus()}
        />
      ) : null}
    </div>
  )
}
