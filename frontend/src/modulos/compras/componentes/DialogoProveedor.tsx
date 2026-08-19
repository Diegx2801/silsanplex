import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  esquemaDatosProveedor,
  type DatosProveedor,
  type Proveedor,
} from '@/modulos/compras/modelo/compras'

const proveedorInicial: DatosProveedor = {
  tipoDocumento: 'ruc',
  numeroDocumento: '',
  razonSocial: '',
  contacto: '',
  email: '',
  telefono: '',
  direccion: '',
  activo: true,
}

interface DialogoProveedorProps {
  abierto: boolean
  proveedor: Proveedor | null
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosProveedor, proveedorId?: string) => string | undefined
  alRestaurarFoco: () => void
}

export function DialogoProveedor({
  abierto,
  proveedor,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoProveedorProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosProveedor>({
    resolver: zodResolver(esquemaDatosProveedor),
    defaultValues: proveedor ?? proveedorInicial,
  })

  const guardar = (datos: DatosProveedor) => {
    const error = alGuardar(datos, proveedor?.id)
    if (error) {
      setError('numeroDocumento', { message: error })
      return
    }
    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-50 max-h-[92svh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold tracking-[-0.025em]">
                {proveedor ? 'Editar proveedor' : 'Registrar proveedor'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Identifica al proveedor antes de asociarlo con una compra.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar proveedor"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form
            id="formulario-proveedor"
            className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7"
            onSubmit={handleSubmit(guardar)}
          >
            <div>
              <label htmlFor="tipo-documento-proveedor" className="field-label">
                Tipo de documento *
              </label>
              <select
                id="tipo-documento-proveedor"
                className="field-control"
                {...register('tipoDocumento')}
              >
                <option value="ruc">RUC</option>
                <option value="dni">DNI</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label htmlFor="documento-proveedor" className="field-label">
                Número de documento *
              </label>
              <input
                id="documento-proveedor"
                autoFocus
                inputMode="numeric"
                autoComplete="off"
                className="field-control"
                aria-invalid={Boolean(errors.numeroDocumento)}
                {...register('numeroDocumento')}
              />
              {errors.numeroDocumento ? (
                <p className="field-error">{errors.numeroDocumento.message}</p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="razon-social-proveedor" className="field-label">
                Razón social o nombre *
              </label>
              <input
                id="razon-social-proveedor"
                autoComplete="organization"
                className="field-control"
                aria-invalid={Boolean(errors.razonSocial)}
                {...register('razonSocial')}
              />
              {errors.razonSocial ? (
                <p className="field-error">{errors.razonSocial.message}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="contacto-proveedor" className="field-label">
                Persona de contacto
              </label>
              <input
                id="contacto-proveedor"
                autoComplete="name"
                className="field-control"
                {...register('contacto')}
              />
            </div>
            <div>
              <label htmlFor="telefono-proveedor" className="field-label">
                Teléfono
              </label>
              <input
                id="telefono-proveedor"
                inputMode="tel"
                autoComplete="tel"
                className="field-control"
                {...register('telefono')}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="email-proveedor" className="field-label">
                Correo
              </label>
              <input
                id="email-proveedor"
                type="email"
                autoComplete="email"
                className="field-control"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email ? (
                <p className="field-error">{errors.email.message}</p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="direccion-proveedor" className="field-label">
                Dirección
              </label>
              <input
                id="direccion-proveedor"
                autoComplete="street-address"
                className="field-control"
                {...register('direccion')}
              />
            </div>
            <label className="flex items-start gap-3 border-t pt-4 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                {...register('activo')}
              />
              <span>
                <span className="block text-sm font-medium">Proveedor activo</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Permite seleccionarlo en nuevas compras.
                </span>
              </span>
            </label>
          </form>

          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="outline" size="lg">
                Cancelar
              </Button>
            </DialogPrimitive.Close>
            <Button
              type="submit"
              form="formulario-proveedor"
              size="lg"
              disabled={isSubmitting}
            >
              {proveedor ? 'Guardar cambios' : 'Registrar proveedor'}
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
