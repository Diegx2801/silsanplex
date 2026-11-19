import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'

export interface AuthorizedClients {
  actor: User
  accessToken: string
  isEmailActionSession: boolean
  isRecoverySession: boolean
  adminClient: SupabaseClient
  publicClient: SupabaseClient
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly code = 'UNAUTHORIZED',
    readonly status = 401,
  ) {
    super(message)
  }
}
export class ConfigurationError extends Error {}

export interface AuthorizationOptions {
  allowPasswordSetup?: boolean
  allowPasswordRecovery?: boolean
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function extractTokenClaims(accessToken: string) {
  try {
    const encodedPayload = accessToken.split('.')[1]
    if (!encodedPayload) return null

    const normalizedPayload = encodedPayload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=')
    const payload = JSON.parse(atob(normalizedPayload)) as Record<string, unknown>
    return payload
  } catch {
    return null
  }
}

export function extractSessionId(accessToken: string) {
  const payload = extractTokenClaims(accessToken)
  const sessionId = payload?.session_id

  return typeof sessionId === 'string' && uuidPattern.test(sessionId)
    ? sessionId
    : null
}

// Only consume these claims after auth.getUser(accessToken) has verified the
// token. Email-action status must come from Supabase's signed JWT, never from
// a client-provided request field or URL.
export function extractAuthMethods(accessToken: string) {
  const amr = extractTokenClaims(accessToken)?.amr
  if (!Array.isArray(amr)) return []

  return amr.flatMap((entry) => {
    if (typeof entry === 'string') return [entry]
    return entry && typeof entry === 'object' && 'method' in entry &&
        typeof entry.method === 'string'
      ? [entry.method]
      : []
  })
}

export function extractEmailActionMethods(accessToken: string) {
  const emailActionMethods = new Set(['otp', 'recovery', 'invite'])
  return extractAuthMethods(accessToken).filter((method) =>
    emailActionMethods.has(method),
  )
}

function requiredEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)
    if (value) return value
  }

  throw new ConfigurationError(`Falta una variable de entorno requerida: ${names.join(' o ')}`)
}

export async function authorizeRequest(
  request: Request,
  options: AuthorizationOptions = {},
): Promise<AuthorizedClients> {
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

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('is_active,password_setup_required,password_recovery_requested_at')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError) {
    throw new ConfigurationError('No se pudo comprobar el estado de acceso de la cuenta.')
  }

  const authMethods = extractAuthMethods(accessToken)
  const isEmailActionSession = extractEmailActionMethods(accessToken).length > 0
  const isRecoverySession = authMethods.includes('recovery')
  const allowPasswordActionSession = isEmailActionSession && (
    (Boolean(options.allowPasswordSetup) && profile?.password_setup_required === true)
    || (
      Boolean(options.allowPasswordRecovery)
      && profile?.password_setup_required !== true
      && profile?.password_recovery_requested_at !== null
      && profile?.password_recovery_requested_at !== undefined
    )
  )

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

  const { data: currentAfterPasswordChange, error: passwordSessionError } =
    await adminClient.rpc('is_auth_session_current_after_password_change', {
      requested_session_id: sessionId,
      requested_user_id: data.user.id,
      allow_recovery_session: allowPasswordActionSession,
    })
  if (passwordSessionError || currentAfterPasswordChange !== true) {
    throw new AuthorizationError('La sesión fue revocada o expiró.')
  }

  if (!profile?.is_active) {
    throw new AuthorizationError('La cuenta no está activa.', 'ACCOUNT_INACTIVE', 403)
  }
  if (profile.password_setup_required && !options.allowPasswordSetup) {
    throw new AuthorizationError(
      'Completa primero la configuración de tu contraseña.',
      'ACCOUNT_SETUP_REQUIRED',
      403,
    )
  }
  if (isEmailActionSession && !options.allowPasswordSetup && !options.allowPasswordRecovery) {
    throw new AuthorizationError(
      'Completa primero la acción de correo de tu cuenta.',
      'PASSWORD_ACTION_REQUIRED',
      403,
    )
  }
  return {
    actor: data.user,
    accessToken,
    isEmailActionSession,
    isRecoverySession,
    adminClient,
    publicClient,
  }
}
