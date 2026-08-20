import { zodResolver } from '@hookform/resolvers/zod'
import { LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'

const loginSchema = z.object({
  email: z.string().trim().email('Ingresa un correo válido.'),
  password: z.string().min(1, 'Ingresa tu contraseña.'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { session, isLoading, sessionError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (!isLoading && session) return <Navigate to="/" replace />

  const submit = form.handleSubmit(async (values) => {
    setServerError(null)
    const { error } = await supabase.auth.signInWithPassword(values)

    if (error) {
      setServerError('El correo o la contraseña no son correctos.')
      return
    }

    const destination =
      typeof location.state === 'object' &&
      location.state &&
      'from' in location.state &&
      typeof location.state.from === 'string'
        ? location.state.from
        : '/'
    navigate(destination, { replace: true })
  })

  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 px-4 py-10">
      <section className="w-full max-w-md border bg-card p-7 shadow-sm sm:p-9">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <LockKeyhole aria-hidden="true" className="size-5" />
        </div>
        <p className="mt-6 font-mono text-xs tracking-wider text-primary">SILSANPLEX</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
          Iniciar sesión
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Accede con el correo asignado por administración.
        </p>

        <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
          <label className="block text-sm font-medium">
            Correo
            <input
              type="email"
              autoComplete="email"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register('email')}
            />
            {form.formState.errors.email ? (
              <span className="mt-1 block text-xs text-destructive">
                {form.formState.errors.email.message}
              </span>
            ) : null}
          </label>

          <label className="block text-sm font-medium">
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register('password')}
            />
            {form.formState.errors.password ? (
              <span className="mt-1 block text-xs text-destructive">
                {form.formState.errors.password.message}
              </span>
            ) : null}
          </label>

          {serverError || sessionError ? (
            <p role="alert" className="text-sm text-destructive">
              {serverError ?? sessionError}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
      </section>
    </main>
  )
}
