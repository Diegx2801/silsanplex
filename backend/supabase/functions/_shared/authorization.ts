import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'

export interface AuthorizedClients {
  actor: User
  adminClient: SupabaseClient
  publicClient: SupabaseClient
}

export class AuthorizationError extends Error {}
export class ConfigurationError extends Error {}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function extractSessionId(accessToken: string) {
  try {
    const encodedPayload = accessToken.split('.')[1]
    if (!encodedPayload) return null

    const normalizedPayload = encodedPayload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=')
    const payload = JSON.parse(atob(normalizedPayload)) as {
      session_id?: unknown
    }

    return typeof payload.session_id === 'string' &&
        uuidPattern.test(payload.session_id)
      ? payload.session_id
      : null
  } catch {
    return null
  }
}

function requiredEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)
    if (value) return value
  }

  throw new ConfigurationError(`Falta una variable de entorno requerida: ${names.join(' o ')}`)
}

export async function authorizeRequest(request: Request): Promise<AuthorizedClients> {
  const authorization = request.headers.get('authorization')

  if (!authorization?.startsWith('Bearer ')) {
    throw new AuthorizationError('Se requiere una sesión válida.')
  }

  const accessToken = authorization.slice('Bearer '.length).trim()
  const supabaseUrl = requiredEnvironmentValue('SUPABASE_URL')
  const publicKey = requiredEnvironmentValue(
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
  )
  const secretKey = requiredEnvironmentValue(
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  )

  const publicClient = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await publicClient.auth.getUser(accessToken)

  if (error || !data.user) {
    throw new AuthorizationError('La sesión es inválida o expiró.')
  }

  const sessionId = extractSessionId(accessToken)
  if (!sessionId) {
    throw new AuthorizationError('La sesión no contiene un identificador válido.')
  }

  const { data: activeSession, error: sessionError } = await adminClient.rpc(
    'is_auth_session_active',
    {
      requested_session_id: sessionId,
      requested_user_id: data.user.id,
    },
  )
  if (sessionError || activeSession !== true) {
    throw new AuthorizationError('La sesión fue revocada o expiró.')
  }

  return {
    actor: data.user,
    adminClient,
    publicClient,
  }
}
