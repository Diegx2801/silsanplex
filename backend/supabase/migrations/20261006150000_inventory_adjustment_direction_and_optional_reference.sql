begin;

-- Inventory adjustments are a separate workflow from ordinary receipts/issues.
-- A new positive position must carry a unit cost; corrections to an existing
-- position inherit that position's moving average cost.
create or replace function public.record_inventory_movement_d1b1_core(payload jsonb)
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
  document_reference_value text := nullif(btrim(payload ->> 'document_reference'), '');
  product_row public.products%rowtype;
  warehouse_row public.warehouses%rowtype;
  movement_type text := payload ->> 'movement_type';
  quantity numeric := (payload ->> 'quantity')::numeric;
  lot text := nullif(btrim(payload ->> 'lot'), '');
  expiration_date_value date := nullif(payload ->> 'expiration_date', '')::date;
  stock_status text := coalesce(nullif(payload ->> 'stock_status', ''), 'available');
  unit_cost numeric := nullif(payload ->> 'unit_cost', '')::numeric;
  bucket_state record;
  movement_id uuid;
begin
  if actor_id is null
    or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  if document_reference_value is not null and char_length(document_reference_value) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'INVENTORY_DOCUMENT_REFERENCE_INVALID';
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
    unit_cost := greatest(coalesce(bucket_state.average_cost, 0), 0);
  elsif movement_type = 'ajuste-positivo' then
    perform public.lock_inventory_bucket(
      organization_id, product_id, warehouse_id, location_id,
      stock_status, lot, expiration_date_value
    );
    select * into bucket_state
    from public.inventory_bucket_state(
      organization_id, product_id, warehouse_id, location_id,
      stock_status, lot, expiration_date_value
    );
    if coalesce(bucket_state.physical_quantity, 0) > 0 then
      unit_cost := greatest(coalesce(bucket_state.average_cost, 0), 0);
    elsif unit_cost is null or unit_cost < 0 or unit_cost::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception using errcode = '22023', message = 'INVENTORY_ADJUSTMENT_COST_REQUIRED';
    end if;
  elsif movement_type = 'entrada' then
    if unit_cost is null or unit_cost < 0 or unit_cost::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception using errcode = '22023', message = 'INVENTORY_MOVEMENT_COST_REQUIRED';
    end if;
  else
    unit_cost := coalesce(unit_cost, 0);
  end if;

  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, document_reference, created_by
  ) values (
    organization_id, product_id, product_row.code, product_row.description,
    product_row.unit_of_measure, movement_type, quantity, warehouse_row.name,
    warehouse_id, location_id, stock_status, unit_cost, lot, expiration_date_value,
    (payload ->> 'operation_date')::date, btrim(payload ->> 'reason'), document_reference_value, actor_id
  ) returning id into movement_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values
  ) values (
    organization_id, actor_id, 'INVENTORY_MOVEMENT_CREATED',
    'inventory_movement', movement_id::text,
    jsonb_build_object(
      'product_id', product_id, 'movement_type', movement_type,
      'document_reference', document_reference_value,
      'quantity', quantity, 'warehouse_id', warehouse_id,
      'location_id', location_id, 'stock_status', stock_status,
      'lot', lot, 'expiration_date', expiration_date_value
    )
  );
  return movement_id;
end;
$$;

alter function public.record_inventory_movement_d1b1_core(jsonb) owner to postgres;
revoke all on function public.record_inventory_movement_d1b1_core(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_movement_d1b1_core(jsonb)
  to postgres;

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
  document_reference_value text := nullif(btrim(payload ->> 'document_reference'), '');
  product_row public.products%rowtype;
  warehouse_row public.warehouses%rowtype;
  allocation record;
begin
  if actor_id is null
    or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  if document_reference_value is not null and char_length(document_reference_value) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'INVENTORY_DOCUMENT_REFERENCE_INVALID';
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
      unit_cost, lot, expiration_date, operation_date, reason, document_reference, source_type,
      source_id, created_by
    ) values (
      organization_id, product_id, product_row.code, product_row.description,
      product_row.unit_of_measure, 'salida', allocation.allocation_quantity,
      warehouse_row.name, warehouse_id, allocation.location_id, 'available',
      greatest(allocation.average_cost, 0), nullif(allocation.lot, ''),
      allocation.expiration_date, operation_date_value, reason_value, document_reference_value,
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
      'quantity', requested_quantity, 'reason', reason_value,
      'document_reference', document_reference_value
    )
  );

  return operation_id;
end;
$$;

alter function public.record_inventory_fefo_outbound(jsonb) owner to postgres;
revoke all on function public.record_inventory_fefo_outbound(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_fefo_outbound(jsonb)
  to authenticated;

create or replace function public.inventory_movement_warehouses_read(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_stock_status text default null,
  search_term text default '',
  requested_limit integer default 50,
  requested_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if requested_stock_status is not null
    and requested_stock_status not in ('available', 'quarantine', 'damaged')
  then
    raise exception using errcode = '22023', message = 'INVENTORY_READ_FILTER_INVALID';
  end if;
  if requested_limit is null or requested_limit < 1 or requested_limit > 50
    or requested_offset is null or requested_offset < 0
    or char_length(coalesce(btrim(search_term), '')) > 100
  then
    raise exception using errcode = '22023', message = 'INVENTORY_READ_FILTER_INVALID';
  end if;

  perform inventory_internal.assert_inventory_read(requested_organization_id);

  return (
    with eligible as (
      select
        warehouse.id as warehouse_id,
        warehouse.code as warehouse_code,
        warehouse.name as warehouse_name,
        coalesce(stock.eligible_quantity, 0) as eligible_quantity
      from public.warehouses warehouse
      left join lateral (
        select sum(
          case
            when requested_stock_status = 'available' then bucket.assignable_quantity
            when bucket.stock_status = requested_stock_status
              then greatest(bucket.physical_quantity - bucket.reserved_quantity, 0)
            else 0
          end
        ) as eligible_quantity
        from public.inventory_bucket_availability bucket
        join public.warehouse_locations location
          on location.organization_id = bucket.organization_id
         and location.warehouse_id = bucket.warehouse_id
         and location.id = bucket.location_id
         and location.is_active
        where bucket.organization_id = requested_organization_id
          and bucket.product_id = requested_product_id
          and bucket.warehouse_id = warehouse.id
          and (requested_stock_status is null or bucket.stock_status = requested_stock_status)
      ) stock on true
      where warehouse.organization_id = requested_organization_id
        and warehouse.is_active
        and exists (
          select 1 from public.warehouse_locations active_location
          where active_location.organization_id = warehouse.organization_id
            and active_location.warehouse_id = warehouse.id
            and active_location.is_active
        )
        and (
          requested_stock_status is null
          or coalesce(stock.eligible_quantity, 0) > 0
        )
        and (
          coalesce(btrim(search_term), '') = ''
          or strpos(lower(warehouse.code), lower(btrim(search_term))) > 0
          or strpos(lower(warehouse.name), lower(btrim(search_term))) > 0
        )
    ), page as (
      select eligible.*,
        row_number() over (order by lower(warehouse_name), lower(warehouse_code), warehouse_id) as page_order
      from eligible
      order by lower(warehouse_name), lower(warehouse_code), warehouse_id
      limit requested_limit offset requested_offset
    )
    select jsonb_build_object(
      'items', coalesce(
        (select jsonb_agg(to_jsonb(page) - 'page_order' order by page_order) from page),
        '[]'::jsonb
      ),
      'total_count', (select count(*) from eligible)
    )
  );
end;
$$;

alter function public.inventory_movement_warehouses_read(uuid, uuid, text, text, integer, integer)
  owner to postgres;
revoke all on function public.inventory_movement_warehouses_read(uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_movement_warehouses_read(uuid, uuid, text, text, integer, integer)
  to authenticated;

comment on function public.inventory_movement_warehouses_read(uuid, uuid, text, text, integer, integer) is
  'Busca almacenes activos de forma paginada; para salidas restringe resultados al producto y condición con saldo no reservado y asignable.';

commit;
