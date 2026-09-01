import {
  ClipboardList,
  Clock3,
  LoaderCircle,
  PackageCheck,
  Plus,
  SearchCheck,
  Wrench,
} from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { DetalleReparacion } from '@/modulos/reparaciones/componentes/DetalleReparacion'
import { DialogoReparacion } from '@/modulos/reparaciones/componentes/DialogoReparacion'
import { FiltrosReparaciones } from '@/modulos/reparaciones/componentes/FiltrosReparaciones'
import { PaginacionReparaciones } from '@/modulos/reparaciones/componentes/PaginacionReparaciones'
import { useReparacionDetalle } from '@/modulos/reparaciones/estado/useReparacionDetalle'
import { useReparacionOpciones } from '@/modulos/reparaciones/estado/useReparacionOpciones'
import { useReparaciones } from '@/modulos/reparaciones/estado/useReparaciones'
import type {
  ConsultaReparaciones,
  FiltroEstadoReparacion,
  FiltroPrioridadReparacion,
} from '@/modulos/reparaciones/modelo/consultaReparaciones'
import {
  etiquetasEstadoReparacion,
  identidadReparacionEsEditable,
  prioridadesReparacion,
  tonosEstadoReparacion,
  type DatosCotizacion,
  type DatosDiagnostico,
  type DatosObservacionReparacion,
  type DatosPrueba,
  type DatosReparacion,
  type DatosReservaParte,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

const tamanioPagina = 10
const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
const formatoFechaHora = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function fechaDia(valor: string) {
  if (!valor) return 'Sin fecha'
  return formatoFecha.format(new Date(`${valor}T12:00:00`))
}

function fechaHora(valor: string) {
  return formatoFechaHora.format(new Date(valor))
}

function tonoEstado(estado: Reparacion['estado']) {
  const tono = tonosEstadoReparacion[estado]
  return tono === 'listo' ? 'listo' : tono === 'pendiente' || tono === 'espera' ? 'pendiente' : 'revision'
}

function prioridadLabel(prioridad: Reparacion['prioridad']) {
  return prioridadesReparacion.find((item) => item.valor === prioridad)?.etiqueta ?? prioridad
}

function ResumenReparaciones({
  total,
  abiertas,
  esperandoAprobacion,
  listasParaEntrega,
}: {
  total: number
  abiertas: number
  esperandoAprobacion: number
  listasParaEntrega: number
}) {
  const metricas = [
    { etiqueta: 'Total registradas', valor: total, icono: ClipboardList },
    { etiqueta: 'Órdenes abiertas', valor: abiertas, icono: Wrench },
    { etiqueta: 'Esperando aprobación', valor: esperandoAprobacion, icono: Clock3 },
    { etiqueta: 'Listas para entrega', valor: listasParaEntrega, icono: PackageCheck },
  ] as const

  return (
    <section aria-label="Resumen de reparaciones" className="ledger-sheet">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4">
        {metricas.map((metrica) => {
          const Icono = metrica.icono
          return (
            <article key={metrica.etiqueta} className="border-b px-5 py-5 last:border-b-0 sm:border-e sm:[&:nth-child(2)]:border-e-0 xl:border-b-0 xl:[&:nth-child(2)]:border-e xl:last:border-e-0">
              <div className="flex items-center justify-between gap-3"><p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">{metrica.etiqueta}</p><Icono aria-hidden="true" className="size-4 text-primary" /></div>
              <p className="mt-3 font-mono text-2xl font-semibold tabular-nums">{metrica.valor}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function EtiquetaEstado({ estado }: { estado: Reparacion['estado'] }) {
  return <span className="status-label" data-tone={tonoEstado(estado)}>{etiquetasEstadoReparacion[estado]}</span>
}

function TarjetaReparacion({
  reparacion,
  alVer,
}: {
  reparacion: Reparacion
  alVer: (evento: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <article className="px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><p className="font-mono text-xs font-medium text-primary">{reparacion.codigo}</p><h3 className="mt-1 line-clamp-2 font-semibold">{reparacion.productoDescripcionSnapshot}</h3><p className="mt-1 truncate text-sm text-muted-foreground">{reparacion.clienteNombreSnapshot}</p></div>
        <EtiquetaEstado estado={reparacion.estado} />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm">
        <div><dt className="text-xs text-muted-foreground">Serie / código</dt><dd className="mt-1 font-mono text-xs">{reparacion.numeroSerie || reparacion.productoCodigoSnapshot}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Prioridad</dt><dd className="mt-1">{prioridadLabel(reparacion.prioridad)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Recibida</dt><dd className="mt-1">{fechaHora(reparacion.recibidaEn)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Entrega estimada</dt><dd className="mt-1">{fechaDia(reparacion.fechaEntregaEstimada)}</dd></div>
      </dl>
      <Button type="button" variant="secondary" size="lg" className="mt-5 w-full" onClick={alVer}>Ver detalle y flujo</Button>
    </article>
  )
}

function FilaReparacion({
  reparacion,
  alVer,
}: {
  reparacion: Reparacion
  alVer: (evento: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <tr className="hover:bg-muted/35">
      <td className="px-5 py-4 font-mono text-xs font-medium text-primary sm:px-6">{reparacion.codigo}</td>
      <td className="max-w-[18rem] px-4 py-4"><p className="truncate font-medium">{reparacion.productoDescripcionSnapshot}</p><p className="mt-1 truncate text-xs text-muted-foreground">{reparacion.productoCodigoSnapshot} · {reparacion.clienteNombreSnapshot}</p></td>
      <td className="px-4 py-4 text-sm text-muted-foreground">{reparacion.numeroSerie || 'Sin serie'}</td>
      <td className="px-4 py-4"><EtiquetaEstado estado={reparacion.estado} /></td>
      <td className="px-4 py-4"><span className={reparacion.prioridad === 'urgent' ? 'font-semibold text-destructive' : undefined}>{prioridadLabel(reparacion.prioridad)}</span></td>
      <td className="px-4 py-4 text-xs text-muted-foreground">{fechaDia(reparacion.fechaEntregaEstimada)}</td>
      <td className="px-5 py-4 text-end sm:px-6"><Button type="button" variant="ghost" onClick={alVer}>Ver detalle</Button></td>
    </tr>
  )
}

export function ReparacionesPage() {
  const { hasPermission } = useAuth()
  const puedeCrear = hasPermission(PERMISSIONS.REPAIRS_CREATE)
  const puedeEditar = hasPermission(PERMISSIONS.REPAIRS_UPDATE)
  const puedeAsignar = hasPermission(PERMISSIONS.REPAIRS_ASSIGN)
  const puedeCambiarEstado = hasPermission(PERMISSIONS.REPAIRS_CHANGE_STATUS)
  const puedeAprobarCotizacion = hasPermission(PERMISSIONS.REPAIRS_APPROVE_QUOTE)
  const puedeUsarPartes = hasPermission(PERMISSIONS.REPAIRS_USE_PARTS)
  const puedeEntregar = hasPermission(PERMISSIONS.REPAIRS_DELIVER)
  const [busqueda, setBusqueda] = useState('')
  const busquedaDiferida = useDeferredValue(busqueda)
  const [estado, setEstado] = useState<FiltroEstadoReparacion>('todos')
  const [prioridad, setPrioridad] = useState<FiltroPrioridadReparacion>('todas')
  const [pagina, setPagina] = useState(1)
  const [reparacionId, setReparacionId] = useState<string | null>(null)
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [reparacionEnEdicion, setReparacionEnEdicion] = useState<Reparacion | null>(null)
  const [identidadEditableEnEdicion, setIdentidadEditableEnEdicion] = useState(true)
  const [mensaje, setMensaje] = useState('')
  const disparadorDetalle = useRef<HTMLButtonElement | null>(null)
  const disparadorFormulario = useRef<HTMLButtonElement | null>(null)
  const consulta: ConsultaReparaciones = {
    busqueda: busquedaDiferida,
    estado,
    prioridad,
  }
  const filtrosVisuales: ConsultaReparaciones = { ...consulta, busqueda }
  const operaciones = useReparaciones({ consulta, pagina, tamanioPagina })
  const opciones = useReparacionOpciones({
    cargarClientes: puedeCrear,
    cargarProductos: puedeCrear || puedeUsarPartes || puedeEditar,
    cargarAlmacenes: puedeUsarPartes,
  })
  const detalleConsulta = useReparacionDetalle(reparacionId, Boolean(reparacionId))

  const totalPaginas = Math.max(1, Math.ceil(operaciones.totalFiltrado / tamanioPagina))
  const paginaActual = operaciones.cargando ? pagina : Math.min(totalPaginas, Math.max(1, pagina))

  useEffect(() => {
    if (!operaciones.cargando && pagina !== paginaActual) setPagina(paginaActual)
  }, [operaciones.cargando, pagina, paginaActual])

  const cantidadFiltrosActivos = Number(Boolean(busqueda.trim())) + Number(estado !== 'todos') + Number(prioridad !== 'todas')

  const limpiarFiltros = () => {
    setBusqueda('')
    setEstado('todos')
    setPrioridad('todas')
    setPagina(1)
  }

  const abrirRegistro = (evento: ReactMouseEvent<HTMLButtonElement>) => {
    disparadorFormulario.current = evento.currentTarget
    setReparacionEnEdicion(null)
    setIdentidadEditableEnEdicion(true)
    setFormularioAbierto(true)
  }

  const abrirDetalle = (reparacion: Reparacion, evento: ReactMouseEvent<HTMLButtonElement>) => {
    disparadorDetalle.current = evento.currentTarget
    setReparacionId(reparacion.id)
  }

  const abrirEdicionDesdeDetalle = () => {
    const reparacion = detalleConsulta.detalle?.reparacion
    if (!reparacion) return
    disparadorFormulario.current = disparadorDetalle.current
    setReparacionEnEdicion(reparacion)
    setIdentidadEditableEnEdicion(identidadReparacionEsEditable(detalleConsulta.detalle))
    setReparacionId(null)
    setFormularioAbierto(true)
  }

  const guardarReparacion = async (
    datos: DatosReparacion,
    id: string | undefined,
    identidadEditable: boolean,
  ) => {
    const error = id
      ? await operaciones.actualizar(id, datos, identidadEditable)
      : await operaciones.crear(datos)
    if (!error) setMensaje(id ? 'La reparación se actualizó correctamente.' : 'La reparación se registró correctamente.')
    return error
  }

  const detalle = detalleConsulta.detalle
  const mensajeError = operaciones.error instanceof Error ? operaciones.error.message : 'No se pudo cargar el registro de reparaciones.'

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">Servicio técnico</span><h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Gestión de Reparaciones</h1><p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">Controla el ingreso del equipo, diagnóstico, cotización, repuestos, pruebas y entrega con trazabilidad por organización.</p></div>
        {puedeCrear ? <Button type="button" size="lg" onClick={abrirRegistro}><Plus aria-hidden="true" /> Registrar reparación</Button> : null}
      </header>

      <ResumenReparaciones {...operaciones.resumen} />

      <p role="status" aria-live="polite" className={mensaje ? 'border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary' : 'sr-only'}>{mensaje}</p>

      <FiltrosReparaciones
        consulta={filtrosVisuales}
        cantidadActivos={cantidadFiltrosActivos}
        alCambiarBusqueda={(valor) => { setBusqueda(valor); setPagina(1) }}
        alCambiarEstado={(valor) => { setEstado(valor); setPagina(1) }}
        alCambiarPrioridad={(valor) => { setPrioridad(valor); setPagina(1) }}
        alLimpiar={limpiarFiltros}
      />

      <section aria-labelledby="registro-reparaciones-title" className="ledger-sheet">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4 sm:px-6"><div><h2 id="registro-reparaciones-title" className="text-lg font-semibold">Registro de órdenes</h2><p className="mt-1 text-sm text-muted-foreground">{operaciones.reparaciones.length} de {operaciones.totalFiltrado} órdenes visibles</p></div><span className="font-mono text-xs text-muted-foreground">RECIBIDAS MÁS RECIENTES</span></div>
        {operaciones.cargando ? (
          <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 py-14 text-center"><LoaderCircle aria-hidden="true" className="size-8 animate-spin text-primary" /><p className="font-medium">Cargando reparaciones</p><p className="text-sm text-muted-foreground">Consultando las órdenes de tu organización.</p></div>
        ) : operaciones.error ? (
          <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 py-14 text-center"><SearchCheck aria-hidden="true" className="size-8 text-destructive" /><p className="font-medium">No se pudo cargar el registro</p><p className="max-w-md text-sm leading-6 text-muted-foreground">{mensajeError}</p><Button type="button" variant="outline" onClick={() => void operaciones.reintentar()}>Reintentar</Button></div>
        ) : !operaciones.reparaciones.length ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 py-14 text-center"><ClipboardList aria-hidden="true" className="size-8 text-primary" /><p className="mt-4 font-semibold">{operaciones.totalFiltrado ? 'No hay coincidencias' : 'Aún no hay reparaciones registradas'}</p><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{operaciones.totalFiltrado ? 'Prueba con otra búsqueda o cambia los filtros de estado y prioridad.' : 'Registra la primera orden para iniciar su seguimiento operativo.'}</p>{!operaciones.totalFiltrado && puedeCrear ? <Button type="button" className="mt-5" onClick={abrirRegistro}><Plus aria-hidden="true" /> Registrar reparación</Button> : null}</div>
        ) : (
          <>
            <div className="divide-y md:hidden">{operaciones.reparaciones.map((item) => <TarjetaReparacion key={item.id} reparacion={item} alVer={(evento) => abrirDetalle(item, evento)} />)}</div>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[72rem] border-collapse text-left text-sm"><thead><tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase"><th className="px-5 py-3 font-medium sm:px-6">Orden</th><th className="px-4 py-3 font-medium">Equipo / cliente</th><th className="px-4 py-3 font-medium">Serie</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-4 py-3 font-medium">Prioridad</th><th className="px-4 py-3 font-medium">Entrega estimada</th><th className="px-5 py-3 text-end font-medium sm:px-6">Acciones</th></tr></thead><tbody className="divide-y">{operaciones.reparaciones.map((item) => <FilaReparacion key={item.id} reparacion={item} alVer={(evento) => abrirDetalle(item, evento)} />)}</tbody></table></div>
          </>
        )}
        {!operaciones.cargando && !operaciones.error ? <PaginacionReparaciones inicio={operaciones.reparaciones.length ? (paginaActual - 1) * tamanioPagina + 1 : 0} fin={operaciones.reparaciones.length ? (paginaActual - 1) * tamanioPagina + operaciones.reparaciones.length : 0} total={operaciones.totalFiltrado} pagina={paginaActual} totalPaginas={totalPaginas} alCambiarPagina={setPagina} /> : null}
      </section>

      {formularioAbierto && (puedeCrear || (puedeEditar && reparacionEnEdicion)) ? <DialogoReparacion key={reparacionEnEdicion?.id ?? 'nueva-reparacion'} abierto={formularioAbierto} reparacion={reparacionEnEdicion} identidadEditable={identidadEditableEnEdicion} clientes={opciones.clientes} productos={opciones.productos} cargandoOpciones={opciones.cargando} alCambiarApertura={setFormularioAbierto} alGuardar={guardarReparacion} alRestaurarFoco={() => disparadorFormulario.current?.focus()} /> : null}

      {reparacionId ? <DetalleReparacion
        key={reparacionId}
        abierto={Boolean(reparacionId)}
        detalle={detalle}
        cargando={detalleConsulta.cargando}
        error={detalleConsulta.error}
        productos={opciones.productos}
        almacenes={opciones.almacenes}
        ubicaciones={opciones.ubicaciones}
        puedeEditar={puedeEditar}
        puedeAsignar={puedeAsignar}
        puedeCambiarEstado={puedeCambiarEstado}
        puedeAprobarCotizacion={puedeAprobarCotizacion}
        puedeUsarPartes={puedeUsarPartes}
        puedeEntregar={puedeEntregar}
        alCambiarApertura={(abierto) => { if (!abierto) setReparacionId(null) }}
        alRestaurarFoco={() => disparadorDetalle.current?.focus()}
        alEditar={abrirEdicionDesdeDetalle}
        alAsignar={(tecnicoId) => operaciones.asignar(detalle?.reparacion.id ?? '', tecnicoId)}
        alCambiarEstado={(estado, observacion) => operaciones.cambiarEstado(detalle?.reparacion.id ?? '', estado, observacion)}
        alRegistrarDiagnostico={(datos: DatosDiagnostico) => operaciones.registrarDiagnostico(detalle?.reparacion.id ?? '', datos)}
        alRegistrarSolucion={(datos) => operaciones.registrarSolucion(detalle?.reparacion.id ?? '', datos)}
        alGuardarCotizacion={(datos: DatosCotizacion, enviar: boolean) => operaciones.guardarCotizacion(detalle?.reparacion.id ?? '', datos, enviar)}
        alRevisarCotizacion={(cotizacionId: string, datos: DatosCotizacion, enviar: boolean) => operaciones.revisarCotizacion(detalle?.reparacion.id ?? '', cotizacionId, datos, enviar)}
        alAprobarCotizacion={(cotizacionId: string, datos: DatosObservacionReparacion) => operaciones.aprobarCotizacion(detalle?.reparacion.id ?? '', cotizacionId, datos)}
        alRechazarCotizacion={(cotizacionId: string, datos: DatosObservacionReparacion) => operaciones.rechazarCotizacion(detalle?.reparacion.id ?? '', cotizacionId, datos)}
        alReservarParte={(datos: DatosReservaParte) => operaciones.reservarParte(detalle?.reparacion.id ?? '', datos)}
         alConsumirParte={(parteId: string, datos, operationKey) => operaciones.consumirParte(parteId, datos, operationKey)}
        alCancelarParte={(parteId: string, datos: DatosObservacionReparacion) => operaciones.cancelarParte(parteId, datos)}
        alRegistrarPrueba={(datos: DatosPrueba) => operaciones.registrarPrueba(detalle?.reparacion.id ?? '', datos)}
        alEntregar={(datos: DatosObservacionReparacion) => operaciones.entregar(detalle?.reparacion.id ?? '', datos)}
        alCancelar={(datos: DatosObservacionReparacion) => operaciones.cancelar(detalle?.reparacion.id ?? '', datos)}
      /> : null}
    </div>
  )
}
