import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  esquemaUbicacion,
  type Almacen,
  type DatosUbicacion,
  type UbicacionAlmacen,
} from '@/modulos/inventario/modelo/almacen'

interface Props {
  abierto: boolean
  ubicacion: UbicacionAlmacen | null
  almacenes: Almacen[]
  almacenInicialId?: string
  bloquearAlmacen?: boolean
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosUbicacion, ubicacion?: UbicacionAlmacen) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoUbicacionAlmacen({
  abierto,
  ubicacion,
  almacenes,
  almacenInicialId,
  bloquearAlmacen = false,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: Props) {
  const almacenPredeterminado = ubicacion?.almacenId
    ?? almacenInicialId
    ?? almacenes.find((almacen) => almacen.activo)?.id
    ?? almacenes[0]?.id
    ?? ''
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosUbicacion>({
    resolver: zodResolver(esquemaUbicacion),
    defaultValues: {
      almacenId: almacenPredeterminado,
      codigo: ubicacion?.codigo ?? '',
      nombre: ubicacion?.nombre ?? '',
      descripcion: ubicacion?.descripcion ?? '',
    },
  })

  async function guardar(datos: DatosUbicacion) {
    const error = await alGuardar(datos, ubicacion ?? undefined)
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
  const almacenActual = almacenes.find((almacen) => almacen.id === almacenPredeterminado)

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
                {ubicacion ? 'Editar ubicación' : 'Registrar ubicación'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                Define un pasillo, zona o anaquel dentro de un almacén.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar formulario de ubicación"
                disabled={isSubmitting}
                className="grid size-9 place-items-center rounded-md hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form
            id="formulario-ubicacion-almacen"
            className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7"
            onSubmit={handleSubmit(guardar)}
            noValidate
          >
            <Campo label="Almacén *" error={errors.almacenId?.message} ancho>
              {ubicacion || bloquearAlmacen ? (
                <>
                  <input
                    className="field-control bg-muted/40"
                    value={almacenActual ? `${almacenActual.codigo} · ${almacenActual.nombre}` : 'Almacén no disponible'}
                    readOnly
                  />
                  <input type="hidden" {...register('almacenId')} />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {ubicacion
                      ? 'Una ubicación no puede trasladarse a otro almacén.'
                      : 'La ubicación se registrará dentro de este almacén.'}
                  </span>
                </>
              ) : (
                <select
                  autoFocus
                  aria-invalid={Boolean(errors.almacenId)}
                  className="field-control"
                  {...register('almacenId')}
                >
                  <option value="">Selecciona un almacén</option>
                  {almacenes.map((almacen) => (
                    <option key={almacen.id} value={almacen.id}>
                      {almacen.codigo} · {almacen.nombre}{almacen.activo ? '' : ' · Inactivo'}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo label="Código *" error={errors.codigo?.message}>
              <input
                autoFocus={!ubicacion && bloquearAlmacen}
                readOnly={Boolean(ubicacion)}
                aria-invalid={Boolean(errors.codigo)}
                className="field-control uppercase read-only:bg-muted/40"
                placeholder="Ej. A-01-N2"
                {...register('codigo')}
              />
              {ubicacion ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  El código físico no se modifica.
                </span>
              ) : null}
            </Campo>
            <Campo label="Nombre *" error={errors.nombre?.message}>
              <input
                autoFocus={Boolean(ubicacion)}
                aria-invalid={Boolean(errors.nombre)}
                className="field-control"
                placeholder="Ej. Anaquel 1"
                {...register('nombre')}
              />
            </Campo>
            <Campo label="Descripción" error={errors.descripcion?.message} ancho>
              <input
                aria-invalid={Boolean(errors.descripcion)}
                className="field-control"
                placeholder="Referencia física opcional"
                {...register('descripcion')}
              />
            </Campo>
            {!almacenes.length ? (
              <p role="alert" className="field-error sm:col-span-2">
                Primero registra un almacén.
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
            <Button
              type="submit"
              form="formulario-ubicacion-almacen"
              disabled={isSubmitting || !almacenes.length}
            >
              {isSubmitting ? 'Guardando…' : ubicacion ? 'Guardar cambios' : 'Registrar ubicación'}
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
