import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  esquemaDatosSolucionReparacion,
  type DatosSolucionReparacion,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

interface DialogoSolucionReparacionProps {
  abierto: boolean
  reparacion: Reparacion
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosSolucionReparacion) => Promise<string | undefined>
}

export function DialogoSolucionReparacion({
  abierto,
  reparacion,
  alCambiarApertura,
  alGuardar,
}: DialogoSolucionReparacionProps) {
  const [mensaje, setMensaje] = useState('')
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DatosSolucionReparacion>({
    resolver: zodResolver(esquemaDatosSolucionReparacion),
    defaultValues: { solucionAplicada: reparacion.solucionAplicada },
  })

  useEffect(() => {
    if (abierto) {
      setMensaje('')
      reset({ solucionAplicada: reparacion.solucionAplicada })
    }
  }, [abierto, reparacion.solucionAplicada, reset])

  const guardar = async (datos: DatosSolucionReparacion) => {
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
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold">
                {reparacion.solucionAplicada ? 'Modificar solución aplicada' : 'Registrar solución aplicada'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {reparacion.codigo} · Documenta el trabajo técnico realizado en el equipo.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="Cerrar solución aplicada" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>
          <form id="formulario-solucion-reparacion" className="px-5 py-6 sm:px-7" onSubmit={handleSubmit(guardar)}>
            <label htmlFor="solucion-aplicada-reparacion" className="field-label">Solución aplicada *</label>
            <textarea id="solucion-aplicada-reparacion" rows={6} className="field-control min-h-32 resize-y py-2" placeholder="Describe el trabajo realizado, ajustes y componentes reemplazados" aria-invalid={Boolean(errors.solucionAplicada)} {...register('solucionAplicada')} />
            {errors.solucionAplicada ? <p className="field-error">{errors.solucionAplicada.message}</p> : null}
          </form>
          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-7">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline" size="lg">Cancelar</Button></DialogPrimitive.Close>
            <Button type="submit" form="formulario-solucion-reparacion" size="lg" disabled={isSubmitting}>Guardar solución</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
