begin;

alter table public.profiles
  add column password_changed_at timestamptz;

comment on column public.profiles.password_changed_at is
  'Server timestamp used to invalidate Auth sessions created before a completed password recovery.';

-- A recovery URL is not an authorization boundary: its fragment can be edited
-- after Supabase has established a recovery session. Gate that signed session
-- in both RLS and the frontend's current-session status RPC.
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
      and not coalesce(
        (auth.jwt() -> 'amr') @> '[{"method":"recovery"}]'::jsonb,
        false
      )
  );
$$;

-- Edge Functions use this service-only check after validating the JWT with
-- Auth. A recovery session can finish after the password timestamp is stored;
-- all older ordinary sessions are rejected even if global sign-out fails.
create function public.is_auth_session_current_after_password_change(
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
      and (
        allow_recovery_session
        or profile.password_changed_at is null
        or session.created_at > profile.password_changed_at
      )
  );
$$;

revoke all on function public.is_auth_session_current_after_password_change(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.is_auth_session_current_after_password_change(uuid, uuid, boolean)
  to service_role;

create function public.record_user_password_change(target_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_at timestamptz;
begin
  if target_user_id is null then
    raise exception using errcode = '22023', message = 'INVALID_USER_ID';
  end if;

  update public.profiles
  set password_changed_at = clock_timestamp(), updated_at = now()
  where id = target_user_id
    and is_active
    and auth_confirmed_at is not null;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTIVE_CONFIRMED_PROFILE_REQUIRED';
  end if;

  select profile.password_changed_at
  into recorded_at
  from public.profiles profile
  where profile.id = target_user_id;

  return recorded_at;
end;
$$;

revoke all on function public.record_user_password_change(uuid)
  from public, anon, authenticated;
grant execute on function public.record_user_password_change(uuid)
  to service_role;

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
        or coalesce(
          (auth.jwt() -> 'amr') @> '[{"method":"recovery"}]'::jsonb,
          false
        )
      )
  );
$$;

comment on function public.current_auth_session_is_active() is
  'True only for a live Auth session outside invitation setup and password recovery.';
comment on function public.current_user_password_setup_required() is
  'Reports whether the current session must complete invitation setup or password recovery.';

commit;
