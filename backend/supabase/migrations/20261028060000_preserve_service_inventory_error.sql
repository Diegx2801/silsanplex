begin;

-- Resolve stockability before looking up unit conversions so service products
-- retain the deliberate INVENTORY_SERVICE_PRODUCT_FORBIDDEN contract.
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
  product_type_value text;
begin
  select product.base_unit_id, product.unit_of_measure, product.product_type
  into base_unit_id, base_unit_name, product_type_value
  from public.products product
  where product.id = requested_product_id
    and product.organization_id = requested_organization_id
    and product.is_active
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;

  if product_type_value is distinct from 'good' then
    raise exception using errcode = 'P0001', message = 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN';
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

commit;
