begin;

alter table public.profiles
  add column password_recovery_requested_at timestamptz;

comment on column public.profiles.password_recovery_requested_at is
  'Server timestamp for the latest administrator-authorized password recovery request.';

-- Auth uses the implicit flow for email actions sent by the server-side admin
-- client. Those sessions carry amr=otp, so the database must also require a
-- matching server-recorded recovery request before permitting a password reset.
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
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.organization_id = resolved_organization_id
      and membership.user_id = target_user_id
      and profile.is_active
      and profile.auth_confirmed_at is not null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'USER_NOT_FOUND_IN_ORGANIZATION';
  end if;

  update public.profiles
  set password_recovery_requested_at = clock_timestamp(),
      updated_at = now()
  where id = target_user_id
    and is_active
    and auth_confirmed_at is not null;

  if not found then
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

-- The client may use the password form only when it has a verified email
-- action session and the database records the corresponding onboarding or
-- recovery state. Recovery requests are time-limited to the default one-hour
-- Supabase email OTP lifetime.
create or replace function public.is_auth_session_current_after_password_change(
  requested_session_id uuid,
  requested_user_id uuid,
  allow_recovery_session boolean
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
    join public.profiles profile on profile.id = session.user_id
    where session.id = requested_session_id
      and session.user_id = requested_user_id
      and profile.is_active
      and (
        (
          allow_recovery_session
          and (
            profile.password_setup_required
            or (
              profile.password_recovery_requested_at is not null
              and profile.password_recovery_requested_at > now() - interval '1 hour'
              and session.created_at >= profile.password_recovery_requested_at
            )
          )
        )
        or (
          not allow_recovery_session
          and (
            profile.password_changed_at is null
            or session.created_at > profile.password_changed_at
          )
        )
      )
  );
$$;

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
    join public.profiles profile on profile.id = session.user_id
    where session.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and session.user_id = auth.uid()
      and profile.is_active
      and not profile.password_setup_required
      and (
        profile.password_changed_at is null
        or session.created_at > profile.password_changed_at
      )
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) method
        where coalesce(method.value ->> 'method', trim(both '"' from method.value::text))
          = any (array['otp', 'recovery', 'invite', 'magiclink', 'email/signup'])
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
      and (
        profile.password_setup_required
        or (
          profile.password_recovery_requested_at is not null
          and profile.password_recovery_requested_at > now() - interval '1 hour'
          and session.created_at >= profile.password_recovery_requested_at
          and exists (
            select 1
            from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) method
            where coalesce(method.value ->> 'method', trim(both '"' from method.value::text))
              = any (array['otp', 'recovery', 'invite'])
          )
        )
      )
  );
$$;

create function public.complete_user_password_recovery(target_user_id uuid)
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
  set password_recovery_requested_at = null,
      updated_at = now()
  where id = target_user_id
    and is_active
    and auth_confirmed_at is not null
    and password_recovery_requested_at is not null;

  if found then
    return true;
  end if;

  if exists (
    select 1
    from public.profiles
    where id = target_user_id
      and is_active
      and auth_confirmed_at is not null
      and password_recovery_requested_at is null
      and password_changed_at is not null
  ) then
    return true;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'PASSWORD_RECOVERY_NOT_PENDING';
end;
$$;

revoke all on function public.is_auth_session_current_after_password_change(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.is_auth_session_current_after_password_change(uuid, uuid, boolean)
  to service_role;

revoke all on function public.complete_user_password_recovery(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_user_password_recovery(uuid)
  to service_role;

comment on function public.current_auth_session_is_active() is
  'True only for active password-authenticated sessions outside invitation and email-action flows.';
comment on function public.current_user_password_setup_required() is
  'Reports pending invitation setup or a recent administrator-authorized recovery email session.';

commit;
