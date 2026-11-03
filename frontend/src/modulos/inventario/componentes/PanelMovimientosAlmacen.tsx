import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CantidadMovimiento } from './CantidadMovimiento'
import { ImporteMovimiento } from './ImporteMovimiento'
import { FormularioTransferencia } from './FormularioTransferencia'
import { EstadoListadoInventario } from './EstadoListadoInventario'
import { PaginacionInventario } from './PaginacionInventario'
import { useDebounceInventario } from '../estado/useDebounceInventario'
import { useListadosAlmacen } from '../estado/useListadosAlmacen'
import type { TamanioPaginaInventario } from '../modelo/paginacionInventario'

import {
  type Almacen,
  type UbicacionAlmacen,
  type DatosTransferencia,
  type ConsultaTransferencias,
} from '../modelo/almacen'

interface Props {
  organizationId: string
  almacenes: Almacen[]
  ubicaciones: UbicacionAlmacen[]
  puedeGestionar: boolean
  transferir: (datos: DatosTransferencia, operationKey?: string) => Promise<string | undefined>
  vista: 'kardex' | 'transferencias'
}
const formatoCantidad = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 3,
})
const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})
const consultaTransferenciasInicial: ConsultaTransferencias = {
  pagina: 1,
  tamanioPagina: 25,
  busqueda: '',
  almacenId: '',
  fechaDesde: '',
  fechaHasta: '',
  orden: 'fecha-desc',
}

export function PanelMovimientosAlmacen(props: Props) {
  const { almacenes, vista } = props
  const [kardexConsulta, setKardexConsulta] = useState({
    pagina: 1,
    tamanioPagina: 25 as TamanioPaginaInventario,
    busqueda: '',
    almacenId: '',
    fechaDesde: '',
    fechaHasta: '',
    orden: 'fecha-desc' as const,
  })
  const [transferenciasConsulta, setTransferenciasConsulta] = useState(
    consultaTransferenciasInicial,
  )
  const filtrosTransferenciaActivos = Object.entries(
    consultaTransferenciasInicial,
  ).some(
    ([clave, valor]) =>
      transferenciasConsulta[clave as keyof ConsultaTransferencias] !== valor,
  )

  const kardexBusqueda = useDebounceInventario(kardexConsulta.busqueda)
  const transferenciasBusqueda = useDebounceInventario(
    transferenciasConsulta.busqueda,
  )
  const listados = useListadosAlmacen(
    vista === 'kardex'
      ? { kardex: { ...kardexConsulta, busqueda: kardexBusqueda } }
      : {
          transferencias: {
            ...transferenciasConsulta,
            busqueda: transferenciasConsulta.busqueda
              ? transferenciasBusqueda
              : '',
          },
        },
  )
  const kardex = listados.kardex.data?.elementos ?? []
  const transferencias = listados.transferencias.data?.elementos ?? []
  const nombreAlmacen = (id: string) =>
    almacenes.find((item) => item.id === id)?.nombre ?? 'Almacén'
  const nombreUbicacion = (id?: string) => id
    ? props.ubicaciones.find((u) => u.id === id)?.nombre ?? 'Ubicación no disponible'
    : 'Varias ubicaciones'
  return (
    <div className="space-y-6">
      {vista === 'kardex' ? (
        <section aria-labelledby="kardex-title" className="ledger-sheet">
          <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_14rem_12rem_12rem] xl:items-end">
            <div>
              <h2 id="kardex-title" className="text-lg font-semibold">
                Kardex valorizado
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {listados.kardex.data?.total ?? 0} movimientos · orden
                determinista por fecha y secuencia.
              </p>
            </div>
            <label className="field-label">
              Buscar
              <input
                type="search"
                value={kardexConsulta.busqueda}
                onChange={(e) =>
                  setKardexConsulta((actual) => ({
                    ...actual,
                    busqueda: e.target.value,
                    pagina: 1,
                  }))
                }
                className="field-control"
                placeholder="Producto, lote o referencia"
              />
            </label>
            <label className="field-label">
              Almacén
              <select
                value={kardexConsulta.almacenId}
                onChange={(e) =>
                  setKardexConsulta((actual) => ({
                    ...actual,
                    almacenId: e.target.value,
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
              Orden
              <select
                value={kardexConsulta.orden}
                onChange={(e) =>
                  setKardexConsulta((actual) => ({
                    ...actual,
                    orden: e.target.value as typeof actual.orden,
                    pagina: 1,
                  }))
                }
                className="field-control"
              >
                <option value="fecha-desc">Más reciente</option>
                <option value="fecha-asc">Más antiguo</option>
              </select>
            </label>
          </div>
          <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6 sm:grid-cols-2">
            <label className="field-label">
              Fecha desde
              <input
                type="date"
                value={kardexConsulta.fechaDesde}
                onChange={(e) =>
                  setKardexConsulta((actual) => ({
                    ...actual,
                    fechaDesde: e.target.value,
                    pagina: 1,
                  }))
                }
                className="field-control"
              />
            </label>
            <label className="field-label">
              Fecha hasta
              <input
                type="date"
                value={kardexConsulta.fechaHasta}
                onChange={(e) =>
                  setKardexConsulta((actual) => ({
                    ...actual,
                    fechaHasta: e.target.value,
                    pagina: 1,
                  }))
                }
                className="field-control"
              />
            </label>
          </div>
          <EstadoListadoInventario
            cargando={listados.kardex.isLoading}
            error={listados.kardex.error}
            vacio={!kardex.length}
            mensajeVacio="No hay movimientos de Kardex para los filtros activos."
            alReintentar={() => void listados.kardex.refetch()}
          >
            <ul aria-label="Movimientos del Kardex" className="divide-y xl:hidden">
              {kardex.map((movimiento) => (
                <li key={movimiento.id}>
                  <article className="space-y-4 px-4 py-5 sm:px-6">
                    <header className="min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-xs text-primary">
                          MOV-{String(movimiento.secuenciaLedger).padStart(6, '0')}
                        </p>
                        <time dateTime={movimiento.fechaOperacion} className="font-mono text-xs text-muted-foreground">
                          {movimiento.fechaOperacion}
                        </time>
                      </div>
                      <h3 className="mt-2 break-words font-semibold">{movimiento.productoDescripcion}</h3>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{movimiento.productoCodigo}</p>
                    </header>

                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Entrada</dt>
                        <dd className="mt-1">
                          {movimiento.cantidadEntrada
                            ? <CantidadMovimiento {...movimiento} cantidad={movimiento.cantidadEntrada} />
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Salida</dt>
                        <dd className="mt-1">
                          {movimiento.cantidadSalida
                            ? <CantidadMovimiento {...movimiento} cantidad={movimiento.cantidadSalida} />
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Saldo</dt>
                        <dd className="mt-1 font-mono font-semibold tabular-nums">
                          {formatoCantidad.format(movimiento.saldoCantidad)}
                          {movimiento.unidadMedida ? <span className="ms-1 font-sans text-xs font-normal text-muted-foreground">{movimiento.unidadMedida}</span> : null}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">Almacén · lote</dt>
                        <dd className="mt-1 break-words">{movimiento.almacen} · {movimiento.lote || 'Sin lote'}</dd>
                      </div>
                    </dl>

                    <details open className="border-t pt-3">
                      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        Detalle y trazabilidad
                      </summary>
                      <dl className="grid gap-3 pt-2 text-sm sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">Número de movimiento</dt>
                          <dd className="mt-1 font-mono">MOV-{String(movimiento.secuenciaLedger).padStart(6, '0')}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">Documento externo</dt>
                          <dd className="mt-1 break-words">{movimiento.documentoReferencia || 'Sin documento externo'}</dd>
                        </div>
                        <div className="min-w-0 sm:col-span-2">
                          <dt className="text-xs text-muted-foreground">Motivo</dt>
                          <dd className="mt-1 break-words">{movimiento.motivo}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Importe · costo unitario</dt>
                          <dd className="mt-1"><ImporteMovimiento {...movimiento} /></dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Valor del saldo</dt>
                          <dd className="mt-1 font-mono">{formatoMoneda.format(movimiento.saldoValor)}</dd>
                        </div>
                      </dl>
                    </details>
                  </article>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto xl:block">
              <table aria-label="Kardex valorizado" className="w-full min-w-[72rem] text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/45 font-mono text-[0.68rem] uppercase text-muted-foreground">
                    <th className="px-5 py-3">Fecha</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Documento y motivo</th>
                    <th className="px-4 py-3 text-end">Entrada</th>
                    <th className="px-4 py-3 text-end">Salida</th>
                    <th className="px-4 py-3 text-end">Importe</th>
                    <th className="px-4 py-3 text-end">Saldo</th>
                    <th className="px-5 py-3 text-end">Valor saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {kardex.map((movimiento) => (
                    <tr key={movimiento.id}>
                      <td className="px-5 py-4 font-mono text-xs">
                        {movimiento.fechaOperacion}
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs">
                          {movimiento.productoCodigo}
                        </span>
                        <p>{movimiento.productoDescripcion}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-mono text-xs">N.º movimiento: MOV-{String(movimiento.secuenciaLedger).padStart(6, '0')}</p>
                        {movimiento.documentoReferencia ? (
                          <p className="mt-1 text-xs">Documento externo: {movimiento.documentoReferencia}</p>
                        ) : null}
                        {movimiento.motivo}
                        <p className="text-xs text-muted-foreground">
                          {movimiento.almacen} · {movimiento.lote || 'Sin lote'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-end font-mono">
                        {movimiento.cantidadEntrada ? <CantidadMovimiento {...movimiento} cantidad={movimiento.cantidadEntrada} /> : '—'}
                      </td>
                      <td className="px-4 py-4 text-end font-mono">
                        {movimiento.cantidadSalida ? <CantidadMovimiento {...movimiento} cantidad={movimiento.cantidadSalida} /> : '—'}
                      </td>
                      <td className="px-4 py-4 text-end font-mono">
                        <ImporteMovimiento {...movimiento} />
                      </td>
                      <td className="px-4 py-4 text-end font-mono font-semibold">
                        {formatoCantidad.format(movimiento.saldoCantidad)}
                        {movimiento.unidadMedida ? <span className="ms-1 font-sans text-xs font-normal text-muted-foreground">{movimiento.unidadMedida}</span> : null}
                      </td>
                      <td className="px-5 py-4 text-end font-mono">
                        {formatoMoneda.format(movimiento.saldoValor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </EstadoListadoInventario>
          {listados.kardex.data ? (
            <PaginacionInventario
              etiqueta="Kardex"
              pagina={kardexConsulta.pagina}
              tamanioPagina={kardexConsulta.tamanioPagina}
              total={listados.kardex.data.total}
              totalPaginas={listados.kardex.data.totalPaginas}
              cantidadVisible={kardex.length}
              cargando={listados.kardex.isFetching}
              alCambiarPagina={(pagina) =>
                setKardexConsulta((actual) => ({ ...actual, pagina }))
              }
              alCambiarTamanio={(tamanioPagina) =>
                setKardexConsulta((actual) => ({
                  ...actual,
                  tamanioPagina,
                  pagina: 1,
                }))
              }
            />
          ) : null}
        </section>
      ) : (
        <>
          {props.puedeGestionar ? <FormularioTransferencia {...props} /> : null}
          <section
            aria-labelledby="transferencias-title"
            className="ledger-sheet"
          >
            <div className="border-b px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    id="transferencias-title"
                    className="text-lg font-semibold"
                  >
                    Historial de transferencias
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {listados.transferencias.data?.total ?? 0} transferencias
                    persistentes.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!filtrosTransferenciaActivos}
                  onClick={() =>
                    setTransferenciasConsulta(consultaTransferenciasInicial)
                  }
                >
                  <RotateCcw aria-hidden="true" /> Limpiar filtros
                </Button>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem] lg:items-end">
                <label className="field-label">
                  Buscar
                  <input
                    type="search"
                    value={transferenciasConsulta.busqueda}
                    onChange={(e) =>
                      setTransferenciasConsulta((actual) => ({
                        ...actual,
                        busqueda: e.target.value,
                        pagina: 1,
                      }))
                    }
                    className="field-control"
                    placeholder="Referencia o nota"
                  />
                </label>
                <label className="field-label">
                  Almacén
                  <select
                    value={transferenciasConsulta.almacenId}
                    onChange={(e) =>
                      setTransferenciasConsulta((actual) => ({
                        ...actual,
                        almacenId: e.target.value,
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
                  Orden
                  <select
                    value={transferenciasConsulta.orden}
                    onChange={(e) =>
                      setTransferenciasConsulta((actual) => ({
                        ...actual,
                        orden: e.target.value as typeof actual.orden,
                        pagina: 1,
                      }))
                    }
                    className="field-control"
                  >
                    <option value="fecha-desc">Más reciente</option>
                    <option value="fecha-asc">Más antigua</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6 sm:grid-cols-2">
              <label className="field-label">
                Fecha desde
                <input
                  type="date"
                  value={transferenciasConsulta.fechaDesde}
                  onChange={(e) =>
                    setTransferenciasConsulta((actual) => ({
                      ...actual,
                      fechaDesde: e.target.value,
                      pagina: 1,
                    }))
                  }
                  className="field-control"
                />
              </label>
              <label className="field-label">
                Fecha hasta
                <input
                  type="date"
                  value={transferenciasConsulta.fechaHasta}
                  onChange={(e) =>
                    setTransferenciasConsulta((actual) => ({
                      ...actual,
                      fechaHasta: e.target.value,
                      pagina: 1,
                    }))
                  }
                  className="field-control"
                />
              </label>
            </div>
            <EstadoListadoInventario
              cargando={listados.transferencias.isLoading}
              error={listados.transferencias.error}
              vacio={!transferencias.length}
              mensajeVacio="No hay transferencias para los filtros activos."
              alReintentar={() => void listados.transferencias.refetch()}
            >
              <div className="divide-y">
                {transferencias.map((transferencia) => (
                  <article
                    key={transferencia.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div>
                      <p className="font-mono text-sm font-semibold">
                        {transferencia.referencia}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {nombreAlmacen(transferencia.almacenOrigenId)} →{' '}
                        {nombreAlmacen(transferencia.almacenDestinoId)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {nombreUbicacion(transferencia.ubicacionOrigenId)} →{' '}
                        {nombreUbicacion(transferencia.ubicacionDestinoId)}
                      </p>
                    </div>
                    <time className="text-xs text-muted-foreground">
                      {new Date(
                        transferencia.fechaTransferencia,
                      ).toLocaleString('es-PE')}
                    </time>
                  </article>
                ))}
              </div>
            </EstadoListadoInventario>
            {listados.transferencias.data ? (
              <PaginacionInventario
                etiqueta="transferencias"
                pagina={transferenciasConsulta.pagina}
                tamanioPagina={transferenciasConsulta.tamanioPagina}
                total={listados.transferencias.data.total}
                totalPaginas={listados.transferencias.data.totalPaginas}
                cantidadVisible={transferencias.length}
                cargando={listados.transferencias.isFetching}
                alCambiarPagina={(pagina) =>
                  setTransferenciasConsulta((actual) => ({ ...actual, pagina }))
                }
                alCambiarTamanio={(tamanioPagina) =>
                  setTransferenciasConsulta((actual) => ({
                    ...actual,
                    tamanioPagina,
                    pagina: 1,
                  }))
                }
              />
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}
