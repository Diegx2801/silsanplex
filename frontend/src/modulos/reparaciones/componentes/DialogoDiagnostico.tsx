import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  esquemaDatosDiagnostico,
  prioridadesReparacion,
  type DatosDiagnostico,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

interface DialogoDiagnosticoProps {
  abierto: boolean
  reparacion: Reparacion
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosDiagnostico) => Promise<string | undefined>
}

export function DialogoDiagnostico({
  abierto,
  reparacion,
  alCambiarApertura,
  alGuardar,
}: DialogoDiagnosticoProps) {
  const [mensaje, setMensaje] = useState('')
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DatosDiagnostico>({
    resolver: zodResolver(esquemaDatosDiagnostico),
    defaultValues: {
      tecnicoId: reparacion.tecnicoAsignadoId ?? '',
      prioridad: reparacion.prioridad,
      fechaEstimadaEntrega: reparacion.fechaEntregaEstimada ?? '',
      sintomas: '',
      causaEncontrada: '',
      solucionRecomendada: '',
      notas: '',
    },
  })

  useEffect(() => {
    if (abierto) {
      reset({
        tecnicoId: reparacion.tecnicoAsignadoId ?? '',
        prioridad: reparacion.prioridad,
        fechaEstimadaEntrega: reparacion.fechaEntregaEstimada ?? '',
        sintomas: '',
        causaEncontrada: '',
        solucionRecomendada: '',
        notas: '',
      })
    }
  }, [abierto, reparacion.fechaEntregaEstimada, reparacion.prioridad, reparacion.tecnicoAsignadoId, reset])

  const guardar = async (datos: DatosDiagnostico) => {
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
        <DialogPrimitive.Content data-reparaciones-touch-target className="fixed start-1/2 top-1/2 z-[70] max-h-[92svh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold">Registrar diagnóstico</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {reparacion.codigo} · {reparacion.productoDescripcionSnapshot}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="Cerrar diagnóstico" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>
          <form id="formulario-diagnostico" className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7" onSubmit={handleSubmit(guardar)}>
            <section aria-labelledby="diagnostico-planificacion" className="border-b pb-5 sm:col-span-2">
              <h2 id="diagnostico-planificacion" className="text-sm font-semibold">Planificación de atención</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Define la urgencia y una fecha orientativa después de revisar el equipo.
              </p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="diagnostico-prioridad" className="field-label">Prioridad *</label>
                  <select id="diagnostico-prioridad" className="field-control" aria-invalid={Boolean(errors.prioridad)} {...register('prioridad')}>
                    {prioridadesReparacion.map((prioridad) => (
                      <option key={prioridad.valor} value={prioridad.valor}>{prioridad.etiqueta}</option>
                    ))}
                  </select>
                  {errors.prioridad ? <p className="field-error">{errors.prioridad.message}</p> : null}
                </div>
                <div>
                  <label htmlFor="diagnostico-fecha-estimada" className="field-label">Fecha estimada de entrega</label>
                  <input id="diagnostico-fecha-estimada" type="date" className="field-control" aria-invalid={Boolean(errors.fechaEstimadaEntrega)} {...register('fechaEstimadaEntrega')} />
                  {errors.fechaEstimadaEntrega ? <p className="field-error">{errors.fechaEstimadaEntrega.message}</p> : (
                    <p className="field-help">Es una fecha orientativa, no un compromiso de entrega.</p>
                  )}
                </div>
              </div>
            </section>
            <div className="border border-border/70 bg-muted/25 px-4 py-3 sm:col-span-2">
              <p className="field-label">Problema reportado en la recepción</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{reparacion.problema}</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="diagnostico-sintomas" className="field-label">Síntomas observados *</label>
              <textarea id="diagnostico-sintomas" rows={5} className="field-control min-h-28 resize-y py-2" placeholder="Qué se verificó durante la revisión" aria-invalid={Boolean(errors.sintomas)} {...register('sintomas')} />
              {errors.sintomas ? <p className="field-error">{errors.sintomas.message}</p> : null}
            </div>
            <div>
              <label htmlFor="diagnostico-causa" className="field-label">Causa encontrada</label>
              <textarea id="diagnostico-causa" rows={4} className="field-control min-h-24 resize-y py-2" placeholder="Origen probable de la falla" aria-invalid={Boolean(errors.causaEncontrada)} {...register('causaEncontrada')} />
              {errors.causaEncontrada ? <p className="field-error">{errors.causaEncontrada.message}</p> : null}
            </div>
            <div>
              <label htmlFor="diagnostico-solucion" className="field-label">Solución recomendada</label>
              <textarea id="diagnostico-solucion" rows={4} className="field-control min-h-24 resize-y py-2" placeholder="Trabajo o repuesto recomendado" aria-invalid={Boolean(errors.solucionRecomendada)} {...register('solucionRecomendada')} />
              {errors.solucionRecomendada ? <p className="field-error">{errors.solucionRecomendada.message}</p> : null}
            </div>
            <details className="border-t pt-4 sm:col-span-2" open={Boolean(errors.notas) || undefined}>
              <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Detalle adicional del diagnóstico</summary>
              <label htmlFor="diagnostico-notas" className="field-label mt-4">Información complementaria</label>
              <textarea id="diagnostico-notas" rows={3} className="field-control resize-y py-2" placeholder="Observaciones internas" aria-invalid={Boolean(errors.notas)} {...register('notas')} />
              {errors.notas ? <p className="field-error">{errors.notas.message}</p> : null}
            </details>
            <input type="hidden" {...register('tecnicoId')} />
          </form>
          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-7">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline" size="lg">Cancelar</Button></DialogPrimitive.Close>
            <Button type="submit" form="formulario-diagnostico" size="lg" disabled={isSubmitting}>Guardar diagnóstico</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
