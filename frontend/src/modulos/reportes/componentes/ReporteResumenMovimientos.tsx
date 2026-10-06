import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { EstadoListadoInventario } from '@/modulos/inventario/componentes/EstadoListadoInventario'
import { etiquetasEstadoStock, type Almacen } from '@/modulos/inventario/modelo/almacen'
import {
  crearPeriodoUltimos30Dias,
  type ConsultaResumenMovimientos,
} from '@/modulos/reportes/modelo/reporteMovimientos'
import { useReporteMovimientos } from '@/modulos/reportes/estado/useReporteMovimientos'

interface Props {
  organizationId: string
  almacenes: Almacen[]
}

const formatoCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })

function useDebouncedValue<T>(value: T, delay = 300) {
  const [valor, setValor] = useState(value)

  useEffect(() => {
    const temporizador = setTimeout(() => setValor(value), delay)
    return () => clearTimeout(temporizador)
  }, [delay, value])

  return valor
}

export function ReporteResumenMovimientos({ organizationId, almacenes }: Props) {
  const periodoInicial = crearPeriodoUltimos30Dias()
  const [consulta, setConsulta] = useState<ConsultaResumenMovimientos>(() => ({
    pagina: 1,
    ...periodoInicial,
    busqueda: '',
    almacenId: '',
  }))
  const busqueda = useDebouncedValue(consulta.busqueda)
  const rangoInvalido = Boolean(consulta.fechaDesde && consulta.fechaHasta && consulta.fechaDesde > consulta.fechaHasta)
  const periodoCompleto = Boolean(consulta.fechaDesde && consulta.fechaHasta)
  const reporte = useReporteMovimientos(
    organizationId,
    { ...consulta, busqueda },
    periodoCompleto && !rangoInvalido,
  )
  const elementos = reporte.data?.elementos ?? []
  const cambiarFiltro = (cambios: Partial<ConsultaResumenMovimientos>) => {
    setConsulta((actual) => ({ ...actual, ...cambios, pagina: 1 }))
  }

  return (
    <section aria-labelledby="reporte-movimientos-titulo" className="ledger-sheet">
      <div className="grid gap-4 border-b px-5 py-5 sm:px-6 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_12rem_12rem_14rem] xl:items-end">
        <div>
          <h2 id="reporte-movimientos-titulo" className="text-lg font-semibold">
            Resumen de movimientos de inventario
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {reporte.data
              ? `${reporte.data.total} grupos · ${reporte.data.totalMovimientos} movimientos`
              : 'Agrupa el Kardex por producto, almacén y condición.'}
          </p>
        </div>
        <label className="field-label">
          Buscar
          <input
            type="search"
            value={consulta.busqueda}
            onChange={(evento) => cambiarFiltro({ busqueda: evento.target.value })}
            className="field-control"
            placeholder="Producto o almacén"
          />
        </label>
        <label className="field-label">
          Desde
          <input
            type="date"
            value={consulta.fechaDesde}
            onChange={(evento) => cambiarFiltro({ fechaDesde: evento.target.value })}
            className="field-control"
          />
        </label>
        <label className="field-label">
          Hasta
          <input
            type="date"
            value={consulta.fechaHasta}
            onChange={(evento) => cambiarFiltro({ fechaHasta: evento.target.value })}
            className="field-control"
          />
        </label>
        <label className="field-label md:col-span-2 xl:col-span-1">
          Almacén
          <select
            value={consulta.almacenId}
            onChange={(evento) => cambiarFiltro({ almacenId: evento.target.value })}
            className="field-control"
          >
            <option value="">Todos</option>
            {almacenes.map((almacen) => (
              <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="border-b px-5 py-3 text-sm leading-6 text-muted-foreground sm:px-6">
        Las cantidades se separan por producto, unidad, almacén y condición. La variación del periodo no representa el stock actual.
      </p>

      {rangoInvalido ? (
        <p role="alert" className="px-5 py-8 text-sm text-destructive sm:px-6">
          La fecha inicial no puede ser posterior a la fecha final.
        </p>
      ) : !periodoCompleto ? (
        <p role="status" className="px-5 py-8 text-sm text-muted-foreground sm:px-6">
          Selecciona ambas fechas para consultar el periodo.
        </p>
      ) : (
        <EstadoListadoInventario
          cargando={reporte.isLoading}
          error={reporte.error}
          vacio={!elementos.length}
          mensajeVacio="No hay movimientos para el periodo y los filtros seleccionados."
          alReintentar={() => void reporte.refetch()}
        >
          <div className={reporte.isFetching ? 'opacity-70' : undefined}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-left text-sm">
                <caption className="sr-only">
                  Entradas, salidas y variación por producto, almacén y condición durante el periodo elegido
                </caption>
                <thead>
                  <tr className="border-b bg-muted/45 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted-foreground">
                    <th scope="col" className="px-5 py-3">Producto</th>
                    <th scope="col" className="px-4 py-3">Almacén</th>
                    <th scope="col" className="px-4 py-3">Condición</th>
                    <th scope="col" className="px-4 py-3 text-end">Entradas</th>
                    <th scope="col" className="px-4 py-3 text-end">Salidas</th>
                    <th scope="col" className="px-4 py-3 text-end">Variación</th>
                    <th scope="col" className="px-5 py-3 text-end">Movimientos</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {elementos.map((fila, indice) => (
                    <tr key={`${fila.productoId}-${fila.almacenId ?? fila.almacen}-${fila.estado}-${fila.unidadMedida}-${indice}`}>
                      <th scope="row" className="px-5 py-4 font-normal">
                        <span className="font-mono text-xs text-primary">{fila.productoCodigo}</span>
                        <p className="font-medium text-foreground">{fila.productoDescripcion}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Unidad: {fila.unidadMedida || 'No especificada'}</p>
                      </th>
                      <td className="px-4 py-4">{fila.almacen || 'Sin nombre de almacén'}</td>
                      <td className="px-4 py-4">
                        <span className="status-label" data-tone={fila.estado === 'available' ? 'listo' : 'revision'}>
                          {etiquetasEstadoStock[fila.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-end font-mono tabular-nums">
                        {formatoCantidad.format(fila.entradas)}
                      </td>
                      <td className="px-4 py-4 text-end font-mono tabular-nums">
                        {formatoCantidad.format(fila.salidas)}
                      </td>
                      <td className={`px-4 py-4 text-end font-mono font-semibold tabular-nums ${fila.variacionNeta < 0 ? 'text-amber-800' : 'text-primary'}`}>
                        {fila.variacionNeta > 0 ? '+' : ''}{formatoCantidad.format(fila.variacionNeta)}
                      </td>
                      <td className="px-5 py-4 text-end font-mono tabular-nums">
                        {formatoCantidad.format(fila.cantidadMovimientos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reporte.data ? (
              <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm text-muted-foreground">
                  Mostrando {elementos.length ? (consulta.pagina - 1) * reporte.data.tamanioPagina + 1 : 0}–{(consulta.pagina - 1) * reporte.data.tamanioPagina + elementos.length} de {reporte.data.total} grupos
                  {reporte.isFetching ? <span role="status"> · Actualizando…</span> : null}
                </p>
                <nav aria-label="Paginación del resumen de movimientos" className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Página anterior del resumen"
                    disabled={reporte.isFetching || consulta.pagina <= 1}
                    onClick={() => setConsulta((actual) => ({ ...actual, pagina: actual.pagina - 1 }))}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <span className="min-w-24 text-center font-mono text-xs tabular-nums text-muted-foreground">
                    PÁGINA {consulta.pagina} / {reporte.data.totalPaginas}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Página siguiente del resumen"
                    disabled={reporte.isFetching || consulta.pagina >= reporte.data.totalPaginas}
                    onClick={() => setConsulta((actual) => ({ ...actual, pagina: actual.pagina + 1 }))}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </nav>
              </div>
            ) : null}
          </div>
        </EstadoListadoInventario>
      )}
    </section>
  )
}
