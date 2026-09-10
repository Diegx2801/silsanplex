-- ============================================================
-- SILSANPLEX: acceso operativo por usuario e integridad administrativa
-- ============================================================

-- La versión pertenece a la asignación de acceso, no al perfil global. Permite
-- detectar dos ediciones administrativas concurrentes dentro del mismo tenant.
alter table public.organization_memberships
  add column access_version bigint not null default 1;

alter table public.organization_memberships
  add constraint organization_memberships_access_version_positive
  check (access_version >= 1);

create table public.permission_dependencies (
  permission_code text not null
    references public.permissions(code) on delete cascade,
  required_permission_code text not null
    references public.permissions(code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (permission_code, required_permission_code),
  constraint permission_dependencies_not_self
    check (permission_code <> required_permission_code)
);

comment on table public.permission_dependencies is
  'Dependencias globales entre capacidades; una capacidad asignada incluye transitivamente sus requisitos.';

insert into public.permission_dependencies (permission_code, required_permission_code)
select permission.code, view_permission.code
from public.permissions permission
join public.permissions view_permission
  on view_permission.code = regexp_replace(permission.code, '_(MANAGE|CREATE|UPDATE|ASSIGN|CHANGE_STATUS|APPROVE_QUOTE|USE_PARTS|DELIVER|PERFORM_TECHNICAL|EXPORT|RECEIVE)$', '_VIEW')
where permission.code ~ '_(MANAGE|CREATE|UPDATE|ASSIGN|CHANGE_STATUS|APPROVE_QUOTE|USE_PARTS|DELIVER|PERFORM_TECHNICAL|EXPORT|RECEIVE)$'
on conflict do nothing;

create table public.organization_user_permissions (
  organization_id uuid not null,
  user_id uuid not null,
  permission_code text not null
    references public.permissions(code) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, permission_code),
  constraint organization_user_permissions_membership_fk
    foreign key (organization_id, user_id)
    references public.organization_memberships(organization_id, user_id)
    on delete cascade
);

create index organization_user_permissions_permission_idx
  on public.organization_user_permissions(permission_code);

comment on table public.organization_user_permissions is
  'Capacidades operativas concedidas directamente a una membresía de una organización.';

-- Transición sin pérdida de acceso: las membresías no administrativas reciben
-- sus capacidades efectivas actuales. Los roles legacy se conservan hasta que
-- todos los consumidores migren al nuevo contrato.
insert into public.organization_user_permissions(
  organization_id, user_id, permission_code, assigned_by
)
select distinct user_role.organization_id, user_role.user_id,
  role_permission.permission_code, user_role.assigned_by
from public.user_roles user_role
join public.role_permissions role_permission on role_permission.role_code = user_role.role_code
where role_permission.permission_code <> 'USERS_MANAGE'
  and not exists (
    select 1 from public.user_roles administrator_role
    where administrator_role.organization_id = user_role.organization_id
      and administrator_role.user_id = user_role.user_id
      and administrator_role.role_code = 'ADMIN'
  )
on conflict do nothing;

alter table public.permission_dependencies enable row level security;
alter table public.organization_user_permissions enable row level security;

revoke all on table public.permission_dependencies from public, anon, authenticated;
revoke all on table public.organization_user_permissions from public, anon, authenticated;
grant select, insert, update, delete on table
  public.permission_dependencies,
  public.organization_user_permissions
to service_role;

-- Resuelve los requisitos de forma transitiva, valida el catálogo y reserva la
-- administración de usuarios al rol ADMIN. No concede privilegios por nombre.
create function public.normalize_operational_permission_codes(
  requested_permission_codes text[]
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_codes text[];
begin
  with recursive requested(code) as (
    select distinct upper(btrim(value))
    from unnest(coalesce(requested_permission_codes, '{}'::text[])) value
    where btrim(value) <> ''
  ), expanded(code) as (
    select code from requested
    union
    select dependency.required_permission_code
    from expanded
    join public.permission_dependencies dependency
      on dependency.permission_code = expanded.code
  )
  select coalesce(array_agg(distinct expanded.code order by expanded.code), '{}'::text[])
  into normalized_codes
  from expanded;

  if 'USERS_MANAGE' = any(normalized_codes) then
    raise exception using errcode = 'P0001', message = 'DIRECT_ADMIN_PERMISSION_FORBIDDEN';
  end if;

  if exists (
    select 1
    from unnest(normalized_codes) requested(code)
    left join public.permissions permission
      on permission.code = requested.code and permission.is_active
    where permission.code is null
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_OR_INACTIVE_PERMISSION';
  end if;

  return normalized_codes;
end;
$$;

create function public.user_has_organization_permission(
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

create or replace function public.has_organization_permission(
  requested_organization_id uuid,
  requested_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_has_organization_permission(
    requested_organization_id,
    auth.uid(),
    requested_permission_code
  );
$$;

create or replace function public.repair_technician_is_active(
  requested_organization_id uuid,
  requested_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_has_organization_permission(
    requested_organization_id,
    requested_user_id,
    'REPAIRS_PERFORM_TECHNICAL'
  );
$$;

create or replace function public.current_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct effective.permission_code order by effective.permission_code), '{}'::text[])
  from (
    select role_permission.permission_code
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id and profile.is_active
    join public.organizations organization on organization.id = membership.organization_id and organization.is_active
    join public.user_roles user_role
      on user_role.organization_id = membership.organization_id and user_role.user_id = membership.user_id
    join public.roles role on role.code = user_role.role_code and role.is_active
    join public.role_permissions role_permission on role_permission.role_code = role.code
    join public.permissions permission on permission.code = role_permission.permission_code and permission.is_active
    where membership.user_id = auth.uid() and membership.is_active
    union
    select direct_permission.permission_code
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id and profile.is_active
    join public.organizations organization on organization.id = membership.organization_id and organization.is_active
    join public.organization_user_permissions direct_permission
      on direct_permission.organization_id = membership.organization_id
     and direct_permission.user_id = membership.user_id
    join public.permissions permission on permission.code = direct_permission.permission_code and permission.is_active
    where membership.user_id = auth.uid() and membership.is_active
  ) effective;
$$;

-- La serialización por tenant cierra la carrera entre dos operaciones que
-- intenten retirar simultáneamente el último administrador activo.
create function public.lock_organization_user_administration(target_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text || ':user-administration', 0)
  );
end;
$$;

create function public.assert_admin_can_update_user(
  actor_user_id uuid,
  target_user_id uuid,
  requested_is_admin boolean,
  requested_permission_codes text[],
  expected_access_version bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  target_membership public.organization_memberships%rowtype;
  target_has_admin_role boolean;
  active_admin_count integer;
begin
  if requested_is_admin is null then
    raise exception using errcode = '22023', message = 'USER_ACCESS_TYPE_REQUIRED';
  end if;
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  perform public.lock_organization_user_administration(resolved_organization_id);
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  perform public.normalize_operational_permission_codes(requested_permission_codes);

  select membership.* into target_membership
  from public.organization_memberships membership
  where membership.organization_id = resolved_organization_id
    and membership.user_id = target_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND_IN_ORGANIZATION';
  end if;
  if expected_access_version is null or target_membership.access_version <> expected_access_version then
    raise exception using errcode = '40001', message = 'USER_ACCESS_STALE_WRITE';
  end if;
  if not requested_is_admin and cardinality(public.normalize_operational_permission_codes(requested_permission_codes)) = 0 then
    raise exception using errcode = 'P0001', message = 'AT_LEAST_ONE_OPERATIONAL_PERMISSION_REQUIRED';
  end if;
  if requested_is_admin and cardinality(coalesce(requested_permission_codes, '{}'::text[])) > 0 then
    raise exception using errcode = 'P0001', message = 'ADMIN_DIRECT_PERMISSIONS_FORBIDDEN';
  end if;

  select exists (
    select 1 from public.user_roles
    where organization_id = resolved_organization_id and user_id = target_user_id and role_code = 'ADMIN'
  ) into target_has_admin_role;

  if actor_user_id = target_user_id and target_has_admin_role and not requested_is_admin then
    raise exception using errcode = 'P0001', message = 'SELF_ADMIN_ROLE_REMOVAL_FORBIDDEN';
  end if;

  if target_has_admin_role and not requested_is_admin and target_membership.is_active then
    select count(distinct membership.user_id) into active_admin_count
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id and profile.is_active
    join public.user_roles user_role
      on user_role.organization_id = membership.organization_id
     and user_role.user_id = membership.user_id
     and user_role.role_code = 'ADMIN'
    where membership.organization_id = resolved_organization_id and membership.is_active;
    if active_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'LAST_ADMIN_ROLE_REMOVAL_FORBIDDEN';
    end if;
  end if;
  return resolved_organization_id;
end;
$$;

-- Compatibilidad segura para la Edge Function anterior. El bloqueo adquirido
-- aquí permanece hasta terminar admin_update_user_membership legacy.
create or replace function public.assert_admin_can_update_user(
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
  target_has_admin_role boolean;
  active_admin_count integer;
begin
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  perform public.lock_organization_user_administration(resolved_organization_id);
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  normalized_role_codes := public.normalize_active_role_codes(requested_role_codes);
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = resolved_organization_id
      and membership.user_id = target_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND_IN_ORGANIZATION';
  end if;
  select exists (
    select 1 from public.user_roles
    where organization_id = resolved_organization_id and user_id = target_user_id and role_code = 'ADMIN'
  ) into target_has_admin_role;
  if actor_user_id = target_user_id and target_has_admin_role and not ('ADMIN' = any(normalized_role_codes)) then
    raise exception using errcode = 'P0001', message = 'SELF_ADMIN_ROLE_REMOVAL_FORBIDDEN';
  end if;
  if target_has_admin_role and not ('ADMIN' = any(normalized_role_codes)) then
    select count(distinct membership.user_id) into active_admin_count
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id and profile.is_active
    join public.user_roles user_role
      on user_role.organization_id = membership.organization_id
     and user_role.user_id = membership.user_id
     and user_role.role_code = 'ADMIN'
    where membership.organization_id = resolved_organization_id and membership.is_active;
    if active_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'LAST_ADMIN_ROLE_REMOVAL_FORBIDDEN';
    end if;
  end if;
  return resolved_organization_id;
end;
$$;

create function public.admin_create_user_membership(
  actor_user_id uuid,
  target_user_id uuid,
  requested_is_admin boolean,
  requested_permission_codes text[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  normalized_permissions text[];
begin
  if requested_is_admin is null then
    raise exception using errcode = '22023', message = 'USER_ACCESS_TYPE_REQUIRED';
  end if;
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  perform public.lock_organization_user_administration(resolved_organization_id);
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  normalized_permissions := public.normalize_operational_permission_codes(requested_permission_codes);
  if requested_is_admin and cardinality(coalesce(requested_permission_codes, '{}'::text[])) > 0 then
    raise exception using errcode = 'P0001', message = 'ADMIN_DIRECT_PERMISSIONS_FORBIDDEN';
  end if;
  if not requested_is_admin and cardinality(normalized_permissions) = 0 then
    raise exception using errcode = 'P0001', message = 'AT_LEAST_ONE_OPERATIONAL_PERMISSION_REQUIRED';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id and is_active) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_PROFILE_REQUIRED';
  end if;
  if exists (select 1 from public.organization_memberships where organization_id = resolved_organization_id and user_id = target_user_id) then
    raise exception using errcode = 'P0001', message = 'USER_ALREADY_BELONGS_TO_ORGANIZATION';
  end if;

  insert into public.organization_memberships(organization_id, user_id, created_by)
  values (resolved_organization_id, target_user_id, actor_user_id);
  if requested_is_admin then
    insert into public.user_roles(organization_id, user_id, role_code, assigned_by)
    values (resolved_organization_id, target_user_id, 'ADMIN', actor_user_id);
  else
    insert into public.organization_user_permissions(organization_id, user_id, permission_code, assigned_by)
    select resolved_organization_id, target_user_id, code, actor_user_id
    from unnest(normalized_permissions) code;
  end if;
  insert into public.audit_events(organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (resolved_organization_id, actor_user_id, 'USER_CREATED', 'ORGANIZATION_MEMBERSHIP', target_user_id::text,
    jsonb_build_object('is_active', true, 'is_admin', requested_is_admin,
      'permission_codes', to_jsonb(normalized_permissions), 'access_version', 1));
  return 1;
end;
$$;

create function public.admin_update_user_membership(
  actor_user_id uuid,
  target_user_id uuid,
  requested_email text,
  previous_email text,
  requested_full_name text,
  requested_phone text,
  requested_is_admin boolean,
  requested_permission_codes text[],
  expected_access_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  normalized_permissions text[];
  previous_profile jsonb;
  previous_is_admin boolean;
  previous_permissions text[];
begin
  if char_length(btrim(coalesce(requested_full_name, ''))) not between 2 and 150 then
    raise exception using errcode = 'P0001', message = 'INVALID_FULL_NAME';
  end if;
  resolved_organization_id := public.assert_admin_can_update_user(
    actor_user_id, target_user_id, requested_is_admin,
    requested_permission_codes, expected_access_version
  );
  normalized_permissions := public.normalize_operational_permission_codes(requested_permission_codes);
  select to_jsonb(profile) into previous_profile from public.profiles profile where id = target_user_id;
  select exists(select 1 from public.user_roles where organization_id = resolved_organization_id and user_id = target_user_id and role_code = 'ADMIN')
    into previous_is_admin;
  select coalesce(array_agg(permission_code order by permission_code), '{}'::text[])
    into previous_permissions from public.organization_user_permissions
    where organization_id = resolved_organization_id and user_id = target_user_id;

  update public.profiles set full_name = btrim(requested_full_name),
    phone = nullif(btrim(coalesce(requested_phone, '')), '') where id = target_user_id;
  delete from public.user_roles where organization_id = resolved_organization_id and user_id = target_user_id;
  delete from public.organization_user_permissions where organization_id = resolved_organization_id and user_id = target_user_id;
  if requested_is_admin then
    insert into public.user_roles(organization_id,user_id,role_code,assigned_by)
    values(resolved_organization_id,target_user_id,'ADMIN',actor_user_id);
  else
    insert into public.organization_user_permissions(organization_id,user_id,permission_code,assigned_by)
    select resolved_organization_id,target_user_id,code,actor_user_id from unnest(normalized_permissions) code;
  end if;
  update public.organization_memberships set access_version = access_version + 1
    where organization_id = resolved_organization_id and user_id = target_user_id;
  insert into public.audit_events(organization_id,actor_user_id,action,entity_type,entity_id,old_values,new_values)
  values(resolved_organization_id,actor_user_id,'USER_UPDATED','ORGANIZATION_MEMBERSHIP',target_user_id::text,
    jsonb_build_object('email',lower(previous_email),'full_name',previous_profile->>'full_name','phone',previous_profile->>'phone',
      'is_admin',previous_is_admin,'permission_codes',to_jsonb(previous_permissions),'access_version',expected_access_version),
    jsonb_build_object('email',lower(requested_email),'full_name',btrim(requested_full_name),
      'phone',nullif(btrim(coalesce(requested_phone,'')),''),'is_admin',requested_is_admin,
      'permission_codes',to_jsonb(normalized_permissions),'access_version',expected_access_version + 1));
  return expected_access_version + 1;
end;
$$;

create function public.admin_list_user_access(actor_user_id uuid)
returns table(
  user_id uuid, organization_id uuid, email text, full_name text, phone text,
  is_active boolean, is_admin boolean, permission_codes text[], access_version bigint,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare resolved_organization_id uuid;
begin
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  return query
  select profile.id, membership.organization_id, profile.email, profile.full_name, profile.phone,
    membership.is_active and profile.is_active,
    exists(select 1 from public.user_roles user_role where user_role.organization_id=membership.organization_id and user_role.user_id=membership.user_id and user_role.role_code='ADMIN'),
    coalesce(array_agg(direct_permission.permission_code order by direct_permission.permission_code)
      filter(where direct_permission.permission_code is not null), '{}'::text[]),
    membership.access_version, membership.created_at, greatest(profile.updated_at,membership.updated_at)
  from public.organization_memberships membership
  join public.profiles profile on profile.id=membership.user_id
  left join public.organization_user_permissions direct_permission
    on direct_permission.organization_id=membership.organization_id and direct_permission.user_id=membership.user_id
  where membership.organization_id=resolved_organization_id
  group by profile.id,membership.organization_id,membership.user_id,membership.is_active,membership.access_version,membership.created_at,membership.updated_at
  order by profile.full_name,profile.email;
end;
$$;

-- Reemplaza únicamente la regla del último almacén; las dependencias e
-- idempotencia continúan siendo las del comando endurecido anterior.
create or replace function public.set_warehouse_status(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid()); target_organization_id uuid; target_warehouse_id uuid;
  operation_key_value uuid; expected_lock_version bigint; requested_active boolean;
  normalized_payload jsonb; replayed_id uuid; warehouse_row public.warehouses%rowtype;
begin
  if payload is null or jsonb_typeof(payload)<>'object' or not(payload?'is_active') then raise exception using errcode='22023',message='WAREHOUSE_STATUS_PAYLOAD_INVALID'; end if;
  target_organization_id:=nullif(payload->>'organization_id','')::uuid; target_warehouse_id:=nullif(payload->>'id','')::uuid;
  operation_key_value:=nullif(payload->>'operation_key','')::uuid; expected_lock_version:=nullif(payload->>'expected_lock_version','')::bigint;
  requested_active:=(payload->>'is_active')::boolean;
  if actor_id is null or target_organization_id is null or not public.has_organization_permission(target_organization_id,'INVENTORY_MANAGE') then raise exception using errcode='42501',message='WAREHOUSE_FORBIDDEN'; end if;
  if operation_key_value is null then raise exception using errcode='22023',message='WAREHOUSE_OPERATION_KEY_REQUIRED'; end if;
  if requested_active is null then raise exception using errcode='22023',message='WAREHOUSE_STATUS_PAYLOAD_INVALID'; end if;
  if target_warehouse_id is null or expected_lock_version is null or expected_lock_version<1 then raise exception using errcode='22023',message='WAREHOUSE_STATUS_VERSION_REQUIRED'; end if;
  normalized_payload:=jsonb_build_object('id',target_warehouse_id,'is_active',requested_active,'expected_lock_version',expected_lock_version);
  replayed_id:=public.replay_warehouse_master_command(target_organization_id,operation_key_value,'set_warehouse_status',normalized_payload);
  if replayed_id is not null then return replayed_id; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_organization_id::text||':warehouse-master:'||target_warehouse_id::text,0));
  select warehouse.* into warehouse_row from public.warehouses warehouse where warehouse.organization_id=target_organization_id and warehouse.id=target_warehouse_id for update;
  if not found then raise exception using errcode='P0001',message='WAREHOUSE_NOT_FOUND'; end if;
  if warehouse_row.lock_version<>expected_lock_version then raise exception using errcode='40001',message='WAREHOUSE_STALE_WRITE'; end if;
  if warehouse_row.is_active is distinct from requested_active then
    if requested_active then
      if not exists(select 1 from public.warehouse_locations location where location.organization_id=target_organization_id and location.warehouse_id=target_warehouse_id and location.is_active) then raise exception using errcode='P0001',message='WAREHOUSE_ACTIVE_LOCATION_REQUIRED'; end if;
    else
      if exists(select 1 from public.inventory_balances balance where balance.organization_id=target_organization_id and balance.warehouse_id=target_warehouse_id and balance.quantity<>0) then raise exception using errcode='P0001',message='WAREHOUSE_HAS_STOCK'; end if;
      if exists(select 1 from public.inventory_reservations reservation where reservation.organization_id=target_organization_id and reservation.warehouse_id=target_warehouse_id and reservation.status='active') then raise exception using errcode='P0001',message='WAREHOUSE_HAS_RESERVATIONS'; end if;
      if exists(select 1 from public.purchase_orders purchase where purchase.organization_id=target_organization_id and purchase.warehouse_id=target_warehouse_id and purchase.status in('draft','issued','partially_received')) then raise exception using errcode='P0001',message='WAREHOUSE_HAS_OPEN_PURCHASES'; end if;
      if exists(select 1 from public.orders order_row where order_row.organization_id=target_organization_id and order_row.warehouse_id=target_warehouse_id and order_row.status='confirmado') then raise exception using errcode='P0001',message='WAREHOUSE_HAS_OPEN_ORDERS'; end if;
    end if;
    update public.warehouses warehouse set is_active=requested_active,lock_version=warehouse.lock_version+1,updated_by=actor_id where warehouse.organization_id=target_organization_id and warehouse.id=target_warehouse_id;
  end if;
  perform public.complete_warehouse_master_command(target_organization_id,operation_key_value,'set_warehouse_status',normalized_payload,target_warehouse_id,actor_id);
  return target_warehouse_id;
end;
$$;

-- La operación de estado existente se serializa antes de evaluar el último ADMIN.
create or replace function public.admin_set_user_membership_status(actor_user_id uuid,target_user_id uuid,requested_is_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare resolved_organization_id uuid; previous_is_active boolean; target_has_admin_role boolean; active_admin_count integer;
begin
  resolved_organization_id:=public.resolve_admin_organization(actor_user_id);
  perform public.lock_organization_user_administration(resolved_organization_id);
  resolved_organization_id:=public.resolve_admin_organization(actor_user_id);
  select membership.is_active into previous_is_active from public.organization_memberships membership
    where membership.organization_id=resolved_organization_id and membership.user_id=target_user_id for update;
  if not found then raise exception using errcode='P0001',message='USER_NOT_FOUND_IN_ORGANIZATION'; end if;
  if previous_is_active=requested_is_active then return resolved_organization_id; end if;
  if not requested_is_active and actor_user_id=target_user_id then raise exception using errcode='P0001',message='SELF_DEACTIVATION_FORBIDDEN'; end if;
  select exists(select 1 from public.user_roles where organization_id=resolved_organization_id and user_id=target_user_id and role_code='ADMIN') into target_has_admin_role;
  if not requested_is_active and target_has_admin_role then
    select count(distinct membership.user_id) into active_admin_count from public.organization_memberships membership
      join public.profiles profile on profile.id=membership.user_id and profile.is_active
      join public.user_roles user_role on user_role.organization_id=membership.organization_id and user_role.user_id=membership.user_id and user_role.role_code='ADMIN'
      where membership.organization_id=resolved_organization_id and membership.is_active;
    if active_admin_count<=1 then raise exception using errcode='P0001',message='LAST_ADMIN_DEACTIVATION_FORBIDDEN'; end if;
  end if;
  update public.organization_memberships set is_active=requested_is_active,
    deactivated_at=case when requested_is_active then null else now() end,
    access_version=access_version+1
    where organization_id=resolved_organization_id and user_id=target_user_id;
  insert into public.audit_events(organization_id,actor_user_id,action,entity_type,entity_id,old_values,new_values)
  values(resolved_organization_id,actor_user_id,case when requested_is_active then 'USER_REACTIVATED' else 'USER_DEACTIVATED' end,
    'ORGANIZATION_MEMBERSHIP',target_user_id::text,jsonb_build_object('is_active',previous_is_active),jsonb_build_object('is_active',requested_is_active));
  return resolved_organization_id;
end;
$$;

revoke all on function public.normalize_operational_permission_codes(text[]) from public,anon,authenticated;
revoke all on function public.user_has_organization_permission(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.repair_technician_is_active(uuid,uuid) from public,anon;
revoke all on function public.lock_organization_user_administration(uuid) from public,anon,authenticated;
revoke all on function public.assert_admin_can_update_user(uuid,uuid,boolean,text[],bigint) from public,anon,authenticated;
revoke all on function public.assert_admin_can_update_user(uuid,uuid,text[]) from public,anon,authenticated;
revoke all on function public.admin_create_user_membership(uuid,uuid,boolean,text[]) from public,anon,authenticated;
revoke all on function public.admin_update_user_membership(uuid,uuid,text,text,text,text,boolean,text[],bigint) from public,anon,authenticated;
revoke all on function public.admin_list_user_access(uuid) from public,anon,authenticated;
grant execute on function public.normalize_operational_permission_codes(text[]) to service_role;
grant execute on function public.user_has_organization_permission(uuid,uuid,text) to service_role;
grant execute on function public.repair_technician_is_active(uuid,uuid) to authenticated;
grant execute on function public.lock_organization_user_administration(uuid) to service_role;
grant execute on function public.assert_admin_can_update_user(uuid,uuid,boolean,text[],bigint) to service_role;
grant execute on function public.assert_admin_can_update_user(uuid,uuid,text[]) to service_role;
grant execute on function public.admin_create_user_membership(uuid,uuid,boolean,text[]) to service_role;
grant execute on function public.admin_update_user_membership(uuid,uuid,text,text,text,text,boolean,text[],bigint) to service_role;
grant execute on function public.admin_list_user_access(uuid) to service_role;

revoke all on function public.current_user_permissions() from public,anon,authenticated;
grant execute on function public.current_user_permissions() to authenticated;
revoke all on function public.has_organization_permission(uuid,text) from public,anon;
grant execute on function public.has_organization_permission(uuid,text) to authenticated;
