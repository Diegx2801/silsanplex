-- Registra en el esquema público si la identidad ya aceptó su invitación.
-- auth.users continúa siendo la fuente de verdad; este dato permite aplicar
-- RLS y mostrar el estado sin exponer el esquema interno de Auth al frontend.

alter table public.profiles
add column auth_confirmed_at timestamptz;

update public.profiles profile
set auth_confirmed_at = auth_user.email_confirmed_at
from auth.users auth_user
where auth_user.id = profile.id;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  profile_phone text;
begin
  if new.email is null or btrim(new.email) = '' then
    raise exception 'SILSANPLEX requiere una dirección de correo';
  end if;

  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  );
  profile_phone := nullif(
    btrim(coalesce(new.raw_user_meta_data ->> 'phone', new.phone)),
    ''
  );

  insert into public.profiles (
    id, email, full_name, phone, is_active, auth_confirmed_at, created_at, updated_at
  )
  values (
    new.id,
    lower(new.email),
    profile_name,
    profile_phone,
    true,
    new.email_confirmed_at,
    coalesce(new.created_at, now()),
    now()
  );

  return new;
end;
$$;

create or replace function public.handle_auth_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or btrim(new.email) = '' then
    raise exception 'SILSANPLEX requiere una dirección de correo';
  end if;

  update public.profiles
  set
    email = lower(new.email),
    auth_confirmed_at = new.email_confirmed_at
  where id = new.id;

  return new;
end;
$$;

drop trigger auth_user_updated_sync_email on auth.users;

create trigger auth_user_updated_sync_profile
after update of email, email_confirmed_at on auth.users
for each row
execute function public.handle_auth_user_email_update();

comment on column public.profiles.auth_confirmed_at is
  'Fecha en que Supabase Auth confirmó el correo; nulo mientras la invitación está pendiente.';

create function public.admin_record_invitation_resent(
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
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'USER_NOT_FOUND_IN_ORGANIZATION';
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
