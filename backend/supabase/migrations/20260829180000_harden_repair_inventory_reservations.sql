-- Mantiene repair_parts como fuente de dominio y evita que su proyeccion en
-- inventory_reservations pueda divergir del bucket o del ciclo de vida real.

do $$
begin
  if exists (
    select 1
    from public.inventory_reservations reservation
    left join public.repair_parts part
      on part.organization_id = reservation.organization_id
     and part.id = reservation.source_id
    where reservation.source_type = 'repair-part'
      and (part.id is null or reservation.id is distinct from part.id)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_INVENTORY_RESERVATION_INVALID_PROJECTION';
  end if;
end;
$$;

create or replace function public.sync_repair_part_inventory_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory_reservations reservation
  set product_id = new.product_id,
      warehouse_id = new.warehouse_id,
      location_id = new.location_id,
      stock_status = new.stock_status,
      lot = new.lot,
      expiration_date = new.expiration_date,
      quantity = new.quantity_requested,
      quantity_consumed = new.quantity_consumed,
      status = case new.status
        when 'reserved' then 'active'
        when 'consumed' then 'consumed'
        else 'released'
      end,
      updated_by = new.updated_by,
      updated_at = new.updated_at
  where reservation.organization_id = new.organization_id
    and reservation.source_type = 'repair-part'
    and reservation.source_id = new.id;

  if found then
    return new;
  end if;

  insert into public.inventory_reservations (
    id, organization_id, product_id, warehouse_id, location_id, stock_status,
    lot, expiration_date, quantity, quantity_consumed, status,
    source_type, source_id, created_by, updated_by, created_at, updated_at
  ) values (
    new.id, new.organization_id, new.product_id, new.warehouse_id, new.location_id,
    new.stock_status, new.lot, new.expiration_date, new.quantity_requested,
    new.quantity_consumed,
    case new.status
      when 'reserved' then 'active'
      when 'consumed' then 'consumed'
      else 'released'
    end,
    'repair-part', new.id, new.created_by, new.updated_by, new.created_at, new.updated_at
  );
  return new;
end;
$$;

create or replace function public.protect_repair_part_inventory_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_PART_DELETE_FORBIDDEN';
  end if;

  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.repair_id is distinct from old.repair_id
    or new.product_id is distinct from old.product_id
    or new.warehouse_id is distinct from old.warehouse_id
    or new.location_id is distinct from old.location_id
    or new.stock_status is distinct from old.stock_status
    or new.lot is distinct from old.lot
    or new.expiration_date is distinct from old.expiration_date
    or new.quantity_requested is distinct from old.quantity_requested
  then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_PART_INVENTORY_IDENTITY_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger repair_parts_enforce_inventory_identity
before update or delete on public.repair_parts
for each row execute function public.protect_repair_part_inventory_identity();

create or replace function public.validate_repair_inventory_reservation_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  part public.repair_parts%rowtype;
  expected_status text;
begin
  if tg_op = 'DELETE' then
    if old.source_type = 'repair-part' then
      raise exception using
        errcode = 'P0001',
        message = 'REPAIR_INVENTORY_RESERVATION_DELETE_FORBIDDEN';
    end if;
    return old;
  end if;

  if new.source_type <> 'repair-part' then
    if tg_op = 'UPDATE' and old.source_type = 'repair-part' then
      raise exception using
        errcode = 'P0001',
        message = 'REPAIR_INVENTORY_RESERVATION_PROJECTION_MISMATCH';
    end if;
    return new;
  end if;

  select repair_part.*
  into part
  from public.repair_parts repair_part
  where repair_part.organization_id = new.organization_id
    and repair_part.id = new.source_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_INVENTORY_RESERVATION_PROJECTION_MISMATCH';
  end if;

  expected_status := case part.status
    when 'reserved' then 'active'
    when 'consumed' then 'consumed'
    else 'released'
  end;

  if new.id is distinct from part.id
    or new.product_id is distinct from part.product_id
    or new.warehouse_id is distinct from part.warehouse_id
    or new.location_id is distinct from part.location_id
    or new.stock_status is distinct from part.stock_status
    or new.lot is distinct from part.lot
    or new.expiration_date is distinct from part.expiration_date
    or new.quantity is distinct from part.quantity_requested
    or new.quantity_consumed is distinct from part.quantity_consumed
    or new.status is distinct from expected_status
  then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_INVENTORY_RESERVATION_PROJECTION_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger inventory_reservations_validate_repair_projection
before insert or update or delete on public.inventory_reservations
for each row execute function public.validate_repair_inventory_reservation_projection();

create or replace function public.enforce_repair_reservation_consumption_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_source_type text;
begin
  if new.reservation_id is null then
    return new;
  end if;

  select reservation.source_type
  into reservation_source_type
  from public.inventory_reservations reservation
  where reservation.organization_id = new.organization_id
    and reservation.id = new.reservation_id;

  if reservation_source_type = 'repair-part'
    and (
      new.source_type is distinct from 'repair-consumption'
      or coalesce(current_setting('app.repair_consumption_tracking_write', true), '') <> 'true'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_PART_CONSUMPTION_RPC_REQUIRED';
  end if;

  return new;
end;
$$;

create trigger inventory_movements_enforce_repair_reservation_route
before insert on public.inventory_movements
for each row execute function public.enforce_repair_reservation_consumption_route();

create or replace function public.validate_repair_reservation_consumption_tracking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_source_type text;
  reservation_source_id uuid;
begin
  select reservation.source_type, reservation.source_id
  into reservation_source_type, reservation_source_id
  from public.inventory_reservations reservation
  where reservation.organization_id = new.organization_id
    and reservation.id = new.reservation_id;

  if reservation_source_type = 'repair-part'
    and not exists (
      select 1
      from public.repair_part_consumptions consumption
      where consumption.organization_id = new.organization_id
        and consumption.id = new.source_id
        and consumption.inventory_movement_id = new.id
        and consumption.repair_part_id = reservation_source_id
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_PART_CONSUMPTION_TRACKING_REQUIRED';
  end if;

  return null;
end;
$$;

create constraint trigger inventory_movements_validate_repair_reservation_tracking
after insert on public.inventory_movements
deferrable initially deferred
for each row
when (new.reservation_id is not null)
execute function public.validate_repair_reservation_consumption_tracking();

do $$
begin
  if exists (
    select 1
    from public.inventory_movements movement
    join public.inventory_reservations reservation
      on reservation.organization_id = movement.organization_id
     and reservation.id = movement.reservation_id
     and reservation.source_type = 'repair-part'
    left join public.repair_part_consumptions consumption
      on consumption.organization_id = movement.organization_id
     and consumption.id = movement.source_id
     and consumption.inventory_movement_id = movement.id
     and consumption.repair_part_id = reservation.source_id
    where consumption.id is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_INVENTORY_CONSUMPTION_TRACKING_INVALID';
  end if;
end;
$$;

-- Repara las proyecciones existentes bajo un lock exclusivo de la sentencia;
-- FEFO no debe reinterpretar la correccion como una reserva nueva.
do $$
declare
  part_row record;
  physical_quantity numeric;
  reserved_by_others numeric;
begin
  for part_row in
    select
      repair_part.organization_id,
      repair_part.product_id,
      repair_part.warehouse_id,
      repair_part.location_id,
      repair_part.stock_status,
      nullif(lower(coalesce(repair_part.lot, '')), '') as lot,
      repair_part.expiration_date,
      sum(repair_part.quantity_requested - repair_part.quantity_consumed)
        as required_quantity
    from public.repair_parts repair_part
    where repair_part.status = 'reserved'
    group by
      repair_part.organization_id, repair_part.product_id,
      repair_part.warehouse_id, repair_part.location_id,
      repair_part.stock_status, lower(coalesce(repair_part.lot, '')),
      repair_part.expiration_date
    order by repair_part.organization_id, repair_part.product_id,
      repair_part.warehouse_id, repair_part.location_id, repair_part.stock_status,
      lower(coalesce(repair_part.lot, '')), repair_part.expiration_date
  loop
    perform public.lock_inventory_bucket(
      part_row.organization_id, part_row.product_id, part_row.warehouse_id,
      part_row.location_id, part_row.stock_status, part_row.lot,
      part_row.expiration_date
    );
  end loop;

  execute 'alter table public.inventory_reservations disable trigger inventory_reservations_enforce_fefo';

  for part_row in
    select
      repair_part.organization_id,
      repair_part.product_id,
      repair_part.warehouse_id,
      repair_part.location_id,
      repair_part.stock_status,
      nullif(lower(coalesce(repair_part.lot, '')), '') as lot,
      repair_part.expiration_date,
      sum(repair_part.quantity_requested - repair_part.quantity_consumed)
        as required_quantity
    from public.repair_parts repair_part
    where repair_part.status = 'reserved'
    group by
      repair_part.organization_id, repair_part.product_id,
      repair_part.warehouse_id, repair_part.location_id,
      repair_part.stock_status, lower(coalesce(repair_part.lot, '')),
      repair_part.expiration_date
  loop
    physical_quantity := public.inventory_bucket_quantity(
      part_row.organization_id, part_row.product_id, part_row.warehouse_id,
      part_row.location_id, part_row.stock_status, part_row.lot,
      part_row.expiration_date
    );
    select coalesce(sum(reservation.quantity - reservation.quantity_consumed), 0)
    into reserved_by_others
    from public.inventory_reservations reservation
    where reservation.organization_id = part_row.organization_id
      and reservation.product_id = part_row.product_id
      and reservation.warehouse_id = part_row.warehouse_id
      and reservation.location_id = part_row.location_id
      and reservation.stock_status = part_row.stock_status
      and lower(coalesce(reservation.lot, '')) = lower(coalesce(part_row.lot, ''))
      and reservation.expiration_date is not distinct from part_row.expiration_date
      and reservation.status = 'active'
      and reservation.source_type <> 'repair-part';

    if part_row.required_quantity > physical_quantity - reserved_by_others
    then
      raise exception using
        errcode = 'P0001',
        message = 'REPAIR_INVENTORY_RESERVATION_OVERALLOCATED',
        detail = pg_catalog.format(
          'product_id=%s,warehouse_id=%s,location_id=%s,physical_quantity=%s,reserved_by_others=%s,required_quantity=%s',
          part_row.product_id, part_row.warehouse_id, part_row.location_id,
          physical_quantity, reserved_by_others, part_row.required_quantity
        );
    end if;
  end loop;

  update public.inventory_reservations reservation
  set product_id = part.product_id,
      warehouse_id = part.warehouse_id,
      location_id = part.location_id,
      stock_status = part.stock_status,
      lot = part.lot,
      expiration_date = part.expiration_date,
      quantity = part.quantity_requested,
      quantity_consumed = part.quantity_consumed,
      status = case part.status
        when 'reserved' then 'active'
        when 'consumed' then 'consumed'
        else 'released'
      end,
      updated_by = part.updated_by,
      updated_at = part.updated_at
  from public.repair_parts part
  where reservation.organization_id = part.organization_id
    and reservation.source_type = 'repair-part'
    and reservation.source_id = part.id;

  insert into public.inventory_reservations (
    id, organization_id, product_id, warehouse_id, location_id, stock_status,
    lot, expiration_date, quantity, quantity_consumed, status,
    source_type, source_id, created_by, updated_by, created_at, updated_at
  )
  select
    repair_part.id,
    repair_part.organization_id,
    repair_part.product_id,
    repair_part.warehouse_id,
    repair_part.location_id,
    repair_part.stock_status,
    repair_part.lot,
    repair_part.expiration_date,
    repair_part.quantity_requested,
    repair_part.quantity_consumed,
    case repair_part.status
      when 'reserved' then 'active'
      when 'consumed' then 'consumed'
      else 'released'
    end,
    'repair-part',
    repair_part.id,
    repair_part.created_by,
    repair_part.updated_by,
    repair_part.created_at,
    repair_part.updated_at
  from public.repair_parts repair_part
  where not exists (
    select 1
    from public.inventory_reservations reservation
    where reservation.organization_id = repair_part.organization_id
      and reservation.source_type = 'repair-part'
      and reservation.source_id = repair_part.id
  );

  execute 'alter table public.inventory_reservations enable trigger inventory_reservations_enforce_fefo';
end;
$$;

revoke all on function public.sync_repair_part_inventory_reservation()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_repair_part_inventory_identity()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_repair_inventory_reservation_projection()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_repair_reservation_consumption_route()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_repair_reservation_consumption_tracking()
  from public, anon, authenticated, service_role;

comment on function public.protect_repair_part_inventory_identity() is
  'Impide cambiar o eliminar la identidad canonica de una reserva de reparacion.';
comment on function public.validate_repair_inventory_reservation_projection() is
  'Exige que cada reserva canonica repair-part sea una proyeccion exacta de repair_parts.';
comment on function public.enforce_repair_reservation_consumption_route() is
  'Impide consumir reservas de reparacion fuera de consume_repair_part.';
comment on function public.validate_repair_reservation_consumption_tracking() is
  'Exige trazabilidad de dominio para cada movimiento que consume una reserva de reparacion.';
