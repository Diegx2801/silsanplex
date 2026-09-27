import { AlertTriangle, Boxes, ShieldAlert } from 'lucide-react'
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
  esquemaReclasificacion,
  type Almacen,
  type UbicacionAlmacen,
  type DatosReclasificacion,
} from '../modelo/almacen'

interface Props {
  organizationId: string
  almacenes: Almacen[]
  ubicaciones: UbicacionAlmacen[]
  puedeGestionar: boolean
  reclasificar: (datos: DatosReclasificacion) => Promise<string | undefined>
  configurar: (datos: {
    productoId: string
    almacenId: string
    ubicacionId: string
    stockMinimo: number
    diasVencimiento: number
  }) => Promise<string | undefined>
}
const formatoCantidad = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 3,
})

export function PanelControlStock(props: Props) {
  const { organizationId, almacenes, ubicaciones, puedeGestionar } = props
  const almacenesActivos = useMemo(
    () => almacenes.filter((almacen) => almacen.activo),
    [almacenes],
  )
  const [reclasificacionAlmacenId, setReclasificacionAlmacenId] = useState(
    almacenesActivos[0]?.id ?? '',
  )
  const [politicaAlmacenId, setPoliticaAlmacenId] = useState(
    almacenesActivos[0]?.id ?? '',
  )
  const { mensaje, guardando, resolver, ejecutar } =
    useResultadoOperacionAlmacen()
  const [alertasConsulta, setAlertasConsulta] = useState({
    pagina: 1,
    tamanioPagina: 25 as TamanioPaginaInventario,
    busqueda: '',
    almacenId: '',
    orden: 'producto-asc' as const,
  })
  const [vencimientosConsulta, setVencimientosConsulta] = useState({
    pagina: 1,
    tamanioPagina: 25 as TamanioPaginaInventario,
    busqueda: '',
    almacenId: '',
    estadoVencimiento: '' as '' | 'expired' | 'urgent' | 'upcoming',
    fechaDesde: '',
    fechaHasta: '',
    orden: 'vencimiento-asc' as const,
  })

  const alertasBusqueda = useDebounceInventario(alertasConsulta.busqueda)
  const vencimientosBusqueda = useDebounceInventario(
    vencimientosConsulta.busqueda,
  )
  const listados = useListadosAlmacen({
    alertas: { ...alertasConsulta, busqueda: alertasBusqueda },
    vencimientos: { ...vencimientosConsulta, busqueda: vencimientosBusqueda },
  })
  const alertas = listados.alertas.data?.elementos ?? []
  const vencimientos = listados.vencimientos.data?.elementos ?? []
  useEffect(() => {
    if (
      !almacenesActivos.some(
        (almacen) => almacen.id === reclasificacionAlmacenId,
      )
    )
      setReclasificacionAlmacenId(almacenesActivos[0]?.id ?? '')
    if (!almacenesActivos.some((almacen) => almacen.id === politicaAlmacenId))
      setPoliticaAlmacenId(almacenesActivos[0]?.id ?? '')
  }, [almacenesActivos, politicaAlmacenId, reclasificacionAlmacenId])
  const guardarReclasificacion = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    const entrada = {
      productoId: valor(datos, 'productoId'),
      almacenId: valor(datos, 'almacenId'),
      ubicacionId: valor(datos, 'ubicacionId'),
      estadoOrigen: valor(datos, 'estadoOrigen'),
      estadoDestino: valor(datos, 'estadoDestino'),
      cantidad: valor(datos, 'cantidad'),
      lote: valor(datos, 'lote'),
      fechaVencimiento: valor(datos, 'fechaVencimiento'),
      motivo: valor(datos, 'motivo'),
    }
    void resolver(
      esquemaReclasificacion.safeParse(entrada),
      props.reclasificar,
      'Stock reclasificado correctamente.',
    )
  }

  const guardarConfiguracion = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    void ejecutar(
      () =>
        props.configurar({
          productoId: valor(datos, 'productoId'),
          almacenId: valor(datos, 'almacenId'),
          ubicacionId: valor(datos, 'ubicacionId'),
          stockMinimo: Number(valor(datos, 'stockMinimo')),
          diasVencimiento: Number(valor(datos, 'diasVencimiento')),
        }),
      'Política de alertas actualizada.',
    )
  }
  return (
    <div className="space-y-8">
      <MensajeOperacionAlmacen texto={mensaje} />
      <section aria-labelledby="alertas-almacen" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_14rem_12rem_12rem] xl:items-end">
          <div>
            <h2
              id="alertas-almacen"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <AlertTriangle className="size-5 text-[#9a6700]" />
              Alertas de stock mínimo
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {listados.alertas.data?.total ?? 0} alertas activas.
            </p>
          </div>
          <label className="field-label">
            Buscar
            <input
              type="search"
              value={alertasConsulta.busqueda}
              onChange={(e) =>
                setAlertasConsulta((actual) => ({
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
              value={alertasConsulta.almacenId}
              onChange={(e) =>
                setAlertasConsulta((actual) => ({
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
              value={alertasConsulta.orden}
              onChange={(e) =>
                setAlertasConsulta((actual) => ({
                  ...actual,
                  orden: e.target.value as typeof actual.orden,
                  pagina: 1,
                }))
              }
              className="field-control"
            >
              <option value="producto-asc">Producto A–Z</option>
              <option value="stock-asc">Menor asignable</option>
            </select>
          </label>
        </div>
        <EstadoListadoInventario
          cargando={listados.alertas.isLoading}
          error={listados.alertas.error}
          vacio={!alertas.length}
          mensajeVacio="No hay alertas de stock mínimo para los filtros activos."
          alReintentar={() => void listados.alertas.refetch()}
        >
          <div className="grid gap-px bg-border md:grid-cols-2">
            {alertas.map((alerta) => (
              <article
                key={`${alerta.productoId}-${alerta.almacenId}-stock`}
                className="bg-background px-5 py-5"
              >
                <p className="font-medium">{alerta.productoDescripcion}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {alerta.almacenNombre} · {alerta.lote || 'Sin lote'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {alerta.alertaStockMinimo ? (
                    <span className="status-label" data-tone="revision">
                      Asignable {formatoCantidad.format(alerta.cantidad)} /
                      mínimo {formatoCantidad.format(alerta.stockMinimo)}
                    </span>
                  ) : null}
                  {alerta.alertaVencimiento ? (
                    <span className="status-label" data-tone="revision">
                      {alerta.estadoVencimiento === 'expired'
                        ? 'Vencido'
                        : alerta.estadoVencimiento === 'urgent'
                          ? `Urgente · ${alerta.diasParaVencer} días`
                          : `Próximo · ${alerta.diasParaVencer} días`}
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </EstadoListadoInventario>
        {listados.alertas.data ? (
          <PaginacionInventario
            etiqueta="alertas de stock"
            pagina={alertasConsulta.pagina}
            tamanioPagina={alertasConsulta.tamanioPagina}
            total={listados.alertas.data.total}
            totalPaginas={listados.alertas.data.totalPaginas}
            cantidadVisible={alertas.length}
            cargando={listados.alertas.isFetching}
            alCambiarPagina={(pagina) =>
              setAlertasConsulta((actual) => ({ ...actual, pagina }))
            }
            alCambiarTamanio={(tamanioPagina) =>
              setAlertasConsulta((actual) => ({
                ...actual,
                tamanioPagina,
                pagina: 1,
              }))
            }
          />
        ) : null}
      </section>

      <section aria-labelledby="vencimientos-almacen" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_14rem_11rem_12rem] xl:items-end">
          <div>
            <h2 id="vencimientos-almacen" className="text-lg font-semibold">
              Vencimientos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {listados.vencimientos.data?.total ?? 0} lotes vencidos o próximos
              a vencer.
            </p>
          </div>
          <label className="field-label">
            Buscar
            <input
              type="search"
              value={vencimientosConsulta.busqueda}
              onChange={(e) =>
                setVencimientosConsulta((actual) => ({
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
            Estado
            <select
              value={vencimientosConsulta.estadoVencimiento}
              onChange={(e) =>
                setVencimientosConsulta((actual) => ({
                  ...actual,
                  estadoVencimiento: e.target
                    .value as typeof actual.estadoVencimiento,
                  pagina: 1,
                }))
              }
              className="field-control"
            >
              <option value="">Todos</option>
              <option value="expired">Vencido</option>
              <option value="urgent">Urgente</option>
              <option value="upcoming">Próximo</option>
            </select>
          </label>
          <label className="field-label">
            Orden
            <select
              value={vencimientosConsulta.orden}
              onChange={(e) =>
                setVencimientosConsulta((actual) => ({
                  ...actual,
                  orden: e.target.value as typeof actual.orden,
                  pagina: 1,
                }))
              }
              className="field-control"
            >
              <option value="vencimiento-asc">Más próximo</option>
              <option value="vencimiento-desc">Más lejano</option>
            </select>
          </label>
        </div>
        <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6 lg:grid-cols-3">
          <label className="field-label">
            Almacén
            <select
              value={vencimientosConsulta.almacenId}
              onChange={(e) =>
                setVencimientosConsulta((actual) => ({
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
            Vence desde
            <input
              type="date"
              value={vencimientosConsulta.fechaDesde}
              onChange={(e) =>
                setVencimientosConsulta((actual) => ({
                  ...actual,
                  fechaDesde: e.target.value,
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
              value={vencimientosConsulta.fechaHasta}
              onChange={(e) =>
                setVencimientosConsulta((actual) => ({
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
          cargando={listados.vencimientos.isLoading}
          error={listados.vencimientos.error}
          vacio={!vencimientos.length}
          mensajeVacio="No hay vencimientos para los filtros activos."
          alReintentar={() => void listados.vencimientos.refetch()}
        >
          <div className="grid gap-px bg-border md:grid-cols-2">
            {vencimientos.map((alerta) => (
              <article
                key={`${alerta.productoId}-${alerta.almacenId}-${alerta.ubicacionId}-${alerta.lote}-${alerta.fechaVencimiento}`}
                className="bg-background px-5 py-5"
              >
                <p className="font-medium">{alerta.productoDescripcion}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {alerta.almacenNombre} · {alerta.lote || 'Sin lote'} ·{' '}
                  {alerta.fechaVencimiento}
                </p>
                <div className="mt-3">
                  <span className="status-label" data-tone="revision">
                    {alerta.estadoVencimiento === 'expired'
                      ? 'Vencido'
                      : alerta.estadoVencimiento === 'urgent'
                        ? `Urgente · ${alerta.diasParaVencer} días`
                        : `Próximo · ${alerta.diasParaVencer} días`}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </EstadoListadoInventario>
        {listados.vencimientos.data ? (
          <PaginacionInventario
            etiqueta="vencimientos"
            pagina={vencimientosConsulta.pagina}
            tamanioPagina={vencimientosConsulta.tamanioPagina}
            total={listados.vencimientos.data.total}
            totalPaginas={listados.vencimientos.data.totalPaginas}
            cantidadVisible={vencimientos.length}
            cargando={listados.vencimientos.isFetching}
            alCambiarPagina={(pagina) =>
              setVencimientosConsulta((actual) => ({ ...actual, pagina }))
            }
            alCambiarTamanio={(tamanioPagina) =>
              setVencimientosConsulta((actual) => ({
                ...actual,
                tamanioPagina,
                pagina: 1,
              }))
            }
          />
        ) : null}
      </section>

      {puedeGestionar ? (
        <form
          className="ledger-sheet p-5 sm:p-6"
          onSubmit={guardarReclasificacion}
        >
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="size-5 text-primary" />
            Inmovilizar o liberar stock
          </h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <SelectorProductoInventario
                id="reclasificar-producto"
                name="productoId"
                etiqueta="Producto"
                organizationId={organizationId}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="reclasificar-almacen">
                Almacén
              </label>
              <select
                id="reclasificar-almacen"
                name="almacenId"
                className="field-control"
                value={reclasificacionAlmacenId}
                onChange={(e) => setReclasificacionAlmacenId(e.target.value)}
              >
                {almacenesActivos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="reclasificar-ubicacion">
                Ubicación
              </label>
              <select
                id="reclasificar-ubicacion"
                name="ubicacionId"
                className="field-control"
              >
                {ubicaciones
                  .filter(
                    (u) => u.almacenId === reclasificacionAlmacenId && u.activa,
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.codigo} · {u.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="estado-origen">
                Estado actual
              </label>
              <select
                id="estado-origen"
                name="estadoOrigen"
                className="field-control"
              >
                <option value="available">Disponible</option>
                <option value="quarantine">Cuarentena</option>
                <option value="damaged">Dañado</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="estado-destino">
                Nuevo estado
              </label>
              <select
                id="estado-destino"
                name="estadoDestino"
                className="field-control"
              >
                <option value="quarantine">Cuarentena</option>
                <option value="damaged">Dañado</option>
                <option value="available">Disponible</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="reclasificar-cantidad">
                Cantidad
              </label>
              <input
                id="reclasificar-cantidad"
                name="cantidad"
                required
                className="field-control"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="reclasificar-lote">
                Lote
              </label>
              <input
                id="reclasificar-lote"
                name="lote"
                className="field-control"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="reclasificar-vencimiento">
                Vencimiento
              </label>
              <input
                id="reclasificar-vencimiento"
                name="fechaVencimiento"
                type="date"
                className="field-control"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="reclasificar-motivo">
                Motivo
              </label>
              <input
                id="reclasificar-motivo"
                name="motivo"
                required
                className="field-control"
                placeholder="Daño, inspección o liberación"
              />
            </div>
          </div>
          <Button
            className="mt-5"
            type="submit"
            disabled={
              guardando ||
              !ubicaciones.some(
                (ubicacion) =>
                  ubicacion.almacenId === reclasificacionAlmacenId &&
                  ubicacion.activa,
              )
            }
          >
            Aplicar reclasificación
          </Button>
        </form>
      ) : null}
      {puedeGestionar ? (
        <section aria-labelledby="politicas-almacen" className="ledger-sheet">
          <div className="border-b px-5 py-5 sm:px-6">
            <h2
              id="politicas-almacen"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <Boxes className="size-5 text-primary" />
              Política de alertas
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Define la ubicación predeterminada y los umbrales por producto y
              almacén.
            </p>
          </div>
          <form
            className="grid gap-4 p-5 sm:p-6 lg:grid-cols-5 lg:items-end"
            onSubmit={guardarConfiguracion}
          >
            <div className="lg:col-span-2">
              <SelectorProductoInventario
                id="politica-producto"
                name="productoId"
                etiqueta="Producto"
                organizationId={organizationId}
              />
            </div>
            <label className="field-label">
              Almacén
              <select
                name="almacenId"
                className="field-control"
                value={politicaAlmacenId}
                onChange={(e) => setPoliticaAlmacenId(e.target.value)}
              >
                {almacenesActivos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Ubicación predeterminada
              <select name="ubicacionId" className="field-control">
                {ubicaciones
                  .filter((u) => u.almacenId === politicaAlmacenId && u.activa)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.codigo} · {u.nombre}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Stock mínimo
              <input
                name="stockMinimo"
                type="number"
                min="0"
                step="0.001"
                className="field-control"
                placeholder="0"
              />
            </label>
            <label className="field-label">
              Alerta de vencimiento (días)
              <input
                name="diasVencimiento"
                type="number"
                min="0"
                max="3650"
                defaultValue="30"
                className="field-control"
              />
            </label>
            <Button
              className="lg:col-start-5"
              variant="outline"
              disabled={guardando || !almacenesActivos.length}
            >
              Guardar política
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  )
}
