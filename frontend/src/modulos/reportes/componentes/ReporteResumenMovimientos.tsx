import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { EstadoListadoInventario } from '@/modulos/inventario/componentes/EstadoListadoInventario'
import { etiquetasEstadoStock, type Almacen } from '@/modulos/inventario/modelo/almacen'
import {
  crearPeriodoUltimos30Dias,
  type ConsultaResumenMovimientos,
  type ResumenMovimientoInventario,
} from '@/modulos/reportes/modelo/reporteMovimientos'
import { useReporteMovimientos } from '@/modulos/reportes/estado/useReporteMovimientos'

interface Props {
  organizationId: string
  almacenes: Almacen[]
  usarFiltrosCompartidos?: boolean
  fechaDesde?: string
  fechaHasta?: string
  almacenId?: string
  pagina?: number
  habilitado?: boolean
  alCambiarPagina?: (pagina: number) => void
  alVerKardex?: (fila: ResumenMovimientoInventario) => void
  productoKardexCargandoId?: string | null
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

export function ReporteResumenMovimientos({
  organizationId,
  almacenes,
  usarFiltrosCompartidos = false,
  fechaDesde: fechaDesdeCompartida,
  fechaHasta: fechaHastaCompartida,
  almacenId: almacenIdCompartido,
  pagina: paginaCompartida,
  habilitado = true,
  alCambiarPagina,
  alVerKardex,
  productoKardexCargandoId,
}: Props) {
  const periodoInicial = crearPeriodoUltimos30Dias()
  const [consulta, setConsulta] = useState<ConsultaResumenMovimientos>(() => ({
    pagina: 1,
    ...periodoInicial,
    busqueda: '',
    almacenId: '',
  }))
  const busqueda = useDebouncedValue(consulta.busqueda)
  const filtros: ConsultaResumenMovimientos = {
    ...consulta,
    pagina: paginaCompartida ?? consulta.pagina,
    fechaDesde: fechaDesdeCompartida ?? consulta.fechaDesde,
    fechaHasta: fechaHastaCompartida ?? consulta.fechaHasta,
    almacenId: almacenIdCompartido ?? consulta.almacenId,
  }
  const rangoInvalido = Boolean(filtros.fechaDesde && filtros.fechaHasta && filtros.fechaDesde > filtros.fechaHasta)
  const periodoCompleto = Boolean(filtros.fechaDesde && filtros.fechaHasta)
  const reporte = useReporteMovimientos(
    organizationId,
    { ...filtros, busqueda },
    habilitado && periodoCompleto && !rangoInvalido,
  )
  const elementos = reporte.data?.elementos ?? []
  const cambiarFiltro = (cambios: Partial<ConsultaResumenMovimientos>) => {
    setConsulta((actual) => ({ ...actual, ...cambios, pagina: 1 }))
    alCambiarPagina?.(1)
  }
  const cambiarPagina = (pagina: number) => {
    if (alCambiarPagina) alCambiarPagina(pagina)
    else setConsulta((actual) => ({ ...actual, pagina }))
  }

  return (
    <section aria-labelledby="reporte-movimientos-titulo" className="ledger-sheet">
      <div className="grid gap-4 border-b px-5 py-5 sm:px-6 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_minmax(15rem,20rem)] xl:items-end">
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
        {!usarFiltrosCompartidos ? <>
          <label className="field-label">
            Desde
            <input type="date" value={consulta.fechaDesde} onChange={(evento) => cambiarFiltro({ fechaDesde: evento.target.value })} className="field-control" />
          </label>
          <label className="field-label">
            Hasta
            <input type="date" value={consulta.fechaHasta} onChange={(evento) => cambiarFiltro({ fechaHasta: evento.target.value })} className="field-control" />
          </label>
          <label className="field-label md:col-span-2 xl:col-span-1">
            Almacén
            <select value={consulta.almacenId} onChange={(evento) => cambiarFiltro({ almacenId: evento.target.value })} className="field-control">
              <option value="">Todos</option>
              {almacenes.map((almacen) => <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>)}
            </select>
          </label>
        </> : null}
      </div>

      <p className="border-b px-5 py-3 text-sm leading-6 text-muted-foreground sm:px-6">
        Entradas incluyen recepciones y ajustes positivos; salidas, despachos y ajustes negativos. Las cantidades se separan por producto, unidad, almacén y condición. La variación del periodo no representa el stock actual.
      </p>

      {usarFiltrosCompartidos && !habilitado ? null : rangoInvalido ? (
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
          <div aria-busy={reporte.isFetching} className={reporte.isFetching ? 'opacity-70' : undefined}>
            {reporte.isFetching ? <p role="status" className="sr-only">Actualizando resumen de movimientos.</p> : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[54rem] text-left text-sm xl:table-fixed">
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                </colgroup>
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
                        <p className="break-words font-medium text-foreground">{fila.productoDescripcion}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Unidad: {fila.unidadMedida || 'No especificada'}</p>
                        {alVerKardex ? <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 px-2" disabled={productoKardexCargandoId === fila.productoId} onClick={() => alVerKardex(fila)}>
                          {productoKardexCargandoId === fila.productoId ? 'Abriendo Kardex…' : 'Ver Kardex'}
                        </Button> : null}
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
                  Mostrando {elementos.length ? (filtros.pagina - 1) * reporte.data.tamanioPagina + 1 : 0}–{(filtros.pagina - 1) * reporte.data.tamanioPagina + elementos.length} de {reporte.data.total} grupos
                  {reporte.isFetching ? <span role="status"> · Actualizando…</span> : null}
                </p>
                <nav aria-label="Paginación del resumen de movimientos" className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Página anterior del resumen"
                    disabled={reporte.isFetching || filtros.pagina <= 1}
                    onClick={() => cambiarPagina(filtros.pagina - 1)}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <span className="min-w-24 text-center font-mono text-xs tabular-nums text-muted-foreground">
                    PÁGINA {filtros.pagina} / {reporte.data.totalPaginas}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Página siguiente del resumen"
                    disabled={reporte.isFetching || filtros.pagina >= reporte.data.totalPaginas}
                    onClick={() => cambiarPagina(filtros.pagina + 1)}
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
