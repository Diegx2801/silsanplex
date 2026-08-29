import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type {
  FiltroEstadoProducto,
  OrdenProductos,
} from '@/modulos/productos/modelo/consultaProductos'

interface FiltrosProductosProps {
  busqueda: string
  estado: FiltroEstadoProducto
  orden: OrdenProductos
  cantidadActivos: number
  alCambiarBusqueda: (valor: string) => void
  alCambiarEstado: (valor: FiltroEstadoProducto) => void
  alCambiarOrden: (valor: OrdenProductos) => void
  alLimpiar: () => void
}

export function FiltrosProductos({
  busqueda,
  estado,
  orden,
  cantidadActivos,
  alCambiarBusqueda,
  alCambiarEstado,
  alCambiarOrden,
  alLimpiar,
}: FiltrosProductosProps) {
  return (
    <section aria-labelledby="filtros-productos-titulo" className="ledger-sheet">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal aria-hidden="true" className="size-4 text-primary" />
          <h2
            id="filtros-productos-titulo"
            className="font-mono text-xs font-medium tracking-[0.06em] uppercase"
          >
            Control del catálogo
          </h2>
          {cantidadActivos > 0 ? (
            <span className="status-label" data-tone="listo">
              {cantidadActivos} {cantidadActivos === 1 ? 'filtro' : 'filtros'}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={cantidadActivos === 0}
          onClick={alLimpiar}
        >
          <RotateCcw aria-hidden="true" />
          Limpiar filtros
        </Button>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:px-6 md:grid-cols-[minmax(16rem,1.5fr)_minmax(10rem,0.7fr)_minmax(12rem,0.8fr)]">
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
              onChange={(evento) => alCambiarBusqueda(evento.target.value)}
              className="field-control ps-9"
            placeholder="Buscar por SKU, nombre o código de barras"
            />
          </div>
        </div>

        <div>
          <label htmlFor="filtro-estado" className="field-label">
            Estado
          </label>
          <select
            id="filtro-estado"
            value={estado}
            onChange={(evento) =>
              alCambiarEstado(evento.target.value as FiltroEstadoProducto)
            }
            className="field-control"
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>

        <div>
          <label htmlFor="orden-productos" className="field-label">
            Ordenar por
          </label>
          <select
            id="orden-productos"
            value={orden}
            onChange={(evento) =>
              alCambiarOrden(evento.target.value as OrdenProductos)
            }
            className="field-control"
          >
            <option value="codigo-asc">SKU: menor a mayor</option>
            <option value="codigo-desc">SKU: mayor a menor</option>
            <option value="descripcion-asc">Nombre: A a Z</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
          </select>
        </div>
      </div>
    </section>
  )
}
