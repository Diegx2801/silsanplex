-- Restore D1B1 as the canonical public movement path after the later
-- document_reference migration replaced the public function body. The
-- document reference contract is preserved inside the D1B1 core instead of
-- maintaining a second movement implementation.

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
  document_reference_value text := btrim(payload ->> 'document_reference');
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
  if document_reference_value is null or char_length(document_reference_value) not between 1 and 120 then
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
    unit_cost := greatest(bucket_state.average_cost, 0);
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

create or replace function public.record_inventory_movement(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  requested_warehouse_id uuid;
  requested_location_id uuid;
  resolved_warehouse_id uuid;
  normalized_warehouse_name text;
  legacy_warehouse_code text;
  master_state record;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return public.record_inventory_movement_d1b1_core(payload);
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  if actor_id is null
    or target_organization_id is null
    or not public.has_organization_permission(target_organization_id, 'INVENTORY_MANAGE')
  then
    return public.record_inventory_movement_d1b1_core(payload);
  end if;

  requested_warehouse_id := nullif(payload ->> 'warehouse_id', '')::uuid;
  requested_location_id := nullif(payload ->> 'location_id', '')::uuid;
  normalized_warehouse_name := nullif(btrim(payload ->> 'warehouse'), '');
  resolved_warehouse_id := requested_warehouse_id;

  if resolved_warehouse_id is null and normalized_warehouse_name is not null then
    legacy_warehouse_code := 'LEG-' || upper(substr(
      pg_catalog.md5(lower(normalized_warehouse_name)),
      1,
      8
    ));

    select warehouse.id
    into resolved_warehouse_id
    from public.warehouses warehouse
    where warehouse.organization_id = target_organization_id
      and (
        lower(warehouse.name) = lower(normalized_warehouse_name)
        or warehouse.code = legacy_warehouse_code
      )
    order by
      (lower(warehouse.name) = lower(normalized_warehouse_name)) desc,
      warehouse.id
    limit 1;
  end if;

  if resolved_warehouse_id is not null then
    select *
    into master_state
    from inventory_internal.lock_inventory_master_scope(
      target_organization_id,
      resolved_warehouse_id,
      requested_location_id
    );

    if not coalesce(master_state.warehouse_exists, false)
      or not coalesce(master_state.warehouse_active, false)
    then
      raise exception using errcode = 'P0001', message = 'INVENTORY_WAREHOUSE_UNAVAILABLE';
    end if;

    if requested_location_id is not null and (
      not coalesce(master_state.location_exists, false)
      or not coalesce(master_state.location_active, false)
    ) then
      raise exception using errcode = 'P0001', message = 'INVENTORY_LOCATION_UNAVAILABLE';
    end if;

    if requested_location_id is null
      and exists (
        select 1
        from public.warehouse_locations location
        where location.organization_id = target_organization_id
          and location.warehouse_id = resolved_warehouse_id
          and location.code = 'GENERAL'
          and not location.is_active
      )
    then
      raise exception using errcode = 'P0001', message = 'INVENTORY_LOCATION_UNAVAILABLE';
    end if;
  end if;

  return public.record_inventory_movement_d1b1_core(payload);
end;
$$;

alter function public.record_inventory_movement(jsonb) owner to postgres;
revoke all on function public.record_inventory_movement(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_movement(jsonb)
  to authenticated;
