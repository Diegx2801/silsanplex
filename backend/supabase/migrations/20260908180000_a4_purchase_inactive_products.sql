-- A4: una orden emitida conserva sus condiciones comerciales aunque el
-- producto se inactive o cambie su configuracion en el catalogo.

begin;

alter table public.purchase_order_items
  add column if not exists expiration_control boolean;

comment on column public.purchase_order_items.expiration_control is
  'Snapshot de products.expiration_control al crear la linea. NULL identifica lineas historicas anteriores a A4 sin dato reconstruible.';

create or replace function public.snapshot_purchase_order_item_expiration_control()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_expiration_control boolean;
begin
  if tg_op = 'INSERT' then
    select product.expiration_control
      into product_expiration_control
    from public.products product
    where product.organization_id = new.organization_id
      and product.id = new.product_id
      and product.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE';
    end if;
    new.expiration_control := product_expiration_control;
  else
    if new.expiration_control is distinct from old.expiration_control then
      raise exception using errcode = '55000', message = 'PURCHASE_ORDER_EXPIRATION_CONTROL_IMMUTABLE';
    end if;
    new.expiration_control := old.expiration_control;
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_order_items_snapshot_expiration_control
  on public.purchase_order_items;
create trigger purchase_order_items_snapshot_expiration_control
before insert or update on public.purchase_order_items
for each row execute function public.snapshot_purchase_order_item_expiration_control();

revoke all on function public.snapshot_purchase_order_item_expiration_control()
  from public, anon, authenticated;

-- La validacion de la linea usa el snapshot. Las funciones de guardado y
-- emision mantienen sus validaciones explicitas contra el producto activo.
create or replace function public.validate_purchase_item_expiration()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.expiration_control is true and new.expiration_date is null then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_EXPIRATION_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_order_items_validate_expiration
  on public.purchase_order_items;
create trigger purchase_order_items_validate_expiration
before insert or update on public.purchase_order_items
for each row execute function public.validate_purchase_item_expiration();

revoke all on function public.validate_purchase_item_expiration() from public;

-- El guard conserva la politica actual para movimientos manuales. Solo los
-- movimientos generados por una recepcion de compra consultan la linea
-- persistida, porque esa linea es la fuente de verdad del compromiso emitido.
create or replace function public.validate_product_tracking_requirements()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  receipt_product_id uuid;
  receipt_fulfillment_mode text;
  snapshot_batch_control boolean;
  snapshot_expiration_control boolean;
begin
  select product.*
    into product_row
  from public.products product
  where product.id = new.product_id
    and product.organization_id = new.organization_id;

  if not found then
    return new;
  end if;

  if new.source_type = 'purchase-receipt' then
    select receipt_item.product_id,
           receipt_item.fulfillment_mode,
           order_item.batch_control,
           order_item.expiration_control
      into receipt_product_id,
           receipt_fulfillment_mode,
           snapshot_batch_control,
           snapshot_expiration_control
    from public.purchase_receipt_items receipt_item
    join public.purchase_order_items order_item
      on order_item.organization_id = receipt_item.organization_id
     and order_item.id = receipt_item.purchase_order_item_id
    where receipt_item.organization_id = new.organization_id
      and receipt_item.id = new.source_id;

    if not found
      or receipt_product_id is distinct from new.product_id
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

revoke all on function public.validate_product_tracking_requirements() from public;

-- El guard de Inventario tambien protege el tipo de producto. Para una
-- entrada de compra emitida debe usar el snapshot A2 de la linea, pero solo
-- en esta via; reservas, reparaciones y cualquier otra referencia siguen
-- validando el tipo actual del catalogo.
create or replace function public.reject_service_inventory_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_product_type text;
  snapshot_product_type text;
begin
  if tg_table_name = 'inventory_movements' then
    if new.source_type = 'purchase-receipt' then
      perform 1
      from public.products product
      where product.organization_id = new.organization_id
        and product.id = new.product_id
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

  select product.product_type
    into requested_product_type
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.product_id
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

create or replace function public.receive_purchase_order_partial(payload jsonb)
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
  idempotency_key uuid;
  receipt_id uuid;
  existing_receipt public.purchase_receipts%rowtype;
  existing_receipt_found boolean := false;
  order_row public.purchase_orders%rowtype;
  updated_order public.purchase_orders%rowtype;
  warehouse_row public.warehouses%rowtype;
  item_payload jsonb;
  item_row public.purchase_order_items%rowtype;
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
  notes_value text;
  canonical_items jsonb := '[]'::jsonb;
  canonical_payload jsonb;
  request_payload_hash text;
  items_input jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_PAYLOAD_INVALID';
  end if;

  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  order_id := nullif(payload ->> 'purchase_order_id', '')::uuid;
  idempotency_key := nullif(payload ->> 'operation_key', '')::uuid;

  if organization_id is null or order_id is null then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_PAYLOAD_INVALID';
  end if;
  if idempotency_key is null then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_OPERATION_KEY_REQUIRED';
  end if;
  if actor_id is null
    or not public.has_organization_permission(organization_id, 'PURCHASES_RECEIVE') then
    raise exception using errcode = '42501', message = 'PURCHASE_RECEIPT_FORBIDDEN';
  end if;
  if payload ? 'items'
    and payload -> 'items' <> 'null'::jsonb
    and jsonb_typeof(payload -> 'items') <> 'array' then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_ITEMS_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text || ':purchase-receipt-operation:' || idempotency_key::text,
    0
  ));

  select * into existing_receipt
  from public.purchase_receipts receipt
  where receipt.organization_id = organization_id
    and receipt.operation_key = idempotency_key
  for update;
  existing_receipt_found := found;

  if existing_receipt_found and existing_receipt.purchase_order_id is distinct from order_id then
    raise exception using errcode = '23505', message = 'PURCHASE_RECEIPT_KEY_CONFLICT';
  end if;

  if existing_receipt_found and existing_receipt.operation_payload_hash is null then
    raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_IDEMPOTENCY_LEGACY_UNVERIFIABLE';
  end if;

  select * into order_row
  from public.purchase_orders purchase
  where purchase.id = order_id and purchase.organization_id = organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;

  items_input := case
    when payload -> 'items' is null or payload -> 'items' = 'null'::jsonb then '[]'::jsonb
    else payload -> 'items'
  end;
  notes_value := nullif(btrim(coalesce(payload ->> 'notes', '')), '');

  -- La canonicalizacion usa la linea y el tipo congelados. No consulta
  -- products.active, ni ninguna configuracion actual del catalogo.
  for item_payload in select value from jsonb_array_elements(items_input)
  loop
    select * into item_row
    from public.purchase_order_items item
    where item.id = nullif(item_payload ->> 'purchase_order_item_id', '')::uuid
      and item.organization_id = organization_id
      and item.purchase_order_id = order_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_ORDER_ITEM_INVALID';
    end if;
    if item_row.product_type is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_PRODUCT_TYPE_UNKNOWN';
    end if;

    quantity_value := nullif(item_payload ->> 'quantity', '')::numeric;
    if quantity_value is null then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_QUANTITY_INVALID';
    end if;
    quantity_value := quantity_value::numeric(14, 3);
    if quantity_value <= 0 then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_QUANTITY_INVALID';
    end if;

    fulfillment_mode_value := nullif(lower(btrim(item_payload ->> 'fulfillment_mode')), '');
    fulfillment_mode_value := coalesce(
      fulfillment_mode_value,
      case item_row.product_type
        when 'good' then 'physical'
        when 'service' then 'administrative'
      end
    );
    if fulfillment_mode_value not in ('physical', 'administrative') then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_FULFILLMENT_MODE_INVALID';
    end if;
    if (item_row.product_type = 'good' and fulfillment_mode_value <> 'physical')
      or (item_row.product_type = 'service' and fulfillment_mode_value <> 'administrative') then
      raise exception using errcode = 'P0001',
        message = case when item_row.product_type = 'good'
          then 'PURCHASE_RECEIPT_GOOD_ADMINISTRATIVE_FORBIDDEN'
          else 'PURCHASE_RECEIPT_SERVICE_PHYSICAL_FORBIDDEN' end;
    end if;

    if fulfillment_mode_value = 'physical' then
      location_id_value := nullif(item_payload ->> 'location_id', '')::uuid;
      lot_value := nullif(btrim(item_payload ->> 'lot'), '');
      expiration_value := nullif(item_payload ->> 'expiration_date', '')::date;
    else
      if (item_payload ? 'location_id' and nullif(btrim(item_payload ->> 'location_id'), '') is not null)
        or (item_payload ? 'lot' and nullif(btrim(item_payload ->> 'lot'), '') is not null)
        or (item_payload ? 'expiration_date' and nullif(item_payload ->> 'expiration_date', '') is not null) then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_ADMINISTRATIVE_FIELDS_FORBIDDEN';
      end if;
      location_id_value := null;
      lot_value := null;
      expiration_value := null;
    end if;

    canonical_items := canonical_items || jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', item_row.id,
      'quantity', public.normalize_commercial_idempotency_numeric(quantity_value),
      'fulfillment_mode', fulfillment_mode_value,
      'location_id', location_id_value,
      'lot', lot_value,
      'expiration_date', expiration_value
    ));
  end loop;

  select coalesce(jsonb_agg(item order by
      item ->> 'purchase_order_item_id',
      item ->> 'fulfillment_mode',
      coalesce(item ->> 'location_id', ''),
      coalesce(item ->> 'lot', ''),
      coalesce(item ->> 'expiration_date', ''),
      item ->> 'quantity'
    ), '[]'::jsonb)
    into canonical_items
  from jsonb_array_elements(canonical_items) as elements(item);

  canonical_payload := jsonb_build_object(
    'organization_id', organization_id,
    'purchase_order_id', order_id,
    'warehouse_id', order_row.warehouse_id,
    'notes', notes_value,
    'items', canonical_items
  );
  request_payload_hash := encode(
    extensions.digest(canonical_payload::text, 'sha256'),
    'hex'
  );

  if existing_receipt_found then
    if existing_receipt.operation_payload_hash is distinct from request_payload_hash then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_receipt.id;
  end if;

  if order_row.status not in ('issued', 'partially_received') then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array'
    or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_ITEMS_REQUIRED';
  end if;

  select * into warehouse_row
  from public.warehouses warehouse
  where warehouse.id = order_row.warehouse_id
    and warehouse.organization_id = organization_id
    and warehouse.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE';
  end if;

  -- Validacion completa antes de escribir para conservar atomicidad.
  for item_payload in select value from jsonb_array_elements(payload -> 'items')
  loop
    quantity_value := nullif(item_payload ->> 'quantity', '')::numeric;
    quantity_value := quantity_value::numeric(14, 3);
    fulfillment_mode_value := coalesce(
      nullif(lower(btrim(item_payload ->> 'fulfillment_mode')), ''),
      case (
        select item.product_type
        from public.purchase_order_items item
        where item.organization_id = organization_id
          and item.purchase_order_id = order_id
          and item.id = (item_payload ->> 'purchase_order_item_id')::uuid
      ) when 'good' then 'physical' when 'service' then 'administrative' end
    );

    select * into item_row
    from public.purchase_order_items item
    where item.id = (item_payload ->> 'purchase_order_item_id')::uuid
      and item.organization_id = organization_id
      and item.purchase_order_id = order_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_ORDER_ITEM_INVALID';
    end if;
    if item_row.product_type is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_PRODUCT_TYPE_UNKNOWN';
    end if;
    if item_row.expiration_control is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_EXPIRATION_CONTROL_UNKNOWN';
    end if;

    -- La existencia y el tenant del producto siguen siendo obligatorios;
    -- active/product_type/configuracion ya no redefinen una linea emitida.
    perform 1
    from public.products product
    where product.id = item_row.product_id
      and product.organization_id = organization_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE';
    end if;

    if fulfillment_mode_value = 'physical' then
      lot_value := nullif(btrim(item_payload ->> 'lot'), '');
      expiration_value := nullif(item_payload ->> 'expiration_date', '')::date;
      location_id_value := nullif(item_payload ->> 'location_id', '')::uuid;
      if quantity_value is null or quantity_value <= 0 then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_QUANTITY_INVALID';
      end if;
      if item_row.batch_control and lot_value is null then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_LOT_REQUIRED';
      end if;
      if item_row.expiration_control and expiration_value is null then
        raise exception using errcode = '22023', message = 'PURCHASE_ORDER_EXPIRATION_REQUIRED';
      end if;
      perform 1
      from public.warehouse_locations location
      where location.id = location_id_value
        and location.organization_id = organization_id
        and location.warehouse_id = warehouse_row.id
        and location.is_active;
      if not found then
        raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_LOCATION_INVALID';
      end if;
    end if;

    select coalesce(sum(receipt_item.quantity), 0) into already_received
    from public.purchase_receipt_items receipt_item
    where receipt_item.organization_id = organization_id
      and receipt_item.purchase_order_item_id = item_row.id;
    select coalesce(sum((prior.value ->> 'quantity')::numeric), 0) into payload_received
    from jsonb_array_elements(canonical_items) with ordinality prior(value, position)
    where (prior.value ->> 'purchase_order_item_id')::uuid = item_row.id;
    if already_received + payload_received > item_row.quantity then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_EXCEEDS_ORDERED_QUANTITY';
    end if;
    item_count := item_count + 1;
    if fulfillment_mode_value = 'physical' then
      physical_item_count := physical_item_count + 1;
      physical_quantity := physical_quantity + quantity_value;
    else
      administrative_item_count := administrative_item_count + 1;
      administrative_quantity := administrative_quantity + quantity_value;
    end if;
  end loop;

  insert into public.purchase_receipts (
    organization_id, purchase_order_id, warehouse_id, operation_key,
    operation_payload_hash, received_by, notes
  ) values (
    organization_id, order_id, warehouse_row.id, idempotency_key,
    request_payload_hash, actor_id, notes_value
  ) returning id into receipt_id;

  for item_payload in select value from jsonb_array_elements(payload -> 'items')
  loop
    select * into item_row
    from public.purchase_order_items item
    where item.id = (item_payload ->> 'purchase_order_item_id')::uuid
      and item.organization_id = organization_id
      and item.purchase_order_id = order_id;
    quantity_value := (item_payload ->> 'quantity')::numeric::numeric(14, 3);
    fulfillment_mode_value := coalesce(
      nullif(lower(btrim(item_payload ->> 'fulfillment_mode')), ''),
      case item_row.product_type when 'good' then 'physical' when 'service' then 'administrative' end
    );
    lot_value := case when fulfillment_mode_value = 'physical' then nullif(btrim(item_payload ->> 'lot'), '') end;
    expiration_value := case when fulfillment_mode_value = 'physical' then nullif(item_payload ->> 'expiration_date', '')::date end;
    location_id_value := case when fulfillment_mode_value = 'physical'
      then nullif(item_payload ->> 'location_id', '')::uuid end;

    insert into public.purchase_receipt_items (
      organization_id, receipt_id, purchase_order_item_id, product_id,
      warehouse_id, location_id, quantity, unit_cost, lot, expiration_date,
      fulfillment_mode
    ) values (
      organization_id, receipt_id, item_row.id, item_row.product_id,
      case when fulfillment_mode_value = 'physical' then warehouse_row.id else null end,
      location_id_value, quantity_value, item_row.unit_cost, lot_value,
      expiration_value, fulfillment_mode_value
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
    where item.organization_id = organization_id
      and item.purchase_order_id = order_id
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
exception
  when unique_violation then
    if idempotency_key is not null then
      select * into existing_receipt
      from public.purchase_receipts receipt
      where receipt.organization_id = organization_id
        and receipt.operation_key = idempotency_key
      for update;
      if found then
        if existing_receipt.purchase_order_id is distinct from order_id then
          raise exception using errcode = '23505', message = 'PURCHASE_RECEIPT_KEY_CONFLICT';
        end if;
        if existing_receipt.operation_payload_hash is null then
          raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_IDEMPOTENCY_LEGACY_UNVERIFIABLE';
        end if;
        if existing_receipt.operation_payload_hash is distinct from request_payload_hash then
          raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT';
        end if;
        return existing_receipt.id;
      end if;
    end if;
    raise;
end;
$$;

revoke all on function public.receive_purchase_order_partial(jsonb)
from public, anon, authenticated;
grant execute on function public.receive_purchase_order_partial(jsonb) to authenticated;

commit;
