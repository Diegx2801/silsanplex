begin;

select no_plan();

select has_function(
  'public',
  'import_products_partial',
  array['uuid', 'jsonb'],
  'existe la RPC de importación parcial'
);
select is(
  has_function_privilege(
    'anon',
    'public.import_products_partial(uuid, jsonb)',
    'EXECUTE'
  ),
  false,
  'anon no puede ejecutar la importación parcial'
);

insert into public.organizations (id, name, slug)
values
  ('e1d10000-0000-4000-8000-000000000001', 'Importación P1D uno', 'importacion-p1d-uno'),
  ('e1d10000-0000-4000-8000-000000000002', 'Importación P1D dos', 'importacion-p1d-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'e1d20000-0000-4000-8000-000000000001',
  'importacion.p1d@test.local',
  '{"full_name":"Importación P1D"}',
  now(),
  now()
);

insert into public.organization_memberships (organization_id, user_id)
values (
  'e1d10000-0000-4000-8000-000000000001',
  'e1d20000-0000-4000-8000-000000000001'
);
insert into public.user_roles (organization_id, user_id, role_code)
values (
  'e1d10000-0000-4000-8000-000000000001',
  'e1d20000-0000-4000-8000-000000000001',
  'LOGISTICA'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, sale_price, minimum_sale_price, is_active,
  batch_control, expiration_control, created_by, updated_by
)
values
  (
    'e1d30000-0000-4000-8000-000000000001',
    'e1d10000-0000-4000-8000-000000000001',
    'P1D-EXIST', 'Producto existente', 'UND', 'good',
    'gravado', 25, 10, true, false, false,
    'e1d20000-0000-4000-8000-000000000001',
    'e1d20000-0000-4000-8000-000000000001'
  ),
  (
    'e1d30000-0000-4000-8000-000000000002',
    'e1d10000-0000-4000-8000-000000000001',
    'P1D-BLANK', 'Producto precio vacío', 'UND', 'good',
    'gravado', 30, 12, true, false, false,
    'e1d20000-0000-4000-8000-000000000001',
    'e1d20000-0000-4000-8000-000000000001'
  ),
  (
    'e1d30000-0000-4000-8000-000000000003',
    'e1d10000-0000-4000-8000-000000000001',
    'P1D-MIN-EXIST', 'Producto mínimo existente', 'UND', 'good',
    'gravado', 20, 10, true, false, false,
    'e1d20000-0000-4000-8000-000000000001',
    'e1d20000-0000-4000-8000-000000000001'
  ),
  (
    'e1d30000-0000-4000-8000-000000000004',
    'e1d10000-0000-4000-8000-000000000001',
    'P1D-SERVICE', 'Servicio existente', 'UND', 'service',
    'exonerado', 40, null, true, false, false,
    'e1d20000-0000-4000-8000-000000000001',
    'e1d20000-0000-4000-8000-000000000001'
  ),
  (
    'e1d30000-0000-4000-8000-000000000005',
    'e1d10000-0000-4000-8000-000000000001',
    'P1D-INACTIVE', 'Producto inactivo', 'UND', 'good',
    'inafecto', 9, null, false, false, false,
    'e1d20000-0000-4000-8000-000000000001',
    'e1d20000-0000-4000-8000-000000000001'
  ),
  (
    'e1d30000-0000-4000-8000-000000000006',
    'e1d10000-0000-4000-8000-000000000001',
    'P1D-SKIP', 'Producto omitible', 'UND', 'good',
    'gravado', 18, 9, true, false, false,
    'e1d20000-0000-4000-8000-000000000001',
    'e1d20000-0000-4000-8000-000000000001'
  );

create function pg_temp.price_row(
  requested_code text,
  requested_sale_price text,
  requested_minimum_sale_price text default null,
  requested_inc_igv text default 'Pendiente'
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'fila', 2,
    'codigo_producto', requested_code,
    'producto', requested_code,
    'unidad_medida', 'Unidad',
    'precio_venta', requested_sale_price,
    'precio_minimo', requested_minimum_sale_price,
    'inc_igv', requested_inc_igv
  );
$$;

create function pg_temp.import_one(
  requested_code text,
  requested_description text,
  requested_prices jsonb,
  requested_mode text default 'UPDATE'
)
returns jsonb
language sql
as $$
  select public.import_products_partial(
    'e1d10000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'modo', requested_mode,
      'productos', jsonb_build_array(jsonb_build_object(
        'fila', 2,
        'codigo', requested_code,
        'descripcion', requested_description
      )),
      'precios', requested_prices
    )
  );
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1d20000-0000-4000-8000-000000000001',
  true
);

select is(
  (
    public.import_products(
      'e1d10000-0000-4000-8000-000000000001',
      '{
        "productos": [{"fila": 2, "codigo": "P1D-DIRECT", "descripcion": "Importación directa sin precio"}],
        "precios": []
      }'::jsonb
    ) ->> 'estado'
  ),
  'completado',
  'el core reutilizable admite un catálogo sin filas de precio'
);
select is(
  (select sale_price from public.products where code = 'P1D-DIRECT'),
  null::numeric,
  'el core reutilizable crea el producto sin precio'
);

select is(
  (pg_temp.import_one('P1D-NO-PRICE', 'Producto nuevo sin precio', '[]'::jsonb) ->> 'estado'),
  'completado',
  'un producto nuevo sin fila de precio se importa'
);
select is(
  (select sale_price from public.products where code = 'P1D-NO-PRICE'),
  null::numeric,
  'un producto nuevo sin precio conserva sale_price NULL'
);
select is(
  (select minimum_sale_price from public.products where code = 'P1D-NO-PRICE'),
  null::numeric,
  'un producto nuevo sin precio conserva mínimo NULL'
);
select is(
  (select product_type from public.products where code = 'P1D-NO-PRICE'),
  'good',
  'un producto nuevo importado conserva el tipo good por defecto'
);

select is(
  (pg_temp.import_one(
    'P1D-NEW-BLANK',
    'Producto nuevo con precio vacío',
    jsonb_build_array(pg_temp.price_row('P1D-NEW-BLANK', ''))
  ) ->> 'estado'),
  'completado',
  'un precio vacío explícito no rechaza el producto nuevo'
);
select is(
  (select sale_price from public.products where code = 'P1D-NEW-BLANK'),
  null::numeric,
  'un precio vacío se almacena como NULL'
);

select is(
  (pg_temp.import_one(
    'P1D-NEW-ZERO',
    'Producto nuevo con precio cero',
    jsonb_build_array(pg_temp.price_row('P1D-NEW-ZERO', '0'))
  ) ->> 'estado'),
  'completado',
  'el precio cero explícito se importa'
);
select is(
  (select sale_price from public.products where code = 'P1D-NEW-ZERO'),
  0::numeric,
  'el precio cero no se interpreta como ausencia'
);

select is(
  (pg_temp.import_one(
    'P1D-NEW-MIN',
    'Producto nuevo con mínimo',
    jsonb_build_array(pg_temp.price_row('P1D-NEW-MIN', '10', '8'))
  ) ->> 'estado'),
  'completado',
  'un mínimo válido con precio efectivo se importa'
);
select is(
  (select minimum_sale_price from public.products where code = 'P1D-NEW-MIN'),
  8::numeric,
  'el mínimo informado se persiste en un producto nuevo'
);

select is(
  (pg_temp.import_one(
    'P1D-NEW-MIN-BAD',
    'Producto nuevo con mínimo sin venta',
    jsonb_build_array(pg_temp.price_row('P1D-NEW-MIN-BAD', '', '1'))
  ) ->> 'estado'),
  'rechazado',
  'un mínimo sin precio efectivo rechaza únicamente el SKU'
);
select is(
  (
    pg_temp.import_one(
      'P1D-NEW-MIN-BAD-ERROR',
      'Producto nuevo con mínimo inválido',
      jsonb_build_array(pg_temp.price_row('P1D-NEW-MIN-BAD-ERROR', '', '1'))
    ) -> 'filas_rechazadas' -> 0 ->> 'motivo'
  ),
  'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID',
  'el rechazo del mínimo usa un error estable'
);
select is(
  (select count(*) from public.products where code like 'P1D-NEW-MIN-BAD%'),
  0::bigint,
  'un SKU rechazado no deja producto parcial'
);

select is(
  (pg_temp.import_one(
    'P1D-EXIST',
    'Producto existente actualizado',
    '[]'::jsonb
  ) ->> 'estado'),
  'completado',
  'un producto existente sin fila de precio se actualiza'
);
select results_eq(
  $$
    select description, sale_price, minimum_sale_price
    from public.products
    where code = 'P1D-EXIST'
  $$,
  $$values ('Producto existente actualizado'::text, 25::numeric, 10::numeric)$$,
  'la ausencia de precio preserva el precio y mínimo existentes'
);

select is(
  (pg_temp.import_one(
    'P1D-BLANK',
    'Producto precio vacío actualizado',
    jsonb_build_array(pg_temp.price_row('P1D-BLANK', ''))
  ) ->> 'estado'),
  'completado',
  'una fila con precio vacío no borra el precio existente'
);
select results_eq(
  $$
    select sale_price, minimum_sale_price
    from public.products
    where code = 'P1D-BLANK'
  $$,
  $$values (30::numeric, 12::numeric)$$,
  'el precio vacío conserva ambos valores existentes'
);

select is(
  (pg_temp.import_one(
    'P1D-MIN-EXIST',
    'Producto mínimo existente actualizado',
    jsonb_build_array(pg_temp.price_row('P1D-MIN-EXIST', '', '15'))
  ) ->> 'estado'),
  'completado',
  'un mínimo puede actualizarse contra el precio efectivo existente'
);
select results_eq(
  $$
    select sale_price, minimum_sale_price
    from public.products
    where code = 'P1D-MIN-EXIST'
  $$,
  $$values (20::numeric, 15::numeric)$$,
  'el mínimo usa el precio histórico efectivo si la venta viene vacía'
);

select is(
  (pg_temp.import_one(
    'P1D-MIN-EXIST',
    'Producto mínimo existente inválido',
    jsonb_build_array(pg_temp.price_row('P1D-MIN-EXIST', '', '21'))
  ) ->> 'estado'),
  'rechazado',
  'un mínimo superior al precio efectivo se rechaza'
);
select is(
  (select minimum_sale_price from public.products where code = 'P1D-MIN-EXIST'),
  15::numeric,
  'un rechazo de mínimo no modifica el SKU existente'
);

select is(
  (pg_temp.import_one(
    'P1D-EXIST',
    'Producto existente con precio nuevo',
    jsonb_build_array(pg_temp.price_row('P1D-EXIST', '50', '30', 'Sí'))
  ) ->> 'estado'),
  'completado',
  'un precio explícito actualiza el catálogo'
);
select results_eq(
  $$
    select sale_price, minimum_sale_price, tax_affectation
    from public.products
    where code = 'P1D-EXIST'
  $$,
  $$values (50::numeric, 30::numeric, 'gravado'::text)$$,
  'el precio explícito y su mínimo quedan persistidos'
);

select is(
  (pg_temp.import_one(
    'P1D-EXIST',
    'Producto existente con precio cero',
    jsonb_build_array(pg_temp.price_row('P1D-EXIST', '0', '0', 'Sí'))
  ) ->> 'estado'),
  'completado',
  'un precio cero explícito actualiza un producto existente'
);
select results_eq(
  $$
    select sale_price, minimum_sale_price
    from public.products
    where code = 'P1D-EXIST'
  $$,
  $$values (0::numeric, 0::numeric)$$,
  'el cero explícito no activa la preservación del valor anterior'
);

select is(
  (pg_temp.import_one('P1D-SERVICE', 'Servicio actualizado', '[]'::jsonb) ->> 'estado'),
  'completado',
  'un servicio existente puede actualizarse sin precio en el archivo'
);
select is(
  (select product_type from public.products where code = 'P1D-SERVICE'),
  'service',
  'la importación no cambia el tipo service'
);
select is(
  (select sale_price from public.products where code = 'P1D-SERVICE'),
  40::numeric,
  'un servicio conserva su precio no informado'
);

select is(
  (pg_temp.import_one('P1D-INACTIVE', 'Producto inactivo actualizado', '[]'::jsonb) ->> 'estado'),
  'completado',
  'la importación de catálogo no activa un producto inactivo'
);
select is(
  (select is_active from public.products where code = 'P1D-INACTIVE'),
  false,
  'un producto inactivo conserva su estado'
);

select is(
  (pg_temp.import_one('P1D-SKIP', 'Descripción no aplicada', '[]'::jsonb, 'SKIP') ->> 'omitidos'),
  '1',
  'SKIP omite un producto existente sin exigir precio'
);
select is(
  (select description from public.products where code = 'P1D-SKIP'),
  'Producto omitible',
  'SKIP conserva los datos existentes'
);

select is(
  (
    public.import_products_partial(
      'e1d10000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'modo', 'UPDATE',
        'productos', jsonb_build_array(
          jsonb_build_object('fila', 2, 'codigo', 'P1D-MIX-BAD', 'descripcion', 'SKU inválido'),
          jsonb_build_object('fila', 3, 'codigo', 'P1D-MIX-OK', 'descripcion', 'SKU válido sin precio')
        ),
        'precios', jsonb_build_array(
          pg_temp.price_row('P1D-MIX-BAD', '', '1')
        )
      )
    ) ->> 'estado'
  ),
  'parcial',
  'la importación parcial conserva los SKU sin precio válidos'
);
select is(
  (
    select count(*)
    from public.products
    where code in ('P1D-MIX-BAD', 'P1D-MIX-OK')
  ),
  1::bigint,
  'el rechazo de un SKU no revierte el SKU sin precio válido'
);

select is(
  (
    pg_temp.import_one('P1D-IDEMP', 'Producto idempotente sin precio', '[]'::jsonb) ->> 'id_lote'
  ),
  (
    pg_temp.import_one('P1D-IDEMP', 'Producto idempotente sin precio', '[]'::jsonb) ->> 'id_lote'
  ),
  'reintentar la misma importación sin precio devuelve el mismo lote'
);
select is(
  (select count(*) from public.products where code = 'P1D-IDEMP'),
  1::bigint,
  'la idempotencia no duplica el producto sin precio'
);

select is(
  (
    pg_temp.import_one(
      'P1D-IGV-NO',
      'Regresión IncIGV No',
      jsonb_build_array(pg_temp.price_row('P1D-IGV-NO', '12', null, 'No'))
    ) ->> 'estado'
  ),
  'completado',
  'IncIGV No conserva la ruta de importación vigente'
);
select is(
  (select tax_affectation from public.products where code = 'P1D-IGV-NO'),
  'por-definir',
  'P1D no modifica la semántica existente de IncIGV No'
);

select throws_ok(
  $$
    select public.import_products_partial(
      'e1d10000-0000-4000-8000-000000000002',
      '{"modo":"UPDATE","productos":[],"precios":[]}'::jsonb
    )
  $$,
  '42501',
  'PRODUCT_IMPORT_FORBIDDEN',
  'la importación conserva el aislamiento por organización'
);

reset role;

select * from finish();
rollback;
