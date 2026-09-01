-- Prevent technical work from invalidating an already approved test cycle.

begin;

create or replace function public.repair_status_transition_allowed(
  requested_from_status text,
  requested_to_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case requested_from_status
    when 'received' then requested_to_status in ('diagnosis', 'warranty', 'cancelled')
    when 'warranty' then requested_to_status in ('diagnosis', 'in_repair', 'cancelled')
    when 'diagnosis' then requested_to_status in (
      'quote_pending', 'waiting_customer_approval', 'in_repair', 'cancelled'
    )
    when 'quote_pending' then requested_to_status in (
      'diagnosis', 'waiting_customer_approval', 'cancelled'
    )
    when 'waiting_customer_approval' then requested_to_status in ('quote_approved', 'rejected', 'cancelled')
    when 'quote_approved' then requested_to_status in ('in_repair', 'cancelled')
    when 'in_repair' then requested_to_status in ('awaiting_parts', 'testing', 'cancelled')
    when 'awaiting_parts' then requested_to_status in ('in_repair', 'testing', 'cancelled')
    when 'testing' then requested_to_status in ('in_repair', 'ready_for_delivery', 'cancelled')
    when 'ready_for_delivery' then requested_to_status in ('in_repair', 'delivered', 'cancelled')
    else false
  end;
$$;

create or replace function public.record_repair_solution(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid;
  repair_id uuid;
  applied_solution_value text;
  repair_row public.repairs%rowtype;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;

  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  applied_solution_value := nullif(btrim(payload ->> 'applied_solution'), '');
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_CHANGE_STATUS');

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = organization_id
    and repair.id = repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_row.status in ('delivered', 'cancelled', 'rejected') then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_EDITABLE';
  end if;
  if repair_row.status in ('testing', 'ready_for_delivery') then
    raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICAL_CHANGE_REQUIRES_REWORK';
  end if;
  if applied_solution_value is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_APPLIED_SOLUTION_REQUIRED';
  end if;

  update public.repairs repair
  set applied_solution = applied_solution_value,
      updated_by = actor_id
  where repair.organization_id = organization_id
    and repair.id = repair_id;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'SOLUTION_RECORDED',
    repair_row.status,
    repair_row.status,
    actor_id,
    null,
    jsonb_build_object(
      'applied_solution_before', repair_row.applied_solution,
      'applied_solution_after', applied_solution_value
    ),
    'REPAIR_SOLUTION_RECORDED'
  );
end;
$$;

create or replace function public.consume_repair_part(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_part_id uuid := nullif(payload ->> 'repair_part_id', '')::uuid;
  quantity_value numeric := (payload ->> 'quantity')::numeric;
  operation_key_value uuid := nullif(payload ->> 'operation_key', '')::uuid;
  existing_consumption public.repair_part_consumptions%rowtype;
  repair_part_row public.repair_parts%rowtype;
  repair_row public.repairs%rowtype;
  product_row public.products%rowtype;
  warehouse_row public.warehouses%rowtype;
  bucket_state record;
  remaining_quantity numeric;
  movement_id uuid := gen_random_uuid();
  consumption_id uuid := gen_random_uuid();
  repair_reason text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_USE_PARTS');
  if repair_part_id is null or operation_key_value is null then
    raise exception using errcode = '22023', message = 'REPAIR_CONSUMPTION_KEYS_REQUIRED';
  end if;
  if quantity_value is null or quantity_value <= 0 then
    raise exception using errcode = '22023', message = 'REPAIR_CONSUMPTION_QUANTITY_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(organization_id::text || ':repair-operation:' || operation_key_value::text, 0)
  );
  select consumption.* into existing_consumption
  from public.repair_part_consumptions consumption
  where consumption.organization_id = organization_id and consumption.operation_key = operation_key_value
  for update;
  if found then
    if existing_consumption.repair_part_id is distinct from repair_part_id
      or existing_consumption.quantity <> quantity_value
    then
      raise exception using errcode = 'P0001', message = 'REPAIR_OPERATION_KEY_REUSED';
    end if;
    return existing_consumption.id;
  end if;

  select repair.* into repair_row
  from public.repairs repair
  join public.repair_parts part
    on part.organization_id = repair.organization_id and part.repair_id = repair.id
  where repair.organization_id = organization_id and part.id = repair_part_id
  for update of repair;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  select part.* into repair_part_row from public.repair_parts part
  where part.organization_id = organization_id and part.id = repair_part_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_PART_NOT_FOUND'; end if;
  if repair_row.status in ('testing', 'ready_for_delivery') then
    raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICAL_CHANGE_REQUIRES_REWORK';
  end if;
  if repair_row.status not in ('quote_approved', 'warranty', 'in_repair', 'awaiting_parts') then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_CONSUMPTION_STATE_INVALID';
  end if;
  if repair_part_row.status <> 'reserved' then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_NOT_CONSUMABLE';
  end if;
  if repair_part_row.stock_status <> 'available' then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_STOCK_NOT_ASSIGNABLE';
  end if;
  remaining_quantity := repair_part_row.quantity_requested - repair_part_row.quantity_consumed;
  if quantity_value > remaining_quantity then
    raise exception using errcode = 'P0001', message = 'REPAIR_CONSUMPTION_QUANTITY_EXCEEDED';
  end if;
  select product.* into product_row from public.products product
  where product.organization_id = organization_id
    and product.id = repair_part_row.product_id and product.is_active;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_PART_PRODUCT_UNAVAILABLE'; end if;
  if repair_part_row.batch_control_snapshot and repair_part_row.lot is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_LOT_REQUIRED';
  end if;
  if repair_part_row.expiration_control_snapshot and repair_part_row.expiration_date is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_EXPIRATION_REQUIRED';
  end if;
  if repair_part_row.expiration_date < current_date then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_EXPIRED';
  end if;

  perform public.lock_inventory_bucket(
    organization_id, repair_part_row.product_id, repair_part_row.warehouse_id,
    repair_part_row.location_id, repair_part_row.stock_status,
    repair_part_row.lot, repair_part_row.expiration_date
  );
  select * into bucket_state from public.inventory_bucket_state(
    organization_id, repair_part_row.product_id, repair_part_row.warehouse_id,
    repair_part_row.location_id, repair_part_row.stock_status,
    repair_part_row.lot, repair_part_row.expiration_date
  );
  select warehouse.* into warehouse_row from public.warehouses warehouse
  where warehouse.organization_id = organization_id and warehouse.id = repair_part_row.warehouse_id;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_PART_WAREHOUSE_UNAVAILABLE'; end if;
  repair_reason := 'Reparacion ' || repair_row.repair_code;

  perform set_config('app.repair_consumption_tracking_write', 'true', true);
  insert into public.inventory_movements (
    id, organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, source_type, source_id,
    reservation_id, created_by
  ) values (
    movement_id, organization_id, repair_part_row.product_id, product_row.code,
    product_row.description, product_row.unit_of_measure, 'salida', quantity_value,
    warehouse_row.name, repair_part_row.warehouse_id, repair_part_row.location_id,
    repair_part_row.stock_status, greatest(bucket_state.average_cost, 0), repair_part_row.lot,
    repair_part_row.expiration_date, current_date, repair_reason,
    'repair-consumption', consumption_id, repair_part_id, actor_id
  );
  perform set_config('app.repair_consumption_tracking_write', 'false', true);

  insert into public.repair_part_consumptions (
    id, organization_id, repair_part_id, quantity, warehouse_id, location_id,
    stock_status, lot, expiration_date, unit_cost, inventory_movement_id,
    operation_key, consumed_by, consumed_at
  ) values (
    consumption_id, organization_id, repair_part_id, quantity_value,
    repair_part_row.warehouse_id, repair_part_row.location_id, repair_part_row.stock_status,
    repair_part_row.lot, repair_part_row.expiration_date,
    greatest(bucket_state.average_cost, 0), movement_id, operation_key_value, actor_id, now()
  );
  perform set_config('app.repair_part_state_write', 'true', true);
  update public.repair_parts part
  set quantity_consumed = part.quantity_consumed + quantity_value,
      status = case when part.quantity_consumed + quantity_value = part.quantity_requested
        then 'consumed' else 'reserved' end,
      updated_by = actor_id
  where part.organization_id = organization_id and part.id = repair_part_id;
  perform set_config('app.repair_part_state_write', 'false', true);

  perform public.record_repair_event(
    organization_id, repair_part_row.repair_id, 'PART_CONSUMED', repair_row.status,
    repair_row.status, actor_id, null,
    jsonb_build_object(
      'repair_part_id', repair_part_id, 'consumption_id', consumption_id,
      'inventory_movement_id', movement_id, 'quantity', quantity_value,
      'operation_key', operation_key_value,
      'expiration_date', repair_part_row.expiration_date
    ),
    'REPAIR_PART_CONSUMED'
  );
  return consumption_id;
end;
$$;

revoke all on function public.record_repair_solution(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.consume_repair_part(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.record_repair_solution(jsonb)
  to authenticated, service_role;
grant execute on function public.consume_repair_part(jsonb)
  to authenticated, service_role;

comment on function public.record_repair_solution(jsonb) is
  'Registra la solucion aplicada antes de pruebas; un retrabajo exige volver a in_repair.';
comment on function public.consume_repair_part(jsonb) is
  'Consume una reserva de reparacion antes de pruebas con inventario canonico e idempotencia.';

commit;
