-- Los JWT ya emitidos pueden conservar validez criptográfica después de
-- revocar sus refresh tokens. Las operaciones sensibles verifican además que
-- la sesión identificada por el claim session_id siga existiendo.
create function public.is_auth_session_active(
  requested_session_id uuid,
  requested_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions session
    where session.id = requested_session_id
      and session.user_id = requested_user_id
  );
$$;

revoke all on function public.is_auth_session_active(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.is_auth_session_active(uuid, uuid)
to service_role;

comment on function public.is_auth_session_active(uuid, uuid) is
  'Verificación privada para rechazar JWT pertenecientes a sesiones revocadas.';
