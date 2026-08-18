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

  return {
    actor: data.user,
    adminClient,
    publicClient,
  }
}
