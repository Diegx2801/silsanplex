import { ArrowLeftRight } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SelectorProductoInventario } from './SelectorProductoInventario'
import {
  useResultadoOperacionAlmacen,
  valorFormulario as valor,
} from '../estado/useResultadoOperacionAlmacen'
import { MensajeOperacionAlmacen } from './MensajeOperacionAlmacen'
import { EstadoListadoInventario } from './EstadoListadoInventario'
import { PaginacionInventario } from './PaginacionInventario'
import { useDebounceInventario } from '../estado/useDebounceInventario'
import { useListadosAlmacen } from '../estado/useListadosAlmacen'
import type { TamanioPaginaInventario } from '../modelo/paginacionInventario'

import {
  esquemaTransferencia,
  type Almacen,
  type UbicacionAlmacen,
  type DatosTransferencia,
} from '../modelo/almacen'

interface Props {
  organizationId: string
  almacenes: Almacen[]
  ubicaciones: UbicacionAlmacen[]
  puedeGestionar: boolean
  transferir: (datos: DatosTransferencia) => Promise<string | undefined>
  vista: 'kardex' | 'transferencias'
}
const formatoCantidad = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 3,
})
const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

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
  const [transferenciasConsulta, setTransferenciasConsulta] = useState({
    pagina: 1,
    tamanioPagina: 25 as TamanioPaginaInventario,
    busqueda: '',
    almacenId: '',
    fechaDesde: '',
    fechaHasta: '',
    orden: 'fecha-desc' as const,
  })

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
            busqueda: transferenciasBusqueda,
          },
        },
  )
  const kardex = listados.kardex.data?.elementos ?? []
  const transferencias = listados.transferencias.data?.elementos ?? []
  const nombreAlmacen = (id: string) =>
    almacenes.find((item) => item.id === id)?.nombre ?? 'Almacén'
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
                placeholder="Producto o código"
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[72rem] text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/45 font-mono text-[0.68rem] uppercase text-muted-foreground">
                    <th className="px-5 py-3">Fecha</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Documento y motivo</th>
                    <th className="px-4 py-3 text-end">Entrada</th>
                    <th className="px-4 py-3 text-end">Salida</th>
                    <th className="px-4 py-3 text-end">Costo</th>
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
                        <p className="font-mono text-xs">{movimiento.documentoReferencia || 'Sin referencia registrada'}</p>
                        {movimiento.motivo}
                        <p className="text-xs text-muted-foreground">
                          {movimiento.almacen} · {movimiento.lote || 'Sin lote'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-end font-mono">
                        {movimiento.cantidadEntrada || '—'}
                      </td>
                      <td className="px-4 py-4 text-end font-mono">
                        {movimiento.cantidadSalida || '—'}
                      </td>
                      <td className="px-4 py-4 text-end font-mono">
                        {formatoMoneda.format(movimiento.costoUnitario)}
                      </td>
                      <td className="px-4 py-4 text-end font-mono font-semibold">
                        {formatoCantidad.format(movimiento.saldoCantidad)}
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
            <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_14rem_12rem_12rem] xl:items-end">
              <div>
                <h2 id="transferencias-title" className="text-lg font-semibold">
                  Historial de transferencias
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {listados.transferencias.data?.total ?? 0} transferencias
                  persistentes.
                </p>
              </div>
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

function FormularioTransferencia(props: Omit<Props, 'vista'>) {
  const { organizationId, almacenes } = props
  const almacenesActivos = useMemo(
    () => almacenes.filter((almacen) => almacen.activo),
    [almacenes],
  )
  const [origenId, setOrigenId] = useState(almacenesActivos[0]?.id ?? '')
  const [destinoId, setDestinoId] = useState(almacenesActivos[1]?.id ?? '')
  const { mensaje, guardando, resolver } = useResultadoOperacionAlmacen()
  const ubicacionesOrigen = useMemo(
    () =>
      props.ubicaciones.filter(
        (item) => item.almacenId === origenId && item.activa,
      ),
    [origenId, props.ubicaciones],
  )
  const ubicacionesDestino = useMemo(
    () =>
      props.ubicaciones.filter(
        (item) => item.almacenId === destinoId && item.activa,
      ),
    [destinoId, props.ubicaciones],
  )

  useEffect(() => {
    if (!almacenesActivos.some((almacen) => almacen.id === origenId))
      setOrigenId(almacenesActivos[0]?.id ?? '')
    if (
      !almacenesActivos.some((almacen) => almacen.id === destinoId) ||
      destinoId === origenId
    ) {
      setDestinoId(
        almacenesActivos.find(
          (almacen) => almacen.id !== (origenId || almacenesActivos[0]?.id),
        )?.id ?? '',
      )
    }
  }, [almacenesActivos, destinoId, origenId])

  const guardarTransferencia = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    const entrada = {
      referencia: valor(datos, 'referencia'),
      almacenOrigenId: origenId,
      ubicacionOrigenId: valor(datos, 'ubicacionOrigenId'),
      almacenDestinoId: destinoId,
      ubicacionDestinoId: valor(datos, 'ubicacionDestinoId'),
      productoId: valor(datos, 'productoId'),
      cantidad: valor(datos, 'cantidad'),
      lote: valor(datos, 'lote'),
      fechaVencimiento: valor(datos, 'fechaVencimiento'),
      estado: valor(datos, 'estado'),
      notas: valor(datos, 'notas'),
    }
    void resolver(
      esquemaTransferencia.safeParse(entrada),
      props.transferir,
      'Transferencia completada y trazada en el kardex.',
    )
  }

  return (
    <div className="space-y-3">
      <MensajeOperacionAlmacen texto={mensaje} />
      <form className="ledger-sheet p-5 sm:p-6" onSubmit={guardarTransferencia}>
        <h3 className="flex items-center gap-2 font-semibold">
          <ArrowLeftRight className="size-5 text-primary" />
          Transferencia entre almacenes
        </h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="transferencia-referencia">
              Referencia
            </label>
            <input
              id="transferencia-referencia"
              name="referencia"
              required
              className="field-control"
              placeholder="TR-0001"
            />
          </div>
          <SelectorProductoInventario
            id="transferencia-producto"
            name="productoId"
            etiqueta="Producto"
            organizationId={organizationId}
          />
          <div>
            <label className="field-label" htmlFor="almacen-origen">
              Almacén origen
            </label>
            <select
              id="almacen-origen"
              className="field-control"
              value={origenId}
              onChange={(e) => setOrigenId(e.target.value)}
            >
              {almacenes
                .filter((a) => a.activo)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="ubicacion-origen">
              Ubicación origen
            </label>
            <select
              id="ubicacion-origen"
              name="ubicacionOrigenId"
              className="field-control"
            >
              {ubicacionesOrigen.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} · {u.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="almacen-destino">
              Almacén destino
            </label>
            <select
              id="almacen-destino"
              className="field-control"
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
            >
              {almacenes
                .filter((a) => a.activo)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="ubicacion-destino">
              Ubicación destino
            </label>
            <select
              id="ubicacion-destino"
              name="ubicacionDestinoId"
              className="field-control"
            >
              {ubicacionesDestino.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} · {u.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="transferencia-cantidad">
              Cantidad
            </label>
            <input
              id="transferencia-cantidad"
              name="cantidad"
              required
              inputMode="decimal"
              className="field-control"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="transferencia-lote">
              Lote
            </label>
            <input
              id="transferencia-lote"
              name="lote"
              className="field-control"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="transferencia-vencimiento">
              Vencimiento
            </label>
            <input
              id="transferencia-vencimiento"
              name="fechaVencimiento"
              type="date"
              className="field-control"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="transferencia-estado">
              Condición
            </label>
            <select
              id="transferencia-estado"
              name="estado"
              className="field-control"
            >
              <option value="available">Disponible</option>
              <option value="quarantine">Cuarentena</option>
              <option value="damaged">Dañado</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="transferencia-notas">
              Notas
            </label>
            <input
              id="transferencia-notas"
              name="notas"
              className="field-control"
            />
          </div>
        </div>
        <Button
          className="mt-5"
          type="submit"
          disabled={
            guardando ||
            almacenesActivos.length < 2 ||
            !ubicacionesOrigen.length ||
            !ubicacionesDestino.length
          }
        >
          Confirmar transferencia
        </Button>
        {almacenesActivos.length < 2 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Crea un segundo almacén y su ubicación para habilitar
            transferencias.
          </p>
        ) : null}
      </form>
    </div>
  )
}
