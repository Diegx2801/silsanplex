-- Protege la transición good -> service contra estado físico vigente y
-- serializa el cambio con todas las escrituras que crean o modifican stock.

begin;

-- Los triggers de referencias físicas toman un bloqueo de fila sobre el
-- producto antes de validar su tipo. El UPDATE de products toma el mismo
-- bloqueo, por lo que una entrada/reserva concurrente termina antes del cambio
-- o vuelve a validar el tipo después de que el cambio confirme.
create or replace function public.reject_service_inventory_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_product_type text;
begin
  select product.product_type
    into requested_product_type
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.product_id
  for update;

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

  return new;
end;
$$;

create or replace function public.reject_service_lot_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_product_type text;
begin
  select product.product_type
    into requested_product_type
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.producto_id
  for update;

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

  return new;
end;
$$;

-- Las actualizaciones de estado/cantidad también deben participar del mismo
-- orden de bloqueo: son las que crean o liberan stock reservado.
drop trigger if exists aaa_inventory_reservations_reject_service
  on public.inventory_reservations;
create trigger aaa_inventory_reservations_reject_service
before insert or update on public.inventory_reservations
for each row execute function public.reject_service_inventory_reference();

drop trigger if exists repair_parts_reject_service on public.repair_parts;
create trigger repair_parts_reject_service
before insert or update on public.repair_parts
for each row execute function public.reject_service_inventory_reference();

create or replace function public.guard_product_type_inventory_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.product_type <> 'good' or new.product_type <> 'service' then
    return new;
  end if;

  -- El ledger es histórico: solo bloquea un bucket cuyo saldo actual no sea
  -- cero. Una entrada compensada completamente por su salida puede conservarse.
  if exists (
    select 1
    from public.inventory_movements movement
    where movement.organization_id = old.organization_id
      and movement.product_id = old.id
    group by
      movement.warehouse_id,
      movement.location_id,
      movement.stock_status,
      lower(coalesce(movement.lot, '')),
      movement.expiration_date
    having sum(
      case
        when movement.movement_type in ('entrada', 'ajuste-positivo')
          then movement.quantity
        else -movement.quantity
      end
    ) <> 0
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_TYPE_CHANGE_INVENTORY_CONFLICT',
      detail = 'PHYSICAL_STOCK';
  end if;

  if exists (
    select 1
    from public.inventory_reservations reservation
    where reservation.organization_id = old.organization_id
      and reservation.product_id = old.id
      and reservation.status = 'active'
      and reservation.quantity_consumed < reservation.quantity
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_TYPE_CHANGE_INVENTORY_CONFLICT',
      detail = 'ACTIVE_RESERVATION';
  end if;

  -- La reserva canónica proyecta repair_parts. Esta comprobación explícita
  -- conserva la barrera incluso ante datos heredados previos a la proyección.
  if exists (
    select 1
    from public.repair_parts part
    where part.organization_id = old.organization_id
      and part.product_id = old.id
      and part.status = 'reserved'
      and part.quantity_consumed < part.quantity_requested
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_TYPE_CHANGE_INVENTORY_CONFLICT',
      detail = 'ACTIVE_REPAIR_PART_RESERVATION';
  end if;

  return new;
end;
$$;

drop trigger if exists products_guard_type_inventory_transition
  on public.products;
create trigger products_guard_type_inventory_transition
before update of product_type on public.products
for each row
when (old.product_type is distinct from new.product_type)
execute function public.guard_product_type_inventory_transition();

revoke all on function public.reject_service_inventory_reference()
  from public, anon, authenticated, service_role;
revoke all on function public.reject_service_lot_reference()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_product_type_inventory_transition()
  from public, anon, authenticated, service_role;

comment on function public.guard_product_type_inventory_transition() is
  'Impide convertir un producto físico en servicio mientras conserve saldo o reservas activas.';

commit;
