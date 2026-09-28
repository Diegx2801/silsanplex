import { useState } from 'react'
import { EstadoListadoInventario } from './EstadoListadoInventario'
import { PaginacionInventario } from './PaginacionInventario'
import { useDebounceInventario } from '../estado/useDebounceInventario'
import { useListadosAlmacen } from '../estado/useListadosAlmacen'
import type { TamanioPaginaInventario } from '../modelo/paginacionInventario'

import {
  etiquetasEstadoStock,
  type Almacen,
  type UbicacionAlmacen,
} from '../modelo/almacen'
const formatoCantidad = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 3,
})
const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

export function PanelExistenciasLotes({
  almacenes,
  ubicaciones,
}: {
  almacenes: Almacen[]
  ubicaciones: UbicacionAlmacen[]
}) {
  const [stockConsulta, setStockConsulta] = useState({
    pagina: 1,
    tamanioPagina: 25 as TamanioPaginaInventario,
    busqueda: '',
    almacenId: '',
    ubicacionId: '',
    lote: '',
    estado: '' as '' | 'available' | 'quarantine' | 'damaged',
    vencimientoDesde: '',
    vencimientoHasta: '',
    orden: 'vencimiento-asc' as const,
  })

  const busqueda = useDebounceInventario(stockConsulta.busqueda)
  const listados = useListadosAlmacen({ stock: { ...stockConsulta, busqueda } })
  const saldos = listados.stock.data?.elementos ?? []
  return (
    <section aria-labelledby="stock-detallado" className="ledger-sheet">
      <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_13rem_11rem_11rem_13rem] xl:items-end">
        <div>
          <h2 id="stock-detallado" className="text-lg font-semibold">
            Stock por almacén, ubicación y lote
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {listados.stock.data?.total ?? 0} posiciones persistentes.
          </p>
        </div>
        <label className="field-label">
          Buscar
          <input
            type="search"
            value={stockConsulta.busqueda}
            onChange={(e) =>
              setStockConsulta((actual) => ({
                ...actual,
                busqueda: e.target.value,
                pagina: 1,
              }))
            }
            className="field-control"
            placeholder="Producto o código"
          />
        </label>
        <label className="field-label">
          Almacén
          <select
            value={stockConsulta.almacenId}
            onChange={(e) =>
              setStockConsulta((actual) => ({
                ...actual,
                almacenId: e.target.value,
                ubicacionId: '',
                pagina: 1,
              }))
            }
            className="field-control"
          >
            <option value="">Todos</option>
            {almacenes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Condición
          <select
            value={stockConsulta.estado}
            onChange={(e) =>
              setStockConsulta((actual) => ({
                ...actual,
                estado: e.target.value as typeof actual.estado,
                pagina: 1,
              }))
            }
            className="field-control"
          >
            <option value="">Todas</option>
            <option value="available">Disponible</option>
            <option value="quarantine">Cuarentena</option>
            <option value="damaged">Dañado</option>
          </select>
        </label>
        <label className="field-label">
          Orden
          <select
            value={stockConsulta.orden}
            onChange={(e) =>
              setStockConsulta((actual) => ({
                ...actual,
                orden: e.target.value as typeof actual.orden,
                pagina: 1,
              }))
            }
            className="field-control"
          >
            <option value="vencimiento-asc">Vencimiento próximo</option>
            <option value="vencimiento-desc">Vencimiento lejano</option>
            <option value="producto-asc">Producto A–Z</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6 lg:grid-cols-4">
        <label className="field-label">
          Ubicación
          <select
            value={stockConsulta.ubicacionId}
            onChange={(e) =>
              setStockConsulta((actual) => ({
                ...actual,
                ubicacionId: e.target.value,
                pagina: 1,
              }))
            }
            className="field-control"
          >
            <option value="">Todas</option>
            {ubicaciones
              .filter(
                (u) =>
                  !stockConsulta.almacenId ||
                  u.almacenId === stockConsulta.almacenId,
              )
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} · {u.nombre}
                </option>
              ))}
          </select>
        </label>
        <label className="field-label">
          Lote
          <input
            value={stockConsulta.lote}
            onChange={(e) =>
              setStockConsulta((actual) => ({
                ...actual,
                lote: e.target.value,
                pagina: 1,
              }))
            }
            className="field-control"
            placeholder="Número de lote"
          />
        </label>
        <label className="field-label">
          Vence desde
          <input
            type="date"
            value={stockConsulta.vencimientoDesde}
            onChange={(e) =>
              setStockConsulta((actual) => ({
                ...actual,
                vencimientoDesde: e.target.value,
                pagina: 1,
              }))
            }
            className="field-control"
          />
        </label>
        <label className="field-label">
          Vence hasta
          <input
            type="date"
            value={stockConsulta.vencimientoHasta}
            onChange={(e) =>
              setStockConsulta((actual) => ({
                ...actual,
                vencimientoHasta: e.target.value,
                pagina: 1,
              }))
            }
            className="field-control"
          />
        </label>
      </div>
      <EstadoListadoInventario
        cargando={listados.stock.isLoading}
        error={listados.stock.error}
        vacio={!saldos.length}
        mensajeVacio="No hay posiciones que coincidan con los filtros activos."
        alReintentar={() => void listados.stock.refetch()}
      >
        <div className={listados.stock.isFetching ? 'opacity-70' : undefined}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[66rem] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/45 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-5 py-3">Producto</th>
                  <th className="px-4 py-3">Almacén / ubicación</th>
                  <th className="px-4 py-3">Lote / vencimiento</th>
                  <th className="px-4 py-3">Condición</th>
                  <th className="px-4 py-3 text-end">Físico</th>
                  <th className="px-4 py-3 text-end">Reservado</th>
                  <th className="px-4 py-3 text-end">
                    Disponible para asignar
                  </th>
                  <th className="px-5 py-3 text-end">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {saldos.map((saldo) => (
                  <tr
                    key={`${saldo.productoId}-${saldo.almacenId}-${saldo.ubicacionId}-${saldo.estado}-${saldo.lote}-${saldo.fechaVencimiento}`}
                  >
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-primary">
                        {saldo.productoCodigo}
                      </span>
                      <p className="font-medium">{saldo.productoDescripcion}</p>
                    </td>
                    <td className="px-4 py-4">
                      {saldo.almacenNombre}
                      <p className="text-xs text-muted-foreground">
                        {saldo.ubicacionCodigo} · {saldo.ubicacionNombre}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {saldo.lote || 'Sin lote'}
                      <p className="text-xs text-muted-foreground">
                        {saldo.fechaVencimiento || 'Sin vencimiento'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="status-label"
                        data-tone={
                          saldo.estado === 'available' ? 'listo' : 'revision'
                        }
                      >
                        {etiquetasEstadoStock[saldo.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-end font-mono font-semibold">
                      {formatoCantidad.format(saldo.cantidad)}
                    </td>
                    <td className="px-4 py-4 text-end font-mono">
                      {formatoCantidad.format(saldo.cantidadReservada ?? 0)}
                    </td>
                    <td className="px-4 py-4 text-end font-mono">
                      {formatoCantidad.format(saldo.cantidadAsignable ?? 0)}
                    </td>
                    <td className="px-5 py-4 text-end font-mono">
                      {formatoMoneda.format(saldo.valorInventario)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </EstadoListadoInventario>
      {listados.stock.data ? (
        <PaginacionInventario
          etiqueta="stock detallado"
          pagina={stockConsulta.pagina}
          tamanioPagina={stockConsulta.tamanioPagina}
          total={listados.stock.data.total}
          totalPaginas={listados.stock.data.totalPaginas}
          cantidadVisible={saldos.length}
          cargando={listados.stock.isFetching}
          alCambiarPagina={(pagina) =>
            setStockConsulta((actual) => ({ ...actual, pagina }))
          }
          alCambiarTamanio={(tamanioPagina) =>
            setStockConsulta((actual) => ({
              ...actual,
              tamanioPagina,
              pagina: 1,
            }))
          }
        />
      ) : null}
    </section>
  )
}
