-- Invited accounts may receive a valid Auth session before they choose a
-- password. Keep that session limited to password setup until the server marks
-- onboarding complete.
begin;

alter table public.profiles
  add column password_setup_required boolean not null default false,
  add column password_setup_completed_at timestamptz;

-- Older invitations predate this marker. Require invited identities already in
-- the project to pass through password setup once, closing the legacy gap.
update public.profiles profile
set password_setup_required = true
from auth.users auth_user
where auth_user.id = profile.id
  and auth_user.invited_at is not null
  and coalesce(auth_user.encrypted_password, '') = '';

comment on column public.profiles.password_setup_required is
  'Blocks application access until an invited account sets its own password.';
comment on column public.profiles.password_setup_completed_at is
  'Server-recorded time when the invited account completed password setup.';

-- The auth trigger must persist the pending state at identity creation time;
-- marking it later from the client would leave a window with full access.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  profile_phone text;
  setup_required boolean;
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
  setup_required := new.invited_at is not null
    or coalesce(new.raw_user_meta_data ->> 'silsan_password_setup_required' = 'true', false);

  insert into public.profiles (
    id, email, full_name, phone, is_active, auth_confirmed_at,
    password_setup_required, created_at, updated_at
  )
  values (
    new.id,
    lower(new.email),
    profile_name,
    profile_phone,
    true,
    new.email_confirmed_at,
    setup_required,
    coalesce(new.created_at, now()),
    now()
  );

  return new;
end;
$$;

-- This helper is the common gate used by RLS and current-user permission
-- helpers. An invitation session is real, but it is not yet an app session.
create or replace function public.current_auth_session_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions session
    where session.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and session.user_id = auth.uid()
      and exists (
        select 1
        from public.profiles profile
        where profile.id = session.user_id
          and profile.is_active
          and not profile.password_setup_required
      )
  );
$$;

create or replace function public.current_user_password_setup_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions session
    join public.profiles profile on profile.id = session.user_id
    where session.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and session.user_id = auth.uid()
      and profile.is_active
      and profile.password_setup_required
  );
$$;

revoke all on function public.current_user_password_setup_required()
  from public, anon, authenticated;
grant execute on function public.current_user_password_setup_required()
  to authenticated;

-- Called only by the authenticated account-setup Edge Function after Auth
-- successfully changes the password. It is intentionally not executable by
-- browser roles.
create or replace function public.complete_user_password_setup(
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user_id is null then
    raise exception using errcode = '22023', message = 'INVALID_USER_ID';
  end if;

  update public.profiles
  set
    password_setup_required = false,
    password_setup_completed_at = now()
  where id = target_user_id
    and is_active
    and auth_confirmed_at is not null
    and password_setup_required;

  if found then
    return true;
  end if;

  if exists (
    select 1 from public.profiles
    where id = target_user_id
      and is_active
      and auth_confirmed_at is not null
      and not password_setup_required
      and password_setup_completed_at is not null
  ) then
    return true;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'PASSWORD_SETUP_NOT_PENDING_OR_EMAIL_NOT_CONFIRMED';
end;
$$;

revoke all on function public.complete_user_password_setup(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_user_password_setup(uuid)
  to service_role;

-- Explicit-subject permission checks are used by trusted Edge Functions; they
-- must also reject invited users whose password setup is still pending.
create or replace function public.user_has_organization_permission(
  requested_organization_id uuid,
  requested_user_id uuid,
  requested_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    join public.organizations organization on organization.id = membership.organization_id
    join public.permissions permission
      on permission.code = requested_permission_code and permission.is_active
    where membership.organization_id = requested_organization_id
      and membership.user_id = requested_user_id
      and membership.is_active
      and profile.is_active
      and not profile.password_setup_required
      and organization.is_active
      and (
        exists (
          select 1
          from public.organization_user_permissions direct_permission
          where direct_permission.organization_id = membership.organization_id
            and direct_permission.user_id = membership.user_id
            and direct_permission.permission_code = permission.code
        )
        or exists (
          select 1
          from public.user_roles user_role
          join public.roles role on role.code = user_role.role_code and role.is_active
          join public.role_permissions role_permission
            on role_permission.role_code = role.code
           and role_permission.permission_code = permission.code
          where user_role.organization_id = membership.organization_id
            and user_role.user_id = membership.user_id
        )
      )
  );
$$;

-- Administrative operations take an explicit actor ID from the trusted Edge
-- Function. Do not let a pending initial administrator manage the tenant.
create or replace function public.resolve_admin_organization(
  actor_user_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  organization_count integer;
begin
  select count(distinct membership.organization_id)
  into organization_count
  from public.organization_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  join public.organizations organization on organization.id = membership.organization_id
  join public.user_roles user_role
    on user_role.organization_id = membership.organization_id
   and user_role.user_id = membership.user_id
   and user_role.role_code = 'ADMIN'
  where membership.user_id = actor_user_id
    and membership.is_active
    and profile.is_active
    and not profile.password_setup_required
    and organization.is_active;

  if organization_count = 0 then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_REQUIRED';
  end if;
  if organization_count > 1 then
    raise exception using errcode = 'P0001', message = 'ADMIN_ORGANIZATION_AMBIGUOUS';
  end if;

  select membership.organization_id
  into resolved_organization_id
  from public.organization_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  join public.organizations organization on organization.id = membership.organization_id
  join public.user_roles user_role
    on user_role.organization_id = membership.organization_id
   and user_role.user_id = membership.user_id
   and user_role.role_code = 'ADMIN'
  where membership.user_id = actor_user_id
    and membership.is_active
    and profile.is_active
    and not profile.password_setup_required
    and organization.is_active
  limit 1;

  return resolved_organization_id;
end;
$$;

create function public.admin_list_user_onboarding_statuses(
  actor_user_id uuid
)
returns table (
  user_id uuid,
  password_setup_required boolean
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
  select profile.id, profile.password_setup_required
  from public.organization_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.organization_id = resolved_organization_id;
end;
$$;

revoke all on function public.admin_list_user_onboarding_statuses(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_list_user_onboarding_statuses(uuid)
  to service_role;

-- The existing S01 restrictive policies on public tables and Storage call
-- current_auth_session_is_active(); replacing that helper extends the same
-- database-level gate without adding duplicate policies.

comment on function public.current_auth_session_is_active() is
  'True only for a live Auth session that is not blocked by pending password setup.';
comment on function public.current_user_password_setup_required() is
  'Reports the current authenticated user’s pending invitation password setup state.';

commit;
