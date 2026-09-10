-- Consolida el mantenedor de almacenes y ubicaciones como una API de comandos.
-- Las operaciones conservan el historial, son reintentables y validan el estado
-- operativo antes de activar o desactivar maestros compartidos.

begin;

alter table public.warehouses
  add column lock_version bigint not null default 1,
  add constraint warehouses_lock_version_positive check (lock_version > 0);

alter table public.warehouse_locations
  add column lock_version bigint not null default 1,
  add constraint warehouse_locations_lock_version_positive check (lock_version > 0);

comment on column public.warehouses.lock_version is
  'Version optimista incrementada por cada cambio del mantenedor.';
comment on column public.warehouse_locations.lock_version is
  'Version optimista incrementada por cada cambio del mantenedor.';

-- Repara almacenes activos creados sin una ubicacion utilizable. En adelante la
-- creacion atomica del almacen siempre incorpora GENERAL.
insert into public.warehouse_locations (
  organization_id, warehouse_id, code, name, created_by, updated_by
)
select
  warehouse.organization_id,
  warehouse.id,
  'GENERAL',
  'Ubicacion general',
  warehouse.created_by,
  warehouse.updated_by
from public.warehouses warehouse
where warehouse.is_active
  and not exists (
    select 1
    from public.warehouse_locations location
    where location.organization_id = warehouse.organization_id
      and location.warehouse_id = warehouse.id
      and location.is_active
  )
on conflict (organization_id, warehouse_id, code)
do update set
  is_active = true,
  updated_by = excluded.updated_by;

create table public.warehouse_master_operations (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operation_key uuid not null,
  command_type text not null,
  request_payload jsonb not null,
  result_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint warehouse_master_operations_pkey
    primary key (organization_id, operation_key),
  constraint warehouse_master_operations_command_type_valid check (
    command_type in (
      'save_warehouse', 'set_warehouse_status',
      'save_warehouse_location', 'set_warehouse_location_status'
    )
  ),
  constraint warehouse_master_operations_payload_object check (
    jsonb_typeof(request_payload) = 'object'
  )
);

alter table public.warehouse_master_operations enable row level security;

revoke all on table public.warehouse_master_operations
  from public, anon, authenticated, service_role;

create function public.prevent_warehouse_master_operation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'WAREHOUSE_OPERATION_IMMUTABLE';
end;
$$;

create trigger warehouse_master_operations_immutable
before update or delete on public.warehouse_master_operations
for each row execute function public.prevent_warehouse_master_operation_mutation();

create function public.replay_warehouse_master_command(
  requested_organization_id uuid,
  requested_operation_key uuid,
  requested_command_type text,
  requested_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_operation public.warehouse_master_operations%rowtype;
begin
  if requested_operation_key is null then
    raise exception using errcode = '22023', message = 'WAREHOUSE_OPERATION_KEY_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      requested_organization_id::text || ':warehouse-command:' || requested_operation_key::text,
      0
    )
  );

  select operation.*
  into existing_operation
  from public.warehouse_master_operations operation
  where operation.organization_id = requested_organization_id
    and operation.operation_key = requested_operation_key
  for update;

  if not found then
    return null;
  end if;
  if existing_operation.command_type is distinct from requested_command_type
    or existing_operation.request_payload is distinct from requested_payload
  then
    raise exception using errcode = 'P0001', message = 'WAREHOUSE_OPERATION_KEY_REUSED';
  end if;

  return existing_operation.result_id;
end;
$$;

create function public.complete_warehouse_master_command(
  requested_organization_id uuid,
  requested_operation_key uuid,
  requested_command_type text,
  requested_payload jsonb,
  requested_result_id uuid,
  requested_actor_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.warehouse_master_operations (
    organization_id, operation_key, command_type, request_payload, result_id, created_by
  ) values (
    requested_organization_id, requested_operation_key, requested_command_type,
    requested_payload, requested_result_id, requested_actor_id
  );
$$;

-- El codigo es una identidad comercial estable. Los nombres y descripciones
-- pueden cambiar, pero el codigo y la pertenencia historica no.
create or replace function public.protect_warehouse_master_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = 'P0001', message = 'WAREHOUSE_IMMUTABLE_FIELDS';
  end if;

  if tg_table_name = 'warehouses' and new.code is distinct from old.code then
    raise exception using errcode = 'P0001', message = 'WAREHOUSE_CODE_IMMUTABLE';
  end if;
  if tg_table_name = 'warehouse_locations' then
    if new.code is distinct from old.code then
      raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_CODE_IMMUTABLE';
    end if;
    if new.warehouse_id is distinct from old.warehouse_id then
      raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_PARENT_IMMUTABLE';
    end if;
  end if;

  return new;
end;
$$;

create function public.save_warehouse(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_warehouse_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  normalized_code text;
  normalized_name text;
  normalized_address text;
  normalized_payload jsonb;
  replayed_id uuid;
  warehouse_row public.warehouses%rowtype;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'WAREHOUSE_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  target_warehouse_id := nullif(payload ->> 'id', '')::uuid;
  normalized_code := upper(btrim(coalesce(payload ->> 'code', '')));
  normalized_name := btrim(coalesce(payload ->> 'name', ''));
  normalized_address := nullif(btrim(coalesce(payload ->> 'address', '')), '');

  if actor_id is null
    or target_organization_id is null
    or not public.has_organization_permission(target_organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'WAREHOUSE_FORBIDDEN';
  end if;
  if operation_key_value is null then
    raise exception using errcode = '22023', message = 'WAREHOUSE_OPERATION_KEY_REQUIRED';
  end if;
  if normalized_code !~ '^[A-Z0-9][A-Z0-9._-]{0,19}$' then
    raise exception using errcode = '22023', message = 'WAREHOUSE_CODE_INVALID';
  end if;
  if char_length(normalized_name) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'WAREHOUSE_NAME_INVALID';
  end if;
  if normalized_address is not null and char_length(normalized_address) > 180 then
    raise exception using errcode = '22023', message = 'WAREHOUSE_ADDRESS_INVALID';
  end if;
  if expected_lock_version is not null and target_warehouse_id is null then
    raise exception using errcode = '22023', message = 'WAREHOUSE_ID_REQUIRED';
  end if;

  if expected_lock_version is null then
    target_warehouse_id := coalesce(target_warehouse_id, gen_random_uuid());
  end if;

  normalized_payload := jsonb_build_object(
    'id', target_warehouse_id,
    'code', normalized_code,
    'name', normalized_name,
    'address', normalized_address,
    'expected_lock_version', expected_lock_version
  );
  replayed_id := public.replay_warehouse_master_command(
    target_organization_id, operation_key_value, 'save_warehouse', normalized_payload
  );
  if replayed_id is not null then
    return replayed_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_organization_id::text || ':warehouse-master:' || target_warehouse_id::text,
      0
    )
  );

  if expected_lock_version is null then
    begin
      insert into public.warehouses (
        id, organization_id, code, name, address, created_by, updated_by
      ) values (
        target_warehouse_id, target_organization_id, normalized_code,
        normalized_name, normalized_address, actor_id, actor_id
      );
    exception when unique_violation then
      raise exception using errcode = '23505', message = 'WAREHOUSE_CODE_DUPLICATE';
    end;

    insert into public.warehouse_locations (
      organization_id, warehouse_id, code, name, created_by, updated_by
    ) values (
      target_organization_id, target_warehouse_id, 'GENERAL',
      'Ubicacion general', actor_id, actor_id
    );
  else
    select warehouse.*
    into warehouse_row
    from public.warehouses warehouse
    where warehouse.organization_id = target_organization_id
      and warehouse.id = target_warehouse_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'WAREHOUSE_NOT_FOUND';
    end if;
    if warehouse_row.code is distinct from normalized_code then
      raise exception using errcode = 'P0001', message = 'WAREHOUSE_CODE_IMMUTABLE';
    end if;
    if warehouse_row.lock_version <> expected_lock_version then
      raise exception using errcode = '40001', message = 'WAREHOUSE_STALE_WRITE';
    end if;

    update public.warehouses warehouse
    set name = normalized_name,
        address = normalized_address,
        lock_version = warehouse.lock_version + 1,
        updated_by = actor_id
    where warehouse.organization_id = target_organization_id
      and warehouse.id = target_warehouse_id;
  end if;

  perform public.complete_warehouse_master_command(
    target_organization_id, operation_key_value, 'save_warehouse',
    normalized_payload, target_warehouse_id, actor_id
  );
  return target_warehouse_id;
end;
$$;

create function public.save_warehouse_location(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_location_id uuid;
  target_warehouse_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  normalized_code text;
  normalized_name text;
  normalized_description text;
  normalized_payload jsonb;
  replayed_id uuid;
  location_row public.warehouse_locations%rowtype;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'WAREHOUSE_LOCATION_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_location_id := nullif(payload ->> 'id', '')::uuid;
  target_warehouse_id := nullif(payload ->> 'warehouse_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  normalized_code := upper(btrim(coalesce(payload ->> 'code', '')));
  normalized_name := btrim(coalesce(payload ->> 'name', ''));
  normalized_description := nullif(btrim(coalesce(payload ->> 'description', '')), '');

  if actor_id is null
    or target_organization_id is null
    or not public.has_organization_permission(target_organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'WAREHOUSE_FORBIDDEN';
  end if;
  if operation_key_value is null then
    raise exception using errcode = '22023', message = 'WAREHOUSE_OPERATION_KEY_REQUIRED';
  end if;
  if target_warehouse_id is null then
    raise exception using errcode = '22023', message = 'WAREHOUSE_ID_REQUIRED';
  end if;
  if normalized_code !~ '^[A-Z0-9][A-Z0-9._-]{0,29}$' then
    raise exception using errcode = '22023', message = 'WAREHOUSE_LOCATION_CODE_INVALID';
  end if;
  if char_length(normalized_name) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'WAREHOUSE_LOCATION_NAME_INVALID';
  end if;
  if normalized_description is not null and char_length(normalized_description) > 180 then
    raise exception using errcode = '22023', message = 'WAREHOUSE_LOCATION_DESCRIPTION_INVALID';
  end if;
  if expected_lock_version is not null and target_location_id is null then
    raise exception using errcode = '22023', message = 'WAREHOUSE_LOCATION_ID_REQUIRED';
  end if;

  if expected_lock_version is null then
    target_location_id := coalesce(target_location_id, gen_random_uuid());
  end if;

  normalized_payload := jsonb_build_object(
    'id', target_location_id,
    'warehouse_id', target_warehouse_id,
    'code', normalized_code,
    'name', normalized_name,
    'description', normalized_description,
    'expected_lock_version', expected_lock_version
  );
  replayed_id := public.replay_warehouse_master_command(
    target_organization_id, operation_key_value,
    'save_warehouse_location', normalized_payload
  );
  if replayed_id is not null then
    return replayed_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_organization_id::text || ':warehouse-master:' || target_warehouse_id::text,
      0
    )
  );
  perform 1
  from public.warehouses warehouse
  where warehouse.organization_id = target_organization_id
    and warehouse.id = target_warehouse_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'WAREHOUSE_NOT_FOUND';
  end if;

  if expected_lock_version is null then
    begin
      insert into public.warehouse_locations (
        id, organization_id, warehouse_id, code, name, description,
        created_by, updated_by
      ) values (
        target_location_id, target_organization_id, target_warehouse_id,
        normalized_code, normalized_name, normalized_description, actor_id, actor_id
      );
    exception when unique_violation then
      raise exception using errcode = '23505', message = 'WAREHOUSE_LOCATION_CODE_DUPLICATE';
    end;
  else
    select location.*
    into location_row
    from public.warehouse_locations location
    where location.organization_id = target_organization_id
      and location.id = target_location_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_NOT_FOUND';
    end if;
    if location_row.warehouse_id is distinct from target_warehouse_id then
      raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_PARENT_IMMUTABLE';
    end if;
    if location_row.code is distinct from normalized_code then
      raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_CODE_IMMUTABLE';
    end if;
    if location_row.lock_version <> expected_lock_version then
      raise exception using errcode = '40001', message = 'WAREHOUSE_LOCATION_STALE_WRITE';
    end if;

    update public.warehouse_locations location
    set name = normalized_name,
        description = normalized_description,
        lock_version = location.lock_version + 1,
        updated_by = actor_id
    where location.organization_id = target_organization_id
      and location.id = target_location_id;
  end if;

  perform public.complete_warehouse_master_command(
    target_organization_id, operation_key_value, 'save_warehouse_location',
    normalized_payload, target_location_id, actor_id
  );
  return target_location_id;
end;
$$;

create function public.set_warehouse_status(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_warehouse_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  requested_active boolean;
  normalized_payload jsonb;
  replayed_id uuid;
  warehouse_row public.warehouses%rowtype;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or not (payload ? 'is_active') then
    raise exception using errcode = '22023', message = 'WAREHOUSE_STATUS_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_warehouse_id := nullif(payload ->> 'id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  requested_active := (payload ->> 'is_active')::boolean;

  if actor_id is null
    or target_organization_id is null
    or not public.has_organization_permission(target_organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'WAREHOUSE_FORBIDDEN';
  end if;
  if operation_key_value is null then
    raise exception using errcode = '22023', message = 'WAREHOUSE_OPERATION_KEY_REQUIRED';
  end if;
  if requested_active is null then
    raise exception using errcode = '22023', message = 'WAREHOUSE_STATUS_PAYLOAD_INVALID';
  end if;
  if target_warehouse_id is null or expected_lock_version is null or expected_lock_version < 1 then
    raise exception using errcode = '22023', message = 'WAREHOUSE_STATUS_VERSION_REQUIRED';
  end if;

  normalized_payload := jsonb_build_object(
    'id', target_warehouse_id,
    'is_active', requested_active,
    'expected_lock_version', expected_lock_version
  );
  replayed_id := public.replay_warehouse_master_command(
    target_organization_id, operation_key_value,
    'set_warehouse_status', normalized_payload
  );
  if replayed_id is not null then
    return replayed_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_organization_id::text || ':warehouse-master:' || target_warehouse_id::text,
      0
    )
  );
  select warehouse.*
  into warehouse_row
  from public.warehouses warehouse
  where warehouse.organization_id = target_organization_id
    and warehouse.id = target_warehouse_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'WAREHOUSE_NOT_FOUND';
  end if;
  if warehouse_row.lock_version <> expected_lock_version then
    raise exception using errcode = '40001', message = 'WAREHOUSE_STALE_WRITE';
  end if;

  if warehouse_row.is_active is distinct from requested_active then
    if requested_active then
      if not exists (
        select 1
        from public.warehouse_locations location
        where location.organization_id = target_organization_id
          and location.warehouse_id = target_warehouse_id
          and location.is_active
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_ACTIVE_LOCATION_REQUIRED';
      end if;
    else
      if not exists (
        select 1
        from public.warehouses warehouse
        where warehouse.organization_id = target_organization_id
          and warehouse.id <> target_warehouse_id
          and warehouse.is_active
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_LAST_ACTIVE';
      end if;
      if exists (
        select 1 from public.inventory_balances balance
        where balance.organization_id = target_organization_id
          and balance.warehouse_id = target_warehouse_id
          and balance.quantity <> 0
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_HAS_STOCK';
      end if;
      if exists (
        select 1 from public.inventory_reservations reservation
        where reservation.organization_id = target_organization_id
          and reservation.warehouse_id = target_warehouse_id
          and reservation.status = 'active'
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_HAS_RESERVATIONS';
      end if;
      if exists (
        select 1 from public.purchase_orders purchase
        where purchase.organization_id = target_organization_id
          and purchase.warehouse_id = target_warehouse_id
          and purchase.status in ('draft', 'issued', 'partially_received')
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_HAS_OPEN_PURCHASES';
      end if;
      if exists (
        select 1 from public.orders order_row
        where order_row.organization_id = target_organization_id
          and order_row.warehouse_id = target_warehouse_id
          and order_row.status = 'confirmado'
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_HAS_OPEN_ORDERS';
      end if;
    end if;

    update public.warehouses warehouse
    set is_active = requested_active,
        lock_version = warehouse.lock_version + 1,
        updated_by = actor_id
    where warehouse.organization_id = target_organization_id
      and warehouse.id = target_warehouse_id;
  end if;

  perform public.complete_warehouse_master_command(
    target_organization_id, operation_key_value, 'set_warehouse_status',
    normalized_payload, target_warehouse_id, actor_id
  );
  return target_warehouse_id;
end;
$$;

create function public.set_warehouse_location_status(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_location_id uuid;
  target_warehouse_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  requested_active boolean;
  normalized_payload jsonb;
  replayed_id uuid;
  location_row public.warehouse_locations%rowtype;
  warehouse_active boolean;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or not (payload ? 'is_active') then
    raise exception using errcode = '22023', message = 'WAREHOUSE_LOCATION_STATUS_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_location_id := nullif(payload ->> 'id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  requested_active := (payload ->> 'is_active')::boolean;

  if actor_id is null
    or target_organization_id is null
    or not public.has_organization_permission(target_organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'WAREHOUSE_FORBIDDEN';
  end if;
  if operation_key_value is null then
    raise exception using errcode = '22023', message = 'WAREHOUSE_OPERATION_KEY_REQUIRED';
  end if;
  if requested_active is null then
    raise exception using errcode = '22023', message = 'WAREHOUSE_LOCATION_STATUS_PAYLOAD_INVALID';
  end if;
  if target_location_id is null or expected_lock_version is null or expected_lock_version < 1 then
    raise exception using errcode = '22023', message = 'WAREHOUSE_LOCATION_STATUS_VERSION_REQUIRED';
  end if;

  select location.warehouse_id
  into target_warehouse_id
  from public.warehouse_locations location
  where location.organization_id = target_organization_id
    and location.id = target_location_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_NOT_FOUND';
  end if;

  normalized_payload := jsonb_build_object(
    'id', target_location_id,
    'warehouse_id', target_warehouse_id,
    'is_active', requested_active,
    'expected_lock_version', expected_lock_version
  );
  replayed_id := public.replay_warehouse_master_command(
    target_organization_id, operation_key_value,
    'set_warehouse_location_status', normalized_payload
  );
  if replayed_id is not null then
    return replayed_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_organization_id::text || ':warehouse-master:' || target_warehouse_id::text,
      0
    )
  );
  select location.*
  into location_row
  from public.warehouse_locations location
  where location.organization_id = target_organization_id
    and location.id = target_location_id
  for update;
  select warehouse.is_active
  into warehouse_active
  from public.warehouses warehouse
  where warehouse.organization_id = target_organization_id
    and warehouse.id = target_warehouse_id
  for update;

  if location_row.lock_version <> expected_lock_version then
    raise exception using errcode = '40001', message = 'WAREHOUSE_LOCATION_STALE_WRITE';
  end if;

  if location_row.is_active is distinct from requested_active then
    if not requested_active then
      if warehouse_active and not exists (
        select 1
        from public.warehouse_locations location
        where location.organization_id = target_organization_id
          and location.warehouse_id = target_warehouse_id
          and location.id <> target_location_id
          and location.is_active
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_LAST_ACTIVE';
      end if;
      if exists (
        select 1 from public.inventory_balances balance
        where balance.organization_id = target_organization_id
          and balance.location_id = target_location_id
          and balance.quantity <> 0
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_HAS_STOCK';
      end if;
      if exists (
        select 1 from public.inventory_reservations reservation
        where reservation.organization_id = target_organization_id
          and reservation.location_id = target_location_id
          and reservation.status = 'active'
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_HAS_RESERVATIONS';
      end if;
      if exists (
        select 1 from public.product_warehouse_settings setting
        where setting.organization_id = target_organization_id
          and setting.default_location_id = target_location_id
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_IS_DEFAULT';
      end if;
    end if;

    update public.warehouse_locations location
    set is_active = requested_active,
        lock_version = location.lock_version + 1,
        updated_by = actor_id
    where location.organization_id = target_organization_id
      and location.id = target_location_id;
  end if;

  perform public.complete_warehouse_master_command(
    target_organization_id, operation_key_value,
    'set_warehouse_location_status', normalized_payload,
    target_location_id, actor_id
  );
  return target_location_id;
end;
$$;

-- Las escrituras del navegador pasan exclusivamente por los comandos anteriores.
drop policy if exists warehouses_insert_authorized on public.warehouses;
drop policy if exists warehouses_update_authorized on public.warehouses;
drop policy if exists warehouse_locations_insert_authorized on public.warehouse_locations;
drop policy if exists warehouse_locations_update_authorized on public.warehouse_locations;

revoke insert, update on table public.warehouses, public.warehouse_locations
  from authenticated;

revoke all on function public.replay_warehouse_master_command(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_warehouse_master_command(uuid, uuid, text, jsonb, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_warehouse(jsonb)
  from public, anon, authenticated;
revoke all on function public.save_warehouse_location(jsonb)
  from public, anon, authenticated;
revoke all on function public.set_warehouse_status(jsonb)
  from public, anon, authenticated;
revoke all on function public.set_warehouse_location_status(jsonb)
  from public, anon, authenticated;

grant execute on function public.save_warehouse(jsonb) to authenticated;
grant execute on function public.save_warehouse_location(jsonb) to authenticated;
grant execute on function public.set_warehouse_status(jsonb) to authenticated;
grant execute on function public.set_warehouse_location_status(jsonb) to authenticated;

comment on table public.warehouse_master_operations is
  'Resultados inmutables para reintentar comandos del mantenedor sin duplicar cambios.';
comment on function public.save_warehouse(jsonb) is
  'Crea un almacen con ubicacion GENERAL o actualiza sus datos mediante version optimista.';
comment on function public.save_warehouse_location(jsonb) is
  'Crea o actualiza una ubicacion sin permitir cambiar su codigo ni almacen.';
comment on function public.set_warehouse_status(jsonb) is
  'Activa o desactiva un almacen despues de validar dependencias operativas.';
comment on function public.set_warehouse_location_status(jsonb) is
  'Activa o desactiva una ubicacion despues de validar stock, reservas y configuraciones.';

commit;
