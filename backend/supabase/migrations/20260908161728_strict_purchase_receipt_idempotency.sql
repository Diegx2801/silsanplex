-- A3: idempotencia estricta para recepciones de compras.
-- La clave sigue siendo unica por organizacion; el hash distingue retries
-- equivalentes de reutilizaciones incompatibles de la misma operation_key.

begin;

alter table public.purchase_receipts
  add column if not exists operation_payload_hash text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.purchase_receipts'::regclass
      and conname = 'purchase_receipts_operation_payload_hash_format'
  ) then
    alter table public.purchase_receipts
      add constraint purchase_receipts_operation_payload_hash_format
      check (
        operation_payload_hash is null
        or operation_payload_hash ~ '^[0-9a-f]{64}$'
      );
  end if;
end;
$$;

comment on column public.purchase_receipts.operation_payload_hash is
  'SHA-256 hexadecimal del payload funcional canonico de la recepcion; NULL solo para historicos previos a A3.';

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

  -- La clave se serializa antes de leer la recepcion. La restriccion UNIQUE
  -- permanece como defensa final frente a callers que no tomen este lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text || ':purchase-receipt-operation:' || idempotency_key::text,
    0
  ));

  -- Primero se identifica una recepcion previa. Esto permite que un retry
  -- exacto siga devolviendo su resultado aunque la orden ya este recibida.
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

  -- El lock de orden se toma despues del lock de operation_key. Asi las
  -- claves distintas mantienen el control de saldo y las claves iguales
  -- convergen antes de intentar insertar otra cabecera.
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

  -- Canonicalizacion funcional. Para retries se permite incluso un array
  -- vacio para poder compararlo y devolver conflicto, en vez de aceptarlo.
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
    and warehouse.organization_id = organization_id and warehouse.is_active;
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
      and item.organization_id = organization_id and item.purchase_order_id = order_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_ORDER_ITEM_INVALID';
    end if;

    select * into product_row
    from public.products product
    where product.id = item_row.product_id
      and product.organization_id = organization_id and product.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE';
    end if;
    if item_row.product_type = 'good' and product_row.product_type <> 'good' then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_TYPE_CHANGED';
    end if;

    if fulfillment_mode_value = 'physical' then
      lot_value := nullif(btrim(item_payload ->> 'lot'), '');
      expiration_value := nullif(item_payload ->> 'expiration_date', '')::date;
      location_id_value := nullif(item_payload ->> 'location_id', '')::uuid;
      if quantity_value is null or quantity_value <= 0 then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_QUANTITY_INVALID';
      end if;
      if product_row.batch_control and lot_value is null then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_LOT_REQUIRED';
      end if;
      if product_row.expiration_control and expiration_value is null then
        raise exception using errcode = '22023', message = 'PURCHASE_ORDER_EXPIRATION_REQUIRED';
      end if;
      perform 1
      from public.warehouse_locations location
      where location.id = location_id_value
        and location.organization_id = organization_id
        and location.warehouse_id = warehouse_row.id and location.is_active;
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
      and item.organization_id = organization_id and item.purchase_order_id = order_id;
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
exception
  when unique_violation then
    -- La constraint UNIQUE es la defensa final para callers que no hayan
    -- tomado el advisory lock. La carrera se convierte en el mismo contrato
    -- de retry/conflicto, nunca en un 23505 visible.
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
