import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  esquemaDatosCliente,
  tiposDocumentoCliente,
  type Cliente,
  type DatosCliente,
} from '@/modulos/clientes/modelo/cliente'

const clienteInicial: DatosCliente = {
  tipoDocumento: 'ruc',
  numeroDocumento: '',
  nombreRazonSocial: '',
  nombreComercial: '',
  contacto: '',
  email: '',
  telefono: '',
  direccion: '',
  activo: true,
}

interface DialogoClienteProps {
  abierto: boolean
  cliente: Cliente | null
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosCliente, clienteId?: string) => string | undefined
  alRestaurarFoco: () => void
}

export function DialogoCliente({
  abierto,
  cliente,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoClienteProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosCliente>({
    resolver: zodResolver(esquemaDatosCliente),
    defaultValues: cliente ?? clienteInicial,
  })

  const guardar = (datos: DatosCliente) => {
    const error = alGuardar(datos, cliente?.id)
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
          className="fixed start-1/2 top-1/2 z-50 max-h-[92svh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold tracking-[-0.025em]">
                {cliente ? 'Editar cliente' : 'Registrar cliente'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Estos datos identificarán al cliente en cotizaciones, pedidos y ventas.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar cliente"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form
            id="formulario-cliente"
            className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7"
            onSubmit={handleSubmit(guardar)}
          >
            <div>
              <label htmlFor="tipo-documento-cliente" className="field-label">
                Tipo de documento *
              </label>
              <select
                id="tipo-documento-cliente"
                className="field-control"
                {...register('tipoDocumento')}
              >
                {tiposDocumentoCliente.map((tipo) => (
                  <option key={tipo.valor} value={tipo.valor}>
                    {tipo.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="documento-cliente" className="field-label">
                Número de documento *
              </label>
              <input
                id="documento-cliente"
                autoFocus
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
              <label htmlFor="nombre-cliente" className="field-label">
                Nombre o razón social *
              </label>
              <input
                id="nombre-cliente"
                autoComplete="organization"
                className="field-control"
                aria-invalid={Boolean(errors.nombreRazonSocial)}
                {...register('nombreRazonSocial')}
              />
              {errors.nombreRazonSocial ? (
                <p className="field-error">{errors.nombreRazonSocial.message}</p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="comercial-cliente" className="field-label">
                Nombre comercial
              </label>
              <input
                id="comercial-cliente"
                className="field-control"
                {...register('nombreComercial')}
              />
            </div>
            <div>
              <label htmlFor="contacto-cliente" className="field-label">
                Persona de contacto
              </label>
              <input
                id="contacto-cliente"
                autoComplete="name"
                className="field-control"
                {...register('contacto')}
              />
            </div>
            <div>
              <label htmlFor="telefono-cliente" className="field-label">
                Teléfono
              </label>
              <input
                id="telefono-cliente"
                inputMode="tel"
                autoComplete="tel"
                className="field-control"
                {...register('telefono')}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="email-cliente" className="field-label">
                Correo
              </label>
              <input
                id="email-cliente"
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
              <label htmlFor="direccion-cliente" className="field-label">
                Dirección fiscal o de entrega
              </label>
              <input
                id="direccion-cliente"
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
                <span className="block text-sm font-medium">Cliente activo</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Permite seleccionarlo en nuevas operaciones comerciales.
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
              form="formulario-cliente"
              size="lg"
              disabled={isSubmitting}
            >
              {cliente ? 'Guardar cambios' : 'Registrar cliente'}
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
