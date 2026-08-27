-- Unifica la identidad del bucket fisico y protege toda salida de inventario.
-- El trigger es la frontera autoritativa para RPC existentes e integraciones
-- futuras que inserten movimientos directamente.

create or replace function public.inventory_bucket_lock_key(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_location_id uuid,
  requested_stock_status text,
  requested_lot text,
  requested_expiration_date date
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.hashtextextended(
    'inventory-bucket:v1:'
    || coalesce(requested_organization_id::text, '<null>') || ':'
    || coalesce(requested_product_id::text, '<null>') || ':'
    || coalesce(requested_warehouse_id::text, '<null>') || ':'
    || coalesce(requested_location_id::text, '<null>') || ':'
    || coalesce(requested_stock_status, '<null>') || ':'
    || char_length(lower(coalesce(requested_lot, '')))::text || ':'
    || lower(coalesce(requested_lot, '')) || ':'
    || coalesce(requested_expiration_date::text, '<null>'),
    0
  );
$$;

create or replace function public.inventory_bucket_quantity(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_location_id uuid,
  requested_stock_status text,
  requested_lot text,
  requested_expiration_date date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case
      when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity
      else -movement.quantity
    end
  ), 0)
  from public.inventory_movements movement
  where movement.organization_id = requested_organization_id
    and movement.product_id = requested_product_id
    and movement.warehouse_id = requested_warehouse_id
    and movement.location_id = requested_location_id
    and movement.stock_status = requested_stock_status
    and lower(coalesce(movement.lot, '')) = lower(coalesce(requested_lot, ''))
    and movement.expiration_date is not distinct from requested_expiration_date;
$$;

create or replace function public.lock_inventory_bucket(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_location_id uuid,
  requested_stock_status text,
  requested_lot text,
  requested_expiration_date date
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(public.inventory_bucket_lock_key(
    requested_organization_id,
    requested_product_id,
    requested_warehouse_id,
    requested_location_id,
    requested_stock_status,
    requested_lot,
    requested_expiration_date
  ));
end;
$$;

create or replace function public.enforce_inventory_outbound_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  available_quantity numeric;
begin
  if new.movement_type not in ('salida', 'ajuste-negativo') then
    return new;
  end if;

  perform public.lock_inventory_bucket(
    new.organization_id,
    new.product_id,
    new.warehouse_id,
    new.location_id,
    new.stock_status,
    new.lot,
    new.expiration_date
  );

  available_quantity := public.inventory_bucket_quantity(
    new.organization_id,
    new.product_id,
    new.warehouse_id,
    new.location_id,
    new.stock_status,
    new.lot,
    new.expiration_date
  );

  if new.quantity > available_quantity then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_INSUFFICIENT_STOCK',
      detail = pg_catalog.format(
        'product_id=%s,warehouse_id=%s,location_id=%s,stock_status=%s,lot=%s,expiration_date=%s,available_quantity=%s,outbound_quantity=%s',
        new.product_id,
        new.warehouse_id,
        new.location_id,
        new.stock_status,
        coalesce(new.lot, ''),
        coalesce(new.expiration_date::text, ''),
        available_quantity,
        new.quantity
      );
  end if;

  return new;
end;
$$;

create index inventory_movements_canonical_bucket_idx
  on public.inventory_movements (
    organization_id,
    product_id,
    warehouse_id,
    location_id,
    stock_status,
    (lower(coalesce(lot, ''))),
    expiration_date
  );

create trigger inventory_movements_enforce_outbound_balance
before insert on public.inventory_movements
for each row execute function public.enforce_inventory_outbound_balance();

revoke all on function public.inventory_bucket_lock_key(uuid, uuid, uuid, uuid, text, text, date)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_bucket_quantity(uuid, uuid, uuid, uuid, text, text, date)
  from public, anon, authenticated, service_role;
revoke all on function public.lock_inventory_bucket(uuid, uuid, uuid, uuid, text, text, date)
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_inventory_outbound_balance()
  from public, anon, authenticated, service_role;

comment on function public.inventory_bucket_lock_key(uuid, uuid, uuid, uuid, text, text, date) is
  'Genera la clave canonica del bucket por organizacion, producto, almacen, ubicacion, estado, lote normalizado y vencimiento.';
comment on function public.inventory_bucket_quantity(uuid, uuid, uuid, uuid, text, text, date) is
  'Calcula el saldo fisico del bucket canonico de inventario.';
comment on function public.lock_inventory_bucket(uuid, uuid, uuid, uuid, text, text, date) is
  'Serializa las reducciones concurrentes del mismo bucket fisico.';
comment on function public.enforce_inventory_outbound_balance() is
  'Impide que una salida o ajuste negativo deje un bucket fisico con saldo negativo.';
