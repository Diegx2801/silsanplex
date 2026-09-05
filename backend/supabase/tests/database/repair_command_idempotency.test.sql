begin;

select plan(36);

select has_table(
  'public', 'repair_command_operations',
  'repair command results are persisted'
);
select has_pk(
  'public', 'repair_command_operations',
  'repair operation keys are unique per organization'
);
select col_not_null(
  'public', 'repair_command_operations', 'operation_key',
  'repair operation keys are mandatory'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.repair_command_operations'::regclass),
  true,
  'repair command results have RLS enabled'
);
select is(
  has_table_privilege('authenticated', 'public.repair_command_operations', 'SELECT'),
  false,
  'authenticated users cannot inspect command results directly'
);
select is(
  has_table_privilege('authenticated', 'public.repair_command_operations', 'INSERT'),
  false,
  'authenticated users cannot forge command results'
);
select is(
  has_function_privilege(
    'authenticated', 'public.replay_repair_command(uuid,uuid,text,jsonb)', 'EXECUTE'
  ),
  false,
  'the replay helper is internal'
);
select is(
  has_function_privilege(
    'authenticated', 'public.complete_repair_command(uuid,uuid,text,jsonb,uuid)', 'EXECUTE'
  ),
  false,
  'the completion helper is internal'
);
select is(
  has_function_privilege('authenticated', 'public.create_repair_unchecked(jsonb)', 'EXECUTE'),
  false,
  'the unchecked repair creator is internal'
);

insert into public.organizations (id, name, slug)
values ('d2100000-0000-4000-8000-000000000001', 'Repair idempotency', 'repair-idempotency');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'd2200000-0000-4000-8000-000000000001',
  'repair.idempotency@test.local',
  '{"full_name":"Repair Idempotency Admin"}',
  now(), now()
);

insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  'd2300000-0000-4000-8000-000000000001',
  'd2200000-0000-4000-8000-000000000001',
  now(), now()
);

insert into public.organization_memberships (organization_id, user_id)
values (
  'd2100000-0000-4000-8000-000000000001',
  'd2200000-0000-4000-8000-000000000001'
);

insert into public.user_roles (organization_id, user_id, role_code)
values (
  'd2100000-0000-4000-8000-000000000001',
  'd2200000-0000-4000-8000-000000000001',
  'ADMIN'
);

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name
)
values (
  'd2400000-0000-4000-8000-000000000001',
  'd2100000-0000-4000-8000-000000000001',
  'DNI', '42100001', 'Repair Idempotency Customer'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, expiration_control, serial_control, is_active, created_by, updated_by
)
values (
  'd2500000-0000-4000-8000-000000000001',
  'd2100000-0000-4000-8000-000000000001',
  'IDEM-PART', 'Repair Idempotency Part', 'UND', 20,
  false, false, false, true,
  'd2200000-0000-4000-8000-000000000001',
  'd2200000-0000-4000-8000-000000000001'
);

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
)
values (
  'd2600000-0000-4000-8000-000000000001',
  'd2100000-0000-4000-8000-000000000001',
  'IDEM', 'Repair Idempotency Warehouse',
  'd2200000-0000-4000-8000-000000000001',
  'd2200000-0000-4000-8000-000000000001'
);

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values (
  'd2700000-0000-4000-8000-000000000001',
  'd2100000-0000-4000-8000-000000000001',
  'd2600000-0000-4000-8000-000000000001',
  'IDEM-01', 'Repair Idempotency Location',
  'd2200000-0000-4000-8000-000000000001',
  'd2200000-0000-4000-8000-000000000001'
);

insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot, product_code_snapshot,
  product_description_snapshot, created_by, updated_by
)
values
  (
    'd2800000-0000-4000-8000-000000000001',
    'd2100000-0000-4000-8000-000000000001',
    'd2400000-0000-4000-8000-000000000001',
    'd2500000-0000-4000-8000-000000000001',
    'in_repair', 'Idempotent part reservation',
    'Repair Idempotency Customer', 'DNI 42100001',
    'IDEM-PART', 'Repair Idempotency Part',
    'd2200000-0000-4000-8000-000000000001',
    'd2200000-0000-4000-8000-000000000001'
  ),
  (
    'd2800000-0000-4000-8000-000000000002',
    'd2100000-0000-4000-8000-000000000001',
    'd2400000-0000-4000-8000-000000000001',
    'd2500000-0000-4000-8000-000000000001',
    'diagnosis', 'Idempotent initial quote',
    'Repair Idempotency Customer', 'DNI 42100001',
    'IDEM-PART', 'Repair Idempotency Part',
    'd2200000-0000-4000-8000-000000000001',
    'd2200000-0000-4000-8000-000000000001'
  ),
  (
    'd2800000-0000-4000-8000-000000000003',
    'd2100000-0000-4000-8000-000000000001',
    'd2400000-0000-4000-8000-000000000001',
    'd2500000-0000-4000-8000-000000000001',
    'rejected', 'Idempotent quote revision',
    'Repair Idempotency Customer', 'DNI 42100001',
    'IDEM-PART', 'Repair Idempotency Part',
    'd2200000-0000-4000-8000-000000000001',
    'd2200000-0000-4000-8000-000000000001'
  );

insert into public.repair_quotes (
  id, organization_id, repair_id, version_number, status, is_current,
  currency, prices_include_tax, tax_rate, subtotal, tax, total,
  rejected_by, rejected_at, created_by, updated_by
)
values (
  'd2900000-0000-4000-8000-000000000001',
  'd2100000-0000-4000-8000-000000000001',
  'd2800000-0000-4000-8000-000000000003',
  1, 'rejected', true, 'PEN', false, 0, 10, 0, 10,
  'd2200000-0000-4000-8000-000000000001', now(),
  'd2200000-0000-4000-8000-000000000001',
  'd2200000-0000-4000-8000-000000000001'
);

create function pg_temp.repair_command_count(requested_command_type text default null)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select count(*)
  from public.repair_command_operations operation
  where operation.organization_id = 'd2100000-0000-4000-8000-000000000001'
    and (requested_command_type is null
      or operation.command_type = requested_command_type);
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d2200000-0000-4000-8000-000000000001","role":"authenticated","session_id":"d2300000-0000-4000-8000-000000000001"}',
  true
);

select throws_ok($$
  select public.create_repair('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "customer_id":"d2400000-0000-4000-8000-000000000001",
    "product_id":"d2500000-0000-4000-8000-000000000001",
    "problem_description":"Missing operation key"
  }'::jsonb)
$$, '22023', 'REPAIR_OPERATION_KEY_REQUIRED', 'creation requires an operation key');

select lives_ok($$
  select public.create_repair('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000001",
    "customer_id":"d2400000-0000-4000-8000-000000000001",
    "product_id":"d2500000-0000-4000-8000-000000000001",
    "problem_description":"Idempotent repair creation",
    "customer_reference":"IDEMPOTENT-CREATE"
  }'::jsonb)
$$, 'a repair can be created with an operation key');
select is(
  public.create_repair('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000001",
    "customer_id":"d2400000-0000-4000-8000-000000000001",
    "product_id":"d2500000-0000-4000-8000-000000000001",
    "problem_description":"Idempotent repair creation",
    "customer_reference":"IDEMPOTENT-CREATE"
  }'::jsonb),
  (select id from public.repairs where customer_reference = 'IDEMPOTENT-CREATE'),
  'an identical creation replay returns the original repair'
);
select is(
  (select count(*) from public.repairs where customer_reference = 'IDEMPOTENT-CREATE'),
  1::bigint,
  'a creation replay does not duplicate the repair'
);
select is(
  pg_temp.repair_command_count('create_repair'),
  1::bigint,
  'repair creation records one command result'
);
select throws_ok($$
  select public.create_repair('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000001",
    "customer_id":"d2400000-0000-4000-8000-000000000001",
    "product_id":"d2500000-0000-4000-8000-000000000001",
    "problem_description":"Changed repair creation",
    "customer_reference":"IDEMPOTENT-CREATE"
  }'::jsonb)
$$, 'P0001', 'REPAIR_OPERATION_KEY_REUSED', 'a creation key cannot be reused with changed data');

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "product_id":"d2500000-0000-4000-8000-000000000001",
    "warehouse_id":"d2600000-0000-4000-8000-000000000001",
    "location_id":"d2700000-0000-4000-8000-000000000001",
    "movement_type":"entrada",
    "quantity":10,
    "unit_cost":8,
    "stock_status":"available",
    "operation_date":"2026-09-04",
    "reason":"Idempotent reservation stock"
  }'::jsonb)
$$, 'stock is available for the reservation command');
select lives_ok($$
  select public.reserve_repair_part('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000002",
    "repair_id":"d2800000-0000-4000-8000-000000000001",
    "expected_lock_version":1,
    "product_id":"d2500000-0000-4000-8000-000000000001",
    "warehouse_id":"d2600000-0000-4000-8000-000000000001",
    "location_id":"d2700000-0000-4000-8000-000000000001",
    "stock_status":"available",
    "quantity_requested":2
  }'::jsonb)
$$, 'a part can be reserved with an operation key');
select is(
  public.reserve_repair_part('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000002",
    "repair_id":"d2800000-0000-4000-8000-000000000001",
    "expected_lock_version":1,
    "product_id":"d2500000-0000-4000-8000-000000000001",
    "warehouse_id":"d2600000-0000-4000-8000-000000000001",
    "location_id":"d2700000-0000-4000-8000-000000000001",
    "stock_status":"available",
    "quantity_requested":2
  }'::jsonb),
  (select id from public.repair_parts where repair_id = 'd2800000-0000-4000-8000-000000000001'),
  'a reservation replay returns the original part despite the stale version'
);
select is(
  (select count(*) from public.repair_parts where repair_id = 'd2800000-0000-4000-8000-000000000001'),
  1::bigint,
  'a reservation replay does not duplicate the part'
);
select is(
  (select sum(quantity) from public.inventory_reservations
   where source_type = 'repair-part'
     and organization_id = 'd2100000-0000-4000-8000-000000000001'),
  2.000::numeric,
  'a reservation replay reduces assignable stock only once'
);
select is(
  (select lock_version from public.repairs where id = 'd2800000-0000-4000-8000-000000000001'),
  2::bigint,
  'a reservation replay advances the aggregate version only once'
);
select throws_ok($$
  select public.reserve_repair_part('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000002",
    "repair_id":"d2800000-0000-4000-8000-000000000001",
    "expected_lock_version":1,
    "product_id":"d2500000-0000-4000-8000-000000000001",
    "warehouse_id":"d2600000-0000-4000-8000-000000000001",
    "location_id":"d2700000-0000-4000-8000-000000000001",
    "stock_status":"available",
    "quantity_requested":3
  }'::jsonb)
$$, 'P0001', 'REPAIR_OPERATION_KEY_REUSED', 'a reservation key cannot be reused with changed data');

select lives_ok($$
  select public.save_repair_quote('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000003",
    "repair_id":"d2800000-0000-4000-8000-000000000002",
    "expected_lock_version":1,
    "submit":false,
    "items":[{"line_type":"labor","description":"Diagnosis","quantity":1,"unit_price":50}]
  }'::jsonb)
$$, 'an initial quote draft can be saved with an operation key');
select is(
  public.save_repair_quote('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000003",
    "repair_id":"d2800000-0000-4000-8000-000000000002",
    "expected_lock_version":1,
    "submit":false,
    "items":[{"line_type":"labor","description":"Diagnosis","quantity":1,"unit_price":50}]
  }'::jsonb),
  (select id from public.repair_quotes where repair_id = 'd2800000-0000-4000-8000-000000000002'),
  'an initial draft replay returns the original quote despite the stale version'
);
select is(
  (select count(*) from public.repair_quotes where repair_id = 'd2800000-0000-4000-8000-000000000002'),
  1::bigint,
  'an initial draft replay does not create another quote'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'd2800000-0000-4000-8000-000000000002' and event_type = 'QUOTE_CREATED'),
  1::bigint,
  'an initial draft replay does not duplicate its event'
);
select is(
  (select lock_version from public.repairs where id = 'd2800000-0000-4000-8000-000000000002'),
  2::bigint,
  'an initial draft replay advances the aggregate version only once'
);
select throws_ok($$
  select public.save_repair_quote('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000003",
    "repair_id":"d2800000-0000-4000-8000-000000000002",
    "expected_lock_version":1,
    "submit":true,
    "items":[{"line_type":"labor","description":"Diagnosis","quantity":1,"unit_price":50}]
  }'::jsonb)
$$, 'P0001', 'REPAIR_OPERATION_KEY_REUSED', 'a draft key cannot be reused for a changed action');

select lives_ok($$
  select public.revise_repair_quote('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000004",
    "repair_id":"d2800000-0000-4000-8000-000000000003",
    "rejected_quote_id":"d2900000-0000-4000-8000-000000000001",
    "expected_lock_version":1,
    "submit":false,
    "items":[{"line_type":"labor","description":"Revision","quantity":1,"unit_price":40}]
  }'::jsonb)
$$, 'a quote revision can be created with an operation key');
select is(
  public.revise_repair_quote('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000004",
    "repair_id":"d2800000-0000-4000-8000-000000000003",
    "rejected_quote_id":"d2900000-0000-4000-8000-000000000001",
    "expected_lock_version":1,
    "submit":false,
    "items":[{"line_type":"labor","description":"Revision","quantity":1,"unit_price":40}]
  }'::jsonb),
  (select id from public.repair_quotes where repair_id = 'd2800000-0000-4000-8000-000000000003' and is_current),
  'a revision replay returns the original new quote despite the stale version'
);
select is(
  (select count(*) from public.repair_quotes where repair_id = 'd2800000-0000-4000-8000-000000000003'),
  2::bigint,
  'a revision replay does not create another version'
);
select is(
  (select count(*) from public.repair_quotes where repair_id = 'd2800000-0000-4000-8000-000000000003' and is_current),
  1::bigint,
  'a revision replay preserves one current quote'
);
select is(
  (select lock_version from public.repairs where id = 'd2800000-0000-4000-8000-000000000003'),
  2::bigint,
  'a revision replay advances the aggregate version only once'
);
select throws_ok($$
  select public.revise_repair_quote('{
    "organization_id":"d2100000-0000-4000-8000-000000000001",
    "operation_key":"d2a00000-0000-4000-8000-000000000004",
    "repair_id":"d2800000-0000-4000-8000-000000000003",
    "rejected_quote_id":"d2900000-0000-4000-8000-000000000001",
    "expected_lock_version":1,
    "submit":true,
    "items":[{"line_type":"labor","description":"Revision","quantity":1,"unit_price":40}]
  }'::jsonb)
$$, 'P0001', 'REPAIR_OPERATION_KEY_REUSED', 'a revision key cannot be reused for a changed action');
select is(
  pg_temp.repair_command_count(),
  4::bigint,
  'all four commands persist exactly one result'
);

reset role;
select throws_ok($$
  update public.repair_command_operations
  set result_id = gen_random_uuid()
  where operation_key = 'd2a00000-0000-4000-8000-000000000001'
$$, 'P0001', 'REPAIR_COMMAND_OPERATION_IMMUTABLE', 'command results are immutable');

select * from finish();
rollback;
