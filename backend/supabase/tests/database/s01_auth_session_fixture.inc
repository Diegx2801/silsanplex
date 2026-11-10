-- Test-only helpers for legacy pgTAP fixtures. These create real Auth session
-- rows and matching JWT claims; production authorization remains unchanged.
create or replace function pg_temp.s01_seed_auth_session(requested_actor text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := nullif(requested_actor, '')::uuid;
begin
  if actor_id is null then
    return null;
  end if;

  insert into auth.users (id, email)
  values (actor_id, actor_id::text || '@s01-fixture.invalid')
  on conflict (id) do nothing;

  insert into auth.sessions (id, user_id, created_at, updated_at)
  values (actor_id, actor_id, pg_catalog.now(), pg_catalog.now())
  on conflict (id) do nothing;

  if not exists (
    select 1
    from auth.sessions session
    where session.id = actor_id
      and session.user_id = actor_id
  ) then
    raise exception 'S01 test session fixture conflicts for actor %', actor_id;
  end if;

  return actor_id;
end;
$function$;

create or replace function pg_temp.s01_set_authenticated_actor(
  requested_actor text,
  is_local boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := nullif(requested_actor, '')::uuid;
  claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
  token_role text;
  active_session_id uuid;
begin
  token_role := coalesce(
    nullif(claims ->> 'role', ''),
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    'authenticated'
  );

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(actor_id::text, ''),
    is_local
  );

  if actor_id is null or token_role <> 'authenticated' then
    return coalesce(actor_id::text, '');
  end if;

  active_session_id := pg_temp.s01_seed_auth_session(actor_id::text);
  claims := claims || pg_catalog.jsonb_build_object(
    'sub', actor_id::text,
    'role', 'authenticated',
    'session_id', active_session_id::text
  );
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', is_local);
  return pg_catalog.set_config('request.jwt.claims', claims::text, is_local);
end;
$function$;

create or replace function pg_temp.s01_set_authenticated_claims(
  requested_claims text,
  is_local boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  claims jsonb := coalesce(nullif(requested_claims, '')::jsonb, '{}'::jsonb);
  actor_id uuid := nullif(claims ->> 'sub', '')::uuid;
  token_role text := coalesce(nullif(claims ->> 'role', ''), 'authenticated');
  active_session_id uuid;
begin
  if token_role = 'authenticated' and actor_id is not null then
    active_session_id := pg_temp.s01_seed_auth_session(actor_id::text);
    claims := claims || pg_catalog.jsonb_build_object(
      'sub', actor_id::text,
      'role', 'authenticated',
      'session_id', active_session_id::text
    );
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(actor_id::text, ''),
    is_local
  );
  if token_role <> '' then
    perform pg_catalog.set_config('request.jwt.claim.role', token_role, is_local);
  end if;
  return pg_catalog.set_config('request.jwt.claims', claims::text, is_local);
end;
$function$;
