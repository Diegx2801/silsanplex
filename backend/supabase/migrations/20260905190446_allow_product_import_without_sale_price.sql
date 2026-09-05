begin;

-- La ausencia de filas en `precios` es válida para un catálogo sin precio.
-- Conservamos la validación de que `productos` no sea un arreglo vacío.
do $migration$
declare
  function_definition text;
  original_function_definition text;
begin
  select pg_get_functiondef(
    'public.import_products_catalog_core(uuid, jsonb)'::regprocedure
  )
  into function_definition;
  original_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $pattern$[[:space:]]+or[[:space:]]+\([[:space:]]+case[[:space:]]+when[[:space:]]+jsonb_typeof\(payload[[:space:]]*->[[:space:]]*'precios'\)[[:space:]]*=[[:space:]]*'array'[[:space:]]+then[[:space:]]+jsonb_array_length\(payload[[:space:]]*->[[:space:]]*'precios'\)[[:space:]]*=[[:space:]]*0[[:space:]]+else[[:space:]]+false[[:space:]]+end[[:space:]]+\)$pattern$,
    '',
    1,
    0
  );

  if function_definition = original_function_definition then
    raise exception using
      errcode = 'P0001',
      message = 'P1D_IMPORT_CORE_GUARD_NOT_FOUND';
  end if;

  execute function_definition;
end;
$migration$;

create or replace function public.import_products_partial(
  requested_organization_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  import_mode text := upper(coalesce(payload ->> 'modo', 'SKIP'));
  batch_id uuid := gen_random_uuid();
  partial_payload_hash text;
  cached_result jsonb;
  product_item jsonb;
  price_item jsonb;
  sku_payload jsonb;
  sku_result jsonb;
  existing_product public.products%rowtype;
  resolved_unit_id uuid;
  resolved_unit_code text;
  effective_sale_price numeric;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  failed_count integer := 0;
  unchanged_count integer := 0;
  rejected_rows jsonb := '[]'::jsonb;
  import_result jsonb;
  failure_message text;
  created_unit_ids uuid[] := '{}'::uuid[];
begin
  if actor_id is null or not public.has_organization_permission(
    requested_organization_id,
    'PRODUCTS_MANAGE'
  ) then
    raise exception using errcode = '42501', message = 'PRODUCT_IMPORT_FORBIDDEN';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(coalesce(payload -> 'productos', 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(payload -> 'precios', 'null'::jsonb)) <> 'array'
    or import_mode not in ('SKIP', 'UPDATE')
  then
    raise exception using errcode = '22023', message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  partial_payload_hash := encode(extensions.digest(payload::text, 'sha256'), 'hex');
  select batch.result into cached_result
  from public.product_import_batches batch
  where batch.organization_id = requested_organization_id
    and batch.payload_hash = partial_payload_hash;
  if found then return cached_result; end if;

  with inserted_units as (
    insert into public.measurement_units (organization_id, code, name)
    select distinct
      requested_organization_id,
      'CUSTOM_' || upper(substr(md5(upper(btrim(source.item ->> 'unidad_medida'))), 1, 12)),
      btrim(source.item ->> 'unidad_medida')
    from jsonb_array_elements(payload -> 'precios') source(item)
    where nullif(btrim(source.item ->> 'unidad_medida'), '') is not null
      and public.normalized_measurement_unit_code(source.item ->> 'unidad_medida') is null
    on conflict (organization_id, code) do nothing
    returning id
  )
  select coalesce(array_agg(inserted_units.id), '{}'::uuid[])
  into created_unit_ids
  from inserted_units;

  for product_item in
    select source.item
    from jsonb_array_elements(payload -> 'productos') source(item)
    order by upper(btrim(source.item ->> 'codigo'))
  loop
    begin
      select product.* into existing_product
      from public.products product
      where product.organization_id = requested_organization_id
        and product.code = upper(btrim(product_item ->> 'codigo'));

      if found and import_mode = 'SKIP' then
        skipped_count := skipped_count + 1;
        continue;
      end if;

      select source.item into price_item
      from jsonb_array_elements(payload -> 'precios') source(item)
      where upper(btrim(source.item ->> 'codigo_producto')) = upper(btrim(product_item ->> 'codigo'))
      order by coalesce((source.item ->> 'fila')::integer, 0)
      limit 1;

      effective_sale_price := case
        when nullif(btrim(price_item ->> 'precio_venta'), '') is not null
          then (price_item ->> 'precio_venta')::numeric
        else existing_product.sale_price
      end;

      if price_item is not null
        and nullif(btrim(price_item ->> 'precio_minimo'), '') is not null
      then
        if btrim(price_item ->> 'precio_minimo') !~ '^(0|[0-9]+)(\.[0-9]{1,2})?$' then
          raise exception using
            errcode = '22023',
            message = 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID';
        end if;

        if effective_sale_price is null then
          raise exception using
            errcode = '22023',
            message = 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID';
        end if;

        if (price_item ->> 'precio_minimo')::numeric > effective_sale_price
        then
          raise exception using
            errcode = '22023',
            message = 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID';
        end if;
      end if;

      if existing_product.id is not null then
        if price_item is not null and nullif(btrim(price_item ->> 'unidad_medida'), '') is not null then
          resolved_unit_code := public.normalized_measurement_unit_code(price_item ->> 'unidad_medida');
          select unit.id into resolved_unit_id
          from public.measurement_units unit
          where unit.organization_id = requested_organization_id
            and unit.is_active
            and ((resolved_unit_code is not null and unit.code = resolved_unit_code)
              or (resolved_unit_code is null and lower(btrim(unit.name)) = lower(btrim(price_item ->> 'unidad_medida'))));
        else
          resolved_unit_id := existing_product.base_unit_id;
        end if;

        update public.products product set
          description = coalesce(nullif(btrim(product_item ->> 'descripcion'), ''), product.description),
          category = coalesce(nullif(btrim(product_item ->> 'categoria'), ''), product.category),
          subline = coalesce(nullif(btrim(product_item ->> 'sublinea'), ''), product.subline),
          laboratory = coalesce(nullif(btrim(product_item ->> 'laboratorio'), ''), product.laboratory),
          extended_description = coalesce(nullif(btrim(product_item ->> 'descripcion_ampliada'), ''), product.extended_description),
          barcode = coalesce(nullif(btrim(product_item ->> 'codigo_barras'), ''), product.barcode),
          presentation = coalesce(nullif(btrim(product_item ->> 'presentacion'), ''), product.presentation),
          health_registry = coalesce(nullif(btrim(product_item ->> 'registro_sanitario'), ''), product.health_registry),
          maximum_stock = coalesce(nullif(product_item ->> 'stock_maximo', '')::numeric, product.maximum_stock),
          width_cm = coalesce(nullif(product_item ->> 'ancho_cm', '')::numeric, product.width_cm),
          height_cm = coalesce(nullif(product_item ->> 'alto_cm', '')::numeric, product.height_cm),
          length_cm = coalesce(nullif(product_item ->> 'largo_cm', '')::numeric, product.length_cm),
          weight_kg = coalesce(nullif(product_item ->> 'peso_kg', '')::numeric, product.weight_kg),
          batch_control = coalesce((product_item ->> 'control_lote')::boolean, product.batch_control),
          expiration_control = coalesce((product_item ->> 'control_vencimiento')::boolean, product.expiration_control),
          prescription_sale = coalesce((product_item ->> 'venta_receta')::boolean, product.prescription_sale),
          base_unit_id = coalesce(resolved_unit_id, product.base_unit_id),
          sale_price = coalesce(nullif(price_item ->> 'precio_venta', '')::numeric, product.sale_price),
          cost = coalesce(nullif(price_item ->> 'costo_base', '')::numeric, product.cost),
          minimum_sale_price = coalesce(nullif(price_item ->> 'precio_minimo', '')::numeric, product.minimum_sale_price),
          tax_affectation = case when price_item ->> 'inc_igv' = 'Sí' then 'gravado'
            when price_item ->> 'inc_igv' = 'No' then 'exonerado' else product.tax_affectation end,
          updated_by = actor_id
        where product.id = existing_product.id;
      end if;

      sku_payload := jsonb_build_object(
        'productos', jsonb_build_array(product_item),
        'precios', case
          when existing_product.id is not null
            and not exists (
              select 1
              from jsonb_array_elements(payload -> 'precios') source(item)
              where upper(btrim(source.item ->> 'codigo_producto')) = upper(btrim(product_item ->> 'codigo'))
                and nullif(btrim(source.item ->> 'precio_venta'), '') is not null
            )
          then '[]'::jsonb
          else coalesce((select jsonb_agg(source.item order by (source.item ->> 'fila')::integer)
            from jsonb_array_elements(payload -> 'precios') source(item)
            where upper(btrim(source.item ->> 'codigo_producto')) = upper(btrim(product_item ->> 'codigo'))), '[]'::jsonb)
        end,
        'partial_run_id', batch_id
      );
      sku_result := public.import_products(requested_organization_id, sku_payload);
      if sku_result ->> 'estado' <> 'completado' then
        raise exception using errcode = '22023', message = 'PRODUCT_SKU_REJECTED';
      elsif existing_product.id is null
        and price_item is not null
        and nullif(btrim(price_item ->> 'precio_minimo'), '') is not null
      then
        update public.products product
        set minimum_sale_price = (price_item ->> 'precio_minimo')::numeric,
            updated_by = actor_id
        where product.organization_id = requested_organization_id
          and product.code = upper(btrim(product_item ->> 'codigo'));
        created_count := created_count + 1;
      elsif existing_product.id is null then
        created_count := created_count + 1;
      else
        updated_count := updated_count + 1;
      end if;
      unchanged_count := unchanged_count + coalesce((sku_result ->> 'sin_cambios')::integer, 0);
    exception when others then
      get stacked diagnostics failure_message = message_text;
      failed_count := failed_count + 1;
      rejected_rows := rejected_rows || jsonb_build_array(jsonb_build_object(
        'tipo', 'producto',
        'fila', product_item -> 'fila',
        'codigo', product_item -> 'codigo',
        'motivo', failure_message
      ));
    end;
  end loop;

  delete from public.measurement_units unit
  where unit.id = any(created_unit_ids)
    and not exists (select 1 from public.products product where product.organization_id = unit.organization_id and product.base_unit_id = unit.id)
    and not exists (select 1 from public.product_unit_conversions conversion where conversion.organization_id = unit.organization_id and conversion.unit_id = unit.id);

  import_result := jsonb_build_object(
    'estado', case when failed_count = 0 then 'completado'
      when created_count + updated_count + skipped_count > 0 then 'parcial' else 'rechazado' end,
    'hash', partial_payload_hash,
    'id_lote', batch_id,
    'creados', created_count,
    'actualizados', updated_count,
    'omitidos', skipped_count,
    'fallidos', failed_count,
    'sin_cambios', unchanged_count,
    'filas_rechazadas', rejected_rows
  );

  insert into public.product_import_batches (id, organization_id, payload_hash, result, created_by)
  values (batch_id, requested_organization_id, partial_payload_hash, import_result, actor_id);
  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values, metadata
  ) values (
    requested_organization_id, actor_id, 'PRODUCT_IMPORT_COMPLETED', 'product_import', batch_id::text,
    import_result, jsonb_build_object('source', 'partial_import', 'mode', import_mode)
  );
  return import_result;
end;
$$;

revoke all on function public.import_products_partial(uuid, jsonb) from public, anon;
grant execute on function public.import_products_partial(uuid, jsonb) to authenticated, service_role;
comment on function public.import_products_partial(uuid, jsonb) is
  'Importa productos por SKU, permite catalogar sin precio y conserva incidencias sin revertir los SKU válidos.';

commit;
