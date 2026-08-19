import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { userFormSchema } from '@/features/users/userSchemas'
import {
  type ManagedUser,
  roleOptions,
  type UserInput,
} from '@/features/users/userTypes'

type UserFormValues = z.infer<typeof userFormSchema>

interface UserFormProps {
  open: boolean
  user: ManagedUser | null
  isSubmitting: boolean
  currentUserId: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (values: UserInput) => Promise<void>
}

const emptyValues: UserFormValues = {
  fullName: '',
  email: '',
  phone: '',
  roleCodes: [],
}

export function UserForm({
  open,
  user,
  isSubmitting,
  currentUserId,
  onOpenChange,
  onSubmit,
}: UserFormProps) {
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return

    form.reset(
      user
        ? {
            fullName: user.fullName,
            email: user.email,
            phone: user.phone ?? '',
            roleCodes: user.roleCodes,
          }
        : emptyValues,
    )
  }, [form, open, user])

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values)
  })

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/30" />
        <DialogPrimitive.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-h-[90svh] w-auto max-w-2xl -translate-y-1/2 overflow-y-auto border bg-card p-6 shadow-xl outline-none sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-2xl font-semibold tracking-[-0.03em]">
                {user ? 'Editar usuario' : 'Invitar usuario'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
                {user
                  ? 'Actualiza los datos y roles de acceso.'
                  : 'El usuario recibirá un correo para establecer su contraseña.'}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Cerrar">
                <X aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <form className="mt-7 space-y-6" onSubmit={submit} noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium sm:col-span-2">
                Nombre completo
                <input
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="name"
                  {...form.register('fullName')}
                />
                {form.formState.errors.fullName ? (
                  <span className="mt-1 block text-xs text-destructive">
                    {form.formState.errors.fullName.message}
                  </span>
                ) : null}
              </label>

              <label className="block text-sm font-medium">
                Correo
                <input
                  type="email"
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="email"
                  {...form.register('email')}
                />
                {form.formState.errors.email ? (
                  <span className="mt-1 block text-xs text-destructive">
                    {form.formState.errors.email.message}
                  </span>
                ) : null}
              </label>

              <label className="block text-sm font-medium">
                Teléfono
                <input
                  type="tel"
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="tel"
                  {...form.register('phone')}
                />
                {form.formState.errors.phone ? (
                  <span className="mt-1 block text-xs text-destructive">
                    {form.formState.errors.phone.message}
                  </span>
                ) : null}
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-medium">Roles</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {roleOptions.map((role) => (
                  <label
                    key={role.code}
                    className="flex min-h-10 items-center gap-3 rounded-md border px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      value={role.code}
                      className="size-4 accent-primary"
                      aria-disabled={
                        user?.id === currentUserId && role.code === 'ADMIN'
                      }
                      onClick={(event) => {
                        if (user?.id === currentUserId && role.code === 'ADMIN') {
                          event.preventDefault()
                        }
                      }}
                      {...form.register('roleCodes')}
                    />
                    {role.label}
                  </label>
                ))}
              </div>
              {form.formState.errors.roleCodes ? (
                <span className="mt-2 block text-xs text-destructive">
                  {form.formState.errors.roleCodes.message}
                </span>
              ) : null}
              {user?.id === currentUserId && user.roleCodes.includes('ADMIN') ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No puedes quitarte tu propio rol de administración.
                </p>
              ) : null}
            </fieldset>

            <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? 'Guardando…'
                  : user
                    ? 'Guardar cambios'
                    : 'Enviar invitación'}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
