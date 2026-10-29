begin;

-- Keep product/unit conversion rows stable for the duration of a stock write,
-- and reject a form submission if the configured factor changed after render.
create or replace function inventory_internal.resolve_inventory_input_unit(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_unit_id uuid
)
returns table(unit_id uuid, unit_name text, conversion_factor numeric)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base_unit_id uuid;
  base_unit_name text;
begin
  select product.base_unit_id, product.unit_of_measure
  into base_unit_id, base_unit_name
  from public.products product
  where product.id = requested_product_id
    and product.organization_id = requested_organization_id
    and product.product_type = 'good'
    and product.is_active
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;

  if requested_unit_id is null or requested_unit_id = base_unit_id then
    return query select base_unit_id, coalesce(base_unit_name, 'Unidad'), 1::numeric;
    return;
  end if;

  return query
  select conversion.unit_id, unit.name, conversion.conversion_factor::numeric
  from public.product_unit_conversions conversion
  join public.measurement_units unit
    on unit.id = conversion.unit_id
    and unit.organization_id = conversion.organization_id
    and unit.is_active
  where conversion.organization_id = requested_organization_id
    and conversion.product_id = requested_product_id
    and conversion.unit_id = requested_unit_id
    and conversion.is_active
  for share of conversion, unit;

  if not found then
    raise exception using errcode = '22023', message = 'INVENTORY_INPUT_UNIT_INVALID';
  end if;
end;
$$;

alter function inventory_internal.resolve_inventory_input_unit(uuid, uuid, uuid) owner to postgres;
revoke all on function inventory_internal.resolve_inventory_input_unit(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.resolve_inventory_input_unit(uuid, uuid, uuid)
  to postgres;

create or replace function public.record_inventory_movement_d1b1_core(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  requested_unit_id uuid := nullif(payload ->> 'input_unit_id', '')::uuid;
  expected_conversion_factor numeric := nullif(payload ->> 'expected_conversion_factor', '')::numeric;
  entered_quantity numeric := nullif(payload ->> 'quantity', '')::numeric;
  entered_unit_cost numeric := nullif(payload ->> 'unit_cost', '')::numeric;
  normalized_quantity numeric;
  normalized_cost numeric;
  resolved_unit record;
  movement_id uuid;
  normalized_payload jsonb;
  input_context jsonb;
begin
  if actor_id is null
    or organization_id is null
    or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')
  then
    return public.record_inventory_movement_d1b1_core_base(payload);
  end if;

  if entered_quantity is null
    or entered_quantity <= 0
    or entered_quantity::text in ('NaN', 'Infinity', '-Infinity')
  then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_INVALID';
  end if;

  select * into resolved_unit
  from inventory_internal.resolve_inventory_input_unit(
    organization_id, product_id, requested_unit_id
  );

  if expected_conversion_factor is not null
    and expected_conversion_factor is distinct from resolved_unit.conversion_factor
  then
    raise exception using errcode = 'P0001', message = 'INVENTORY_INPUT_UNIT_STALE';
  end if;

  normalized_quantity := entered_quantity * resolved_unit.conversion_factor;
  if normalized_quantity <= 0
    or normalized_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or normalized_quantity <> round(normalized_quantity, 3)
  then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_CONVERSION_INVALID';
  end if;

  normalized_cost := case
    when entered_unit_cost is null then null
    else entered_unit_cost / resolved_unit.conversion_factor
  end;
  normalized_payload := payload || jsonb_build_object(
    'quantity', normalized_quantity,
    'unit_cost', normalized_cost
  );
  input_context := jsonb_build_object(
    'product_id', product_id,
    'unit_id', resolved_unit.unit_id,
    'unit_name', resolved_unit.unit_name,
    'conversion_factor', resolved_unit.conversion_factor,
    'entered_quantity', entered_quantity,
    'split', false
  );

  perform pg_catalog.set_config('app.inventory_input_unit_context', input_context::text, true);
  movement_id := public.record_inventory_movement_d1b1_core_base(normalized_payload);
  perform pg_catalog.set_config('app.inventory_input_unit_context', '', true);
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
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  requested_unit_id uuid := nullif(payload ->> 'input_unit_id', '')::uuid;
  expected_conversion_factor numeric := nullif(payload ->> 'expected_conversion_factor', '')::numeric;
  entered_quantity numeric := nullif(payload ->> 'quantity', '')::numeric;
  normalized_quantity numeric;
  resolved_unit record;
  operation_id uuid;
  normalized_payload jsonb;
  input_context jsonb;
begin
  if actor_id is null
    or organization_id is null
    or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')
  then
    return public.record_inventory_fefo_outbound_base(payload);
  end if;

  if entered_quantity is null
    or entered_quantity <= 0
    or entered_quantity::text in ('NaN', 'Infinity', '-Infinity')
  then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_INVALID';
  end if;

  select * into resolved_unit
  from inventory_internal.resolve_inventory_input_unit(
    organization_id, product_id, requested_unit_id
  );

  if expected_conversion_factor is not null
    and expected_conversion_factor is distinct from resolved_unit.conversion_factor
  then
    raise exception using errcode = 'P0001', message = 'INVENTORY_INPUT_UNIT_STALE';
  end if;

  normalized_quantity := entered_quantity * resolved_unit.conversion_factor;
  if normalized_quantity <= 0
    or normalized_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or normalized_quantity <> round(normalized_quantity, 3)
  then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_CONVERSION_INVALID';
  end if;

  normalized_payload := payload || jsonb_build_object('quantity', normalized_quantity);
  input_context := jsonb_build_object(
    'product_id', product_id,
    'unit_id', resolved_unit.unit_id,
    'unit_name', resolved_unit.unit_name,
    'conversion_factor', resolved_unit.conversion_factor,
    'entered_quantity', entered_quantity,
    'split', true
  );

  perform pg_catalog.set_config('app.inventory_input_unit_context', input_context::text, true);
  operation_id := public.record_inventory_fefo_outbound_base(normalized_payload);
  perform pg_catalog.set_config('app.inventory_input_unit_context', '', true);
  return operation_id;
end;
$$;

alter function public.record_inventory_fefo_outbound(jsonb) owner to postgres;
revoke all on function public.record_inventory_fefo_outbound(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_fefo_outbound(jsonb)
  to authenticated;

commit;
