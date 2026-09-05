-- SILSANPLEX: los servicios no participan en inventario fisico
-- ===============================================================

begin;

-- La regla se centraliza en una funcion sin privilegios adicionales. Las
-- operaciones publicas ya validan organizacion y permisos; esta funcion solo
-- protege la invariancia de que un servicio nunca sea stockable.
create or replace function public.assert_product_is_stockable(
  requested_organization_id uuid,
  requested_product_id uuid
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  requested_product_type text;
begin
  select product.product_type
    into requested_product_type
  from public.products product
  where product.organization_id = requested_organization_id
    and product.id = requested_product_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;

  if requested_product_type <> 'good' then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN';
  end if;
end;
$$;

revoke all on function public.assert_product_is_stockable(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.assert_product_is_stockable_value(
  requested_organization_id uuid,
  requested_product_id uuid
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform public.assert_product_is_stockable(
    requested_organization_id, requested_product_id
  );
  return true;
end;
$$;

revoke all on function public.assert_product_is_stockable_value(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.reject_service_inventory_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.assert_product_is_stockable(new.organization_id, new.product_id);
  return new;
end;
$$;

revoke all on function public.reject_service_inventory_reference()
  from public, anon, authenticated, service_role;

create or replace function public.reject_service_lot_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.assert_product_is_stockable(new.organization_id, new.producto_id);
  return new;
end;
$$;

revoke all on function public.reject_service_lot_reference()
  from public, anon, authenticated, service_role;

-- Las operaciones que consultan disponibilidad deben rechazar el servicio
-- antes de evaluar stock. Esto evita respuestas engañosas como
-- "stock insuficiente" y mantiene la regla en el backend.
create or replace function public.inventory_bucket_state(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_location_id uuid,
  requested_stock_status text,
  requested_lot text,
  requested_expiration_date date
)
returns table (
  physical_quantity numeric,
  inventory_value numeric,
  average_cost numeric,
  reserved_quantity numeric,
  sanitary_available_quantity numeric,
  assignable_quantity numeric,
  expired_quantity numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with guard as (
    select public.assert_product_is_stockable_value(
      requested_organization_id, requested_product_id
    ) as checked
  ), state as (
    select
      public.inventory_bucket_quantity(
        requested_organization_id, requested_product_id, requested_warehouse_id,
        requested_location_id, requested_stock_status, requested_lot,
        requested_expiration_date
      ) as physical_quantity,
      public.inventory_bucket_value(
        requested_organization_id, requested_product_id, requested_warehouse_id,
        requested_location_id, requested_stock_status, requested_lot,
        requested_expiration_date
      ) as inventory_value,
      public.inventory_bucket_reserved_quantity(
        requested_organization_id, requested_product_id, requested_warehouse_id,
        requested_location_id, requested_stock_status, requested_lot,
        requested_expiration_date, null
      ) as reserved_quantity
  )
  select
    state.physical_quantity,
    state.inventory_value,
    case when state.physical_quantity > 0
      then round(state.inventory_value / state.physical_quantity, 4)
      else 0 end,
    state.reserved_quantity,
    case
      when requested_stock_status = 'available'
        and (requested_expiration_date is null or requested_expiration_date >= current_date)
      then state.physical_quantity else 0 end,
    case
      when requested_stock_status = 'available'
        and (requested_expiration_date is null or requested_expiration_date >= current_date)
      then greatest(state.physical_quantity - state.reserved_quantity, 0)
      else 0 end,
    case when requested_expiration_date < current_date
      then state.physical_quantity else 0 end
  from state
  cross join guard
  where guard.checked;
$$;

revoke all on function public.inventory_bucket_state(uuid, uuid, uuid, uuid, text, text, date)
  from public, anon, authenticated, service_role;

create or replace function public.inventory_fefo_allocation_plan(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_quantity numeric,
  requested_location_id uuid default null
)
returns table (
  allocation_order bigint,
  location_id uuid,
  location_code text,
  location_name text,
  lot text,
  expiration_date date,
  assignable_quantity numeric,
  allocation_quantity numeric,
  average_cost numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  total_assignable numeric;
begin
  perform public.assert_product_is_stockable(
    requested_organization_id, requested_product_id
  );

  if requested_quantity is null or requested_quantity <= 0 then
    raise exception using errcode = '22023', message = 'INVENTORY_FEFO_QUANTITY_INVALID';
  end if;

  select coalesce(sum(candidate.assignable_quantity), 0)
  into total_assignable
  from public.inventory_fefo_candidates candidate
  where candidate.organization_id = requested_organization_id
    and candidate.product_id = requested_product_id
    and candidate.warehouse_id = requested_warehouse_id
    and (requested_location_id is null or candidate.location_id = requested_location_id);

  if total_assignable < requested_quantity then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_FEFO_INSUFFICIENT_STOCK',
      detail = pg_catalog.format(
        'assignable_quantity=%s,requested_quantity=%s', total_assignable, requested_quantity
      );
  end if;

  return query
  with ranked as (
    select
      candidate.*,
      coalesce(sum(candidate.assignable_quantity) over (
        order by candidate.expiration_date asc nulls last,
          candidate.normalized_lot, candidate.location_id
        rows between unbounded preceding and 1 preceding
      ), 0) as allocated_before,
      row_number() over (
        order by candidate.expiration_date asc nulls last,
          candidate.normalized_lot, candidate.location_id
      ) as candidate_order
    from public.inventory_fefo_candidates candidate
    where candidate.organization_id = requested_organization_id
      and candidate.product_id = requested_product_id
      and candidate.warehouse_id = requested_warehouse_id
      and (requested_location_id is null or candidate.location_id = requested_location_id)
  )
  select
    ranked.candidate_order, ranked.location_id, ranked.location_code,
    ranked.location_name, ranked.lot, ranked.expiration_date,
    ranked.assignable_quantity,
    least(ranked.assignable_quantity, requested_quantity - ranked.allocated_before),
    ranked.average_cost
  from ranked
  where ranked.allocated_before < requested_quantity
  order by ranked.candidate_order;
end;
$$;

revoke all on function public.inventory_fefo_allocation_plan(uuid, uuid, uuid, numeric, uuid)
  from public, anon, authenticated, service_role;

-- Los pedidos pueden contener servicios para su flujo comercial; simplemente
-- no se crea una reserva de inventario para esas líneas.
create or replace function public.reserve_order_item_fefo(
  requested_organization_id uuid,
  requested_order_item_id uuid,
  requested_warehouse_id uuid,
  requested_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_order_item_quantity numeric;
  requested_product_type text;
begin
  select item.quantity, product.product_type
    into requested_order_item_quantity, requested_product_type
  from public.order_items item
  join public.products product
    on product.organization_id = item.organization_id
   and product.id = item.product_id
  where item.organization_id = requested_organization_id
    and item.id = requested_order_item_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_RESERVATION_SOURCE_INVALID';
  end if;

  if requested_product_type = 'service' then
    return;
  end if;

  perform public.reserve_order_item_fefo_quantity(
    requested_organization_id,
    requested_order_item_id,
    requested_warehouse_id,
    requested_order_item_quantity,
    requested_actor_id
  );
end;
$$;

revoke all on function public.reserve_order_item_fefo(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create trigger inventory_movements_reject_service
before insert on public.inventory_movements
for each row execute function public.reject_service_inventory_reference();

create trigger aaa_inventory_reservations_reject_service
before insert or update of organization_id, product_id
on public.inventory_reservations
for each row execute function public.reject_service_inventory_reference();

create trigger purchase_receipt_items_reject_service
before insert or update of organization_id, product_id
on public.purchase_receipt_items
for each row execute function public.reject_service_inventory_reference();

create trigger warehouse_transfer_items_reject_service
before insert or update of organization_id, product_id
on public.warehouse_transfer_items
for each row execute function public.reject_service_inventory_reference();

create trigger repair_parts_reject_service
before insert or update of organization_id, product_id
on public.repair_parts
for each row execute function public.reject_service_inventory_reference();

create trigger lotes_reject_service
before insert or update of organization_id, producto_id
on public.lotes
for each row execute function public.reject_service_lot_reference();

-- Las vistas deben ignorar cualquier movimiento historico de un servicio que
-- pudiera existir antes de aplicar esta barrera.
create or replace view public.inventory_bucket_balances
with (security_invoker = true)
as
select
  movement.organization_id,
  movement.product_id,
  movement.product_code,
  movement.product_description,
  movement.unit_of_measure,
  movement.warehouse_id,
  warehouse.code as warehouse_code,
  warehouse.name as warehouse_name,
  movement.location_id,
  location.code as location_code,
  location.name as location_name,
  movement.stock_status,
  coalesce(movement.lot, '') as lot,
  lower(coalesce(movement.lot, '')) as normalized_lot,
  movement.expiration_date,
  sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
    then movement.quantity else -movement.quantity end) as physical_quantity,
  sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
    then movement.quantity * movement.unit_cost
    else -(movement.quantity * movement.unit_cost) end) as inventory_value,
  case
    when sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
      then movement.quantity else -movement.quantity end) > 0
    then round(
      sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
        then movement.quantity * movement.unit_cost
        else -(movement.quantity * movement.unit_cost) end)
      / sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
        then movement.quantity else -movement.quantity end), 4)
    else 0
  end as average_cost
from public.inventory_movements movement
join public.products product
  on product.organization_id = movement.organization_id
 and product.id = movement.product_id
 and product.product_type = 'good'
join public.warehouses warehouse
  on warehouse.organization_id = movement.organization_id
 and warehouse.id = movement.warehouse_id
join public.warehouse_locations location
  on location.organization_id = movement.organization_id
 and location.warehouse_id = movement.warehouse_id
 and location.id = movement.location_id
group by
  movement.organization_id, movement.product_id, movement.product_code,
  movement.product_description, movement.unit_of_measure, movement.warehouse_id,
  warehouse.code, warehouse.name, movement.location_id, location.code, location.name,
  movement.stock_status, coalesce(movement.lot, ''),
  lower(coalesce(movement.lot, '')), movement.expiration_date;

create or replace view public.inventory_kardex
with (security_invoker = true)
as
select
  movement.id,
  movement.organization_id,
  movement.product_id,
  movement.product_code,
  movement.product_description,
  movement.unit_of_measure,
  movement.movement_type,
  movement.quantity,
  movement.warehouse,
  movement.lot,
  movement.expiration_date,
  movement.operation_date,
  movement.reason,
  movement.source_type,
  movement.source_id,
  movement.created_by,
  movement.created_at,
  movement.warehouse_id,
  movement.location_id,
  movement.stock_status,
  movement.unit_cost,
  movement.transfer_id,
  case
    when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity
    else 0::numeric
  end as inbound_quantity,
  case
    when movement.movement_type in ('salida', 'ajuste-negativo') then movement.quantity
    else 0::numeric
  end as outbound_quantity,
  case
    when movement.movement_type in ('entrada', 'ajuste-positivo')
      then movement.quantity * movement.unit_cost
    else 0::numeric
  end as inbound_value,
  case
    when movement.movement_type in ('salida', 'ajuste-negativo')
      then movement.quantity * movement.unit_cost
    else 0::numeric
  end as outbound_value,
  sum(
    case
      when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity
      else -movement.quantity
    end
  ) over (
    partition by movement.organization_id, movement.product_id, movement.warehouse_id
    order by movement.operation_date, movement.ledger_sequence
    rows between unbounded preceding and current row
  ) as running_quantity,
  sum(
    case
      when movement.movement_type in ('entrada', 'ajuste-positivo')
        then movement.quantity * movement.unit_cost
      else -(movement.quantity * movement.unit_cost)
    end
  ) over (
    partition by movement.organization_id, movement.product_id, movement.warehouse_id
    order by movement.operation_date, movement.ledger_sequence
    rows between unbounded preceding and current row
  ) as running_value,
  movement.ledger_sequence
from public.inventory_movements movement
join public.products product
  on product.organization_id = movement.organization_id
 and product.id = movement.product_id
 and product.product_type = 'good';

commit;
