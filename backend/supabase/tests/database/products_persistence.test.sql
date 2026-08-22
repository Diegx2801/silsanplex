begin;

select plan(54);

select has_table('public', 'products', 'existe el catálogo persistente');
select has_view('public', 'product_catalog_options', 'existe la vista de opciones del catálogo');
select has_column('public', 'products', 'cost', 'products conserva el costo');
select has_column('public', 'products', 'subline', 'products conserva la sublínea');
select has_table(
  'public',
  'product_import_batches',
  'existe la tabla interna de huellas de importación'
);
select has_function(
  'public',
  'import_products',
  array['uuid', 'jsonb'],
  'existe la RPC transaccional de importación'
);

select ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.products'::regclass
  ),
  'products tiene RLS'
);

select is(
  has_table_privilege('authenticated', 'public.products', 'INSERT'),
  true,
  'authenticated puede insertar productos bajo RLS'
);

select is(
  has_table_privilege('authenticated', 'public.product_catalog_options', 'SELECT'),
  true,
  'authenticated puede consultar opciones del catálogo'
);

select is(
  has_table_privilege('authenticated', 'public.product_import_batches', 'SELECT'),
  false,
  'authenticated no puede leer las huellas internas'
);

select is(
  has_table_privilege('authenticated', 'public.product_import_batches', 'INSERT'),
  false,
  'authenticated no puede insertar lotes internos'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.import_products(uuid, jsonb)',
    'EXECUTE'
  ),
  true,
  'authenticated puede ejecutar la RPC protegida'
);

select is(
  has_function_privilege(
    'anon',
    'public.import_products(uuid, jsonb)',
    'EXECUTE'
  ),
  false,
  'anon no puede ejecutar la RPC de importación'
);

select ok(
  position(
    'SECURITY DEFINER'
    in upper(pg_get_functiondef('public.import_products(uuid, jsonb)'::regprocedure))
  ) > 0,
  'la RPC usa security definer'
);

select ok(
  pg_get_functiondef('public.import_products(uuid, jsonb)'::regprocedure)
    ~* $$SET search_path (TO|=) ''$$,
  'la RPC fija un search_path vacío'
);

insert into public.organizations (id, name, slug)
values
  (
    'a1111111-1111-4111-8111-111111111111',
    'Productos persistentes uno',
    'productos-persistentes-uno'
  ),
  (
    'a2222222-2222-4222-8222-222222222222',
    'Productos persistentes dos',
    'productos-persistentes-dos'
  );

insert into auth.users (
  id,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  'a3111111-1111-4111-8111-111111111111',
  'productos.persistentes@test.local',
  '{"full_name":"Administrador de productos"}'::jsonb,
  now(),
  now()
), (
  'a4111111-1111-4111-8111-111111111111',
  'productos.ventas@test.local',
  '{"full_name":"Ventas de productos"}'::jsonb,
  now(),
  now()
), (
  'a4222222-2222-4222-8222-222222222222',
  'productos.dos@test.local',
  '{"full_name":"Administrador de productos dos"}'::jsonb,
  now(),
  now()
);

insert into public.organization_memberships (organization_id, user_id)
values
  (
    'a1111111-1111-4111-8111-111111111111',
    'a3111111-1111-4111-8111-111111111111'
  ),
  (
    'a1111111-1111-4111-8111-111111111111',
    'a4111111-1111-4111-8111-111111111111'
  ),
  (
    'a2222222-2222-4222-8222-222222222222',
    'a4222222-2222-4222-8222-222222222222'
  );

insert into public.user_roles (organization_id, user_id, role_code)
values
  (
    'a1111111-1111-4111-8111-111111111111',
    'a3111111-1111-4111-8111-111111111111',
    'LOGISTICA'
  ),
  (
    'a1111111-1111-4111-8111-111111111111',
    'a4111111-1111-4111-8111-111111111111',
    'VENTAS'
  ),
  (
    'a2222222-2222-4222-8222-222222222222',
    'a4222222-2222-4222-8222-222222222222',
    'LOGISTICA'
  );

create temporary table product_import_test_payloads (
  name text primary key,
  payload jsonb not null
);

insert into product_import_test_payloads (name, payload)
values
  (
    'valid',
    $$
      {
        "productos": [
          {
            "fila": 2,
            "codigo": "IMP-001",
            "descripcion": "Producto importado uno",
            "categoria": "Linea importada",
            "sublinea": "Sublinea importada",
            "laboratorio": "Laboratorio uno"
          },
          {
            "fila": 3,
            "codigo": "IMP-002",
            "descripcion": "Producto importado dos",
            "categoria": "Linea importada",
            "sublinea": "Sublinea importada",
            "laboratorio": "Laboratorio dos"
          },
          {
            "fila": 4,
            "codigo": "IMP-003",
            "descripcion": "Producto importado tres",
            "categoria": "Linea importada",
            "sublinea": "Sublinea importada",
            "laboratorio": "Laboratorio tres"
          },
          {
            "fila": 5,
            "codigo": "IMP-003",
            "descripcion": "Producto importado tres",
            "categoria": "Linea importada",
            "sublinea": "Sublinea importada",
            "laboratorio": "Laboratorio tres"
          }
        ],
        "precios": [
          {
            "fila": 2,
            "codigo_producto": "IMP-001",
            "producto": "Producto importado uno",
            "unidad_medida": "Caja",
            "precio_venta": 15.50,
            "inc_igv": "Sí"
          },
          {
            "fila": 20,
            "codigo_producto": "IMP-001",
            "producto": "Producto importado uno",
            "unidad_medida": "Caja",
            "precio_venta": 15.50,
            "inc_igv": "Sí"
          },
          {
            "fila": 3,
            "codigo_producto": "IMP-002",
            "producto": "Producto importado dos",
            "unidad_medida": "Unidad",
            "precio_venta": 0,
            "inc_igv": "No"
          },
          {
            "fila": 4,
            "codigo_producto": "IMP-003",
            "producto": "Producto importado tres",
            "unidad_medida": "Paquete",
            "precio_venta": 8.00,
            "inc_igv": "pendiente"
          },
          {
            "fila": 30,
            "codigo_producto": "IMP-003",
            "producto": "Producto importado tres",
            "unidad_medida": "Paquete",
            "precio_venta": 8.00,
            "inc_igv": "pendiente"
          }
        ]
      }
    $$::jsonb
  ),
  (
    'duplicate_conflict',
    $$
      {
        "productos": [
          {
            "fila": 10,
            "codigo": "IMP-004",
            "descripcion": "Producto ambiguo",
            "categoria": "Linea importada",
            "sublinea": null,
            "laboratorio": "Laboratorio cuatro"
          },
          {
            "fila": 11,
            "codigo": "IMP-004",
            "descripcion": "Producto ambiguo diferente",
            "categoria": "Linea importada",
            "sublinea": null,
            "laboratorio": "Laboratorio cuatro"
          },
          {
            "fila": 12,
            "codigo": "IMP-005",
            "descripcion": "Producto rollback",
            "categoria": "Linea importada",
            "sublinea": null,
            "laboratorio": "Laboratorio cinco"
          }
        ],
        "precios": [
          {
            "fila": 10,
            "codigo_producto": "IMP-004",
            "producto": "Producto ambiguo",
            "unidad_medida": "Caja",
            "precio_venta": 10,
            "inc_igv": "Sí"
          },
          {
            "fila": 11,
            "codigo_producto": "IMP-004",
            "producto": "Producto ambiguo",
            "unidad_medida": "Caja",
            "precio_venta": 11,
            "inc_igv": "Sí"
          },
          {
            "fila": 12,
            "codigo_producto": "IMP-005",
            "producto": "Producto rollback",
            "unidad_medida": "Unidad",
            "precio_venta": 5,
            "inc_igv": "No"
          }
        ]
      }
    $$::jsonb
  ),
  (
    'existing_conflict',
    $$
      {
        "productos": [
          {
            "fila": 50,
            "codigo": "MED-001",
            "descripcion": "Producto existente cambiado",
            "categoria": "Línea prueba",
            "sublinea": "Sublínea prueba",
            "laboratorio": "Marca prueba"
          }
        ],
        "precios": [
          {
            "fila": 50,
            "codigo_producto": "MED-001",
            "producto": "Producto existente cambiado",
            "unidad_medida": "Unidad",
            "precio_venta": 15,
            "inc_igv": "No"
          }
        ]
      }
    $$::jsonb
  );

grant select on product_import_test_payloads to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a3111111-1111-4111-8111-111111111111',
  true
);

select lives_ok(
  $$
    insert into public.products (
      organization_id,
       code,
       description,
       barcode,
       category,
      subline,
      laboratory,
      unit_of_measure,
      cost,
      sale_price,
      created_by,
      updated_by
    )
    values (
      'a1111111-1111-4111-8111-111111111111',
       'MED-001',
       'Producto persistente',
       '775000000001',
       'Línea prueba',
      'Sublínea prueba',
      'Marca prueba',
      'Unidad',
      10.50,
      15.00,
      'a3111111-1111-4111-8111-111111111111',
      'a3111111-1111-4111-8111-111111111111'
    )
  $$,
  'un miembro autorizado puede crear un producto'
);

select is(
  (
    select cost
    from public.products
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and code = 'MED-001'
  ),
  10.50::numeric,
  'el producto conserva el costo'
);

select is(
  (
    select subline
    from public.products
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and code = 'MED-001'
  ),
  'Sublínea prueba',
  'el producto conserva la sublínea'
);

select results_eq(
  $$
    select category, laboratory
    from public.product_catalog_options
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
  $$,
  $$values ('Línea prueba'::text, 'Marca prueba'::text)$$,
  'la vista expone opciones únicamente de la organización'
);

select lives_ok(
  $$
    update public.products
    set description = 'Producto persistente editado',
        cost = 11.25,
        updated_by = 'a3111111-1111-4111-8111-111111111111'
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and code = 'MED-001'
  $$,
  'un miembro autorizado puede editar el producto'
);

select is(
  (
    select description
    from public.products
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and code = 'MED-001'
  ),
  'Producto persistente editado',
  'la edición queda persistida'
);

select throws_ok(
  $$
    insert into public.products (
      organization_id,
      code,
      description,
      created_by,
      updated_by
    )
    values (
      'a1111111-1111-4111-8111-111111111111',
      'MED-001',
      'Código duplicado',
      'a3111111-1111-4111-8111-111111111111',
      'a3111111-1111-4111-8111-111111111111'
    )
  $$,
  '23505',
  null,
  'el código interno no se duplica dentro de la organización'
);

select throws_ok(
  $$
    insert into public.products (
      organization_id,
      code,
      description,
      barcode,
      created_by,
      updated_by
    )
    values (
      'a1111111-1111-4111-8111-111111111111',
      'MED-002',
      'Código de barras duplicado',
      '775000000001',
      'a3111111-1111-4111-8111-111111111111',
      'a3111111-1111-4111-8111-111111111111'
    )
  $$,
  '23505',
  null,
  'el código de barras no se duplica dentro de la organización'
);

select throws_ok(
  $$
    insert into public.products (
      organization_id,
      code,
      description,
      created_by,
      updated_by
    )
    values (
      'a2222222-2222-4222-8222-222222222222',
      'MED-003',
      'Otra organización',
      'a3111111-1111-4111-8111-111111111111',
      'a3111111-1111-4111-8111-111111111111'
    )
  $$,
  '42501',
  null,
  'RLS impide insertar productos de otra organización'
);

select throws_ok(
  $$
    insert into public.products (
      organization_id,
      code,
      description,
      cost,
      created_by,
      updated_by
    )
    values (
      'a1111111-1111-4111-8111-111111111111',
      'MED-004',
      'Costo inválido',
      -1,
      'a3111111-1111-4111-8111-111111111111',
      'a3111111-1111-4111-8111-111111111111'
    )
  $$,
  '23514',
  null,
  'la base de datos rechaza costos negativos'
);

select is(
  (
    select count(*)
    from public.products
    where organization_id = 'a2222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'el miembro no observa productos de otra organización'
);

select throws_ok(
  $$
    select public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      '{"productos":[]}'::jsonb
    )
  $$,
  'P0001',
  'PRODUCT_IMPORT_INVALID_PAYLOAD',
  'un payload sin las dos colecciones requeridas usa un error seguro'
);

select lives_ok(
  $$
    select public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'valid')
    )
  $$,
  'PRODUCTS_MANAGE importa un lote válido'
);

select is(
  (
    public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'valid')
    ) ->> 'estado'
  ),
  'completado',
  'la importación válida queda completada'
);

select is(
  (
    public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'valid')
    ) ->> 'creados'
  ),
  '3',
  'la importación devuelve tres productos creados'
);

select is(
  (
    public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'valid')
    ) ->> 'sin_cambios'
  ),
  '0',
  'el primer lote no reporta productos sin cambios'
);

select is(
  public.import_products(
    'a1111111-1111-4111-8111-111111111111',
    (select payload from product_import_test_payloads where name = 'valid')
  ) -> 'filas_rechazadas',
  '[]'::jsonb,
  'la importación válida no rechaza filas'
);

select results_eq(
  $$
    select code, unit_of_measure, sale_price, tax_affectation
    from public.products
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and code in ('IMP-001', 'IMP-002', 'IMP-003')
    order by code
  $$,
  $$
    values
      ('IMP-001'::text, 'Caja'::text, 15.50::numeric, 'gravado'::text),
      ('IMP-002'::text, 'Unidad'::text, 0.00::numeric, 'por-definir'::text),
      ('IMP-003'::text, 'Paquete'::text, 8.00::numeric, 'por-definir'::text)
  $$,
  'la medida y la afectación de IGV se mapean sin inventar categorías'
);

select is(
  (
    public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'valid')
    ) ->> 'id_lote'
  ),
  (
    public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'valid')
    ) ->> 'id_lote'
  ),
  'repetir la huella devuelve el mismo lote'
);

select is(
  (
    select count(*)
    from public.products
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and code in ('IMP-001', 'IMP-002', 'IMP-003')
  ),
  3::bigint,
  'las filas idénticas se consolidan y no duplican productos'
);

select lives_ok(
  $$
    select public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'duplicate_conflict')
    )
  $$,
  'un lote con duplicados distintos devuelve un rechazo de dominio'
);

select is(
  (
    public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'duplicate_conflict')
    ) ->> 'estado'
  ),
  'rechazado',
  'los duplicados distintos rechazan el lote completo'
);

select is(
  jsonb_array_length(
    public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'duplicate_conflict')
    ) -> 'filas_rechazadas'
  ),
  2,
  'se informan el conflicto de producto y el de precio'
);

select is(
  (
    select count(*)
    from public.products
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and code in ('IMP-004', 'IMP-005')
  ),
  0::bigint,
  'un rechazo no deja inserciones parciales'
);

select lives_ok(
  $$
    select public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'existing_conflict')
    )
  $$,
  'un conflicto con un producto existente devuelve un rechazo'
);

select is(
  (
    public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'existing_conflict')
    ) ->> 'estado'
  ),
  'rechazado',
  'un producto existente diferente no se sobrescribe'
);

select is(
  (
    select description
    from public.products
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and code = 'MED-001'
  ),
  'Producto persistente editado',
  'el conflicto existente conserva los datos originales'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a4111111-1111-4111-8111-111111111111',
  true
);

select throws_ok(
  $$
    select public.import_products(
      'a1111111-1111-4111-8111-111111111111',
      (select payload from product_import_test_payloads where name = 'valid')
    )
  $$,
  '42501',
  'PRODUCT_IMPORT_FORBIDDEN',
  'VENTAS no puede importar productos'
);

select throws_ok(
  $$
    select public.import_products(
      'a2222222-2222-4222-8222-222222222222',
      (select payload from product_import_test_payloads where name = 'valid')
    )
  $$,
  '42501',
  'PRODUCT_IMPORT_FORBIDDEN',
  'una identidad no puede importar en otra organización'
);

select set_config(
  'request.jwt.claim.sub',
  'a4222222-2222-4222-8222-222222222222',
  true
);

select lives_ok(
  $$
    select public.import_products(
      'a2222222-2222-4222-8222-222222222222',
      (select payload from product_import_test_payloads where name = 'valid')
    )
  $$,
  'la misma huella se procesa de forma independiente en otra organización'
);

select is(
  (
    select count(*)
    from public.products
    where organization_id = 'a2222222-2222-4222-8222-222222222222'
  ),
  3::bigint,
  'la segunda organización solo ve sus productos importados'
);

select is(
  (
    select count(*)
    from public.products
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  0::bigint,
  'la segunda organización no observa productos de la primera'
);

reset role;

select is(
  (
    select count(*)
    from public.product_import_batches
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  3::bigint,
  'la idempotencia evita crear huellas adicionales en la primera organización'
);

select is(
  (
    select count(*)
    from public.product_import_batches
    where organization_id = 'a2222222-2222-4222-8222-222222222222'
  ),
  1::bigint,
  'la huella se almacena separada por organización'
);

select is(
  (
    select count(*)
    from public.product_import_batches
  ),
  4::bigint,
  'cada resultado nuevo conserva un lote interno'
);

select is(
  (
    select count(*)
    from public.audit_events
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and action = 'PRODUCT_IMPORT_COMPLETED'
  ),
  1::bigint,
  'la importación válida deja auditoría de operación'
);

select is(
  (
    select count(*)
    from public.audit_events
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and action = 'PRODUCT_IMPORT_REJECTED'
  ),
  2::bigint,
  'los lotes rechazados también dejan auditoría de operación'
);

select ok(
  (
    select count(*) >= 5
    from public.audit_events
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and entity_type = 'product'
  ),
  'los productos importados conservan la auditoría de sus triggers'
);

select ok(
  (
    select count(*) >= 2
    from public.audit_events
    where organization_id = 'a1111111-1111-4111-8111-111111111111'
      and entity_type = 'product'
  ),
  'crear y editar productos generan auditoría'
);

select * from finish();

rollback;
