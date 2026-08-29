-- Obliga a todas las reducciones de inventario a respetar el mismo bucket,
-- sus reservas y su valorizacion. Las RPC mantienen sus contratos publicos.

-- ---------------------------------------------------------------------------
-- 1. Integridad multi-tenant faltante
-- ---------------------------------------------------------------------------

alter table public.inventory_movements
  drop constraint inventory_movements_product_id_fkey;

alter table public.inventory_movements
  add constraint inventory_movements_product_tenant_fk
  foreign key (organization_id, product_id)
  references public.products (organization_id, id)
  on delete restrict;

alter table public.warehouse_transfer_items
  add constraint warehouse_transfer_items_source_location_fk
  foreign key (organization_id, source_location_id)
  references public.warehouse_locations (organization_id, id)
  on delete restrict;

alter table public.warehouse_transfer_items
  add constraint warehouse_transfer_items_destination_location_fk
  foreign key (organization_id, destination_location_id)
  references public.warehouse_locations (organization_id, id)
  on delete restrict;

create index warehouse_transfer_items_source_location_idx
  on public.warehouse_transfer_items (organization_id, source_location_id);
create index warehouse_transfer_items_destination_location_idx
  on public.warehouse_transfer_items (organization_id, destination_location_id);

-- ---------------------------------------------------------------------------
-- 2. Barrera autoritativa: fisico, reservas y consumo de reserva propia
-- ---------------------------------------------------------------------------

create or replace function public.enforce_inventory_outbound_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  physical_quantity numeric;
  reserved_by_others numeric;
  owned_reservation public.inventory_reservations%rowtype;
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

  physical_quantity := public.inventory_bucket_quantity(
    new.organization_id, new.product_id, new.warehouse_id, new.location_id,
    new.stock_status, new.lot, new.expiration_date
  );

  if new.quantity > physical_quantity then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_INSUFFICIENT_STOCK',
      detail = pg_catalog.format(
        'product_id=%s,warehouse_id=%s,location_id=%s,stock_status=%s,lot=%s,expiration_date=%s,physical_quantity=%s,outbound_quantity=%s',
        new.product_id, new.warehouse_id, new.location_id, new.stock_status,
        coalesce(new.lot, ''), coalesce(new.expiration_date::text, ''),
        physical_quantity, new.quantity
      );
  end if;

  if new.reservation_id is not null then
    select reservation.*
    into owned_reservation
    from public.inventory_reservations reservation
    where reservation.organization_id = new.organization_id
      and reservation.id = new.reservation_id
      and reservation.product_id = new.product_id
      and reservation.warehouse_id = new.warehouse_id
      and reservation.location_id = new.location_id
      and reservation.stock_status = new.stock_status
      and lower(coalesce(reservation.lot, '')) = lower(coalesce(new.lot, ''))
      and reservation.expiration_date is not distinct from new.expiration_date
      and reservation.status = 'active'
    for update;

    if not found or new.quantity > owned_reservation.quantity - owned_reservation.quantity_consumed then
      raise exception using errcode = 'P0001', message = 'INVENTORY_RESERVATION_UNAVAILABLE';
    end if;
  end if;

  reserved_by_others := public.inventory_bucket_reserved_quantity(
    new.organization_id, new.product_id, new.warehouse_id, new.location_id,
    new.stock_status, new.lot, new.expiration_date, new.reservation_id
  );

  if new.quantity > physical_quantity - reserved_by_others then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_RESERVED_STOCK',
      detail = pg_catalog.format(
        'physical_quantity=%s,reserved_by_others=%s,outbound_quantity=%s',
        physical_quantity, reserved_by_others, new.quantity
      );
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_inventory_outbound_balance()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Movimiento manual: costo y saldo del bucket exacto
-- ---------------------------------------------------------------------------

create or replace function public.record_inventory_movement(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  product_id uuid := (payload ->> 'product_id')::uuid;
  warehouse_id uuid := nullif(payload ->> 'warehouse_id', '')::uuid;
  location_id uuid := nullif(payload ->> 'location_id', '')::uuid;
  product_row public.products%rowtype;
  warehouse_row public.warehouses%rowtype;
  movement_type text := payload ->> 'movement_type';
  quantity numeric := (payload ->> 'quantity')::numeric;
  lot text := nullif(btrim(payload ->> 'lot'), '');
  expiration_date_value date := nullif(payload ->> 'expiration_date', '')::date;
  stock_status text := coalesce(nullif(payload ->> 'stock_status', ''), 'available');
  unit_cost numeric := coalesce(nullif(payload ->> 'unit_cost', '')::numeric, 0);
  bucket_state record;
  movement_id uuid;
begin
  if actor_id is null
    or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;

  select * into product_row
  from public.products product
  where product.id = product_id
    and product.organization_id = organization_id
    and product.is_active;
  if not found or (product_row.batch_control and lot is null) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;

  if warehouse_id is null then
    select warehouse.* into warehouse_row
    from public.warehouses warehouse
    where warehouse.organization_id = organization_id
      and lower(warehouse.name) = lower(btrim(payload ->> 'warehouse'))
      and warehouse.is_active
    order by warehouse.id limit 1;
    warehouse_id := warehouse_row.id;
  else
    select warehouse.* into warehouse_row
    from public.warehouses warehouse
    where warehouse.id = warehouse_id
      and warehouse.organization_id = organization_id
      and warehouse.is_active;
  end if;

  if warehouse_id is null and nullif(btrim(payload ->> 'warehouse'), '') is not null then
    insert into public.warehouses (organization_id, code, name, created_by, updated_by)
    values (
      organization_id,
      'LEG-' || upper(substr(md5(lower(btrim(payload ->> 'warehouse'))), 1, 8)),
      btrim(payload ->> 'warehouse'), actor_id, actor_id
    )
    on conflict on constraint warehouses_organization_id_code_key
    do update set name = excluded.name, updated_by = actor_id
    returning * into warehouse_row;
    warehouse_id := warehouse_row.id;
  end if;
  if warehouse_id is null then
    raise exception using errcode = 'P0001', message = 'INVENTORY_WAREHOUSE_UNAVAILABLE';
  end if;

  if location_id is null then
    select location.id into location_id
    from public.warehouse_locations location
    where location.organization_id = organization_id
      and location.warehouse_id = warehouse_id
      and location.is_active
    order by (location.code = 'GENERAL') desc, location.created_at, location.id
    limit 1;
  end if;
  if location_id is null then
    insert into public.warehouse_locations (
      organization_id, warehouse_id, code, name, created_by, updated_by
    ) values (
      organization_id, warehouse_id, 'GENERAL', 'Ubicacion general', actor_id, actor_id
    )
    on conflict on constraint warehouse_locations_organization_id_warehouse_id_code_key
    do update set is_active = true, updated_by = actor_id
    returning id into location_id;
  end if;
  if not exists (
    select 1 from public.warehouse_locations location
    where location.id = location_id
      and location.organization_id = organization_id
      and location.warehouse_id = warehouse_id
      and location.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_LOCATION_UNAVAILABLE';
  end if;

  if movement_type in ('salida', 'ajuste-negativo') then
    perform public.lock_inventory_bucket(
      organization_id, product_id, warehouse_id, location_id,
      stock_status, lot, expiration_date_value
    );
    select * into bucket_state
    from public.inventory_bucket_state(
      organization_id, product_id, warehouse_id, location_id,
      stock_status, lot, expiration_date_value
    );
    unit_cost := greatest(bucket_state.average_cost, 0);
  end if;

  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, created_by
  ) values (
    organization_id, product_id, product_row.code, product_row.description,
    product_row.unit_of_measure, movement_type, quantity, warehouse_row.name,
    warehouse_id, location_id, stock_status, unit_cost, lot, expiration_date_value,
    (payload ->> 'operation_date')::date, btrim(payload ->> 'reason'), actor_id
  ) returning id into movement_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values
  ) values (
    organization_id, actor_id, 'INVENTORY_MOVEMENT_CREATED',
    'inventory_movement', movement_id::text,
    jsonb_build_object(
      'product_id', product_id, 'movement_type', movement_type,
      'quantity', quantity, 'warehouse_id', warehouse_id,
      'location_id', location_id, 'stock_status', stock_status,
      'lot', lot, 'expiration_date', expiration_date_value
    )
  );
  return movement_id;
end;
$$;

revoke all on function public.record_inventory_movement(jsonb)
  from public, anon, authenticated;
grant execute on function public.record_inventory_movement(jsonb) to authenticated;

-- Las operaciones de almacenes consumen el mismo bucket canonico. El trigger
-- autoritativo realiza la ultima validacion de fisico y reservas.
create or replace function public.transfer_inventory(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  source_warehouse_id uuid := (payload ->> 'source_warehouse_id')::uuid;
  destination_warehouse_id uuid := (payload ->> 'destination_warehouse_id')::uuid;
  source_warehouse public.warehouses%rowtype;
  destination_warehouse public.warehouses%rowtype;
  transfer_id uuid := gen_random_uuid();
  item jsonb;
  product_row public.products%rowtype;
  bucket_state record;
  item_id uuid;
  product_id uuid;
  source_location_id uuid;
  destination_location_id uuid;
  quantity numeric;
  lot text;
  expiration_date_value date;
  stock_status text;
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  if source_warehouse_id = destination_warehouse_id then
    raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSES_MUST_DIFFER';
  end if;
  select warehouse.* into source_warehouse from public.warehouses warehouse
  where warehouse.id = source_warehouse_id and warehouse.organization_id = organization_id and warehouse.is_active;
  select warehouse.* into destination_warehouse from public.warehouses warehouse
  where warehouse.id = destination_warehouse_id and warehouse.organization_id = organization_id and warehouse.is_active;
  if source_warehouse.id is null or destination_warehouse.id is null then
    raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSE_UNAVAILABLE';
  end if;
  if jsonb_array_length(coalesce(payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception using errcode = 'P0001', message = 'TRANSFER_ITEMS_REQUIRED';
  end if;

  insert into public.warehouse_transfers (
    id, organization_id, reference, source_warehouse_id, destination_warehouse_id,
    transferred_at, notes, created_by
  ) values (
    transfer_id, organization_id, upper(btrim(payload ->> 'reference')),
    source_warehouse_id, destination_warehouse_id,
    coalesce(nullif(payload ->> 'transferred_at', '')::timestamptz, now()),
    nullif(btrim(payload ->> 'notes'), ''), actor_id
  );

  for item in
    select value
    from jsonb_array_elements(payload -> 'items')
    order by value ->> 'product_id', value ->> 'source_location_id',
      value ->> 'stock_status', lower(coalesce(value ->> 'lot', '')),
      value ->> 'expiration_date'
  loop
    product_id := (item ->> 'product_id')::uuid;
    source_location_id := (item ->> 'source_location_id')::uuid;
    destination_location_id := (item ->> 'destination_location_id')::uuid;
    quantity := (item ->> 'quantity')::numeric;
    lot := nullif(btrim(item ->> 'lot'), '');
    expiration_date_value := nullif(item ->> 'expiration_date', '')::date;
    stock_status := coalesce(nullif(item ->> 'stock_status', ''), 'available');
    if quantity is null or quantity <= 0 then
      raise exception using errcode = '22023', message = 'TRANSFER_QUANTITY_INVALID';
    end if;

    select product.* into product_row from public.products product
    where product.id = product_id and product.organization_id = organization_id and product.is_active;
    if not found or (product_row.batch_control and lot is null)
      or (product_row.expiration_control and expiration_date_value is null)
    then
      raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
    end if;
    if not exists (
      select 1 from public.warehouse_locations location
      where location.id = source_location_id and location.warehouse_id = source_warehouse_id
        and location.organization_id = organization_id and location.is_active
    ) or not exists (
      select 1 from public.warehouse_locations location
      where location.id = destination_location_id and location.warehouse_id = destination_warehouse_id
        and location.organization_id = organization_id and location.is_active
    ) then
      raise exception using errcode = 'P0001', message = 'TRANSFER_LOCATION_UNAVAILABLE';
    end if;

    perform public.lock_inventory_bucket(
      organization_id, product_id, source_warehouse_id, source_location_id,
      stock_status, lot, expiration_date_value
    );
    select * into bucket_state from public.inventory_bucket_state(
      organization_id, product_id, source_warehouse_id, source_location_id,
      stock_status, lot, expiration_date_value
    );

    insert into public.warehouse_transfer_items (
      organization_id, transfer_id, product_id, product_code, product_description,
      source_location_id, destination_location_id, lot, expiration_date,
      stock_status, quantity, unit_cost
    ) values (
      organization_id, transfer_id, product_id, product_row.code, product_row.description,
      source_location_id, destination_location_id, lot, expiration_date_value,
      stock_status, quantity, greatest(bucket_state.average_cost, 0)
    ) returning id into item_id;

    insert into public.inventory_movements (
      organization_id, product_id, product_code, product_description, unit_of_measure,
      movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
      unit_cost, lot, expiration_date, operation_date, reason, source_type,
      source_id, transfer_id, created_by
    ) values
      (
        organization_id, product_id, product_row.code, product_row.description,
        product_row.unit_of_measure, 'salida', quantity, source_warehouse.name,
        source_warehouse_id, source_location_id, stock_status,
        greatest(bucket_state.average_cost, 0), lot, expiration_date_value,
        current_date, 'Transferencia ' || upper(btrim(payload ->> 'reference')),
        'warehouse-transfer', item_id, transfer_id, actor_id
      ),
      (
        organization_id, product_id, product_row.code, product_row.description,
        product_row.unit_of_measure, 'entrada', quantity, destination_warehouse.name,
        destination_warehouse_id, destination_location_id, stock_status,
        greatest(bucket_state.average_cost, 0), lot, expiration_date_value,
        current_date, 'Transferencia ' || upper(btrim(payload ->> 'reference')),
        'warehouse-transfer', item_id, transfer_id, actor_id
      );
  end loop;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values
  ) values (
    organization_id, actor_id, 'WAREHOUSE_TRANSFER_COMPLETED',
    'warehouse_transfer', transfer_id::text, payload - 'organization_id'
  );
  return transfer_id;
end;
$$;

create or replace function public.reclassify_inventory(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  product_id uuid := (payload ->> 'product_id')::uuid;
  warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  location_id uuid := (payload ->> 'location_id')::uuid;
  source_status text := payload ->> 'source_status';
  destination_status text := payload ->> 'destination_status';
  quantity numeric := (payload ->> 'quantity')::numeric;
  lot text := nullif(btrim(payload ->> 'lot'), '');
  expiration_date_value date := nullif(payload ->> 'expiration_date', '')::date;
  product_row public.products%rowtype;
  warehouse_row public.warehouses%rowtype;
  bucket_state record;
  operation_id uuid := gen_random_uuid();
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  if quantity is null or quantity <= 0 then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_INVALID';
  end if;
  if source_status = destination_status
    or source_status not in ('available','quarantine','damaged')
    or destination_status not in ('available','quarantine','damaged')
  then
    raise exception using errcode = 'P0001', message = 'INVENTORY_STATUS_INVALID';
  end if;
  select product.* into product_row from public.products product
  where product.id = product_id and product.organization_id = organization_id and product.is_active;
  select warehouse.* into warehouse_row from public.warehouses warehouse
  where warehouse.id = warehouse_id and warehouse.organization_id = organization_id and warehouse.is_active;
  if product_row.id is null or warehouse_row.id is null then
    raise exception using errcode = 'P0001', message = 'INVENTORY_BUCKET_UNAVAILABLE';
  end if;
  if not exists (
    select 1 from public.warehouse_locations location
    where location.id = location_id and location.warehouse_id = warehouse_id
      and location.organization_id = organization_id and location.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_LOCATION_UNAVAILABLE';
  end if;

  perform public.lock_inventory_bucket(
    organization_id, product_id, warehouse_id, location_id,
    source_status, lot, expiration_date_value
  );
  select * into bucket_state from public.inventory_bucket_state(
    organization_id, product_id, warehouse_id, location_id,
    source_status, lot, expiration_date_value
  );

  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, source_type, source_id, created_by
  ) values
    (
      organization_id, product_id, product_row.code, product_row.description,
      product_row.unit_of_measure, 'salida', quantity, warehouse_row.name,
      warehouse_id, location_id, source_status, greatest(bucket_state.average_cost, 0),
      lot, expiration_date_value, current_date, btrim(payload ->> 'reason'),
      'stock-reclassification', operation_id, actor_id
    ),
    (
      organization_id, product_id, product_row.code, product_row.description,
      product_row.unit_of_measure, 'entrada', quantity, warehouse_row.name,
      warehouse_id, location_id, destination_status, greatest(bucket_state.average_cost, 0),
      lot, expiration_date_value, current_date, btrim(payload ->> 'reason'),
      'stock-reclassification', operation_id, actor_id
    );
  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values
  ) values (
    organization_id, actor_id, 'INVENTORY_RECLASSIFIED',
    'inventory_reclassification', operation_id::text, payload - 'organization_id'
  );
  return operation_id;
end;
$$;

create or replace function public.complete_supplier_return(
  requested_organization_id uuid,
  requested_return_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  return_row public.supplier_returns%rowtype;
  item_row public.purchase_order_items%rowtype;
  receipt_movement public.inventory_movements%rowtype;
  bucket_state record;
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'SUPPLIERS_MANAGE')
    or not public.has_organization_permission(requested_organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'SUPPLIER_RETURN_COMPLETE_FORBIDDEN';
  end if;
  select * into return_row from public.supplier_returns requested
  where requested.id = requested_return_id and requested.organization_id = requested_organization_id
  for update;
  if not found or return_row.status <> 'registered' then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_NOT_COMPLETABLE';
  end if;
  select * into item_row from public.purchase_order_items item
  where item.id = return_row.purchase_order_item_id;
  select * into receipt_movement from public.inventory_movements movement
  where movement.source_type = 'purchase-receipt' and movement.source_id = item_row.id
  order by movement.created_at limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_RECEIPT_NOT_FOUND';
  end if;

  perform public.lock_inventory_bucket(
    requested_organization_id, item_row.product_id, receipt_movement.warehouse_id,
    receipt_movement.location_id, receipt_movement.stock_status,
    receipt_movement.lot, receipt_movement.expiration_date
  );
  select * into bucket_state from public.inventory_bucket_state(
    requested_organization_id, item_row.product_id, receipt_movement.warehouse_id,
    receipt_movement.location_id, receipt_movement.stock_status,
    receipt_movement.lot, receipt_movement.expiration_date
  );

  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, source_type, source_id, created_by
  ) values (
    requested_organization_id, item_row.product_id, item_row.product_code,
    item_row.product_description, item_row.unit_of_measure, 'salida', return_row.quantity,
    receipt_movement.warehouse, receipt_movement.warehouse_id, receipt_movement.location_id,
    receipt_movement.stock_status, greatest(bucket_state.average_cost, 0),
    receipt_movement.lot, receipt_movement.expiration_date, current_date,
    left('Devolucion a proveedor: ' || return_row.reason, 180),
    'supplier-return', return_row.id, actor_id
  );
  update public.supplier_returns
  set status = 'completed', completed_at = now(), responsible_user_id = actor_id,
      responsible_name = public.supplier_responsible_name(actor_id)
  where id = return_row.id;
  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    requested_organization_id, actor_id, 'SUPPLIER_RETURN_COMPLETED',
    'supplier_return', return_row.id::text
  );
end;
$$;

-- Reparaciones conserva su contrato actual, pero delega saldo, costo y reservas
-- a las primitivas canonicas. La reserva propia viaja en el movimiento para que
-- pueda consumirse sin liberar stock reservado por otros procesos.
create or replace function public.reserve_repair_part(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id uuid := nullif(payload ->> 'repair_id', '')::uuid;
  product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  warehouse_id uuid := nullif(payload ->> 'warehouse_id', '')::uuid;
  location_id uuid := nullif(payload ->> 'location_id', '')::uuid;
  stock_status_value text := coalesce(nullif(lower(btrim(payload ->> 'stock_status')), ''), 'available');
  lot_value text := nullif(btrim(payload ->> 'lot'), '');
  expiration_date_value date := nullif(payload ->> 'expiration_date', '')::date;
  quantity_value numeric := (payload ->> 'quantity_requested')::numeric;
  repair_row public.repairs%rowtype;
  product_row public.products%rowtype;
  bucket_state record;
  part_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_USE_PARTS');
  select repair.* into repair_row from public.repairs repair
  where repair.organization_id = organization_id and repair.id = repair_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status not in ('quote_approved', 'warranty', 'in_repair', 'awaiting_parts') then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_RESERVATION_STATE_INVALID';
  end if;
  select product.* into product_row from public.products product
  where product.organization_id = organization_id and product.id = product_id and product.is_active;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_PART_PRODUCT_UNAVAILABLE'; end if;
  if product_row.batch_control and lot_value is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_LOT_REQUIRED';
  end if;
  if product_row.expiration_control and expiration_date_value is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_EXPIRATION_REQUIRED';
  end if;
  if expiration_date_value < current_date then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_EXPIRED';
  end if;
  if stock_status_value <> 'available' then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_STOCK_NOT_ASSIGNABLE';
  end if;
  if not exists (
    select 1 from public.warehouses warehouse
    where warehouse.organization_id = organization_id and warehouse.id = warehouse_id and warehouse.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_WAREHOUSE_UNAVAILABLE';
  end if;
  if not exists (
    select 1 from public.warehouse_locations location
    where location.organization_id = organization_id and location.warehouse_id = warehouse_id
      and location.id = location_id and location.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_LOCATION_UNAVAILABLE';
  end if;
  if quantity_value is null or quantity_value <= 0 then
    raise exception using errcode = '22023', message = 'REPAIR_PART_QUANTITY_INVALID';
  end if;

  perform public.lock_inventory_bucket(
    organization_id, product_id, warehouse_id, location_id,
    stock_status_value, lot_value, expiration_date_value
  );
  select * into bucket_state from public.inventory_bucket_state(
    organization_id, product_id, warehouse_id, location_id,
    stock_status_value, lot_value, expiration_date_value
  );
  if quantity_value > bucket_state.assignable_quantity then
    raise exception using errcode = 'P0001', message = 'REPAIR_INSUFFICIENT_STOCK';
  end if;

  insert into public.repair_parts (
    organization_id, repair_id, product_id, product_code_snapshot,
    product_description_snapshot, warehouse_id, location_id, stock_status,
    lot, expiration_date, batch_control_snapshot, expiration_control_snapshot,
    quantity_requested, quantity_consumed, status, notes, created_by, updated_by
  ) values (
    organization_id, repair_id, product_id, product_row.code,
    product_row.description, warehouse_id, location_id, stock_status_value,
    lot_value, expiration_date_value, product_row.batch_control, product_row.expiration_control,
    quantity_value, 0, 'reserved', nullif(btrim(payload ->> 'notes'), ''), actor_id, actor_id
  ) returning id into part_id;

  perform public.record_repair_event(
    organization_id, repair_id, 'PART_RESERVED', repair_row.status, repair_row.status,
    actor_id, payload ->> 'notes',
    jsonb_build_object(
      'repair_part_id', part_id, 'product_id', product_id,
      'quantity', quantity_value, 'expiration_date', expiration_date_value
    ),
    'REPAIR_PART_RESERVED'
  );
  return part_id;
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
  if repair_row.status not in ('quote_approved', 'warranty', 'in_repair', 'awaiting_parts', 'testing') then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_CONSUMPTION_STATE_INVALID';
  end if;
  if repair_part_row.status <> 'reserved' then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_NOT_CONSUMABLE';
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

revoke all on function public.transfer_inventory(jsonb) from public, anon, authenticated;
revoke all on function public.reclassify_inventory(jsonb) from public, anon, authenticated;
revoke all on function public.complete_supplier_return(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reserve_repair_part(jsonb) from public, anon, authenticated;
revoke all on function public.consume_repair_part(jsonb) from public, anon, authenticated;

grant execute on function public.transfer_inventory(jsonb) to authenticated, service_role;
grant execute on function public.reclassify_inventory(jsonb) to authenticated, service_role;
grant execute on function public.complete_supplier_return(uuid, uuid) to authenticated, service_role;
grant execute on function public.reserve_repair_part(jsonb) to authenticated, service_role;
grant execute on function public.consume_repair_part(jsonb) to authenticated, service_role;
