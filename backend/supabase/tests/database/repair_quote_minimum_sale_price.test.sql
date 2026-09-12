begin;

select no_plan();

select has_column('public', 'repair_quotes', 'exchange_rate_to_pen',
  'la cotizacion conserva el tipo de cambio a PEN');
select has_column('public', 'repair_quote_items', 'minimum_sale_price_pen_snapshot',
  'la linea conserva el minimo usado');
select has_column('public', 'repair_quote_items', 'comparable_unit_price_pen_snapshot',
  'la linea conserva el precio comparable calculado');

insert into public.organizations (id, name, slug)
values ('e1100000-0000-4000-8000-000000000001', 'Minimo reparaciones', 'minimo-reparaciones');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('e1200000-0000-4000-8000-000000000001', 'minimo.reparaciones@test.local',
  '{"full_name":"Minimo Reparaciones"}', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('e1300000-0000-4000-8000-000000000001',
  'e1200000-0000-4000-8000-000000000001', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('e1100000-0000-4000-8000-000000000001',
  'e1200000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('e1100000-0000-4000-8000-000000000001',
  'e1200000-0000-4000-8000-000000000001', 'ADMIN');

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name, created_by, updated_by
) values (
  'e1400000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001', 'DNI', '71120001',
  'Cliente minimo reparaciones', 'e1200000-0000-4000-8000-000000000001',
  'e1200000-0000-4000-8000-000000000001'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, sale_price, minimum_sale_price, is_active,
  batch_control, expiration_control, serial_control, created_by, updated_by
) values (
  'e1500000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001', 'REP-MIN', 'Repuesto con minimo',
  'UND', 'good', 'gravado', 150, 100, true, false, false, false,
  'e1200000-0000-4000-8000-000000000001',
  'e1200000-0000-4000-8000-000000000001'
);

insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot,
  product_code_snapshot, product_description_snapshot, created_by, updated_by
)
select id, 'e1100000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000001',
  'e1500000-0000-4000-8000-000000000001', 'diagnosis', 'Cotizar repuesto',
  'Cliente minimo reparaciones', 'DNI 71120001', 'REP-MIN', 'Repuesto con minimo',
  'e1200000-0000-4000-8000-000000000001',
  'e1200000-0000-4000-8000-000000000001'
from (values
  ('e1600000-0000-4000-8000-000000000001'::uuid),
  ('e1600000-0000-4000-8000-000000000002'::uuid),
  ('e1600000-0000-4000-8000-000000000003'::uuid),
  ('e1600000-0000-4000-8000-000000000004'::uuid),
  ('e1600000-0000-4000-8000-000000000005'::uuid),
  ('e1600000-0000-4000-8000-000000000006'::uuid)
) repairs(id);

create function pg_temp.repair_quote_payload(
  requested_repair_id uuid,
  requested_key uuid,
  requested_currency text,
  requested_rate numeric,
  requested_unit_price numeric,
  requested_include_tax boolean default true,
  requested_tax_rate numeric default 18
)
returns jsonb
language sql
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'organization_id', 'e1100000-0000-4000-8000-000000000001',
    'repair_id', requested_repair_id,
    'operation_key', requested_key,
    'expected_lock_version', 1,
    'currency', requested_currency,
    'exchange_rate_to_pen', requested_rate,
    'prices_include_tax', requested_include_tax,
    'tax_rate', requested_tax_rate,
    'submit', false,
    'items', jsonb_build_array(jsonb_build_object(
      'line_type', 'part',
      'product_id', 'e1500000-0000-4000-8000-000000000001',
      'description', 'Repuesto con minimo',
      'quantity', 1,
      'unit_price', requested_unit_price,
      'taxable', true
    ))
  ))
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated","session_id":"e1300000-0000-4000-8000-000000000001"}',
  true
);

select lives_ok(
  $$select public.save_repair_quote(pg_temp.repair_quote_payload(
    'e1600000-0000-4000-8000-000000000001',
    'e1700000-0000-4000-8000-000000000001', 'PEN', null, 100
  ))$$,
  'PEN acepta el limite exacto y normaliza el tipo de cambio omitido a uno'
);
select throws_ok(
  $$select public.save_repair_quote(pg_temp.repair_quote_payload(
    'e1600000-0000-4000-8000-000000000002',
    'e1700000-0000-4000-8000-000000000002', 'PEN', 1, 99.9999
  ))$$,
  'P0001', 'REPAIR_QUOTE_MINIMUM_SALE_PRICE_VIOLATION',
  'PEN rechaza un precio inferior sin redondearlo primero'
);
select lives_ok(
  $$select public.save_repair_quote(pg_temp.repair_quote_payload(
    'e1600000-0000-4000-8000-000000000003',
    'e1700000-0000-4000-8000-000000000003', 'USD', 4, 25
  ))$$,
  'USD convierte con el snapshot y acepta el limite exacto'
);
select throws_ok(
  $$select public.save_repair_quote(pg_temp.repair_quote_payload(
    'e1600000-0000-4000-8000-000000000004',
    'e1700000-0000-4000-8000-000000000004', 'USD', 4, 24.9999
  ))$$,
  'P0001', 'REPAIR_QUOTE_MINIMUM_SALE_PRICE_VIOLATION',
  'USD rechaza un precio convertido inferior al minimo'
);
select throws_ok(
  $$select public.save_repair_quote(pg_temp.repair_quote_payload(
    'e1600000-0000-4000-8000-000000000005',
    'e1700000-0000-4000-8000-000000000005', 'USD', null, 30
  ))$$,
  'P0001', 'REPAIR_QUOTE_EXCHANGE_RATE_REQUIRED',
  'USD requiere un tipo de cambio explicito'
);
select lives_ok(
  $$select public.save_repair_quote(pg_temp.repair_quote_payload(
    'e1600000-0000-4000-8000-000000000006',
    'e1700000-0000-4000-8000-000000000006', 'USD', 4, 21.1865, false, 18
  ))$$,
  'la comparacion suma el impuesto antes de convertir precios sin impuesto'
);

reset role;

select is(
  (select exchange_rate_to_pen from public.repair_quotes
    where repair_id = 'e1600000-0000-4000-8000-000000000001'),
  1::numeric,
  'la cotizacion PEN conserva tipo de cambio uno'
);
select is(
  (select minimum_sale_price_pen_snapshot from public.repair_quote_items
    where quote_id = (select id from public.repair_quotes
      where repair_id = 'e1600000-0000-4000-8000-000000000003')),
  100::numeric,
  'la linea conserva el minimo PEN vigente'
);
select is(
  (select comparable_unit_price_pen_snapshot from public.repair_quote_items
    where quote_id = (select id from public.repair_quotes
      where repair_id = 'e1600000-0000-4000-8000-000000000003')),
  100::numeric,
  'la linea conserva el precio convertido usado en la comparacion'
);

update public.products set sale_price = 160, minimum_sale_price = 120
where id = 'e1500000-0000-4000-8000-000000000001';

select is(
  (select minimum_sale_price_pen_snapshot from public.repair_quote_items
    where quote_id = (select id from public.repair_quotes
      where repair_id = 'e1600000-0000-4000-8000-000000000003')),
  100::numeric,
  'cambiar el producto no altera el minimo historico de la cotizacion'
);
select is(
  (select exchange_rate_to_pen from public.repair_quotes
    where repair_id = 'e1600000-0000-4000-8000-000000000003'),
  4::numeric,
  'cambiar el catalogo no altera el tipo de cambio historico'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated","session_id":"e1300000-0000-4000-8000-000000000001"}',
  true
);
select lives_ok(
  $$select public.save_repair_quote(pg_temp.repair_quote_payload(
    'e1600000-0000-4000-8000-000000000003',
    'e1700000-0000-4000-8000-000000000003', 'USD', 4, 25
  ))$$,
  'un replay completado no revalida contra un minimo posterior'
);
reset role;

select * from finish();
rollback;
