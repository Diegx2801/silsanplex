begin;

create or replace function public.assert_product_import_limits(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_rows integer;
  price_rows integer;
  total_rows integer;
  payload_bytes integer;
begin
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(coalesce(payload -> 'productos', 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(payload -> 'precios', 'null'::jsonb)) <> 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  product_rows := jsonb_array_length(payload -> 'productos');
  price_rows := jsonb_array_length(payload -> 'precios');
  total_rows := product_rows + price_rows;

  if total_rows > 4000 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_TOO_MANY_ROWS',
      detail = format('metric=total_rows,limit=4000,received=%s', total_rows);
  end if;

  if product_rows > 1000 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_TOO_MANY_PRODUCTS',
      detail = format('metric=product_rows,limit=1000,received=%s', product_rows);
  end if;

  if price_rows > 3000 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_TOO_MANY_PRICES',
      detail = format('metric=price_rows,limit=3000,received=%s', price_rows);
  end if;

  payload_bytes := pg_catalog.pg_column_size(payload);
  if payload_bytes > 8 * 1024 * 1024 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_PAYLOAD_TOO_LARGE',
      detail = format(
        'metric=payload_bytes,limit=%s,received=%s',
        8 * 1024 * 1024,
        payload_bytes
      );
  end if;
end;
$$;

revoke all on function public.assert_product_import_limits(jsonb)
  from public, anon, authenticated, service_role;

comment on function public.assert_product_import_limits(jsonb) is
  'Validador interno y sin efectos de cardinalidad y tamano para importaciones de productos.';

-- Las funciones se redefinen desde su estado activo para conservar sin cambios
-- las capas historicas C1, P1D y P1E-1. Cada reemplazo esta protegido: si una
-- definicion esperada cambia, la migracion falla en lugar de aplicar parcialmente.

do $migration$
declare
  function_definition text;
  original_definition text;
begin
  select replace(
    pg_get_functiondef('public.import_products_catalog_core(uuid, jsonb)'::regprocedure),
    chr(13),
    ''
  ) into function_definition;
  original_definition := function_definition;

  function_definition := replace(
    function_definition,
    $old$  normalized_prices jsonb := '[]'::jsonb;
  normalized_payload jsonb;$old$,
    $new$  normalized_prices jsonb := '[]'::jsonb;
  normalized_products_by_code jsonb := '{}'::jsonb;
  normalized_prices_by_code jsonb := '{}'::jsonb;
  normalized_payload jsonb;$new$
  );

  function_definition := replace(
    function_definition,
    $old$  -- Serializa importaciones de la misma organizacion para que la huella y$old$,
    $new$  perform public.assert_product_import_limits(payload);

  -- Serializa importaciones de la misma organizacion para que la huella y$new$
  );

  function_definition := replace(
    function_definition,
    $old$  into normalized_prices
  from selected;

  normalized_payload := jsonb_build_object($old$,
    $new$  into normalized_prices
  from selected;

  select coalesce(
    jsonb_object_agg(product_item.item ->> 'codigo', product_item.item),
    '{}'::jsonb
  )
  into normalized_products_by_code
  from jsonb_array_elements(normalized_products) product_item(item);

  select coalesce(
    jsonb_object_agg(price_item.item ->> 'codigo_producto', price_item.item),
    '{}'::jsonb
  )
  into normalized_prices_by_code
  from jsonb_array_elements(normalized_prices) price_item(item);

  normalized_payload := jsonb_build_object($new$
  );

  function_definition := replace(
    function_definition,
    $old$  where not exists (
    select 1
    from jsonb_array_elements(normalized_products) product_item(item)
    where product_item.item ->> 'codigo' = price_item.item ->> 'codigo_producto'
  )$old$,
    $new$  where not (
    normalized_products_by_code ? (price_item.item ->> 'codigo_producto')
  )$new$
  );

  function_definition := replace(
    function_definition,
    $old$    where not exists (
      select 1
      from jsonb_array_elements(normalized_products) product_item(item)
      where product_item.item ->> 'codigo'
        = price_item.item ->> 'codigo_producto'
    )$old$,
    $new$    where not (
      normalized_products_by_code ? (price_item.item ->> 'codigo_producto')
    )$new$
  );

  function_definition := replace(
    function_definition,
    $old$  left join lateral (
    select price_item.item
    from jsonb_array_elements(normalized_prices) price_item(item)
    where price_item.item ->> 'codigo_producto'
      = product_item.item ->> 'codigo'
    limit 1
  ) price_item on true$old$,
    $new$  left join lateral (
    select normalized_prices_by_code -> (product_item.item ->> 'codigo') as item
  ) price_item on true$new$
  );

  if function_definition = original_definition
    or position('perform public.assert_product_import_limits(payload);' in function_definition) = 0
    or position('normalized_products_by_code' in function_definition) = 0
    or position('from jsonb_array_elements(normalized_prices) price_item(item)
    where price_item.item ->> ''codigo_producto''
      = product_item.item ->> ''codigo''' in function_definition) > 0
    or position('from jsonb_array_elements(normalized_products) product_item(item)
    where product_item.item ->> ''codigo'' = price_item.item ->> ''codigo_producto''' in function_definition) > 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'C2_PRODUCT_IMPORT_CATALOG_CORE_PATCH_FAILED';
  end if;

  execute function_definition;
end;
$migration$;

do $migration$
declare
  function_definition text;
  original_definition text;
begin
  select replace(
    pg_get_functiondef('public.import_products_extended_core(uuid, jsonb)'::regprocedure),
    chr(13),
    ''
  ) into function_definition;
  original_definition := function_definition;

  function_definition := replace(
    function_definition,
    $old$  price_item jsonb;
  imported_batch_id uuid;$old$,
    $new$  price_item jsonb;
  first_prices_by_code jsonb := '{}'::jsonb;
  imported_batch_id uuid;$new$
  );

  function_definition := replace(
    function_definition,
    $old$  if exists (
    select 1
    from jsonb_array_elements(coalesce(payload -> 'productos', '[]'::jsonb)) source(item)$old$,
    $new$  perform public.assert_product_import_limits(payload);

  if exists (
    select 1
    from jsonb_array_elements(coalesce(payload -> 'productos', '[]'::jsonb)) source(item)$new$
  );

  function_definition := replace(
    function_definition,
    $old$  then
    for product_item in
      select source.item
      from jsonb_array_elements(payload -> 'productos') source(item)$old$,
    $new$  then
    select coalesce(
      jsonb_object_agg(selected.product_code, selected.item),
      '{}'::jsonb
    )
    into first_prices_by_code
    from (
      select distinct on (upper(btrim(source.item ->> 'codigo_producto')))
        upper(btrim(source.item ->> 'codigo_producto')) as product_code,
        source.item
      from jsonb_array_elements(payload -> 'precios')
        with ordinality source(item, ordinality)
      order by
        upper(btrim(source.item ->> 'codigo_producto')),
        coalesce((source.item ->> 'fila')::integer, source.ordinality::integer),
        source.ordinality
    ) selected;

    for product_item in
      select source.item
      from jsonb_array_elements(payload -> 'productos') source(item)$new$
  );

  function_definition := replace(
    function_definition,
    $old$      select source.item
      into price_item
      from jsonb_array_elements(payload -> 'precios') source(item)
      where upper(btrim(source.item ->> 'codigo_producto'))
        = upper(btrim(product_item ->> 'codigo'))
      order by (source.item ->> 'fila')::integer
      limit 1;$old$,
    $new$      price_item := first_prices_by_code -> upper(btrim(product_item ->> 'codigo'));$new$
  );

  if function_definition = original_definition
    or position('perform public.assert_product_import_limits(payload);' in function_definition) = 0
    or position('first_prices_by_code' in function_definition) = 0
    or position('from jsonb_array_elements(payload -> ''precios'') source(item)
      where upper(btrim(source.item ->> ''codigo_producto''))
        = upper(btrim(product_item ->> ''codigo''))' in function_definition) > 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'C2_PRODUCT_IMPORT_EXTENDED_CORE_PATCH_FAILED';
  end if;

  execute function_definition;
end;
$migration$;

do $migration$
declare
  function_definition text;
  original_definition text;
begin
  select replace(
    pg_get_functiondef('public.import_products_single_unit_core(uuid, jsonb)'::regprocedure),
    chr(13),
    ''
  ) into function_definition;
  original_definition := function_definition;

  function_definition := replace(
    function_definition,
    $old$begin
  if payload is not null and jsonb_typeof(payload) = 'object'$old$,
    $new$begin
  perform public.assert_product_import_limits(payload);

  if payload is not null and jsonb_typeof(payload) = 'object'$new$
  );

  if function_definition = original_definition
    or position('perform public.assert_product_import_limits(payload);' in function_definition) = 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'C2_PRODUCT_IMPORT_SINGLE_UNIT_CORE_PATCH_FAILED';
  end if;

  execute function_definition;
end;
$migration$;

do $migration$
declare
  function_definition text;
  original_definition text;
begin
  select replace(
    pg_get_functiondef('public.import_products(uuid, jsonb)'::regprocedure),
    chr(13),
    ''
  ) into function_definition;
  original_definition := function_definition;

  function_definition := replace(
    function_definition,
    $old$  full_payload_hash := encode(extensions.digest(payload::text, 'sha256'), 'hex');$old$,
    $new$  perform public.assert_product_import_limits(payload);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'product-import:' || requested_organization_id::text,
      0
    )
  );

  full_payload_hash := encode(extensions.digest(payload::text, 'sha256'), 'hex');$new$
  );

  if function_definition = original_definition
    or position('perform public.assert_product_import_limits(payload);' in function_definition) = 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'C2_PRODUCT_IMPORT_WRAPPER_PATCH_FAILED';
  end if;

  execute function_definition;
end;
$migration$;

do $migration$
declare
  function_definition text;
  original_definition text;
begin
  select replace(
    pg_get_functiondef('public.import_products_partial(uuid, jsonb)'::regprocedure),
    chr(13),
    ''
  ) into function_definition;
  original_definition := function_definition;

  function_definition := replace(
    function_definition,
    $old$  price_item jsonb;
  sku_payload jsonb;$old$,
    $new$  price_item jsonb;
  prices_by_code jsonb := '{}'::jsonb;
  sku_prices jsonb := '[]'::jsonb;
  sku_payload jsonb;$new$
  );

  function_definition := replace(
    function_definition,
    $old$  partial_payload_hash := encode(extensions.digest(payload::text, 'sha256'), 'hex');$old$,
    $new$  perform public.assert_product_import_limits(payload);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'product-import:' || requested_organization_id::text,
      0
    )
  );

  partial_payload_hash := encode(extensions.digest(payload::text, 'sha256'), 'hex');$new$
  );

  function_definition := replace(
    function_definition,
    $old$  if found then return cached_result; end if;

  with inserted_units as ($old$,
    $new$  if found then return cached_result; end if;

  select coalesce(
    jsonb_object_agg(grouped.product_code, grouped.items),
    '{}'::jsonb
  )
  into prices_by_code
  from (
    select
      upper(btrim(source.item ->> 'codigo_producto')) as product_code,
      jsonb_agg(
        source.item
        order by
          coalesce((source.item ->> 'fila')::integer, source.ordinality::integer),
          source.ordinality
      ) as items
    from jsonb_array_elements(payload -> 'precios')
      with ordinality source(item, ordinality)
    where nullif(upper(btrim(source.item ->> 'codigo_producto')), '') is not null
    group by upper(btrim(source.item ->> 'codigo_producto'))
  ) grouped;

  with inserted_units as ($new$
  );

  function_definition := replace(
    function_definition,
    $old$  loop
    begin
      select product.* into existing_product$old$,
    $new$  loop
    begin
      sku_prices := coalesce(
        prices_by_code -> upper(btrim(product_item ->> 'codigo')),
        '[]'::jsonb
      );
      price_item := sku_prices -> 0;

      select product.* into existing_product$new$
  );

  function_definition := replace(
    function_definition,
    $old$      select source.item into price_item
      from jsonb_array_elements(payload -> 'precios') source(item)
      where upper(btrim(source.item ->> 'codigo_producto')) = upper(btrim(product_item ->> 'codigo'))
      order by coalesce((source.item ->> 'fila')::integer, 0)
      limit 1;

$old$,
    ''
  );

  function_definition := replace(
    function_definition,
    $old$          when existing_product.id is not null
            and not exists (
              select 1
              from jsonb_array_elements(payload -> 'precios') source(item)
              where upper(btrim(source.item ->> 'codigo_producto')) = upper(btrim(product_item ->> 'codigo'))
                and nullif(btrim(source.item ->> 'precio_venta'), '') is not null
            )
          then '[]'::jsonb
          else coalesce((select jsonb_agg(source.item order by (source.item ->> 'fila')::integer)
            from jsonb_array_elements(payload -> 'precios') source(item)
            where upper(btrim(source.item ->> 'codigo_producto')) = upper(btrim(product_item ->> 'codigo'))), '[]'::jsonb)$old$,
    $new$          when existing_product.id is not null
            and not exists (
              select 1
              from jsonb_array_elements(sku_prices) source(item)
              where nullif(btrim(source.item ->> 'precio_venta'), '') is not null
            )
          then '[]'::jsonb
          else sku_prices$new$
  );

  if function_definition = original_definition
    or position('perform public.assert_product_import_limits(payload);' in function_definition) = 0
    or position('prices_by_code' in function_definition) = 0
    or position('from jsonb_array_elements(payload -> ''precios'') source(item)
      where upper(btrim(source.item ->> ''codigo_producto'')) = upper(btrim(product_item ->> ''codigo''))' in function_definition) > 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'C2_PRODUCT_IMPORT_PARTIAL_PATCH_FAILED';
  end if;

  execute function_definition;
end;
$migration$;

-- CREATE OR REPLACE conserva ACL, pero los revokes se reiteran como defensa.
revoke all on function public.import_products_catalog_core(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_products_catalog_core(uuid, jsonb)
  to service_role;

revoke all on function public.import_products_extended_core(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_products_extended_core(uuid, jsonb)
  to postgres;

revoke all on function public.import_products_single_unit_core(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_products_single_unit_core(uuid, jsonb)
  to service_role;

revoke all on function public.import_products(uuid, jsonb)
  from public, anon;
grant execute on function public.import_products(uuid, jsonb)
  to authenticated, service_role;

revoke all on function public.import_products_partial(uuid, jsonb)
  from public, anon;
grant execute on function public.import_products_partial(uuid, jsonb)
  to authenticated, service_role;

commit;
