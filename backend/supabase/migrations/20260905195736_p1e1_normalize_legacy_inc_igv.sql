-- P1E-1: IncIGV describe la representacion del precio fuente, no la
-- afectacion tributaria. La regla "No -> exonerado" queda retirada.

create or replace function public.legacy_product_import_inc_igv_kind(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case coalesce(lower(nullif(btrim(value), '')), 'pendiente')
    when 'sí' then 'Sí'
    when 'si' then 'Sí'
    when 'no' then 'No'
    when 'pendiente' then 'Pendiente'
    else 'Inválido'
  end;
$$;

revoke all on function public.legacy_product_import_inc_igv_kind(text)
  from public, anon, authenticated;
grant execute on function public.legacy_product_import_inc_igv_kind(text)
  to service_role;

comment on function public.legacy_product_import_inc_igv_kind(text) is
  'Normaliza IncIGV legacy sin convertirlo en una afectacion tributaria.';

create or replace function public.prepare_legacy_product_import_payload(
  requested_organization_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  prepared_prices jsonb := '[]'::jsonb;
  warnings jsonb := coalesce(payload -> '_legacy_inc_igv_advertencias', '[]'::jsonb);
begin
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(coalesce(payload -> 'precios', 'null'::jsonb)) <> 'array'
  then
    return jsonb_build_object(
      'payload', payload,
      'advertencias', warnings
    );
  end if;

  with classified as (
    select
      source.item,
      source.ordinality,
      public.legacy_product_import_inc_igv_kind(source.item ->> 'inc_igv') as inc_igv_kind
    from jsonb_array_elements(payload -> 'precios') with ordinality source(item, ordinality)
  )
  select coalesce(
    jsonb_agg(
      case
        when classified.inc_igv_kind = 'Inválido' then classified.item
        when classified.inc_igv_kind = 'Sí' then jsonb_set(
          classified.item,
          '{inc_igv}',
          to_jsonb(classified.inc_igv_kind),
          true
        )
        when exists (
          select 1
          from public.products product
          where product.organization_id = requested_organization_id
            and product.code = upper(btrim(classified.item ->> 'codigo_producto'))
        ) then null
        else jsonb_set(
          classified.item - array['precio_venta', 'precio_minimo']::text[],
          '{inc_igv}',
          to_jsonb(classified.inc_igv_kind),
          true
        )
      end
      order by classified.ordinality
    ),
    '[]'::jsonb
  )
  into prepared_prices
  from classified;

  with classified as (
    select
      source.item,
      source.ordinality,
      public.legacy_product_import_inc_igv_kind(source.item ->> 'inc_igv') as inc_igv_kind
    from jsonb_array_elements(payload -> 'precios') with ordinality source(item, ordinality)
  )
  select warnings || coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tipo', 'precio',
        'fila', classified.item -> 'fila',
        'codigo', classified.item -> 'codigo_producto',
        'motivo', 'PRODUCT_IMPORT_AMBIGUOUS_INC_IGV'
      )
      order by classified.ordinality
    ),
    '[]'::jsonb
  )
  into warnings
  from classified
  where classified.inc_igv_kind in ('No', 'Pendiente')
    and (
      nullif(btrim(classified.item ->> 'precio_venta'), '') is not null
      or nullif(btrim(classified.item ->> 'precio_minimo'), '') is not null
    );

  return jsonb_build_object(
    'payload', jsonb_set(
      jsonb_set(
        payload,
        '{precios}',
        prepared_prices,
        true
      ),
      '{_legacy_inc_igv_advertencias}',
      warnings,
      true
    ),
    'advertencias', warnings
  );
end;
$$;

revoke all on function public.prepare_legacy_product_import_payload(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.prepare_legacy_product_import_payload(uuid, jsonb)
  to service_role;

comment on function public.prepare_legacy_product_import_payload(uuid, jsonb) is
  'Aplica la transicion legacy de IncIGV: solo Sí conserva precio final y gravado; No/Pendiente/vacio no infieren afectacion ni precio.';

do $migration$
declare
  function_definition text;
  original_function_definition text;
begin
  select pg_get_functiondef('public.import_products_partial(uuid, jsonb)'::regprocedure)
  into function_definition;
  original_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $pattern$^[[:space:]]+created_unit_ids uuid\[\] := '\{\}'::uuid\[\];$pattern$,
    E'  created_unit_ids uuid[] := ''{}''::uuid[];\n  prepared_payload jsonb;\n  warnings jsonb := ''[]''::jsonb;',
    1,
    0,
    'nm'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$sale_price = coalesce\(nullif\(price_item ->> 'precio_venta', ''\)::numeric, product\.sale_price\),$pattern$,
    $replacement$sale_price = case
            when public.legacy_product_import_inc_igv_kind(price_item ->> 'inc_igv') = 'S' || chr(237)
              and nullif(btrim(price_item ->> 'precio_venta'), '') is not null
            then (price_item ->> 'precio_venta')::numeric
            else product.sale_price
          end,$replacement$,
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$minimum_sale_price = coalesce\(nullif\(price_item ->> 'precio_minimo', ''\)::numeric, product\.minimum_sale_price\),$pattern$,
    $replacement$minimum_sale_price = case
            when public.legacy_product_import_inc_igv_kind(price_item ->> 'inc_igv') = 'S' || chr(237)
              and nullif(btrim(price_item ->> 'precio_minimo'), '') is not null
            then (price_item ->> 'precio_minimo')::numeric
            else product.minimum_sale_price
          end,$replacement$,
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$tax_affectation = case when price_item ->> 'inc_igv' = '[^']+' then 'gravado'\s+when price_item ->> 'inc_igv' = 'No' then 'exonerado' else product\.tax_affectation end,$pattern$,
    $replacement$tax_affectation = case
            when public.legacy_product_import_inc_igv_kind(price_item ->> 'inc_igv') = 'S' || chr(237)
            then 'gravado'
            else product.tax_affectation
          end,$replacement$,
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$        if effective_sale_price is null then\s+raise exception using\s+errcode = '22023',\s+message = 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID';\s+end if;$pattern$,
    $replacement$        if public.legacy_product_import_inc_igv_kind(price_item ->> 'inc_igv') = 'S' || chr(237)
          and effective_sale_price is null then
          raise exception using
            errcode = '22023',
            message = 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID';
        end if;$replacement$,
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$        if \(price_item ->> 'precio_minimo'\)::numeric > effective_sale_price\s+then$pattern$,
    $replacement$        if public.legacy_product_import_inc_igv_kind(price_item ->> 'inc_igv') = 'S' || chr(237)
          and (price_item ->> 'precio_minimo')::numeric > effective_sale_price
        then$replacement$,
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$      elsif existing_product\.id is null\s+and price_item is not null\s+and nullif\(btrim\(price_item ->> 'precio_minimo'\), ''\) is not null\s+then$pattern$,
    $replacement$      elsif existing_product.id is null
        and price_item is not null
        and public.legacy_product_import_inc_igv_kind(price_item ->> 'inc_igv') = 'S' || chr(237)
        and nullif(btrim(price_item ->> 'precio_minimo'), '') is not null
      then$replacement$,
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$(  partial_payload_hash := encode\(extensions\.digest\(payload::text, 'sha256'\), 'hex'\);)$pattern$,
    E'  partial_payload_hash := encode(extensions.digest(payload::text, ''sha256''), ''hex'');\n\n  prepared_payload := public.prepare_legacy_product_import_payload(requested_organization_id, payload);\n  payload := prepared_payload -> ''payload'';\n  warnings := coalesce(prepared_payload -> ''advertencias'', ''[]''::jsonb);',
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    '      unchanged_count := unchanged_count + coalesce((sku_result ->> ' || chr(39)
      || 'sin_cambios' || chr(39) || ')::integer, 0);',
    '      warnings := warnings || coalesce(sku_result -> ' || chr(39)
      || 'advertencias' || chr(39) || ', ' || chr(39) || '[]' || chr(39)
      || '::jsonb);' || chr(10)
      || '      unchanged_count := unchanged_count + coalesce((sku_result ->> '
      || chr(39) || 'sin_cambios' || chr(39) || ')::integer, 0);',
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    '    ' || chr(39) || 'filas_rechazadas' || chr(39) || ', rejected_rows',
    '    ' || chr(39) || 'filas_rechazadas' || chr(39) || ', rejected_rows,' || chr(10)
      || '    ' || chr(39) || 'advertencias' || chr(39) || ', warnings',
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$      unchanged_count := unchanged_count \+ coalesce\(\(sku_result ->> 'sin_cambios'\)::integer, 0\);$pattern$,
    $replacement$      warnings := warnings || coalesce(sku_result -> 'advertencias', '[]'::jsonb);
      unchanged_count := unchanged_count + coalesce((sku_result ->> 'sin_cambios')::integer, 0);$replacement$,
    1,
    0,
    'n'
  );

  if function_definition = original_function_definition
    or position('then ''exonerado''' in function_definition) > 0
    or position('sale_price = case' in function_definition) = 0
    or position('minimum_sale_price = case' in function_definition) = 0
    or position('prepare_legacy_product_import_payload' in function_definition) = 0
    or position('warnings' in function_definition) = 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'P1E1_PARTIAL_SEMANTICS_PATCH_NOT_APPLIED';
  end if;

  execute function_definition;
end;
$migration$;

do $migration$
declare
  function_definition text;
  original_function_definition text;
begin
  select pg_get_functiondef('public.import_products(uuid, jsonb)'::regprocedure)
  into function_definition;
  original_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $pattern$^[[:space:]]+result jsonb;$pattern$,
    E'  result jsonb;\n  persisted_result jsonb;\n  full_payload_hash text;\n  existing_result jsonb;',
    1,
    0,
    'nm'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$^[[:space:]]+created_unit_ids uuid\[\] := '\{\}'::uuid\[\];$pattern$,
    E'  created_unit_ids uuid[] := ''{}''::uuid[];\n  prepared_payload jsonb;\n  legacy_warnings jsonb := ''[]''::jsonb;',
    1,
    0,
    'nm'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$(  if payload is null or jsonb_typeof\(payload\) <> 'object'[[:space:]]+or jsonb_typeof\(coalesce\(payload -> 'precios', 'null'::jsonb\)\) <> 'array'[[:space:]]+then[[:space:]]+raise exception using errcode = 'P0001', message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';[[:space:]]+end if;[[:space:]]+)(  with inserted_units as \()$pattern$,
    E'\\1  full_payload_hash := encode(extensions.digest(payload::text, ''sha256''), ''hex'');\n\n  select batch.result\n  into existing_result\n  from public.product_import_batches batch\n  where batch.organization_id = requested_organization_id\n    and batch.payload_hash = full_payload_hash;\n  if found then\n    return existing_result;\n  end if;\n\n  prepared_payload := public.prepare_legacy_product_import_payload(requested_organization_id, payload);\n  payload := prepared_payload -> ''payload'';\n  legacy_warnings := coalesce(prepared_payload -> ''advertencias'', ''[]''::jsonb);\n\n\\2',
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$(  result := public\.import_products_single_unit_core\([[:space:]]+requested_organization_id,[[:space:]]+reduced_payload[[:space:]]+\);)$pattern$,
    E'\\1\n  result := result || jsonb_build_object(''advertencias'', legacy_warnings);',
    1,
    0,
    'n'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$(  result := result \|\| jsonb_build_object\('advertencias', legacy_warnings\);)$pattern$,
    $replacement$\1
  persisted_result := result;
  update public.product_import_batches
  set payload_hash = full_payload_hash,
      result = persisted_result
  where id = (persisted_result ->> 'id_lote')::uuid
    and organization_id = requested_organization_id;$replacement$,
    1,
    0,
    'n'
  );

  if function_definition = original_function_definition
    or position('prepare_legacy_product_import_payload' in function_definition) = 0
    or position('legacy_warnings' in function_definition) = 0
  then
    raise exception using
      errcode = 'P0001',
  message = format(
        'P1E1_IMPORT_WRAPPER_PATCH_NOT_APPLIED prepared=%s warnings=%s length=%s',
        position('prepare_legacy_product_import_payload' in function_definition),
        position('legacy_warnings' in function_definition),
        length(function_definition)
      );
  end if;

  execute function_definition;
end;
$migration$;

/* do $migration$
declare
  function_definition text;
  original_function_definition text;
begin
  select pg_get_functiondef('public.import_products_partial(uuid, jsonb)'::regprocedure)
  into function_definition;
  original_function_definition := function_definition;

  function_definition := replace(
    function_definition,
    E'  created_unit_ids uuid[] := ''{}''::uuid[];\n',
    E'  created_unit_ids uuid[] := ''{}''::uuid[];\n  warnings jsonb := ''[]''::jsonb;\n'
  );

  function_definition := replace(
    function_definition,
    '      if price_item is not null\n        and nullif(btrim(price_item ->> ''precio_minimo''), '''') is not null\n      then\n        if btrim(price_item ->> ''precio_minimo'') !~ ''^(0|[0-9]+)(\\.[0-9]{1,2})?$'' then\n          raise exception using\n            errcode = ''22023'',\n            message = ''PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID'';\n        end if;\n\n        if effective_sale_price is null then\n          raise exception using\n            errcode = ''22023'',\n            message = ''PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID'';\n        end if;\n\n        if (price_item ->> ''precio_minimo'')::numeric > effective_sale_price\n        then\n          raise exception using\n            errcode = ''22023'',\n            message = ''PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID'';\n        end if;\n      end if;',
    '      if price_item is not null\n        and nullif(btrim(price_item ->> ''precio_minimo''), '''') is not null\n      then\n        if btrim(price_item ->> ''precio_minimo'') !~ ''^(0|[0-9]+)(\\.[0-9]{1,2})?$'' then\n          raise exception using\n            errcode = ''22023'',\n            message = ''PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID'';\n        end if;\n\n        if public.legacy_product_import_inc_igv_kind(price_item ->> ''inc_igv'') = ''Sí'' then\n          if effective_sale_price is null then\n            raise exception using\n              errcode = ''22023'',\n              message = ''PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID'';\n          end if;\n\n          if (price_item ->> ''precio_minimo'')::numeric > effective_sale_price\n          then\n            raise exception using\n              errcode = ''22023'',\n              message = ''PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID'';\n          end if;\n        end if;\n      end if;'
  );

  function_definition := replace(
    function_definition,
    '          sale_price = coalesce(nullif(price_item ->> ''precio_venta'', '''')::numeric, product.sale_price),\n          cost = coalesce(nullif(price_item ->> ''costo_base'', '''')::numeric, product.cost),\n          minimum_sale_price = coalesce(nullif(price_item ->> ''precio_minimo'', '''')::numeric, product.minimum_sale_price),\n          tax_affectation = case when price_item ->> ''inc_igv'' = ''Sí'' then ''gravado''\n            when price_item ->> ''inc_igv'' = ''No'' then ''exonerado'' else product.tax_affectation end,',
    '          sale_price = case\n            when public.legacy_product_import_inc_igv_kind(price_item ->> ''inc_igv'') = ''Sí''\n              and nullif(btrim(price_item ->> ''precio_venta''), '''') is not null\n            then (price_item ->> ''precio_venta'')::numeric\n            else product.sale_price\n          end,\n          cost = coalesce(nullif(price_item ->> ''costo_base'', '''')::numeric, product.cost),\n          minimum_sale_price = case\n            when public.legacy_product_import_inc_igv_kind(price_item ->> ''inc_igv'') = ''Sí''\n              and nullif(btrim(price_item ->> ''precio_minimo''), '''') is not null\n            then (price_item ->> ''precio_minimo'')::numeric\n            else product.minimum_sale_price\n          end,\n          tax_affectation = case\n            when public.legacy_product_import_inc_igv_kind(price_item ->> ''inc_igv'') = ''Sí''\n            then ''gravado''\n            else product.tax_affectation\n          end,'
  );

  function_definition := replace(
    function_definition,
    '        and nullif(btrim(price_item ->> ''precio_minimo''), '''') is not null\n      then',
    '        and public.legacy_product_import_inc_igv_kind(price_item ->> ''inc_igv'') = ''Sí''\n        and nullif(btrim(price_item ->> ''precio_minimo''), '''') is not null\n      then'
  );

  function_definition := replace(
    function_definition,
    '      unchanged_count := unchanged_count + coalesce((sku_result ->> ''sin_cambios'')::integer, 0);',
    '      warnings := warnings || coalesce(sku_result -> ''advertencias'', ''[]''::jsonb);\n      unchanged_count := unchanged_count + coalesce((sku_result ->> ''sin_cambios'')::integer, 0);'
  );

  function_definition := replace(
    function_definition,
    '    ''sin_cambios'', unchanged_count,\n    ''filas_rechazadas'', rejected_rows',
    '    ''sin_cambios'', unchanged_count,\n    ''filas_rechazadas'', rejected_rows,\n    ''advertencias'', warnings'
  );

  if function_definition = original_function_definition
    and position('warnings jsonb' in function_definition) = 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'P1E1_PARTIAL_PATCH_NOT_APPLIED';
  end if;

  execute function_definition;
end;
$migration$;
*/
