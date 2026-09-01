-- SILSANPLEX: prepara el contrato persistente para reservas comerciales.
-- Esta migracion NO crea reservas desde create_order ni genera movimientos.

-- ---------------------------------------------------------------------------
-- 1. Reservas: permitir asignaciones por bucket para una linea comercial
-- ---------------------------------------------------------------------------

-- La unicidad global anterior impedia representar una linea distribuida entre
-- dos lotes/ubicaciones. Antes de retirar la restriccion, abortamos si alguna
-- instalacion ya contiene duplicados comerciales que no podrian indexarse.
do $$
begin
  if exists (
    select 1
    from public.inventory_reservations first_reservation
    join public.inventory_reservations second_reservation
      on second_reservation.organization_id = first_reservation.organization_id
     and second_reservation.source_type = first_reservation.source_type
     and second_reservation.source_id = first_reservation.source_id
     and second_reservation.id > first_reservation.id
     and second_reservation.source_type = 'order-item'
     and second_reservation.product_id = first_reservation.product_id
     and second_reservation.warehouse_id = first_reservation.warehouse_id
     and second_reservation.location_id = first_reservation.location_id
     and second_reservation.stock_status = first_reservation.stock_status
     and lower(coalesce(second_reservation.lot, '')) = lower(coalesce(first_reservation.lot, ''))
     and second_reservation.expiration_date is not distinct from first_reservation.expiration_date
    where first_reservation.source_type = 'order-item'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_ORDER_RESERVATION_DUPLICATE_BUCKET';
  end if;
end;
$$;

alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_source_unique;

-- Reparaciones conserva una sola fila por documento origen. La proyeccion
-- repair-part sigue usando source_id = id de repair_parts y no necesita una
-- tabla paralela. Otros origenes quedan libres de esta regla hasta que su
-- contrato comercial defina una granularidad propia.
create unique index inventory_reservations_repair_part_source_unique
  on public.inventory_reservations (organization_id, source_type, source_id)
  where source_type = 'repair-part';

-- Una linea de pedido puede tener varias filas, pero nunca dos filas activas o
-- historicas para el mismo bucket canonico. NULLS NOT DISTINCT hace que un
-- producto sin lote/vencimiento siga teniendo un unico bucket, mientras lower
-- conserva la identidad case-insensitive que ya usan las vistas de inventario.
create unique index inventory_reservations_order_item_bucket_unique
  on public.inventory_reservations (
    organization_id,
    source_type,
    source_id,
    product_id,
    warehouse_id,
    location_id,
    stock_status,
    lower(lot),
    expiration_date
  )
  nulls not distinct
  where source_type = 'order-item';

comment on index public.inventory_reservations_repair_part_source_unique is
  'Preserva una sola reserva por origen para repair-part.';
comment on index public.inventory_reservations_order_item_bucket_unique is
  'Permite reservas order-item multibucket e impide duplicar un bucket por linea.';

-- ---------------------------------------------------------------------------
-- 2. Almacen canonico del pedido
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists warehouse_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_warehouse_same_organization'
  ) then
    alter table public.orders
      add constraint orders_warehouse_same_organization
      foreign key (organization_id, warehouse_id)
      references public.warehouses (organization_id, id)
      on delete restrict;
  end if;
end;
$$;

-- Los pedidos historicos de Fase 2A pueden permanecer NULL. NOT VALID evita
-- exigir un backfill arbitrario, pero la regla se aplica a nuevas filas y a
-- cualquier fila que se modifique posteriormente.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_confirmed_warehouse_required'
  ) then
    alter table public.orders
      add constraint orders_confirmed_warehouse_required
      check (status <> 'confirmado' or warehouse_id is not null)
      not valid;
  end if;
end;
$$;

create index if not exists orders_organization_warehouse_created_idx
  on public.orders (organization_id, warehouse_id, created_at desc, id);

create or replace function public.validate_order_warehouse_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.warehouse_id is not null
    and not exists (
      select 1
      from public.warehouses warehouse
      where warehouse.organization_id = new.organization_id
        and warehouse.id = new.warehouse_id
        and warehouse.is_active
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_WAREHOUSE_UNAVAILABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_validate_warehouse_reference on public.orders;
create trigger orders_validate_warehouse_reference
before insert or update of organization_id, warehouse_id on public.orders
for each row execute function public.validate_order_warehouse_reference();

revoke all on function public.validate_order_warehouse_reference() from public, anon, authenticated;

comment on column public.orders.warehouse_id is
  'Almacen persistente de preparacion del pedido; NULL solo se conserva para historicos previos a Fase 2B-1A.';

-- ---------------------------------------------------------------------------
-- 3. create_order compatible con idempotencia y almacen canonico
-- ---------------------------------------------------------------------------

create or replace function public.create_order(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_organization_id uuid;
  target_customer_id uuid;
  target_warehouse_id uuid;
  target_order_id uuid;
  target_operation_key uuid;
  target_source_quote_id uuid;
  target_order_number text;
  next_number bigint;
  line jsonb;
  target_quantity numeric;
  target_unit_price numeric;
  target_date date;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_customer_id := nullif(payload ->> 'customer_id', '')::uuid;
  target_warehouse_id := nullif(payload ->> 'warehouse_id', '')::uuid;
  target_operation_key := nullif(payload ->> 'operation_key', '')::uuid;
  target_source_quote_id := nullif(payload ->> 'source_quote_id', '')::uuid;
  target_date := coalesce(nullif(payload ->> 'order_date', '')::date, current_date);

  if target_organization_id is null or not public.is_organization_member(target_organization_id) then
    raise exception using errcode = '42501', message = 'ORDER_FORBIDDEN';
  end if;
  if target_operation_key is null then
    raise exception using errcode = '22023', message = 'ORDER_OPERATION_KEY_REQUIRED';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'ORDER_ITEMS_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_organization_id::text || ':order-operation:' || target_operation_key::text, 0));

  select order_row.id into target_order_id
  from public.orders order_row
  where order_row.organization_id = target_organization_id
    and order_row.operation_key = target_operation_key;
  if target_order_id is not null then
    return target_order_id;
  end if;

  if target_source_quote_id is not null then
    select order_row.id into target_order_id
    from public.orders order_row
    where order_row.organization_id = target_organization_id
      and order_row.source_quote_id = target_source_quote_id;
    if target_order_id is not null then
      return target_order_id;
    end if;
  end if;

  if target_warehouse_id is null then
    raise exception using errcode = '22023', message = 'ORDER_WAREHOUSE_REQUIRED';
  end if;
  perform 1
  from public.warehouses warehouse
  where warehouse.id = target_warehouse_id
    and warehouse.organization_id = target_organization_id
    and warehouse.is_active
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_WAREHOUSE_UNAVAILABLE';
  end if;

  perform 1
  from public.customers customer
  where customer.id = target_customer_id
    and customer.organization_id = target_organization_id
    and customer.is_active
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_CUSTOMER_UNAVAILABLE';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload -> 'items') item
    group by item ->> 'product_id'
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'ORDER_DUPLICATE_PRODUCT';
  end if;

  for line in select value from jsonb_array_elements(payload -> 'items')
  loop
    if nullif(line ->> 'product_id', '') is null then
      raise exception using errcode = '22023', message = 'ORDER_PRODUCT_REQUIRED';
    end if;
    target_quantity := (line ->> 'quantity')::numeric;
    target_unit_price := (line ->> 'unit_price')::numeric;
    if target_quantity is null or target_quantity <= 0
       or target_unit_price is null or target_unit_price < 0 then
      raise exception using errcode = '22023', message = 'ORDER_ITEM_VALUES_INVALID';
    end if;
    if not exists (
      select 1 from public.products product
      where product.id = (line ->> 'product_id')::uuid
        and product.organization_id = target_organization_id
        and product.is_active
    ) then
      raise exception using errcode = 'P0001', message = 'ORDER_PRODUCT_UNAVAILABLE';
    end if;
  end loop;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_organization_id::text || ':order-number', 0));
  select coalesce(max(nullif(substring(order_row.order_number from 5), '')::bigint), 0) + 1
    into next_number
  from public.orders order_row
  where order_row.organization_id = target_organization_id;
  if next_number > 999999 then
    raise exception using errcode = '22023', message = 'ORDER_NUMBER_EXHAUSTED';
  end if;
  target_order_number := 'PED-' || lpad(next_number::text, 6, '0');

  insert into public.orders (
    organization_id, order_number, source_quote_id, source_quote_number,
    customer_id, warehouse_id, order_date, status, prices_include_tax, notes,
    operation_key, created_by, updated_by
  ) values (
    target_organization_id, target_order_number, target_source_quote_id,
    nullif(btrim(payload ->> 'source_quote_number'), ''), target_customer_id,
    target_warehouse_id, target_date, 'confirmado', coalesce((payload ->> 'prices_include_tax')::boolean, true),
    coalesce(payload ->> 'notes', ''), target_operation_key, actor_id, actor_id
  ) returning id into target_order_id;

  insert into public.order_items (
    organization_id, order_id, product_id, product_code,
    product_description, unit_of_measure, quantity, unit_price
  )
  select target_organization_id, target_order_id, product.id, product.code,
    product.description, product.unit_of_measure,
    (line_data ->> 'quantity')::numeric, (line_data ->> 'unit_price')::numeric
  from jsonb_array_elements(payload -> 'items') as item_rows(line_data)
  join public.products product
    on product.id = (line_data ->> 'product_id')::uuid
   and product.organization_id = target_organization_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values, metadata
  ) values (
    target_organization_id, actor_id, 'ORDER_CREATED', 'order', target_order_id::text,
    jsonb_build_object('order_number', target_order_number, 'customer_id', target_customer_id, 'warehouse_id', target_warehouse_id),
    jsonb_build_object('source', 'database_function', 'operation_key', target_operation_key)
  );
  return target_order_id;
exception
  when unique_violation then
    if target_operation_key is not null then
      select order_row.id into target_order_id
      from public.orders order_row
      where order_row.organization_id = target_organization_id
        and order_row.operation_key = target_operation_key;
      if target_order_id is not null then return target_order_id; end if;
    end if;
    raise;
end;
$$;

comment on table public.orders is
  'Pedidos comerciales persistentes con almacen canonico opcional solo para historicos previos a Fase 2B-1A. Esta fase aun no reserva inventario.';
