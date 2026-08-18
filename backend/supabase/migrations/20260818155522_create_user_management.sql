-- ============================================================
-- SILSANPLEX: base de control de usuarios
-- ============================================================

-- ------------------------------------------------------------
-- 1. Organizaciones
-- ------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organizations_name_not_blank
    check (char_length(btrim(name)) between 2 and 150),

  constraint organizations_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

comment on table public.organizations is
  'Empresas u organizaciones que operan dentro de SILSANPLEX.';

comment on column public.organizations.is_active is
  'Estado global de la empresa, administrado únicamente por la plataforma.';

-- Organización inicial. Se podrán agregar otras posteriormente.
insert into public.organizations (name, slug)
values ('Droguería SILSAN S.A.C.', 'drogueria-silsan');

-- ------------------------------------------------------------
-- 2. Perfiles vinculados con Supabase Auth
-- ------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_email_not_blank
    check (char_length(btrim(email)) > 3),

  constraint profiles_full_name_not_blank
    check (char_length(btrim(full_name)) between 2 and 150),

  constraint profiles_deactivation_consistency
    check (
      (is_active = true and deactivated_at is null)
      or
      (is_active = false and deactivated_at is not null)
    )
);

create unique index profiles_email_lower_unique
  on public.profiles (lower(email));

comment on table public.profiles is
  'Información administrativa complementaria de auth.users.';

comment on column public.profiles.is_active is
  'Bloqueo global de la identidad, reservado para la administración de la plataforma.';

-- ------------------------------------------------------------
-- 3. Roles
-- ------------------------------------------------------------

create table public.roles (
  code text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint roles_code_format
    check (code ~ '^[A-Z][A-Z0-9_]*$'),

  constraint roles_name_not_blank
    check (char_length(btrim(name)) between 2 and 100)
);

insert into public.roles (code, name, description)
values
  ('ADMIN', 'Administración', 'Control total de usuarios y configuración.'),
  ('GERENCIA', 'Gerencia', 'Consulta gerencial y supervisión.'),
  ('LOGISTICA', 'Logística', 'Gestión logística general.'),
  ('ALMACEN', 'Almacén', 'Control de almacenes e inventario.'),
  ('COMPRAS', 'Compras', 'Gestión de proveedores y compras.'),
  ('VENTAS', 'Ventas', 'Gestión de clientes, cotizaciones y ventas.'),
  ('CONTABILIDAD', 'Contabilidad', 'Acceso a operaciones contables autorizadas.');

-- ------------------------------------------------------------
-- 4. Membresías y asignación de roles
-- ------------------------------------------------------------

create table public.organization_memberships (
  organization_id uuid not null
    references public.organizations(id) on delete restrict,

  user_id uuid not null
    references public.profiles(id) on delete cascade,

  is_active boolean not null default true,
  deactivated_at timestamptz,

  created_by uuid
    references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (organization_id, user_id),

  constraint organization_memberships_deactivation_consistency
    check (
      (is_active = true and deactivated_at is null)
      or
      (is_active = false and deactivated_at is not null)
    )
);

create index organization_memberships_user_id_idx
  on public.organization_memberships (user_id);

create index organization_memberships_active_organization_idx
  on public.organization_memberships (organization_id, is_active);

comment on table public.organization_memberships is
  'Vincula una identidad con una organización y controla su acceso dentro de ella.';

create table public.user_roles (
  organization_id uuid not null,

  user_id uuid not null,

  role_code text not null
    references public.roles(code) on delete restrict,

  assigned_by uuid
    references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),

  primary key (organization_id, user_id, role_code),

  constraint user_roles_membership_fk
    foreign key (organization_id, user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete cascade
);

create index user_roles_user_id_idx
  on public.user_roles (user_id);

create index user_roles_organization_role_idx
  on public.user_roles (organization_id, role_code);

comment on table public.user_roles is
  'Roles asignados a una membresía activa o inactiva dentro de una organización.';

-- ------------------------------------------------------------
-- 5. Auditoría
-- ------------------------------------------------------------

create table public.audit_events (
  id bigint generated always as identity primary key,

  organization_id uuid
    references public.organizations(id) on delete restrict,

  actor_user_id uuid
    references auth.users(id) on delete set null,

  action text not null,
  entity_type text not null,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint audit_events_action_not_blank
    check (char_length(btrim(action)) > 0),

  constraint audit_events_entity_type_not_blank
    check (char_length(btrim(entity_type)) > 0)
);

create index audit_events_organization_created_idx
  on public.audit_events (organization_id, created_at desc);

create index audit_events_actor_created_idx
  on public.audit_events (actor_user_id, created_at desc);

comment on table public.audit_events is
  'Historial inmutable de operaciones sensibles del sistema.';

-- ------------------------------------------------------------
-- 6. Actualización automática de updated_at
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row
execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 7. Crear perfil automáticamente desde auth.users
-- ------------------------------------------------------------

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
    btrim(
      coalesce(
        new.raw_user_meta_data ->> 'phone',
        new.phone
      )
    ),
    ''
  );

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    is_active,
    created_at,
    updated_at
  )
  values (
    new.id,
    lower(new.email),
    profile_name,
    profile_phone,
    true,
    coalesce(new.created_at, now()),
    now()
  );

  return new;
end;
$$;

create trigger auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- Mantener sincronizado el correo si cambia en Supabase Auth.
create or replace function public.handle_auth_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    if new.email is null or btrim(new.email) = '' then
      raise exception 'SILSANPLEX requiere una dirección de correo';
    end if;

    update public.profiles
    set email = lower(new.email)
    where id = new.id;
  end if;

  return new;
end;
$$;

create trigger auth_user_updated_sync_email
after update of email on auth.users
for each row
execute function public.handle_auth_user_email_update();

-- ------------------------------------------------------------
-- 8. Funciones auxiliares de autorización
-- ------------------------------------------------------------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.is_organization_member(
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
    join public.profiles profile
      on profile.id = membership.user_id
    join public.organizations organization
      on organization.id = membership.organization_id
    where membership.user_id = auth.uid()
      and membership.organization_id = requested_organization_id
      and membership.is_active = true
      and profile.is_active = true
      and organization.is_active = true
  );
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
    join public.profiles profile
      on profile.id = membership.user_id
    join public.organizations organization
      on organization.id = membership.organization_id
    where membership.user_id = auth.uid()
      and membership.organization_id = requested_organization_id
      and membership.is_active = true
      and user_role.role_code = 'ADMIN'
      and profile.is_active = true
      and organization.is_active = true
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
    from public.organization_memberships administrator_membership
    join public.user_roles administrator_role
      on administrator_role.organization_id = administrator_membership.organization_id
      and administrator_role.user_id = administrator_membership.user_id
    join public.profiles administrator_profile
      on administrator_profile.id = administrator_membership.user_id
    join public.organizations organization
      on organization.id = administrator_membership.organization_id
    join public.organization_memberships managed_membership
      on managed_membership.organization_id = administrator_membership.organization_id
    where administrator_membership.user_id = auth.uid()
      and administrator_membership.is_active = true
      and administrator_role.role_code = 'ADMIN'
      and administrator_profile.is_active = true
      and organization.is_active = true
      and managed_membership.user_id = requested_user_id
  );
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.handle_auth_user_email_update() from public;
revoke all on function public.is_active_user() from public;
revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.is_organization_admin(uuid) from public;
revoke all on function public.can_manage_user(uuid) from public;

grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_admin(uuid) to authenticated;
grant execute on function public.can_manage_user(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9. Row Level Security
-- ------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_select_member
on public.organizations
for select
to authenticated
using (public.is_organization_member(id));

create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.can_manage_user(id)
);

create policy roles_select_active_users
on public.roles
for select
to authenticated
using (public.is_active_user());

create policy organization_memberships_select_self_or_admin
on public.organization_memberships
for select
to authenticated
using (
  (
    user_id = auth.uid()
    and public.is_active_user()
  )
  or public.is_organization_admin(organization_id)
);

create policy user_roles_select_self_or_admin
on public.user_roles
for select
to authenticated
using (
  (
    user_id = auth.uid()
    and public.is_active_user()
  )
  or public.is_organization_admin(organization_id)
);

create policy audit_events_select_admin
on public.audit_events
for select
to authenticated
using (
  organization_id is not null
  and public.is_organization_admin(organization_id)
);

-- No se crean políticas INSERT, UPDATE ni DELETE.
-- Las operaciones administrativas se harán desde una Edge Function
-- autenticada, usando privilegios de servidor.

-- ------------------------------------------------------------
-- 10. Privilegios para el frontend autenticado
-- ------------------------------------------------------------

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.roles from anon, authenticated;
revoke all on table public.organization_memberships from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;

grant select on table public.organizations to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.roles to authenticated;
grant select on table public.organization_memberships to authenticated;
grant select on table public.user_roles to authenticated;
grant select on table public.audit_events to authenticated;
