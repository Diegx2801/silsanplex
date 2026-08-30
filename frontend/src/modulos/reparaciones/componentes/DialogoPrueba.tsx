import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  esquemaDatosPrueba,
  type DatosPrueba,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

interface DialogoPruebaProps {
  abierto: boolean
  reparacion: Reparacion
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosPrueba) => Promise<string | undefined>
}

export function DialogoPrueba({
  abierto,
  reparacion,
  alCambiarApertura,
  alGuardar,
}: DialogoPruebaProps) {
  const [mensaje, setMensaje] = useState('')
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DatosPrueba>({
    resolver: zodResolver(esquemaDatosPrueba),
    defaultValues: {
      realizadaPor: reparacion.tecnicoAsignadoId ?? '',
      tipo: '',
      resultado: '',
      aprobada: true,
      notas: '',
    },
  })

  useEffect(() => {
    if (abierto) {
      reset({
        realizadaPor: reparacion.tecnicoAsignadoId ?? '',
        tipo: '',
        resultado: '',
        aprobada: true,
        notas: '',
      })
    }
  }, [abierto, reparacion.tecnicoAsignadoId, reset])

  const guardar = async (datos: DatosPrueba) => {
    setMensaje('')
    const error = await alGuardar(datos)
    if (error) {
      setError('resultado', { message: error })
      return
    }
    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-foreground/30" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-[70] max-h-[92svh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold">Registrar prueba</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">Añade un resultado verificable antes de preparar la entrega.</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar prueba" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </header>
          <form id="formulario-prueba" className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7" onSubmit={handleSubmit(guardar)}>
            <div>
              <label htmlFor="prueba-tipo" className="field-label">Tipo de prueba *</label>
              <input id="prueba-tipo" className="field-control" autoComplete="off" placeholder="Ej. Encendido" aria-invalid={Boolean(errors.tipo)} {...register('tipo')} />
              {errors.tipo ? <p className="field-error">{errors.tipo.message}</p> : null}
            </div>
            <div>
              <label htmlFor="prueba-resultado" className="field-label">Resultado *</label>
              <input id="prueba-resultado" className="field-control" autoComplete="off" placeholder="Ej. Opera correctamente" aria-invalid={Boolean(errors.resultado)} {...register('resultado')} />
              {errors.resultado ? <p className="field-error">{errors.resultado.message}</p> : null}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="prueba-notas" className="field-label">Notas</label>
              <textarea id="prueba-notas" rows={3} className="field-control resize-y py-2" placeholder="Condiciones o mediciones de la prueba" aria-invalid={Boolean(errors.notas)} {...register('notas')} />
              {errors.notas ? <p className="field-error">{errors.notas.message}</p> : null}
            </div>
            <label htmlFor="prueba-aprobada" className="flex cursor-pointer items-start gap-3 border-t py-4 sm:col-span-2">
              <input id="prueba-aprobada" type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...register('aprobada')} />
              <span><span className="block text-sm font-medium">Prueba aprobada</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">El ciclo vigente necesita una prueba aprobada y ningún fallo.</span></span>
            </label>
            <input type="hidden" {...register('realizadaPor')} />
          </form>
          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-7">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline" size="lg">Cancelar</Button></DialogPrimitive.Close>
            <Button type="submit" form="formulario-prueba" size="lg" disabled={isSubmitting}>Guardar prueba</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
