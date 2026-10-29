import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Paperclip } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import {
  adjuntarArchivoReparacion,
  listarAdjuntosReparacion,
  obtenerDescargaAdjuntoReparacion,
  validarAdjuntoReparacion,
} from '../servicios/adjuntosReparacionService'

interface AdjuntosReparacionProps {
  reparacionId: string
  puedeAdjuntar: boolean
}

export function AdjuntosReparacion({ reparacionId, puedeAdjuntar }: AdjuntosReparacionProps) {
  const { access, user } = useAuth()
  const organizacionId = access?.organizationId ?? ''
  return <ContenidoAdjuntos key={`${organizacionId}:${reparacionId}:${user?.id ?? ''}`} reparacionId={reparacionId} puedeAdjuntar={puedeAdjuntar} organizacionId={organizacionId} usuarioId={user?.id ?? ''} />
}

function ContenidoAdjuntos({ reparacionId, puedeAdjuntar, organizacionId, usuarioId }: AdjuntosReparacionProps & { organizacionId: string; usuarioId: string }) {
  const queryClient = useQueryClient()
  const inputId = useId()
  const archivoInput = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [errorArchivo, setErrorArchivo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [abierto, setAbierto] = useState(false)
  const consultaKey = ['repair-attachments', organizacionId, reparacionId, usuarioId] as const
  const consulta = useQuery({
    queryKey: consultaKey,
    queryFn: () => listarAdjuntosReparacion(organizacionId, reparacionId),
    enabled: Boolean(abierto && organizacionId && reparacionId && usuarioId),
  })
  const carga = useMutation({
    mutationFn: async (seleccionado: File) => {
      if (!usuarioId || !organizacionId || !puedeAdjuntar) throw new Error('No tienes permiso para adjuntar archivos.')
      return adjuntarArchivoReparacion(organizacionId, reparacionId, usuarioId, seleccionado)
    },
    onSuccess: async () => {
      setArchivo(null)
      if (archivoInput.current) archivoInput.current.value = ''
      setMensaje('Archivo adjuntado.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: consultaKey }),
        queryClient.invalidateQueries({ queryKey: ['repair-detail', organizacionId, reparacionId] }),
        queryClient.invalidateQueries({ queryKey: ['repairs', organizacionId] }),
      ])
    },
  })
  const descarga = useMutation({
    mutationFn: (id: string) => obtenerDescargaAdjuntoReparacion(organizacionId, reparacionId, id),
    onSuccess: (url) => {
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.rel = 'noreferrer'
      enlace.download = ''
      document.body.append(enlace)
      enlace.click()
      enlace.remove()
    },
  })

  return (
    <details className="border-t border-border px-5 py-5 sm:px-7" onToggle={(event) => setAbierto(event.currentTarget.open)}>
      <summary className="cursor-pointer text-base font-semibold focus-visible:outline-2 focus-visible:outline-ring">Archivos de la reparación</summary>
      {abierto && <div className="space-y-3 pt-4">
      {puedeAdjuntar && (
        <div className="space-y-2">
          <label htmlFor={inputId} className="text-sm font-medium">Foto o documento</label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={archivoInput}
              id={inputId}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={carga.isPending}
              aria-describedby={`${inputId}-ayuda${errorArchivo ? ` ${inputId}-error` : ''}`}
              aria-invalid={Boolean(errorArchivo)}
              className="min-w-0 max-w-full flex-1 text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-sm focus-visible:outline-2 focus-visible:outline-ring"
              onChange={(event) => {
                setErrorArchivo('')
                setMensaje('')
                carga.reset()
                const seleccionado = event.target.files?.[0] ?? null
                try {
                  if (seleccionado) validarAdjuntoReparacion(seleccionado)
                  setArchivo(seleccionado)
                } catch (error) {
                  setArchivo(null)
                  setErrorArchivo(error instanceof Error ? error.message : 'Selecciona un archivo válido.')
                }
              }}
            />
            <Button type="button" variant="outline" disabled={!archivo || carga.isPending} onClick={() => archivo && carga.mutate(archivo)}>
              <Paperclip aria-hidden="true" className="size-4" />
              {carga.isPending ? 'Adjuntando…' : 'Adjuntar'}
            </Button>
          </div>
          <p id={`${inputId}-ayuda`} className="text-xs text-muted-foreground">PDF, JPG, PNG o WEBP; máximo 5 MB. Solo visible para usuarios autorizados.</p>
          {errorArchivo && <p id={`${inputId}-error`} className="text-sm text-destructive" role="alert">{errorArchivo}</p>}
        </div>
      )}
      {consulta.isPending && <p className="text-sm text-muted-foreground" role="status">Cargando archivos…</p>}
      {consulta.isError && (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-destructive">No se pudieron cargar los archivos.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void consulta.refetch()}>Reintentar</Button>
        </div>
      )}
      {consulta.isSuccess && consulta.data.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay archivos adjuntos.</p>}
      {consulta.data && consulta.data.length > 0 && (
        <ul className="divide-y divide-border">
          {consulta.data.map((adjunto) => (
            <li key={adjunto.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm">{adjunto.nombre}</p>
                <p className="text-xs text-muted-foreground">{Math.max(1, Math.ceil(adjunto.bytes / 1024))} KB · {new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeZone: 'America/Lima' }).format(new Date(adjunto.creadoEn))}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={descarga.isPending} aria-label={`Descargar ${adjunto.nombre}`} onClick={() => descarga.mutate(adjunto.id)}>
                <Download aria-hidden="true" className="size-4" /> Descargar
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(carga.isError || descarga.isError) && <p className="text-sm text-destructive" role="alert">{(carga.error ?? descarga.error)?.message}</p>}
      {mensaje && <p className="text-sm text-muted-foreground" role="status">{mensaje}</p>}
      </div>}
    </details>
  )
}
