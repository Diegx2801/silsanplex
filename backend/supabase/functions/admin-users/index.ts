import type {
  SupabaseClient,
  User,
} from '@supabase/supabase-js'
import { z } from 'zod'

import {
  AuthorizationError,
  authorizeRequest,
  ConfigurationError,
} from '../_shared/authorization.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { errorResponse, jsonResponse } from '../_shared/responses.ts'
import {
  adminUserRequestSchema,
  type AdminUserRequest,
} from './schemas.ts'

const databaseErrorMessages: Record<string, string> = {
  ADMIN_ACCESS_REQUIRED: 'Solo un administrador activo puede realizar esta operación.',
  ADMIN_ORGANIZATION_AMBIGUOUS: 'El administrador pertenece a más de una organización.',
  ACTIVE_PROFILE_REQUIRED: 'El usuario no tiene un perfil activo.',
  AT_LEAST_ONE_ROLE_REQUIRED: 'Selecciona al menos un rol.',
  INVALID_OR_INACTIVE_ROLE: 'Uno de los roles seleccionados no es válido.',
  USER_ALREADY_BELONGS_TO_ORGANIZATION: 'El usuario ya pertenece a la organización.',
  USER_NOT_FOUND_IN_ORGANIZATION: 'El usuario no pertenece a la organización.',
  SELF_ADMIN_ROLE_REMOVAL_FORBIDDEN: 'No puedes quitarte tu propio rol de administración.',
  LAST_ADMIN_ROLE_REMOVAL_FORBIDDEN: 'No se puede quitar el rol al último administrador activo.',
  SELF_DEACTIVATION_FORBIDDEN: 'No puedes desactivar tu propia cuenta.',
  LAST_ADMIN_DEACTIVATION_FORBIDDEN: 'No se puede desactivar al último administrador activo.',
  INVALID_FULL_NAME: 'El nombre ingresado no es válido.',
}

class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function applicationUrl() {
  return (Deno.env.get('PUBLIC_APP_URL') ?? 'http://127.0.0.1:5173').replace(/\/$/, '')
}

function databaseRequestError(message?: string) {
  const code = message ?? 'DATABASE_OPERATION_FAILED'
  return new RequestError(
    code,
    databaseErrorMessages[code] ?? 'No se pudo completar la operación solicitada.',
    code === 'ADMIN_ACCESS_REQUIRED' ? 403 : 409,
  )
}

async function listUsers(adminClient: SupabaseClient, actor: User) {
  const { data, error } = await adminClient.rpc('admin_list_users', {
    actor_user_id: actor.id,
  })

  if (error) throw databaseRequestError(error.message)
  const users = data ?? []
  const { data: profiles, error: profilesError } = await adminClient.rpc(
    'admin_list_user_confirmation_statuses',
    { actor_user_id: actor.id },
  )

  if (profilesError) throw databaseRequestError(profilesError.message)
  const confirmationByUser = new Map(
    (profiles ?? []).map((profile: { user_id: string; auth_confirmed_at: string | null }) => [
      profile.user_id,
      profile.auth_confirmed_at,
    ]),
  )

  return {
    users: users.map((user: { user_id: string }) => ({
      ...user,
      auth_confirmed_at: confirmationByUser.get(user.user_id) ?? null,
    })),
  }
}

async function createUser(
  request: Extract<AdminUserRequest, { action: 'create' }>,
  adminClient: SupabaseClient,
  actor: User,
) {
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
    request.email,
    {
      data: {
        full_name: request.fullName,
        phone: request.phone || null,
      },
      redirectTo: `${applicationUrl()}/establecer-contrasena`,
    },
  )

  if (error || !data.user) {
    const duplicate = error?.message.toLowerCase().includes('already')
    throw new RequestError(
      duplicate ? 'EMAIL_ALREADY_REGISTERED' : 'INVITATION_FAILED',
      duplicate
        ? 'Ya existe una cuenta registrada con ese correo.'
        : 'No se pudo enviar la invitación.',
      duplicate ? 409 : 502,
    )
  }

  const { error: membershipError } = await adminClient.rpc(
    'admin_create_user_membership',
    {
      actor_user_id: actor.id,
      target_user_id: data.user.id,
      requested_role_codes: request.roleCodes,
    },
  )

  if (membershipError) {
    await adminClient.auth.admin.deleteUser(data.user.id)
    throw databaseRequestError(membershipError.message)
  }

  return { userId: data.user.id }
}

async function updateUser(
  request: Extract<AdminUserRequest, { action: 'update' }>,
  adminClient: SupabaseClient,
  actor: User,
) {
  const { error: validationError } = await adminClient.rpc(
    'assert_admin_can_update_user',
    {
      actor_user_id: actor.id,
      target_user_id: request.userId,
      requested_role_codes: request.roleCodes,
    },
  )

  if (validationError) throw databaseRequestError(validationError.message)

  const { data: previousUserData, error: getUserError } =
    await adminClient.auth.admin.getUserById(request.userId)

  if (getUserError || !previousUserData.user) {
    throw new RequestError('AUTH_USER_NOT_FOUND', 'La identidad del usuario no existe.', 404)
  }

  const previousUser = previousUserData.user
  const previousMetadata = previousUser.user_metadata ?? {}
  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
    request.userId,
    {
      email: request.email,
      email_confirm: Boolean(previousUser.email_confirmed_at),
      user_metadata: {
        ...previousMetadata,
        full_name: request.fullName,
        phone: request.phone || null,
      },
    },
  )

  if (authUpdateError) {
    throw new RequestError(
      'AUTH_USER_UPDATE_FAILED',
      'No se pudo actualizar el correo del usuario.',
      409,
    )
  }

  const { error: profileUpdateError } = await adminClient.rpc(
    'admin_update_user_membership',
    {
      actor_user_id: actor.id,
      target_user_id: request.userId,
      requested_email: request.email,
      previous_email: previousUser.email,
      requested_full_name: request.fullName,
      requested_phone: request.phone,
      requested_role_codes: request.roleCodes,
    },
  )

  if (profileUpdateError) {
    await adminClient.auth.admin.updateUserById(request.userId, {
      email: previousUser.email,
      email_confirm: true,
      user_metadata: previousMetadata,
    })
    throw databaseRequestError(profileUpdateError.message)
  }

  return { userId: request.userId }
}

async function setUserStatus(
  request: Extract<AdminUserRequest, { action: 'set-status' }>,
  adminClient: SupabaseClient,
  actor: User,
) {
  const { error } = await adminClient.rpc('admin_set_user_membership_status', {
    actor_user_id: actor.id,
    target_user_id: request.userId,
    requested_is_active: request.isActive,
  })

  if (error) throw databaseRequestError(error.message)
  return { userId: request.userId, isActive: request.isActive }
}

async function sendPasswordReset(
  request: Extract<AdminUserRequest, { action: 'send-password-reset' }>,
  adminClient: SupabaseClient,
  publicClient: SupabaseClient,
  actor: User,
) {
  const { error: authorizationError } = await adminClient.rpc(
    'admin_record_password_reset',
    {
      actor_user_id: actor.id,
      target_user_id: request.userId,
    },
  )

  if (authorizationError) throw databaseRequestError(authorizationError.message)

  const { data, error: getUserError } = await adminClient.auth.admin.getUserById(
    request.userId,
  )

  if (getUserError || !data.user?.email) {
    throw new RequestError('AUTH_USER_NOT_FOUND', 'La identidad del usuario no existe.', 404)
  }

  if (!data.user.email_confirmed_at) {
    throw new RequestError(
      'INVITATION_STILL_PENDING',
      'El usuario todavía no aceptó su invitación. Reenvía la invitación.',
      409,
    )
  }

  const { error: resetError } = await publicClient.auth.resetPasswordForEmail(
    data.user.email,
    { redirectTo: `${applicationUrl()}/establecer-contrasena` },
  )

  if (resetError) {
    throw new RequestError(
      'PASSWORD_RESET_FAILED',
      'No se pudo enviar el correo de recuperación.',
      502,
    )
  }

  return { userId: request.userId }
}

async function resendInvitation(
  request: Extract<AdminUserRequest, { action: 'resend-invitation' }>,
  adminClient: SupabaseClient,
  actor: User,
) {
  const { error: authorizationError } = await adminClient.rpc(
    'admin_record_invitation_resent',
    { actor_user_id: actor.id, target_user_id: request.userId },
  )
  if (authorizationError) throw databaseRequestError(authorizationError.message)

  const { data, error: getUserError } = await adminClient.auth.admin.getUserById(
    request.userId,
  )
  if (getUserError || !data.user?.email) {
    throw new RequestError('AUTH_USER_NOT_FOUND', 'La identidad del usuario no existe.', 404)
  }
  if (data.user.email_confirmed_at) {
    throw new RequestError(
      'USER_ALREADY_CONFIRMED',
      'El usuario ya activó su cuenta. Utiliza restablecer contraseña.',
      409,
    )
  }

  const { error } = await adminClient.auth.admin.inviteUserByEmail(data.user.email, {
    data: data.user.user_metadata,
    redirectTo: `${applicationUrl()}/establecer-contrasena`,
  })
  if (error) {
    throw new RequestError(
      'INVITATION_RESEND_FAILED',
      'No se pudo reenviar la invitación. Inténtalo nuevamente en unos minutos.',
      502,
    )
  }

  return { userId: request.userId }
}

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
    const clients = await authorizeRequest(request)
    const parsedRequest = adminUserRequestSchema.parse(await request.json())
    let result: unknown

    switch (parsedRequest.action) {
      case 'list':
        result = await listUsers(clients.adminClient, clients.actor)
        break
      case 'create':
        result = await createUser(parsedRequest, clients.adminClient, clients.actor)
        break
      case 'update':
        result = await updateUser(parsedRequest, clients.adminClient, clients.actor)
        break
      case 'set-status':
        result = await setUserStatus(parsedRequest, clients.adminClient, clients.actor)
        break
      case 'send-password-reset':
        result = await sendPasswordReset(
          parsedRequest,
          clients.adminClient,
          clients.publicClient,
          clients.actor,
        )
        break
      case 'resend-invitation':
        result = await resendInvitation(parsedRequest, clients.adminClient, clients.actor)
        break
    }

    return jsonResponse({ data: result }, 200, headers)
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse(
        { code: 'INVALID_REQUEST', message: 'Los datos enviados no son válidos.' },
        400,
        headers,
      )
    }

    if (error instanceof AuthorizationError) {
      return errorResponse(
        { code: 'UNAUTHORIZED', message: error.message },
        401,
        headers,
      )
    }

    if (error instanceof RequestError) {
      return errorResponse(
        { code: error.code, message: error.message },
        error.status,
        headers,
      )
    }

    if (error instanceof ConfigurationError) {
      console.error(error.message)
      return errorResponse(
        { code: 'SERVER_MISCONFIGURED', message: 'El servicio no está configurado correctamente.' },
        500,
        headers,
      )
    }

    console.error('Unexpected admin-users error', error)
    return errorResponse(
      { code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno.' },
      500,
      headers,
    )
  }
})
