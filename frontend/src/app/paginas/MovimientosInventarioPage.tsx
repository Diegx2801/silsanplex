import { ArrowDownToLine, ArrowUpFromLine, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { DialogoMovimientoInventario } from '@/modulos/inventario/componentes/DialogoMovimientoInventario'
import { EstadoListadoInventario } from '@/modulos/inventario/componentes/EstadoListadoInventario'
import { PaginacionInventario } from '@/modulos/inventario/componentes/PaginacionInventario'
import { PanelMovimientosAlmacen } from '@/modulos/inventario/componentes/PanelMovimientosAlmacen'
import { VistasInventario } from '@/modulos/inventario/componentes/VistasInventario'
import { useAlmacenes } from '@/modulos/inventario/estado/useAlmacenes'
import { useDebounceInventario } from '@/modulos/inventario/estado/useDebounceInventario'
import { useInventario } from '@/modulos/inventario/estado/useInventario'
import { movimientoEsSalida, tiposMovimientoInventario, type DatosMovimientoInventario, type MovimientoInventario } from '@/modulos/inventario/modelo/inventario'
import type { TamanioPaginaInventario } from '@/modulos/inventario/modelo/paginacionInventario'

const formatoCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })
const formatoFecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
function etiquetaTipo(tipo: MovimientoInventario['tipo']) {
  return tiposMovimientoInventario.find((item) => item.valor === tipo)!.etiqueta
}
function MovimientoFila({ movimiento }: { movimiento: MovimientoInventario }) {
  const esSalida = movimientoEsSalida(movimiento.tipo)
  const Icono = esSalida ? ArrowUpFromLine : ArrowDownToLine

  return (
    <article className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${
            esSalida
              ? 'bg-[#f4e7c6] text-[#79520d]'
              : 'bg-accent text-primary'
          }`}
        >
          <Icono aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-medium">{movimiento.productoDescripcion}</h3>
            <span className="font-mono text-xs text-muted-foreground">
              {movimiento.productoCodigo}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {movimiento.motivo} · {movimiento.almacen}
            {movimiento.lote ? ` · Lote ${movimiento.lote}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Documento: {movimiento.documentoReferencia || 'Sin referencia registrada'}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 lg:block lg:text-end">
        <p
          className={`font-mono text-sm font-semibold tabular-nums ${
            esSalida ? 'text-[#79520d]' : 'text-primary'
          }`}
        >
          {esSalida ? '−' : '+'}
          {formatoCantidad.format(movimiento.cantidad)}{' '}
          <span className="font-sans text-xs font-normal text-muted-foreground">
            {movimiento.unidadMedida || 'unid.'}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {etiquetaTipo(movimiento.tipo)} ·{' '}
          {formatoFecha.format(new Date(`${movimiento.fechaOperacion}T12:00:00`))}
        </p>
      </div>
    </article>
  )
}


export function MovimientosInventarioPage() {
  const [parametros] = useSearchParams()
  const parametroVista = parametros.get('vista')
  const vista = parametroVista === 'kardex' || parametroVista === 'transferencias' ? parametroVista : 'historial'
  const { access, hasPermission } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const puedeGestionar = hasPermission(PERMISSIONS.INVENTORY_MANAGE)
  const gestionAlmacenes = useAlmacenes()
  const inventario = useInventario({})
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const disparador = useRef<HTMLButtonElement>(null)
  const guardarMovimiento = async (datos: DatosMovimientoInventario) => {
    const error = await inventario.registrarMovimiento(datos)
    if (!error) setMensaje('Movimiento registrado y existencia actualizada.')
    return error
  }
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">Inventario</span>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Movimientos y Kardex</h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">Consulta entradas, salidas y transferencias; registra operaciones manuales con su documento y motivo.</p>
        </div>
        {puedeGestionar ? <Button ref={disparador} size="lg" disabled={!gestionAlmacenes.almacenes.some((a) => a.activo)} onClick={() => setDialogoAbierto(true)}>
          <Plus aria-hidden="true" />Registrar movimiento
        </Button> : null}
      </header>
      <VistasInventario etiqueta="Vistas de movimientos" vista={vista} opciones={[
        { valor: 'historial', etiqueta: 'Historial' }, { valor: 'kardex', etiqueta: 'Kardex valorizado' }, { valor: 'transferencias', etiqueta: 'Transferencias' },
      ]} />
      <p role="status" aria-live="polite" className="sr-only">{mensaje}</p>
      <EstadoListadoInventario cargando={gestionAlmacenes.cargando} error={gestionAlmacenes.error} vacio={false} mensajeVacio="" alReintentar={() => void gestionAlmacenes.reintentar()}>
        {vista === 'historial' ? <HistorialMovimientos gestionAlmacenes={gestionAlmacenes} /> :
          <PanelMovimientosAlmacen organizationId={organizationId} almacenes={gestionAlmacenes.almacenes} ubicaciones={gestionAlmacenes.ubicaciones}
            puedeGestionar={puedeGestionar} transferir={gestionAlmacenes.transferir} vista={vista} />}
      </EstadoListadoInventario>
      {dialogoAbierto && puedeGestionar ? (
        <DialogoMovimientoInventario abierto={dialogoAbierto} organizationId={organizationId}
          almacenes={gestionAlmacenes.almacenes.filter((a) => a.activo)} ubicaciones={gestionAlmacenes.ubicaciones}
          alCambiarApertura={setDialogoAbierto} alGuardar={guardarMovimiento} alRestaurarFoco={() => disparador.current?.focus()} />
      ) : null}
    </div>
  )
}

function HistorialMovimientos({ gestionAlmacenes }: { gestionAlmacenes: ReturnType<typeof useAlmacenes> }) {
  const [busquedaMovimientos, setBusquedaMovimientos] = useState('')
  const busquedaMovimientosDebounced = useDebounceInventario(busquedaMovimientos)
  const [paginaMovimientos, setPaginaMovimientos] = useState(1)
  const [tamanioMovimientos, setTamanioMovimientos] = useState<TamanioPaginaInventario>(25)
  const [tipoMovimiento, setTipoMovimiento] = useState<MovimientoInventario['tipo'] | ''>('')
  const [almacenMovimientos, setAlmacenMovimientos] = useState('')
  const [fechaMovimientosDesde, setFechaMovimientosDesde] = useState('')
  const [fechaMovimientosHasta, setFechaMovimientosHasta] = useState('')
  const inventario = useInventario({ movimientos: {
    pagina: paginaMovimientos, tamanioPagina: tamanioMovimientos, busqueda: busquedaMovimientosDebounced,
    almacenId: almacenMovimientos, tipo: tipoMovimiento, fechaDesde: fechaMovimientosDesde, fechaHasta: fechaMovimientosHasta, orden: 'fecha-desc',
  } })
  const historial = inventario.movimientos?.elementos ?? []
  return (
      <section aria-labelledby="historial-title" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 md:grid-cols-2 xl:grid-cols-3 xl:items-end">
          <div>
            <h2 id="historial-title" className="text-lg font-semibold">
              Historial de movimientos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {inventario.movimientos?.total ?? 0} movimientos persistentes
            </p>
          </div>
          <label className="field-label">
            Buscar
            <input
              type="search"
              value={busquedaMovimientos}
              onChange={(evento) => {
                setBusquedaMovimientos(evento.target.value)
                setPaginaMovimientos(1)
              }}
              className="field-control"
              placeholder="Producto, código o lote"
            />
          </label>
          <label className="field-label">
            Tipo
            <select
              value={tipoMovimiento}
              onChange={(evento) => {
                setTipoMovimiento(evento.target.value as MovimientoInventario['tipo'] | '')
                setPaginaMovimientos(1)
              }}
              className="field-control"
            >
              <option value="">Todos</option>
              {tiposMovimientoInventario.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>{tipo.etiqueta}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Almacén
            <select
              value={almacenMovimientos}
              onChange={(evento) => {
                setAlmacenMovimientos(evento.target.value)
                setPaginaMovimientos(1)
              }}
              className="field-control"
            >
              <option value="">Todos</option>
              {gestionAlmacenes.almacenes.map((almacen) => (
                <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field-label">
              Desde
              <input
                type="date"
                value={fechaMovimientosDesde}
                onChange={(evento) => {
                  setFechaMovimientosDesde(evento.target.value)
                  setPaginaMovimientos(1)
                }}
                className="field-control"
              />
            </label>
            <label className="field-label">
              Hasta
              <input
                type="date"
                value={fechaMovimientosHasta}
                onChange={(evento) => {
                  setFechaMovimientosHasta(evento.target.value)
                  setPaginaMovimientos(1)
                }}
                className="field-control"
              />
            </label>
          </div>
        </div>
        <EstadoListadoInventario
          cargando={inventario.cargandoMovimientos}
          error={inventario.errorMovimientos}
          vacio={!historial.length}
          mensajeVacio="No hay movimientos que coincidan con los filtros activos."
          alReintentar={() => void inventario.reintentarMovimientos()}
        >
          <div className="divide-y">
            {historial.map((movimiento) => (
              <MovimientoFila key={movimiento.id} movimiento={movimiento} />
            ))}
          </div>
        </EstadoListadoInventario>
        {inventario.movimientos && !inventario.errorMovimientos ? (
          <PaginacionInventario
            etiqueta="movimientos"
            pagina={paginaMovimientos}
            tamanioPagina={tamanioMovimientos}
            total={inventario.movimientos.total}
            totalPaginas={inventario.movimientos.totalPaginas}
            cantidadVisible={historial.length}
            cargando={inventario.actualizandoMovimientos}
            alCambiarPagina={setPaginaMovimientos}
            alCambiarTamanio={(tamanio) => {
              setTamanioMovimientos(tamanio)
              setPaginaMovimientos(1)
            }}
          />
        ) : null}
      </section>


  )
}
