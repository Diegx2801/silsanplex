import { ChevronDown, MapPin, Pencil, Plus, Power, RotateCcw, Search, Warehouse } from 'lucide-react'
import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { DialogoAlmacen } from '@/modulos/inventario/componentes/DialogoAlmacen'
import { DialogoEstadoMaestroAlmacen, type ObjetivoEstado } from '@/modulos/inventario/componentes/DialogoEstadoMaestroAlmacen'
import { DialogoUbicacionAlmacen } from '@/modulos/inventario/componentes/DialogoUbicacionAlmacen'
import type { Almacen, DatosAlmacen, DatosUbicacion, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'

interface Props {
  almacenes: Almacen[]
  ubicaciones: UbicacionAlmacen[]
  puedeGestionar: boolean
  cargando: boolean
  error: string
  alReintentar: () => Promise<void>
  alGuardarAlmacen: (datos: DatosAlmacen, almacen?: Almacen) => Promise<string | undefined>
  alGuardarUbicacion: (datos: DatosUbicacion, ubicacion?: UbicacionAlmacen) => Promise<string | undefined>
  alCambiarEstadoAlmacen: (almacen: Almacen) => Promise<string | undefined>
  alCambiarEstadoUbicacion: (ubicacion: UbicacionAlmacen) => Promise<string | undefined>
}

type FiltroEstado = 'activos' | 'inactivos' | 'todos'

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es-PE').trim()
}

export function DirectorioAlmacenes({
  almacenes, ubicaciones, puedeGestionar, cargando, error, alReintentar,
  alGuardarAlmacen, alGuardarUbicacion, alCambiarEstadoAlmacen, alCambiarEstadoUbicacion,
}: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('activos')
  const [almacenesAbiertos, setAlmacenesAbiertos] = useState<Set<string>>(() => new Set())
  const [mensaje, setMensaje] = useState('')
  const [dialogoAlmacen, setDialogoAlmacen] = useState<{ almacen: Almacen | null } | null>(null)
  const [dialogoUbicacion, setDialogoUbicacion] = useState<{ ubicacion: UbicacionAlmacen | null; almacenId: string } | null>(null)
  const [objetivoEstado, setObjetivoEstado] = useState<ObjetivoEstado | null>(null)
  const disparadorActual = useRef<HTMLButtonElement | null>(null)
  const termino = normalizar(busqueda)

  const ubicacionesPorAlmacen = useMemo(() => {
    const indice = new Map<string, UbicacionAlmacen[]>()
    ubicaciones.forEach((ubicacion) => {
      const grupo = indice.get(ubicacion.almacenId) ?? []
      grupo.push(ubicacion)
      indice.set(ubicacion.almacenId, grupo)
    })
    return indice
  }, [ubicaciones])

  const almacenesFiltrados = useMemo(() => almacenes.filter((almacen) => {
    const coincideEstado = estado === 'todos' || (estado === 'activos' ? almacen.activo : !almacen.activo)
    const coincideTexto = !termino
      || normalizar(`${almacen.codigo} ${almacen.nombre} ${almacen.direccion}`).includes(termino)
      || (ubicacionesPorAlmacen.get(almacen.id) ?? []).some((ubicacion) => normalizar(
        `${ubicacion.codigo} ${ubicacion.nombre} ${ubicacion.descripcion}`,
      ).includes(termino))
    return coincideEstado && coincideTexto
  }), [almacenes, estado, termino, ubicacionesPorAlmacen])

  const filtrosActivos = Boolean(busqueda || estado !== 'activos')

  function conservarDisparador(evento: MouseEvent<HTMLButtonElement>) {
    disparadorActual.current = evento.currentTarget
  }

  function limpiarFiltros() {
    setBusqueda('')
    setEstado('activos')
  }

  function alternarAlmacen(almacenId: string) {
    setAlmacenesAbiertos((actuales) => {
      const siguientes = new Set(actuales)
      if (siguientes.has(almacenId)) siguientes.delete(almacenId)
      else siguientes.add(almacenId)
      return siguientes
    })
  }

  function coincideUbicacion(almacenId: string) {
    return Boolean(termino) && (ubicacionesPorAlmacen.get(almacenId) ?? []).some((ubicacion) => normalizar(
      `${ubicacion.codigo} ${ubicacion.nombre} ${ubicacion.descripcion}`,
    ).includes(termino))
  }

  async function guardarAlmacen(datos: DatosAlmacen, almacen?: Almacen) {
    const resultado = await alGuardarAlmacen(datos, almacen)
    if (!resultado) setMensaje(almacen ? 'Almacén actualizado correctamente.' : 'Almacén registrado con su ubicación GENERAL.')
    return resultado
  }

  async function guardarUbicacion(datos: DatosUbicacion, ubicacion?: UbicacionAlmacen) {
    const resultado = await alGuardarUbicacion(datos, ubicacion)
    if (!resultado) {
      setMensaje(ubicacion ? 'Ubicación actualizada correctamente.' : 'Ubicación registrada correctamente.')
      setAlmacenesAbiertos((actuales) => new Set(actuales).add(datos.almacenId))
    }
    return resultado
  }

  async function cambiarEstado() {
    if (!objetivoEstado) return 'No se encontró el registro seleccionado.'
    const resultado = objetivoEstado.tipo === 'almacen'
      ? await alCambiarEstadoAlmacen(objetivoEstado.registro)
      : await alCambiarEstadoUbicacion(objetivoEstado.registro)
    if (!resultado) {
      const estabaActivo = objetivoEstado.tipo === 'almacen' ? objetivoEstado.registro.activo : objetivoEstado.registro.activa
      setMensaje(`${objetivoEstado.tipo === 'almacen' ? 'Almacén' : 'Ubicación'} ${estabaActivo ? 'desactivado' : 'activado'} correctamente.`)
    }
    return resultado
  }

  return (
    <section aria-labelledby="directorio-almacenes-title" className="ledger-sheet">
      <div className="flex flex-col gap-4 border-b px-5 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-primary">Inventario · estructura física</p>
          <h1 id="directorio-almacenes-title" className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Almacenes y ubicaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">Administra almacenes y sus zonas internas desde un solo lugar.</p>
        </div>
        {puedeGestionar ? (
          <Button type="button" onClick={(evento) => { conservarDisparador(evento); setDialogoAlmacen({ almacen: null }) }}>
            <Plus aria-hidden="true" /> Registrar almacén
          </Button>
        ) : null}
      </div>

      {mensaje ? <p role="status" aria-live="polite" className="border-b bg-accent/45 px-5 py-3 text-sm text-primary sm:px-6">{mensaje}</p> : null}

      <div className="flex flex-col gap-4 border-b bg-muted/15 px-5 py-4 sm:px-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_auto] lg:items-end">
          <label>
            <span className="field-label">Buscar</span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input type="search" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} className="field-control ps-9" placeholder="Almacén, dirección o ubicación" />
            </span>
          </label>
          <label>
            <span className="field-label">Estado del almacén</span>
            <select value={estado} onChange={(evento) => setEstado(evento.target.value as FiltroEstado)} className="field-control">
              <option value="activos">Activos</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option>
            </select>
          </label>
          <Button type="button" variant="ghost" disabled={!filtrosActivos} onClick={limpiarFiltros}><RotateCcw aria-hidden="true" /> Limpiar filtros</Button>
        </div>
        <p className="text-sm text-muted-foreground">{almacenesFiltrados.length} de {almacenes.length} almacenes visibles</p>
      </div>

      {cargando ? (
        <EstadoDirectorio icono={<Warehouse className="size-7" />} titulo="Cargando estructura física" descripcion="Consultando almacenes y ubicaciones de tu organización." />
      ) : error ? (
        <EstadoDirectorio icono={<Warehouse className="size-7" />} titulo="No se pudo cargar el directorio" descripcion={error}>
          <Button type="button" size="sm" variant="outline" onClick={() => void alReintentar()}>Reintentar</Button>
        </EstadoDirectorio>
      ) : almacenesFiltrados.length === 0 ? (
        <EstadoDirectorio icono={<Warehouse className="size-7" />} titulo={filtrosActivos ? 'No hay coincidencias' : 'Aún no hay almacenes'} descripcion={filtrosActivos ? 'Ajusta o limpia los filtros para ver otros almacenes.' : 'Registra el primer almacén para habilitar la estructura física.'} />
      ) : (
        <div className="divide-y">
          {almacenesFiltrados.map((almacen) => {
            const ubicacionesDelAlmacen = ubicacionesPorAlmacen.get(almacen.id) ?? []
            const abierto = almacenesAbiertos.has(almacen.id) || coincideUbicacion(almacen.id)
            const panelId = `ubicaciones-almacen-${almacen.id}`
            return (
              <article key={almacen.id}>
                <div className="grid gap-3 px-5 py-4 sm:px-6 md:grid-cols-[minmax(15rem,1.3fr)_minmax(12rem,1fr)_auto_auto_auto] md:items-center">
                  <div><p className="font-semibold">{almacen.nombre}</p><p className="mt-1 font-mono text-xs text-primary">{almacen.codigo}</p></div>
                  <p className="text-sm text-muted-foreground">{almacen.direccion || 'Sin dirección registrada'}</p>
                  <Estado activo={almacen.activo} />
                  <span className="text-sm text-muted-foreground">{ubicacionesDelAlmacen.length} {ubicacionesDelAlmacen.length === 1 ? 'ubicación' : 'ubicaciones'}</span>
                  <div className="flex items-center justify-end gap-1">
                    {puedeGestionar ? (
                      <Acciones nombre={almacen.nombre} activo={almacen.activo} alEditar={(evento) => { conservarDisparador(evento); setDialogoAlmacen({ almacen }) }} alCambiarEstado={(evento) => { conservarDisparador(evento); setObjetivoEstado({ tipo: 'almacen', registro: almacen }) }} />
                    ) : null}
                    <Button type="button" variant="ghost" size="icon" aria-expanded={abierto} aria-controls={panelId} aria-label={`${abierto ? 'Ocultar' : 'Mostrar'} ubicaciones de ${almacen.nombre}`} title={`${abierto ? 'Ocultar' : 'Mostrar'} ubicaciones`} onClick={() => alternarAlmacen(almacen.id)}>
                      <ChevronDown aria-hidden="true" className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
                    </Button>
                  </div>
                </div>
                {abierto ? (
                  <div id={panelId} className="border-t bg-muted/15 px-5 py-4 sm:px-6">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><h2 className="font-semibold">Ubicaciones internas</h2><p className="mt-1 text-xs text-muted-foreground">Pasillos, zonas o anaqueles pertenecientes a este almacén.</p></div>
                      {puedeGestionar ? (
                        <Button type="button" size="sm" variant="outline" onClick={(evento) => { conservarDisparador(evento); setDialogoUbicacion({ ubicacion: null, almacenId: almacen.id }) }}>
                          <MapPin aria-hidden="true" /> Registrar ubicación
                        </Button>
                      ) : null}
                    </div>
                    {ubicacionesDelAlmacen.length ? (
                      <ul className="divide-y border" aria-label={`Ubicaciones de ${almacen.nombre}`}>
                        {ubicacionesDelAlmacen.map((ubicacion) => (
                          <li key={ubicacion.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1.2fr)_auto_auto] md:items-center">
                            <div><p className="font-medium">{ubicacion.nombre}</p><p className="mt-1 font-mono text-xs text-primary">{ubicacion.codigo}</p></div>
                            <p className="text-sm text-muted-foreground">{ubicacion.descripcion || 'Sin descripción'}</p>
                            <Estado activo={ubicacion.activa} />
                            {puedeGestionar ? (
                              <Acciones nombre={`${ubicacion.nombre} de ${almacen.nombre}`} activo={ubicacion.activa} alEditar={(evento) => { conservarDisparador(evento); setDialogoUbicacion({ ubicacion, almacenId: almacen.id }) }} alCambiarEstado={(evento) => { conservarDisparador(evento); setObjetivoEstado({ tipo: 'ubicacion', registro: ubicacion, almacenNombre: almacen.nombre }) }} />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Este almacén aún no tiene ubicaciones registradas.</p>}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}

      {dialogoAlmacen ? <DialogoAlmacen abierto almacen={dialogoAlmacen.almacen} alCambiarApertura={(abierto) => { if (!abierto) setDialogoAlmacen(null) }} alGuardar={guardarAlmacen} alRestaurarFoco={() => disparadorActual.current?.focus()} /> : null}
      {dialogoUbicacion ? <DialogoUbicacionAlmacen abierto ubicacion={dialogoUbicacion.ubicacion} almacenes={almacenes} almacenInicialId={dialogoUbicacion.almacenId} bloquearAlmacen={!dialogoUbicacion.ubicacion} alCambiarApertura={(abierto) => { if (!abierto) setDialogoUbicacion(null) }} alGuardar={guardarUbicacion} alRestaurarFoco={() => disparadorActual.current?.focus()} /> : null}
      {objetivoEstado ? <DialogoEstadoMaestroAlmacen key={`${objetivoEstado.tipo}-${objetivoEstado.registro.id}-${objetivoEstado.tipo === 'almacen' ? objetivoEstado.registro.activo : objetivoEstado.registro.activa}`} objetivo={objetivoEstado} alConfirmar={cambiarEstado} alCancelar={() => setObjetivoEstado(null)} alRestaurarFoco={() => disparadorActual.current?.focus()} /> : null}
    </section>
  )
}

function Acciones({ nombre, activo, alEditar, alCambiarEstado }: { nombre: string; activo: boolean; alEditar: (evento: MouseEvent<HTMLButtonElement>) => void; alCambiarEstado: (evento: MouseEvent<HTMLButtonElement>) => void }) {
  return <div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon" title="Editar" aria-label={`Editar ${nombre}`} onClick={alEditar}><Pencil aria-hidden="true" /></Button><Button type="button" variant="ghost" size="icon" title={activo ? 'Desactivar' : 'Activar'} aria-label={`${activo ? 'Desactivar' : 'Activar'} ${nombre}`} onClick={alCambiarEstado}><Power aria-hidden="true" /></Button></div>
}

function Estado({ activo }: { activo: boolean }) {
  return <span className="status-label w-fit" data-tone={activo ? 'listo' : 'revision'}>{activo ? 'Activo' : 'Inactivo'}</span>
}

function EstadoDirectorio({ icono, titulo, descripcion, children }: { icono: ReactNode; titulo: string; descripcion: string; children?: ReactNode }) {
  return <div className="grid min-h-52 place-items-center px-5 py-10 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">{icono}</span><h3 className="mt-4 font-semibold">{titulo}</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{descripcion}</p>{children ? <div className="mt-4">{children}</div> : null}</div></div>
}
