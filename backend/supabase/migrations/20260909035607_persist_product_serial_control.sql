begin;

do $$
declare
  incompatible_count bigint;
begin
  select count(*)
  into incompatible_count
  from public.products product
  where product.product_type = 'service'
    and product.serial_control;

  if incompatible_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_SERVICE_SERIAL_CONTROL_HISTORICAL_CONFLICT',
      detail = format('incompatible_products=%s', incompatible_count),
      hint = 'Review organization_id, id and code before applying this migration; no rows were changed.';
  end if;
end;
$$;

alter table public.products
  drop constraint products_service_tracking_disabled,
  add constraint products_service_tracking_disabled check (
    product_type = 'good'
    or (not batch_control and not expiration_control and not serial_control)
  );

create or replace function public.save_product_catalog(
  requested_organization_id uuid,
  requested_product_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_product_id uuid;
  alternate_unit jsonb;
  requested_product_type text;
  effective_serial_control boolean;
begin
  if actor_id is null or not public.has_organization_permission(
    requested_organization_id,
    'PRODUCTS_MANAGE'
  ) then
    raise exception using errcode = '42501', message = 'PRODUCT_PERMISSION_REQUIRED';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object'
    or nullif(btrim(payload ->> 'code'), '') is null
    or nullif(btrim(payload ->> 'description'), '') is null
    or nullif(payload ->> 'base_unit_id', '') is null
    or jsonb_typeof(coalesce(payload -> 'alternate_units', '[]'::jsonb)) <> 'array'
    or (
      payload ? 'serial_control'
      and jsonb_typeof(payload -> 'serial_control') <> 'boolean'
    )
  then
    raise exception using errcode = '22023', message = 'PRODUCT_PAYLOAD_INVALID';
  end if;

  requested_product_type := coalesce(nullif(payload ->> 'product_type', ''), 'good');

  if requested_product_id is null then
    effective_serial_control := case
      when payload ? 'serial_control' then (payload ->> 'serial_control')::boolean
      else false
    end;
  else
    select product.serial_control
    into effective_serial_control
    from public.products product
    where product.organization_id = requested_organization_id
      and product.id = requested_product_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
    end if;

    if payload ? 'serial_control' then
      effective_serial_control := (payload ->> 'serial_control')::boolean;
    end if;
  end if;

  if requested_product_type = 'service' and effective_serial_control then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_SERVICE_SERIAL_CONTROL_FORBIDDEN';
  end if;

  if requested_product_id is null then
    insert into public.products (
      organization_id, code, description, extended_description, barcode,
      category, subline, laboratory, presentation, base_unit_id,
      tax_affectation, cost, sale_price, minimum_sale_price, maximum_stock,
      width_cm, height_cm, length_cm, weight_kg, health_registry,
      product_type, batch_control, expiration_control, serial_control,
      prescription_sale, is_active, created_by, updated_by
    ) values (
      requested_organization_id,
      upper(btrim(payload ->> 'code')),
      btrim(payload ->> 'description'),
      nullif(btrim(payload ->> 'extended_description'), ''),
      nullif(btrim(payload ->> 'barcode'), ''),
      nullif(btrim(payload ->> 'category'), ''),
      nullif(btrim(payload ->> 'subline'), ''),
      nullif(btrim(payload ->> 'laboratory'), ''),
      nullif(btrim(payload ->> 'presentation'), ''),
      (payload ->> 'base_unit_id')::uuid,
      coalesce(nullif(payload ->> 'tax_affectation', ''), 'por-definir'),
      nullif(payload ->> 'cost', '')::numeric,
      nullif(payload ->> 'sale_price', '')::numeric,
      nullif(payload ->> 'minimum_sale_price', '')::numeric,
      nullif(payload ->> 'maximum_stock', '')::numeric,
      nullif(payload ->> 'width_cm', '')::numeric,
      nullif(payload ->> 'height_cm', '')::numeric,
      nullif(payload ->> 'length_cm', '')::numeric,
      nullif(payload ->> 'weight_kg', '')::numeric,
      nullif(btrim(payload ->> 'health_registry'), ''),
      requested_product_type,
      coalesce((payload ->> 'batch_control')::boolean, false),
      coalesce((payload ->> 'expiration_control')::boolean, false),
      effective_serial_control,
      coalesce((payload ->> 'prescription_sale')::boolean, false),
      coalesce((payload ->> 'is_active')::boolean, true),
      actor_id,
      actor_id
    ) returning id into saved_product_id;
  else
    update public.products product set
      code = upper(btrim(payload ->> 'code')),
      description = btrim(payload ->> 'description'),
      extended_description = nullif(btrim(payload ->> 'extended_description'), ''),
      barcode = nullif(btrim(payload ->> 'barcode'), ''),
      category = nullif(btrim(payload ->> 'category'), ''),
      subline = nullif(btrim(payload ->> 'subline'), ''),
      laboratory = nullif(btrim(payload ->> 'laboratory'), ''),
      presentation = nullif(btrim(payload ->> 'presentation'), ''),
      base_unit_id = (payload ->> 'base_unit_id')::uuid,
      tax_affectation = coalesce(nullif(payload ->> 'tax_affectation', ''), 'por-definir'),
      cost = nullif(payload ->> 'cost', '')::numeric,
      sale_price = nullif(payload ->> 'sale_price', '')::numeric,
      minimum_sale_price = nullif(payload ->> 'minimum_sale_price', '')::numeric,
      maximum_stock = nullif(payload ->> 'maximum_stock', '')::numeric,
      width_cm = nullif(payload ->> 'width_cm', '')::numeric,
      height_cm = nullif(payload ->> 'height_cm', '')::numeric,
      length_cm = nullif(payload ->> 'length_cm', '')::numeric,
      weight_kg = nullif(payload ->> 'weight_kg', '')::numeric,
      health_registry = nullif(btrim(payload ->> 'health_registry'), ''),
      product_type = requested_product_type,
      batch_control = coalesce((payload ->> 'batch_control')::boolean, false),
      expiration_control = coalesce((payload ->> 'expiration_control')::boolean, false),
      serial_control = effective_serial_control,
      prescription_sale = coalesce((payload ->> 'prescription_sale')::boolean, false),
      is_active = coalesce((payload ->> 'is_active')::boolean, true),
      updated_by = actor_id
    where product.organization_id = requested_organization_id
      and product.id = requested_product_id
    returning product.id into saved_product_id;

    if saved_product_id is null then
      raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
    end if;

    delete from public.product_unit_conversions conversion
    where conversion.organization_id = requested_organization_id
      and conversion.product_id = saved_product_id;
  end if;

  for alternate_unit in
    select value from jsonb_array_elements(payload -> 'alternate_units')
  loop
    insert into public.product_unit_conversions (
      organization_id, product_id, unit_id, conversion_factor,
      barcode, sale_price, is_active, created_by, updated_by
    ) values (
      requested_organization_id,
      saved_product_id,
      (alternate_unit ->> 'unit_id')::uuid,
      (alternate_unit ->> 'conversion_factor')::numeric,
      nullif(btrim(alternate_unit ->> 'barcode'), ''),
      nullif(alternate_unit ->> 'sale_price', '')::numeric,
      true,
      actor_id,
      actor_id
    );
  end loop;

  return saved_product_id;
end;
$$;

revoke all on function public.save_product_catalog(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.save_product_catalog(uuid, uuid, jsonb)
  to authenticated, service_role;

create or replace function public.import_products_single_unit_core(
  requested_organization_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  import_result jsonb;
  product_item jsonb;
begin
  if payload is not null and jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'productos') = 'array'
  then
    if exists (
      select 1
      from jsonb_array_elements(payload -> 'productos') source(item)
      where source.item ? 'control_serie'
        and jsonb_typeof(source.item -> 'control_serie') <> 'boolean'
    ) then
      raise exception using errcode = 'P0001', message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(payload -> 'productos') source(item)
      join public.products product
        on product.organization_id = requested_organization_id
       and product.code = upper(btrim(source.item ->> 'codigo'))
      where source.item ? 'control_serie'
        and (source.item ->> 'control_serie')::boolean
        and product.product_type = 'service'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'PRODUCT_SERVICE_SERIAL_CONTROL_FORBIDDEN';
    end if;
  end if;

  import_result := public.import_products_extended_core(
    requested_organization_id,
    payload
  );

  if import_result ->> 'estado' = 'completado'
    and payload is not null
    and jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'productos') = 'array'
  then
    for product_item in
      select source.item
      from jsonb_array_elements(payload -> 'productos') source(item)
      where source.item ? 'control_serie'
    loop
      update public.products product
      set serial_control = (product_item ->> 'control_serie')::boolean
      where product.organization_id = requested_organization_id
        and product.code = upper(btrim(product_item ->> 'codigo'))
        and product.serial_control is distinct from
          (product_item ->> 'control_serie')::boolean;
    end loop;
  end if;

  return import_result;
end;
$$;

revoke all on function public.import_products_single_unit_core(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_products_single_unit_core(uuid, jsonb)
  to service_role;

comment on function public.save_product_catalog(uuid, uuid, jsonb) is
  'Crea o actualiza el catalogo y distingue serial_control omitido de false explicito.';
comment on function public.import_products_single_unit_core(uuid, jsonb) is
  'Persiste ControlSerie cuando se envia y preserva el valor actual cuando se omite.';

commit;
