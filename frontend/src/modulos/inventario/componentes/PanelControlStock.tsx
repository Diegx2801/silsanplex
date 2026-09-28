import { AlertTriangle, Boxes, ShieldAlert } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
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
import type { ProductoInventarioOpcion } from '../modelo/productoInventarioRead'
import { obtenerConfiguracionAlertasStock } from '../servicios/almacenService'
import { inventoryQueryKeys } from '../estado/inventoryQueryKeys'

import {
  esquemaConfiguracionAlertasStock,
  esquemaReclasificacion,
  etiquetasEstadoStock,
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
  const [productoReclasificar, setProductoReclasificar] =
    useState<ProductoInventarioOpcion | null>(null)
  const [politicaAlmacenId, setPoliticaAlmacenId] = useState(
    almacenesActivos[0]?.id ?? '',
  )
  const [politicaProductoId, setPoliticaProductoId] = useState('')
  const [politicaUbicacionId, setPoliticaUbicacionId] = useState('')
  const [stockMinimo, setStockMinimo] = useState('0')
  const [diasVencimiento, setDiasVencimiento] = useState('30')
  const { mensaje, guardando, resolver } =
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
  const politicaQuery = useQuery({
    queryKey: inventoryQueryKeys.stockPolicy(
      organizationId,
      politicaProductoId,
      politicaAlmacenId,
    ),
    queryFn: () => obtenerConfiguracionAlertasStock(
      organizationId,
      politicaProductoId,
      politicaAlmacenId,
    ),
    enabled: Boolean(organizationId && politicaProductoId && politicaAlmacenId),
  })
  const ubicacionesPolitica = useMemo(
    () => ubicaciones.filter(
      (ubicacion) => ubicacion.almacenId === politicaAlmacenId && ubicacion.activa,
    ),
    [politicaAlmacenId, ubicaciones],
  )
  const alertas = listados.alertas.data?.elementos ?? []
  const vencimientos = listados.vencimientos.data?.elementos ?? []
  useEffect(() => {
    if (
      !politicaProductoId ||
      !politicaAlmacenId ||
      !politicaQuery.isSuccess ||
      politicaQuery.isFetching
    ) return

    const configuracion = politicaQuery.data
    const ubicacionGuardada = configuracion?.ubicacionId
    const ubicacionActiva = ubicacionesPolitica.some(
      (ubicacion) => ubicacion.id === ubicacionGuardada,
    )
    setPoliticaUbicacionId(
      ubicacionActiva ? ubicacionGuardada! : ubicacionesPolitica[0]?.id ?? '',
    )
    setStockMinimo(String(configuracion?.stockMinimo ?? 0))
    setDiasVencimiento(String(configuracion?.diasVencimiento ?? 30))
  }, [
    politicaAlmacenId,
    politicaProductoId,
    politicaQuery.data,
    politicaQuery.isFetching,
    politicaQuery.isSuccess,
    ubicacionesPolitica,
  ])
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
      esquemaReclasificacion.superRefine((datos, contexto) => {
        if (productoReclasificar?.controlLote && !datos.lote) {
          contexto.addIssue({
            code: 'custom',
            path: ['lote'],
            message: 'Este producto requiere identificar el lote a reclasificar',
          })
        }
        if (productoReclasificar?.controlVencimiento && !datos.fechaVencimiento) {
          contexto.addIssue({
            code: 'custom',
            path: ['fechaVencimiento'],
            message: 'Este producto requiere identificar el vencimiento del lote',
          })
        }
      }).safeParse(entrada),
      props.reclasificar,
      'Stock reclasificado correctamente.',
    )
  }

  const guardarConfiguracion = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    const entrada = {
      productoId: valor(datos, 'productoId'),
      almacenId: valor(datos, 'almacenId'),
      ubicacionId: valor(datos, 'ubicacionId'),
      stockMinimo: valor(datos, 'stockMinimo'),
      diasVencimiento: valor(datos, 'diasVencimiento'),
    }
    void resolver(
      esquemaConfiguracionAlertasStock.safeParse(entrada),
      (configuracion) => props.configurar({
        productoId: configuracion.productoId,
        almacenId: configuracion.almacenId,
        ubicacionId: configuracion.ubicacionId,
        stockMinimo: Number(configuracion.stockMinimo),
        diasVencimiento: Number(configuracion.diasVencimiento),
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className="status-label"
                    data-tone={alerta.estado === 'available' ? 'listo' : 'revision'}
                  >
                    {etiquetasEstadoStock[alerta.estado]}
                  </span>
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
                value={productoReclasificar?.id ?? ''}
                selectedOption={productoReclasificar}
                onValueChange={(_productoId, opcion) => setProductoReclasificar(opcion ?? null)}
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
                type="number"
                min="0.001"
                step="0.001"
                inputMode="decimal"
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
                required={productoReclasificar?.controlLote}
                placeholder={productoReclasificar?.controlLote ? 'Obligatorio' : 'Sin lote'}
              />
              {productoReclasificar?.controlLote ? (
                <p className="field-help">Indica exactamente el lote del saldo origen.</p>
              ) : null}
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
                required={productoReclasificar?.controlVencimiento}
              />
              {productoReclasificar?.controlVencimiento ? (
                <p className="field-help">Selecciona el vencimiento exacto del saldo origen.</p>
              ) : null}
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
            className="grid gap-4 p-5 sm:p-6 lg:grid-cols-6 lg:items-end"
            onSubmit={guardarConfiguracion}
          >
            <div className="lg:col-span-2">
              <SelectorProductoInventario
                id="politica-producto"
                name="productoId"
                etiqueta="Producto"
                organizationId={organizationId}
                value={politicaProductoId}
                onValueChange={(productoId) => setPoliticaProductoId(productoId)}
              />
            </div>
            <label className="field-label">
              Almacén
              <select
                name="almacenId"
                className="field-control"
                value={politicaAlmacenId}
                onChange={(e) => setPoliticaAlmacenId(e.target.value)}
                disabled={!almacenesActivos.length}
              >
                {!almacenesActivos.length ? <option value="">No hay almacenes activos</option> : null}
                {almacenesActivos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Ubicación predeterminada
              <select
                name="ubicacionId"
                className="field-control"
                value={politicaUbicacionId}
                onChange={(e) => setPoliticaUbicacionId(e.target.value)}
                disabled={!ubicacionesPolitica.length || politicaQuery.isFetching}
                required
              >
                {!ubicacionesPolitica.length ? <option value="">No hay ubicaciones activas</option> : null}
                {ubicacionesPolitica.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} · {u.nombre}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <label className="field-label" htmlFor="politica-stock-minimo">
                Stock mínimo
              </label>
              <input
                id="politica-stock-minimo"
                name="stockMinimo"
                type="number"
                min="0"
                max="99999999999.999"
                step="0.001"
                className="field-control"
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value)}
                required
              />
              <p className="field-help">Al guardar 0, se alerta cuando el stock asignable llega a cero.</p>
            </div>
            <div>
              <label className="field-label" htmlFor="politica-dias-vencimiento">
                Alerta de vencimiento (días)
              </label>
              <input
                id="politica-dias-vencimiento"
                name="diasVencimiento"
                type="number"
                min="0"
                max="3650"
                step="1"
                className="field-control"
                value={diasVencimiento}
                onChange={(e) => setDiasVencimiento(e.target.value)}
                required
              />
              <p className="field-help">0 alerta solo para lotes vencidos o que vencen hoy; sin política se usan 30 días.</p>
            </div>
            <Button
              type="submit"
              className="lg:col-start-6"
              variant="outline"
              disabled={
                guardando ||
                !politicaProductoId ||
                !almacenesActivos.length ||
                !ubicacionesPolitica.length ||
                politicaQuery.isLoading ||
                politicaQuery.isFetching ||
                politicaQuery.isError
              }
            >
              {politicaQuery.isFetching ? 'Cargando política…' : 'Guardar política'}
            </Button>
            {politicaQuery.isError ? (
              <p role="alert" className="field-error lg:col-span-6">
                No se pudo consultar la política guardada. Reintenta antes de cambiarla.
              </p>
            ) : null}
            {politicaProductoId && !politicaQuery.isLoading && !politicaQuery.isFetching && politicaQuery.isSuccess ? (
              <p role="status" className="field-help lg:col-span-6">
                {politicaQuery.data
                  ? 'Se cargó la política actual de este producto y almacén; puedes actualizar sus valores.'
                  : 'Aún no hay política guardada para esta combinación. El vencimiento usa el umbral predeterminado de 30 días.'}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}
    </div>
  )
}
