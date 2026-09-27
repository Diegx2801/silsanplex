-- D1B1: serialize warehouse/location lifecycle changes with every inventory
-- writer that can create stock, reservations, transfers or operational
-- dependencies. The warehouse advisory key intentionally matches PR #45.

create or replace function inventory_internal.lock_inventory_master_scope(
  requested_organization_id uuid,
  requested_warehouse_id uuid,
  requested_location_id uuid default null
)
returns table (
  warehouse_exists boolean,
  warehouse_active boolean,
  location_exists boolean,
  location_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  warehouse_exists := false;
  warehouse_active := null;
  location_exists := case when requested_location_id is null then null else false end;
  location_active := null;

  if requested_organization_id is null or requested_warehouse_id is null then
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      requested_organization_id::text || ':warehouse-master:' || requested_warehouse_id::text,
      0
    )
  );

  select true, warehouse.is_active
  into warehouse_exists, warehouse_active
  from public.warehouses warehouse
  where warehouse.organization_id = requested_organization_id
    and warehouse.id = requested_warehouse_id
  for update;

  if not found then
    warehouse_exists := false;
    warehouse_active := null;
    if requested_location_id is not null then
      location_exists := false;
    end if;
    return next;
    return;
  end if;

  if requested_location_id is not null then
    select true, location.is_active
    into location_exists, location_active
    from public.warehouse_locations location
    where location.organization_id = requested_organization_id
      and location.warehouse_id = requested_warehouse_id
      and location.id = requested_location_id
    for update;

    if not found then
      location_exists := false;
      location_active := null;
    end if;
  end if;

  return next;
end;
$$;

alter function inventory_internal.lock_inventory_master_scope(uuid, uuid, uuid)
  owner to postgres;
revoke all on function inventory_internal.lock_inventory_master_scope(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.lock_inventory_master_scope(uuid, uuid, uuid)
  to postgres;

comment on function inventory_internal.lock_inventory_master_scope(uuid, uuid, uuid) is
  'Internal D1B1 warehouse subtree mutex. Locks the canonical warehouse advisory key, then warehouse and optional location rows.';

-- Every existing FEFO/bucket writer now acquires the warehouse master before
-- the FEFO scope. lock_inventory_bucket already delegates to this function.
create or replace function public.lock_inventory_fefo_scope(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from inventory_internal.lock_inventory_master_scope(
    requested_organization_id,
    requested_warehouse_id,
    null
  );

  perform pg_catalog.pg_advisory_xact_lock(
    public.inventory_fefo_scope_lock_key(
      requested_organization_id,
      requested_product_id,
      requested_warehouse_id
    )
  );
end;
$$;

alter function public.lock_inventory_fefo_scope(uuid, uuid, uuid) owner to postgres;
revoke all on function public.lock_inventory_fefo_scope(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.lock_inventory_fefo_scope(uuid, uuid, uuid)
  to postgres;

-- Movement guard. Cleanup of an existing repair reservation and supplier
-- returns remain legal on inactive masters; every other new movement requires
-- an active warehouse and location.
create or replace function inventory_internal.guard_inventory_movement_master()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  master_state record;
  requires_active boolean := coalesce(new.source_type, '') not in (
    'supplier-return',
    'repair-consumption'
  );
  warehouse_error text;
  location_error text;
begin
  select *
  into master_state
  from inventory_internal.lock_inventory_master_scope(
    new.organization_id,
    new.warehouse_id,
    new.location_id
  );

  warehouse_error := case new.source_type
    when 'warehouse-transfer' then 'TRANSFER_WAREHOUSE_UNAVAILABLE'
    when 'order-dispatch' then 'ORDER_WAREHOUSE_UNAVAILABLE'
    when 'purchase-receipt' then 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE'
    when 'repair-consumption' then 'REPAIR_PART_WAREHOUSE_UNAVAILABLE'
    else 'INVENTORY_WAREHOUSE_UNAVAILABLE'
  end;
  location_error := case new.source_type
    when 'warehouse-transfer' then 'TRANSFER_LOCATION_UNAVAILABLE'
    when 'order-dispatch' then 'ORDER_WAREHOUSE_UNAVAILABLE'
    when 'purchase-receipt' then 'PURCHASE_RECEIPT_LOCATION_INVALID'
    when 'repair-consumption' then 'REPAIR_PART_LOCATION_UNAVAILABLE'
    else 'INVENTORY_LOCATION_UNAVAILABLE'
  end;

  if not coalesce(master_state.warehouse_exists, false) then
    raise exception using errcode = 'P0001', message = warehouse_error;
  end if;
  if not coalesce(master_state.location_exists, false) then
    raise exception using errcode = 'P0001', message = location_error;
  end if;
  if requires_active and not coalesce(master_state.warehouse_active, false) then
    raise exception using errcode = 'P0001', message = warehouse_error;
  end if;
  if requires_active and not coalesce(master_state.location_active, false) then
    raise exception using errcode = 'P0001', message = location_error;
  end if;

  return new;
end;
$$;

alter function inventory_internal.guard_inventory_movement_master() owner to postgres;
revoke all on function inventory_internal.guard_inventory_movement_master()
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.guard_inventory_movement_master()
  to postgres;

drop trigger if exists aaa_inventory_movements_master_guard
  on public.inventory_movements;
create trigger aaa_inventory_movements_master_guard
before insert on public.inventory_movements
for each row execute function inventory_internal.guard_inventory_movement_master();

-- Reservation guard. New or enlarged commitments require active masters.
-- Releases and consumption only take the common lock so cleanup stays legal.
create or replace function inventory_internal.guard_inventory_reservation_master()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resource record;
  master_state record;
  new_warehouse_exists boolean := false;
  new_warehouse_active boolean := false;
  new_location_exists boolean := false;
  new_location_active boolean := false;
  old_remaining numeric := 0;
  new_remaining numeric := 0;
  requires_active boolean := false;
  warehouse_error text;
  location_error text;
begin
  if tg_op = 'UPDATE'
    and (
      old.organization_id is distinct from new.organization_id
      or old.warehouse_id is distinct from new.warehouse_id
      or old.location_id is distinct from new.location_id
    )
  then
    for resource in
      select distinct values_to_lock.organization_id,
        values_to_lock.warehouse_id,
        values_to_lock.location_id
      from (
        values
          (old.organization_id, old.warehouse_id, old.location_id),
          (new.organization_id, new.warehouse_id, new.location_id)
      ) as values_to_lock(organization_id, warehouse_id, location_id)
      where values_to_lock.organization_id is not null
        and values_to_lock.warehouse_id is not null
      order by values_to_lock.organization_id,
        values_to_lock.warehouse_id,
        values_to_lock.location_id
    loop
      select *
      into master_state
      from inventory_internal.lock_inventory_master_scope(
        resource.organization_id,
        resource.warehouse_id,
        resource.location_id
      );

      if resource.organization_id = new.organization_id
        and resource.warehouse_id = new.warehouse_id
        and resource.location_id is not distinct from new.location_id
      then
        new_warehouse_exists := coalesce(master_state.warehouse_exists, false);
        new_warehouse_active := coalesce(master_state.warehouse_active, false);
        new_location_exists := coalesce(master_state.location_exists, false);
        new_location_active := coalesce(master_state.location_active, false);
      end if;
    end loop;
  else
    select *
    into master_state
    from inventory_internal.lock_inventory_master_scope(
      new.organization_id,
      new.warehouse_id,
      new.location_id
    );
    new_warehouse_exists := coalesce(master_state.warehouse_exists, false);
    new_warehouse_active := coalesce(master_state.warehouse_active, false);
    new_location_exists := coalesce(master_state.location_exists, false);
    new_location_active := coalesce(master_state.location_active, false);
  end if;

  new_remaining := case
    when new.status = 'active' then greatest(new.quantity - new.quantity_consumed, 0)
    else 0
  end;
  if tg_op = 'UPDATE' then
    old_remaining := case
      when old.status = 'active' then greatest(old.quantity - old.quantity_consumed, 0)
      else 0
    end;
  end if;

  if tg_op = 'INSERT' then
    requires_active := new_remaining > 0;
  else
    requires_active := new_remaining > 0 and (
      new_remaining > old_remaining
      or old.organization_id is distinct from new.organization_id
      or old.product_id is distinct from new.product_id
      or old.warehouse_id is distinct from new.warehouse_id
      or old.location_id is distinct from new.location_id
      or old.stock_status is distinct from new.stock_status
      or nullif(btrim(old.lot), '') is distinct from nullif(btrim(new.lot), '')
      or old.expiration_date is distinct from new.expiration_date
      or old.status is distinct from new.status
    );
  end if;

  warehouse_error := case new.source_type
    when 'order-item' then 'ORDER_WAREHOUSE_UNAVAILABLE'
    when 'repair-part' then 'REPAIR_PART_WAREHOUSE_UNAVAILABLE'
    else 'INVENTORY_WAREHOUSE_UNAVAILABLE'
  end;
  location_error := case new.source_type
    when 'order-item' then 'ORDER_WAREHOUSE_UNAVAILABLE'
    when 'repair-part' then 'REPAIR_PART_LOCATION_UNAVAILABLE'
    else 'INVENTORY_LOCATION_UNAVAILABLE'
  end;

  if not new_warehouse_exists then
    raise exception using errcode = 'P0001', message = warehouse_error;
  end if;
  if not new_location_exists then
    raise exception using errcode = 'P0001', message = location_error;
  end if;
  if requires_active and not new_warehouse_active then
    raise exception using errcode = 'P0001', message = warehouse_error;
  end if;
  if requires_active and not new_location_active then
    raise exception using errcode = 'P0001', message = location_error;
  end if;

  return new;
end;
$$;

alter function inventory_internal.guard_inventory_reservation_master() owner to postgres;
revoke all on function inventory_internal.guard_inventory_reservation_master()
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.guard_inventory_reservation_master()
  to postgres;

drop trigger if exists aab_inventory_reservations_master_guard
  on public.inventory_reservations;
create trigger aab_inventory_reservations_master_guard
before insert or update of
  organization_id,
  product_id,
  warehouse_id,
  location_id,
  stock_status,
  lot,
  expiration_date,
  quantity,
  quantity_consumed,
  status
on public.inventory_reservations
for each row execute function inventory_internal.guard_inventory_reservation_master();

-- Orders are operational dependencies checked by warehouse deactivation.
create or replace function public.validate_order_warehouse_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  master_state record;
begin
  if new.warehouse_id is null then
    return new;
  end if;

  select *
  into master_state
  from inventory_internal.lock_inventory_master_scope(
    new.organization_id,
    new.warehouse_id,
    null
  );

  if not coalesce(master_state.warehouse_exists, false)
    or not coalesce(master_state.warehouse_active, false)
  then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_WAREHOUSE_UNAVAILABLE';
  end if;

  return new;
end;
$$;

alter function public.validate_order_warehouse_reference() owner to postgres;
revoke all on function public.validate_order_warehouse_reference()
  from public, anon, authenticated, service_role;
grant execute on function public.validate_order_warehouse_reference()
  to postgres;

create or replace function inventory_internal.guard_purchase_order_master()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  master_state record;
  requires_active boolean := new.status in ('draft', 'issued', 'partially_received');
begin
  select *
  into master_state
  from inventory_internal.lock_inventory_master_scope(
    new.organization_id,
    new.warehouse_id,
    null
  );

  if not coalesce(master_state.warehouse_exists, false) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE';
  end if;
  if requires_active and not coalesce(master_state.warehouse_active, false) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE';
  end if;
  if requires_active and not exists (
    select 1
    from public.warehouse_locations location
    where location.organization_id = new.organization_id
      and location.warehouse_id = new.warehouse_id
      and location.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE';
  end if;

  return new;
end;
$$;

alter function inventory_internal.guard_purchase_order_master() owner to postgres;
revoke all on function inventory_internal.guard_purchase_order_master()
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.guard_purchase_order_master()
  to postgres;

drop trigger if exists aaa_purchase_orders_master_guard
  on public.purchase_orders;
create trigger aaa_purchase_orders_master_guard
before insert or update of organization_id, warehouse_id, status
on public.purchase_orders
for each row execute function inventory_internal.guard_purchase_order_master();

-- Transfers lock both warehouse masters in UUID order before any FEFO/bucket
-- lock. Item guards then lock and validate source/destination locations in the
-- same canonical order.
create or replace function inventory_internal.guard_warehouse_transfer_master()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_warehouse_id uuid;
  master_state record;
begin
  for target_warehouse_id in
    select distinct warehouse_id
    from (
      values (new.source_warehouse_id), (new.destination_warehouse_id)
    ) as warehouses_to_lock(warehouse_id)
    where warehouse_id is not null
    order by warehouse_id
  loop
    select *
    into master_state
    from inventory_internal.lock_inventory_master_scope(
      new.organization_id,
      target_warehouse_id,
      null
    );

    if not coalesce(master_state.warehouse_exists, false)
      or not coalesce(master_state.warehouse_active, false)
    then
      raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSE_UNAVAILABLE';
    end if;
  end loop;

  return new;
end;
$$;

alter function inventory_internal.guard_warehouse_transfer_master() owner to postgres;
revoke all on function inventory_internal.guard_warehouse_transfer_master()
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.guard_warehouse_transfer_master()
  to postgres;

drop trigger if exists aaa_warehouse_transfers_master_guard
  on public.warehouse_transfers;
create trigger aaa_warehouse_transfers_master_guard
before insert or update of organization_id, source_warehouse_id, destination_warehouse_id
on public.warehouse_transfers
for each row execute function inventory_internal.guard_warehouse_transfer_master();

create or replace function inventory_internal.guard_warehouse_transfer_item_master()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_row public.warehouse_transfers%rowtype;
  resource record;
  master_state record;
begin
  select transfer.*
  into transfer_row
  from public.warehouse_transfers transfer
  where transfer.organization_id = new.organization_id
    and transfer.id = new.transfer_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSE_UNAVAILABLE';
  end if;

  for resource in
    select warehouse_id, location_id
    from (
      values
        (transfer_row.source_warehouse_id, new.source_location_id),
        (transfer_row.destination_warehouse_id, new.destination_location_id)
    ) as locations_to_lock(warehouse_id, location_id)
    order by warehouse_id, location_id
  loop
    select *
    into master_state
    from inventory_internal.lock_inventory_master_scope(
      new.organization_id,
      resource.warehouse_id,
      resource.location_id
    );

    if not coalesce(master_state.warehouse_exists, false)
      or not coalesce(master_state.warehouse_active, false)
    then
      raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSE_UNAVAILABLE';
    end if;
    if not coalesce(master_state.location_exists, false)
      or not coalesce(master_state.location_active, false)
    then
      raise exception using errcode = 'P0001', message = 'TRANSFER_LOCATION_UNAVAILABLE';
    end if;
  end loop;

  return new;
end;
$$;

alter function inventory_internal.guard_warehouse_transfer_item_master() owner to postgres;
revoke all on function inventory_internal.guard_warehouse_transfer_item_master()
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.guard_warehouse_transfer_item_master()
  to postgres;

drop trigger if exists aaa_warehouse_transfer_items_master_guard
  on public.warehouse_transfer_items;
create trigger aaa_warehouse_transfer_items_master_guard
before insert or update of
  organization_id,
  transfer_id,
  source_location_id,
  destination_location_id
on public.warehouse_transfer_items
for each row execute function inventory_internal.guard_warehouse_transfer_item_master();

-- Direct product warehouse settings writes must share the same location
-- lifecycle mutex because location deactivation treats the default as a hard
-- dependency.
create or replace function inventory_internal.guard_product_warehouse_setting_master()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  master_state record;
begin
  select *
  into master_state
  from inventory_internal.lock_inventory_master_scope(
    new.organization_id,
    new.warehouse_id,
    new.default_location_id
  );

  if not coalesce(master_state.warehouse_exists, false)
    or not coalesce(master_state.warehouse_active, false)
  then
    raise exception using errcode = 'P0001', message = 'INVENTORY_WAREHOUSE_UNAVAILABLE';
  end if;
  if new.default_location_id is not null and (
    not coalesce(master_state.location_exists, false)
    or not coalesce(master_state.location_active, false)
  ) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_LOCATION_UNAVAILABLE';
  end if;

  return new;
end;
$$;

alter function inventory_internal.guard_product_warehouse_setting_master() owner to postgres;
revoke all on function inventory_internal.guard_product_warehouse_setting_master()
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.guard_product_warehouse_setting_master()
  to postgres;

drop trigger if exists aaa_product_warehouse_settings_master_guard
  on public.product_warehouse_settings;
create trigger aaa_product_warehouse_settings_master_guard
before insert or update on public.product_warehouse_settings
for each row execute function inventory_internal.guard_product_warehouse_setting_master();

-- Preserve the latest writer implementation as an internal core and add a
-- small public guard that prevents its legacy fallback from reactivating an
-- inactive warehouse or GENERAL location.
alter function public.record_inventory_movement(jsonb)
  rename to record_inventory_movement_d1b1_core;
revoke all on function public.record_inventory_movement_d1b1_core(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_movement_d1b1_core(jsonb)
  to postgres;

create function public.record_inventory_movement(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  requested_warehouse_id uuid;
  requested_location_id uuid;
  resolved_warehouse_id uuid;
  normalized_warehouse_name text;
  legacy_warehouse_code text;
  master_state record;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return public.record_inventory_movement_d1b1_core(payload);
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  if actor_id is null
    or target_organization_id is null
    or not public.has_organization_permission(target_organization_id, 'INVENTORY_MANAGE')
  then
    return public.record_inventory_movement_d1b1_core(payload);
  end if;

  requested_warehouse_id := nullif(payload ->> 'warehouse_id', '')::uuid;
  requested_location_id := nullif(payload ->> 'location_id', '')::uuid;
  normalized_warehouse_name := nullif(btrim(payload ->> 'warehouse'), '');
  resolved_warehouse_id := requested_warehouse_id;

  if resolved_warehouse_id is null and normalized_warehouse_name is not null then
    legacy_warehouse_code := 'LEG-' || upper(substr(
      pg_catalog.md5(lower(normalized_warehouse_name)),
      1,
      8
    ));

    select warehouse.id
    into resolved_warehouse_id
    from public.warehouses warehouse
    where warehouse.organization_id = target_organization_id
      and (
        lower(warehouse.name) = lower(normalized_warehouse_name)
        or warehouse.code = legacy_warehouse_code
      )
    order by
      (lower(warehouse.name) = lower(normalized_warehouse_name)) desc,
      warehouse.id
    limit 1;
  end if;

  if resolved_warehouse_id is not null then
    select *
    into master_state
    from inventory_internal.lock_inventory_master_scope(
      target_organization_id,
      resolved_warehouse_id,
      requested_location_id
    );

    if not coalesce(master_state.warehouse_exists, false)
      or not coalesce(master_state.warehouse_active, false)
    then
      raise exception using errcode = 'P0001', message = 'INVENTORY_WAREHOUSE_UNAVAILABLE';
    end if;

    if requested_location_id is not null and (
      not coalesce(master_state.location_exists, false)
      or not coalesce(master_state.location_active, false)
    ) then
      raise exception using errcode = 'P0001', message = 'INVENTORY_LOCATION_UNAVAILABLE';
    end if;

    if requested_location_id is null
      and exists (
        select 1
        from public.warehouse_locations location
        where location.organization_id = target_organization_id
          and location.warehouse_id = resolved_warehouse_id
          and location.code = 'GENERAL'
          and not location.is_active
      )
    then
      raise exception using errcode = 'P0001', message = 'INVENTORY_LOCATION_UNAVAILABLE';
    end if;
  end if;

  return public.record_inventory_movement_d1b1_core(payload);
end;
$$;

alter function public.record_inventory_movement(jsonb) owner to postgres;
revoke all on function public.record_inventory_movement(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_movement(jsonb)
  to authenticated;

-- Normalize location lifecycle row locking to warehouse -> location while
-- keeping the command lock before the warehouse master lock.
create or replace function public.set_warehouse_location_status(payload jsonb)
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
  master_state record;
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
    target_organization_id,
    operation_key_value,
    'set_warehouse_location_status',
    normalized_payload
  );
  if replayed_id is not null then
    return replayed_id;
  end if;

  select *
  into master_state
  from inventory_internal.lock_inventory_master_scope(
    target_organization_id,
    target_warehouse_id,
    target_location_id
  );

  if not coalesce(master_state.location_exists, false) then
    raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_NOT_FOUND';
  end if;
  warehouse_active := coalesce(master_state.warehouse_active, false);

  select location.*
  into location_row
  from public.warehouse_locations location
  where location.organization_id = target_organization_id
    and location.warehouse_id = target_warehouse_id
    and location.id = target_location_id;

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
        select 1
        from public.inventory_balances balance
        where balance.organization_id = target_organization_id
          and balance.location_id = target_location_id
          and balance.quantity <> 0
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_HAS_STOCK';
      end if;
      if exists (
        select 1
        from public.inventory_reservations reservation
        where reservation.organization_id = target_organization_id
          and reservation.location_id = target_location_id
          and reservation.status = 'active'
      ) then
        raise exception using errcode = 'P0001', message = 'WAREHOUSE_LOCATION_HAS_RESERVATIONS';
      end if;
      if exists (
        select 1
        from public.product_warehouse_settings setting
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
    target_organization_id,
    operation_key_value,
    'set_warehouse_location_status',
    normalized_payload,
    target_location_id,
    actor_id
  );
  return target_location_id;
end;
$$;

alter function public.set_warehouse_location_status(jsonb) owner to postgres;
revoke all on function public.set_warehouse_location_status(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_warehouse_location_status(jsonb)
  to authenticated;
