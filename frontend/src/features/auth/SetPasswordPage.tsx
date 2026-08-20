import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'

const passwordSchema = z
  .object({
    password: z.string().min(8, 'Usa como mínimo 8 caracteres.'),
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    path: ['confirmation'],
    message: 'Las contraseñas no coinciden.',
  })

type PasswordValues = z.infer<typeof passwordSchema>

export function SetPasswordPage() {
  const { session, isLoading, sessionError } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmation: '' },
  })

  const submit = form.handleSubmit(async ({ password }) => {
    setServerError(null)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setServerError('El enlace expiró o no se pudo actualizar la contraseña.')
      return
    }

    navigate('/', { replace: true })
  })

  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 px-4 py-10">
      <section className="w-full max-w-md border bg-card p-7 shadow-sm sm:p-9">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <KeyRound aria-hidden="true" className="size-5" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">
          Establecer contraseña
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Crea una contraseña personal para acceder a SILSANPLEX.
        </p>

        {isLoading ? (
          <p role="status" className="mt-7 text-sm text-muted-foreground">
            Verificando el enlace de acceso…
          </p>
        ) : !session ? (
          <div className="mt-7">
            <p role="alert" className="text-sm text-destructive">
              {sessionError ??
                'El enlace no es válido o ya expiró. Solicita uno nuevo a administración.'}
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/iniciar-sesion">Ir al inicio de sesión</Link>
            </Button>
          </div>
        ) : (
          <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
            <label className="block text-sm font-medium">
              Nueva contraseña
              <input
                type="password"
                autoComplete="new-password"
                className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
                {...form.register('password')}
              />
              {form.formState.errors.password ? (
                <span className="mt-1 block text-xs text-destructive">
                  {form.formState.errors.password.message}
                </span>
              ) : null}
            </label>

            <label className="block text-sm font-medium">
              Confirmar contraseña
              <input
                type="password"
                autoComplete="new-password"
                className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
                {...form.register('confirmation')}
              />
              {form.formState.errors.confirmation ? (
                <span className="mt-1 block text-xs text-destructive">
                  {form.formState.errors.confirmation.message}
                </span>
              ) : null}
            </label>

            {serverError ? (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isLoading || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </form>
        )}
      </section>
    </main>
  )
}
