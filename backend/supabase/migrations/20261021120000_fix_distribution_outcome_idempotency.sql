-- Complete idempotency identity for distribution delivery outcomes.
-- Existing rows contain the business payload; outcome lines are reconstructed
-- at their persisted numeric(14,3) precision. No historical data is rewritten.

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
  requested_lines_canonical jsonb := '[]'::jsonb;
  existing_lines_canonical jsonb := '[]'::jsonb;
  existing_outcome public.distribution_delivery_outcomes%rowtype;
  violated_constraint text;
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
  else
    if jsonb_array_length(lines_value) > 0 or incidence_count = 0 then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_REJECTION_INVALID';
    end if;
  end if;

  -- Persisted quantities use numeric(14,3). Canonicalize UUIDs and that
  -- storage precision, and sort by order line because array order has no
  -- business meaning for a delivery result.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'orderLineId', canonical.order_line_id,
        'cantidad', canonical.quantity
      )
      order by canonical.order_line_id
    ),
    '[]'::jsonb
  )
  into requested_lines_canonical
  from (
    select (entry.value ->> 'orderLineId')::uuid as order_line_id,
      (entry.value ->> 'cantidad')::numeric(14,3) as quantity
    from jsonb_array_elements(lines_value) as entry(value)
  ) canonical;

  -- Serialize retries by organization and key before reading the outcome or
  -- locking a delivery. The namespace is separate from schedule commands.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    requested_organization_id::text || ':distribution-outcome-operation:' || requested_operation_key::text,
    0
  ));

  select outcome.* into existing_outcome
  from public.distribution_delivery_outcomes outcome
  where outcome.organization_id = requested_organization_id
    and outcome.operation_key = requested_operation_key;
  if found then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'orderLineId', outcome_line.order_line_id,
          'cantidad', outcome_line.quantity_delivered
        )
        order by outcome_line.order_line_id
      ),
      '[]'::jsonb
    )
    into existing_lines_canonical
    from public.distribution_delivery_outcome_lines outcome_line
    where outcome_line.organization_id = existing_outcome.organization_id
      and outcome_line.outcome_id = existing_outcome.id;

    if existing_outcome.organization_id is distinct from requested_organization_id
      or existing_outcome.operation_key is distinct from requested_operation_key
      or existing_outcome.delivery_id is distinct from requested_delivery_id
      or existing_outcome.result_status is distinct from outcome_status
      or existing_outcome.failure_category is distinct from failure_category_value
      or existing_outcome.occurred_on is distinct from outcome_date
      or existing_outcome.evidence is distinct from evidence_text
      or existing_outcome.incidents is distinct from incidents_value
      or existing_lines_canonical is distinct from requested_lines_canonical then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED';
    end if;
    return existing_outcome.id;
  end if;

  perform public.lock_distribution_delivery_version(
    requested_organization_id, requested_delivery_id, expected_lock_version
  );

  select delivery.* into parent_row
  from public.distribution_deliveries delivery
  where delivery.organization_id = requested_organization_id
    and delivery.id = requested_delivery_id;

  -- Keep the save_distribution_delivery lock order (delivery, then order).
  -- Acquiring the order lock before status triggers prevents concurrent
  -- outcomes for separate deliveries from upgrading shared order locks at once.
  perform 1
  from public.orders order_data
  where order_data.organization_id = requested_organization_id
    and order_data.id = parent_row.order_id
  for update;

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

  if outcome_status in ('entregado', 'entrega_parcial') then
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
    from jsonb_to_recordset(requested_lines_canonical) as entry("orderLineId" uuid, cantidad numeric)
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
    get stacked diagnostics violated_constraint = constraint_name;

    if violated_constraint = 'distribution_delivery_outcomes_operation_key' then
      select outcome.* into existing_outcome
      from public.distribution_delivery_outcomes outcome
      where outcome.organization_id = requested_organization_id
        and outcome.operation_key = requested_operation_key;

      if found then
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'orderLineId', outcome_line.order_line_id,
              'cantidad', outcome_line.quantity_delivered
            )
            order by outcome_line.order_line_id
          ),
          '[]'::jsonb
        )
        into existing_lines_canonical
        from public.distribution_delivery_outcome_lines outcome_line
        where outcome_line.organization_id = existing_outcome.organization_id
          and outcome_line.outcome_id = existing_outcome.id;

        if existing_outcome.organization_id is distinct from requested_organization_id
          or existing_outcome.operation_key is distinct from requested_operation_key
          or existing_outcome.delivery_id is distinct from requested_delivery_id
          or existing_outcome.result_status is distinct from outcome_status
          or existing_outcome.failure_category is distinct from failure_category_value
          or existing_outcome.occurred_on is distinct from outcome_date
          or existing_outcome.evidence is distinct from evidence_text
          or existing_outcome.incidents is distinct from incidents_value
          or existing_lines_canonical is distinct from requested_lines_canonical then
          raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED';
        end if;
        return existing_outcome.id;
      end if;
    end if;

    -- Preserve unrelated uniqueness failures from lines, audit, and other tables.
    raise;
end;
$$;

revoke all on function public.record_distribution_delivery_outcome(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_distribution_delivery_outcome(jsonb) to authenticated;

comment on function public.record_distribution_delivery_outcome(jsonb) is
  'Records delivery results against this shipment''s allocated quantities while the order fulfillment projection aggregates all shipments.';
