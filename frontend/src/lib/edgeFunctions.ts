import { supabase } from '@/lib/supabase'
import { notifySessionInvalidated } from '@/features/auth/sessionEvents'

interface FunctionErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export class EdgeFunctionError extends Error {
  readonly status: number | null
  readonly code: string | null

  constructor(
    message: string,
    status: number | null,
    code: string | null,
  ) {
    super(message)
    this.name = 'EdgeFunctionError'
    this.status = status
    this.code = code
  }
}

export async function invokeEdgeFunction<T>(
  functionName: string,
  body: object,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, { body })

  if (error) {
    const context = 'context' in error ? error.context : null
    let status: number | null = null
    let code: string | null = null
    let message = 'No se pudo completar la operación.'

    if (context instanceof Response) {
      status = context.status
      const responseBody = (await context.clone().json().catch(() => null)) as
        | FunctionErrorBody
        | null
      code = responseBody?.error?.code ?? null
      message = responseBody?.error?.message ?? message
    }

    if (status === 401 || code === 'UNAUTHORIZED') {
      notifySessionInvalidated('Tu sesión expiró. Inicia sesión nuevamente.')
    }

    throw new EdgeFunctionError(message, status, code)
  }

  return (data as { data: T }).data
}
