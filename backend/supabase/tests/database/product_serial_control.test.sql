begin;

select no_plan();

insert into public.organizations (id, name, slug) values
  ('c1100000-0000-4000-8000-000000000001', 'Serial control', 'serial-control'),
  ('c1100000-0000-4000-8000-000000000002', 'Serial control ajeno', 'serial-control-ajeno');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('c1200000-0000-4000-8000-000000000001', 'serial.admin@test.local', '{}', now(), now()),
  ('c1200000-0000-4000-8000-000000000002', 'serial.denied@test.local', '{}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values ('c1100000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('c1100000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001', 'ADMIN');

create function pg_temp.product_payload(
  requested_code text,
  requested_type text default 'good',
  requested_serial jsonb default 'false'::jsonb,
  include_serial boolean default true
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'code', requested_code,
    'description', 'Producto ' || requested_code,
    'base_unit_id', (
      select unit.id
      from public.measurement_units unit
      where unit.organization_id = 'c1100000-0000-4000-8000-000000000001'
        and unit.code = 'UNIT'
    ),
    'product_type', requested_type,
    'alternate_units', jsonb_build_array()
  ) || case
    when include_serial then jsonb_build_object('serial_control', requested_serial)
    else '{}'::jsonb
  end;
$$;

create function pg_temp.import_payload(
  requested_code text,
  requested_serial jsonb default 'false'::jsonb,
  include_serial boolean default true,
  import_mode text default null
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'productos', jsonb_build_array(
      jsonb_build_object(
        'fila', 2,
        'codigo', requested_code,
        'descripcion', 'Producto ' || requested_code,
        'categoria', '',
        'sublinea', '',
        'laboratorio', ''
      ) || case
        when include_serial then jsonb_build_object('control_serie', requested_serial)
        else '{}'::jsonb
      end
    ),
    'precios', jsonb_build_array(jsonb_build_object(
      'fila', 2,
      'codigo_producto', requested_code,
      'producto', 'Producto ' || requested_code,
      'unidad_medida', 'Unidad',
      'precio_venta', '10.00',
      'inc_igv', 'Sí'
    ))
  ) || case
    when import_mode is null then '{}'::jsonb
    else jsonb_build_object('modo', import_mode)
  end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1200000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001', null,
    pg_temp.product_payload('SER-FALSE')
  )
$$, 'create good serial false');
select is((select serial_control from public.products where code = 'SER-FALSE'), false, 'create persiste false');

select lives_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001', null,
    pg_temp.product_payload('SER-TRUE', 'good', 'true'::jsonb)
  )
$$, 'create good serial true');
select is((select serial_control from public.products where code = 'SER-TRUE'), true, 'create persiste true');

select lives_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001', null,
    pg_temp.product_payload('SER-OMITTED', 'good', 'false'::jsonb, false)
  )
$$, 'create serial omitido');
select is((select serial_control from public.products where code = 'SER-OMITTED'), false, 'create omitido usa false');

select throws_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001', null,
    pg_temp.product_payload('SER-NULL', 'good', 'null'::jsonb)
  )
$$, '22023', 'PRODUCT_PAYLOAD_INVALID', 'create rechaza serial null');
select throws_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001', null,
    pg_temp.product_payload('SER-STRING', 'good', '"true"'::jsonb)
  )
$$, '22023', 'PRODUCT_PAYLOAD_INVALID', 'create rechaza serial string');
select throws_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001', null,
    pg_temp.product_payload('SER-SERVICE-BAD', 'service', 'true'::jsonb)
  )
$$, 'P0001', 'PRODUCT_SERVICE_SERIAL_CONTROL_FORBIDDEN', 'RPC rechaza service serial true');

select lives_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001', null,
    pg_temp.product_payload('SER-SERVICE', 'service', 'false'::jsonb)
  )
$$, 'RPC permite service serial false');
select is((select serial_control from public.products where code = 'SER-SERVICE'), false, 'service conserva serial false');

reset role;
select throws_ok($$
  update public.products set serial_control = true where code = 'SER-SERVICE'
$$, '23514', null, 'constraint rechaza escritura privilegiada service serial true');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1200000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001',
    (select id from public.products where code = 'SER-FALSE'),
    pg_temp.product_payload('SER-FALSE', 'good', 'true'::jsonb)
  )
$$, 'update false a true');
select is((select serial_control from public.products where code = 'SER-FALSE'), true, 'update persiste true');

select lives_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001',
    (select id from public.products where code = 'SER-TRUE'),
    pg_temp.product_payload('SER-TRUE', 'good', 'false'::jsonb)
  )
$$, 'update true a false');
select is((select serial_control from public.products where code = 'SER-TRUE'), false, 'false explicito desactiva');

select lives_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001',
    (select id from public.products where code = 'SER-FALSE'),
    pg_temp.product_payload('SER-FALSE', 'good', 'false'::jsonb, false)
  )
$$, 'update omitido preserva true');
select is((select serial_control from public.products where code = 'SER-FALSE'), true, 'omitido conserva true');
select lives_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001',
    (select id from public.products where code = 'SER-OMITTED'),
    pg_temp.product_payload('SER-OMITTED', 'good', 'true'::jsonb, false)
  )
$$, 'update omitido preserva false');
select is((select serial_control from public.products where code = 'SER-OMITTED'), false, 'omitido conserva false');

select lives_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001',
    (select id from public.products where code = 'SER-FALSE'),
    pg_temp.product_payload('SER-FALSE', 'service', 'false'::jsonb)
  )
$$, 'good a service acepta false explicito');
select results_eq(
  $$select product_type, serial_control from public.products where code = 'SER-FALSE'$$,
  $$values ('service'::text, false)$$,
  'good a service termina sin control serial'
);

select public.save_product_catalog(
  'c1100000-0000-4000-8000-000000000001',
  (select id from public.products where code = 'SER-TRUE'),
  pg_temp.product_payload('SER-TRUE', 'good', 'true'::jsonb)
);
select throws_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001',
    (select id from public.products where code = 'SER-TRUE'),
    pg_temp.product_payload('SER-TRUE', 'service', 'false'::jsonb, false)
  )
$$, 'P0001', 'PRODUCT_SERVICE_SERIAL_CONTROL_FORBIDDEN', 'good a service rechaza serial true preservado');

reset role;
insert into public.products (
  id, organization_id, code, description, unit_of_measure, base_unit_id,
  product_type, tax_affectation, serial_control
) values (
  'c1300000-0000-4000-8000-000000000001',
  'c1100000-0000-4000-8000-000000000002', 'SER-CROSS', 'Producto ajeno', 'UND',
  (select id from public.measurement_units where organization_id = 'c1100000-0000-4000-8000-000000000002' and code = 'UNIT'),
  'good', 'gravado', false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1200000-0000-4000-8000-000000000001', true);
select throws_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001',
    'c1300000-0000-4000-8000-000000000001',
    pg_temp.product_payload('SER-CROSS', 'good', 'true'::jsonb)
  )
$$, 'P0002', 'PRODUCT_NOT_FOUND', 'RPC mantiene aislamiento multi-organizacion');

select set_config('request.jwt.claim.sub', 'c1200000-0000-4000-8000-000000000002', true);
select throws_ok($$
  select public.save_product_catalog(
    'c1100000-0000-4000-8000-000000000001', null,
    pg_temp.product_payload('SER-DENIED')
  )
$$, '42501', 'PRODUCT_PERMISSION_REQUIRED', 'RPC exige PRODUCTS_MANAGE');

reset role;
select ok(not has_function_privilege('anon', 'public.save_product_catalog(uuid,uuid,jsonb)', 'EXECUTE'), 'anon no ejecuta save_product_catalog');
select ok(not has_function_privilege('anon', 'public.import_products(uuid,jsonb)', 'EXECUTE'), 'anon no ejecuta import_products');
select ok(not has_function_privilege('anon', 'public.import_products_partial(uuid,jsonb)', 'EXECUTE'), 'anon no ejecuta import_products_partial');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1200000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.import_products(
    'c1100000-0000-4000-8000-000000000001',
    pg_temp.import_payload('IMP-TRUE', 'true'::jsonb)
  )
$$, 'import normal crea serial true');
select is((select serial_control from public.products where code = 'IMP-TRUE'), true, 'import normal persiste true');
select lives_ok($$
  select public.import_products(
    'c1100000-0000-4000-8000-000000000001',
    pg_temp.import_payload('IMP-FALSE', 'false'::jsonb)
  )
$$, 'import normal crea serial false');
select is((select serial_control from public.products where code = 'IMP-FALSE'), false, 'import normal persiste false');
select lives_ok($$
  select public.import_products(
    'c1100000-0000-4000-8000-000000000001',
    pg_temp.import_payload('IMP-OMITTED', 'false'::jsonb, false)
  )
$$, 'import normal crea con serial omitido');
select is((select serial_control from public.products where code = 'IMP-OMITTED'), false, 'import nuevo omitido usa false');

select lives_ok($$
  select public.import_products(
    'c1100000-0000-4000-8000-000000000001',
    pg_temp.import_payload('IMP-FALSE', 'true'::jsonb)
  )
$$, 'import normal actualiza serial explicito');
select is((select serial_control from public.products where code = 'IMP-FALSE'), true, 'ruta normal actualiza existing a true');

select lives_ok($$
  select public.import_products_partial(
    'c1100000-0000-4000-8000-000000000001',
    pg_temp.import_payload('IMP-FALSE', 'false'::jsonb, true, 'UPDATE')
  )
$$, 'import partial actualiza false explicito');
select is((select serial_control from public.products where code = 'IMP-FALSE'), false, 'ruta partial actualiza existing a false');
select lives_ok($$
  select public.import_products_partial(
    'c1100000-0000-4000-8000-000000000001',
    pg_temp.import_payload('IMP-TRUE', 'false'::jsonb, false, 'UPDATE')
  )
$$, 'import partial acepta serial omitido');
select is((select serial_control from public.products where code = 'IMP-TRUE'), true, 'ruta partial preserva existing cuando se omite');

select is(
  (select count(*) from public.inventory_movements where organization_id = 'c1100000-0000-4000-8000-000000000001'),
  0::bigint,
  'configurar serial no crea movimientos de inventario'
);

select lives_ok($$
  select public.restore_product_version(
    'c1100000-0000-4000-8000-000000000001',
    (select id from public.products where code = 'SER-TRUE'),
    (select min(version_number) from public.product_versions
      where product_id = (select id from public.products where code = 'SER-TRUE')
        and snapshot ->> 'serial_control' = 'true')
  )
$$, 'restore valido conserva serial_control');
select is((select serial_control from public.products where code = 'SER-TRUE'), true, 'restore valido recupera true');

select public.save_product_catalog(
  'c1100000-0000-4000-8000-000000000001',
  (select id from public.products where code = 'SER-TRUE'),
  pg_temp.product_payload('SER-TRUE', 'service', 'false'::jsonb)
);
select throws_ok($$
  select public.restore_product_version(
    'c1100000-0000-4000-8000-000000000001',
    (select id from public.products where code = 'SER-TRUE'),
    (select min(version_number) from public.product_versions
      where product_id = (select id from public.products where code = 'SER-TRUE')
        and snapshot ->> 'serial_control' = 'true')
  )
$$, '23514', null, 'restore incompatible no deja service serial true');
select ok(
  exists (
    select 1 from public.product_versions version
    where version.product_id = (select id from public.products where code = 'SER-TRUE')
      and version.snapshot ->> 'serial_control' = 'true'
  ),
  'los snapshots historicos no se reescriben'
);

select * from finish();
rollback;
