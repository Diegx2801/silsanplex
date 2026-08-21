-- ============================================================
-- SILSANPLEX: infraestructura segura para consultas RUC
-- ============================================================

create table public.ruc_lookup_cache (
  id uuid primary key default gen_random_uuid(),
  ruc text not null unique,
  legal_name text not null,
  taxpayer_status text,
  domicile_condition text,
  ubigeo_code text,
  fiscal_address text,
  source text not null,
  source_checked_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),

  constraint ruc_lookup_cache_ruc_format
    check (ruc ~ '^[0-9]{11}$'),
  constraint ruc_lookup_cache_legal_name_not_blank
    check (char_length(btrim(legal_name)) between 2 and 160),
  constraint ruc_lookup_cache_ubigeo_format
    check (ubigeo_code is null or ubigeo_code ~ '^[0-9]{6}$'),
  constraint ruc_lookup_cache_source_not_blank
    check (char_length(btrim(source)) between 2 and 40),
  constraint ruc_lookup_cache_expiration_valid
    check (expires_at > source_checked_at)
);

create index ruc_lookup_cache_expiration_idx
  on public.ruc_lookup_cache (expires_at);

create trigger ruc_lookup_cache_set_updated_at
before update on public.ruc_lookup_cache
for each row execute function public.set_updated_at();

create table public.ruc_lookup_rate_limits (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),

  constraint ruc_lookup_rate_limits_request_count_valid
    check (request_count > 0)
);

create trigger ruc_lookup_rate_limits_set_updated_at
before update on public.ruc_lookup_rate_limits
for each row execute function public.set_updated_at();

create or replace function public.resolve_edge_user_organization_permission(
  requested_user_id uuid,
  requested_permission text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  resolved_count integer;
begin
  if requested_user_id is null or nullif(btrim(requested_permission), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_AUTHORIZATION_REQUEST';
  end if;

  select min(membership.organization_id::text)::uuid, count(distinct membership.organization_id)
    into resolved_organization_id, resolved_count
  from public.organization_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
    and profile.is_active
  join public.organizations organization
    on organization.id = membership.organization_id
    and organization.is_active
  join public.user_roles user_role
    on user_role.organization_id = membership.organization_id
    and user_role.user_id = membership.user_id
  join public.roles role
    on role.code = user_role.role_code
    and role.is_active
  join public.role_permissions role_permission
    on role_permission.role_code = role.code
  join public.permissions permission
    on permission.code = role_permission.permission_code
    and permission.is_active
  where membership.user_id = requested_user_id
    and membership.is_active
    and permission.code = requested_permission;

  if resolved_count = 0 then
    raise exception using errcode = '42501', message = 'CUSTOMER_PERMISSION_REQUIRED';
  end if;
  if resolved_count > 1 then
    raise exception using errcode = '21000', message = 'ACTIVE_ORGANIZATION_AMBIGUOUS';
  end if;

  return resolved_organization_id;
end;
$$;

create or replace function public.consume_ruc_lookup_rate_limit(
  requested_organization_id uuid,
  requested_user_id uuid,
  requested_limit integer default 30,
  requested_window_seconds integer default 60
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_count integer;
  window_interval interval;
begin
  if requested_limit not between 1 and 1000
    or requested_window_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT_CONFIGURATION';
  end if;

  window_interval := make_interval(secs => requested_window_seconds);

  insert into public.ruc_lookup_rate_limits (
    organization_id,
    user_id,
    window_started_at,
    request_count
  ) values (
    requested_organization_id,
    requested_user_id,
    clock_timestamp(),
    1
  )
  on conflict (organization_id, user_id) do update set
    window_started_at = case
      when public.ruc_lookup_rate_limits.window_started_at + window_interval <= clock_timestamp()
        then clock_timestamp()
      else public.ruc_lookup_rate_limits.window_started_at
    end,
    request_count = case
      when public.ruc_lookup_rate_limits.window_started_at + window_interval <= clock_timestamp()
        then 1
      else public.ruc_lookup_rate_limits.request_count + 1
    end
  returning request_count into current_count;

  return current_count <= requested_limit;
end;
$$;

create or replace function public.record_ruc_lookup_audit(
  requested_organization_id uuid,
  requested_actor_user_id uuid,
  requested_ruc text,
  requested_source text,
  requested_cache_hit boolean,
  requested_success boolean
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    requested_organization_id,
    requested_actor_user_id,
    case when requested_success then 'RUC_LOOKUP_COMPLETED' else 'RUC_LOOKUP_FAILED' end,
    'ruc_lookup',
    requested_ruc,
    jsonb_build_object(
      'source', requested_source,
      'cacheHit', requested_cache_hit
    )
  );
$$;

alter table public.ruc_lookup_cache enable row level security;
alter table public.ruc_lookup_rate_limits enable row level security;

-- Las tablas internas no se exponen al navegador. Solo las Edge Functions
-- autenticadas acceden mediante la clave de servidor.
revoke all on table public.ruc_lookup_cache, public.ruc_lookup_rate_limits
  from public, anon, authenticated;
grant select, insert, update, delete on table public.ruc_lookup_cache, public.ruc_lookup_rate_limits
  to service_role;

revoke all on function public.resolve_edge_user_organization_permission(uuid, text)
  from public, anon, authenticated;
revoke all on function public.consume_ruc_lookup_rate_limit(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.record_ruc_lookup_audit(uuid, uuid, text, text, boolean, boolean)
  from public, anon, authenticated;

grant execute on function public.resolve_edge_user_organization_permission(uuid, text)
  to service_role;
grant execute on function public.consume_ruc_lookup_rate_limit(uuid, uuid, integer, integer)
  to service_role;
grant execute on function public.record_ruc_lookup_audit(uuid, uuid, text, text, boolean, boolean)
  to service_role;

comment on table public.ruc_lookup_cache is
  'Caché global y acotada de contribuyentes consultados; no contiene el padrón completo.';
comment on table public.ruc_lookup_rate_limits is
  'Ventanas de cuota por usuario y organización para proteger el proveedor RUC.';
