import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  esquemaAlmacen,
  type Almacen,
  type DatosAlmacen,
} from '@/modulos/inventario/modelo/almacen'

interface Props {
  abierto: boolean
  almacen: Almacen | null
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosAlmacen, almacen?: Almacen) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoAlmacen({
  abierto,
  almacen,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: Props) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosAlmacen>({
    resolver: zodResolver(esquemaAlmacen),
    defaultValues: {
      codigo: almacen?.codigo ?? '',
      nombre: almacen?.nombre ?? '',
      direccion: almacen?.direccion ?? '',
    },
  })

  async function guardar(datos: DatosAlmacen) {
    const error = await alGuardar(datos, almacen ?? undefined)
    if (error) {
      setError('root.server', { message: error })
      return
    }
    alCambiarApertura(false)
  }

  const cambiarApertura = (siguiente: boolean) => {
    if (!siguiente && isSubmitting) return
    alCambiarApertura(siguiente)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={cambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 border bg-background shadow-xl outline-none"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold">
                {almacen ? 'Editar almacén' : 'Registrar almacén'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                Identifica el espacio físico que recibirá y conservará inventario.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar formulario de almacén"
                disabled={isSubmitting}
                className="grid size-9 place-items-center rounded-md hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form
            id="formulario-almacen"
            className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7"
            onSubmit={handleSubmit(guardar)}
            noValidate
          >
            <Campo label="Código *" error={errors.codigo?.message}>
              <input
                autoFocus={!almacen}
                readOnly={Boolean(almacen)}
                aria-invalid={Boolean(errors.codigo)}
                className="field-control uppercase read-only:bg-muted/40"
                placeholder="Ej. CENTRAL"
                {...register('codigo')}
              />
              {almacen ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  El código identifica al almacén y no se modifica.
                </span>
              ) : null}
            </Campo>
            <Campo label="Nombre *" error={errors.nombre?.message}>
              <input
                autoFocus={Boolean(almacen)}
                aria-invalid={Boolean(errors.nombre)}
                className="field-control"
                placeholder="Ej. Almacén central"
                {...register('nombre')}
              />
            </Campo>
            <Campo label="Dirección física" error={errors.direccion?.message} ancho>
              <input
                autoComplete="street-address"
                aria-invalid={Boolean(errors.direccion)}
                className="field-control"
                placeholder="Opcional"
                {...register('direccion')}
              />
            </Campo>
            {!almacen ? (
              <p className="border bg-muted/25 px-4 py-3 text-sm text-muted-foreground sm:col-span-2">
                Al registrarlo se creará automáticamente una ubicación GENERAL para que pueda operar de inmediato.
              </p>
            ) : null}
            {errors.root?.server ? (
              <p role="alert" className="field-error sm:col-span-2">
                {errors.root.server.message}
              </p>
            ) : null}
          </form>

          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogPrimitive.Close>
            <Button type="submit" form="formulario-almacen" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : almacen ? 'Guardar cambios' : 'Registrar almacén'}
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Campo({
  label,
  error,
  ancho,
  children,
}: {
  label: string
  error?: string
  ancho?: boolean
  children: ReactNode
}) {
  return (
    <label className={ancho ? 'sm:col-span-2' : ''}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span role="alert" className="field-error">{error}</span> : null}
    </label>
  )
}
