-- A2: las ordenes de compra pueden contener bienes y servicios. El tipo de
-- producto se congela en la linea y la recepcion declara si es fisica o
-- administrativa, sin mezclar servicios con inventario.

begin;

alter table public.purchase_order_items
  add column product_type text;

alter table public.purchase_order_items
  add constraint purchase_order_items_product_type_valid
  check (product_type is null or product_type in ('good', 'service'));

create or replace function public.snapshot_purchase_order_item_product_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select product.product_type
      into new.product_type
    from public.products product
    where product.organization_id = new.organization_id
      and product.id = new.product_id;
    if not found then
      raise exception using errcode = '23503', message = 'PURCHASE_ORDER_PRODUCT_INVALID';
    end if;
  else
    if new.product_id is distinct from old.product_id then
      raise exception using errcode = '55000', message = 'PURCHASE_ORDER_PRODUCT_IMMUTABLE';
    end if;
    if new.product_type is distinct from old.product_type then
      raise exception using errcode = '55000', message = 'PURCHASE_ORDER_PRODUCT_TYPE_IMMUTABLE';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_order_items_snapshot_product_type
  on public.purchase_order_items;
create trigger purchase_order_items_snapshot_product_type
before insert or update on public.purchase_order_items
for each row execute function public.snapshot_purchase_order_item_product_type();

revoke all on function public.snapshot_purchase_order_item_product_type()
  from public, anon, authenticated;

comment on column public.purchase_order_items.product_type is
  'Snapshot de products.product_type al crear la linea. NULL identifica lineas historicas que requieren regularizacion explicita.';

alter table public.purchase_receipt_items
  add column fulfillment_mode text;

update public.purchase_receipt_items
set fulfillment_mode = 'physical'
where fulfillment_mode is null;

alter table public.purchase_receipt_items
  alter column warehouse_id drop not null,
  alter column location_id drop not null,
  alter column fulfillment_mode set not null,
  add constraint purchase_receipt_items_fulfillment_mode_valid
    check (fulfillment_mode in ('physical', 'administrative'));

create or replace function public.validate_purchase_receipt_item_fulfillment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  order_item record;
begin
  select item.product_id, item.product_type
    into order_item
  from public.purchase_order_items item
  where item.organization_id = new.organization_id
    and item.id = new.purchase_order_item_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_ORDER_ITEM_INVALID';
  end if;
  if new.product_id is distinct from order_item.product_id then
    raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_PRODUCT_INVALID';
  end if;
  if order_item.product_type is null then
    raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_PRODUCT_TYPE_UNKNOWN';
  end if;
  if new.fulfillment_mode is null and order_item.product_type = 'good' then
    new.fulfillment_mode := 'physical';
  elsif new.fulfillment_mode is null and order_item.product_type = 'service'
    and new.warehouse_id is null and new.location_id is null
    and new.lot is null and new.expiration_date is null then
    new.fulfillment_mode := 'administrative';
  end if;
  if order_item.product_type = 'service'
    and new.fulfillment_mode is null
    and (new.warehouse_id is not null or new.location_id is not null
      or new.lot is not null or new.expiration_date is not null) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN';
  end if;
  if new.fulfillment_mode = 'physical' and order_item.product_type <> 'good' then
    raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_SERVICE_PHYSICAL_FORBIDDEN';
  end if;
  if new.fulfillment_mode = 'administrative' and order_item.product_type <> 'service' then
    raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_GOOD_ADMINISTRATIVE_FORBIDDEN';
  end if;
  if new.fulfillment_mode = 'physical' then
    if new.warehouse_id is null or new.location_id is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_LOCATION_INVALID';
    end if;
  elsif new.warehouse_id is not null
    or new.location_id is not null
    or new.lot is not null
    or new.expiration_date is not null then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_ADMINISTRATIVE_FIELDS_FORBIDDEN';
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_receipt_items_reject_service
  on public.purchase_receipt_items;
drop trigger if exists purchase_receipt_items_validate_fulfillment
  on public.purchase_receipt_items;
create trigger purchase_receipt_items_validate_fulfillment
before insert or update on public.purchase_receipt_items
for each row execute function public.validate_purchase_receipt_item_fulfillment();

revoke all on function public.validate_purchase_receipt_item_fulfillment()
  from public, anon, authenticated;

comment on column public.purchase_receipt_items.fulfillment_mode is
  'physical para bienes con inventario; administrative para servicios sin almacen, lote, movimiento ni Kardex.';

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
  fulfillment_mode_value text;
  location_id_value uuid;
  already_received numeric;
  payload_received numeric;
  item_count integer := 0;
  physical_item_count integer := 0;
  administrative_item_count integer := 0;
  physical_quantity numeric := 0;
  administrative_quantity numeric := 0;
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

  -- Se valida todo antes de escribir para conservar atomicidad en ordenes
  -- mixtas: cualquier fallo revierte recepcion, movimiento y auditoria.
  for item_payload in select value from jsonb_array_elements(payload -> 'items')
  loop
    quantity_value := nullif(item_payload ->> 'quantity', '')::numeric;
    fulfillment_mode_value := nullif(lower(btrim(item_payload ->> 'fulfillment_mode')), '');
    if quantity_value is null or quantity_value <= 0 then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_QUANTITY_INVALID';
    end if;
    if fulfillment_mode_value not in ('physical', 'administrative') then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_FULFILLMENT_MODE_INVALID';
    end if;

    select * into item_row from public.purchase_order_items item
    where item.id = (item_payload ->> 'purchase_order_item_id')::uuid
      and item.organization_id = organization_id and item.purchase_order_id = order_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_ORDER_ITEM_INVALID';
    end if;
    if item_row.product_type is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_PRODUCT_TYPE_UNKNOWN';
    end if;
    -- Compatibilidad con clientes antiguos: la base deriva el modo desde el
    -- snapshot, nunca desde el producto actual ni desde datos del frontend.
    fulfillment_mode_value := coalesce(
      fulfillment_mode_value,
      case item_row.product_type when 'good' then 'physical' when 'service' then 'administrative' end
    );
    if (item_row.product_type = 'good' and fulfillment_mode_value <> 'physical')
      or (item_row.product_type = 'service' and fulfillment_mode_value <> 'administrative') then
      raise exception using errcode = 'P0001',
        message = case when item_row.product_type = 'good'
          then 'PURCHASE_RECEIPT_GOOD_ADMINISTRATIVE_FORBIDDEN'
          else 'PURCHASE_RECEIPT_SERVICE_PHYSICAL_FORBIDDEN' end;
    end if;

    select * into product_row from public.products product
    where product.id = item_row.product_id
      and product.organization_id = organization_id and product.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE';
    end if;
    if item_row.product_type = 'good' and product_row.product_type <> 'good' then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_TYPE_CHANGED';
    end if;

    lot_value := nullif(btrim(item_payload ->> 'lot'), '');
    expiration_value := nullif(item_payload ->> 'expiration_date', '')::date;
    if fulfillment_mode_value = 'physical' then
      location_id_value := (item_payload ->> 'location_id')::uuid;
      if product_row.batch_control and lot_value is null then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_LOT_REQUIRED';
      end if;
      if product_row.expiration_control and expiration_value is null then
        raise exception using errcode = '22023', message = 'PURCHASE_ORDER_EXPIRATION_REQUIRED';
      end if;
      perform 1 from public.warehouse_locations location
      where location.id = location_id_value
        and location.organization_id = organization_id
        and location.warehouse_id = warehouse_row.id and location.is_active;
      if not found then
        raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_LOCATION_INVALID';
      end if;
      physical_item_count := physical_item_count + 1;
      physical_quantity := physical_quantity + quantity_value;
    else
      if item_payload ? 'location_id' and nullif(btrim(item_payload ->> 'location_id'), '') is not null
        or item_payload ? 'lot' and nullif(btrim(item_payload ->> 'lot'), '') is not null
        or item_payload ? 'expiration_date' and nullif(item_payload ->> 'expiration_date', '') is not null then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_ADMINISTRATIVE_FIELDS_FORBIDDEN';
      end if;
      location_id_value := null;
      lot_value := null;
      expiration_value := null;
      administrative_item_count := administrative_item_count + 1;
      administrative_quantity := administrative_quantity + quantity_value;
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
    fulfillment_mode_value := coalesce(
      nullif(lower(btrim(item_payload ->> 'fulfillment_mode')), ''),
      case item_row.product_type when 'good' then 'physical' when 'service' then 'administrative' end
    );
    lot_value := nullif(btrim(item_payload ->> 'lot'), '');
    expiration_value := nullif(item_payload ->> 'expiration_date', '')::date;
    location_id_value := case when fulfillment_mode_value = 'physical'
      then (item_payload ->> 'location_id')::uuid else null end;

    insert into public.purchase_receipt_items (
      organization_id, receipt_id, purchase_order_item_id, product_id,
      warehouse_id, location_id, quantity, unit_cost, lot, expiration_date,
      fulfillment_mode
    ) values (
      organization_id, receipt_id, item_row.id, item_row.product_id,
      case when fulfillment_mode_value = 'physical' then warehouse_row.id else null end,
      location_id_value, quantity_value, item_row.unit_cost,
      case when fulfillment_mode_value = 'physical' then lot_value else null end,
      case when fulfillment_mode_value = 'physical' then expiration_value else null end,
      fulfillment_mode_value
    ) returning id into receipt_item_id;

    if fulfillment_mode_value = 'physical' then
      insert into public.inventory_movements (
        organization_id, product_id, product_code, product_description,
        unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
        location_id, stock_status, unit_cost, lot, expiration_date,
        operation_date, reason, source_type, source_id, created_by
      ) values (
        organization_id, item_row.product_id, item_row.product_code,
        item_row.product_description, item_row.unit_of_measure, 'entrada', quantity_value,
        warehouse_row.name, warehouse_row.id, location_id_value,
        'available', item_row.unit_cost, lot_value, expiration_value, current_date,
        left('Recepcion de ' || order_row.document_type || ' ' || order_row.series || '-' || order_row.document_number, 180),
        'purchase-receipt', receipt_item_id, actor_id
      );
    end if;
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
    jsonb_build_object(
      'items_received', item_count,
      'physical_items', physical_item_count,
      'physical_quantity', physical_quantity,
      'administrative_items', administrative_item_count,
      'administrative_quantity', administrative_quantity,
      'operation_key', idempotency_key
    )
  );
  return receipt_id;
end;
$$;

-- Compatibilidad: el wrapper conserva la API antigua y delega todas las
-- validaciones a la recepcion parcial, incluyendo lineas administrativas.
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
    'fulfillment_mode', case item.product_type when 'good' then 'physical' when 'service' then 'administrative' end,
    'location_id', case when item.product_type = 'good'
      then coalesce(setting.default_location_id, fallback.id) end,
    'lot', case when item.product_type = 'good' then item.lot end,
    'expiration_date', case when item.product_type = 'good' then item.expiration_date end
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

revoke all on function public.snapshot_purchase_order_item_product_type() from public, anon, authenticated;
revoke all on function public.validate_purchase_receipt_item_fulfillment() from public, anon, authenticated;
revoke all on function public.receive_purchase_order_partial(jsonb) from public, anon, authenticated;
revoke all on function public.receive_purchase_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.receive_purchase_order_partial(jsonb) to authenticated;
grant execute on function public.receive_purchase_order(uuid, uuid) to authenticated;

commit;
