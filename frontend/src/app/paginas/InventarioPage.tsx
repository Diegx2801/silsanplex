import { Boxes, PackageCheck, PackageX, Search } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { EstadoListadoInventario } from '@/modulos/inventario/componentes/EstadoListadoInventario'
import { PaginacionInventario } from '@/modulos/inventario/componentes/PaginacionInventario'
import { PanelExistenciasLotes } from '@/modulos/inventario/componentes/PanelExistenciasLotes'
import { VistasInventario } from '@/modulos/inventario/componentes/VistasInventario'
import { useAlmacenes } from '@/modulos/inventario/estado/useAlmacenes'
import { useDebounceInventario } from '@/modulos/inventario/estado/useDebounceInventario'
import { useInventario } from '@/modulos/inventario/estado/useInventario'
import type { ExistenciaInventario, FiltroStockInventario, OrdenExistenciasInventario } from '@/modulos/inventario/modelo/inventario'
import type { TamanioPaginaInventario } from '@/modulos/inventario/modelo/paginacionInventario'

const formatoCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })

function EstadoStock({ existencia }: { existencia: ExistenciaInventario }) {
  const tieneStock = existencia.stockAsignable > 0

  return (
    <span className="status-label" data-tone={tieneStock ? 'listo' : 'revision'}>
      {tieneStock ? 'Disponible' : 'Sin stock'}
    </span>
  )
}


export function InventarioPage() {
  const [parametros] = useSearchParams()
  const vista = parametros.get('vista') === 'lotes' ? 'lotes' : 'productos'
  return (
    <div className="space-y-8">
      <header className="border-b pb-7">
        <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">Inventario</span>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Existencias y lotes</h1>
        <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
          Consulta el stock físico, las reservas y la cantidad disponible por producto, almacén y lote.
        </p>
      </header>
      <VistasInventario etiqueta="Vistas de existencias" vista={vista} opciones={[
        { valor: 'productos', etiqueta: 'Por producto' },
        { valor: 'lotes', etiqueta: 'Por almacén y lote' },
      ]} />
      <p className="text-sm leading-6 text-muted-foreground">
        El stock físico incluye todas las condiciones. El disponible excluye las reservas y los bienes en cuarentena, dañados o vencidos.
      </p>
      {vista === 'productos' ? <ExistenciasPorProducto /> : <ExistenciasPorLote />}
    </div>
  )
}

function ExistenciasPorLote() {
  const gestion = useAlmacenes()
  return (
    <EstadoListadoInventario cargando={gestion.cargando} error={gestion.error} vacio={false}
      mensajeVacio="" alReintentar={() => void gestion.reintentar()}>
      <PanelExistenciasLotes almacenes={gestion.almacenes} ubicaciones={gestion.ubicaciones} />
    </EstadoListadoInventario>
  )
}

function ExistenciasPorProducto() {
  const [busqueda, setBusqueda] = useState('')
  const busquedaDebounced = useDebounceInventario(busqueda)
  const [filtroStock, setFiltroStock] = useState<FiltroStockInventario>('todos')
  const [ordenExistencias, setOrdenExistencias] = useState<OrdenExistenciasInventario>('producto-asc')
  const [paginaExistencias, setPaginaExistencias] = useState(1)
  const [tamanioExistencias, setTamanioExistencias] = useState<TamanioPaginaInventario>(25)
  const inventario = useInventario({
    existencias: { pagina: paginaExistencias, tamanioPagina: tamanioExistencias, busqueda: busquedaDebounced, filtroStock, orden: ordenExistencias },
  })
  const existencias = inventario.existencias?.elementos ?? []
  const resumen = inventario.resumenExistencias
  const metricas = [
    { etiqueta: 'Productos con stock', valor: resumen?.productosConStock, icono: PackageCheck },
    { etiqueta: 'Productos controlados', valor: resumen?.productos, icono: Boxes },
    { etiqueta: 'Productos sin stock', valor: resumen?.productosSinStock, icono: PackageX },
  ]
  return (
    <>
      <section aria-label="Resumen de inventario" className="ledger-sheet">
        <div className="grid sm:grid-cols-3">
          {metricas.map(({ etiqueta, valor, icono: Icono }) => (
            <article key={etiqueta} className="border-b px-5 py-5 last:border-b-0 sm:border-b-0 sm:border-e sm:last:border-e-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">{etiqueta}</p>
                <Icono aria-hidden="true" className="size-4 text-primary" />
              </div>
              <p className="mt-3 font-mono text-2xl font-semibold tabular-nums">{valor ?? '—'}</p>
            </article>
          ))}
        </div>
      </section>
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
                  <dl className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Físico</dt><dd className="mt-1 font-mono tabular-nums">{formatoCantidad.format(existencia.stockFisico)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Reservado</dt><dd className="mt-1 font-mono tabular-nums">{formatoCantidad.format(existencia.stockReservado)}</dd></div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Disponible</dt>
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
                    <th className="px-4 py-3 text-end font-medium">Físico</th>
                    <th className="px-4 py-3 text-end font-medium">Reservado</th>
                    <th className="px-4 py-3 text-end font-medium">Disponible</th>
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
                      <td className="px-4 py-4 text-end font-mono tabular-nums">{formatoCantidad.format(existencia.stockFisico)}</td>
                      <td className="px-4 py-4 text-end font-mono tabular-nums">{formatoCantidad.format(existencia.stockReservado)}</td>
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


    </>
  )
}
