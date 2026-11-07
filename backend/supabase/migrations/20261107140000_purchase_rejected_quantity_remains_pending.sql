-- Mantiene pendiente la cantidad rechazada hasta que se acepte un reemplazo.
-- No registra créditos ni reembolsos; el saldo puede cerrarse explícitamente con close_purchase_order.
begin;

create or replace function public.receive_purchase_order_partial_inspected(payload jsonb)
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
  inspection_id uuid;
  inspection_payload jsonb;
  canonical_item jsonb;
  canonical_inspection jsonb;
  canonical_findings jsonb;
  finding_payload jsonb;
  reason_code_value text;
  reason_text_value text;
  quantity_value numeric;
  inspected_quantity_value numeric;
  accepted_quantity_value numeric;
  rejected_quantity_value numeric;
  finding_quantity_value numeric;
  findings_total numeric;
  lot_value text;
  expiration_value date;
  fulfillment_mode_value text;
  location_id_value uuid;
  already_received numeric;
  payload_received numeric;
  item_count integer := 0;
  physical_item_count integer := 0;
  administrative_item_count integer := 0;
  inspected_item_count integer := 0;
  physical_quantity numeric := 0;
  physical_accepted_quantity numeric := 0;
  physical_rejected_quantity numeric := 0;
  administrative_quantity numeric := 0;
  completed boolean;
  notes_value text;
  observation_value text;
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
    or not public.has_organization_permission(organization_id, 'PURCHASES_RECEIVE')
  then
    raise exception using errcode = '42501', message = 'PURCHASE_RECEIPT_FORBIDDEN';
  end if;
  if payload ? 'items'
    and payload -> 'items' <> 'null'::jsonb
    and jsonb_typeof(payload -> 'items') <> 'array'
  then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_ITEMS_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text || ':purchase-receipt-operation:' || idempotency_key::text,
    0
  ));

  select *
  into existing_receipt
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

  select *
  into order_row
  from public.purchase_orders purchase
  where purchase.id = order_id
    and purchase.organization_id = organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;

  items_input := case
    when payload -> 'items' is null or payload -> 'items' = 'null'::jsonb then '[]'::jsonb
    else payload -> 'items'
  end;
  notes_value := nullif(btrim(coalesce(payload ->> 'notes', '')), '');

  -- Primera pasada: canoniza y valida tambien la inspeccion para que el hash
  -- de idempotencia cubra cantidades y motivos.
  for item_payload in select value from jsonb_array_elements(items_input)
  loop
    select *
    into item_row
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

    quantity_value := nullif(item_payload ->> 'quantity', '')::numeric::numeric(14, 3);
    if quantity_value is null or quantity_value <= 0 then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_QUANTITY_INVALID';
    end if;

    fulfillment_mode_value := coalesce(
      nullif(lower(btrim(item_payload ->> 'fulfillment_mode')), ''),
      case item_row.product_type when 'good' then 'physical' when 'service' then 'administrative' end
    );
    if fulfillment_mode_value not in ('physical', 'administrative') then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_FULFILLMENT_MODE_INVALID';
    end if;
    if (item_row.product_type = 'good' and fulfillment_mode_value <> 'physical')
      or (item_row.product_type = 'service' and fulfillment_mode_value <> 'administrative')
    then
      raise exception using errcode = 'P0001',
        message = case when item_row.product_type = 'good'
          then 'PURCHASE_RECEIPT_GOOD_ADMINISTRATIVE_FORBIDDEN'
          else 'PURCHASE_RECEIPT_SERVICE_PHYSICAL_FORBIDDEN' end;
    end if;

    canonical_item := jsonb_build_object(
      'purchase_order_item_id', item_row.id,
      'quantity', public.normalize_commercial_idempotency_numeric(quantity_value),
      'fulfillment_mode', fulfillment_mode_value,
      'location_id', case when fulfillment_mode_value = 'physical'
        then nullif(item_payload ->> 'location_id', '')::uuid else null end,
      'lot', case when fulfillment_mode_value = 'physical'
        then nullif(btrim(item_payload ->> 'lot'), '') else null end,
      'expiration_date', case when fulfillment_mode_value = 'physical'
        then nullif(item_payload ->> 'expiration_date', '')::date else null end
    );

    if fulfillment_mode_value = 'physical'
      and item_payload ? 'inspection'
      and item_payload -> 'inspection' <> 'null'::jsonb
    then
      inspection_payload := item_payload -> 'inspection';
      if jsonb_typeof(inspection_payload) <> 'object' then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_INVALID';
      end if;
      inspected_quantity_value := nullif(inspection_payload ->> 'inspected_quantity', '')::numeric::numeric(14, 3);
      accepted_quantity_value := nullif(inspection_payload ->> 'accepted_quantity', '')::numeric::numeric(14, 3);
      rejected_quantity_value := coalesce(nullif(inspection_payload ->> 'rejected_quantity', '')::numeric, 0)::numeric(14, 3);
      if inspected_quantity_value is null
        or accepted_quantity_value is null
        or inspected_quantity_value <> quantity_value
        or accepted_quantity_value < 0
        or rejected_quantity_value < 0
        or inspected_quantity_value <> accepted_quantity_value + rejected_quantity_value
      then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_QUANTITY_INVALID';
      end if;

      canonical_findings := '[]'::jsonb;
      findings_total := 0;
      if inspection_payload ? 'findings'
        and inspection_payload -> 'findings' <> 'null'::jsonb
      then
        if jsonb_typeof(inspection_payload -> 'findings') <> 'array' then
          raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASONS_INVALID';
        end if;
        for finding_payload in select value from jsonb_array_elements(inspection_payload -> 'findings')
        loop
          reason_code_value := lower(nullif(btrim(finding_payload ->> 'reason_code'), ''));
          reason_text_value := nullif(btrim(finding_payload ->> 'reason_text'), '');
          finding_quantity_value := nullif(finding_payload ->> 'quantity', '')::numeric::numeric(14, 3);
          if reason_code_value not in ('quality', 'documentation', 'quantity_mismatch', 'other')
            or finding_quantity_value is null
            or finding_quantity_value <= 0
            or (reason_code_value = 'other' and (reason_text_value is null or char_length(reason_text_value) < 3))
          then
            raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASON_INVALID';
          end if;
          findings_total := findings_total + finding_quantity_value;
          canonical_findings := canonical_findings || jsonb_build_array(jsonb_build_object(
            'reason_code', reason_code_value,
            'reason_text', reason_text_value,
            'quantity', public.normalize_commercial_idempotency_numeric(finding_quantity_value)
          ));
        end loop;
      end if;
      if findings_total <> rejected_quantity_value then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASONS_TOTAL_MISMATCH';
      end if;
      select coalesce(jsonb_agg(item order by
          item ->> 'reason_code',
          coalesce(item ->> 'reason_text', ''),
          item ->> 'quantity'
        ), '[]'::jsonb)
      into canonical_findings
      from jsonb_array_elements(canonical_findings) as elements(item);

      observation_value := nullif(btrim(coalesce(inspection_payload ->> 'observation', '')), '');
      if observation_value is not null and char_length(observation_value) > 600 then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_OBSERVATION_INVALID';
      end if;
      canonical_inspection := jsonb_build_object(
        'inspected_quantity', public.normalize_commercial_idempotency_numeric(inspected_quantity_value),
        'accepted_quantity', public.normalize_commercial_idempotency_numeric(accepted_quantity_value),
        'rejected_quantity', public.normalize_commercial_idempotency_numeric(rejected_quantity_value),
        'observation', observation_value,
        'findings', canonical_findings
      );
      canonical_item := canonical_item || jsonb_build_object('inspection', canonical_inspection);
    elsif fulfillment_mode_value = 'administrative'
      and item_payload ? 'inspection'
      and item_payload -> 'inspection' <> 'null'::jsonb
    then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_SERVICE_FORBIDDEN';
    end if;

    canonical_items := canonical_items || jsonb_build_array(canonical_item);
  end loop;

  select coalesce(jsonb_agg(item order by
      item ->> 'purchase_order_item_id',
      item ->> 'fulfillment_mode',
      coalesce(item ->> 'location_id', ''),
      coalesce(item ->> 'lot', ''),
      coalesce(item ->> 'expiration_date', ''),
      item ->> 'quantity',
      coalesce(item -> 'inspection' ->> 'accepted_quantity', '')
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
    or jsonb_array_length(payload -> 'items') = 0
  then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_ITEMS_REQUIRED';
  end if;

  select *
  into warehouse_row
  from public.warehouses warehouse
  where warehouse.id = order_row.warehouse_id
    and warehouse.organization_id = organization_id
    and warehouse.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE';
  end if;

  -- Segunda pasada: valida snapshots, saldo y ubicacion antes de escribir.
  for item_payload in select value from jsonb_array_elements(payload -> 'items')
  loop
    quantity_value := nullif(item_payload ->> 'quantity', '')::numeric::numeric(14, 3);
    fulfillment_mode_value := nullif(lower(btrim(item_payload ->> 'fulfillment_mode')), '');
    select *
    into item_row
    from public.purchase_order_items item
    where item.organization_id = organization_id
      and item.purchase_order_id = order_id
      and item.id = (item_payload ->> 'purchase_order_item_id')::uuid;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_ORDER_ITEM_INVALID';
    end if;
    fulfillment_mode_value := coalesce(
      fulfillment_mode_value,
      case item_row.product_type when 'good' then 'physical' when 'service' then 'administrative' end
    );
    if item_row.product_type is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_PRODUCT_TYPE_UNKNOWN';
    end if;
    if item_row.expiration_control is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_EXPIRATION_CONTROL_UNKNOWN';
    end if;

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
    else
      lot_value := null;
      expiration_value := null;
      location_id_value := null;
    end if;

    -- El saldo se consume con unidades aceptadas, no con lo físicamente inspeccionado.
    -- Así un rechazo queda pendiente para reposición sin falsear el cierre.
    select coalesce(sum(coalesce(active_inspection.accepted_quantity, receipt_item.quantity)), 0)
    into already_received
    from public.purchase_receipt_items receipt_item
    left join lateral (
      select inspection.accepted_quantity
      from public.purchase_receipt_inspections inspection
      where inspection.organization_id = organization_id
        and inspection.purchase_receipt_item_id = receipt_item.id
        and inspection.status = 'completed'
      order by inspection.completed_at desc, inspection.id desc
      limit 1
    ) active_inspection on true
    where receipt_item.organization_id = organization_id
      and receipt_item.purchase_order_item_id = item_row.id;
    select coalesce(sum(
      case
        when prior.value -> 'inspection' is not null
          and prior.value -> 'inspection' <> 'null'::jsonb
          then (prior.value -> 'inspection' ->> 'accepted_quantity')::numeric
        else (prior.value ->> 'quantity')::numeric
      end
    ), 0)
    into payload_received
    from jsonb_array_elements(canonical_items) with ordinality prior(value, position)
    where (prior.value ->> 'purchase_order_item_id')::uuid = item_row.id;
    if already_received + payload_received > item_row.quantity then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_EXCEEDS_ORDERED_QUANTITY';
    end if;
  end loop;

  insert into public.purchase_receipts (
    organization_id, purchase_order_id, warehouse_id, operation_key,
    operation_payload_hash, received_by, notes
  ) values (
    organization_id, order_id, warehouse_row.id, idempotency_key,
    request_payload_hash, actor_id, notes_value
  )
  returning id into receipt_id;

  for item_payload in select value from jsonb_array_elements(payload -> 'items')
  loop
    select *
    into item_row
    from public.purchase_order_items item
    where item.organization_id = organization_id
      and item.purchase_order_id = order_id
      and item.id = (item_payload ->> 'purchase_order_item_id')::uuid;

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
    )
    returning id into receipt_item_id;

    inspection_payload := item_payload -> 'inspection';
    if fulfillment_mode_value = 'physical'
      and inspection_payload is not null
      and jsonb_typeof(inspection_payload) = 'object'
    then
      inspected_quantity_value := (inspection_payload ->> 'inspected_quantity')::numeric::numeric(14, 3);
      accepted_quantity_value := (inspection_payload ->> 'accepted_quantity')::numeric::numeric(14, 3);
      rejected_quantity_value := coalesce((inspection_payload ->> 'rejected_quantity')::numeric, 0)::numeric(14, 3);
      observation_value := nullif(btrim(coalesce(inspection_payload ->> 'observation', '')), '');

      insert into public.purchase_receipt_inspections (
        organization_id, purchase_receipt_id, purchase_receipt_item_id,
        purchase_order_id, purchase_order_item_id, supplier_id, product_id,
        inspected_quantity, accepted_quantity, rejected_quantity, status,
        observation, operation_key, operation_payload_hash, inspected_by
      ) values (
        organization_id, receipt_id, receipt_item_id,
        order_id, item_row.id, order_row.supplier_id, item_row.product_id,
        inspected_quantity_value, accepted_quantity_value, rejected_quantity_value,
        'completed', observation_value, idempotency_key,
        encode(extensions.digest(inspection_payload::text, 'sha256'), 'hex'),
        actor_id
      )
      returning id into inspection_id;

      for finding_payload in select value from jsonb_array_elements(inspection_payload -> 'findings')
      loop
        insert into public.purchase_receipt_inspection_reasons (
          organization_id, inspection_id, reason_code, reason_text, quantity
        ) values (
          organization_id,
          inspection_id,
          lower(nullif(btrim(finding_payload ->> 'reason_code'), '')),
          nullif(btrim(finding_payload ->> 'reason_text'), ''),
          (finding_payload ->> 'quantity')::numeric::numeric(14, 3)
        );
      end loop;
      insert into public.audit_events (
        organization_id, actor_user_id, action, entity_type, entity_id,
        new_values, metadata
      ) values (
        organization_id,
        actor_id,
        'PURCHASE_RECEIPT_INSPECTION_COMPLETED',
        'purchase_receipt_inspection',
        inspection_id::text,
        jsonb_build_object(
          'purchase_receipt_item_id', receipt_item_id,
          'inspected_quantity', inspected_quantity_value,
          'accepted_quantity', accepted_quantity_value,
          'rejected_quantity', rejected_quantity_value,
          'lot', lot_value,
          'expiration_date', expiration_value
        ),
        jsonb_build_object('operation_key', idempotency_key)
      );
      inspected_item_count := inspected_item_count + 1;
      physical_accepted_quantity := physical_accepted_quantity + accepted_quantity_value;
      physical_rejected_quantity := physical_rejected_quantity + rejected_quantity_value;
    else
      accepted_quantity_value := quantity_value;
    end if;

    item_count := item_count + 1;
    if fulfillment_mode_value = 'physical' then
      physical_item_count := physical_item_count + 1;
      physical_quantity := physical_quantity + quantity_value;
      if accepted_quantity_value > 0 then
        insert into public.inventory_movements (
          organization_id, product_id, product_code, product_description,
          unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
          location_id, stock_status, unit_cost, lot, expiration_date,
          operation_date, reason, source_type, source_id, created_by
        ) values (
          organization_id, item_row.product_id, item_row.product_code,
          item_row.product_description, item_row.unit_of_measure, 'entrada',
          accepted_quantity_value, warehouse_row.name, warehouse_row.id,
          location_id_value, 'available', item_row.unit_cost, lot_value,
          expiration_value, current_date,
          left('Recepcion aceptada de ' || order_row.document_type || ' ' ||
            order_row.series || '-' || order_row.document_number, 180),
          'purchase-receipt', receipt_item_id, actor_id
        );
      end if;
    else
      administrative_item_count := administrative_item_count + 1;
      administrative_quantity := administrative_quantity + quantity_value;
    end if;
  end loop;

  select not exists (
    select 1
    from public.purchase_order_items item
    left join lateral (
      select coalesce(sum(coalesce(active_inspection.accepted_quantity, receipt_item.quantity)), 0) quantity
      from public.purchase_receipt_items receipt_item
      left join lateral (
        select inspection.accepted_quantity
        from public.purchase_receipt_inspections inspection
        where inspection.organization_id = organization_id
          and inspection.purchase_receipt_item_id = receipt_item.id
          and inspection.status = 'completed'
        order by inspection.completed_at desc, inspection.id desc
        limit 1
      ) active_inspection on true
      where receipt_item.organization_id = organization_id
        and receipt_item.purchase_order_item_id = item.id
    ) received on true
    where item.organization_id = organization_id
      and item.purchase_order_id = order_id
      and received.quantity < item.quantity
  )
  into completed;

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
      'physical_accepted_quantity', physical_accepted_quantity,
      'physical_rejected_quantity', physical_rejected_quantity,
      'inspected_items', inspected_item_count,
      'administrative_items', administrative_item_count,
      'administrative_quantity', administrative_quantity,
      'operation_key', idempotency_key
    )
  );
  return receipt_id;
exception
  when unique_violation then
    if idempotency_key is not null then
      select *
      into existing_receipt
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

revoke all on function public.receive_purchase_order_partial_inspected(jsonb)
from public, anon, authenticated;
grant execute on function public.receive_purchase_order_partial_inspected(jsonb)
to authenticated;

comment on function public.receive_purchase_order_partial_inspected(jsonb) is
  'Registra recepciones inspeccionadas; solo cantidades aceptadas satisfacen la orden y el rechazo queda pendiente para reposición.';

commit;
