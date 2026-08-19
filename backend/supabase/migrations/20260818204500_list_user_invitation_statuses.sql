-- Expone al backend solamente el estado de confirmación de los usuarios que
-- pertenecen a la organización administrada. Evita conceder SELECT directo
-- sobre profiles al rol de servicio y mantiene el principio de mínimo privilegio.

create function public.admin_list_user_confirmation_statuses(
  actor_user_id uuid
)
returns table (
  user_id uuid,
  auth_confirmed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
begin
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);

  return query
  select profile.id, profile.auth_confirmed_at
  from public.organization_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
  where membership.organization_id = resolved_organization_id;
end;
$$;

revoke all on function public.admin_list_user_confirmation_statuses(uuid)
from public, anon, authenticated;

grant execute on function public.admin_list_user_confirmation_statuses(uuid)
to service_role;

comment on function public.admin_list_user_confirmation_statuses(uuid) is
  'Lista estados de aceptación del tenant administrado; uso exclusivo del backend.';
