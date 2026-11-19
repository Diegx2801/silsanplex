import { z } from 'zod'

import {
  AuthorizationError,
  authorizeRequest,
  ConfigurationError,
} from '../_shared/authorization.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { errorResponse, jsonResponse } from '../_shared/responses.ts'

const requestSchema = z.object({
  password: z.string().min(8).max(1024),
}).strict()

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (!headers) {
    return errorResponse(
      { code: 'ORIGIN_NOT_ALLOWED', message: 'El origen de la solicitud no está permitido.' },
      403,
      {},
    )
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }
  if (request.method !== 'POST') {
    return errorResponse(
      { code: 'METHOD_NOT_ALLOWED', message: 'Método HTTP no permitido.' },
      405,
      headers,
    )
  }

  try {
    const parsed = requestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        { code: 'INVALID_PASSWORD', message: 'La contraseña debe tener al menos 8 caracteres.' },
        422,
        headers,
      )
    }

    // This is the only Edge Function allowed to accept a pending-setup session.
    // authorizeRequest still verifies the JWT, its live Auth session, and that
    // the identity itself is active.
    const { actor, adminClient } = await authorizeRequest(request, {
      allowPasswordSetup: true,
    })

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('password_setup_required,auth_confirmed_at')
      .eq('id', actor.id)
      .maybeSingle()

    if (profileError || !profile) {
      throw new ConfigurationError('No se pudo comprobar el estado de configuración de la cuenta.')
    }
    if (profile.password_setup_required && !profile.auth_confirmed_at) {
      return errorResponse(
        { code: 'EMAIL_CONFIRMATION_REQUIRED', message: 'Abre primero el enlace de invitación de tu correo.' },
        403,
        headers,
      )
    }

    // Keep the password out of SQL, logs, and browser-visible service keys.
    const { error: passwordError } = await adminClient.auth.admin.updateUserById(
      actor.id,
      { password: parsed.data.password },
    )
    if (passwordError) {
      return errorResponse(
        { code: 'PASSWORD_UPDATE_FAILED', message: 'No se pudo guardar la contraseña. Revisa que cumpla los requisitos e inténtalo otra vez.' },
        422,
        headers,
      )
    }

    if (profile.password_setup_required) {
      const { error: completionError } = await adminClient.rpc(
        'complete_user_password_setup',
        { target_user_id: actor.id },
      )
      if (completionError) {
        // Fail closed: the profile remains pending if Auth succeeded but this
        // database transition failed. Retrying this endpoint is safe.
        console.error('Account password setup finalization failed', completionError)
        return errorResponse(
          { code: 'ACCOUNT_SETUP_FINALIZATION_FAILED', message: 'La contraseña se guardó, pero falta finalizar la activación. Inténtalo de nuevo.' },
          503,
          headers,
        )
      }
    }

    return jsonResponse(
      { data: { passwordUpdated: true, setupCompleted: profile.password_setup_required } },
      200,
      headers,
    )
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse({ code: error.code, message: error.message }, error.status, headers)
    }
    if (error instanceof ConfigurationError) {
      console.error(error.message)
      return errorResponse(
        { code: 'SERVER_MISCONFIGURED', message: 'El servicio no está configurado correctamente.' },
        500,
        headers,
      )
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse(
        { code: 'INVALID_REQUEST', message: 'Los datos enviados no son válidos.' },
        400,
        headers,
      )
    }

    console.error('Unexpected account password setup error', error)
    return errorResponse(
      { code: 'INTERNAL_ERROR', message: 'No se pudo completar la configuración de la cuenta.' },
      500,
      headers,
    )
  }
})
