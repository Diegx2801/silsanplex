-- ============================================================
-- SILSANPLEX: operaciones administrativas de usuarios
-- ============================================================

-- Estas funciones solo pueden ser invocadas con la clave privada del backend.
-- La autorización del actor y el aislamiento por organización se vuelven a
-- comprobar dentro de PostgreSQL antes de modificar cualquier dato.

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
  join public.profiles profile
    on profile.id = membership.user_id
  join public.organizations organization
    on organization.id = membership.organization_id
  join public.user_roles user_role
    on user_role.organization_id = membership.organization_id
    and user_role.user_id = membership.user_id
    and user_role.role_code = 'ADMIN'
  where membership.user_id = actor_user_id
    and membership.is_active
    and profile.is_active
    and organization.is_active;

  if organization_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_ACCESS_REQUIRED';
  end if;

  if organization_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_ORGANIZATION_AMBIGUOUS';
  end if;

  select membership.organization_id
  into resolved_organization_id
  from public.organization_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
  join public.organizations organization
    on organization.id = membership.organization_id
  join public.user_roles user_role
    on user_role.organization_id = membership.organization_id
    and user_role.user_id = membership.user_id
    and user_role.role_code = 'ADMIN'
  where membership.user_id = actor_user_id
    and membership.is_active
    and profile.is_active
    and organization.is_active
  limit 1;

  return resolved_organization_id;
end;
$$;

create or replace function public.normalize_active_role_codes(
  requested_role_codes text[]
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_role_codes text[];
  invalid_role_count integer;
begin
  select coalesce(array_agg(distinct upper(btrim(role_code))), '{}'::text[])
  into normalized_role_codes
  from unnest(coalesce(requested_role_codes, '{}'::text[])) role_code
  where btrim(role_code) <> '';

  if cardinality(normalized_role_codes) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'AT_LEAST_ONE_ROLE_REQUIRED';
  end if;

  select count(*)
  into invalid_role_count
  from unnest(normalized_role_codes) requested_role
  left join public.roles role
    on role.code = requested_role
    and role.is_active
  where role.code is null;

  if invalid_role_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_OR_INACTIVE_ROLE';
  end if;

  return normalized_role_codes;
end;
$$;

create or replace function public.assert_admin_can_update_user(
  actor_user_id uuid,
  target_user_id uuid,
  requested_role_codes text[]
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  normalized_role_codes text[];
  target_has_admin_role boolean;
  active_admin_count integer;
begin
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  normalized_role_codes := public.normalize_active_role_codes(requested_role_codes);

  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = resolved_organization_id
      and membership.user_id = target_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'USER_NOT_FOUND_IN_ORGANIZATION';
  end if;

  select exists (
    select 1
    from public.user_roles
    where user_roles.organization_id = resolved_organization_id
      and user_id = target_user_id
      and role_code = 'ADMIN'
  )
  into target_has_admin_role;

  if actor_user_id = target_user_id
    and target_has_admin_role
    and not ('ADMIN' = any(normalized_role_codes)) then
    raise exception using
      errcode = 'P0001',
      message = 'SELF_ADMIN_ROLE_REMOVAL_FORBIDDEN';
  end if;

  if target_has_admin_role
    and not ('ADMIN' = any(normalized_role_codes)) then
    select count(distinct membership.user_id)
    into active_admin_count
    from public.organization_memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
    join public.user_roles user_role
      on user_role.organization_id = membership.organization_id
      and user_role.user_id = membership.user_id
      and user_role.role_code = 'ADMIN'
    where membership.organization_id = resolved_organization_id
      and membership.is_active
      and profile.is_active;

    if active_admin_count <= 1 then
      raise exception using
        errcode = 'P0001',
        message = 'LAST_ADMIN_ROLE_REMOVAL_FORBIDDEN';
    end if;
  end if;

  return resolved_organization_id;
end;
$$;

create or replace function public.admin_list_users(
  actor_user_id uuid
)
returns table (
  user_id uuid,
  organization_id uuid,
  email text,
  full_name text,
  phone text,
  is_active boolean,
  role_codes text[],
  created_at timestamptz,
  updated_at timestamptz
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
  select
    profile.id,
    membership.organization_id,
    profile.email,
    profile.full_name,
    profile.phone,
    membership.is_active and profile.is_active,
    coalesce(
      array_agg(user_role.role_code order by user_role.role_code)
        filter (where user_role.role_code is not null),
      '{}'::text[]
    ),
    membership.created_at,
    greatest(profile.updated_at, membership.updated_at)
  from public.organization_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
  left join public.user_roles user_role
    on user_role.organization_id = membership.organization_id
    and user_role.user_id = membership.user_id
  where membership.organization_id = resolved_organization_id
  group by
    profile.id,
    membership.organization_id,
    membership.is_active,
    membership.created_at,
    membership.updated_at
  order by profile.full_name, profile.email;
end;
$$;

create or replace function public.admin_create_user_membership(
  actor_user_id uuid,
  target_user_id uuid,
  requested_role_codes text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  normalized_role_codes text[];
begin
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  normalized_role_codes := public.normalize_active_role_codes(requested_role_codes);

  if not exists (
    select 1 from public.profiles where id = target_user_id and is_active
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ACTIVE_PROFILE_REQUIRED';
  end if;

  if exists (
    select 1
    from public.organization_memberships
    where organization_memberships.organization_id = resolved_organization_id
      and user_id = target_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'USER_ALREADY_BELONGS_TO_ORGANIZATION';
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    created_by
  )
  values (
    resolved_organization_id,
    target_user_id,
    actor_user_id
  );

  insert into public.user_roles (
    organization_id,
    user_id,
    role_code,
    assigned_by
  )
  select
    resolved_organization_id,
    target_user_id,
    role_code,
    actor_user_id
  from unnest(normalized_role_codes) role_code;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    new_values
  )
  values (
    resolved_organization_id,
    actor_user_id,
    'USER_CREATED',
    'ORGANIZATION_MEMBERSHIP',
    target_user_id::text,
    jsonb_build_object(
      'is_active', true,
      'role_codes', to_jsonb(normalized_role_codes)
    )
  );

  return resolved_organization_id;
end;
$$;

create or replace function public.admin_update_user_membership(
  actor_user_id uuid,
  target_user_id uuid,
  requested_email text,
  previous_email text,
  requested_full_name text,
  requested_phone text,
  requested_role_codes text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  normalized_role_codes text[];
  previous_profile jsonb;
  previous_role_codes text[];
begin
  if char_length(btrim(coalesce(requested_full_name, ''))) not between 2 and 150 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_FULL_NAME';
  end if;

  resolved_organization_id := public.assert_admin_can_update_user(
    actor_user_id,
    target_user_id,
    requested_role_codes
  );
  normalized_role_codes := public.normalize_active_role_codes(requested_role_codes);

  select to_jsonb(profile)
  into previous_profile
  from public.profiles profile
  where profile.id = target_user_id;

  select coalesce(array_agg(role_code order by role_code), '{}'::text[])
  into previous_role_codes
  from public.user_roles
  where user_roles.organization_id = resolved_organization_id
    and user_id = target_user_id;

  update public.profiles
  set
    full_name = btrim(requested_full_name),
    phone = nullif(btrim(coalesce(requested_phone, '')), '')
  where id = target_user_id;

  delete from public.user_roles
  where user_roles.organization_id = resolved_organization_id
    and user_id = target_user_id;

  insert into public.user_roles (
    organization_id,
    user_id,
    role_code,
    assigned_by
  )
  select
    resolved_organization_id,
    target_user_id,
    role_code,
    actor_user_id
  from unnest(normalized_role_codes) role_code;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  )
  values (
    resolved_organization_id,
    actor_user_id,
    'USER_UPDATED',
    'ORGANIZATION_MEMBERSHIP',
    target_user_id::text,
    jsonb_build_object(
      'email', lower(previous_email),
      'full_name', previous_profile ->> 'full_name',
      'phone', previous_profile ->> 'phone',
      'role_codes', to_jsonb(previous_role_codes)
    ),
    jsonb_build_object(
      'email', lower(requested_email),
      'full_name', btrim(requested_full_name),
      'phone', nullif(btrim(coalesce(requested_phone, '')), ''),
      'role_codes', to_jsonb(normalized_role_codes)
    )
  );

  return resolved_organization_id;
end;
$$;

create or replace function public.admin_set_user_membership_status(
  actor_user_id uuid,
  target_user_id uuid,
  requested_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  previous_is_active boolean;
  target_has_admin_role boolean;
  active_admin_count integer;
begin
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);

  select membership.is_active
  into previous_is_active
  from public.organization_memberships membership
  where membership.organization_id = resolved_organization_id
    and membership.user_id = target_user_id;

  if previous_is_active is null then
    raise exception using
      errcode = 'P0001',
      message = 'USER_NOT_FOUND_IN_ORGANIZATION';
  end if;

  if previous_is_active = requested_is_active then
    return resolved_organization_id;
  end if;

  if not requested_is_active and actor_user_id = target_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'SELF_DEACTIVATION_FORBIDDEN';
  end if;

  select exists (
    select 1
    from public.user_roles
    where user_roles.organization_id = resolved_organization_id
      and user_id = target_user_id
      and role_code = 'ADMIN'
  )
  into target_has_admin_role;

  if not requested_is_active and target_has_admin_role then
    select count(distinct membership.user_id)
    into active_admin_count
    from public.organization_memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
    join public.user_roles user_role
      on user_role.organization_id = membership.organization_id
      and user_role.user_id = membership.user_id
      and user_role.role_code = 'ADMIN'
    where membership.organization_id = resolved_organization_id
      and membership.is_active
      and profile.is_active;

    if active_admin_count <= 1 then
      raise exception using
        errcode = 'P0001',
        message = 'LAST_ADMIN_DEACTIVATION_FORBIDDEN';
    end if;
  end if;

  update public.organization_memberships
  set
    is_active = requested_is_active,
    deactivated_at = case when requested_is_active then null else now() end
  where organization_memberships.organization_id = resolved_organization_id
    and user_id = target_user_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  )
  values (
    resolved_organization_id,
    actor_user_id,
    case when requested_is_active then 'USER_REACTIVATED' else 'USER_DEACTIVATED' end,
    'ORGANIZATION_MEMBERSHIP',
    target_user_id::text,
    jsonb_build_object('is_active', previous_is_active),
    jsonb_build_object('is_active', requested_is_active)
  );

  return resolved_organization_id;
end;
$$;

create or replace function public.admin_record_password_reset(
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
    where organization_memberships.organization_id = resolved_organization_id
      and user_id = target_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'USER_NOT_FOUND_IN_ORGANIZATION';
  end if;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id
  )
  values (
    resolved_organization_id,
    actor_user_id,
    'PASSWORD_RESET_REQUESTED',
    'ORGANIZATION_MEMBERSHIP',
    target_user_id::text
  );

  return resolved_organization_id;
end;
$$;

create or replace function public.platform_bootstrap_organization_admin(
  organization_slug text,
  target_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  existing_admin_user_id uuid;
begin
  select id
  into resolved_organization_id
  from public.organizations
  where slug = organization_slug
    and is_active;

  if resolved_organization_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ACTIVE_ORGANIZATION_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.profiles where id = target_user_id and is_active
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ACTIVE_PROFILE_REQUIRED';
  end if;

  select membership.user_id
  into existing_admin_user_id
  from public.organization_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
  join public.user_roles user_role
    on user_role.organization_id = membership.organization_id
    and user_role.user_id = membership.user_id
    and user_role.role_code = 'ADMIN'
  where membership.organization_id = resolved_organization_id
    and membership.is_active
    and profile.is_active
  limit 1;

  if existing_admin_user_id is not null then
    if existing_admin_user_id = target_user_id then
      return resolved_organization_id;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'BOOTSTRAP_ALREADY_COMPLETED';
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    created_by
  )
  values (
    resolved_organization_id,
    target_user_id,
    null
  )
  on conflict (organization_id, user_id)
  do update set
    is_active = true,
    deactivated_at = null;

  insert into public.user_roles (
    organization_id,
    user_id,
    role_code,
    assigned_by
  )
  values (
    resolved_organization_id,
    target_user_id,
    'ADMIN',
    null
  )
  on conflict (organization_id, user_id, role_code) do nothing;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    new_values,
    metadata
  )
  values (
    resolved_organization_id,
    null,
    'ADMIN_BOOTSTRAPPED',
    'ORGANIZATION_MEMBERSHIP',
    target_user_id::text,
    jsonb_build_object('role_codes', jsonb_build_array('ADMIN')),
    jsonb_build_object('source', 'bootstrap-script')
  );

  return resolved_organization_id;
end;
$$;

revoke all on function public.resolve_admin_organization(uuid) from public, anon, authenticated;
revoke all on function public.normalize_active_role_codes(text[]) from public, anon, authenticated;
revoke all on function public.assert_admin_can_update_user(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.admin_list_users(uuid) from public, anon, authenticated;
revoke all on function public.admin_create_user_membership(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.admin_update_user_membership(uuid, uuid, text, text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.admin_set_user_membership_status(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_record_password_reset(uuid, uuid) from public, anon, authenticated;
revoke all on function public.platform_bootstrap_organization_admin(text, uuid) from public, anon, authenticated;

grant execute on function public.resolve_admin_organization(uuid) to service_role;
grant execute on function public.normalize_active_role_codes(text[]) to service_role;
grant execute on function public.assert_admin_can_update_user(uuid, uuid, text[]) to service_role;
grant execute on function public.admin_list_users(uuid) to service_role;
grant execute on function public.admin_create_user_membership(uuid, uuid, text[]) to service_role;
grant execute on function public.admin_update_user_membership(uuid, uuid, text, text, text, text, text[]) to service_role;
grant execute on function public.admin_set_user_membership_status(uuid, uuid, boolean) to service_role;
grant execute on function public.admin_record_password_reset(uuid, uuid) to service_role;
grant execute on function public.platform_bootstrap_organization_admin(text, uuid) to service_role;

comment on function public.admin_list_users(uuid) is
  'Lista usuarios del tenant administrado por el actor; uso exclusivo del backend.';

comment on function public.platform_bootstrap_organization_admin(text, uuid) is
  'Asigna una sola vez el primer administrador de una organización; uso operativo de plataforma.';
