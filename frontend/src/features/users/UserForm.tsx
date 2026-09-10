import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { UserAccessSelector } from '@/features/users/UserAccessSelector'
import { userFormSchema } from '@/features/users/userSchemas'
import {
  accessModulesInDisplayOrder,
  collapseToPrimaryPermissions,
  expandPermissionDependencies,
  type ManagedUser,
  type UserInput,
} from '@/features/users/userTypes'

type UserFormValues = z.infer<typeof userFormSchema>

interface UserFormProps {
  open: boolean
  user: ManagedUser | null
  isSubmitting: boolean
  currentUserId: string | null
  submitError?: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (values: UserInput) => Promise<void>
}

const emptyValues: UserFormValues = {
  fullName: '', email: '', phone: '', isAdmin: false, permissionCodes: [],
}

export function UserForm({
  open, user, isSubmitting, currentUserId, submitError, onOpenChange, onSubmit,
}: UserFormProps) {
  const form = useForm<UserFormValues>({ resolver: zodResolver(userFormSchema), defaultValues: emptyValues })
  const isAdmin = form.watch('isAdmin')
  const selectedPermissions = form.watch('permissionCodes') ?? []
  const effectivePermissions = expandPermissionDependencies(selectedPermissions)
  const effectiveModules = accessModulesInDisplayOrder
    .filter((module) => module.capabilities.some((capability) =>
      capability.permissionCodes.some((permission) => effectivePermissions.includes(permission)),
    ))
    .map((module) => module.label)
  const automaticallyIncludedCount = effectivePermissions
    .filter((permission) => !selectedPermissions.includes(permission))
    .length
  const protectsOwnAdminAccess = user?.id === currentUserId && user.isAdmin

  useEffect(() => {
    if (!open) return
    form.reset(user ? {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? '',
      isAdmin: user.isAdmin,
      permissionCodes: user.isAdmin ? [] : collapseToPrimaryPermissions(user.permissionCodes),
    } : emptyValues)
  }, [form, open, user])

  function setAccessType(nextIsAdmin: boolean) {
    if (!nextIsAdmin && protectsOwnAdminAccess) return
    form.setValue('isAdmin', nextIsAdmin, { shouldDirty: true, shouldValidate: true })
    if (nextIsAdmin) form.setValue('permissionCodes', [], { shouldDirty: true, shouldValidate: true })
  }

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({ ...values, permissionCodes: values.isAdmin ? [] : expandPermissionDependencies(values.permissionCodes) })
  })

  const fieldClass = 'mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-destructive'

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => { if (!isSubmitting) onOpenChange(nextOpen) }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/30" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 m-auto flex h-dvh w-full flex-col bg-card shadow-xl outline-none sm:h-[min(92svh,900px)] sm:w-[min(92vw,56rem)] sm:max-w-none sm:rounded-lg sm:border">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-2xl font-semibold tracking-[-0.03em]">
                {user ? 'Editar usuario' : 'Invitar usuario'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">
                {user ? 'Actualiza sus datos y define exactamente a qué módulos puede acceder.' : 'El usuario recibirá un correo para establecer su contraseña.'}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Cerrar" disabled={isSubmitting}><X aria-hidden="true" /></Button>
            </DialogPrimitive.Close>
          </header>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} noValidate>
            <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-7">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-medium sm:col-span-2">
                  Nombre completo *
                  <input className={fieldClass} autoComplete="name" aria-invalid={Boolean(form.formState.errors.fullName)} {...form.register('fullName')} />
                  {form.formState.errors.fullName ? <span className="mt-1 block text-xs text-destructive">{form.formState.errors.fullName.message}</span> : null}
                </label>
                <label className="block text-sm font-medium">
                  Correo *
                  <input type="email" className={fieldClass} autoComplete="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
                  {form.formState.errors.email ? <span className="mt-1 block text-xs text-destructive">{form.formState.errors.email.message}</span> : null}
                </label>
                <label className="block text-sm font-medium">
                  Teléfono <span className="font-normal text-muted-foreground">(opcional)</span>
                  <input type="tel" className={fieldClass} autoComplete="tel" aria-invalid={Boolean(form.formState.errors.phone)} {...form.register('phone')} />
                  {form.formState.errors.phone ? <span className="mt-1 block text-xs text-destructive">{form.formState.errors.phone.message}</span> : null}
                </label>
              </div>

              <fieldset>
                <legend className="text-sm font-semibold">Tipo de acceso *</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className={`flex cursor-pointer gap-3 rounded-md border p-4 ${isAdmin ? 'border-primary bg-accent/60' : ''}`}>
                    <input type="radio" name="accessType" checked={isAdmin} onChange={() => setAccessType(true)} className="mt-1 size-4 accent-primary" />
                    <span><span className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4" aria-hidden="true" />Administrador total</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Acceso completo, incluidos usuarios y configuración.</span></span>
                  </label>
                  <label className={`flex gap-3 rounded-md border p-4 ${!isAdmin ? 'border-primary bg-accent/60' : ''} ${protectsOwnAdminAccess ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input type="radio" name="accessType" checked={!isAdmin} disabled={protectsOwnAdminAccess} onChange={() => setAccessType(false)} className="mt-1 size-4 accent-primary" />
                    <span><span className="flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="size-4" aria-hidden="true" />Acceso operativo personalizado</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Solo los módulos y capacidades seleccionados.</span></span>
                  </label>
                </div>
                {protectsOwnAdminAccess ? <p className="mt-2 text-xs text-muted-foreground">No puedes quitarte tu propio acceso de administrador.</p> : null}
              </fieldset>

              {!isAdmin ? (
                <UserAccessSelector
                  selectedPermissions={selectedPermissions}
                  error={form.formState.errors.permissionCodes?.message}
                  onChange={(permissions) => form.setValue('permissionCodes', permissions, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })}
                />
              ) : null}

              {submitError ? <p role="alert" className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{submitError}</p> : null}
            </div>

            {!isAdmin && effectiveModules.length > 0 ? (
              <div
                className="flex flex-wrap items-center gap-x-2 border-t bg-muted/50 px-5 py-3 text-xs sm:px-7"
                role="status"
                title={`Módulos: ${effectiveModules.join(', ')}`}
              >
                <span className="font-semibold text-foreground">Acceso efectivo:</span>
                <span className="text-muted-foreground">
                  {effectiveModules.length} {effectiveModules.length === 1 ? 'módulo' : 'módulos'}
                </span>
                {automaticallyIncludedCount > 0 ? (
                  <span className="text-primary">
                    · {automaticallyIncludedCount} {automaticallyIncludedCount === 1 ? 'acceso requerido' : 'accesos requeridos'}
                  </span>
                ) : null}
                <span className="sr-only">Módulos: {effectiveModules.join(', ')}.</span>
              </div>
            ) : null}

            <footer className="flex flex-col-reverse gap-2 border-t bg-card px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : user ? 'Guardar cambios' : 'Enviar invitación'}</Button>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
