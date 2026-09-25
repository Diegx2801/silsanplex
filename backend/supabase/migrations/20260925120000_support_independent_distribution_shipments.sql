-- Each distribution record is a shipment, not an order-wide delivery plan.
-- Keep allocations normalized so every shipment has its own quantities,
-- destination, guide, status, and outcome history.

drop index if exists public.distribution_deliveries_organization_order_unique;

create table public.distribution_delivery_items (
  organization_id uuid not null,
  delivery_id uuid not null,
  order_id uuid not null,
  order_line_id uuid not null,
  quantity numeric(14,3) not null,
  created_at timestamptz not null default now(),

  constraint distribution_delivery_items_pkey
    primary key (organization_id, delivery_id, order_line_id),
  constraint distribution_delivery_items_delivery_same_org
    foreign key (organization_id, delivery_id)
    references public.distribution_deliveries (organization_id, id) on delete restrict,
  constraint distribution_delivery_items_order_line_same_org
    foreign key (organization_id, order_id, order_line_id)
    references public.order_items (organization_id, order_id, id) on delete restrict,
  constraint distribution_delivery_items_quantity_positive
    check (quantity > 0)
);

create index distribution_delivery_items_order_line_idx
  on public.distribution_delivery_items (organization_id, order_id, order_line_id);

-- Preserve existing shipment contents when moving from the historical JSON
-- snapshot to the normalized allocation table. Invalid/unlinked legacy lines
-- are intentionally not guessed or attached to a different order line.
insert into public.distribution_delivery_items (
  organization_id, delivery_id, order_id, order_line_id, quantity
)
select delivery.organization_id, delivery.id, delivery.order_id, item.id,
  least(snapshot.quantity, item.quantity)
from public.distribution_deliveries delivery
cross join lateral jsonb_array_elements(delivery.order_items) as entry(value)
cross join lateral (
  select case
    when entry.value ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (entry.value ->> 'id')::uuid
    else null
  end as order_line_id,
  case
    when jsonb_typeof(entry.value -> 'cantidad') = 'number'
      then (entry.value ->> 'cantidad')::numeric
    else null
  end as quantity
) snapshot
join public.order_items item
  on item.organization_id = delivery.organization_id
 and item.order_id = delivery.order_id
 and item.id = snapshot.order_line_id
join public.products product
  on product.organization_id = item.organization_id
 and product.id = item.product_id
 and product.product_type = 'good'
where snapshot.quantity > 0
on conflict (organization_id, delivery_id, order_line_id) do nothing;

alter table public.distribution_delivery_items enable row level security;
revoke all on table public.distribution_delivery_items from anon, authenticated;
grant select on table public.distribution_delivery_items to authenticated;

create policy distribution_delivery_items_select_policy
  on public.distribution_delivery_items
  for select to authenticated
  using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));

comment on table public.distribution_delivery_items is
  'Immutable-in-route allocation of order goods to a specific distribution shipment; does not create inventory movements.';

create or replace function public.save_distribution_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_delivery_id uuid;
  target_order_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  requested_scheduled_date date;
  requested_delivery_status text;
  result_id uuid;
  current_delivery_order_id uuid;
  current_delivery_status text;
  current_quantity_reconciliation_required boolean;
  existing_allocations jsonb := '[]'::jsonb;
  normalized_allocations jsonb;
  requested_line_id uuid;
  requested_quantity numeric(14,3);
  dispatched_quantity numeric(16,3);
  allocated_quantity numeric(16,3);
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_delivery_id := nullif(payload ->> 'id', '')::uuid;
  target_order_id := nullif(payload ->> 'order_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  requested_scheduled_date := nullif(payload ->> 'scheduled_date', '')::date;
  requested_delivery_status := coalesce(nullif(btrim(payload ->> 'delivery_status'), ''), 'programado');

  if actor_id is null
    or target_organization_id is null
    or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  result_id := public.replay_distribution_command(
    target_organization_id, operation_key_value, 'save_distribution_delivery', payload
  );
  if result_id is not null then
    return result_id;
  end if;

  -- Use the delivery-then-order lock order for edits, matching outcome writes.
  -- New shipments serialize on the order row so two planners cannot allocate
  -- the same undistributed balance concurrently.
  if target_delivery_id is not null then
    expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
    perform public.lock_distribution_delivery_version(
      target_organization_id, target_delivery_id, expected_lock_version
    );
    select delivery.order_id, delivery.delivery_status,
      delivery.quantity_reconciliation_required
      into current_delivery_order_id, current_delivery_status,
        current_quantity_reconciliation_required
    from public.distribution_deliveries delivery
    where delivery.organization_id = target_organization_id
      and delivery.id = target_delivery_id;
    if current_delivery_order_id is distinct from target_order_id then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ORDER_MISMATCH';
    end if;
  end if;

  if target_order_id is not null then
    perform 1
    from public.orders order_data
    where order_data.organization_id = target_organization_id
      and order_data.id = target_order_id
    for update;
  end if;

  if target_delivery_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'order_line_id', item.order_line_id, 'quantity', item.quantity
    ) order by item.order_line_id), '[]'::jsonb)
    into existing_allocations
    from public.distribution_delivery_items item
    where item.organization_id = target_organization_id
      and item.delivery_id = target_delivery_id;
  end if;

  if target_delivery_id is not null and requested_scheduled_date is not null then
    update public.distribution_deliveries
    set scheduled_date = requested_scheduled_date,
        delivery_status = requested_delivery_status
    where organization_id = target_organization_id
      and id = target_delivery_id;
  end if;

  -- Delegate all canonical order, customer, sale, guide and workflow checks
  -- to the established persistence function. A later validation failure rolls
  -- this write back atomically.
  result_id := public.save_distribution_delivery_unchecked(payload);

  if jsonb_typeof(payload -> 'items') <> 'array' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEMS_INVALID';
  end if;
  if jsonb_array_length(payload -> 'items') = 0
    or jsonb_array_length(payload -> 'items') > 200 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEMS_INVALID';
  end if;

  select jsonb_agg(jsonb_build_object(
    'order_line_id', coalesce(entry.value ->> 'order_line_id', entry.value ->> 'id'),
    'quantity', coalesce(entry.value -> 'quantity', entry.value -> 'cantidad')
  ) order by coalesce(entry.value ->> 'order_line_id', entry.value ->> 'id'))
  into normalized_allocations
  from jsonb_array_elements(payload -> 'items') as entry(value);

  if exists (
    select 1
    from jsonb_array_elements(normalized_allocations) as entry(value)
    where coalesce(entry.value ->> 'order_line_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(entry.value -> 'quantity') is distinct from 'number'
      or (entry.value ->> 'quantity')::numeric <= 0
      or (entry.value ->> 'quantity')::numeric > 999999999
  ) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEM_QUANTITY_INVALID';
  end if;

  if (select count(*) from jsonb_array_elements(normalized_allocations)) <>
    (select count(distinct (entry.value ->> 'order_line_id')::uuid)
     from jsonb_array_elements(normalized_allocations) as entry(value)) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEMS_DUPLICATE_LINE';
  end if;

  if target_delivery_id is not null
    and (current_delivery_status not in ('programado', 'preparando', 'reprogramado')
      or current_quantity_reconciliation_required)
    and existing_allocations is distinct from normalized_allocations then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ALLOCATION_LOCKED';
  end if;

  for requested_line_id, requested_quantity in
    select (entry.value ->> 'order_line_id')::uuid,
      (entry.value ->> 'quantity')::numeric(14,3)
    from jsonb_array_elements(normalized_allocations) as entry(value)
  loop
    if not exists (
      select 1
      from public.order_items item
      join public.products product
        on product.organization_id = item.organization_id
       and product.id = item.product_id
       and product.product_type = 'good'
      where item.organization_id = target_organization_id
        and item.order_id = target_order_id
        and item.id = requested_line_id
    ) then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ITEM_NOT_FOUND';
    end if;

    select coalesce(sum(reservation.quantity_consumed), 0)
      into dispatched_quantity
    from public.inventory_reservations reservation
    where reservation.organization_id = target_organization_id
      and reservation.source_type = 'order-item'
      and reservation.source_id = requested_line_id;

    select coalesce(sum(allocation.quantity), 0)
      into allocated_quantity
    from public.distribution_delivery_items allocation
    join public.distribution_deliveries delivery
      on delivery.organization_id = allocation.organization_id
     and delivery.id = allocation.delivery_id
    where allocation.organization_id = target_organization_id
      and allocation.order_id = target_order_id
      and allocation.order_line_id = requested_line_id
      and delivery.delivery_status <> 'cancelado'
      and delivery.id is distinct from target_delivery_id;

    if requested_quantity > dispatched_quantity - allocated_quantity then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ALLOCATION_EXCEEDS_DISPATCHED';
    end if;
  end loop;

  delete from public.distribution_delivery_items
  where organization_id = target_organization_id
    and delivery_id = result_id;

  insert into public.distribution_delivery_items (
    organization_id, delivery_id, order_id, order_line_id, quantity
  )
  select target_organization_id, result_id, target_order_id,
    (entry.value ->> 'order_line_id')::uuid,
    (entry.value ->> 'quantity')::numeric(14,3)
  from jsonb_array_elements(normalized_allocations) as entry(value);

  if existing_allocations is distinct from normalized_allocations then
    insert into public.audit_events (
      organization_id, actor_user_id, action, entity_type, entity_id,
      old_values, new_values, metadata
    ) values (
      target_organization_id, actor_id, 'DISTRIBUTION_ITEMS_ALLOCATED',
      'distribution_delivery', result_id::text,
      jsonb_build_object('items', existing_allocations),
      jsonb_build_object('items', normalized_allocations),
      jsonb_build_object('source', 'save_distribution_delivery')
    );
  end if;

  if target_delivery_id is not null then
    perform public.advance_distribution_delivery_version(target_organization_id, target_delivery_id);
  end if;

  if operation_key_value is not null then
    perform public.complete_distribution_command(
      target_organization_id, operation_key_value,
      'save_distribution_delivery', payload, result_id
    );
  end if;

  return result_id;
end;
$$;

revoke all on function public.save_distribution_delivery(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_distribution_delivery(jsonb) to authenticated;

create or replace function public.record_distribution_delivery_outcome(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  requested_organization_id uuid;
  requested_delivery_id uuid;
  requested_operation_key uuid;
  expected_lock_version bigint;
  outcome_id uuid;
  outcome_status text;
  failure_category_value text;
  outcome_date date;
  evidence_text text;
  incidents_value jsonb;
  lines_value jsonb;
  parent_row public.distribution_deliveries%rowtype;
  shipment_line record;
  requested_quantity numeric(14,3);
  new_quantity numeric(16,3) := 0;
  total_quantity numeric(16,3) := 0;
  delivered_quantity numeric(16,3) := 0;
  incidence_count integer;
  existing_failure_category text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_PAYLOAD_INVALID';
  end if;

  requested_organization_id := nullif(payload ->> 'organizationId', '')::uuid;
  requested_delivery_id := nullif(payload ->> 'entregaId', '')::uuid;
  requested_operation_key := nullif(payload ->> 'operationKey', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expectedLockVersion', '')::bigint;
  outcome_status := nullif(btrim(payload ->> 'resultado'), '');
  failure_category_value := nullif(btrim(payload ->> 'categoriaIncidencia'), '');
  outcome_date := nullif(payload ->> 'fecha', '')::date;
  evidence_text := btrim(coalesce(payload ->> 'evidencia', ''));
  incidents_value := coalesce(payload -> 'incidencias', '[]'::jsonb);
  lines_value := coalesce(payload -> 'lineas', '[]'::jsonb);

  if actor_id is null
    or requested_organization_id is null
    or not public.has_organization_permission(requested_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  -- Preserve the classified-attempt contract before validating the remaining
  -- command envelope; callers must be told why an uncompleted attempt failed.
  if outcome_status = 'rechazado' and failure_category_value is null then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_FAILURE_CATEGORY_REQUIRED';
  end if;
  if failure_category_value is not null and (
    outcome_status is distinct from 'rechazado'
    or failure_category_value not in (
      'cliente_ausente', 'direccion_no_ubicada', 'cliente_rechaza_recepcion',
      'restriccion_horaria_o_acceso', 'otro'
    )
  ) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_FAILURE_CATEGORY_INVALID';
  end if;

  if requested_delivery_id is null or requested_operation_key is null or expected_lock_version is null then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_PAYLOAD_REQUIRED';
  end if;

  select outcome.id, outcome.failure_category into outcome_id, existing_failure_category
  from public.distribution_delivery_outcomes outcome
  where outcome.organization_id = requested_organization_id
    and outcome.operation_key = requested_operation_key;
  if found then
    if existing_failure_category is distinct from failure_category_value then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED';
    end if;
    return outcome_id;
  end if;

  if outcome_status not in ('entregado', 'entrega_parcial', 'rechazado') then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_INVALID';
  end if;
  if outcome_date is null or outcome_date > pg_catalog.timezone('America/Lima', pg_catalog.now())::date then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_DATE_INVALID';
  end if;
  if jsonb_typeof(incidents_value) <> 'array' or jsonb_typeof(lines_value) <> 'array' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_LINES_INVALID';
  end if;
  if char_length(evidence_text) > 255 or jsonb_array_length(incidents_value) > 20 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_DATA_TOO_LONG';
  end if;
  if jsonb_array_length(lines_value) > 200 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_TOO_MANY_LINES';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(lines_value) as entry(value)
    where coalesce(entry.value ->> 'orderLineId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(entry.value -> 'cantidad') is distinct from 'number'
      or (entry.value ->> 'cantidad')::numeric <= 0
      or (entry.value ->> 'cantidad')::numeric > 999999999
  ) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_LINES_INVALID';
  end if;

  perform public.lock_distribution_delivery_version(
    requested_organization_id, requested_delivery_id, expected_lock_version
  );

  select delivery.* into parent_row
  from public.distribution_deliveries delivery
  where delivery.organization_id = requested_organization_id
    and delivery.id = requested_delivery_id;

  if parent_row.delivery_status not in ('en_curso', 'en_destino', 'entrega_parcial') then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_STATE_INVALID';
  end if;
  if parent_row.tracking_status is distinct from 'en_destino' then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_NOT_AT_DESTINATION';
  end if;
  if parent_row.quantity_reconciliation_required then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_RECONCILIATION_REQUIRED';
  end if;
  if outcome_date < parent_row.issue_date then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_DATE_INVALID';
  end if;

  select count(*) into incidence_count
  from jsonb_array_elements(incidents_value) incidence
  where char_length(btrim(incidence #>> '{}')) > 0;

  if outcome_status in ('entregado', 'entrega_parcial') then
    if char_length(evidence_text) = 0 then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_EVIDENCE_REQUIRED';
    end if;
    if jsonb_array_length(lines_value) = 0 then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_LINES_REQUIRED';
    end if;
    if (select count(*) from jsonb_array_elements(lines_value)) <> (
      select count(distinct nullif(entry ->> 'orderLineId', '')::uuid)
      from jsonb_array_elements(lines_value) entry
    ) then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_DUPLICATE_LINE';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(lines_value) as entry(value)
      where not exists (
        select 1
        from public.distribution_delivery_items allocation
        where allocation.organization_id = requested_organization_id
          and allocation.delivery_id = requested_delivery_id
          and allocation.order_line_id = (entry.value ->> 'orderLineId')::uuid
      )
    ) then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_LINE_NOT_IN_SHIPMENT';
    end if;
  else
    if jsonb_array_length(lines_value) > 0 or incidence_count = 0 then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_REJECTION_INVALID';
    end if;
  end if;

  for shipment_line in
    select allocation.order_line_id as id, allocation.quantity,
      coalesce((
        select sum(outcome_line.quantity_delivered)
        from public.distribution_delivery_outcomes outcome
        join public.distribution_delivery_outcome_lines outcome_line
          on outcome_line.organization_id = outcome.organization_id
         and outcome_line.outcome_id = outcome.id
        where outcome.organization_id = allocation.organization_id
          and outcome.delivery_id = allocation.delivery_id
          and outcome_line.order_line_id = allocation.order_line_id
      ), 0) as already_delivered
    from public.distribution_delivery_items allocation
    where allocation.organization_id = requested_organization_id
      and allocation.delivery_id = requested_delivery_id
    order by allocation.order_line_id
  loop
    total_quantity := total_quantity + shipment_line.quantity;
    delivered_quantity := delivered_quantity + shipment_line.already_delivered;
    requested_quantity := coalesce((
      select sum((entry ->> 'cantidad')::numeric)
      from jsonb_array_elements(lines_value) entry
      where nullif(entry ->> 'orderLineId', '')::uuid = shipment_line.id
    ), 0);

    if requested_quantity < 0 or requested_quantity > 999999999
      or requested_quantity > shipment_line.quantity - shipment_line.already_delivered then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_QUANTITY_EXCEEDED';
    end if;

    new_quantity := new_quantity + requested_quantity;
  end loop;

  if total_quantity = 0 then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_GOODS_REQUIRED';
  end if;
  if outcome_status = 'entregado'
    and delivered_quantity + new_quantity <> total_quantity then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_TOTAL_INCOMPLETE';
  end if;
  if outcome_status = 'entrega_parcial'
    and (new_quantity <= 0 or delivered_quantity + new_quantity >= total_quantity) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_PARTIAL_INVALID';
  end if;
  if outcome_status = 'rechazado' and delivered_quantity >= total_quantity then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_ALREADY_COMPLETE';
  end if;

  insert into public.distribution_delivery_outcomes (
    organization_id, delivery_id, operation_key, result_status, failure_category,
    occurred_on, evidence, incidents, created_by
  ) values (
    requested_organization_id, requested_delivery_id, requested_operation_key,
    outcome_status, failure_category_value, outcome_date, evidence_text, incidents_value, actor_id
  ) returning id into outcome_id;

  if jsonb_array_length(lines_value) > 0 then
    insert into public.distribution_delivery_outcome_lines (
      organization_id, outcome_id, order_id, order_line_id, quantity_delivered
    )
    select requested_organization_id, outcome_id, parent_row.order_id,
      entry."orderLineId", entry.cantidad
    from jsonb_to_recordset(lines_value) as entry("orderLineId" uuid, cantidad numeric)
    where entry.cantidad > 0;
  end if;

  update public.distribution_deliveries
  set delivery_status = outcome_status,
      actual_delivery_date = case
        when outcome_status in ('entregado', 'entrega_parcial') then outcome_date
        else actual_delivery_date
      end,
      delivery_date = case
        when outcome_status in ('entregado', 'entrega_parcial') then outcome_date
        else delivery_date
      end,
      evidencia = case when evidence_text <> '' then evidence_text else evidencia end,
      incidencias = case
        when jsonb_array_length(incidents_value) > 0 then incidencias || incidents_value
        else incidencias
      end,
      last_outcome_id = outcome_id,
      updated_by = actor_id
  where organization_id = requested_organization_id
    and id = requested_delivery_id;

  perform public.advance_distribution_delivery_version(requested_organization_id, requested_delivery_id);

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    requested_organization_id, actor_id, 'DISTRIBUTION_OUTCOME_RECORDED',
    'distribution_delivery', requested_delivery_id::text,
    jsonb_build_object('delivery_status', parent_row.delivery_status, 'lock_version', expected_lock_version),
    jsonb_build_object('delivery_status', outcome_status, 'outcome_id', outcome_id),
    jsonb_build_object('result_status', outcome_status, 'occurred_on', outcome_date,
      'line_count', jsonb_array_length(lines_value), 'quantity_delivered', new_quantity)
  );

  return outcome_id;
exception
  when unique_violation then
    select outcome.id into outcome_id
    from public.distribution_delivery_outcomes outcome
    where outcome.organization_id = requested_organization_id
      and outcome.operation_key = requested_operation_key;
    if outcome_id is not null then return outcome_id; end if;
    raise exception using errcode = '23505', message = 'DISTRIBUTION_OUTCOME_DUPLICATE';
end;
$$;

revoke all on function public.record_distribution_delivery_outcome(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_distribution_delivery_outcome(jsonb) to authenticated;

comment on function public.record_distribution_delivery_outcome(jsonb) is
  'Records delivery results against this shipment''s allocated quantities while the order fulfillment projection aggregates all shipments.';
