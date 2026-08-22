begin;

select plan(16);

select has_table('public', 'products', 'existe el catálogo persistente');
select has_column('public', 'products', 'cost', 'products conserva el costo');
select has_column('public', 'products', 'subline', 'products conserva la sublínea');

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
);

insert into public.organization_memberships (organization_id, user_id)
values (
  'a1111111-1111-4111-8111-111111111111',
  'a3111111-1111-4111-8111-111111111111'
);

insert into public.user_roles (organization_id, user_id, role_code)
values (
  'a1111111-1111-4111-8111-111111111111',
  'a3111111-1111-4111-8111-111111111111',
  'LOGISTICA'
);

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

reset role;

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
