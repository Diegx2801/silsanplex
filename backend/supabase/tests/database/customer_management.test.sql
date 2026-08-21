begin;

select plan(34);

select has_table('public', 'customers', 'existe customers');
select has_table('public', 'customer_addresses', 'existe customer_addresses');
select has_table('public', 'customer_contacts', 'existe customer_contacts');
select has_function('public', 'save_customer', array['jsonb'], 'existe guardado transaccional');
select has_function('public', 'set_customer_status', array['uuid', 'boolean'], 'existe cambio de estado');

select is((select relrowsecurity from pg_class where oid = 'public.customers'::regclass), true, 'customers tiene RLS');
select is((select relrowsecurity from pg_class where oid = 'public.customer_addresses'::regclass), true, 'direcciones tiene RLS');
select is((select relrowsecurity from pg_class where oid = 'public.customer_contacts'::regclass), true, 'contactos tiene RLS');

select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.customer_addresses'::regclass
      and confrelid = 'public.customers'::regclass
      and contype = 'f'
  ),
  1::bigint,
  'direcciones expone una única relación hacia customers'
);
select is(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.customer_addresses'::regclass
      and conname = 'customer_addresses_same_organization'
  ),
  'FOREIGN KEY (organization_id, customer_id) REFERENCES customers(organization_id, id) ON DELETE RESTRICT',
  'direcciones conserva la relación compuesta por organización y cliente'
);
select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.customer_contacts'::regclass
      and confrelid = 'public.customers'::regclass
      and contype = 'f'
  ),
  1::bigint,
  'contactos expone una única relación hacia customers'
);
select is(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.customer_contacts'::regclass
      and conname = 'customer_contacts_same_organization'
  ),
  'FOREIGN KEY (organization_id, customer_id) REFERENCES customers(organization_id, id) ON DELETE RESTRICT',
  'contactos conserva la relación compuesta por organización y cliente'
);

select is((select count(*) from public.permissions where code like 'CUSTOMERS_%'), 3::bigint, 'existen tres permisos de clientes');
select is((select count(*) from public.role_permissions where role_code = 'ADMIN' and permission_code like 'CUSTOMERS_%'), 3::bigint, 'ADMIN recibe todos los permisos');
select is((select count(*) from public.role_permissions where role_code = 'VENTAS' and permission_code like 'CUSTOMERS_%'), 3::bigint, 'VENTAS gestiona clientes');
select is((select count(*) from public.role_permissions where role_code = 'GERENCIA' and permission_code like 'CUSTOMERS_%'), 2::bigint, 'GERENCIA solo consulta y exporta');

select is(has_table_privilege('authenticated', 'public.customers', 'SELECT'), true, 'authenticated puede leer bajo RLS');
select is(has_table_privilege('authenticated', 'public.customers', 'INSERT'), false, 'authenticated no inserta directamente');
select is(has_function_privilege('authenticated', 'public.save_customer(jsonb)', 'EXECUTE'), true, 'authenticated ejecuta guardado seguro');
select is(has_function_privilege('anon', 'public.save_customer(jsonb)', 'EXECUTE'), false, 'anon no guarda clientes');

select throws_ok(
  $$ insert into public.customers (organization_id, document_type, document_number, legal_name)
     select id, 'RUC', '123', 'Inválido' from public.organizations limit 1 $$,
  '23514', null, 'la base valida el formato RUC'
);

select lives_ok(
  $$ insert into public.customers (organization_id, document_type, document_number, legal_name)
     select id, 'RUC', '20111111111', 'Cliente de prueba' from public.organizations limit 1 $$,
  'admite un cliente válido'
);

select throws_ok(
  $$ insert into public.customers (organization_id, document_type, document_number, legal_name)
     select id, 'RUC', '20111111111', 'Duplicado' from public.organizations limit 1 $$,
  '23505', null, 'el documento es único por organización'
);

select lives_ok(
  $$ insert into public.customer_addresses (organization_id, customer_id, address_type, address_line, is_default)
     select organization_id, id, 'FISCAL', 'Av. Prueba 123', true
     from public.customers where document_number = '20111111111' $$,
  'admite dirección fiscal'
);

select throws_ok(
  $$ insert into public.customer_addresses (organization_id, customer_id, address_type, address_line)
     select organization_id, id, 'INVALID', 'Av. Prueba 456'
     from public.customers where document_number = '20111111111' $$,
  '23514', null, 'rechaza tipos de dirección desconocidos'
);

select lives_ok(
  $$ insert into public.customer_contacts (organization_id, customer_id, full_name, is_primary)
     select organization_id, id, 'Contacto principal', true
     from public.customers where document_number = '20111111111' $$,
  'admite contacto principal'
);

select throws_ok(
  $$ insert into public.customer_contacts (organization_id, customer_id)
     select organization_id, id from public.customers where document_number = '20111111111' $$,
  '23514', null, 'un contacto no puede estar vacío'
);

select is((select count(*) from public.customers where document_number = '20111111111'), 1::bigint, 'la prueba mantiene un solo cliente');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'c1111111-1111-4111-8111-111111111111',
  'customer.admin@test.local',
  '{"full_name":"Administrador clientes"}'::jsonb,
  now(),
  now()
);

insert into public.organization_memberships (organization_id, user_id)
select id, 'c1111111-1111-4111-8111-111111111111'
from public.organizations
where slug = 'drogueria-silsan';

insert into public.user_roles (organization_id, user_id, role_code)
select id, 'c1111111-1111-4111-8111-111111111111', 'ADMIN'
from public.organizations
where slug = 'drogueria-silsan';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', true);

select lives_ok(
  $$ select public.save_customer(
    '{
      "documentType":"RUC",
      "documentNumber":"20999999991",
      "legalName":"Cliente editable S.A.C.",
      "addresses":[{"addressType":"FISCAL","addressLine":"Av. Inicial 100","isDefault":true}],
      "contacts":[{"fullName":"Contacto inicial","isPrimary":true}]
    }'::jsonb
  ) $$,
  'crea un cliente con hijos transaccionalmente'
);

select lives_ok(
  $$ select public.save_customer(
    jsonb_build_object(
      'id', (select id from public.customers where document_number = '20999999991'),
      'documentType', 'RUC',
      'documentNumber', '20999999991',
      'legalName', 'Cliente editable S.A.C.',
      'addresses', '[{"addressType":"FISCAL","addressLine":"Av. Actualizada 200","isDefault":true}]'::jsonb,
      'contacts', '[{"fullName":"Contacto actualizado","isPrimary":true}]'::jsonb
    )
  ) $$,
  'actualiza los hijos aun cuando un cliente antiguo no envía sus identificadores'
);

reset role;

select is(
  (select count(*) from public.customer_addresses address
   join public.customers customer on customer.id = address.customer_id
   where customer.document_number = '20999999991' and address.address_type = 'FISCAL' and address.is_active),
  1::bigint,
  'mantiene una única dirección fiscal activa'
);
select is(
  (select address.address_line from public.customer_addresses address
   join public.customers customer on customer.id = address.customer_id
   where customer.document_number = '20999999991' and address.address_type = 'FISCAL' and address.is_active),
  'Av. Actualizada 200',
  'reutiliza y actualiza la dirección fiscal'
);
select is(
  (select count(*) from public.customer_contacts contact
   join public.customers customer on customer.id = contact.customer_id
   where customer.document_number = '20999999991' and contact.is_primary and contact.is_active),
  1::bigint,
  'mantiene un único contacto principal activo'
);
select is(
  (select contact.full_name from public.customer_contacts contact
   join public.customers customer on customer.id = contact.customer_id
   where customer.document_number = '20999999991' and contact.is_primary and contact.is_active),
  'Contacto actualizado',
  'reutiliza y actualiza el contacto principal'
);

select * from finish();
rollback;
