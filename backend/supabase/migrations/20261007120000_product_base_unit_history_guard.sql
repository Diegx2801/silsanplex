begin;

-- A base-unit change reinterprets every existing quantity. The immutable
-- ledger remains a dependency even when its current balance is zero.
create or replace function inventory_internal.product_has_base_unit_dependencies(
  requested_organization_id uuid,
  requested_product_id uuid
)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.inventory_movements movement
    where movement.organization_id = requested_organization_id
      and movement.product_id = requested_product_id
  ) or exists (
    select 1 from public.inventory_reservations reservation
    where reservation.organization_id = requested_organization_id
      and reservation.product_id = requested_product_id
      and reservation.status = 'active'
      and reservation.quantity_consumed < reservation.quantity
  ) or exists (
    -- Retain coverage for legacy repair commitments before their projection.
    select 1 from public.repair_parts part
    where part.organization_id = requested_organization_id
      and part.product_id = requested_product_id
      and part.status = 'reserved'
      and part.quantity_consumed < part.quantity_requested
  );
$$;

create or replace function inventory_internal.guard_product_base_unit_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Runs after synchronize_product_base_unit, including textual legacy writes.
  if new.base_unit_id is distinct from old.base_unit_id
    and inventory_internal.product_has_base_unit_dependencies(old.organization_id, old.id)
  then
    raise exception using errcode = 'P0001',
      message = 'PRODUCT_BASE_UNIT_CHANGE_INVENTORY_CONFLICT';
  end if;
  return new;
end;
$$;

create trigger zzz_products_guard_base_unit_history
before update of base_unit_id, unit_of_measure on public.products
for each row execute function inventory_internal.guard_product_base_unit_history();

create or replace function public.product_base_unit_editable(
  requested_organization_id uuid,
  requested_product_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.has_organization_permission(requested_organization_id, 'PRODUCTS_MANAGE')
  then
    raise exception using errcode = '42501', message = 'PRODUCT_PERMISSION_REQUIRED';
  end if;

  perform 1 from public.products product
  where product.organization_id = requested_organization_id
    and product.id = requested_product_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  return not inventory_internal.product_has_base_unit_dependencies(
    requested_organization_id, requested_product_id
  );
end;
$$;

-- The first movement and a base-unit update take the same product-row lock.
-- A stale purchase/order snapshot must fail rather than silently acquire the
-- meaning of the newly configured unit. Recognized aliases retain compatibility.
create or replace function inventory_internal.guard_inventory_movement_base_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_unit_id uuid;
  current_unit_name text;
begin
  select product.base_unit_id, product.unit_of_measure into current_unit_id, current_unit_name
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.product_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;

  -- Legacy writers may omit the unit snapshot. Capture the current base
  -- without altering the supplied quantity or any existing ledger rows.
  if nullif(btrim(new.unit_of_measure), '') is null then
    new.unit_of_measure := current_unit_name;
  end if;

  if not exists (
    select 1 from public.measurement_units unit
    where unit.organization_id = new.organization_id
      and unit.id = current_unit_id
      and (
        lower(btrim(unit.name)) = lower(btrim(new.unit_of_measure))
        or unit.code = upper(btrim(new.unit_of_measure))
        or unit.code = public.normalized_measurement_unit_code(new.unit_of_measure)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_BASE_UNIT_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger inventory_movements_guard_base_unit
before insert on public.inventory_movements
for each row execute function inventory_internal.guard_inventory_movement_base_unit();

alter function inventory_internal.product_has_base_unit_dependencies(uuid, uuid) owner to postgres;
alter function inventory_internal.guard_product_base_unit_history() owner to postgres;
alter function inventory_internal.guard_inventory_movement_base_unit() owner to postgres;
alter function public.product_base_unit_editable(uuid, uuid) owner to postgres;

revoke all on function inventory_internal.product_has_base_unit_dependencies(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function inventory_internal.guard_product_base_unit_history()
  from public, anon, authenticated, service_role;
revoke all on function inventory_internal.guard_inventory_movement_base_unit()
  from public, anon, authenticated, service_role;
revoke all on function public.product_base_unit_editable(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.product_base_unit_editable(uuid, uuid) to authenticated;

comment on function public.product_base_unit_editable(uuid, uuid) is
  'Returns whether the product base unit can be edited; requires PRODUCTS_MANAGE. The UPDATE trigger remains authoritative.';

commit;
