import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpFromLine, Boxes, PackageCheck, PackageX, Plus, Search } from 'lucide-react'
import { type MouseEvent as ReactMouseEvent, useCallback, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { AccionesFilaInventario } from '@/modulos/inventario/componentes/AccionesFilaInventario'
import { DialogoAjusteStock } from '@/modulos/inventario/componentes/DialogoAjusteStock'
import { DialogoMovimientoInventario } from '@/modulos/inventario/componentes/DialogoMovimientoInventario'
import { EstadoListadoInventario } from '@/modulos/inventario/componentes/EstadoListadoInventario'
import { PaginacionInventario } from '@/modulos/inventario/componentes/PaginacionInventario'
import { PanelExistenciasLotes } from '@/modulos/inventario/componentes/PanelExistenciasLotes'
import { VistasInventario } from '@/modulos/inventario/componentes/VistasInventario'
import { useAlmacenes } from '@/modulos/inventario/estado/useAlmacenes'
import { useDebounceInventario } from '@/modulos/inventario/estado/useDebounceInventario'
import { useInventario } from '@/modulos/inventario/estado/useInventario'
import type { SaldoInventario } from '@/modulos/inventario/modelo/almacen'
import type { ContextoAccionInventario } from '@/modulos/inventario/modelo/contextoAccionInventario'
import { cantidadFisicaNoReservada, type DatosMovimientoInventario, type ExistenciaInventario, type FiltroStockInventario, type OrdenExistenciasInventario } from '@/modulos/inventario/modelo/inventario'
import type { TamanioPaginaInventario } from '@/modulos/inventario/modelo/paginacionInventario'
import { obtenerOpcionProductoInventarioPorId } from '@/modulos/inventario/servicios/productoInventarioReadService'

const formatoCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })
type TipoDialogoInventario = 'ajuste' | 'movimiento'

interface EstadoDialogoInventario {
  tipo: TipoDialogoInventario
  contexto: ContextoAccionInventario | null
}

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
  const { access, hasPermission } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const puedeGestionar = hasPermission(PERMISSIONS.INVENTORY_MANAGE)
  const gestionAlmacenes = useAlmacenes()
  const almacenesActivos = gestionAlmacenes.almacenes.filter((almacen) => almacen.activo)
  const registro = useInventario({})
  const queryClient = useQueryClient()
  const [dialogo, setDialogo] = useState<EstadoDialogoInventario | null>(null)
  const [preparandoAccion, setPreparandoAccion] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')
  const [mensaje, setMensaje] = useState('')
  const disparador = useRef<HTMLButtonElement | null>(null)
  const encabezado = useRef<HTMLHeadingElement | null>(null)
  const preparandoAccionRef = useRef(false)

  const restaurarFoco = useCallback(() => {
    if (
      disparador.current?.isConnected
      && !disparador.current.disabled
      && disparador.current.getClientRects().length > 0
    ) {
      disparador.current.focus()
      return
    }
    encabezado.current?.focus()
  }, [])

  const abrirDialogo = (tipo: TipoDialogoInventario, evento: ReactMouseEvent<HTMLButtonElement>) => {
    disparador.current = evento.currentTarget
    setErrorAccion('')
    setMensaje('')
    setDialogo({ tipo, contexto: null })
  }

  const abrirDesdeExistencia = async (
    tipo: TipoDialogoInventario,
    fila: ExistenciaInventario | SaldoInventario,
    evento: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (!organizationId || preparandoAccionRef.current) return
    disparador.current = evento.currentTarget
    preparandoAccionRef.current = true
    setPreparandoAccion(true)
    setErrorAccion('')
    setMensaje('')
    try {
      const producto = await queryClient.fetchQuery({
        queryKey: ['inventory-product-option-by-id', organizationId, fila.productoId],
        queryFn: () => obtenerOpcionProductoInventarioPorId(organizationId, fila.productoId),
        staleTime: 30_000,
      })
      if (!producto) {
        setErrorAccion('El producto ya no está disponible para operar. Verifica que siga activo e inténtalo de nuevo.')
        return
      }

      const posicion = 'estado' in fila
        ? {
            almacenId: fila.almacenId,
            ubicacionId: fila.ubicacionId,
            estado: fila.estado,
            lote: fila.lote,
            fechaVencimiento: fila.fechaVencimiento,
          }
        : undefined
      setDialogo({ tipo, contexto: { producto, posicion } })
    } catch {
      setErrorAccion('No se pudo preparar el producto. Inténtalo nuevamente.')
    } finally {
      preparandoAccionRef.current = false
      setPreparandoAccion(false)
    }
  }

  const guardarMovimiento = async (datos: DatosMovimientoInventario) => {
    const error = await registro.registrarMovimiento(datos)
    if (!error) setMensaje('Movimiento registrado y existencia actualizada.')
    return error
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">Inventario</span>
          <h1 ref={encabezado} tabIndex={-1} className="mt-2 rounded-sm text-3xl font-semibold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-4xl">Existencias y lotes</h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
            Consulta el stock físico, las reservas y la cantidad disponible por producto, almacén y lote.
          </p>
        </div>
        {puedeGestionar ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={!organizationId || !almacenesActivos.length || preparandoAccion}
              onClick={(evento) => abrirDialogo('ajuste', evento)}
            >
              <ArrowUpFromLine aria-hidden="true" />
              Ajustar stock
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={!organizationId || !almacenesActivos.length || preparandoAccion}
              onClick={(evento) => abrirDialogo('movimiento', evento)}
            >
              <Plus aria-hidden="true" />
              Registrar movimiento
            </Button>
          </div>
        ) : null}
      </header>
      {preparandoAccion ? (
        <p role="status" aria-live="polite" className="border bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
          Preparando el formulario con los datos del producto…
        </p>
      ) : null}
      {errorAccion ? (
        <p role="alert" className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorAccion}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">{mensaje}</p>
      <VistasInventario etiqueta="Vistas de existencias" vista={vista} opciones={[
        { valor: 'productos', etiqueta: 'Por producto' },
        { valor: 'lotes', etiqueta: 'Por almacén y lote' },
      ]} />
      <p className="text-sm leading-6 text-muted-foreground">
        El stock físico incluye todas las condiciones. El disponible excluye las reservas y los bienes en cuarentena, dañados o vencidos.
      </p>
      {vista === 'productos'
        ? <ExistenciasPorProducto
            puedeGestionar={puedeGestionar}
            accionesDeshabilitadas={preparandoAccion || !almacenesActivos.length}
            onAjustar={(fila, evento) => void abrirDesdeExistencia('ajuste', fila, evento)}
            onMovimiento={(fila, evento) => void abrirDesdeExistencia('movimiento', fila, evento)}
          />
        : <ExistenciasPorLote
            gestion={gestionAlmacenes}
            puedeGestionar={puedeGestionar}
            accionesDeshabilitadas={preparandoAccion || !almacenesActivos.length}
            onAjustar={(fila, evento) => void abrirDesdeExistencia('ajuste', fila, evento)}
            onMovimiento={(fila, evento) => void abrirDesdeExistencia('movimiento', fila, evento)}
          />}
      {dialogo?.tipo === 'movimiento' && puedeGestionar && almacenesActivos.length ? (
        <DialogoMovimientoInventario
          abierto
          organizationId={organizationId}
          almacenes={almacenesActivos}
          ubicaciones={gestionAlmacenes.ubicaciones}
          contexto={dialogo.contexto}
          alCambiarApertura={(abierto) => { if (!abierto) setDialogo(null) }}
          alGuardar={guardarMovimiento}
          alRestaurarFoco={restaurarFoco}
        />
      ) : null}
      {dialogo?.tipo === 'ajuste' && puedeGestionar && almacenesActivos.length ? (
        <DialogoAjusteStock
          abierto
          organizationId={organizationId}
          almacenes={almacenesActivos}
          ubicaciones={gestionAlmacenes.ubicaciones}
          contexto={dialogo.contexto}
          alCambiarApertura={(abierto) => { if (!abierto) setDialogo(null) }}
          alGuardar={guardarMovimiento}
          alRestaurarFoco={restaurarFoco}
        />
      ) : null}
    </div>
  )
}

interface AccionesExistenciaProps {
  puedeGestionar: boolean
  accionesDeshabilitadas: boolean
  onAjustar: (fila: ExistenciaInventario | SaldoInventario, evento: ReactMouseEvent<HTMLButtonElement>) => void
  onMovimiento: (fila: ExistenciaInventario | SaldoInventario, evento: ReactMouseEvent<HTMLButtonElement>) => void
}

function ExistenciasPorLote({
  gestion,
  puedeGestionar,
  accionesDeshabilitadas,
  onAjustar,
  onMovimiento,
}: AccionesExistenciaProps & { gestion: ReturnType<typeof useAlmacenes> }) {
  return (
    <EstadoListadoInventario cargando={gestion.cargando} error={gestion.error} vacio={false}
      mensajeVacio="" alReintentar={() => void gestion.reintentar()}>
      <PanelExistenciasLotes
        almacenes={gestion.almacenes}
        ubicaciones={gestion.ubicaciones}
        puedeGestionar={puedeGestionar}
        accionesDeshabilitadas={accionesDeshabilitadas}
        onAjustar={onAjustar}
        onMovimiento={onMovimiento}
      />
    </EstadoListadoInventario>
  )
}

function ExistenciasPorProducto({
  puedeGestionar,
  accionesDeshabilitadas,
  onAjustar,
  onMovimiento,
}: AccionesExistenciaProps) {
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
              {existencias.map((existencia) => {
                const sinDisponibleParaAjuste = cantidadFisicaNoReservada(existencia.stockFisico, existencia.stockReservado) <= 0
                return (
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
                  {puedeGestionar ? (
                    <div className="mt-4 border-t pt-4">
                      <AccionesFilaInventario
                        producto={existencia.productoDescripcion}
                        ajusteDeshabilitado={accionesDeshabilitadas || sinDisponibleParaAjuste}
                        ajusteSinDisponible={!accionesDeshabilitadas && sinDisponibleParaAjuste}
                        movimientoDeshabilitado={accionesDeshabilitadas}
                        onAjustar={(evento) => onAjustar(existencia, evento)}
                        onMovimiento={(evento) => onMovimiento(existencia, evento)}
                      />
                    </div>
                  ) : null}
                </article>
                )
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[66rem] border-collapse text-left text-sm">
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
                    {puedeGestionar ? <th scope="col" className="px-5 py-3 text-center font-medium">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {existencias.map((existencia) => {
                    const sinDisponibleParaAjuste = cantidadFisicaNoReservada(existencia.stockFisico, existencia.stockReservado) <= 0
                    return (
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
                      {puedeGestionar ? (
                        <td className="px-5 py-4">
                        <AccionesFilaInventario
                          producto={existencia.productoDescripcion}
                          centrado
                            ajusteDeshabilitado={accionesDeshabilitadas || sinDisponibleParaAjuste}
                            ajusteSinDisponible={!accionesDeshabilitadas && sinDisponibleParaAjuste}
                            movimientoDeshabilitado={accionesDeshabilitadas}
                            onAjustar={(evento) => onAjustar(existencia, evento)}
                            onMovimiento={(evento) => onMovimiento(existencia, evento)}
                          />
                        </td>
                      ) : null}
                    </tr>
                    )
                  })}
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
