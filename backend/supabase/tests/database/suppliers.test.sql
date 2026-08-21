begin;

select plan(32);

-- -------------------------------------------------------------------------
-- Estructura, capacidades y privilegios
-- -------------------------------------------------------------------------

select has_table('public', 'suppliers', 'existe el maestro de proveedores');
select has_function(
  'public',
  'has_organization_permission',
  array['uuid', 'text'],
  'existe la comprobación de capacidades por organización'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.suppliers'::regclass
  ),
  true,
  'suppliers tiene RLS'
);

select is(
  has_table_privilege('anon', 'public.suppliers', 'SELECT'),
  false,
  'anon no puede consultar proveedores'
);
select is(
  has_column_privilege('authenticated', 'public.suppliers', 'business_name', 'SELECT'),
  true,
  'authenticated puede consultar el directorio de proveedores bajo RLS'
);
select is(
  has_column_privilege('authenticated', 'public.suppliers', 'bank_account', 'SELECT'),
  false,
  'authenticated no puede leer cuentas bancarias desde el Data API'
);
select is(
  has_column_privilege('authenticated', 'public.suppliers', 'detraccion_account', 'SELECT'),
  false,
  'authenticated no puede leer cuentas de detraccion desde el Data API'
);
select is(
  has_table_privilege('authenticated', 'public.suppliers', 'INSERT'),
  true,
  'authenticated puede registrar proveedores bajo RLS'
);
select is(
  has_table_privilege('authenticated', 'public.suppliers', 'UPDATE'),
  true,
  'authenticated puede editar proveedores bajo RLS'
);
select is(
  has_table_privilege('authenticated', 'public.suppliers', 'DELETE'),
  false,
  'authenticated no puede eliminar proveedores físicamente'
);

select is(
  (select count(*) from public.permissions where code like 'SUPPLIERS_%'),
  2::bigint,
  'existen capacidades separadas de consulta y administración'
);
select is(
  (
    select count(*)
    from public.role_permissions
    where role_code = 'COMPRAS'
      and permission_code in ('SUPPLIERS_VIEW', 'SUPPLIERS_MANAGE')
  ),
  2::bigint,
  'COMPRAS puede consultar y administrar proveedores'
);
select is(
  (
    select count(*)
    from public.role_permissions
    where role_code = 'GERENCIA'
      and permission_code = 'SUPPLIERS_VIEW'
  ),
  1::bigint,
  'GERENCIA recibe acceso de consulta'
);

-- -------------------------------------------------------------------------
-- Organizaciones e identidades aisladas
-- -------------------------------------------------------------------------

insert into public.organizations (id, name, slug)
values
  (
    'a1111111-1111-4111-8111-111111111111',
    'Empresa proveedores uno',
    'proveedores-uno'
  ),
  (
    'a2222222-2222-4222-8222-222222222222',
    'Empresa proveedores dos',
    'proveedores-dos'
  );

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  (
    'b1111111-1111-4111-8111-111111111111',
    'compras.uno@test.local',
    '{"full_name":"Compras uno"}'::jsonb,
    now(),
    now()
  ),
  (
    'b2222222-2222-4222-8222-222222222222',
    'gerencia.uno@test.local',
    '{"full_name":"Gerencia uno"}'::jsonb,
    now(),
    now()
  ),
  (
    'b3333333-3333-4333-8333-333333333333',
    'ventas.uno@test.local',
    '{"full_name":"Ventas uno"}'::jsonb,
    now(),
    now()
  ),
  (
    'b4444444-4444-4444-8444-444444444444',
    'compras.dos@test.local',
    '{"full_name":"Compras dos"}'::jsonb,
    now(),
    now()
  );

insert into public.organization_memberships (organization_id, user_id)
values
  ('a1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111'),
  ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222'),
  ('a1111111-1111-4111-8111-111111111111', 'b3333333-3333-4333-8333-333333333333'),
  ('a2222222-2222-4222-8222-222222222222', 'b4444444-4444-4444-8444-444444444444');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('a1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'COMPRAS'),
  ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222', 'GERENCIA'),
  ('a1111111-1111-4111-8111-111111111111', 'b3333333-3333-4333-8333-333333333333', 'VENTAS'),
  ('a2222222-2222-4222-8222-222222222222', 'b4444444-4444-4444-8444-444444444444', 'COMPRAS');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1111111-1111-4111-8111-111111111111',
  true
);

select ok(
  public.has_organization_permission(
    'a1111111-1111-4111-8111-111111111111',
    'SUPPLIERS_VIEW'
  ),
  'COMPRAS puede consultar proveedores de su organización'
);
select ok(
  public.has_organization_permission(
    'a1111111-1111-4111-8111-111111111111',
    'SUPPLIERS_MANAGE'
  ),
  'COMPRAS puede administrar proveedores de su organización'
);

select lives_ok(
  $$
    insert into public.suppliers (
      id,
      organization_id,
      document_type,
      document_number,
      business_name,
      category,
      created_by,
      updated_by
    )
    values (
      'c1111111-1111-4111-8111-111111111111',
      'a1111111-1111-4111-8111-111111111111',
      'ruc',
      '20123456789',
      'Proveedor organización uno',
      'frecuente',
      'b1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111'
    )
  $$,
  'COMPRAS registra un proveedor en su organización'
);

select throws_ok(
  $$
    insert into public.suppliers (
      organization_id,
      document_type,
      document_number,
      business_name,
      created_by,
      updated_by
    )
    values (
      'a2222222-2222-4222-8222-222222222222',
      'ruc',
      '20999999999',
      'Proveedor ajeno',
      'b1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111'
    )
  $$,
  '42501',
  null,
  'RLS impide registrar proveedores en otra organización'
);

select is(
  (select count(*) from public.suppliers),
  1::bigint,
  'COMPRAS solo consulta proveedores de su organización'
);

select lives_ok(
  $$
    update public.suppliers
    set
      category = 'estrategico',
      updated_by = 'b1111111-1111-4111-8111-111111111111'
    where id = 'c1111111-1111-4111-8111-111111111111'
  $$,
  'COMPRAS actualiza la clasificación'
);

select throws_ok(
  $$delete from public.suppliers where id = 'c1111111-1111-4111-8111-111111111111'$$,
  '42501',
  null,
  'el frontend no puede eliminar físicamente'
);

reset role;

-- GERENCIA puede leer, pero no escribir.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b2222222-2222-4222-8222-222222222222',
  true
);

select ok(
  public.has_organization_permission(
    'a1111111-1111-4111-8111-111111111111',
    'SUPPLIERS_VIEW'
  ),
  'GERENCIA puede consultar'
);
select ok(
  not public.has_organization_permission(
    'a1111111-1111-4111-8111-111111111111',
    'SUPPLIERS_MANAGE'
  ),
  'GERENCIA no puede administrar'
);
select is(
  (select count(*) from public.suppliers),
  1::bigint,
  'GERENCIA consulta el maestro de su organización'
);
update public.suppliers
set
  notes = 'Cambio no autorizado',
  updated_by = 'b2222222-2222-4222-8222-222222222222'
where id = 'c1111111-1111-4111-8111-111111111111';

select is(
  (
    select notes
    from public.suppliers
    where id = 'c1111111-1111-4111-8111-111111111111'
  ),
  null::text,
  'GERENCIA no modifica el proveedor'
);

reset role;

-- VENTAS no recibe ninguna capacidad del módulo.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b3333333-3333-4333-8333-333333333333',
  true
);
select is(
  (select count(*) from public.suppliers),
  0::bigint,
  'un rol sin capacidad no obtiene filas'
);
reset role;

-- La segunda organización puede reutilizar el mismo documento sin colisión.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b4444444-4444-4444-8444-444444444444',
  true
);
select lives_ok(
  $$
    insert into public.suppliers (
      id,
      organization_id,
      document_type,
      document_number,
      business_name,
      created_by,
      updated_by
    )
    values (
      'c2222222-2222-4222-8222-222222222222',
      'a2222222-2222-4222-8222-222222222222',
      'ruc',
      '20123456789',
      'Proveedor organización dos',
      'b4444444-4444-4444-8444-444444444444',
      'b4444444-4444-4444-8444-444444444444'
    )
  $$,
  'el documento puede repetirse en otra organización'
);
select is(
  (select count(*) from public.suppliers),
  1::bigint,
  'la segunda organización solo consulta su fila'
);
reset role;

select throws_ok(
  $$
    insert into public.suppliers (
      organization_id,
      document_type,
      document_number,
      business_name,
      created_by,
      updated_by
    )
    values (
      'a1111111-1111-4111-8111-111111111111',
      'ruc',
      '20123456789',
      'Documento duplicado',
      'b1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111'
    )
  $$,
  '23505',
  null,
  'un documento no se duplica dentro de una organización'
);

select throws_ok(
  $$
    insert into public.suppliers (
      organization_id,
      document_type,
      document_number,
      business_name,
      credit_condition,
      credit_days,
      created_by,
      updated_by
    )
    values (
      'a1111111-1111-4111-8111-111111111111',
      'ruc',
      '20123',
      'RUC inválido',
      'credito',
      0,
      'b1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111'
    )
  $$,
  '23514',
  null,
  'la base de datos valida formato fiscal y crédito'
);

select throws_ok(
  $$
    update public.suppliers
    set organization_id = 'a2222222-2222-4222-8222-222222222222'
    where id = 'c1111111-1111-4111-8111-111111111111'
  $$,
  'P0001',
  'SUPPLIER_IMMUTABLE_FIELDS',
  'una actualización no puede mover el proveedor de organización'
);

select is(
  (
    select count(*)
    from public.audit_events
    where entity_type = 'supplier'
  ),
  3::bigint,
  'altas y modificaciones generan auditoría inmutable'
);

select is(
  (
    select count(*)
    from public.audit_events
    where entity_type = 'supplier'
      and new_values ? 'bank_account'
  ),
  0::bigint,
  'la auditoría no duplica cuentas bancarias'
);

select * from finish();

rollback;
