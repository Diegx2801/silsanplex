-- Evita reenvíos repetidos desde la administración sin depender únicamente
-- del límite del proveedor de correo. La auditoría actúa como registro del
-- último intento autorizado por organización y usuario.
create or replace function public.admin_record_invitation_resent(
  actor_user_id uuid,
  target_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
begin
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);

  if not exists (
    select 1
    from public.organization_memberships
    where organization_id = resolved_organization_id
      and user_id = target_user_id
      and is_active
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'USER_NOT_FOUND_IN_ORGANIZATION';
  end if;

  if exists (
    select 1
    from public.audit_events audit_event
    where audit_event.organization_id = resolved_organization_id
      and audit_event.action = 'USER_INVITATION_RESENT'
      and audit_event.entity_type = 'ORGANIZATION_MEMBERSHIP'
      and audit_event.entity_id = target_user_id::text
      and audit_event.created_at > now() - interval '60 seconds'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVITATION_RESEND_RATE_LIMITED';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id
  )
  values (
    resolved_organization_id,
    actor_user_id,
    'USER_INVITATION_RESENT',
    'ORGANIZATION_MEMBERSHIP',
    target_user_id::text
  );

  return resolved_organization_id;
end;
$$;

revoke all on function public.admin_record_invitation_resent(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.admin_record_invitation_resent(uuid, uuid)
to service_role;

comment on function public.admin_record_invitation_resent(uuid, uuid) is
  'Autoriza y audita un reenvío, con máximo un intento por usuario cada 60 segundos.';
