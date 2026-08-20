-- ============================================================
-- SILSANPLEX: membresía activa única y permisos extensibles
-- ============================================================

-- El MVP resuelve una sola organización activa por identidad. Las membresías
-- históricas inactivas se conservan y no participan en esta restricción.
do $$
begin
  if exists (
    select 1
    from public.organization_memberships
    where is_active
    group by user_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MULTIPLE_ACTIVE_MEMBERSHIPS_FOUND';
  end if;
end;
$$;

create unique index organization_memberships_one_active_per_user_idx
  on public.organization_memberships (user_id)
  where is_active;

comment on index public.organization_memberships_one_active_per_user_idx is
  'Garantiza una sola organización activa por identidad sin eliminar membresías históricas.';

-- Catálogo global de capacidades. Se agregan códigos cuando exista una regla
-- funcional confirmada; los roles se vinculan mediante role_permissions.
create table public.permissions (
  code text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint permissions_code_format
    check (code ~ '^[A-Z][A-Z0-9_]*$'),

  constraint permissions_name_not_blank
    check (char_length(btrim(name)) between 2 and 100)
);

comment on table public.permissions is
  'Catálogo extensible de capacidades autorizables del sistema.';

create table public.role_permissions (
  role_code text not null
    references public.roles(code) on delete restrict,

  permission_code text not null
    references public.permissions(code) on delete restrict,

  created_at timestamptz not null default now(),

  primary key (role_code, permission_code)
);

create index role_permissions_permission_code_idx
  on public.role_permissions (permission_code);

comment on table public.role_permissions is
  'Capacidades globales concedidas a cada rol activo.';

insert into public.permissions (code, name, description)
values (
  'USERS_MANAGE',
  'Administrar usuarios',
  'Listar, invitar, editar, activar y recuperar cuentas de la organización.'
);

insert into public.role_permissions (role_code, permission_code)
values ('ADMIN', 'USERS_MANAGE');

-- Las operaciones administrativas antiguas se alinean con el nuevo contrato
-- de capacidades. La Edge Function usa service_role y transmite el actor ya
-- validado; PostgreSQL vuelve a comprobar aquí su membresía y permiso efectivo.
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
  select
    count(distinct membership.organization_id),
    min(membership.organization_id::text)::uuid
  into organization_count, resolved_organization_id
  from public.organization_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
  join public.organizations organization
    on organization.id = membership.organization_id
  join public.user_roles user_role
    on user_role.organization_id = membership.organization_id
    and user_role.user_id = membership.user_id
  join public.roles role
    on role.code = user_role.role_code
    and role.is_active
  join public.role_permissions role_permission
    on role_permission.role_code = role.code
    and role_permission.permission_code = 'USERS_MANAGE'
  join public.permissions permission
    on permission.code = role_permission.permission_code
    and permission.is_active
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

  return resolved_organization_id;
end;
$$;

create or replace function public.is_organization_admin(
  requested_organization_id uuid
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
    join public.user_roles user_role
      on user_role.organization_id = membership.organization_id
      and user_role.user_id = membership.user_id
    join public.roles role
      on role.code = user_role.role_code
      and role.code = 'ADMIN'
      and role.is_active
    join public.profiles profile
      on profile.id = membership.user_id
    join public.organizations organization
      on organization.id = membership.organization_id
    where membership.user_id = auth.uid()
      and membership.organization_id = requested_organization_id
      and membership.is_active
      and profile.is_active
      and organization.is_active
  );
$$;

create or replace function public.can_manage_user(
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
    from public.organization_memberships manager_membership
    join public.user_roles manager_role
      on manager_role.organization_id = manager_membership.organization_id
      and manager_role.user_id = manager_membership.user_id
    join public.roles role
      on role.code = manager_role.role_code
      and role.is_active
    join public.role_permissions role_permission
      on role_permission.role_code = role.code
      and role_permission.permission_code = 'USERS_MANAGE'
    join public.permissions permission
      on permission.code = role_permission.permission_code
      and permission.is_active
    join public.profiles manager_profile
      on manager_profile.id = manager_membership.user_id
    join public.organizations organization
      on organization.id = manager_membership.organization_id
    join public.organization_memberships managed_membership
      on managed_membership.organization_id = manager_membership.organization_id
    where manager_membership.user_id = auth.uid()
      and manager_membership.is_active
      and manager_profile.is_active
      and organization.is_active
      and managed_membership.user_id = requested_user_id
  );
$$;

-- La identidad y organización no son parámetros controlables: se derivan del
-- JWT y de la única membresía activa. Una identidad sin acceso vigente recibe
-- un arreglo vacío.
create or replace function public.current_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(distinct permission.code order by permission.code),
    '{}'::text[]
  )
  from public.organization_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
  join public.organizations organization
    on organization.id = membership.organization_id
  join public.user_roles user_role
    on user_role.organization_id = membership.organization_id
    and user_role.user_id = membership.user_id
  join public.roles role
    on role.code = user_role.role_code
  join public.role_permissions role_permission
    on role_permission.role_code = role.code
  join public.permissions permission
    on permission.code = role_permission.permission_code
  where membership.user_id = auth.uid()
    and membership.is_active
    and profile.is_active
    and organization.is_active
    and role.is_active
    and permission.is_active;
$$;

comment on function public.current_user_permissions() is
  'Devuelve las capacidades efectivas de la identidad autenticada en su única organización activa.';

revoke all on function public.current_user_permissions() from public, anon, authenticated;
grant execute on function public.current_user_permissions() to authenticated;

-- create or replace conserva los privilegios anteriores: estas revocaciones
-- documentan y refuerzan explícitamente la superficie esperada.
revoke all on function public.resolve_admin_organization(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_admin_organization(uuid) to service_role;

revoke all on function public.is_organization_admin(uuid) from public;
revoke all on function public.can_manage_user(uuid) from public;
grant execute on function public.is_organization_admin(uuid) to authenticated;
grant execute on function public.can_manage_user(uuid) to authenticated;

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

-- El frontend consume únicamente current_user_permissions(). No se conceden
-- accesos directos a los catálogos ni políticas que expongan su configuración.
revoke all on table public.permissions from anon, authenticated;
revoke all on table public.role_permissions from anon, authenticated;

-- El service_role solo se usa en Edge Functions y fixtures locales de E2E.
-- Sus privilegios se declaran explícitamente porque RLS no sustituye a los
-- privilegios SQL y una tabla puede rechazar la consulta REST aun con bypass
-- de RLS si no existe GRANT para este rol.
grant select, insert, update, delete on table
  public.organizations,
  public.profiles,
  public.organization_memberships,
  public.user_roles,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.audit_events
to service_role;
