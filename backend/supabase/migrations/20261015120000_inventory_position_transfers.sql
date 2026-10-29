begin;

-- Keep the legacy transfer APIs intact; the new operation transfers one exact
-- position, including a relocation between shelves in the same warehouse.
alter table public.warehouse_transfers drop constraint warehouse_transfers_distinct;
alter table public.warehouse_transfers
  add column operation_key uuid,
  add column operation_payload jsonb,
  add constraint warehouse_transfers_operation_pair check (
    (operation_key is null) = (operation_payload is null)
  );
create unique index warehouse_transfers_operation_key_unique
  on public.warehouse_transfers (organization_id, operation_key)
  where operation_key is not null;

create sequence inventory_internal.transfer_reference_sequence;
revoke all on sequence inventory_internal.transfer_reference_sequence
  from public, anon, authenticated, service_role;

create function inventory_internal.guard_transfer_position_difference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source_location_id = new.destination_location_id and exists (
    select 1 from public.warehouse_transfers transfer
    where transfer.organization_id = new.organization_id and transfer.id = new.transfer_id
      and transfer.source_warehouse_id = transfer.destination_warehouse_id
  ) then
    raise exception using errcode = 'P0001', message = 'TRANSFER_POSITION_MUST_DIFFER';
  end if;
  return new;
end;
$$;
revoke all on function inventory_internal.guard_transfer_position_difference()
  from public, anon, authenticated, service_role;
create trigger warehouse_transfer_items_distinct_position
before insert or update of transfer_id, source_location_id, destination_location_id
on public.warehouse_transfer_items for each row
execute function inventory_internal.guard_transfer_position_difference();

-- Physical relocation of an explicitly selected position is not a dispatch:
-- moving a later-expiring lot must not silently choose a different shelf/lot.
-- Retain FEFO for manual dispatches and the unchanged legacy transfer APIs.
create or replace function public.enforce_inventory_outbound_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  physical_quantity numeric;
  reserved_by_others numeric;
  owned_reservation public.inventory_reservations%rowtype;
  requires_fefo boolean;
begin
  if new.movement_type not in ('salida', 'ajuste-negativo') then
    if new.reservation_id is not null then
      raise exception using errcode = 'P0001', message = 'INVENTORY_RESERVATION_OUTBOUND_REQUIRED';
    end if;
    return new;
  end if;
  perform public.lock_inventory_bucket(
    new.organization_id, new.product_id, new.warehouse_id, new.location_id,
    new.stock_status, new.lot, new.expiration_date
  );
  requires_fefo := new.movement_type = 'salida'
    and new.stock_status = 'available' and new.reservation_id is null
    and coalesce(new.source_type, '') not in ('supplier-return', 'stock-reclassification')
    and not (new.source_type = 'warehouse-transfer' and exists (
      select 1 from public.warehouse_transfers transfer
      where transfer.organization_id = new.organization_id and transfer.id = new.transfer_id
        and transfer.operation_key is not null
    ));
  if requires_fefo then
    perform public.assert_inventory_fefo_bucket(
      new.organization_id, new.product_id, new.warehouse_id, new.expiration_date
    );
  end if;
  physical_quantity := public.inventory_bucket_quantity(
    new.organization_id, new.product_id, new.warehouse_id, new.location_id,
    new.stock_status, new.lot, new.expiration_date
  );
  if new.quantity > physical_quantity then
    raise exception using errcode = 'P0001', message = 'INVENTORY_INSUFFICIENT_STOCK';
  end if;
  if new.reservation_id is not null then
    select reservation.* into owned_reservation
    from public.inventory_reservations reservation
    where reservation.organization_id = new.organization_id
      and reservation.id = new.reservation_id and reservation.product_id = new.product_id
      and reservation.warehouse_id = new.warehouse_id and reservation.location_id = new.location_id
      and reservation.stock_status = new.stock_status
      and lower(coalesce(reservation.lot, '')) = lower(coalesce(new.lot, ''))
      and reservation.expiration_date is not distinct from new.expiration_date
      and reservation.status = 'active' for update;
    if not found or new.quantity > owned_reservation.quantity - owned_reservation.quantity_consumed then
      raise exception using errcode = 'P0001', message = 'INVENTORY_RESERVATION_UNAVAILABLE';
    end if;
  end if;
  reserved_by_others := public.inventory_bucket_reserved_quantity(
    new.organization_id, new.product_id, new.warehouse_id, new.location_id,
    new.stock_status, new.lot, new.expiration_date, new.reservation_id
  );
  if new.quantity > physical_quantity - reserved_by_others then
    raise exception using errcode = 'P0001', message = 'INVENTORY_RESERVED_STOCK';
  end if;
  return new;
end;
$$;

-- Align the public FEFO writer with the master-before-product lock order of
-- record_inventory_movement. Otherwise an outbound waiting for a transfer's
-- warehouse mutex can retain a product share lock needed by that transfer.
create or replace function public.record_inventory_fefo_outbound(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  requested_unit_id uuid := nullif(payload ->> 'input_unit_id', '')::uuid;
  warehouse_id uuid := nullif(payload ->> 'warehouse_id', '')::uuid;
  expected_conversion_factor numeric := nullif(payload ->> 'expected_conversion_factor', '')::numeric;
  entered_quantity numeric := nullif(payload ->> 'quantity', '')::numeric;
  normalized_quantity numeric;
  resolved_unit record;
  operation_id uuid;
  normalized_payload jsonb;
  input_context jsonb;
  previous_context text := coalesce(pg_catalog.current_setting('app.inventory_input_unit_context', true), '');
begin
  if actor_id is null or organization_id is null
    or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE') then
    return public.record_inventory_fefo_outbound_base(payload);
  end if;
  if entered_quantity is null or entered_quantity <= 0
    or entered_quantity::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_INVALID';
  end if;
  perform public.lock_inventory_fefo_scope(organization_id, product_id, warehouse_id);
  select * into resolved_unit from inventory_internal.resolve_inventory_input_unit(
    organization_id, product_id, requested_unit_id
  );
  if expected_conversion_factor is not null
    and expected_conversion_factor is distinct from resolved_unit.conversion_factor then
    raise exception using errcode = 'P0001', message = 'INVENTORY_INPUT_UNIT_STALE';
  end if;
  normalized_quantity := entered_quantity * resolved_unit.conversion_factor;
  if normalized_quantity <= 0 or normalized_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or normalized_quantity <> round(normalized_quantity, 3) then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_CONVERSION_INVALID';
  end if;
  normalized_payload := payload || jsonb_build_object('quantity', normalized_quantity);
  input_context := jsonb_build_object(
    'product_id', product_id, 'unit_id', resolved_unit.unit_id,
    'unit_name', resolved_unit.unit_name, 'conversion_factor', resolved_unit.conversion_factor,
    'entered_quantity', entered_quantity, 'split', true
  );
  perform pg_catalog.set_config('app.inventory_input_unit_context', input_context::text, true);
  operation_id := public.record_inventory_fefo_outbound_base(normalized_payload);
  perform pg_catalog.set_config('app.inventory_input_unit_context', previous_context, true);
  return operation_id;
end;
$$;

create function public.transfer_inventory_position(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  org_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  target_product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  operation_key_value uuid := nullif(payload ->> 'operation_key', '')::uuid;
  source_wh uuid := nullif(payload ->> 'source_warehouse_id', '')::uuid;
  destination_wh uuid := nullif(payload ->> 'destination_warehouse_id', '')::uuid;
  source_location uuid := nullif(payload ->> 'source_location_id', '')::uuid;
  destination_location uuid := nullif(payload ->> 'destination_location_id', '')::uuid;
  entered_quantity numeric := nullif(payload ->> 'quantity', '')::numeric;
  input_unit uuid := nullif(payload ->> 'input_unit_id', '')::uuid;
  expected_factor numeric := nullif(payload ->> 'expected_conversion_factor', '')::numeric;
  lot_value text := nullif(btrim(payload ->> 'lot'), '');
  expiry date := nullif(payload ->> 'expiration_date', '')::date;
  status_value text := coalesce(nullif(payload ->> 'stock_status', ''), 'available');
  notes_value text := nullif(btrim(payload ->> 'notes'), '');
  request_value jsonb;
  existing_transfer public.warehouse_transfers%rowtype;
  product_row public.products%rowtype;
  resolved_unit record;
  resource record;
  master_state record;
  bucket_state record;
  normalized_quantity numeric;
  transfer_id_value uuid := gen_random_uuid();
  item_id uuid;
  reference_value text;
  sequence_value text;
  input_context jsonb;
  previous_context text := coalesce(pg_catalog.current_setting('app.inventory_input_unit_context', true), '');
begin
  if actor_id is null or org_id is null
    or not public.has_organization_permission(org_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  if operation_key_value is null then
    raise exception using errcode = '22023', message = 'TRANSFER_OPERATION_KEY_REQUIRED';
  end if;
  request_value := jsonb_build_object(
    'product_id', target_product_id, 'source_warehouse_id', source_wh,
    'source_location_id', source_location, 'destination_warehouse_id', destination_wh,
    'destination_location_id', destination_location, 'quantity', entered_quantity,
    'input_unit_id', input_unit, 'expected_conversion_factor', expected_factor,
    'lot', lower(coalesce(lot_value, '')), 'expiration_date', expiry,
    'stock_status', status_value, 'notes', notes_value
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    org_id::text || ':transfer-operation:' || operation_key_value::text, 0
  ));
  select transfer.* into existing_transfer from public.warehouse_transfers transfer
  where transfer.organization_id = org_id and transfer.operation_key = operation_key_value;
  if found then
    if existing_transfer.operation_payload is distinct from request_value then
      raise exception using errcode = 'P0001', message = 'TRANSFER_OPERATION_CONFLICT';
    end if;
    return existing_transfer.id;
  end if;
  if entered_quantity is null or entered_quantity <= 0
    or entered_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or entered_quantity <> round(entered_quantity, 3) then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_INVALID';
  end if;
  if source_wh is null or destination_wh is null then
    raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSE_UNAVAILABLE';
  end if;
  if source_location is null or destination_location is null then
    raise exception using errcode = 'P0001', message = 'TRANSFER_LOCATION_UNAVAILABLE';
  end if;
  if source_wh = destination_wh and source_location = destination_location then
    raise exception using errcode = 'P0001', message = 'TRANSFER_POSITION_MUST_DIFFER';
  end if;
  if status_value not in ('available', 'quarantine', 'damaged') then
    raise exception using errcode = '22023', message = 'INVENTORY_STATUS_INVALID';
  end if;
  if char_length(lot_value) > 60 or char_length(notes_value) > 240 then
    raise exception using errcode = '22023', message = 'TRANSFER_DETAILS_INVALID';
  end if;

  -- Canonical public manual writes lock masters before product/unit rows.
  -- Acquire both ends in UUID order to also serialize opposite transfers.
  for resource in
    select distinct warehouse_id, location_id from (
      values (source_wh, source_location), (destination_wh, destination_location)
    ) as positions(warehouse_id, location_id) order by warehouse_id, location_id
  loop
    select * into master_state from inventory_internal.lock_inventory_master_scope(org_id, resource.warehouse_id, resource.location_id);
    if not coalesce(master_state.warehouse_exists, false) or not coalesce(master_state.warehouse_active, false) then
      raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSE_UNAVAILABLE';
    end if;
    if not coalesce(master_state.location_exists, false) or not coalesce(master_state.location_active, false) then
      raise exception using errcode = 'P0001', message = 'TRANSFER_LOCATION_UNAVAILABLE';
    end if;
  end loop;
  for resource in select distinct warehouse_id from (values(source_wh), (destination_wh)) as scopes(warehouse_id) order by warehouse_id
  loop
    perform public.lock_inventory_fefo_scope(org_id, target_product_id, resource.warehouse_id);
  end loop;
  select product.* into product_row from public.products product
  where product.organization_id = org_id and product.id = target_product_id
    and product.is_active and product.product_type = 'good' for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;
  -- Legacy positions can predate the base-unit history guard. Never merge
  -- remaining balances expressed in another base unit using today's factor.
  if exists (
    select 1 from public.inventory_movements movement
    where movement.organization_id = org_id and movement.product_id = target_product_id
      and (movement.warehouse_id, movement.location_id) in (
        (source_wh, source_location), (destination_wh, destination_location)
      )
      and movement.stock_status = status_value
      and lower(coalesce(movement.lot, '')) = lower(coalesce(lot_value, ''))
      and movement.expiration_date is not distinct from expiry
      and not exists (
        select 1 from public.measurement_units unit
        where unit.organization_id = org_id and unit.id = product_row.base_unit_id
          and (lower(btrim(unit.name)) = lower(btrim(movement.unit_of_measure))
            or unit.code = upper(btrim(movement.unit_of_measure))
            or unit.code = public.normalized_measurement_unit_code(movement.unit_of_measure))
      )
    group by movement.warehouse_id, movement.location_id, lower(btrim(movement.unit_of_measure))
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
  select * into bucket_state from public.inventory_bucket_state(
    org_id, target_product_id, source_wh, source_location, status_value, lot_value, expiry
  );
  if bucket_state.physical_quantity <= 0 then
    raise exception using errcode = 'P0001', message = 'TRANSFER_SOURCE_POSITION_UNAVAILABLE';
  end if;
  if normalized_quantity > bucket_state.physical_quantity - bucket_state.reserved_quantity then
    raise exception using errcode = 'P0001', message = 'TRANSFER_INSUFFICIENT_STOCK';
  end if;
  if bucket_state.average_cost is null or bucket_state.average_cost < 0
    or bucket_state.average_cost::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using errcode = 'P0001', message = 'TRANSFER_UNIT_COST_INVALID';
  end if;
  -- Keep the source lot's historical spelling rather than rewriting metadata.
  select movement.lot into lot_value from public.inventory_movements movement
  where movement.organization_id = org_id and movement.product_id = target_product_id
    and movement.warehouse_id = source_wh and movement.location_id = source_location
    and movement.stock_status = status_value
    and lower(coalesce(movement.lot, '')) = lower(coalesce(lot_value, ''))
    and movement.expiration_date is not distinct from expiry
  order by movement.ledger_sequence limit 1;
  loop
    sequence_value := nextval('inventory_internal.transfer_reference_sequence'::regclass)::text;
    reference_value := 'TR-' || lpad(sequence_value, greatest(6, char_length(sequence_value)), '0');
    begin
      insert into public.warehouse_transfers (
        id, organization_id, reference, source_warehouse_id, destination_warehouse_id,
        notes, created_by, operation_key, operation_payload
      ) values (
        transfer_id_value, org_id, reference_value, source_wh, destination_wh,
        notes_value, actor_id, operation_key_value, request_value
      );
      exit;
    exception when unique_violation then
      -- A legacy manually assigned TR number may already exist: advance the
      -- private sequence without asking the operator to invent another code.
      if not exists (select 1 from public.warehouse_transfers transfer
        where transfer.organization_id = org_id and transfer.reference = reference_value) then raise; end if;
    end;
  end loop;
  insert into public.warehouse_transfer_items (
    organization_id, transfer_id, product_id, product_code, product_description,
    source_location_id, destination_location_id, lot, expiration_date, stock_status, quantity, unit_cost
  ) values (
    org_id, transfer_id_value, target_product_id, product_row.code, product_row.description,
    source_location, destination_location, lot_value, expiry, status_value, normalized_quantity, bucket_state.average_cost
  ) returning id into item_id;
  input_context := jsonb_build_object(
    'product_id', target_product_id, 'unit_id', resolved_unit.unit_id,
    'unit_name', resolved_unit.unit_name, 'conversion_factor', resolved_unit.conversion_factor,
    'entered_quantity', entered_quantity, 'split', false
  );
  perform pg_catalog.set_config('app.inventory_input_unit_context', input_context::text, true);
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, source_type, source_id, transfer_id, created_by
  ) select
    org_id, target_product_id, product_row.code, product_row.description, product_row.unit_of_measure,
    side.movement_type, normalized_quantity, warehouse.name, side.warehouse_id, side.location_id, status_value,
    bucket_state.average_cost, lot_value, expiry, current_date,
    case when source_wh = destination_wh then 'Reubicación ' else 'Transferencia ' end || reference_value,
    'warehouse-transfer', item_id, transfer_id_value, actor_id
  from (values ('salida', source_wh, source_location, 1), ('entrada', destination_wh, destination_location, 2))
    as side(movement_type, warehouse_id, location_id, sort_order)
  join public.warehouses warehouse on warehouse.organization_id = org_id and warehouse.id = side.warehouse_id
  order by side.sort_order;
  perform pg_catalog.set_config('app.inventory_input_unit_context', previous_context, true);
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (org_id, actor_id, 'WAREHOUSE_TRANSFER_COMPLETED', 'warehouse_transfer', transfer_id_value::text,
    request_value || jsonb_build_object('reference', reference_value, 'base_quantity', normalized_quantity));
  return transfer_id_value;
end;
$$;
alter function public.transfer_inventory_position(jsonb) owner to postgres;
revoke all on function public.transfer_inventory_position(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.transfer_inventory_position(jsonb) to authenticated;
comment on function public.transfer_inventory_position(jsonb) is
  'Atomically relocates one exact unreserved position, across warehouses or shelves, with server folio, idempotency and historical input units.';
notify pgrst, 'reload schema';
commit;
