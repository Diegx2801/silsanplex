-- A5: cumplimiento comercial de servicios separado del despacho fisico.
-- La migracion conserva el almacen requerido al crear pedidos/ventas y solo
-- desacopla las operaciones posteriores que no generan efectos fisicos.
begin;

-- ---------------------------------------------------------------------------
-- 1. Snapshot canonico del tipo y cantidad administrativa de servicios
-- ---------------------------------------------------------------------------

alter table public.order_items
  add column if not exists product_type text,
  add column if not exists service_completed_quantity numeric(14,3) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_product_type_valid'
  ) then
    alter table public.order_items
      add constraint order_items_product_type_valid
      check (product_type is null or product_type in ('good', 'service'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_service_completed_quantity_valid'
  ) then
    alter table public.order_items
      add constraint order_items_service_completed_quantity_valid
      check (
        service_completed_quantity >= 0
        and service_completed_quantity <= quantity
        and (product_type is null or product_type = 'service' or service_completed_quantity = 0)
      );
  end if;
end;
$$;

comment on column public.order_items.product_type is
  'Snapshot inmutable de products.product_type al crear la linea. NULL identifica lineas historicas anteriores a A5.';
comment on column public.order_items.service_completed_quantity is
  'Cantidad administrativa acumulada de una linea service; no es cumplimiento fisico y no se usa para goods.';

create or replace function public.snapshot_order_item_product_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_type text;
begin
  if tg_op = 'INSERT' then
    select product.product_type
      into snapshot_type
    from public.products product
    where product.organization_id = new.organization_id
      and product.id = new.product_id
      and product.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'ORDER_PRODUCT_UNAVAILABLE';
    end if;
    new.product_type := snapshot_type;
    new.service_completed_quantity := coalesce(new.service_completed_quantity, 0);
    return new;
  end if;

  if new.product_type is distinct from old.product_type then
    raise exception using errcode = '55000', message = 'ORDER_PRODUCT_TYPE_IMMUTABLE';
  end if;
  if new.service_completed_quantity is distinct from old.service_completed_quantity
     and coalesce(current_setting('app.order_service_completion_write', true), '') <> 'true'
  then
    raise exception using errcode = '55000', message = 'ORDER_SERVICE_COMPLETION_IMMUTABLE';
  end if;
  new.product_type := old.product_type;
  new.service_completed_quantity := coalesce(new.service_completed_quantity, old.service_completed_quantity, 0);
  return new;
end;
$$;

drop trigger if exists order_items_snapshot_product_type on public.order_items;
create trigger order_items_snapshot_product_type
before insert or update on public.order_items
for each row execute function public.snapshot_order_item_product_type();

revoke all on function public.snapshot_order_item_product_type()
  from public, anon, authenticated, service_role;

create table if not exists public.order_service_completion_operations (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operation_key uuid not null,
  order_id uuid not null,
  payload_hash text not null,
  canonical_payload jsonb not null,
  result_payload jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  primary key (organization_id, operation_key),
  constraint order_service_completion_operations_order_same_organization
    foreign key (organization_id, order_id)
    references public.orders (organization_id, id) on delete restrict,
  constraint order_service_completion_operations_payload_hash_format
    check (payload_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists order_service_completion_operations_order_idx
  on public.order_service_completion_operations (organization_id, order_id, created_at desc);

alter table public.order_service_completion_operations enable row level security;
revoke all on public.order_service_completion_operations
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Reservas y modificaciones usan el snapshot, nunca el catalogo actual
-- ---------------------------------------------------------------------------

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
  select item.quantity, item.product_type
    into requested_order_item_quantity, requested_product_type
  from public.order_items item
  where item.organization_id = requested_organization_id
    and item.id = requested_order_item_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_ITEM_RESERVATION_SOURCE_INVALID';
  end if;
  if requested_product_type is null then
    raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_PRODUCT_TYPE_UNKNOWN';
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

create or replace function public.update_order_quantities_unchecked(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_order_id uuid;
  target_operation_key uuid;
  order_row public.orders%rowtype;
  order_item_row public.order_items%rowtype;
  line jsonb;
  requested_quantity numeric;
  current_reserved numeric;
  target_delta numeric;
  item_product_type text;
  prior_operation_exists boolean;
  old_items jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_order_id := nullif(payload ->> 'order_id', '')::uuid;
  target_operation_key := nullif(payload ->> 'operation_key', '')::uuid;
  if target_organization_id is null
     or not public.is_organization_member(target_organization_id) then
    raise exception using errcode = '42501', message = 'ORDER_FORBIDDEN';
  end if;
  if target_order_id is null then
    raise exception using errcode = '22023', message = 'ORDER_ID_REQUIRED';
  end if;
  if target_operation_key is null then
    raise exception using errcode = '22023', message = 'ORDER_OPERATION_KEY_REQUIRED';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'ORDER_ITEMS_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_organization_id::text || ':order-operation:' || target_operation_key::text, 0));

  select exists (
    select 1 from public.audit_events audit_event
    where audit_event.organization_id = target_organization_id
      and audit_event.entity_type = 'order'
      and audit_event.action = 'ORDER_UPDATED'
      and audit_event.entity_id = target_order_id::text
      and audit_event.metadata ->> 'operation_key' = target_operation_key::text
  ) into prior_operation_exists;
  if exists (
    select 1 from public.audit_events audit_event
    where audit_event.organization_id = target_organization_id
      and audit_event.metadata ->> 'operation_key' = target_operation_key::text
      and audit_event.action in ('ORDER_UPDATED', 'ORDER_CANCELLED')
      and audit_event.entity_id is distinct from target_order_id::text
  ) then
       raise exception using errcode = 'P0001', message = 'ORDER_OPERATION_KEY_REUSED';
  end if;
  if exists (
    select 1 from public.audit_events audit_event
    where audit_event.organization_id = target_organization_id
      and audit_event.entity_type = 'order'
      and audit_event.action = 'ORDER_CANCELLED'
      and audit_event.entity_id = target_order_id::text
      and audit_event.metadata ->> 'operation_key' = target_operation_key::text
  ) then
     raise exception using errcode = 'P0001', message = 'ORDER_OPERATION_KEY_REUSED';
  end if;
  if prior_operation_exists then
    return target_order_id;
  end if;

  select value.* into order_row
  from public.orders value
  where value.organization_id = target_organization_id and value.id = target_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
  end if;
  if order_row.status <> 'confirmado' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_MODIFIABLE';
  end if;
  if exists (select 1 from public.sales sale where sale.organization_id = target_organization_id and sale.order_id = target_order_id) then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_MODIFIABLE';
  end if;
  if order_row.warehouse_id is null then
    raise exception using errcode = 'P0001', message = 'ORDER_WAREHOUSE_REQUIRED';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload -> 'items') item
    group by item ->> 'order_item_id' having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'ORDER_DUPLICATE_ITEM';
  end if;

  for line in select value from jsonb_array_elements(payload -> 'items')
  loop
    if nullif(line ->> 'order_item_id', '') is null
       or nullif(line ->> 'quantity', '') is null
       or lower(line ->> 'quantity') in ('nan', 'infinity', '-infinity') then
      raise exception using errcode = '22023', message = 'ORDER_ITEM_VALUES_INVALID';
    end if;
    requested_quantity := (line ->> 'quantity')::numeric;
    if requested_quantity is null or requested_quantity <= 0 then
      raise exception using errcode = '22023', message = 'ORDER_ITEM_VALUES_INVALID';
    end if;
    if not exists (
      select 1 from public.order_items item
      where item.organization_id = target_organization_id
        and item.order_id = target_order_id
        and item.id = (line ->> 'order_item_id')::uuid
    ) then
      raise exception using errcode = 'P0001', message = 'ORDER_ITEM_NOT_FOUND';
    end if;
  end loop;
  if jsonb_array_length(payload -> 'items') <> (
    select count(*) from public.order_items item
    where item.organization_id = target_organization_id and item.order_id = target_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_ITEMS_MISMATCH';
  end if;

  for order_item_row in
    select item.* from public.order_items item
    where item.organization_id = target_organization_id and item.order_id = target_order_id
    order by item.product_id, item.id for update
  loop
    if order_item_row.product_type is null then
      raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_PRODUCT_TYPE_UNKNOWN';
    end if;
    if order_item_row.product_type = 'good' then
      perform public.lock_inventory_fefo_scope(target_organization_id, order_item_row.product_id, order_row.warehouse_id);
      select coalesce(sum(reservation.quantity - reservation.quantity_consumed), 0)
        into current_reserved
      from public.inventory_reservations reservation
      where reservation.organization_id = target_organization_id
        and reservation.source_type = 'order-item'
        and reservation.source_id = order_item_row.id
        and reservation.status = 'active';
      if current_reserved <> order_item_row.quantity
         or exists (select 1 from public.inventory_reservations reservation where reservation.organization_id = target_organization_id and reservation.source_type = 'order-item' and reservation.source_id = order_item_row.id and reservation.quantity_consumed <> 0)
         or exists (select 1 from public.inventory_reservations reservation where reservation.organization_id = target_organization_id and reservation.source_type = 'order-item' and reservation.source_id = order_item_row.id and reservation.status = 'active' and reservation.product_id is distinct from order_item_row.product_id)
         or exists (select 1 from public.inventory_reservations reservation where reservation.organization_id = target_organization_id and reservation.source_type = 'order-item' and reservation.source_id = order_item_row.id and reservation.status = 'active' and reservation.stock_status <> 'available')
         or exists (select 1 from public.inventory_reservations reservation where reservation.organization_id = target_organization_id and reservation.source_type = 'order-item' and reservation.source_id = order_item_row.id and reservation.status = 'active' and reservation.warehouse_id is distinct from order_row.warehouse_id)
      then
        raise exception using errcode = 'P0001', message = 'ORDER_RESERVATION_STATE_INVALID';
      end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('order_item_id', item.id, 'quantity', item.quantity) order by item.product_id, item.id), '[]'::jsonb)
    into old_items
  from public.order_items item
  where item.organization_id = target_organization_id and item.order_id = target_order_id;

  for order_item_row in
    select item.* from public.order_items item
    where item.organization_id = target_organization_id and item.order_id = target_order_id
    order by item.product_id, item.id
  loop
    select (line_data ->> 'quantity')::numeric into requested_quantity
    from jsonb_array_elements(payload -> 'items') line_data
    where (line_data ->> 'order_item_id')::uuid = order_item_row.id;
    target_delta := requested_quantity - order_item_row.quantity;
    item_product_type := order_item_row.product_type;
    if item_product_type = 'good' and target_delta < 0 then
      perform public.release_order_item_reservation_quantity(target_organization_id, order_item_row.id, order_row.warehouse_id, abs(target_delta), actor_id);
    elsif item_product_type = 'good' and target_delta > 0 then
      perform public.reserve_order_item_fefo_quantity(target_organization_id, order_item_row.id, order_row.warehouse_id, target_delta, actor_id);
    end if;
    if target_delta <> 0 then
      update public.order_items set quantity = requested_quantity
      where organization_id = target_organization_id and id = order_item_row.id;
    end if;
  end loop;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    target_organization_id, actor_id, 'ORDER_UPDATED', 'order', target_order_id::text,
    jsonb_build_object('items', old_items),
    jsonb_build_object('items', payload -> 'items'),
    jsonb_build_object('source', 'database_function', 'operation_key', target_operation_key, 'reservation_change', true)
  );
  return target_order_id;
end;
$$;

revoke all on function public.update_order_quantities_unchecked(jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Evaluacion central de cierre y cumplimiento administrativo idempotente
-- ---------------------------------------------------------------------------

create or replace function public.a5_finalize_order_completion(
  requested_organization_id uuid,
  requested_order_id uuid,
  requested_sale_id uuid,
  requested_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_status_value text;
  sale_status_value text;
  goods_complete boolean := true;
  services_complete boolean := true;
  complete_value boolean;
begin
  select order_row.status
    into order_status_value
  from public.orders order_row
  where order_row.organization_id = requested_organization_id
    and order_row.id = requested_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
  end if;

  select sale_row.status
    into sale_status_value
  from public.sales sale_row
  where sale_row.organization_id = requested_organization_id
    and sale_row.id = requested_sale_id
    and sale_row.order_id = requested_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_SALE_REQUIRED';
  end if;

  if exists (
    select 1 from public.order_items item
    where item.organization_id = requested_organization_id
      and item.order_id = requested_order_id
      and item.product_type is null
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_PRODUCT_TYPE_UNKNOWN';
  end if;

  if exists (
    select 1
    from public.order_items item
    where item.organization_id = requested_organization_id
      and item.order_id = requested_order_id
      and item.product_type = 'good'
      and coalesce((
        select sum(reservation.quantity_consumed)
        from public.inventory_reservations reservation
        where reservation.organization_id = requested_organization_id
          and reservation.source_type = 'order-item'
          and reservation.source_id = item.id
      ), 0) < item.quantity
  ) then
    goods_complete := false;
  end if;

  if exists (
    select 1
    from public.order_items item
    where item.organization_id = requested_organization_id
      and item.order_id = requested_order_id
      and item.product_type = 'service'
      and coalesce(item.service_completed_quantity, 0) < item.quantity
  ) then
    services_complete := false;
  end if;

  complete_value := goods_complete and services_complete;
  if complete_value
     and order_status_value = 'confirmado'
     and sale_status_value = 'registrada'
  then
    update public.sales
    set status = 'despachada', updated_by = requested_actor_id, updated_at = now()
    where organization_id = requested_organization_id and id = requested_sale_id;
    update public.orders
    set status = 'atendido', updated_by = requested_actor_id, updated_at = now()
    where organization_id = requested_organization_id and id = requested_order_id;
    order_status_value := 'atendido';
    sale_status_value := 'despachada';
  end if;

  return jsonb_build_object(
    'order_id', requested_order_id,
    'sale_id', requested_sale_id,
    'complete', complete_value,
    'goods_complete', goods_complete,
    'services_complete', services_complete,
    'order_status', order_status_value,
    'sale_status', sale_status_value
  );
end;
$$;

revoke all on function public.a5_finalize_order_completion(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.complete_order_services(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid;
  order_id uuid;
  requested_sale_id uuid;
  operation_key uuid;
  order_row public.orders%rowtype;
  sale_row public.sales%rowtype;
  order_item_row public.order_items%rowtype;
  operation_row public.order_service_completion_operations%rowtype;
  item jsonb;
  requested_quantity numeric;
  remaining_quantity numeric;
  canonical_payload jsonb;
  request_payload_hash text;
  result_payload jsonb;
  completion_result jsonb;
  completed_lines jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_SERVICE_PAYLOAD_INVALID';
  end if;

  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  order_id := nullif(payload ->> 'order_id', '')::uuid;
  requested_sale_id := nullif(payload ->> 'sale_id', '')::uuid;
  operation_key := nullif(payload ->> 'operation_key', '')::uuid;
  if organization_id is null
     or not public.has_organization_permission(organization_id, 'SALES_MANAGE') then
    raise exception using errcode = '42501', message = 'ORDER_SERVICE_FORBIDDEN';
  end if;
  if order_id is null or requested_sale_id is null or operation_key is null then
    raise exception using errcode = '22023', message = 'ORDER_SERVICE_KEYS_REQUIRED';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'ORDER_SERVICE_ITEMS_REQUIRED';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload -> 'items') requested_item
    group by requested_item ->> 'order_item_id' having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'ORDER_SERVICE_DUPLICATE_ITEM';
  end if;

  -- La normalizacion es backend-first: UUID canonico, numerico a tres
  -- decimales y lineas ordenadas por identidad persistente.
  for item in select value from jsonb_array_elements(payload -> 'items')
  loop
    if nullif(item ->> 'order_item_id', '') is null
       or nullif(item ->> 'quantity_to_complete', '') is null
       or lower(item ->> 'quantity_to_complete') in ('nan', 'infinity', '-infinity') then
      raise exception using errcode = '22023', message = 'ORDER_SERVICE_QUANTITY_INVALID';
    end if;
    requested_quantity := (item ->> 'quantity_to_complete')::numeric;
    if requested_quantity is null
       or requested_quantity <= 0
       or requested_quantity <> round(requested_quantity, 3)
    then
      raise exception using errcode = '22023', message = 'ORDER_SERVICE_QUANTITY_INVALID';
    end if;
  end loop;

  canonical_payload := jsonb_build_object(
    'organization_id', organization_id,
    'order_id', order_id,
    'sale_id', requested_sale_id,
    'items', (
      select jsonb_agg(
        jsonb_build_object(
          'order_item_id', (requested_item ->> 'order_item_id')::uuid,
          'quantity_to_complete', public.normalize_commercial_idempotency_numeric(
            (requested_item ->> 'quantity_to_complete')::numeric
          )
        ) order by (requested_item ->> 'order_item_id')::uuid
      )
      from jsonb_array_elements(payload -> 'items') requested_item
    )
  );
  request_payload_hash := encode(
    extensions.digest(canonical_payload::text, 'sha256'), 'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text || ':order-service-operation:' || operation_key::text, 0));

  select operation.* into operation_row
  from public.order_service_completion_operations operation
  where operation.organization_id = organization_id
    and operation.operation_key = operation_key
  for update;
  if found then
     if operation_row.order_id <> order_id
        or operation_row.payload_hash <> request_payload_hash
     then
       raise exception using errcode = 'P0001', message = 'ORDER_OPERATION_KEY_REUSED';
    end if;
    return operation_row.result_payload;
  end if;

  if exists (
    select 1 from public.audit_events audit_event
    where audit_event.organization_id = organization_id
      and audit_event.metadata ->> 'operation_key' = operation_key::text
      and audit_event.action in ('ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'ORDER_DISPATCHED', 'ORDER_SERVICES_COMPLETED')
  ) then
     raise exception using errcode = 'P0001', message = 'ORDER_OPERATION_KEY_REUSED';
  end if;

  select value.* into order_row
  from public.orders value
  where value.organization_id = organization_id and value.id = order_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
  end if;
  if order_row.status <> 'confirmado' then
    raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_NOT_PENDING';
  end if;

  select value.* into sale_row
  from public.sales value
  where value.organization_id = organization_id
    and value.order_id = order_id
    and (requested_sale_id is null or value.id = requested_sale_id)
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_SALE_REQUIRED';
  end if;
  requested_sale_id := sale_row.id;
  if sale_row.status <> 'registrada' then
    raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_NOT_PENDING';
  end if;
  if order_row.tax_calculation_status is distinct from 'calculated'
     or sale_row.tax_calculation_status is distinct from 'calculated'
  then
    raise exception using errcode = 'P0001', message = 'ORDER_TAX_CALCULATION_REQUIRED';
  end if;

  for order_item_row in
    select item.* from public.order_items item
    where item.organization_id = organization_id and item.order_id = order_id
    order by item.id for update
  loop
    if order_item_row.product_type is null then
      raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_PRODUCT_TYPE_UNKNOWN';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(payload -> 'items')
  loop
    requested_quantity := (item ->> 'quantity_to_complete')::numeric;
    select order_item.* into order_item_row
    from public.order_items order_item
    where order_item.organization_id = organization_id
      and order_item.order_id = order_id
      and order_item.id = (item ->> 'order_item_id')::uuid;
    if not found then
      raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_ITEM_INVALID';
    end if;
    if order_item_row.product_type <> 'service' then
      raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_ITEM_REQUIRED';
    end if;
    if not exists (
      select 1 from public.sale_items sale_item
      where sale_item.organization_id = organization_id
        and sale_item.sale_id = sale_row.id
        and sale_item.order_id = order_id
        and sale_item.order_item_id = order_item_row.id
        and sale_item.product_id = order_item_row.product_id
        and sale_item.quantity = order_item_row.quantity
    ) then
      raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_ITEM_INVALID';
    end if;
    remaining_quantity := order_item_row.quantity - coalesce(order_item_row.service_completed_quantity, 0);
    if requested_quantity > remaining_quantity then
      raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_QUANTITY_EXCEEDED';
    end if;
  end loop;

  perform set_config('app.order_service_completion_write', 'true', true);
  for item in select value from jsonb_array_elements(payload -> 'items')
  loop
    requested_quantity := (item ->> 'quantity_to_complete')::numeric;
    update public.order_items order_item
    set service_completed_quantity = coalesce(order_item.service_completed_quantity, 0) + requested_quantity
    where order_item.organization_id = organization_id
      and order_item.order_id = order_id
      and order_item.id = (item ->> 'order_item_id')::uuid;
    select order_item.service_completed_quantity into remaining_quantity
    from public.order_items order_item
    where order_item.organization_id = organization_id and order_item.id = (item ->> 'order_item_id')::uuid;
    completed_lines := completed_lines || jsonb_build_array(jsonb_build_object(
      'order_item_id', (item ->> 'order_item_id')::uuid,
      'quantity_completed', requested_quantity,
      'quantity_completed_total', remaining_quantity
    ));
  end loop;
  perform set_config('app.order_service_completion_write', 'false', true);

  completion_result := public.a5_finalize_order_completion(
    organization_id, order_id, sale_row.id, actor_id
  );
  result_payload := completion_result || jsonb_build_object(
    'operation_key', operation_key,
    'items', completed_lines
  );

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    organization_id, actor_id, 'ORDER_SERVICES_COMPLETED', 'order', order_id::text,
    jsonb_build_object('order_status', order_row.status, 'sale_status', sale_row.status),
    jsonb_build_object(
      'order_status', result_payload ->> 'order_status',
      'sale_status', result_payload ->> 'sale_status',
      'sale_id', sale_row.id
    ),
    jsonb_build_object(
      'source', 'database_function',
      'operation_key', operation_key,
      'items', completed_lines
    )
  );

  insert into public.order_service_completion_operations (
    organization_id, operation_key, order_id, payload_hash,
    canonical_payload, result_payload, created_by
  ) values (
    organization_id, operation_key, order_id, request_payload_hash,
    canonical_payload, result_payload, actor_id
  );
  return result_payload;
end;
$$;

revoke all on function public.complete_order_services(jsonb)
  from public, anon, service_role;
grant execute on function public.complete_order_services(jsonb) to authenticated;

comment on function public.complete_order_services(jsonb) is
  'Cumple cantidades de servicios con SALES_MANAGE, sin almacenes activos ni efectos de inventario.';

-- ---------------------------------------------------------------------------
-- 4. Guards de inventario y despacho fisico basado en el snapshot
-- ---------------------------------------------------------------------------

create or replace function public.inventory_bucket_state_for_order_dispatch(
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

revoke all on function public.inventory_bucket_state_for_order_dispatch(uuid, uuid, uuid, uuid, text, text, date)
  from public, anon, authenticated, service_role;

create or replace function public.validate_product_tracking_requirements()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  snapshot_product_type text;
  snapshot_product_id uuid;
  snapshot_batch_control boolean;
  snapshot_expiration_control boolean;
  receipt_fulfillment_mode text;
begin
  if new.source_type = 'order-dispatch' then
    select item.product_id, item.product_type
      into snapshot_product_id, snapshot_product_type
    from public.order_items item
    where item.organization_id = new.organization_id
      and item.id = new.source_id;
    if not found or snapshot_product_id is distinct from new.product_id then
      raise exception using errcode = 'P0001', message = 'INVENTORY_ORDER_DISPATCH_SOURCE_INVALID';
    end if;
    if snapshot_product_type is null then
      raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_PRODUCT_TYPE_UNKNOWN';
    end if;
    if snapshot_product_type <> 'good' then
      raise exception using errcode = 'P0001', message = 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN';
    end if;
    return new;
  end if;

  select product.* into product_row
  from public.products product
  where product.id = new.product_id and product.organization_id = new.organization_id;
  if not found then
    return new;
  end if;

  if new.source_type = 'purchase-receipt' then
    select receipt_item.product_id,
           order_item.batch_control,
           order_item.expiration_control,
           receipt_item.fulfillment_mode
      into snapshot_product_id,
           snapshot_batch_control,
           snapshot_expiration_control,
           receipt_fulfillment_mode
    from public.purchase_receipt_items receipt_item
    join public.purchase_order_items order_item
      on order_item.organization_id = receipt_item.organization_id
     and order_item.id = receipt_item.purchase_order_item_id
    where receipt_item.organization_id = new.organization_id
      and receipt_item.id = new.source_id;
    if not found or snapshot_product_id is distinct from new.product_id
       or receipt_fulfillment_mode is distinct from 'physical' then
      raise exception using errcode = 'P0001', message = 'INVENTORY_PURCHASE_RECEIPT_SOURCE_INVALID';
    end if;
    if snapshot_expiration_control is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_EXPIRATION_CONTROL_UNKNOWN';
    end if;
    if snapshot_batch_control and nullif(btrim(new.lot), '') is null then
      raise exception using errcode = 'P0001', message = 'INVENTORY_BATCH_REQUIRED';
    end if;
    if snapshot_expiration_control
       and new.movement_type in ('entrada', 'ajuste-positivo')
       and new.expiration_date is null
    then
      raise exception using errcode = 'P0001', message = 'INVENTORY_EXPIRATION_REQUIRED';
    end if;
    return new;
  end if;

  if product_row.batch_control and nullif(btrim(new.lot), '') is null then
    raise exception using errcode = 'P0001', message = 'INVENTORY_BATCH_REQUIRED';
  end if;
  if product_row.expiration_control
     and new.movement_type in ('entrada', 'ajuste-positivo')
     and new.expiration_date is null
  then
    raise exception using errcode = 'P0001', message = 'INVENTORY_EXPIRATION_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_product_tracking_requirements()
  from public, anon, authenticated, service_role;

create or replace function public.reject_service_inventory_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_product_type text;
  snapshot_product_type text;
  snapshot_product_id uuid;
begin
  if tg_table_name = 'inventory_movements' then
    if new.source_type = 'order-dispatch' then
      select item.product_id, item.product_type
        into snapshot_product_id, snapshot_product_type
      from public.order_items item
      where item.organization_id = new.organization_id and item.id = new.source_id;
      if not found or snapshot_product_id is distinct from new.product_id then
        raise exception using errcode = 'P0001', message = 'INVENTORY_ORDER_DISPATCH_SOURCE_INVALID';
      end if;
      if snapshot_product_type is null then
        raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_PRODUCT_TYPE_UNKNOWN';
      end if;
      if snapshot_product_type <> 'good' then
        raise exception using errcode = 'P0001', message = 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN';
      end if;
      perform 1 from public.products product
      where product.organization_id = new.organization_id and product.id = new.product_id;
      if not found then
        raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
      end if;
      return new;
    end if;
  end if;

  if tg_table_name = 'inventory_movements' then
    if new.source_type = 'purchase-receipt' then
    perform 1 from public.products product
    where product.organization_id = new.organization_id and product.id = new.product_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
    end if;
    select order_item.product_type
      into snapshot_product_type
    from public.purchase_receipt_items receipt_item
    join public.purchase_order_items order_item
      on order_item.organization_id = receipt_item.organization_id
     and order_item.id = receipt_item.purchase_order_item_id
    where receipt_item.organization_id = new.organization_id
      and receipt_item.id = new.source_id
      and receipt_item.product_id = new.product_id;
    if not found or snapshot_product_type is null then
      raise exception using errcode = 'P0001', message = 'INVENTORY_PURCHASE_RECEIPT_SOURCE_INVALID';
    end if;
    if snapshot_product_type <> 'good' then
      raise exception using errcode = 'P0001', message = 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN';
    end if;
      return new;
    end if;
  end if;

  select product.product_type into requested_product_type
  from public.products product
  where product.organization_id = new.organization_id and product.id = new.product_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;
  if requested_product_type <> 'good' then
    raise exception using errcode = 'P0001', message = 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_service_inventory_reference()
  from public, anon, authenticated, service_role;

create or replace function public.dispatch_order_from_reservations_unchecked(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid;
  order_id uuid;
  operation_key uuid;
  requested_sale_id uuid;
  operation_date_value date;
  order_row public.orders%rowtype;
  sale_row public.sales%rowtype;
  order_item_row public.order_items%rowtype;
  sale_item_row public.sale_items%rowtype;
  reservation_row public.inventory_reservations%rowtype;
  existing_audit public.audit_events%rowtype;
  conflicting_audit public.audit_events%rowtype;
  item jsonb;
  requested_order_item_id uuid;
  requested_quantity numeric;
  remaining_to_dispatch numeric;
  pending_quantity numeric;
  allocation_quantity numeric;
  bucket_state record;
  warehouse_row public.warehouses%rowtype;
  movement_id uuid;
  movement_ids jsonb := '[]'::jsonb;
  allocations jsonb := '[]'::jsonb;
  item_product_type text;
  completion_result jsonb;
  reason_value text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  order_id := nullif(payload ->> 'order_id', '')::uuid;
  requested_sale_id := nullif(payload ->> 'sale_id', '')::uuid;
  operation_key := nullif(payload ->> 'operation_key', '')::uuid;
  operation_date_value := coalesce(nullif(payload ->> 'operation_date', '')::date, current_date);
  if organization_id is null or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'ORDER_DISPATCH_FORBIDDEN';
  end if;
  if order_id is null or operation_key is null then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_KEYS_REQUIRED';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_ITEMS_REQUIRED';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload -> 'items') dispatch_item
    group by dispatch_item ->> 'order_item_id' having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_DUPLICATE_ITEM';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text || ':order-operation:' || operation_key::text, 0));

  select audit.* into existing_audit
  from public.audit_events audit
  where audit.organization_id = organization_id
    and audit.action = 'ORDER_DISPATCHED'
    and audit.entity_type = 'order'
    and audit.entity_id = order_id::text
    and audit.metadata ->> 'operation_key' = operation_key::text
  order by audit.id desc limit 1 for update;
  if existing_audit.id is not null then
    if existing_audit.metadata -> 'requested_items' is distinct from payload -> 'items' then
      raise exception using errcode = 'P0001', message = 'ORDER_OPERATION_KEY_REUSED';
    end if;
    return order_id;
  end if;
  select audit.* into conflicting_audit
  from public.audit_events audit
  where audit.organization_id = organization_id
    and audit.metadata ->> 'operation_key' = operation_key::text
    and audit.action in ('ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'ORDER_DISPATCHED', 'ORDER_SERVICES_COMPLETED')
    and not (audit.action = 'ORDER_DISPATCHED' and audit.entity_id = order_id::text)
  order by audit.id desc limit 1;
  if conflicting_audit.id is not null then
    raise exception using errcode = 'P0001', message = 'ORDER_OPERATION_KEY_REUSED';
  end if;

  select value.* into order_row
  from public.orders value
  where value.organization_id = organization_id and value.id = order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_DISPATCH_ORDER_NOT_FOUND';
  end if;
  if order_row.status <> 'confirmado' or order_row.warehouse_id is null then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_DISPATCHABLE';
  end if;
  select value.* into sale_row
  from public.sales value
  where value.organization_id = organization_id
    and value.order_id = order_id
    and (requested_sale_id is null or value.id = requested_sale_id)
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_SALE_REQUIRED';
  end if;
  requested_sale_id := sale_row.id;
  if sale_row.status <> 'registrada' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_DISPATCHABLE';
  end if;

  for order_item_row in
    select item.* from public.order_items item
    where item.organization_id = organization_id and item.order_id = order_id
    order by item.product_id, item.id for update
  loop
    if order_item_row.product_type is null then
      raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_PRODUCT_TYPE_UNKNOWN';
    end if;
    if order_item_row.product_type = 'good' then
      perform public.lock_inventory_fefo_scope(organization_id, order_item_row.product_id, order_row.warehouse_id);
    end if;
  end loop;

  -- El despacho fisico nunca atiende servicios incidentalmente.
  for item in select value from jsonb_array_elements(payload -> 'items')
  loop
    requested_order_item_id := nullif(item ->> 'order_item_id', '')::uuid;
    requested_quantity := (item ->> 'quantity')::numeric;
    if requested_order_item_id is null
       or requested_quantity is null
       or requested_quantity <= 0
       or lower(item ->> 'quantity') in ('nan', 'infinity', '-infinity')
    then
      raise exception using errcode = '22023', message = 'ORDER_DISPATCH_QUANTITY_INVALID';
    end if;
    select sale_item.* into sale_item_row
    from public.sale_items sale_item
    where sale_item.organization_id = organization_id
      and sale_item.sale_id = sale_row.id
      and sale_item.order_item_id = requested_order_item_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_ITEM_INVALID';
    end if;
    select value.* into order_item_row
    from public.order_items value
    where value.organization_id = organization_id and value.order_id = order_id and value.id = requested_order_item_id;
    if not found
       or sale_item_row.product_id is distinct from order_item_row.product_id
       or sale_item_row.quantity is distinct from order_item_row.quantity
    then
      raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_ITEM_INVALID';
    end if;
    item_product_type := order_item_row.product_type;
    if item_product_type is null then
      raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_PRODUCT_TYPE_UNKNOWN';
    end if;
    if item_product_type = 'service' then
      raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_SERVICE_FORBIDDEN';
    end if;
    select coalesce(sum(reservation.quantity - reservation.quantity_consumed), 0)
      into pending_quantity
    from public.inventory_reservations reservation
    where reservation.organization_id = organization_id
      and reservation.source_type = 'order-item'
      and reservation.source_id = requested_order_item_id
      and reservation.status = 'active';
    if requested_quantity > pending_quantity then
      raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_EXCEEDS_RESERVED';
    end if;
    if exists (
      select 1 from public.inventory_reservations reservation
      where reservation.organization_id = organization_id
        and reservation.source_type = 'order-item'
        and reservation.source_id = requested_order_item_id
        and reservation.status = 'active'
        and (
          reservation.product_id is distinct from order_item_row.product_id
          or reservation.warehouse_id is distinct from order_row.warehouse_id
          or reservation.stock_status <> 'available'
          or (reservation.expiration_date is not null and reservation.expiration_date < current_date)
        )
    ) then
      raise exception using errcode = 'P0001', message = 'ORDER_RESERVATION_STATE_INVALID';
    end if;
  end loop;

  select warehouse.* into warehouse_row
  from public.warehouses warehouse
  where warehouse.organization_id = organization_id
    and warehouse.id = order_row.warehouse_id
    and warehouse.is_active
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_WAREHOUSE_UNAVAILABLE';
  end if;

  for item in select value from jsonb_array_elements(payload -> 'items')
  loop
    requested_order_item_id := nullif(item ->> 'order_item_id', '')::uuid;
    remaining_to_dispatch := (item ->> 'quantity')::numeric;
    select value.* into order_item_row
    from public.order_items value
    where value.organization_id = organization_id and value.order_id = order_id and value.id = requested_order_item_id;
    for reservation_row in
      select reservation.* from public.inventory_reservations reservation
      where reservation.organization_id = organization_id
        and reservation.source_type = 'order-item'
        and reservation.source_id = requested_order_item_id
        and reservation.status = 'active'
      order by reservation.expiration_date asc nulls last,
        lower(coalesce(reservation.lot, '')) asc,
        reservation.location_id, reservation.id
      for update
    loop
      exit when remaining_to_dispatch <= 0;
      pending_quantity := reservation_row.quantity - reservation_row.quantity_consumed;
      if pending_quantity <= 0 then continue; end if;
      allocation_quantity := least(remaining_to_dispatch, pending_quantity);
      select state.* into bucket_state
      from public.inventory_bucket_state_for_order_dispatch(
        organization_id, order_item_row.product_id, order_row.warehouse_id,
        reservation_row.location_id, reservation_row.stock_status,
        reservation_row.lot, reservation_row.expiration_date
      ) state;
      movement_id := gen_random_uuid();
      reason_value := 'Despacho venta ' || sale_row.internal_number || ' · ' || order_row.order_number;
      insert into public.inventory_movements (
        id, organization_id, product_id, product_code, product_description,
        unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
        location_id, stock_status, unit_cost, lot, expiration_date,
        operation_date, reason, source_type, source_id, reservation_id, created_by
      ) values (
        movement_id, organization_id, order_item_row.product_id,
        order_item_row.product_code, order_item_row.product_description,
        order_item_row.unit_of_measure, 'salida', allocation_quantity,
        warehouse_row.name, order_row.warehouse_id, reservation_row.location_id,
        reservation_row.stock_status, greatest(coalesce(bucket_state.average_cost, 0), 0),
        reservation_row.lot, reservation_row.expiration_date,
        operation_date_value, reason_value, 'order-dispatch', requested_order_item_id,
        reservation_row.id, actor_id
      );
      update public.inventory_reservations
      set quantity_consumed = reservation_row.quantity_consumed + allocation_quantity,
          status = case when reservation_row.quantity_consumed + allocation_quantity = reservation_row.quantity then 'consumed' else 'active' end,
          updated_by = actor_id, updated_at = now()
      where organization_id = reservation_row.organization_id and id = reservation_row.id;
      movement_ids := movement_ids || jsonb_build_array(movement_id::text);
      allocations := allocations || jsonb_build_array(jsonb_build_object(
        'order_item_id', requested_order_item_id,
        'reservation_id', reservation_row.id,
        'movement_id', movement_id,
        'quantity', allocation_quantity,
        'lot', reservation_row.lot,
        'expiration_date', reservation_row.expiration_date
      ));
      remaining_to_dispatch := remaining_to_dispatch - allocation_quantity;
    end loop;
    if remaining_to_dispatch > 0 then
      raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_EXCEEDS_RESERVED';
    end if;
  end loop;

  completion_result := public.a5_finalize_order_completion(
    organization_id, order_id, sale_row.id, actor_id
  );
  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    organization_id, actor_id, 'ORDER_DISPATCHED', 'order', order_id::text,
    jsonb_build_object('order_status', order_row.status, 'sale_status', sale_row.status),
    jsonb_build_object(
      'order_status', completion_result ->> 'order_status',
      'sale_status', completion_result ->> 'sale_status',
      'sale_id', sale_row.id,
      'complete', completion_result -> 'complete'
    ),
    jsonb_build_object(
      'source', 'database_function',
      'operation_key', operation_key,
      'requested_items', payload -> 'items',
      'movement_ids', movement_ids,
      'allocations', allocations,
      'operation_date', operation_date_value
    )
  );
  return order_id;
exception
  when unique_violation then
    select audit.entity_id::uuid into order_id
    from public.audit_events audit
    where audit.organization_id = organization_id
      and audit.action = 'ORDER_DISPATCHED'
      and audit.metadata ->> 'operation_key' = operation_key::text
    order by audit.id desc limit 1;
    if order_id is not null then return order_id; end if;
    raise;
end;
$$;

revoke all on function public.dispatch_order_from_reservations_unchecked(jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Distribucion solo materializa bienes fisicos
-- ---------------------------------------------------------------------------

create or replace function public.filter_distribution_order_items_to_goods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_items jsonb;
begin
  if new.order_id is null then
    return new;
  end if;
  if exists (
    select 1 from public.order_items item
    where item.organization_id = new.organization_id
      and item.order_id = new.order_id
      and item.product_type is null
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_SERVICE_PRODUCT_TYPE_UNKNOWN';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'productoId', item.product_id,
    'productoCodigo', item.product_code,
    'productoDescripcion', item.product_description,
    'unidadMedida', coalesce(item.unit_of_measure, ''),
    'cantidad', item.quantity,
    'precioUnitario', item.unit_price,
    'lote', '',
    'fechaVencimiento', ''
  ) order by item.id), '[]'::jsonb)
    into canonical_items
  from public.order_items item
  where item.organization_id = new.organization_id
    and item.order_id = new.order_id
    and item.product_type = 'good';
  if jsonb_array_length(canonical_items) = 0 then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_GOODS_REQUIRED';
  end if;
  new.order_items := canonical_items;
  return new;
end;
$$;

drop trigger if exists distribution_deliveries_goods_only on public.distribution_deliveries;
create trigger distribution_deliveries_goods_only
before insert or update of order_items on public.distribution_deliveries
for each row execute function public.filter_distribution_order_items_to_goods();

revoke all on function public.filter_distribution_order_items_to_goods()
  from public, anon, authenticated, service_role;

commit;
