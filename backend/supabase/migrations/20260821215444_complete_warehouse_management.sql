-- SILSANPLEX / Modulo VIII: gestion integral de almacenes.
-- Esta migracion conserva el historial legado y normaliza almacenes,
-- ubicaciones, condiciones de stock, costos y transferencias.

-- ------------------------------------------------------------
-- 1. Maestros de almacenes, ubicaciones y configuracion de stock
-- ------------------------------------------------------------

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_code_format check (code ~ '^[A-Z0-9][A-Z0-9._-]{0,19}$'),
  constraint warehouses_name_length check (char_length(btrim(name)) between 2 and 80),
  constraint warehouses_address_length check (address is null or char_length(btrim(address)) <= 180),
  unique (organization_id, code),
  unique (organization_id, id)
);

create index warehouses_organization_active_name_idx
  on public.warehouses (organization_id, is_active, name, id);

create unique index products_organization_id_unique
  on public.products (organization_id, id);

create table public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  warehouse_id uuid not null,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_locations_warehouse_fk
    foreign key (organization_id, warehouse_id)
    references public.warehouses (organization_id, id) on delete restrict,
  constraint warehouse_locations_code_format check (code ~ '^[A-Z0-9][A-Z0-9._-]{0,29}$'),
  constraint warehouse_locations_name_length check (char_length(btrim(name)) between 2 and 80),
  constraint warehouse_locations_description_length check (description is null or char_length(btrim(description)) <= 180),
  unique (organization_id, warehouse_id, code),
  unique (organization_id, id),
  unique (organization_id, warehouse_id, id)
);

create index warehouse_locations_warehouse_active_name_idx
  on public.warehouse_locations (organization_id, warehouse_id, is_active, name, id);

create table public.product_warehouse_settings (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null,
  warehouse_id uuid not null,
  default_location_id uuid,
  minimum_stock numeric(14,3) not null default 0,
  expiration_alert_days integer not null default 30,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, product_id, warehouse_id),
  constraint product_warehouse_settings_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete cascade,
  constraint product_warehouse_settings_warehouse_fk
    foreign key (organization_id, warehouse_id)
    references public.warehouses (organization_id, id) on delete cascade,
  constraint product_warehouse_settings_location_fk
    foreign key (organization_id, warehouse_id, default_location_id)
    references public.warehouse_locations (organization_id, warehouse_id, id) on delete restrict,
  constraint product_warehouse_settings_minimum_nonnegative check (minimum_stock >= 0),
  constraint product_warehouse_settings_alert_days check (expiration_alert_days between 0 and 3650)
);

create index product_warehouse_settings_warehouse_idx
  on public.product_warehouse_settings (organization_id, warehouse_id, product_id);

create trigger warehouses_set_updated_at before update on public.warehouses
for each row execute function public.set_updated_at();
create trigger warehouse_locations_set_updated_at before update on public.warehouse_locations
for each row execute function public.set_updated_at();
create trigger product_warehouse_settings_set_updated_at before update on public.product_warehouse_settings
for each row execute function public.set_updated_at();

create or replace function public.protect_product_warehouse_setting_keys()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.product_id is distinct from old.product_id
    or new.warehouse_id is distinct from old.warehouse_id
  then raise exception using errcode = 'P0001', message = 'WAREHOUSE_SETTING_IMMUTABLE_KEYS'; end if;
  return new;
end;
$$;
create trigger product_warehouse_settings_protect_keys
before update on public.product_warehouse_settings
for each row execute function public.protect_product_warehouse_setting_keys();

create or replace function public.protect_warehouse_master_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then raise exception using errcode = 'P0001', message = 'WAREHOUSE_IMMUTABLE_FIELDS'; end if;
  return new;
end;
$$;
create trigger warehouses_protect_immutable_fields before update on public.warehouses
for each row execute function public.protect_warehouse_master_fields();
create trigger warehouse_locations_protect_immutable_fields before update on public.warehouse_locations
for each row execute function public.protect_warehouse_master_fields();

create or replace function public.audit_warehouse_master_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, old_values, new_values)
  values (new.organization_id, coalesce((select auth.uid()), new.updated_by, new.created_by),
    upper(tg_table_name) || '_' || tg_op, tg_table_name, new.id::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  return new;
end;
$$;
create trigger warehouses_audit_change after insert or update on public.warehouses
for each row execute function public.audit_warehouse_master_change();
create trigger warehouse_locations_audit_change after insert or update on public.warehouse_locations
for each row execute function public.audit_warehouse_master_change();

-- Un maestro por cada nombre legado; el codigo estable evita colisiones.
insert into public.warehouses (organization_id, code, name)
select source.organization_id,
       'LEG-' || upper(substr(md5(lower(source.name)), 1, 8)),
       source.name
from (
  select organization_id, min(btrim(warehouse)) as name
  from (
    select organization_id, warehouse from public.inventory_movements
    union all
    select organization_id, warehouse from public.purchase_orders
  ) legacy
  where nullif(btrim(warehouse), '') is not null
  group by organization_id, lower(btrim(warehouse))
) source
on conflict (organization_id, code) do nothing;

-- Organizaciones aun sin operaciones reciben un almacen principal.
insert into public.warehouses (organization_id, code, name)
select organization.id, 'PRINCIPAL', 'Almacen principal'
from public.organizations organization
where not exists (
  select 1 from public.warehouses warehouse
  where warehouse.organization_id = organization.id
);

insert into public.warehouse_locations (organization_id, warehouse_id, code, name)
select organization_id, id, 'GENERAL', 'Ubicacion general'
from public.warehouses
on conflict (organization_id, warehouse_id, code) do nothing;

-- ------------------------------------------------------------
-- 2. Ampliacion inmutable del libro de movimientos
-- ------------------------------------------------------------

alter table public.inventory_movements
  add column warehouse_id uuid,
  add column location_id uuid,
  add column stock_status text not null default 'available',
  add column unit_cost numeric(16,4) not null default 0,
  add column transfer_id uuid;

update public.inventory_movements movement
set warehouse_id = warehouse.id,
    location_id = location.id
from public.warehouses warehouse
join public.warehouse_locations location
  on location.organization_id = warehouse.organization_id
 and location.warehouse_id = warehouse.id
 and location.code = 'GENERAL'
where warehouse.organization_id = movement.organization_id
  and lower(warehouse.name) = lower(btrim(movement.warehouse));

update public.inventory_movements movement
set unit_cost = item.unit_cost
from public.purchase_order_items item
where movement.source_type = 'purchase-receipt'
  and movement.source_id = item.id;

alter table public.inventory_movements
  alter column warehouse_id set not null,
  alter column location_id set not null,
  add constraint inventory_movements_warehouse_fk
    foreign key (organization_id, warehouse_id)
    references public.warehouses (organization_id, id) on delete restrict,
  add constraint inventory_movements_location_fk
    foreign key (organization_id, warehouse_id, location_id)
    references public.warehouse_locations (organization_id, warehouse_id, id) on delete restrict,
  add constraint inventory_movements_status_valid
    check (stock_status in ('available', 'quarantine', 'damaged')),
  add constraint inventory_movements_cost_nonnegative check (unit_cost >= 0);

alter table public.inventory_movements drop constraint inventory_movements_source_valid;
alter table public.inventory_movements drop constraint inventory_movements_source_consistent;
alter table public.inventory_movements
  add constraint inventory_movements_source_valid
    check (source_type in ('manual', 'purchase-receipt', 'warehouse-transfer', 'stock-reclassification')),
  add constraint inventory_movements_source_consistent
    check (
      (source_type = 'manual' and source_id is null)
      or (source_type <> 'manual' and source_id is not null)
    );

drop index public.inventory_movements_stock_lookup_idx;
create index inventory_movements_stock_bucket_idx
  on public.inventory_movements (
    organization_id, product_id, warehouse_id, location_id,
    stock_status, coalesce(lot, ''), created_at, id
  );
create index inventory_movements_expiration_idx
  on public.inventory_movements (organization_id, expiration_date, product_id)
  where expiration_date is not null;
create index inventory_movements_transfer_idx
  on public.inventory_movements (transfer_id, created_at, id)
  where transfer_id is not null;

-- El historial de inventario nunca se edita ni elimina.
create or replace function public.prevent_inventory_movement_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'INVENTORY_MOVEMENT_IMMUTABLE';
end;
$$;
create trigger inventory_movements_immutable
before update or delete on public.inventory_movements
for each row execute function public.prevent_inventory_movement_mutation();

-- ------------------------------------------------------------
-- 3. Transferencias persistentes
-- ------------------------------------------------------------

create table public.warehouse_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reference text not null,
  source_warehouse_id uuid not null,
  destination_warehouse_id uuid not null,
  transferred_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint warehouse_transfers_source_fk foreign key (organization_id, source_warehouse_id)
    references public.warehouses (organization_id, id) on delete restrict,
  constraint warehouse_transfers_destination_fk foreign key (organization_id, destination_warehouse_id)
    references public.warehouses (organization_id, id) on delete restrict,
  constraint warehouse_transfers_distinct check (source_warehouse_id <> destination_warehouse_id),
  constraint warehouse_transfers_reference_length check (char_length(btrim(reference)) between 2 and 40),
  constraint warehouse_transfers_notes_length check (notes is null or char_length(btrim(notes)) <= 240),
  unique (organization_id, reference),
  unique (organization_id, id)
);

create table public.warehouse_transfer_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  transfer_id uuid not null,
  product_id uuid not null,
  product_code text not null,
  product_description text not null,
  source_location_id uuid not null,
  destination_location_id uuid not null,
  lot text,
  expiration_date date,
  stock_status text not null default 'available',
  quantity numeric(14,3) not null,
  unit_cost numeric(16,4) not null,
  created_at timestamptz not null default now(),
  constraint warehouse_transfer_items_transfer_fk foreign key (organization_id, transfer_id)
    references public.warehouse_transfers (organization_id, id) on delete restrict,
  constraint warehouse_transfer_items_product_fk foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint warehouse_transfer_items_quantity_positive check (quantity > 0),
  constraint warehouse_transfer_items_cost_nonnegative check (unit_cost >= 0),
  constraint warehouse_transfer_items_status_valid check (stock_status in ('available', 'quarantine', 'damaged')),
  constraint warehouse_transfer_items_lot_length check (lot is null or char_length(btrim(lot)) <= 60)
);

create index warehouse_transfers_organization_date_idx
  on public.warehouse_transfers (organization_id, transferred_at desc, id);
create index warehouse_transfer_items_transfer_idx
  on public.warehouse_transfer_items (organization_id, transfer_id, id);
create index warehouse_transfer_items_product_idx on public.warehouse_transfer_items (product_id);

alter table public.inventory_movements
  add constraint inventory_movements_transfer_fk
  foreign key (organization_id, transfer_id)
  references public.warehouse_transfers (organization_id, id) on delete restrict;

-- ------------------------------------------------------------
-- 4. Consultas seguras: stock, alertas y kardex valorizado
-- ------------------------------------------------------------

create view public.inventory_balances
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
  movement.expiration_date,
  sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity else -movement.quantity end) as quantity,
  sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity * movement.unit_cost else -(movement.quantity * movement.unit_cost) end) as inventory_value,
  case
    when sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity else -movement.quantity end) > 0
    then round(
      sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity * movement.unit_cost else -(movement.quantity * movement.unit_cost) end)
      / sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity else -movement.quantity end), 4
    )
    else 0
  end as average_cost
from public.inventory_movements movement
join public.warehouses warehouse on warehouse.id = movement.warehouse_id
join public.warehouse_locations location on location.id = movement.location_id
group by movement.organization_id, movement.product_id, movement.product_code,
  movement.product_description, movement.unit_of_measure, movement.warehouse_id,
  warehouse.code, warehouse.name, movement.location_id, location.code, location.name,
  movement.stock_status, coalesce(movement.lot, ''), movement.expiration_date;

create view public.inventory_alerts
with (security_invoker = true)
as
select
  balance.*,
  coalesce(setting.minimum_stock, 0) as minimum_stock,
  coalesce(setting.expiration_alert_days, 30) as expiration_alert_days,
  (balance.stock_status = 'available' and balance.quantity <= coalesce(setting.minimum_stock, 0)) as has_low_stock_alert,
  (balance.quantity > 0 and balance.expiration_date is not null
    and balance.expiration_date <= current_date + coalesce(setting.expiration_alert_days, 30)) as has_expiration_alert,
  case
    when balance.expiration_date is null then null
    else balance.expiration_date - current_date
  end as days_until_expiration
from public.inventory_balances balance
left join public.product_warehouse_settings setting
  on setting.organization_id = balance.organization_id
 and setting.product_id = balance.product_id
 and setting.warehouse_id = balance.warehouse_id
union all
select
  setting.organization_id,
  setting.product_id,
  product.code,
  product.description,
  product.unit_of_measure,
  setting.warehouse_id,
  warehouse.code,
  warehouse.name,
  location.id,
  location.code,
  location.name,
  'available'::text,
  ''::text,
  null::date,
  0::numeric,
  0::numeric,
  0::numeric,
  setting.minimum_stock,
  setting.expiration_alert_days,
  true,
  false,
  null::integer
from public.product_warehouse_settings setting
join public.products product
  on product.organization_id = setting.organization_id and product.id = setting.product_id
join public.warehouses warehouse
  on warehouse.organization_id = setting.organization_id and warehouse.id = setting.warehouse_id
join lateral (
  select candidate.id, candidate.code, candidate.name
  from public.warehouse_locations candidate
  where candidate.organization_id = setting.organization_id
    and candidate.warehouse_id = setting.warehouse_id
    and candidate.is_active
  order by (candidate.id = setting.default_location_id) desc, candidate.created_at, candidate.id
  limit 1
) location on true
where not exists (
  select 1 from public.inventory_balances balance
  where balance.organization_id = setting.organization_id
    and balance.product_id = setting.product_id
    and balance.warehouse_id = setting.warehouse_id
);

create view public.inventory_kardex
with (security_invoker = true)
as
select
  movement.*,
  case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity else 0 end as inbound_quantity,
  case when movement.movement_type in ('salida', 'ajuste-negativo') then movement.quantity else 0 end as outbound_quantity,
  case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity * movement.unit_cost else 0 end as inbound_value,
  case when movement.movement_type in ('salida', 'ajuste-negativo') then movement.quantity * movement.unit_cost else 0 end as outbound_value,
  sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity else -movement.quantity end)
    over (partition by movement.organization_id, movement.product_id order by movement.operation_date, movement.created_at,
      case when movement.movement_type in ('salida', 'ajuste-negativo') then 0 else 1 end, movement.id) as running_quantity,
  sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity * movement.unit_cost else -(movement.quantity * movement.unit_cost) end)
    over (partition by movement.organization_id, movement.product_id order by movement.operation_date, movement.created_at,
      case when movement.movement_type in ('salida', 'ajuste-negativo') then 0 else 1 end, movement.id) as running_value
from public.inventory_movements movement;

-- ------------------------------------------------------------
-- 5. Operaciones atomicas y control de concurrencia
-- ------------------------------------------------------------

create or replace function public.record_inventory_movement(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  product_id uuid := (payload ->> 'product_id')::uuid;
  warehouse_id uuid := nullif(payload ->> 'warehouse_id', '')::uuid;
  location_id uuid := nullif(payload ->> 'location_id', '')::uuid;
  product_row public.products%rowtype;
  warehouse_row public.warehouses%rowtype;
  movement_type text := payload ->> 'movement_type';
  quantity numeric := (payload ->> 'quantity')::numeric;
  lot text := nullif(btrim(payload ->> 'lot'), '');
  stock_status text := coalesce(nullif(payload ->> 'stock_status', ''), 'available');
  unit_cost numeric := coalesce(nullif(payload ->> 'unit_cost', '')::numeric, 0);
  available numeric;
  average_cost numeric;
  movement_id uuid;
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  select * into product_row from public.products product
  where product.id = product_id and product.organization_id = organization_id and product.is_active;
  if not found or (product_row.batch_control and lot is null) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;

  if warehouse_id is null then
    select warehouse.* into warehouse_row from public.warehouses warehouse
    where warehouse.organization_id = organization_id
      and lower(warehouse.name) = lower(btrim(payload ->> 'warehouse')) and warehouse.is_active
    order by warehouse.id limit 1;
    warehouse_id := warehouse_row.id;
  else
    select warehouse.* into warehouse_row from public.warehouses warehouse
    where warehouse.id = warehouse_id and warehouse.organization_id = organization_id and warehouse.is_active;
  end if;
  if warehouse_id is null and nullif(btrim(payload ->> 'warehouse'), '') is not null then
    insert into public.warehouses (organization_id, code, name, created_by, updated_by)
    values (organization_id, 'LEG-' || upper(substr(md5(lower(btrim(payload ->> 'warehouse'))), 1, 8)), btrim(payload ->> 'warehouse'), actor_id, actor_id)
    on conflict on constraint warehouses_organization_id_code_key do update set name = excluded.name, updated_by = actor_id
    returning * into warehouse_row;
    warehouse_id := warehouse_row.id;
  end if;
  if warehouse_id is null then raise exception using errcode = 'P0001', message = 'INVENTORY_WAREHOUSE_UNAVAILABLE'; end if;

  if location_id is null then
    select location.id into location_id from public.warehouse_locations location
    where location.organization_id = organization_id and location.warehouse_id = warehouse_id and location.is_active
    order by (location.code = 'GENERAL') desc, location.created_at, location.id limit 1;
  end if;
  if location_id is null then
    insert into public.warehouse_locations (organization_id, warehouse_id, code, name, created_by, updated_by)
    values (organization_id, warehouse_id, 'GENERAL', 'Ubicacion general', actor_id, actor_id)
    on conflict on constraint warehouse_locations_organization_id_warehouse_id_code_key do update set is_active = true, updated_by = actor_id
    returning id into location_id;
  end if;
  if not exists (select 1 from public.warehouse_locations location where location.id = location_id and location.organization_id = organization_id and location.warehouse_id = warehouse_id and location.is_active) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_LOCATION_UNAVAILABLE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(organization_id::text || ':' || product_id::text || ':' || warehouse_id::text || ':' || location_id::text || ':' || stock_status || ':' || lower(coalesce(lot, '')), 0));
  select
    coalesce(sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity else -movement.quantity end), 0),
    coalesce(
      sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity * movement.unit_cost else -(movement.quantity * movement.unit_cost) end)
      / nullif(sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity else -movement.quantity end), 0), 0
    )
  into available, average_cost
  from public.inventory_movements movement
  where movement.organization_id = organization_id and movement.product_id = product_id
    and movement.warehouse_id = warehouse_id and movement.location_id = location_id
    and movement.stock_status = stock_status and lower(coalesce(movement.lot, '')) = lower(coalesce(lot, ''));

  if movement_type in ('salida', 'ajuste-negativo') then
    if quantity > available then raise exception using errcode = 'P0001', message = 'INVENTORY_INSUFFICIENT_STOCK'; end if;
    unit_cost := greatest(average_cost, 0);
  end if;

  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, created_by
  ) values (
    organization_id, product_id, product_row.code, product_row.description, product_row.unit_of_measure,
    movement_type, quantity, warehouse_row.name, warehouse_id, location_id, stock_status,
    unit_cost, lot, nullif(payload ->> 'expiration_date', '')::date,
    (payload ->> 'operation_date')::date, btrim(payload ->> 'reason'), actor_id
  ) returning id into movement_id;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (organization_id, actor_id, 'INVENTORY_MOVEMENT_CREATED', 'inventory_movement', movement_id::text,
    jsonb_build_object('product_id', product_id, 'movement_type', movement_type, 'quantity', quantity, 'warehouse_id', warehouse_id, 'location_id', location_id, 'stock_status', stock_status));
  return movement_id;
end;
$$;

create or replace function public.receive_purchase_order(requested_organization_id uuid, requested_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  order_row public.purchase_orders%rowtype;
  warehouse_row public.warehouses%rowtype;
  default_location_id uuid;
begin
  if actor_id is null or not public.has_organization_permission(requested_organization_id, 'PURCHASES_RECEIVE') then
    raise exception using errcode = '42501', message = 'PURCHASE_RECEIPT_FORBIDDEN';
  end if;
  select * into order_row from public.purchase_orders
  where id = requested_order_id and organization_id = requested_organization_id for update;
  if not found or order_row.status <> 'issued' then raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE'; end if;

  select * into warehouse_row from public.warehouses warehouse
  where warehouse.organization_id = requested_organization_id and lower(warehouse.name) = lower(btrim(order_row.warehouse)) and warehouse.is_active
  order by warehouse.id limit 1;
  if not found then
    insert into public.warehouses (organization_id, code, name, created_by, updated_by)
    values (requested_organization_id, 'LEG-' || upper(substr(md5(lower(btrim(order_row.warehouse))), 1, 8)), btrim(order_row.warehouse), actor_id, actor_id)
    on conflict on constraint warehouses_organization_id_code_key do update set name = excluded.name, updated_by = actor_id
    returning * into warehouse_row;
  end if;
  select location.id into default_location_id from public.warehouse_locations location
  where location.organization_id = requested_organization_id and location.warehouse_id = warehouse_row.id and location.is_active
  order by (location.code = 'GENERAL') desc, location.created_at, location.id limit 1;
  if default_location_id is null then
    insert into public.warehouse_locations (organization_id, warehouse_id, code, name, created_by, updated_by)
    values (requested_organization_id, warehouse_row.id, 'GENERAL', 'Ubicacion general', actor_id, actor_id)
    on conflict on constraint warehouse_locations_organization_id_warehouse_id_code_key do update set is_active = true, updated_by = actor_id
    returning id into default_location_id;
  end if;

  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status, unit_cost,
    lot, expiration_date, operation_date, reason, source_type, source_id, created_by
  )
  select item.organization_id, item.product_id, item.product_code, item.product_description, item.unit_of_measure,
    'entrada', item.quantity, warehouse_row.name, warehouse_row.id, default_location_id, 'available', item.unit_cost,
    item.lot, item.expiration_date, current_date,
    'Recepcion de ' || order_row.document_type || ' ' || order_row.series || '-' || order_row.document_number,
    'purchase-receipt', item.id, actor_id
  from public.purchase_order_items item where item.purchase_order_id = requested_order_id order by item.id;

  update public.purchase_orders set status = 'received', received_at = now(), received_by = actor_id, updated_by = actor_id where id = requested_order_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (requested_organization_id, actor_id, 'PURCHASE_ORDER_RECEIVED', 'purchase_order', requested_order_id::text,
    jsonb_build_object('inventory_movements_created', true, 'warehouse_id', warehouse_row.id));
end;
$$;

create or replace function public.transfer_inventory(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  source_warehouse_id uuid := (payload ->> 'source_warehouse_id')::uuid;
  destination_warehouse_id uuid := (payload ->> 'destination_warehouse_id')::uuid;
  source_warehouse public.warehouses%rowtype;
  destination_warehouse public.warehouses%rowtype;
  transfer_id uuid := gen_random_uuid();
  item jsonb;
  product_row public.products%rowtype;
  item_id uuid;
  product_id uuid;
  source_location_id uuid;
  destination_location_id uuid;
  quantity numeric;
  lot text;
  stock_status text;
  available numeric;
  average_cost numeric;
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  if source_warehouse_id = destination_warehouse_id then raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSES_MUST_DIFFER'; end if;
  select warehouse.* into source_warehouse from public.warehouses warehouse
  where warehouse.id = source_warehouse_id and warehouse.organization_id = organization_id and warehouse.is_active;
  select warehouse.* into destination_warehouse from public.warehouses warehouse
  where warehouse.id = destination_warehouse_id and warehouse.organization_id = organization_id and warehouse.is_active;
  if source_warehouse.id is null or destination_warehouse.id is null then raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSE_UNAVAILABLE'; end if;
  if jsonb_array_length(coalesce(payload -> 'items', '[]'::jsonb)) = 0 then raise exception using errcode = 'P0001', message = 'TRANSFER_ITEMS_REQUIRED'; end if;

  insert into public.warehouse_transfers (id, organization_id, reference, source_warehouse_id, destination_warehouse_id, transferred_at, notes, created_by)
  values (transfer_id, organization_id, upper(btrim(payload ->> 'reference')), source_warehouse_id, destination_warehouse_id,
    coalesce(nullif(payload ->> 'transferred_at', '')::timestamptz, now()), nullif(btrim(payload ->> 'notes'), ''), actor_id);

  for item in select value from jsonb_array_elements(payload -> 'items') order by value ->> 'product_id', value ->> 'lot' loop
    product_id := (item ->> 'product_id')::uuid;
    source_location_id := (item ->> 'source_location_id')::uuid;
    destination_location_id := (item ->> 'destination_location_id')::uuid;
    quantity := (item ->> 'quantity')::numeric;
    lot := nullif(btrim(item ->> 'lot'), '');
    stock_status := coalesce(nullif(item ->> 'stock_status', ''), 'available');
    select * into product_row from public.products product where product.id = product_id and product.organization_id = organization_id and product.is_active;
    if not found or (product_row.batch_control and lot is null) then raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE'; end if;
    if not exists (select 1 from public.warehouse_locations location where location.id = source_location_id and location.warehouse_id = source_warehouse_id and location.organization_id = organization_id and location.is_active)
      or not exists (select 1 from public.warehouse_locations location where location.id = destination_location_id and location.warehouse_id = destination_warehouse_id and location.organization_id = organization_id and location.is_active)
    then raise exception using errcode = 'P0001', message = 'TRANSFER_LOCATION_UNAVAILABLE'; end if;

    perform pg_advisory_xact_lock(hashtextextended(organization_id::text || ':' || product_id::text || ':' || source_warehouse_id::text || ':' || source_location_id::text || ':' || stock_status || ':' || lower(coalesce(lot, '')), 0));
    select coalesce(sum(case when movement.movement_type in ('entrada','ajuste-positivo') then movement.quantity else -movement.quantity end), 0),
      coalesce(sum(case when movement.movement_type in ('entrada','ajuste-positivo') then movement.quantity * movement.unit_cost else -(movement.quantity * movement.unit_cost) end)
        / nullif(sum(case when movement.movement_type in ('entrada','ajuste-positivo') then movement.quantity else -movement.quantity end), 0), 0)
    into available, average_cost from public.inventory_movements movement
    where movement.organization_id = organization_id and movement.product_id = product_id
      and movement.warehouse_id = source_warehouse_id and movement.location_id = source_location_id and movement.stock_status = stock_status
      and lower(coalesce(movement.lot, '')) = lower(coalesce(lot, ''));
    if quantity > available then raise exception using errcode = 'P0001', message = 'INVENTORY_INSUFFICIENT_STOCK'; end if;

    insert into public.warehouse_transfer_items (organization_id, transfer_id, product_id, product_code, product_description,
      source_location_id, destination_location_id, lot, expiration_date, stock_status, quantity, unit_cost)
    values (organization_id, transfer_id, product_id, product_row.code, product_row.description, source_location_id,
      destination_location_id, lot, nullif(item ->> 'expiration_date', '')::date, stock_status, quantity, greatest(average_cost, 0))
    returning id into item_id;

    insert into public.inventory_movements (organization_id, product_id, product_code, product_description, unit_of_measure,
      movement_type, quantity, warehouse, warehouse_id, location_id, stock_status, unit_cost, lot, expiration_date,
      operation_date, reason, source_type, source_id, transfer_id, created_by)
    values
      (organization_id, product_id, product_row.code, product_row.description, product_row.unit_of_measure,
       'salida', quantity, source_warehouse.name, source_warehouse_id, source_location_id, stock_status, greatest(average_cost, 0), lot,
       nullif(item ->> 'expiration_date', '')::date, current_date, 'Transferencia ' || upper(btrim(payload ->> 'reference')),
       'warehouse-transfer', item_id, transfer_id, actor_id),
      (organization_id, product_id, product_row.code, product_row.description, product_row.unit_of_measure,
       'entrada', quantity, destination_warehouse.name, destination_warehouse_id, destination_location_id, stock_status, greatest(average_cost, 0), lot,
       nullif(item ->> 'expiration_date', '')::date, current_date, 'Transferencia ' || upper(btrim(payload ->> 'reference')),
       'warehouse-transfer', item_id, transfer_id, actor_id);
  end loop;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (organization_id, actor_id, 'WAREHOUSE_TRANSFER_COMPLETED', 'warehouse_transfer', transfer_id::text, payload - 'organization_id');
  return transfer_id;
end;
$$;

create or replace function public.reclassify_inventory(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  product_id uuid := (payload ->> 'product_id')::uuid;
  warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  location_id uuid := (payload ->> 'location_id')::uuid;
  source_status text := payload ->> 'source_status';
  destination_status text := payload ->> 'destination_status';
  quantity numeric := (payload ->> 'quantity')::numeric;
  lot text := nullif(btrim(payload ->> 'lot'), '');
  product_row public.products%rowtype;
  warehouse_row public.warehouses%rowtype;
  available numeric;
  average_cost numeric;
  operation_id uuid := gen_random_uuid();
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE') then raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN'; end if;
  if source_status = destination_status or source_status not in ('available','quarantine','damaged') or destination_status not in ('available','quarantine','damaged') then
    raise exception using errcode = 'P0001', message = 'INVENTORY_STATUS_INVALID';
  end if;
  select product.* into product_row from public.products product
  where product.id = product_id and product.organization_id = organization_id and product.is_active;
  select warehouse.* into warehouse_row from public.warehouses warehouse
  where warehouse.id = warehouse_id and warehouse.organization_id = organization_id and warehouse.is_active;
  if product_row.id is null or warehouse_row.id is null then raise exception using errcode = 'P0001', message = 'INVENTORY_BUCKET_UNAVAILABLE'; end if;
  if not exists (select 1 from public.warehouse_locations location where location.id = location_id and location.warehouse_id = warehouse_id and location.organization_id = organization_id and location.is_active) then raise exception using errcode = 'P0001', message = 'INVENTORY_LOCATION_UNAVAILABLE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(organization_id::text || ':' || product_id::text || ':' || warehouse_id::text || ':' || location_id::text || ':' || source_status || ':' || lower(coalesce(lot, '')), 0));
  select coalesce(sum(case when movement_type in ('entrada','ajuste-positivo') then public.inventory_movements.quantity else -public.inventory_movements.quantity end),0),
    coalesce(sum(case when movement_type in ('entrada','ajuste-positivo') then public.inventory_movements.quantity * unit_cost else -(public.inventory_movements.quantity * unit_cost) end)
      / nullif(sum(case when movement_type in ('entrada','ajuste-positivo') then public.inventory_movements.quantity else -public.inventory_movements.quantity end),0),0)
  into available, average_cost from public.inventory_movements
  where public.inventory_movements.organization_id = organization_id and public.inventory_movements.product_id = product_id
    and public.inventory_movements.warehouse_id = warehouse_id and public.inventory_movements.location_id = location_id
    and stock_status = source_status and lower(coalesce(public.inventory_movements.lot,'')) = lower(coalesce(lot,''));
  if quantity > available then raise exception using errcode = 'P0001', message = 'INVENTORY_INSUFFICIENT_STOCK'; end if;

  insert into public.inventory_movements (organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status, unit_cost, lot, expiration_date,
    operation_date, reason, source_type, source_id, created_by)
  values
    (organization_id, product_id, product_row.code, product_row.description, product_row.unit_of_measure,
     'salida', quantity, warehouse_row.name, warehouse_id, location_id, source_status, greatest(average_cost,0), lot,
     nullif(payload ->> 'expiration_date','')::date, current_date, btrim(payload ->> 'reason'), 'stock-reclassification', operation_id, actor_id),
    (organization_id, product_id, product_row.code, product_row.description, product_row.unit_of_measure,
     'entrada', quantity, warehouse_row.name, warehouse_id, location_id, destination_status, greatest(average_cost,0), lot,
     nullif(payload ->> 'expiration_date','')::date, current_date, btrim(payload ->> 'reason'), 'stock-reclassification', operation_id, actor_id);
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (organization_id, actor_id, 'INVENTORY_RECLASSIFIED', 'inventory_reclassification', operation_id::text, payload - 'organization_id');
  return operation_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. RLS, privilegios y auditoria
-- ------------------------------------------------------------

alter table public.warehouses enable row level security;
alter table public.warehouse_locations enable row level security;
alter table public.product_warehouse_settings enable row level security;
alter table public.warehouse_transfers enable row level security;
alter table public.warehouse_transfer_items enable row level security;

create policy warehouses_select_authorized on public.warehouses for select to authenticated
using ((select public.has_organization_permission(organization_id, 'INVENTORY_VIEW')));
create policy warehouses_insert_authorized on public.warehouses for insert to authenticated
with check ((select public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')) and created_by = (select auth.uid()));
create policy warehouses_update_authorized on public.warehouses for update to authenticated
using ((select public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')))
with check ((select public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')) and updated_by = (select auth.uid()));

create policy warehouse_locations_select_authorized on public.warehouse_locations for select to authenticated
using ((select public.has_organization_permission(organization_id, 'INVENTORY_VIEW')));
create policy warehouse_locations_insert_authorized on public.warehouse_locations for insert to authenticated
with check ((select public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')) and created_by = (select auth.uid()));
create policy warehouse_locations_update_authorized on public.warehouse_locations for update to authenticated
using ((select public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')))
with check ((select public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')) and updated_by = (select auth.uid()));

create policy product_warehouse_settings_select_authorized on public.product_warehouse_settings for select to authenticated
using ((select public.has_organization_permission(organization_id, 'INVENTORY_VIEW')));
create policy product_warehouse_settings_insert_authorized on public.product_warehouse_settings for insert to authenticated
with check ((select public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')) and updated_by = (select auth.uid()));
create policy product_warehouse_settings_update_authorized on public.product_warehouse_settings for update to authenticated
using ((select public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')))
with check ((select public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')) and updated_by = (select auth.uid()));

create policy warehouse_transfers_select_authorized on public.warehouse_transfers for select to authenticated
using ((select public.has_organization_permission(organization_id, 'INVENTORY_VIEW')));
create policy warehouse_transfer_items_select_authorized on public.warehouse_transfer_items for select to authenticated
using ((select public.has_organization_permission(organization_id, 'INVENTORY_VIEW')));

revoke all on table public.warehouses, public.warehouse_locations, public.product_warehouse_settings,
  public.warehouse_transfers, public.warehouse_transfer_items from public, anon, authenticated;
grant select, insert, update on table public.warehouses, public.warehouse_locations, public.product_warehouse_settings to authenticated;
grant select on table public.warehouse_transfers, public.warehouse_transfer_items to authenticated;
revoke all on table public.inventory_balances, public.inventory_alerts, public.inventory_kardex from public, anon, authenticated;
grant select on table public.inventory_balances, public.inventory_alerts, public.inventory_kardex to authenticated;

revoke all on function public.record_inventory_movement(jsonb) from public, anon, authenticated;
revoke all on function public.receive_purchase_order(uuid, uuid) from public, anon, authenticated;
revoke all on function public.transfer_inventory(jsonb) from public, anon, authenticated;
revoke all on function public.reclassify_inventory(jsonb) from public, anon, authenticated;
grant execute on function public.record_inventory_movement(jsonb) to authenticated;
grant execute on function public.receive_purchase_order(uuid, uuid) to authenticated;
grant execute on function public.transfer_inventory(jsonb) to authenticated;
grant execute on function public.reclassify_inventory(jsonb) to authenticated;
