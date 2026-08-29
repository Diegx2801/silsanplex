-- Consolida el nucleo autoritativo de inventario sin reescribir el ledger.
-- inventory_movements permanece append-only; todas las cantidades derivadas
-- usan la misma identidad: organizacion, producto, almacen, ubicacion, estado,
-- lote normalizado y vencimiento.

-- ---------------------------------------------------------------------------
-- 1. Reservas canonicas y vinculacion con movimientos
-- ---------------------------------------------------------------------------

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null,
  warehouse_id uuid not null,
  location_id uuid not null,
  stock_status text not null default 'available',
  lot text,
  expiration_date date,
  quantity numeric(14,3) not null,
  quantity_consumed numeric(14,3) not null default 0,
  status text not null default 'active',
  source_type text not null,
  source_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_reservations_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint inventory_reservations_warehouse_fk
    foreign key (organization_id, warehouse_id)
    references public.warehouses (organization_id, id) on delete restrict,
  constraint inventory_reservations_location_fk
    foreign key (organization_id, warehouse_id, location_id)
    references public.warehouse_locations (organization_id, warehouse_id, id) on delete restrict,
  constraint inventory_reservations_status_valid
    check (stock_status in ('available', 'quarantine', 'damaged')),
  constraint inventory_reservations_lifecycle_valid
    check (status in ('active', 'consumed', 'released')),
  constraint inventory_reservations_quantity_positive check (quantity > 0),
  constraint inventory_reservations_consumed_valid
    check (quantity_consumed >= 0 and quantity_consumed <= quantity),
  constraint inventory_reservations_state_consistent check (
    (status = 'active' and quantity_consumed < quantity)
    or (status = 'consumed' and quantity_consumed = quantity)
    or status = 'released'
  ),
  constraint inventory_reservations_lot_length
    check (lot is null or char_length(btrim(lot)) between 1 and 60),
  constraint inventory_reservations_source_type_length
    check (char_length(btrim(source_type)) between 2 and 40),
  constraint inventory_reservations_source_unique
    unique (organization_id, source_type, source_id),
  constraint inventory_reservations_organization_id_id_key
    unique (organization_id, id)
);

create index inventory_reservations_active_bucket_idx
  on public.inventory_reservations (
    organization_id, product_id, warehouse_id, location_id, stock_status,
    lower(coalesce(lot, '')), expiration_date
  )
  where status = 'active';

create index inventory_reservations_source_idx
  on public.inventory_reservations (source_type, source_id);

alter table public.inventory_movements
  add column reservation_id uuid;

alter table public.inventory_movements
  add constraint inventory_movements_reservation_fk
  foreign key (organization_id, reservation_id)
  references public.inventory_reservations (organization_id, id)
  on delete restrict;

create index inventory_movements_reservation_idx
  on public.inventory_movements (organization_id, reservation_id, created_at, id)
  where reservation_id is not null;

insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status,
  lot, expiration_date, quantity, quantity_consumed, status,
  source_type, source_id, created_by, updated_by, created_at, updated_at
)
select
  part.id,
  part.organization_id,
  part.product_id,
  part.warehouse_id,
  part.location_id,
  part.stock_status,
  part.lot,
  part.expiration_date,
  part.quantity_requested,
  part.quantity_consumed,
  case part.status
    when 'reserved' then 'active'
    when 'consumed' then 'consumed'
    else 'released'
  end,
  'repair-part',
  part.id,
  part.created_by,
  part.updated_by,
  part.created_at,
  part.updated_at
from public.repair_parts part
on conflict (organization_id, source_type, source_id) do nothing;

update public.inventory_movements movement
set reservation_id = part.id
from public.repair_part_consumptions consumption
join public.repair_parts part
  on part.organization_id = consumption.organization_id
 and part.id = consumption.repair_part_id
where movement.organization_id = consumption.organization_id
  and movement.id = consumption.inventory_movement_id
  and movement.reservation_id is null;

create or replace function public.sync_repair_part_inventory_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
  )
  on conflict (organization_id, source_type, source_id) do update
  set quantity = excluded.quantity,
      quantity_consumed = excluded.quantity_consumed,
      status = excluded.status,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  return new;
end;
$$;

create trigger repair_parts_sync_inventory_reservation
after insert or update of quantity_requested, quantity_consumed, status
on public.repair_parts
for each row execute function public.sync_repair_part_inventory_reservation();

-- ---------------------------------------------------------------------------
-- 2. Primitivas canonicas de cantidad, reserva, valor y disponibilidad
-- ---------------------------------------------------------------------------

create or replace function public.inventory_bucket_value(
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
      when movement.movement_type in ('entrada', 'ajuste-positivo')
        then movement.quantity * movement.unit_cost
      else -(movement.quantity * movement.unit_cost)
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

create or replace function public.inventory_bucket_reserved_quantity(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_location_id uuid,
  requested_stock_status text,
  requested_lot text,
  requested_expiration_date date,
  excluded_reservation_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(reservation.quantity - reservation.quantity_consumed), 0)
  from public.inventory_reservations reservation
  where reservation.organization_id = requested_organization_id
    and reservation.product_id = requested_product_id
    and reservation.warehouse_id = requested_warehouse_id
    and reservation.location_id = requested_location_id
    and reservation.stock_status = requested_stock_status
    and lower(coalesce(reservation.lot, '')) = lower(coalesce(requested_lot, ''))
    and reservation.expiration_date is not distinct from requested_expiration_date
    and reservation.status = 'active'
    and reservation.id is distinct from excluded_reservation_id;
$$;

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
  with state as (
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
  from state;
$$;

-- ---------------------------------------------------------------------------
-- 3. Vistas autoritativas de bucket, resumen y alertas
-- ---------------------------------------------------------------------------

create view public.inventory_bucket_balances
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

create view public.inventory_bucket_availability
with (security_invoker = true)
as
with reservations as (
  select
    reservation.organization_id,
    reservation.product_id,
    reservation.warehouse_id,
    reservation.location_id,
    reservation.stock_status,
    lower(coalesce(reservation.lot, '')) as normalized_lot,
    reservation.expiration_date,
    sum(reservation.quantity - reservation.quantity_consumed) as reserved_quantity
  from public.inventory_reservations reservation
  where reservation.status = 'active'
  group by
    reservation.organization_id, reservation.product_id, reservation.warehouse_id,
    reservation.location_id, reservation.stock_status,
    lower(coalesce(reservation.lot, '')), reservation.expiration_date
)
select
  balance.*,
  coalesce(reservation.reserved_quantity, 0) as reserved_quantity,
  case
    when balance.stock_status = 'available'
      and (balance.expiration_date is null or balance.expiration_date >= current_date)
    then balance.physical_quantity else 0 end as sanitary_available_quantity,
  case
    when balance.stock_status = 'available'
      and (balance.expiration_date is null or balance.expiration_date >= current_date)
    then greatest(balance.physical_quantity - coalesce(reservation.reserved_quantity, 0), 0)
    else 0 end as assignable_quantity,
  case when balance.stock_status = 'quarantine'
    then balance.physical_quantity else 0 end as quarantine_quantity,
  case when balance.stock_status = 'damaged'
    then balance.physical_quantity else 0 end as damaged_quantity,
  case when balance.expiration_date < current_date
    then balance.physical_quantity else 0 end as expired_quantity,
  case
    when balance.expiration_date is null then null
    when balance.expiration_date < current_date then 'expired'
    when balance.expiration_date <= current_date + 7 then 'urgent'
    else 'upcoming'
  end as expiration_state
from public.inventory_bucket_balances balance
left join reservations reservation
  on reservation.organization_id = balance.organization_id
 and reservation.product_id = balance.product_id
 and reservation.warehouse_id = balance.warehouse_id
 and reservation.location_id = balance.location_id
 and reservation.stock_status = balance.stock_status
 and reservation.normalized_lot = balance.normalized_lot
 and reservation.expiration_date is not distinct from balance.expiration_date;

create view public.inventory_stock_summary
with (security_invoker = true)
as
select
  bucket.organization_id,
  bucket.product_id,
  bucket.product_code,
  bucket.product_description,
  bucket.unit_of_measure,
  bucket.warehouse_id,
  bucket.warehouse_code,
  bucket.warehouse_name,
  sum(bucket.physical_quantity) as physical_quantity,
  sum(bucket.sanitary_available_quantity) as sanitary_available_quantity,
  sum(bucket.reserved_quantity) as reserved_quantity,
  sum(bucket.assignable_quantity) as assignable_quantity,
  sum(bucket.quarantine_quantity) as quarantine_quantity,
  sum(bucket.damaged_quantity) as damaged_quantity,
  sum(bucket.expired_quantity) as expired_quantity,
  sum(bucket.inventory_value) as inventory_value
from public.inventory_bucket_availability bucket
group by
  bucket.organization_id, bucket.product_id, bucket.product_code,
  bucket.product_description, bucket.unit_of_measure, bucket.warehouse_id,
  bucket.warehouse_code, bucket.warehouse_name;

create view public.inventory_low_stock_alerts
with (security_invoker = true)
as
select
  setting.organization_id,
  setting.product_id,
  product.code as product_code,
  product.description as product_description,
  product.unit_of_measure,
  setting.warehouse_id,
  warehouse.code as warehouse_code,
  warehouse.name as warehouse_name,
  coalesce(summary.assignable_quantity, 0) as assignable_quantity,
  setting.minimum_stock,
  coalesce(summary.assignable_quantity, 0) <= setting.minimum_stock
    as has_low_stock_alert
from public.product_warehouse_settings setting
join public.products product
  on product.organization_id = setting.organization_id
 and product.id = setting.product_id
join public.warehouses warehouse
  on warehouse.organization_id = setting.organization_id
 and warehouse.id = setting.warehouse_id
left join public.inventory_stock_summary summary
  on summary.organization_id = setting.organization_id
 and summary.product_id = setting.product_id
 and summary.warehouse_id = setting.warehouse_id;

create view public.inventory_expiration_alerts
with (security_invoker = true)
as
select
  bucket.*,
  coalesce(setting.expiration_alert_days, 30) as expiration_alert_days,
  bucket.expiration_date - current_date as days_until_expiration
from public.inventory_bucket_availability bucket
left join public.product_warehouse_settings setting
  on setting.organization_id = bucket.organization_id
 and setting.product_id = bucket.product_id
 and setting.warehouse_id = bucket.warehouse_id
where bucket.physical_quantity > 0
  and bucket.expiration_date is not null
  and bucket.expiration_date <= current_date + coalesce(setting.expiration_alert_days, 30);

create or replace view public.inventory_balances
with (security_invoker = true)
as
select
  balance.organization_id,
  balance.product_id,
  balance.product_code,
  balance.product_description,
  balance.unit_of_measure,
  balance.warehouse_id,
  balance.warehouse_code,
  balance.warehouse_name,
  balance.location_id,
  balance.location_code,
  balance.location_name,
  balance.stock_status,
  balance.lot,
  balance.expiration_date,
  balance.physical_quantity as quantity,
  balance.inventory_value,
  balance.average_cost
from public.inventory_bucket_balances balance;

-- ---------------------------------------------------------------------------
-- 4. RLS y exposicion explicita
-- ---------------------------------------------------------------------------

alter table public.inventory_reservations enable row level security;

create policy inventory_reservations_select_authorized
on public.inventory_reservations
for select to authenticated
using ((select public.has_organization_permission(organization_id, 'INVENTORY_VIEW')));

revoke all on table public.inventory_reservations from public, anon, authenticated;
grant select on table public.inventory_reservations to authenticated;

revoke all on table
  public.inventory_bucket_balances,
  public.inventory_bucket_availability,
  public.inventory_stock_summary,
  public.inventory_low_stock_alerts,
  public.inventory_expiration_alerts
from public, anon, authenticated;

grant select on table
  public.inventory_bucket_balances,
  public.inventory_bucket_availability,
  public.inventory_stock_summary,
  public.inventory_low_stock_alerts,
  public.inventory_expiration_alerts
to authenticated;

revoke all on function public.inventory_bucket_value(uuid, uuid, uuid, uuid, text, text, date)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_bucket_reserved_quantity(uuid, uuid, uuid, uuid, text, text, date, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_bucket_state(uuid, uuid, uuid, uuid, text, text, date)
  from public, anon, authenticated, service_role;
revoke all on function public.sync_repair_part_inventory_reservation()
  from public, anon, authenticated, service_role;

comment on table public.inventory_reservations is
  'Reservas activas, consumidas o liberadas vinculadas al bucket fisico canonico.';
comment on view public.inventory_bucket_balances is
  'Cantidad y valor fisico agrupados por la identidad canonica completa del bucket.';
comment on view public.inventory_bucket_availability is
  'Stock fisico, sanitario, reservado y asignable por bucket canonico.';
comment on view public.inventory_stock_summary is
  'Resumen autoritativo por producto y almacen, apto para consumo desde React.';
