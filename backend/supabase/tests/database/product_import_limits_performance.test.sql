begin;

select no_plan();

select has_function(
  'public',
  'assert_product_import_limits',
  array['jsonb'],
  'existe el helper interno de limites C2'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.assert_product_import_limits(jsonb)'::regprocedure),
  'el helper de limites es SECURITY INVOKER'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.assert_product_import_limits(jsonb)'::regprocedure),
  'el helper fija search_path vacio'
);
select ok(not has_function_privilege('public', 'public.assert_product_import_limits(jsonb)', 'EXECUTE'), 'PUBLIC no ejecuta el helper');
select ok(not has_function_privilege('anon', 'public.assert_product_import_limits(jsonb)', 'EXECUTE'), 'anon no ejecuta el helper');
select ok(not has_function_privilege('authenticated', 'public.assert_product_import_limits(jsonb)', 'EXECUTE'), 'authenticated no ejecuta el helper');
select ok(not has_function_privilege('service_role', 'public.assert_product_import_limits(jsonb)', 'EXECUTE'), 'service_role no ejecuta el helper');

create function pg_temp.product_rows(requested_count integer, requested_prefix text default 'C2P-')
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fila', row_number + 1,
        'codigo', requested_prefix || lpad(row_number::text, 5, '0'),
        'descripcion', 'Producto ' || row_number
      )
      order by row_number
    ),
    '[]'::jsonb
  )
  from generate_series(1, requested_count) rows(row_number);
$$;

create function pg_temp.price_rows(requested_count integer, requested_code text default 'C2P-00001')
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fila', row_number + 1,
        'codigo_producto', requested_code,
        'producto', 'Producto de limite',
        'unidad_medida', 'Unidad',
        'precio_venta', '10.00',
        'inc_igv', 'Si'
      )
      order by row_number
    ),
    '[]'::jsonb
  )
  from generate_series(1, requested_count) rows(row_number);
$$;

create function pg_temp.capture_limit_error(requested_payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  captured_message text;
  captured_detail text;
begin
  perform public.assert_product_import_limits(requested_payload);
  return jsonb_build_object('message', null, 'detail', null);
exception when others then
  get stacked diagnostics
    captured_message = message_text,
    captured_detail = pg_exception_detail;
  return jsonb_build_object('message', captured_message, 'detail', captured_detail);
end;
$$;

select lives_ok(
  $$select public.assert_product_import_limits(jsonb_build_object(
    'productos', pg_temp.product_rows(1000),
    'precios', pg_temp.price_rows(3000)
  ))$$,
  '1000 productos y 3000 precios, 4000 filas en total, estan permitidos'
);

select results_eq(
  $$select
      error ->> 'message',
      error ->> 'detail'
    from (select pg_temp.capture_limit_error(jsonb_build_object(
      'productos', pg_temp.product_rows(1001),
      'precios', pg_temp.price_rows(3000)
    )) error) captured$$,
  $$values (
    'PRODUCT_IMPORT_TOO_MANY_ROWS'::text,
    'metric=total_rows,limit=4000,received=4001'::text
  )$$,
  'el total se valida primero y devuelve DETAIL estructurado'
);

select results_eq(
  $$select
      error ->> 'message',
      error ->> 'detail'
    from (select pg_temp.capture_limit_error(jsonb_build_object(
      'productos', pg_temp.product_rows(1001),
      'precios', '[]'::jsonb
    )) error) captured$$,
  $$values (
    'PRODUCT_IMPORT_TOO_MANY_PRODUCTS'::text,
    'metric=product_rows,limit=1000,received=1001'::text
  )$$,
  '1001 productos se rechazan con error y detalle especificos'
);

select results_eq(
  $$select
      error ->> 'message',
      error ->> 'detail'
    from (select pg_temp.capture_limit_error(jsonb_build_object(
      'productos', '[]'::jsonb,
      'precios', pg_temp.price_rows(3001)
    )) error) captured$$,
  $$values (
    'PRODUCT_IMPORT_TOO_MANY_PRICES'::text,
    'metric=price_rows,limit=3000,received=3001'::text
  )$$,
  '3001 precios se rechazan con error y detalle especificos'
);

select lives_ok(
  $$select public.assert_product_import_limits(jsonb_build_object(
    'productos', '[]'::jsonb,
    'precios', '[]'::jsonb,
    'padding', repeat('x', 8 * 1024 * 1024 - 1024)
  ))$$,
  'un payload medido justo por debajo de 8 MiB esta permitido'
);

select is(
  (
    pg_temp.capture_limit_error(jsonb_build_object(
      'productos', '[]'::jsonb,
      'precios', '[]'::jsonb,
      'padding', repeat('x', 8 * 1024 * 1024)
    )) ->> 'message'
  ),
  'PRODUCT_IMPORT_PAYLOAD_TOO_LARGE',
  'un payload medido sobre 8 MiB se rechaza'
);

select is(
  (
    pg_temp.capture_limit_error(jsonb_build_object(
      'productos', '[]'::jsonb,
      'precios', '[]'::jsonb,
      'padding', repeat('x', 8 * 1024 * 1024)
    )) ->> 'detail'
  ) like 'metric=payload_bytes,limit=8388608,received=%',
  true,
  'el error de tamano informa limite y bytes recibidos'
);

insert into public.organizations (id, name, slug) values
  ('c2100000-0000-4000-8000-000000000001', 'Importacion C2', 'importacion-c2'),
  ('c2100000-0000-4000-8000-000000000002', 'Importacion C2 ajena', 'importacion-c2-ajena');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('c2200000-0000-4000-8000-000000000001', 'importacion.c2@test.local', '{}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('c2100000-0000-4000-8000-000000000001', 'c2200000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('c2100000-0000-4000-8000-000000000001', 'c2200000-0000-4000-8000-000000000001', 'LOGISTICA');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2200000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.import_products_partial(
    'c2100000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'modo', 'UPDATE',
      'productos', pg_temp.product_rows(1001, 'OVER-'),
      'precios', '[]'::jsonb
    )
  )$$,
  'P0001',
  'PRODUCT_IMPORT_TOO_MANY_PRODUCTS',
  'la RPC parcial rechaza el exceso antes de procesar SKU'
);

reset role;

select is(
  (select count(*) from public.products where organization_id = 'c2100000-0000-4000-8000-000000000001'),
  0::bigint,
  'el exceso no crea ni actualiza productos'
);
select is(
  (select count(*) from public.measurement_units where organization_id = 'c2100000-0000-4000-8000-000000000001' and code like 'CUSTOM_%'),
  0::bigint,
  'el exceso no crea unidades'
);
select is(
  (select count(*) from public.product_unit_conversions where organization_id = 'c2100000-0000-4000-8000-000000000001'),
  0::bigint,
  'el exceso no crea conversiones'
);
select is(
  (select count(*) from public.product_import_batches where organization_id = 'c2100000-0000-4000-8000-000000000001'),
  0::bigint,
  'el exceso no crea lotes de importacion'
);
select is(
  (select count(*) from public.audit_events where organization_id = 'c2100000-0000-4000-8000-000000000001'),
  0::bigint,
  'el exceso no crea auditoria'
);
select is(
  (select count(*) from public.inventory_movements where organization_id = 'c2100000-0000-4000-8000-000000000001'),
  0::bigint,
  'el rechazo no produce efectos en Inventario'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2200000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.import_products_partial(
    'c2100000-0000-4000-8000-000000000001',
    '{
      "modo":"UPDATE",
      "productos":[{
        "fila":2,"codigo":"C2-SERIAL","descripcion":"Producto serial C2",
        "control_serie":true
      }],
      "precios":[]
    }'::jsonb
  )$$,
  'una importacion pequena normal conserva C1 y P1D'
);
select is(
  (select serial_control from public.products where organization_id = 'c2100000-0000-4000-8000-000000000001' and code = 'C2-SERIAL'),
  true,
  'serial true explicito se persiste'
);

select lives_ok(
  $$select public.import_products_partial(
    'c2100000-0000-4000-8000-000000000001',
    '{
      "modo":"UPDATE",
      "productos":[{"fila":2,"codigo":"C2-SERIAL","descripcion":"Producto serial C2"}],
      "precios":[]
    }'::jsonb
  )$$,
  'actualizar con serial omitido sigue permitido'
);
select is(
  (select serial_control from public.products where organization_id = 'c2100000-0000-4000-8000-000000000001' and code = 'C2-SERIAL'),
  true,
  'serial omitido preserva el valor existente'
);

select lives_ok(
  $$select public.import_products_partial(
    'c2100000-0000-4000-8000-000000000001',
    '{
      "modo":"UPDATE",
      "productos":[{
        "fila":2,"codigo":"C2-SERIAL","descripcion":"Producto serial C2",
        "control_serie":false
      }],
      "precios":[]
    }'::jsonb
  )$$,
  'serial false explicito sigue permitido'
);
select is(
  (select serial_control from public.products where organization_id = 'c2100000-0000-4000-8000-000000000001' and code = 'C2-SERIAL'),
  false,
  'serial false explicito desactiva el control'
);

select lives_ok(
  $$select public.import_products(
    'c2100000-0000-4000-8000-000000000001',
    '{
      "productos":[{"fila":2,"codigo":"C2-ZERO","descripcion":"Producto precio cero"}],
      "precios":[{
        "fila":2,"codigo_producto":"C2-ZERO","producto":"Producto precio cero",
        "unidad_medida":"Unidad","precio_venta":"0","inc_igv":"Si"
      }]
    }'::jsonb
  )$$,
  'la importacion normal conserva precio cero e IncIGV P1E-1'
);
select results_eq(
  $$select sale_price, tax_affectation from public.products
    where organization_id = 'c2100000-0000-4000-8000-000000000001' and code = 'C2-ZERO'$$,
  $$values (0::numeric, 'gravado'::text)$$,
  'precio cero e IncIGV Si mantienen su semantica'
);

select throws_ok(
  $$select public.import_products_partial(
    'c2100000-0000-4000-8000-000000000002',
    '{"modo":"UPDATE","productos":[],"precios":[]}'::jsonb
  )$$,
  '42501',
  'PRODUCT_IMPORT_FORBIDDEN',
  'los limites no debilitan PRODUCTS_MANAGE ni el aislamiento por organizacion'
);

reset role;

select ok(
  position(
    'perform public.assert_product_import_limits(payload);'
    in pg_get_functiondef('public.import_products_partial(uuid,jsonb)'::regprocedure)
  ) < position(
    'extensions.digest(payload::text'
    in pg_get_functiondef('public.import_products_partial(uuid,jsonb)'::regprocedure)
  ),
  'partial valida limites antes del hash'
);
select ok(
  position(
    'perform public.assert_product_import_limits(payload);'
    in pg_get_functiondef('public.import_products_catalog_core(uuid,jsonb)'::regprocedure)
  ) < position(
    'pg_catalog.pg_advisory_xact_lock'
    in pg_get_functiondef('public.import_products_catalog_core(uuid,jsonb)'::regprocedure)
  ),
  'catalog core valida limites antes del advisory lock'
);
select ok(
  position(
    'from jsonb_array_elements(normalized_prices) price_item(item)' || chr(10)
      || '    where price_item.item ->> ''codigo_producto'''
    in replace(pg_get_functiondef('public.import_products_catalog_core(uuid,jsonb)'::regprocedure), chr(13), '')
  ) = 0,
  'catalog core ya no recorre todos los precios por producto'
);
select ok(
  position(
    'from jsonb_array_elements(payload -> ''precios'') source(item)' || chr(10)
      || '      where upper(btrim(source.item ->> ''codigo_producto'')) = upper(btrim(product_item ->> ''codigo''))'
    in replace(pg_get_functiondef('public.import_products_partial(uuid,jsonb)'::regprocedure), chr(13), '')
  ) = 0,
  'partial ya no recorre el payload completo de precios por SKU'
);
select ok(
  position(
    'from jsonb_array_elements(payload -> ''precios'') source(item)' || chr(10)
      || '      where upper(btrim(source.item ->> ''codigo_producto''))'
    in replace(pg_get_functiondef('public.import_products_extended_core(uuid,jsonb)'::regprocedure), chr(13), '')
  ) = 0,
  'extended core ya no busca price_item linealmente por producto'
);

select * from finish();
rollback;
