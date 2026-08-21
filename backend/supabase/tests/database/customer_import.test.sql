begin;

select plan(14);

select has_function('public', 'import_customers', array['jsonb'], 'existe importacion controlada');
select is(has_function_privilege('authenticated', 'public.import_customers(jsonb)', 'EXECUTE'), true, 'authenticated puede importar con permiso');
select is(has_function_privilege('anon', 'public.import_customers(jsonb)', 'EXECUTE'), false, 'anon no puede importar');
select trigger_is('public', 'customers', 'customers_protect_fiscal_identity', 'public', 'protect_customer_fiscal_identity', 'la identidad fiscal esta protegida');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'c2222222-2222-4222-8222-222222222222',
  'customer.import@test.local',
  '{"full_name":"Importador clientes"}'::jsonb,
  now(),
  now()
);

insert into public.organization_memberships (organization_id, user_id)
select id, 'c2222222-2222-4222-8222-222222222222'
from public.organizations where slug = 'drogueria-silsan';

insert into public.user_roles (organization_id, user_id, role_code)
select id, 'c2222222-2222-4222-8222-222222222222', 'ADMIN'
from public.organizations where slug = 'drogueria-silsan';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2222222-2222-4222-8222-222222222222', true);

create temporary table import_result as
select public.import_customers('{
  "mode":"SKIP",
  "rows":[{
    "rowNumber":2,
    "documentType":"RUC",
    "documentNumber":"20677777771",
    "legalName":"Cliente importado S.A.C.",
    "tradeName":"Importado",
    "contactName":"Contacto importado",
    "email":"importado@example.com",
    "phone":"999888111",
    "fiscalAddress":"Av. Importacion 123",
    "ubigeoCode":"130101",
    "taxpayerStatus":"ACTIVO",
    "domicileCondition":"HABIDO",
    "isActive":true
  }]
}'::jsonb) as value;

select is((select (value->>'created')::integer from import_result), 1, 'crea una fila valida');
select is((select count(*) from public.customers where document_number = '20677777771'), 1::bigint, 'persiste el cliente');
select is((select count(*) from public.customer_addresses address join public.customers customer on customer.id = address.customer_id where customer.document_number = '20677777771' and address.address_type = 'FISCAL'), 1::bigint, 'persiste la direccion fiscal');
select is((select count(*) from public.customer_contacts contact join public.customers customer on customer.id = contact.customer_id where customer.document_number = '20677777771' and contact.is_primary), 1::bigint, 'persiste el contacto principal');

select is(
  (public.import_customers('{"mode":"SKIP","rows":[{"rowNumber":2,"documentType":"RUC","documentNumber":"20677777771","legalName":"Duplicado"}]}'::jsonb)->>'skipped')::integer,
  1,
  'omite documentos existentes en modo SKIP'
);

select is(
  (public.import_customers('{"mode":"UPDATE","rows":[{"rowNumber":2,"documentType":"RUC","documentNumber":"20677777771","legalName":"Cliente actualizado S.A.C."}]}'::jsonb)->>'updated')::integer,
  1,
  'actualiza documentos existentes en modo UPDATE'
);
select is((select legal_name from public.customers where document_number = '20677777771'), 'Cliente actualizado S.A.C.', 'actualiza los datos permitidos');

set local role service_role;
select throws_ok(
  $$ update public.customers set document_number = '20677777772' where document_number = '20677777771' $$,
  '22023', 'CUSTOMER_FISCAL_IDENTITY_IMMUTABLE', 'impide modificar la identidad fiscal'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2222222-2222-4222-8222-222222222222', true);

select is((select count(*) from public.audit_events where entity_type = 'customer' and action like 'CUSTOMER_IMPORT%'), 2::bigint, 'audita creacion y actualizacion importadas');

select throws_ok(
  $$ select public.import_customers('{"mode":"SKIP","rows":[]}'::jsonb) $$,
  '22023', 'INVALID_CUSTOMER_IMPORT_SIZE', 'rechaza lotes vacios'
);

reset role;
select * from finish();
rollback;
