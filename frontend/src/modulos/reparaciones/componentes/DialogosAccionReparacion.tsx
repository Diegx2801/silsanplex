import { zodResolver } from '@hookform/resolvers/zod'
import { Search, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useDeferredValue, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { useTecnicosReparacion } from '@/modulos/reparaciones/estado/useReparacionOpciones'
import {
  esquemaCambioEstado,
  esquemaObservacionReparacion,
  etiquetasEstadoReparacion,
  obtenerTransicionesGenericas,
  type DatosCambioEstado,
  type DatosObservacionReparacion,
  type EstadoReparacion,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

interface DialogoObservacionProps {
  abierto: boolean
  titulo: string
  descripcion: string
  etiquetaAccion: string
  variante?: 'default' | 'destructive'
  observacionObligatoria?: boolean
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosObservacionReparacion) => Promise<string | undefined>
}

export function DialogoObservacion({
  abierto,
  titulo,
  descripcion,
  etiquetaAccion,
  variante = 'default',
  observacionObligatoria = false,
  alCambiarApertura,
  alGuardar,
}: DialogoObservacionProps) {
  const [mensaje, setMensaje] = useState('')
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DatosObservacionReparacion>({
    resolver: zodResolver(esquemaObservacionReparacion),
    defaultValues: { observacion: '' },
  })

  useEffect(() => {
    if (abierto) reset({ observacion: '' })
  }, [abierto, reset])

  const guardar = async (datos: DatosObservacionReparacion) => {
    if (observacionObligatoria && !datos.observacion.trim()) {
      setError('observacion', { message: 'Indica el motivo de esta acción' })
      return
    }
    setMensaje('')
    const error = await alGuardar(datos)
    if (error) {
      setMensaje(error)
      return
    }
    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-foreground/30" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div><DialogPrimitive.Title className="text-xl font-semibold">{titulo}</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">{descripcion}</DialogPrimitive.Description></div>
            <DialogPrimitive.Close asChild><button type="button" aria-label={`Cerrar ${titulo.toLocaleLowerCase('es-PE')}`} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </header>
          <form id="formulario-observacion-reparacion" className="px-5 py-6 sm:px-7" onSubmit={handleSubmit(guardar)}>
            <label htmlFor="observacion-reparacion" className="field-label">Observación {observacionObligatoria ? '*' : '(opcional)'}</label>
            <textarea id="observacion-reparacion" rows={4} className="field-control min-h-24 resize-y py-2" placeholder="Motivo o confirmación de la acción" aria-invalid={Boolean(errors.observacion)} {...register('observacion')} />
            {errors.observacion ? <p className="field-error">{errors.observacion.message}</p> : null}
          </form>
          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-7">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline">Cancelar</Button></DialogPrimitive.Close>
            <Button type="submit" form="formulario-observacion-reparacion" variant={variante} disabled={isSubmitting}>{etiquetaAccion}</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface DialogoCambioEstadoProps {
  abierto: boolean
  reparacion: Reparacion
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (estado: EstadoReparacion, observacion: string) => Promise<string | undefined>
}

export function DialogoCambioEstado({
  abierto,
  reparacion,
  alCambiarApertura,
  alGuardar,
}: DialogoCambioEstadoProps) {
  const opciones = obtenerTransicionesGenericas(reparacion.estado)
  const [mensaje, setMensaje] = useState('')
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DatosCambioEstado>({
    resolver: zodResolver(esquemaCambioEstado),
    defaultValues: { estado: opciones[0] ?? '', observacion: '' },
  })

  useEffect(() => {
    if (abierto) reset({ estado: opciones[0] ?? '', observacion: '' })
  }, [abierto, opciones, reset])

  const guardar = async (datos: DatosCambioEstado) => {
    if (!opciones.includes(datos.estado as EstadoReparacion)) {
      setError('estado', { message: 'El estado ya no está disponible para este flujo' })
      return
    }
    setMensaje('')
    const error = await alGuardar(datos.estado as EstadoReparacion, datos.observacion)
    if (error) {
      setMensaje(error)
      return
    }
    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-foreground/30" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div><DialogPrimitive.Title className="text-xl font-semibold">Cambiar estado</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">{reparacion.codigo} · Estado actual: {etiquetasEstadoReparacion[reparacion.estado]}</DialogPrimitive.Description></div>
            <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar cambio de estado" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </header>
          <form id="formulario-cambio-estado" className="grid gap-5 px-5 py-6 sm:px-7" onSubmit={handleSubmit(guardar)}>
            <div>
              <label htmlFor="estado-destino-reparacion" className="field-label">Nuevo estado *</label>
              <select id="estado-destino-reparacion" className="field-control" aria-invalid={Boolean(errors.estado)} {...register('estado')}>
                {opciones.map((estado) => <option key={estado} value={estado}>{etiquetasEstadoReparacion[estado]}</option>)}
              </select>
              {errors.estado ? <p className="field-error">{errors.estado.message}</p> : null}
            </div>
            <div>
              <label htmlFor="estado-observacion-reparacion" className="field-label">Observación (opcional)</label>
              <textarea id="estado-observacion-reparacion" rows={3} className="field-control resize-y py-2" placeholder="Qué ocurrió o qué debe saber el siguiente responsable" aria-invalid={Boolean(errors.observacion)} {...register('observacion')} />
              {errors.observacion ? <p className="field-error">{errors.observacion.message}</p> : null}
            </div>
          </form>
          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-7">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline">Cancelar</Button></DialogPrimitive.Close>
            <Button type="submit" form="formulario-cambio-estado" disabled={isSubmitting || !opciones.length}>Cambiar estado</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface DialogoAsignacionProps {
  abierto: boolean
  reparacion: Reparacion
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (tecnicoId: string) => Promise<string | undefined>
}

export function DialogoAsignacion({
  abierto,
  reparacion,
  alCambiarApertura,
  alGuardar,
}: DialogoAsignacionProps) {
  const [busqueda, setBusqueda] = useState('')
  const busquedaDiferida = useDeferredValue(busqueda)
  const [tecnicoId, setTecnicoId] = useState(reparacion.tecnicoAsignadoId ?? '')
  const [mensaje, setMensaje] = useState('')
  const { tecnicos, cargando, error } = useTecnicosReparacion(abierto, busquedaDiferida)

  useEffect(() => {
    if (abierto) setTecnicoId(reparacion.tecnicoAsignadoId ?? '')
  }, [abierto, reparacion.tecnicoAsignadoId])

  const guardar = async () => {
    if (!tecnicoId) {
      setMensaje('Selecciona un técnico activo.')
      return
    }
    setMensaje('')
    const errorGuardar = await alGuardar(tecnicoId)
    if (errorGuardar) {
      setMensaje(errorGuardar)
      return
    }
    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-foreground/30" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div><DialogPrimitive.Title className="text-xl font-semibold">Asignar técnico</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">La búsqueda solo muestra miembros activos de tu organización.</DialogPrimitive.Description></div>
            <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar asignación" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </header>
          <div className="space-y-5 px-5 py-6 sm:px-7">
            <div>
              <label htmlFor="buscar-tecnico-reparacion" className="field-label">Buscar técnico</label>
              <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id="buscar-tecnico-reparacion" className="field-control ps-9" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Nombre o correo" /></div>
            </div>
            <div>
              <label htmlFor="tecnico-reparacion" className="field-label">Técnico *</label>
              <select id="tecnico-reparacion" className="field-control" value={tecnicoId} onChange={(evento) => setTecnicoId(evento.target.value)} disabled={cargando}>
                <option value="">{cargando ? 'Cargando técnicos…' : 'Selecciona un técnico'}</option>
                {tecnicos.map((tecnico) => <option key={tecnico.id} value={tecnico.id}>{tecnico.nombre} · {tecnico.correo}</option>)}
                {reparacion.tecnicoAsignadoId && !tecnicos.some((tecnico) => tecnico.id === reparacion.tecnicoAsignadoId) ? <option value={reparacion.tecnicoAsignadoId}>Técnico actualmente asignado</option> : null}
              </select>
              {error ? <p className="field-error">{error instanceof Error ? error.message : 'No se pudo cargar la lista de técnicos'}</p> : null}
            </div>
            {mensaje ? <p role="alert" className="text-sm text-destructive">{mensaje}</p> : null}
          </div>
          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline">Cancelar</Button></DialogPrimitive.Close>
            <Button type="button" onClick={() => void guardar()} disabled={cargando}>Guardar asignación</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
