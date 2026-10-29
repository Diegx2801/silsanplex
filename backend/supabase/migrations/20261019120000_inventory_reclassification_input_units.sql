begin;

-- Kept private: clients can only create/replay an authorized atomic operation,
-- never forge a completion marker or obtain another tenant's request.
create table inventory_internal.reclassification_operations (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operation_key uuid not null,
  operation_id uuid not null unique,
  operation_payload jsonb not null,
  primary key (organization_id, operation_key)
);
revoke all on table inventory_internal.reclassification_operations
  from public, anon, authenticated, service_role;

create or replace function public.reclassify_inventory(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  org_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  target_product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  warehouse_id_value uuid := nullif(payload ->> 'warehouse_id', '')::uuid;
  location_id_value uuid := nullif(payload ->> 'location_id', '')::uuid;
  source_status_value text := payload ->> 'source_status';
  destination_status_value text := payload ->> 'destination_status';
  entered_quantity numeric := nullif(payload ->> 'quantity', '')::numeric;
  input_unit uuid := nullif(payload ->> 'input_unit_id', '')::uuid;
  expected_factor numeric := nullif(payload ->> 'expected_conversion_factor', '')::numeric;
  operation_key_value uuid := nullif(payload ->> 'operation_key', '')::uuid;
  lot_value text := nullif(btrim(payload ->> 'lot'), '');
  expiry date := nullif(payload ->> 'expiration_date', '')::date;
  reason_value text := nullif(btrim(payload ->> 'reason'), '');
  operation_id_value uuid := gen_random_uuid();
  previous_operation inventory_internal.reclassification_operations%rowtype;
  request_value jsonb;
  master_state record;
  product_row public.products%rowtype;
  warehouse_name text;
  resolved_unit record;
  bucket_state record;
  normalized_quantity numeric;
  input_context jsonb;
  previous_context text := coalesce(pg_catalog.current_setting('app.inventory_input_unit_context', true), '');
begin
  if actor_id is null or org_id is null
    or not public.has_organization_permission(org_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;

  -- Older integrations call this RPC without a key. Their old semantics remain
  -- available; the application always supplies a stable per-confirmation UUID.
  if operation_key_value is not null then
    request_value := jsonb_build_object(
      'product_id', target_product_id, 'warehouse_id', warehouse_id_value,
      'location_id', location_id_value, 'source_status', source_status_value,
      'destination_status', destination_status_value, 'quantity', entered_quantity,
      'input_unit_id', input_unit, 'expected_conversion_factor', expected_factor,
      'lot', lower(coalesce(lot_value, '')), 'expiration_date', expiry, 'reason', reason_value
    );
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      org_id::text || ':reclassification-operation:' || operation_key_value::text, 0
    ));
    select operation.* into previous_operation
    from inventory_internal.reclassification_operations operation
    where operation.organization_id = org_id and operation.operation_key = operation_key_value;
    if found then
      if previous_operation.operation_payload is distinct from request_value then
        raise exception using errcode = 'P0001', message = 'RECLASSIFICATION_OPERATION_CONFLICT';
      end if;
      return previous_operation.operation_id;
    end if;
  end if;
  if entered_quantity is null or entered_quantity <= 0
    or entered_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or entered_quantity <> round(entered_quantity, 3) then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_INVALID';
  end if;
  if source_status_value is null or destination_status_value is null
    or source_status_value = destination_status_value
    or source_status_value not in ('available', 'quarantine', 'damaged')
    or destination_status_value not in ('available', 'quarantine', 'damaged') then
    raise exception using errcode = 'P0001', message = 'INVENTORY_STATUS_INVALID';
  end if;
  if reason_value is null or char_length(reason_value) not between 3 and 180 then
    raise exception using errcode = '22023', message = 'RECLASSIFICATION_REASON_INVALID';
  end if;
  if char_length(lot_value) > 60 then
    raise exception using errcode = '22023', message = 'INVENTORY_LOT_INVALID';
  end if;
  -- Use the canonical master -> FEFO -> product lock order, shared by all
  -- inventory writers and warehouse/location lifecycle changes.
  select * into master_state from inventory_internal.lock_inventory_master_scope(
    org_id, warehouse_id_value, location_id_value
  );
  if not coalesce(master_state.warehouse_exists, false)
    or not coalesce(master_state.warehouse_active, false) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_WAREHOUSE_UNAVAILABLE';
  end if;
  if not coalesce(master_state.location_exists, false)
    or not coalesce(master_state.location_active, false) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_LOCATION_UNAVAILABLE';
  end if;
  perform public.lock_inventory_bucket(org_id, target_product_id,
    warehouse_id_value, location_id_value, source_status_value, lot_value, expiry);
  select product.* into product_row from public.products product
  where product.organization_id = org_id and product.id = target_product_id and product.is_active for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;
  if product_row.product_type <> 'good' then
    raise exception using errcode = 'P0001', message = 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN';
  end if;
  if exists (
    select 1 from public.inventory_movements movement
    where movement.organization_id = org_id and movement.product_id = target_product_id
      and movement.warehouse_id = warehouse_id_value and movement.location_id = location_id_value
      and movement.stock_status in (source_status_value, destination_status_value)
      and lower(coalesce(movement.lot, '')) = lower(coalesce(lot_value, ''))
      and movement.expiration_date is not distinct from expiry
      and not exists (
        select 1 from public.measurement_units unit
        where unit.organization_id = org_id and unit.id = product_row.base_unit_id
          and (lower(btrim(unit.name)) = lower(btrim(movement.unit_of_measure))
            or unit.code = upper(btrim(movement.unit_of_measure))
            or unit.code = public.normalized_measurement_unit_code(movement.unit_of_measure))
      )
    group by movement.stock_status, lower(btrim(movement.unit_of_measure))
    having sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
      then movement.quantity else -movement.quantity end) <> 0
  ) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_POSITION_UNIT_CONFLICT';
  end if;
  select * into resolved_unit from inventory_internal.resolve_inventory_input_unit(org_id, target_product_id, input_unit);
  if expected_factor is not null and expected_factor is distinct from resolved_unit.conversion_factor then
    raise exception using errcode = 'P0001', message = 'INVENTORY_INPUT_UNIT_STALE';
  end if;
  normalized_quantity := entered_quantity * resolved_unit.conversion_factor;
  if normalized_quantity <= 0 or normalized_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or normalized_quantity <> round(normalized_quantity, 3) then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_CONVERSION_INVALID';
  end if;
  select * into bucket_state from public.inventory_bucket_state(org_id, target_product_id,
    warehouse_id_value, location_id_value, source_status_value, lot_value, expiry);
  if normalized_quantity > bucket_state.physical_quantity then
    raise exception using errcode = 'P0001', message = 'INVENTORY_INSUFFICIENT_STOCK';
  end if;
  if normalized_quantity > bucket_state.physical_quantity - bucket_state.reserved_quantity then
    raise exception using errcode = 'P0001', message = 'INVENTORY_RESERVED_STOCK';
  end if;
  if bucket_state.average_cost is null or bucket_state.average_cost < 0
    or bucket_state.average_cost::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using errcode = 'P0001', message = 'RECLASSIFICATION_UNIT_COST_INVALID';
  end if;
  select movement.lot into lot_value from public.inventory_movements movement
  where movement.organization_id = org_id and movement.product_id = target_product_id
    and movement.warehouse_id = warehouse_id_value and movement.location_id = location_id_value
    and movement.stock_status = source_status_value
    and lower(coalesce(movement.lot, '')) = lower(coalesce(lot_value, ''))
    and movement.expiration_date is not distinct from expiry
  order by movement.ledger_sequence limit 1;
  select warehouse.name into warehouse_name from public.warehouses warehouse
  where warehouse.organization_id = org_id and warehouse.id = warehouse_id_value;
  input_context := jsonb_build_object(
    'product_id', target_product_id, 'unit_id', resolved_unit.unit_id,
    'unit_name', resolved_unit.unit_name, 'conversion_factor', resolved_unit.conversion_factor,
    'entered_quantity', entered_quantity, 'split', false
  );
  perform pg_catalog.set_config('app.inventory_input_unit_context', input_context::text, true);
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, source_type, source_id, created_by
  ) select org_id, target_product_id, product_row.code, product_row.description, product_row.unit_of_measure,
    side.movement_type, normalized_quantity, warehouse_name, warehouse_id_value, location_id_value, side.stock_status,
    bucket_state.average_cost, lot_value, expiry, current_date, reason_value,
    'stock-reclassification', operation_id_value, actor_id
  from (values ('salida', source_status_value, 1), ('entrada', destination_status_value, 2))
    as side(movement_type, stock_status, sort_order) order by side.sort_order;
  perform pg_catalog.set_config('app.inventory_input_unit_context', previous_context, true);
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (org_id, actor_id, 'INVENTORY_RECLASSIFIED', 'inventory_reclassification', operation_id_value::text,
    (payload - 'organization_id') || jsonb_build_object('base_quantity', normalized_quantity));
  if operation_key_value is not null then
    insert into inventory_internal.reclassification_operations(organization_id, operation_key, operation_id, operation_payload)
    values (org_id, operation_key_value, operation_id_value, request_value);
  end if;
  return operation_id_value;
end;
$$;
alter function public.reclassify_inventory(jsonb) owner to postgres;
revoke all on function public.reclassify_inventory(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.reclassify_inventory(jsonb) to authenticated, service_role;
comment on function public.reclassify_inventory(jsonb) is
  'Atomically changes one exact position condition, protects reservations, converts input units with historical capture, and replays stable operation keys without duplicate movements.';
notify pgrst, 'reload schema';
commit;
