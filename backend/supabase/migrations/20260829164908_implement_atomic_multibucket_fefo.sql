-- Ejecutores atomicos FEFO para cantidades que abarcan varios buckets.

alter table public.inventory_movements
  drop constraint inventory_movements_source_valid;
alter table public.inventory_movements
  add constraint inventory_movements_source_valid
  check (source_type in (
    'manual', 'purchase-receipt', 'warehouse-transfer', 'stock-reclassification',
    'supplier-return', 'repair-consumption', 'fefo-outbound'
  ));

create or replace function public.inventory_fefo_allocation_plan(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_quantity numeric,
  requested_location_id uuid default null
)
returns table (
  allocation_order bigint,
  location_id uuid,
  location_code text,
  location_name text,
  lot text,
  expiration_date date,
  assignable_quantity numeric,
  allocation_quantity numeric,
  average_cost numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  total_assignable numeric;
begin
  if requested_quantity is null or requested_quantity <= 0 then
    raise exception using errcode = '22023', message = 'INVENTORY_FEFO_QUANTITY_INVALID';
  end if;

  select coalesce(sum(candidate.assignable_quantity), 0)
  into total_assignable
  from public.inventory_fefo_candidates candidate
  where candidate.organization_id = requested_organization_id
    and candidate.product_id = requested_product_id
    and candidate.warehouse_id = requested_warehouse_id
    and (requested_location_id is null or candidate.location_id = requested_location_id);

  if total_assignable < requested_quantity then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_FEFO_INSUFFICIENT_STOCK',
      detail = pg_catalog.format(
        'assignable_quantity=%s,requested_quantity=%s', total_assignable, requested_quantity
      );
  end if;

  return query
  with ranked as (
    select
      candidate.*,
      coalesce(sum(candidate.assignable_quantity) over (
        order by candidate.expiration_date asc nulls last,
          candidate.normalized_lot, candidate.location_id
        rows between unbounded preceding and 1 preceding
      ), 0) as allocated_before,
      row_number() over (
        order by candidate.expiration_date asc nulls last,
          candidate.normalized_lot, candidate.location_id
      ) as candidate_order
    from public.inventory_fefo_candidates candidate
    where candidate.organization_id = requested_organization_id
      and candidate.product_id = requested_product_id
      and candidate.warehouse_id = requested_warehouse_id
      and (requested_location_id is null or candidate.location_id = requested_location_id)
  )
  select
    ranked.candidate_order, ranked.location_id, ranked.location_code,
    ranked.location_name, ranked.lot, ranked.expiration_date,
    ranked.assignable_quantity,
    least(ranked.assignable_quantity, requested_quantity - ranked.allocated_before),
    ranked.average_cost
  from ranked
  where ranked.allocated_before < requested_quantity
  order by ranked.candidate_order;
end;
$$;

revoke all on function public.inventory_fefo_allocation_plan(uuid, uuid, uuid, numeric, uuid)
  from public, anon, authenticated;

create or replace function public.plan_inventory_fefo(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_quantity numeric,
  requested_location_id uuid default null
)
returns table (
  allocation_order bigint,
  location_id uuid,
  location_code text,
  location_name text,
  lot text,
  expiration_date date,
  assignable_quantity numeric,
  allocation_quantity numeric,
  average_cost numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.has_organization_permission(requested_organization_id, 'INVENTORY_VIEW')
  then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;

  return query
  select * from public.inventory_fefo_allocation_plan(
    requested_organization_id, requested_product_id, requested_warehouse_id,
    requested_quantity, requested_location_id
  );
end;
$$;

create or replace function public.record_inventory_fefo_outbound(payload jsonb)
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
  warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  requested_quantity numeric := (payload ->> 'quantity')::numeric;
  operation_id uuid := gen_random_uuid();
  operation_date_value date := coalesce(nullif(payload ->> 'operation_date', '')::date, current_date);
  reason_value text := btrim(payload ->> 'reason');
  product_row public.products%rowtype;
  warehouse_row public.warehouses%rowtype;
  allocation record;
begin
  if actor_id is null
    or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  if reason_value is null or char_length(reason_value) not between 3 and 180 then
    raise exception using errcode = '22023', message = 'INVENTORY_REASON_INVALID';
  end if;

  select product.* into product_row
  from public.products product
  where product.id = product_id
    and product.organization_id = organization_id
    and product.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;

  select warehouse.* into warehouse_row
  from public.warehouses warehouse
  where warehouse.id = warehouse_id
    and warehouse.organization_id = organization_id
    and warehouse.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'INVENTORY_WAREHOUSE_UNAVAILABLE';
  end if;

  perform public.lock_inventory_fefo_scope(organization_id, product_id, warehouse_id);

  for allocation in
    select * from public.inventory_fefo_allocation_plan(
      organization_id, product_id, warehouse_id, requested_quantity, null
    )
  loop
    insert into public.inventory_movements (
      organization_id, product_id, product_code, product_description, unit_of_measure,
      movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
      unit_cost, lot, expiration_date, operation_date, reason, source_type,
      source_id, created_by
    ) values (
      organization_id, product_id, product_row.code, product_row.description,
      product_row.unit_of_measure, 'salida', allocation.allocation_quantity,
      warehouse_row.name, warehouse_id, allocation.location_id, 'available',
      greatest(allocation.average_cost, 0), nullif(allocation.lot, ''),
      allocation.expiration_date, operation_date_value, reason_value,
      'fefo-outbound', operation_id, actor_id
    );
  end loop;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values
  ) values (
    organization_id, actor_id, 'INVENTORY_FEFO_OUTBOUND_COMPLETED',
    'inventory_operation', operation_id::text,
    jsonb_build_object(
      'product_id', product_id, 'warehouse_id', warehouse_id,
      'quantity', requested_quantity, 'reason', reason_value
    )
  );

  return operation_id;
end;
$$;

create or replace function public.transfer_inventory_fefo(payload jsonb)
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
  source_warehouse_id uuid := (payload ->> 'source_warehouse_id')::uuid;
  destination_warehouse_id uuid := (payload ->> 'destination_warehouse_id')::uuid;
  destination_location_id uuid := (payload ->> 'destination_location_id')::uuid;
  requested_quantity numeric := (payload ->> 'quantity')::numeric;
  transfer_id uuid := gen_random_uuid();
  source_warehouse public.warehouses%rowtype;
  destination_warehouse public.warehouses%rowtype;
  product_row public.products%rowtype;
  allocation record;
  item_id uuid;
begin
  if actor_id is null
    or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  if source_warehouse_id = destination_warehouse_id then
    raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSES_MUST_DIFFER';
  end if;

  select warehouse.* into source_warehouse
  from public.warehouses warehouse
  where warehouse.id = source_warehouse_id
    and warehouse.organization_id = organization_id and warehouse.is_active;
  select warehouse.* into destination_warehouse
  from public.warehouses warehouse
  where warehouse.id = destination_warehouse_id
    and warehouse.organization_id = organization_id and warehouse.is_active;
  select product.* into product_row
  from public.products product
  where product.id = product_id
    and product.organization_id = organization_id and product.is_active;

  if source_warehouse.id is null or destination_warehouse.id is null then
    raise exception using errcode = 'P0001', message = 'TRANSFER_WAREHOUSE_UNAVAILABLE';
  end if;
  if product_row.id is null then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;
  if not exists (
    select 1 from public.warehouse_locations location
    where location.id = destination_location_id
      and location.organization_id = organization_id
      and location.warehouse_id = destination_warehouse_id
      and location.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'TRANSFER_LOCATION_UNAVAILABLE';
  end if;

  perform public.lock_inventory_fefo_scope(organization_id, product_id, source_warehouse_id);

  insert into public.warehouse_transfers (
    id, organization_id, reference, source_warehouse_id, destination_warehouse_id,
    transferred_at, notes, created_by
  ) values (
    transfer_id, organization_id, upper(btrim(payload ->> 'reference')),
    source_warehouse_id, destination_warehouse_id,
    coalesce(nullif(payload ->> 'transferred_at', '')::timestamptz, now()),
    nullif(btrim(payload ->> 'notes'), ''), actor_id
  );

  for allocation in
    select * from public.inventory_fefo_allocation_plan(
      organization_id, product_id, source_warehouse_id, requested_quantity, null
    )
  loop
    insert into public.warehouse_transfer_items (
      organization_id, transfer_id, product_id, product_code, product_description,
      source_location_id, destination_location_id, lot, expiration_date,
      stock_status, quantity, unit_cost
    ) values (
      organization_id, transfer_id, product_id, product_row.code, product_row.description,
      allocation.location_id, destination_location_id, nullif(allocation.lot, ''),
      allocation.expiration_date, 'available', allocation.allocation_quantity,
      greatest(allocation.average_cost, 0)
    ) returning id into item_id;

    insert into public.inventory_movements (
      organization_id, product_id, product_code, product_description, unit_of_measure,
      movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
      unit_cost, lot, expiration_date, operation_date, reason, source_type,
      source_id, transfer_id, created_by
    ) values
      (
        organization_id, product_id, product_row.code, product_row.description,
        product_row.unit_of_measure, 'salida', allocation.allocation_quantity,
        source_warehouse.name, source_warehouse_id, allocation.location_id, 'available',
        greatest(allocation.average_cost, 0), nullif(allocation.lot, ''), allocation.expiration_date,
        current_date, 'Transferencia ' || upper(btrim(payload ->> 'reference')),
        'warehouse-transfer', item_id, transfer_id, actor_id
      ),
      (
        organization_id, product_id, product_row.code, product_row.description,
        product_row.unit_of_measure, 'entrada', allocation.allocation_quantity,
        destination_warehouse.name, destination_warehouse_id, destination_location_id, 'available',
        greatest(allocation.average_cost, 0), nullif(allocation.lot, ''), allocation.expiration_date,
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

revoke all on function public.record_inventory_fefo_outbound(jsonb)
  from public, anon, authenticated;
grant execute on function public.record_inventory_fefo_outbound(jsonb) to authenticated;
revoke all on function public.transfer_inventory_fefo(jsonb)
  from public, anon, authenticated;
grant execute on function public.transfer_inventory_fefo(jsonb) to authenticated;

comment on function public.inventory_fefo_allocation_plan(uuid, uuid, uuid, numeric, uuid) is
  'Primitiva interna unica que distribuye una cantidad asignable entre buckets FEFO.';
comment on function public.record_inventory_fefo_outbound(jsonb) is
  'Registra atomicamente una salida disponible distribuida entre buckets FEFO.';
comment on function public.transfer_inventory_fefo(jsonb) is
  'Transfiere atomicamente stock disponible distribuido entre buckets FEFO.';
