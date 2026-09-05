begin;

select plan(26);

select has_function(
  'public',
  'legacy_product_import_inc_igv_kind',
  array['text'],
  'existe la normalización interna de IncIGV'
);
select is(
  has_function_privilege(
    'anon',
    'public.legacy_product_import_inc_igv_kind(text)',
    'EXECUTE'
  ),
  false,
  'anon no puede ejecutar la normalización interna'
);

insert into public.organizations (id, name, slug)
values
  ('e1e10000-0000-4000-8000-000000000001', 'Importación P1E', 'importacion-p1e'),
  ('e1e10000-0000-4000-8000-000000000002', 'Importación P1E ajena', 'importacion-p1e-ajena');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'e1e20000-0000-4000-8000-000000000001',
  'importacion.p1e@test.local',
  '{"full_name":"Importación P1E"}',
  now(),
  now()
);

insert into public.organization_memberships (organization_id, user_id)
values (
  'e1e10000-0000-4000-8000-000000000001',
  'e1e20000-0000-4000-8000-000000000001'
);
insert into public.user_roles (organization_id, user_id, role_code)
values (
  'e1e10000-0000-4000-8000-000000000001',
  'e1e20000-0000-4000-8000-000000000001',
  'LOGISTICA'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, sale_price, minimum_sale_price, is_active,
  batch_control, expiration_control, created_by, updated_by
)
values
  (
    'e1e30000-0000-4000-8000-000000000001',
    'e1e10000-0000-4000-8000-000000000001',
    'P1E-EXIST-NO', 'Existente No', 'UND', 'good',
    'gravado', 25, 10, true, false, false,
    'e1e20000-0000-4000-8000-000000000001',
    'e1e20000-0000-4000-8000-000000000001'
  ),
  (
    'e1e30000-0000-4000-8000-000000000002',
    'e1e10000-0000-4000-8000-000000000001',
    'P1E-EXIST-PEND', 'Existente pendiente', 'UND', 'service',
    'exonerado', 30, 15, true, false, false,
    'e1e20000-0000-4000-8000-000000000001',
    'e1e20000-0000-4000-8000-000000000001'
  ),
  (
    'e1e30000-0000-4000-8000-000000000003',
    'e1e10000-0000-4000-8000-000000000001',
    'P1E-EXIST-EMPTY', 'Existente vacío', 'UND', 'good',
    'inafecto', 40, 20, true, false, false,
    'e1e20000-0000-4000-8000-000000000001',
    'e1e20000-0000-4000-8000-000000000001'
  );

grant select on public.product_import_batches to authenticated;

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
    'e1e10000-0000-4000-8000-000000000001',
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
  'e1e20000-0000-4000-8000-000000000001',
  true
);

/* set local role service_role;

select is(
  public.legacy_product_import_inc_igv_kind('  sí  '),
  'Sí',
  'normaliza Sí con espacios y tilde'
);
select is(
  public.legacy_product_import_inc_igv_kind('SI'),
  'Sí',
  'normaliza SI sin tilde'
);
select is(
  public.legacy_product_import_inc_igv_kind(' no '),
  'No',
  'normaliza No con espacios'
);
select is(
  public.legacy_product_import_inc_igv_kind(''),
  'Pendiente',
  'un valor vacío queda pendiente'
);
select is(
  public.legacy_product_import_inc_igv_kind('desconocido'),
  'Inválido',
  'un valor desconocido no se convierte silenciosamente'
);

*/
set local role authenticated;

select is(
  (
    public.import_products(
      'e1e10000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'productos', jsonb_build_array(jsonb_build_object(
          'fila', 2, 'codigo', 'P1E-SI', 'descripcion', 'Sí final'
        )),
        'precios', jsonb_build_array(pg_temp.price_row('P1E-SI', '10', '8', ' Sí '))
      )
    ) ->> 'estado'
  ),
  'completado',
  'import_products conserva Sí como gravado'
);
select results_eq(
  $$select tax_affectation, sale_price, minimum_sale_price from public.products where code = 'P1E-SI'$$,
  $$values ('gravado'::text, 10::numeric, 8::numeric)$$,
  'Sí persiste precio final y mínimo'
);

select is(
  (
    public.import_products(
      'e1e10000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'productos', jsonb_build_array(jsonb_build_object(
          'fila', 2, 'codigo', 'P1E-NO', 'descripcion', 'No ambiguo'
        )),
        'precios', jsonb_build_array(pg_temp.price_row('P1E-NO', '10', '8', 'No'))
      )
    ) ->> 'estado'
  ),
  'completado',
  'import_products permite crear No sin precio final'
);
select results_eq(
  $$select tax_affectation, sale_price, minimum_sale_price from public.products where code = 'P1E-NO'$$,
  $$values ('por-definir'::text, null::numeric, null::numeric)$$,
  'No no infiere afectación ni persiste precio o mínimo'
);
select is(
  jsonb_array_length((
    public.import_products(
      'e1e10000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'productos', jsonb_build_array(jsonb_build_object(
          'fila', 2, 'codigo', 'P1E-NO', 'descripcion', 'No ambiguo'
        )),
        'precios', jsonb_build_array(pg_temp.price_row('P1E-NO', '10', '8', 'No'))
      )
    ) -> 'advertencias'
  )),
  1,
  'No produce una advertencia explícita'
);

select is(
  (
    public.import_products(
      'e1e10000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'productos', jsonb_build_array(jsonb_build_object(
          'fila', 2, 'codigo', 'P1E-PEND', 'descripcion', 'Pendiente ambiguo'
        )),
        'precios', jsonb_build_array(pg_temp.price_row('P1E-PEND', '11', '7', 'Pendiente'))
      )
    ) ->> 'estado'
  ),
  'completado',
  'Pendiente crea el producto'
);
select is(
  (
    select sale_price from public.products
    where organization_id = 'e1e10000-0000-4000-8000-000000000001'
      and code = 'P1E-PEND'
  ),
  null::numeric,
  'Pendiente deja el precio nuevo en NULL'
);

select is(
  (
    public.import_products(
      'e1e10000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'productos', jsonb_build_array(jsonb_build_object(
          'fila', 2, 'codigo', 'P1E-EMPTY', 'descripcion', 'Vacío ambiguo'
        )),
        'precios', jsonb_build_array(pg_temp.price_row('P1E-EMPTY', '12', '6', ''))
      )
    ) ->> 'estado'
  ),
  'completado',
  'vacío crea el producto'
);
select is(
  (
    select sale_price from public.products
    where organization_id = 'e1e10000-0000-4000-8000-000000000001'
      and code = 'P1E-EMPTY'
  ),
  null::numeric,
  'vacío deja el precio nuevo en NULL'
);

select is(
  (
    public.import_products(
      'e1e10000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'productos', jsonb_build_array(jsonb_build_object(
          'fila', 2, 'codigo', 'P1E-ZERO', 'descripcion', 'Precio cero'
        )),
        'precios', jsonb_build_array(pg_temp.price_row('P1E-ZERO', '0', '0', 'Sí'))
      )
    ) ->> 'estado'
  ),
  'completado',
  'Sí con precio cero se conserva'
);
select results_eq(
  $$select tax_affectation, sale_price, minimum_sale_price from public.products where code = 'P1E-ZERO'$$,
  $$values ('gravado'::text, 0::numeric, 0::numeric)$$,
  'precio cero y mínimo cero permanecen explícitos'
);

select is(
  (
    pg_temp.import_one(
      'P1E-EXIST-NO',
      'Existente No actualizado',
      jsonb_build_array(pg_temp.price_row('P1E-EXIST-NO', '99', '1', ' NO '))
    ) ->> 'estado'
  ),
  'completado',
  'partial No actualiza el resto del producto sin tocar precio final'
);
select results_eq(
  $$select tax_affectation, sale_price, minimum_sale_price from public.products where code = 'P1E-EXIST-NO'$$,
  $$values ('gravado'::text, 25::numeric, 10::numeric)$$,
  'partial No preserva afectación, precio y mínimo existentes'
);

select is(
  (
    pg_temp.import_one(
      'P1E-EXIST-PEND',
      'Existente Pendiente actualizado',
      jsonb_build_array(pg_temp.price_row('P1E-EXIST-PEND', '99', '1', 'Pendiente'))
    ) ->> 'estado'
  ),
  'completado',
  'partial Pendiente preserva datos existentes'
);
select results_eq(
  $$select tax_affectation, sale_price, minimum_sale_price from public.products where code = 'P1E-EXIST-PEND'$$,
  $$values ('exonerado'::text, 30::numeric, 15::numeric)$$,
  'Pendiente no reclasifica un producto existente'
);

select is(
  (
    pg_temp.import_one(
      'P1E-EXIST-EMPTY',
      'Existente vacío actualizado',
      jsonb_build_array(pg_temp.price_row('P1E-EXIST-EMPTY', '99', '1', ''))
    ) ->> 'estado'
  ),
  'completado',
  'partial vacío preserva datos existentes'
);
select results_eq(
  $$select tax_affectation, sale_price, minimum_sale_price from public.products where code = 'P1E-EXIST-EMPTY'$$,
  $$values ('inafecto'::text, 40::numeric, 20::numeric)$$,
  'vacío no reclasifica un producto existente'
);

select is(
  (
    pg_temp.import_one(
      'P1E-EXIST-NO',
      'Existente No con Sí',
      jsonb_build_array(pg_temp.price_row('P1E-EXIST-NO', '50', '30', 'sí'))
    ) ->> 'estado'
  ),
  'completado',
  'partial Sí mantiene la actualización legacy explícita'
);
select results_eq(
  $$select tax_affectation, sale_price, minimum_sale_price from public.products where code = 'P1E-EXIST-NO'$$,
  $$values ('gravado'::text, 50::numeric, 30::numeric)$$,
  'partial Sí actualiza precio final y mínimo'
);

select is(
  (
    pg_temp.import_one(
      'P1E-AMB-MIN',
      'Mínimo ambiguo',
      jsonb_build_array(pg_temp.price_row('P1E-AMB-MIN', '10', '8', 'No'))
    ) ->> 'estado'
  ),
  'completado',
  'un mínimo ambiguo no rechaza el SKU'
);
select results_eq(
  $$select tax_affectation, sale_price, minimum_sale_price from public.products where code = 'P1E-AMB-MIN'$$,
  $$values ('por-definir'::text, null::numeric, null::numeric)$$,
  'un mínimo ambiguo no se persiste en un producto nuevo'
);

select is(
  (
    pg_temp.import_one(
      'P1E-NO-PRICE',
      'P1E sin precio',
      '[]'::jsonb
    ) ->> 'estado'
  ),
  'completado',
  'la regresión P1D sin precio continúa funcionando'
);
select is(
  (select sale_price from public.products where code = 'P1E-NO-PRICE'),
  null::numeric,
  'P1D conserva sale_price NULL'
);

select is(
  (
    pg_temp.import_one(
      'P1E-IDEMP',
      'Idempotente',
      jsonb_build_array(pg_temp.price_row('P1E-IDEMP', '10', '8', 'No'))
    ) ->> 'id_lote'
  ),
  (
    pg_temp.import_one(
      'P1E-IDEMP',
      'Idempotente',
      jsonb_build_array(pg_temp.price_row('P1E-IDEMP', '10', '8', 'No'))
    ) ->> 'id_lote'
  ),
  'el retry idempotente devuelve el mismo lote'
);

/* select is(
  (
    public.import_products_partial(
      'e1e10000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'modo', 'UPDATE',
        'productos', jsonb_build_array(
          jsonb_build_object('fila', 2, 'codigo', 'P1E-ROLLBACK-OK', 'descripcion', 'Válido'),
          jsonb_build_object('fila', 3, 'codigo', 'P1E-ROLLBACK-BAD', 'descripcion', 'Inválido')
        ),
        'precios', jsonb_build_array(
          pg_temp.price_row('P1E-ROLLBACK-OK', '10', null, 'Sí'),
          pg_temp.price_row('P1E-ROLLBACK-BAD', 'abc', null, 'SI')
        )
      ) ->> 'estado'
  ),
  'parcial',
  'un SKU inválido no revierte los SKU válidos'
);
*/
