-- Recepciones parciales e idempotentes por lote y ubicacion.

alter table public.purchase_orders
  drop constraint purchase_orders_status_valid,
  drop constraint purchase_orders_status_dates_consistent,
  add constraint purchase_orders_status_valid
    check (status in ('draft', 'issued', 'partially_received', 'received', 'cancelled')),
  add constraint purchase_orders_status_dates_consistent
    check (
      (status = 'draft' and issued_at is null and received_at is null and cancelled_at is null)
      or (status in ('issued', 'partially_received') and issued_at is not null and received_at is null and cancelled_at is null)
      or (status = 'received' and issued_at is not null and received_at is not null and cancelled_at is null)
      or (status = 'cancelled' and received_at is null and cancelled_at is not null)
    );

alter table public.purchase_order_items
  add constraint purchase_order_items_organization_id_id_key unique (organization_id, id);

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  purchase_order_id uuid not null,
  warehouse_id uuid not null,
  operation_key uuid not null,
  received_at timestamptz not null default now(),
  received_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  constraint purchase_receipts_order_fk foreign key (organization_id, purchase_order_id)
    references public.purchase_orders (organization_id, id) on delete restrict,
  constraint purchase_receipts_warehouse_fk foreign key (organization_id, warehouse_id)
    references public.warehouses (organization_id, id) on delete restrict,
  constraint purchase_receipts_notes_length check (notes is null or char_length(btrim(notes)) <= 240),
  unique (organization_id, id),
  unique (organization_id, operation_key)
);

create index purchase_receipts_order_received_idx
  on public.purchase_receipts (organization_id, purchase_order_id, received_at, id);

create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  receipt_id uuid not null,
  purchase_order_item_id uuid not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  location_id uuid not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(16,4) not null,
  lot text,
  expiration_date date,
  created_at timestamptz not null default now(),
  constraint purchase_receipt_items_receipt_fk foreign key (organization_id, receipt_id)
    references public.purchase_receipts (organization_id, id) on delete restrict,
  constraint purchase_receipt_items_order_item_fk foreign key (organization_id, purchase_order_item_id)
    references public.purchase_order_items (organization_id, id) on delete restrict,
  constraint purchase_receipt_items_product_fk foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint purchase_receipt_items_location_fk foreign key (organization_id, warehouse_id, location_id)
    references public.warehouse_locations (organization_id, warehouse_id, id) on delete restrict,
  constraint purchase_receipt_items_quantity_positive check (quantity > 0),
  constraint purchase_receipt_items_cost_positive check (unit_cost > 0),
  constraint purchase_receipt_items_lot_length check (lot is null or char_length(btrim(lot)) <= 60),
  unique (organization_id, id)
);

create index purchase_receipt_items_order_item_idx
  on public.purchase_receipt_items (organization_id, purchase_order_item_id, created_at, id);
create index purchase_receipt_items_receipt_idx
  on public.purchase_receipt_items (organization_id, receipt_id, id);

comment on table public.purchase_receipts is
  'Cabeceras inmutables de recepcion. operation_key evita duplicados por reintentos.';
comment on table public.purchase_receipt_items is
  'Partidas inmutables recibidas por linea de orden, lote, vencimiento y ubicacion exacta.';

-- Conserva trazabilidad de recepciones historicas completas.
insert into public.purchase_receipts (
  id, organization_id, purchase_order_id, warehouse_id, operation_key,
  received_at, received_by, notes, created_at
)
select
  gen_random_uuid(), purchase.organization_id, purchase.id, purchase.warehouse_id,
  gen_random_uuid(), purchase.received_at, purchase.received_by,
  'Recepcion historica migrada', purchase.received_at
from public.purchase_orders purchase
where purchase.status = 'received';

insert into public.purchase_receipt_items (
  organization_id, receipt_id, purchase_order_item_id, product_id,
  warehouse_id, location_id, quantity, unit_cost, lot, expiration_date, created_at
)
select
  item.organization_id, receipt.id, item.id, item.product_id,
  movement.warehouse_id, movement.location_id, movement.quantity,
  item.unit_cost, movement.lot, movement.expiration_date, movement.created_at
from public.purchase_order_items item
join public.purchase_orders purchase on purchase.id = item.purchase_order_id
join public.purchase_receipts receipt
  on receipt.organization_id = purchase.organization_id
 and receipt.purchase_order_id = purchase.id
join public.inventory_movements movement
  on movement.organization_id = item.organization_id
 and movement.source_type = 'purchase-receipt'
 and movement.source_id = item.id
where purchase.status = 'received';

update public.inventory_movements movement
set source_id = receipt_item.id
from public.purchase_receipt_items receipt_item
where movement.organization_id = receipt_item.organization_id
  and movement.source_type = 'purchase-receipt'
  and movement.source_id = receipt_item.purchase_order_item_id
  and movement.product_id = receipt_item.product_id
  and movement.warehouse_id = receipt_item.warehouse_id
  and movement.location_id = receipt_item.location_id
  and movement.quantity = receipt_item.quantity
  and lower(coalesce(movement.lot, '')) = lower(coalesce(receipt_item.lot, ''))
  and movement.expiration_date is not distinct from receipt_item.expiration_date;

create or replace function public.reject_purchase_receipt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'PURCHASE_RECEIPT_IMMUTABLE';
end;
$$;

create trigger purchase_receipts_immutable
before update or delete on public.purchase_receipts
for each row execute function public.reject_purchase_receipt_mutation();

create trigger purchase_receipt_items_immutable
before update or delete on public.purchase_receipt_items
for each row execute function public.reject_purchase_receipt_mutation();

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;

create policy purchase_receipts_select_authorized on public.purchase_receipts
for select to authenticated using (
  public.has_organization_permission(organization_id, 'PURCHASES_VIEW')
);
create policy purchase_receipt_items_select_authorized on public.purchase_receipt_items
for select to authenticated using (
  public.has_organization_permission(organization_id, 'PURCHASES_VIEW')
);

create or replace function public.receive_purchase_order_partial(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  order_id uuid := (payload ->> 'purchase_order_id')::uuid;
  idempotency_key uuid := (payload ->> 'operation_key')::uuid;
  receipt_id uuid;
  order_row public.purchase_orders%rowtype;
  updated_order public.purchase_orders%rowtype;
  warehouse_row public.warehouses%rowtype;
  item_payload jsonb;
  item_row public.purchase_order_items%rowtype;
  product_row public.products%rowtype;
  receipt_item_id uuid;
  quantity_value numeric;
  lot_value text;
  expiration_value date;
  already_received numeric;
  payload_received numeric;
  item_count integer := 0;
  completed boolean;
begin
  if actor_id is null
    or not public.has_organization_permission(organization_id, 'PURCHASES_RECEIVE') then
    raise exception using errcode = '42501', message = 'PURCHASE_RECEIPT_FORBIDDEN';
  end if;

  select receipt.id into receipt_id
  from public.purchase_receipts receipt
  where receipt.organization_id = organization_id
    and receipt.operation_key = idempotency_key;
  if found then
    if not exists (
      select 1 from public.purchase_receipts receipt
      where receipt.id = receipt_id and receipt.purchase_order_id = order_id
    ) then
      raise exception using errcode = '23505', message = 'PURCHASE_RECEIPT_KEY_CONFLICT';
    end if;
    return receipt_id;
  end if;

  select * into order_row
  from public.purchase_orders purchase
  where purchase.id = order_id and purchase.organization_id = organization_id
  for update;
  if not found or order_row.status not in ('issued', 'partially_received') then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array'
    or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_ITEMS_REQUIRED';
  end if;

  select * into warehouse_row
  from public.warehouses warehouse
  where warehouse.id = order_row.warehouse_id
    and warehouse.organization_id = organization_id and warehouse.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE';
  end if;

  -- Valida todo antes de escribir para que la operacion sea atomica.
  for item_payload in select value from jsonb_array_elements(payload -> 'items')
  loop
    quantity_value := nullif(item_payload ->> 'quantity', '')::numeric;
    lot_value := nullif(btrim(item_payload ->> 'lot'), '');
    expiration_value := nullif(item_payload ->> 'expiration_date', '')::date;
    if quantity_value is null or quantity_value <= 0 then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_QUANTITY_INVALID';
    end if;

    select * into item_row from public.purchase_order_items item
    where item.id = (item_payload ->> 'purchase_order_item_id')::uuid
      and item.organization_id = organization_id and item.purchase_order_id = order_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_ORDER_ITEM_INVALID';
    end if;
    select * into product_row from public.products product
    where product.id = item_row.product_id and product.organization_id = organization_id and product.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE';
    end if;
    if product_row.batch_control and lot_value is null then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_LOT_REQUIRED';
    end if;
    if product_row.expiration_control and expiration_value is null then
      raise exception using errcode = '22023', message = 'PURCHASE_ORDER_EXPIRATION_REQUIRED';
    end if;
    perform 1 from public.warehouse_locations location
    where location.id = (item_payload ->> 'location_id')::uuid
      and location.organization_id = organization_id
      and location.warehouse_id = warehouse_row.id and location.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_LOCATION_INVALID';
    end if;

    select coalesce(sum(receipt_item.quantity), 0) into already_received
    from public.purchase_receipt_items receipt_item
    where receipt_item.organization_id = organization_id
      and receipt_item.purchase_order_item_id = item_row.id;
    select coalesce(sum((prior.value ->> 'quantity')::numeric), 0) into payload_received
    from jsonb_array_elements(payload -> 'items') with ordinality prior(value, position)
    where (prior.value ->> 'purchase_order_item_id')::uuid = item_row.id;
    if already_received + payload_received > item_row.quantity then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_EXCEEDS_ORDERED_QUANTITY';
    end if;
    item_count := item_count + 1;
  end loop;

  insert into public.purchase_receipts (
    organization_id, purchase_order_id, warehouse_id, operation_key,
    received_by, notes
  ) values (
    organization_id, order_id, warehouse_row.id, idempotency_key,
    actor_id, nullif(btrim(payload ->> 'notes'), '')
  ) returning id into receipt_id;

  for item_payload in select value from jsonb_array_elements(payload -> 'items')
  loop
    select * into item_row from public.purchase_order_items item
    where item.id = (item_payload ->> 'purchase_order_item_id')::uuid
      and item.organization_id = organization_id and item.purchase_order_id = order_id;
    quantity_value := (item_payload ->> 'quantity')::numeric;
    lot_value := nullif(btrim(item_payload ->> 'lot'), '');
    expiration_value := nullif(item_payload ->> 'expiration_date', '')::date;

    insert into public.purchase_receipt_items (
      organization_id, receipt_id, purchase_order_item_id, product_id,
      warehouse_id, location_id, quantity, unit_cost, lot, expiration_date
    ) values (
      organization_id, receipt_id, item_row.id, item_row.product_id,
      warehouse_row.id, (item_payload ->> 'location_id')::uuid,
      quantity_value, item_row.unit_cost, lot_value, expiration_value
    ) returning id into receipt_item_id;

    insert into public.inventory_movements (
      organization_id, product_id, product_code, product_description,
      unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
      location_id, stock_status, unit_cost, lot, expiration_date,
      operation_date, reason, source_type, source_id, created_by
    ) values (
      organization_id, item_row.product_id, item_row.product_code,
      item_row.product_description, item_row.unit_of_measure, 'entrada', quantity_value,
      warehouse_row.name, warehouse_row.id, (item_payload ->> 'location_id')::uuid,
      'available', item_row.unit_cost, lot_value, expiration_value, current_date,
      left('Recepcion de ' || order_row.document_type || ' ' || order_row.series || '-' || order_row.document_number, 180),
      'purchase-receipt', receipt_item_id, actor_id
    );
  end loop;

  select not exists (
    select 1
    from public.purchase_order_items item
    left join lateral (
      select coalesce(sum(receipt_item.quantity), 0) quantity
      from public.purchase_receipt_items receipt_item
      where receipt_item.organization_id = organization_id
        and receipt_item.purchase_order_item_id = item.id
    ) received on true
    where item.organization_id = organization_id and item.purchase_order_id = order_id
      and received.quantity < item.quantity
  ) into completed;

  update public.purchase_orders purchase
  set status = case when completed then 'received' else 'partially_received' end,
      received_at = case when completed then now() else null end,
      received_by = case when completed then actor_id else null end,
      updated_by = actor_id,
      warehouse = warehouse_row.name
  where purchase.id = order_id
  returning * into updated_order;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    organization_id, actor_id, 'PURCHASE_RECEIPT_CONFIRMED',
    'purchase_receipt', receipt_id::text, null,
    jsonb_build_object('purchase_order_id', order_id, 'status', updated_order.status),
    jsonb_build_object('items_received', item_count, 'operation_key', idempotency_key)
  );
  return receipt_id;
end;
$$;

-- Compatibilidad: recibe todo el saldo usando la ubicacion predeterminada.
create or replace function public.receive_purchase_order(
  requested_organization_id uuid,
  requested_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.purchase_orders%rowtype;
  items_payload jsonb;
begin
  select * into order_row from public.purchase_orders purchase
  where purchase.id = requested_order_id and purchase.organization_id = requested_organization_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;
  select jsonb_agg(jsonb_build_object(
    'purchase_order_item_id', item.id,
    'quantity', item.quantity - coalesce(received.quantity, 0),
    'location_id', coalesce(setting.default_location_id, fallback.id),
    'lot', item.lot,
    'expiration_date', item.expiration_date
  ) order by item.id) into items_payload
  from public.purchase_order_items item
  left join public.product_warehouse_settings setting
    on setting.organization_id = item.organization_id and setting.product_id = item.product_id
   and setting.warehouse_id = order_row.warehouse_id
  left join lateral (
    select location.id from public.warehouse_locations location
    where location.organization_id = item.organization_id
      and location.warehouse_id = order_row.warehouse_id and location.is_active
    order by (location.code = 'GENERAL') desc, location.created_at, location.id limit 1
  ) fallback on true
  left join lateral (
    select coalesce(sum(receipt_item.quantity), 0) quantity
    from public.purchase_receipt_items receipt_item
    where receipt_item.organization_id = item.organization_id
      and receipt_item.purchase_order_item_id = item.id
  ) received on true
  where item.organization_id = requested_organization_id
    and item.purchase_order_id = requested_order_id
    and item.quantity > coalesce(received.quantity, 0);
  perform public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', requested_organization_id,
    'purchase_order_id', requested_order_id,
    'operation_key', gen_random_uuid(),
    'items', items_payload
  ));
end;
$$;

-- Las devoluciones apuntan a la partida recibida exacta.
alter table public.supplier_returns add column purchase_receipt_item_id uuid;

update public.supplier_returns supplier_return
set purchase_receipt_item_id = (
  select receipt_item.id
  from public.purchase_receipt_items receipt_item
  where receipt_item.organization_id = supplier_return.organization_id
    and receipt_item.purchase_order_item_id = supplier_return.purchase_order_item_id
  order by receipt_item.created_at, receipt_item.id limit 1
);

alter table public.supplier_returns
  alter column purchase_receipt_item_id set not null,
  add constraint supplier_returns_receipt_item_fk
    foreign key (organization_id, purchase_receipt_item_id)
    references public.purchase_receipt_items (organization_id, id) on delete restrict;
create index supplier_returns_receipt_item_idx
  on public.supplier_returns (organization_id, purchase_receipt_item_id, status);

create or replace function public.register_supplier_return(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  receipt_item_id uuid := (payload ->> 'purchase_receipt_item_id')::uuid;
  requested_quantity numeric := (payload ->> 'quantity')::numeric;
  receipt_data record;
  return_id uuid;
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'SUPPLIERS_MANAGE') then
    raise exception using errcode = '42501', message = 'SUPPLIER_RETURN_FORBIDDEN';
  end if;
  select receipt_item.*, purchase.id as order_id, item.id as order_item_id
  into receipt_data
  from public.purchase_receipt_items receipt_item
  join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id
    and receipt.organization_id = receipt_item.organization_id
  join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id
    and purchase.organization_id = receipt.organization_id
  join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id
    and item.organization_id = receipt_item.organization_id
  where receipt_item.id = receipt_item_id and receipt_item.organization_id = organization_id
    and purchase.supplier_id = supplier_id;
  if not found then raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_RECEIPT_ITEM_INVALID'; end if;
  if requested_quantity <= 0 or requested_quantity + coalesce((
    select sum(previous.quantity) from public.supplier_returns previous
    where previous.organization_id = organization_id
      and previous.purchase_receipt_item_id = receipt_item_id and previous.status <> 'cancelled'
  ), 0) > receipt_data.quantity then
    raise exception using errcode = '22023', message = 'SUPPLIER_RETURN_QUANTITY_INVALID';
  end if;

  insert into public.supplier_returns (
    organization_id, supplier_id, purchase_order_id, purchase_order_item_id,
    purchase_receipt_item_id, product_id, quantity, reason, requested_at,
    responsible_user_id, responsible_name
  ) values (
    organization_id, supplier_id, receipt_data.order_id, receipt_data.order_item_id,
    receipt_item_id, receipt_data.product_id, requested_quantity,
    btrim(payload ->> 'reason'), coalesce(nullif(payload ->> 'requested_at', '')::date, current_date),
    actor_id, public.supplier_responsible_name(actor_id)
  ) returning id into return_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (organization_id, actor_id, 'SUPPLIER_RETURN_REGISTERED', 'supplier_return', return_id::text, payload - 'organization_id');
  return return_id;
end;
$$;

create or replace function public.complete_supplier_return(
  requested_organization_id uuid,
  requested_return_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  return_row public.supplier_returns%rowtype;
  receipt_item_row public.purchase_receipt_items%rowtype;
  item_row public.purchase_order_items%rowtype;
  receipt_movement public.inventory_movements%rowtype;
  bucket_state record;
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'SUPPLIERS_MANAGE')
    or not public.has_organization_permission(requested_organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'SUPPLIER_RETURN_COMPLETE_FORBIDDEN';
  end if;
  select * into return_row from public.supplier_returns requested
  where requested.id = requested_return_id and requested.organization_id = requested_organization_id for update;
  if not found or return_row.status <> 'registered' then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_NOT_COMPLETABLE';
  end if;
  select * into receipt_item_row from public.purchase_receipt_items receipt_item
  where receipt_item.id = return_row.purchase_receipt_item_id
    and receipt_item.organization_id = requested_organization_id;
  select * into item_row from public.purchase_order_items item
  where item.id = receipt_item_row.purchase_order_item_id
    and item.organization_id = requested_organization_id;
  select * into receipt_movement from public.inventory_movements movement
  where movement.organization_id = requested_organization_id
    and movement.source_type = 'purchase-receipt' and movement.source_id = receipt_item_row.id;
  if not found then raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_RECEIPT_NOT_FOUND'; end if;

  perform public.lock_inventory_bucket(
    requested_organization_id, receipt_item_row.product_id, receipt_item_row.warehouse_id,
    receipt_item_row.location_id, receipt_movement.stock_status,
    receipt_item_row.lot, receipt_item_row.expiration_date
  );
  select * into bucket_state from public.inventory_bucket_state(
    requested_organization_id, receipt_item_row.product_id, receipt_item_row.warehouse_id,
    receipt_item_row.location_id, receipt_movement.stock_status,
    receipt_item_row.lot, receipt_item_row.expiration_date
  );
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, source_type, source_id, created_by
  ) values (
    requested_organization_id, item_row.product_id, item_row.product_code,
    item_row.product_description, item_row.unit_of_measure, 'salida', return_row.quantity,
    receipt_movement.warehouse, receipt_item_row.warehouse_id, receipt_item_row.location_id,
    receipt_movement.stock_status, greatest(bucket_state.average_cost, 0),
    receipt_item_row.lot, receipt_item_row.expiration_date, current_date,
    left('Devolucion a proveedor: ' || return_row.reason, 180),
    'supplier-return', return_row.id, actor_id
  );
  update public.supplier_returns set status = 'completed', completed_at = now(),
    responsible_user_id = actor_id, responsible_name = public.supplier_responsible_name(actor_id)
  where id = return_row.id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id)
  values (requested_organization_id, actor_id, 'SUPPLIER_RETURN_COMPLETED', 'supplier_return', return_row.id::text);
end;
$$;

revoke all on table public.purchase_receipts, public.purchase_receipt_items from anon, authenticated;
grant select on table public.purchase_receipts, public.purchase_receipt_items to authenticated;
grant select, insert, update, delete on table public.purchase_receipts, public.purchase_receipt_items to service_role;

revoke all on function public.reject_purchase_receipt_mutation() from public, anon, authenticated;
revoke all on function public.receive_purchase_order_partial(jsonb) from public, anon, authenticated;
revoke all on function public.receive_purchase_order(uuid, uuid) from public, anon, authenticated;
revoke all on function public.register_supplier_return(jsonb) from public, anon, authenticated;
revoke all on function public.complete_supplier_return(uuid, uuid) from public, anon, authenticated;
grant execute on function public.receive_purchase_order_partial(jsonb) to authenticated;
grant execute on function public.receive_purchase_order(uuid, uuid) to authenticated;
grant execute on function public.register_supplier_return(jsonb) to authenticated;
grant execute on function public.complete_supplier_return(uuid, uuid) to authenticated, service_role;
