begin;

select plan(34);

select has_column('public', 'repairs', 'lock_version', 'repairs exposes the aggregate lock version');
select col_type_is('public', 'repairs', 'lock_version', 'bigint', 'lock version uses bigint');
select col_not_null('public', 'repairs', 'lock_version', 'lock version cannot be null');
select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'repair_list'
      and column_name = 'lock_version'
  ),
  'repair_list exposes the aggregate lock version'
);
select is(
  (
    select count(*)
    from (
      values
        ('public.update_repair_unchecked(jsonb)'::regprocedure),
        ('public.assign_repair_unchecked(uuid,uuid,uuid)'::regprocedure),
        ('public.change_repair_status_unchecked(uuid,uuid,text,text)'::regprocedure),
        ('public.record_repair_diagnosis_unchecked(jsonb)'::regprocedure),
        ('public.record_repair_solution_unchecked(jsonb)'::regprocedure),
        ('public.save_repair_quote_unchecked(jsonb)'::regprocedure),
        ('public.revise_repair_quote_unchecked(jsonb)'::regprocedure),
        ('public.approve_repair_quote_unchecked(uuid,uuid,uuid,text)'::regprocedure),
        ('public.reject_repair_quote_unchecked(uuid,uuid,uuid,text)'::regprocedure),
        ('public.reserve_repair_part_unchecked(jsonb)'::regprocedure),
        ('public.consume_repair_part_unchecked(jsonb)'::regprocedure),
        ('public.cancel_repair_part_unchecked(uuid,uuid,text)'::regprocedure),
        ('public.record_repair_test_unchecked(jsonb)'::regprocedure),
        ('public.deliver_repair_unchecked(uuid,uuid,text)'::regprocedure),
        ('public.cancel_repair_unchecked(uuid,uuid,text)'::regprocedure),
        ('public.lock_repair_version(uuid,uuid,bigint)'::regprocedure),
        ('public.advance_repair_version(uuid,uuid)'::regprocedure)
    ) as protected_function(function_oid)
    cross join (values ('anon'), ('authenticated'), ('service_role')) as api_role(role_name)
    where has_function_privilege(api_role.role_name, protected_function.function_oid, 'EXECUTE')
  ),
  0::bigint,
  'API roles cannot execute unchecked mutators or OCC helpers'
);
select is(
  (
    select count(*)
    from (
      values
        ('public.assign_repair(uuid,uuid,uuid)'),
        ('public.change_repair_status(uuid,uuid,text,text)'),
        ('public.approve_repair_quote(uuid,uuid,uuid,text)'),
        ('public.reject_repair_quote(uuid,uuid,uuid,text)'),
        ('public.cancel_repair_part(uuid,uuid,text)'),
        ('public.deliver_repair(uuid,uuid,text)'),
        ('public.cancel_repair(uuid,uuid,text)')
    ) as old_signature(function_signature)
    where to_regprocedure(old_signature.function_signature) is not null
  ),
  0::bigint,
  'old public positional mutator signatures are absent'
);

insert into public.organizations (id, name, slug)
values ('c1100000-0000-4000-8000-000000000001', 'Repair OCC', 'repair-occ');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'c1200000-0000-4000-8000-000000000001',
  'repair.occ@test.local',
  '{"full_name":"Repair OCC Admin"}',
  now(), now()
);

insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  'c1300000-0000-4000-8000-000000000001',
  'c1200000-0000-4000-8000-000000000001',
  now(), now()
);

insert into public.organization_memberships (organization_id, user_id)
values (
  'c1100000-0000-4000-8000-000000000001',
  'c1200000-0000-4000-8000-000000000001'
);

insert into public.user_roles (organization_id, user_id, role_code)
values (
  'c1100000-0000-4000-8000-000000000001',
  'c1200000-0000-4000-8000-000000000001',
  'ADMIN'
);

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name
)
values (
  'c1400000-0000-4000-8000-000000000001',
  'c1100000-0000-4000-8000-000000000001',
  'DNI', '41000001', 'Repair OCC Customer'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, expiration_control, serial_control, is_active, created_by, updated_by
)
values (
  'c1500000-0000-4000-8000-000000000001',
  'c1100000-0000-4000-8000-000000000001',
  'OCC-PART', 'Repair OCC Part', 'UND', 20,
  false, false, false, true,
  'c1200000-0000-4000-8000-000000000001',
  'c1200000-0000-4000-8000-000000000001'
);

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
)
values (
  'c1600000-0000-4000-8000-000000000001',
  'c1100000-0000-4000-8000-000000000001',
  'OCC', 'Repair OCC Warehouse',
  'c1200000-0000-4000-8000-000000000001',
  'c1200000-0000-4000-8000-000000000001'
);

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values (
  'c1700000-0000-4000-8000-000000000001',
  'c1100000-0000-4000-8000-000000000001',
  'c1600000-0000-4000-8000-000000000001',
  'OCC-01', 'Repair OCC Location',
  'c1200000-0000-4000-8000-000000000001',
  'c1200000-0000-4000-8000-000000000001'
);

insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot, product_code_snapshot,
  product_description_snapshot, created_by, updated_by
)
values (
  'c1800000-0000-4000-8000-000000000002',
  'c1100000-0000-4000-8000-000000000001',
  'c1400000-0000-4000-8000-000000000001',
  'c1500000-0000-4000-8000-000000000001',
  'in_repair', 'Exercise part concurrency',
  'Repair OCC Customer', 'DNI 41000001', 'OCC-PART', 'Repair OCC Part',
  'c1200000-0000-4000-8000-000000000001',
  null
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1200000-0000-4000-8000-000000000001","role":"authenticated","session_id":"c1300000-0000-4000-8000-000000000001"}',
  true
);

select lives_ok($$
  select public.create_repair('{
    "organization_id":"c1100000-0000-4000-8000-000000000001",
    "customer_id":"c1400000-0000-4000-8000-000000000001",
    "product_id":"c1500000-0000-4000-8000-000000000001",
    "problem_description":"Exercise aggregate concurrency",
    "customer_reference":"OCC-CREATED"
  }'::jsonb)
$$, 'repair creation remains unchanged');
select is(
  (select lock_version from public.repairs where customer_reference = 'OCC-CREATED'),
  1::bigint,
  'new repairs start at version one'
);
select is(
  (select lock_version from public.repair_list where customer_reference = 'OCC-CREATED'),
  1::bigint,
  'repair_list returns the current version'
);

select lives_ok($$
  select public.update_repair(jsonb_build_object(
    'organization_id', 'c1100000-0000-4000-8000-000000000001',
    'id', (select id from public.repairs where customer_reference = 'OCC-CREATED'),
    'expected_lock_version', 1,
    'notes', 'first write'
  ))
$$, 'a mutation accepts the current version');
select results_eq(
  $$ select notes, lock_version from public.repairs where customer_reference = 'OCC-CREATED' $$,
  $$ values ('first write'::text, 2::bigint) $$,
  'a successful mutation advances the version exactly once'
);
select ok(
  (
    select metadata -> 'old_values' ->> 'notes' is null
      and metadata -> 'new_values' ->> 'notes' = 'first write'
      and not (metadata -> 'old_values' ? 'lock_version')
      and not (metadata -> 'new_values' ? 'lock_version')
    from public.repair_events
    where repair_id = (select id from public.repairs where customer_reference = 'OCC-CREATED')
      and event_type = 'UPDATED'
  ),
  'repair update metadata retains business values without the OCC token'
);
select throws_ok($$
  select public.update_repair(jsonb_build_object(
    'organization_id', 'c1100000-0000-4000-8000-000000000001',
    'id', (select id from public.repairs where customer_reference = 'OCC-CREATED'),
    'expected_lock_version', 1,
    'notes', 'stale write'
  ))
$$, 'P0001', 'REPAIR_VERSION_CONFLICT', 'a stale mutation is rejected');
select results_eq(
  $$ select notes, lock_version from public.repairs where customer_reference = 'OCC-CREATED' $$,
  $$ values ('first write'::text, 2::bigint) $$,
  'a stale mutation has no aggregate side effects'
);
select throws_ok($$
  select public.update_repair(jsonb_build_object(
    'organization_id', 'c1100000-0000-4000-8000-000000000001',
    'id', (select id from public.repairs where customer_reference = 'OCC-CREATED'),
    'notes', 'missing token'
  ))
$$, 'P0001', 'REPAIR_VERSION_REQUIRED', 'a mutation requires an expected version');
select results_eq(
  $$ select notes, lock_version from public.repairs where customer_reference = 'OCC-CREATED' $$,
  $$ values ('first write'::text, 2::bigint) $$,
  'a missing token has no aggregate side effects'
);
select throws_ok($$
  select public.change_repair_status(
    'c1100000-0000-4000-8000-000000000001',
    (select id from public.repairs where customer_reference = 'OCC-CREATED'),
    'delivered', null, 2
  )
$$, 'P0001', 'REPAIR_SPECIALIZED_STATUS_REQUIRED', 'domain validation still runs after the version check');
select is(
  (select lock_version from public.repairs where customer_reference = 'OCC-CREATED'),
  2::bigint,
  'a failed domain mutation does not advance the version'
);
select lives_ok($$
  select public.assign_repair(
    'c1100000-0000-4000-8000-000000000001',
    (select id from public.repairs where customer_reference = 'OCC-CREATED'),
    'c1200000-0000-4000-8000-000000000001',
    2
  )
$$, 'a positional mutator accepts the current version');
select results_eq(
  $$
    select assigned_technician_id, lock_version
    from public.repairs
    where customer_reference = 'OCC-CREATED'
  $$,
  $$ values ('c1200000-0000-4000-8000-000000000001'::uuid, 3::bigint) $$,
  'the positional mutator advances the same aggregate token once'
);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"c1100000-0000-4000-8000-000000000001",
    "product_id":"c1500000-0000-4000-8000-000000000001",
    "warehouse_id":"c1600000-0000-4000-8000-000000000001",
    "location_id":"c1700000-0000-4000-8000-000000000001",
    "movement_type":"entrada",
    "quantity":5,
    "unit_cost":8,
    "stock_status":"available",
    "operation_date":"2026-09-04",
    "reason":"Repair OCC stock"
  }'::jsonb)
$$, 'stock is available for the idempotent consumption scenario');
select lives_ok($$
  select public.reserve_repair_part('{
    "organization_id":"c1100000-0000-4000-8000-000000000001",
    "repair_id":"c1800000-0000-4000-8000-000000000002",
    "expected_lock_version":1,
    "product_id":"c1500000-0000-4000-8000-000000000001",
    "warehouse_id":"c1600000-0000-4000-8000-000000000001",
    "location_id":"c1700000-0000-4000-8000-000000000001",
    "stock_status":"available",
    "quantity_requested":2
  }'::jsonb)
$$, 'part reservation accepts version one');
select is(
  (select lock_version from public.repairs where id = 'c1800000-0000-4000-8000-000000000002'),
  2::bigint,
  'part reservation advances the aggregate version'
);
select is(
  (select updated_by from public.repairs where id = 'c1800000-0000-4000-8000-000000000002'),
  'c1200000-0000-4000-8000-000000000001'::uuid,
  'aggregate version advancement attributes child mutations to the current actor'
);
select lives_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'c1100000-0000-4000-8000-000000000001',
    'repair_part_id', (select id from public.repair_parts where repair_id = 'c1800000-0000-4000-8000-000000000002'),
    'expected_lock_version', 2,
    'quantity', 1,
    'operation_key', 'c1900000-0000-4000-8000-000000000001'
  ))
$$, 'new part consumption accepts the current version');
select is(
  (select lock_version from public.repairs where id = 'c1800000-0000-4000-8000-000000000002'),
  3::bigint,
  'new part consumption advances the aggregate version'
);
select is(
  (select count(*) from public.repair_part_consumptions where operation_key = 'c1900000-0000-4000-8000-000000000001'),
  1::bigint,
  'new part consumption records one operation'
);
select lives_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'c1100000-0000-4000-8000-000000000001',
    'repair_part_id', (select id from public.repair_parts where repair_id = 'c1800000-0000-4000-8000-000000000002'),
    'expected_lock_version', 2,
    'quantity', 1,
    'operation_key', 'c1900000-0000-4000-8000-000000000001'
  ))
$$, 'an identical consumption replay ignores the stale aggregate version');
select is(
  (select lock_version from public.repairs where id = 'c1800000-0000-4000-8000-000000000002'),
  3::bigint,
  'an identical replay does not advance the aggregate version'
);
select is(
  (select count(*) from public.repair_part_consumptions where operation_key = 'c1900000-0000-4000-8000-000000000001'),
  1::bigint,
  'an identical replay does not duplicate consumption'
);
select throws_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'c1100000-0000-4000-8000-000000000001',
    'repair_part_id', (select id from public.repair_parts where repair_id = 'c1800000-0000-4000-8000-000000000002'),
    'quantity', 1,
    'operation_key', 'c1900000-0000-4000-8000-000000000001'
  ))
$$, 'P0001', 'REPAIR_VERSION_REQUIRED', 'an identical replay still requires a version field');
select is(
  (select lock_version from public.repairs where id = 'c1800000-0000-4000-8000-000000000002'),
  3::bigint,
  'a replay without a token has no aggregate side effects'
);
select throws_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'c1100000-0000-4000-8000-000000000001',
    'repair_part_id', (select id from public.repair_parts where repair_id = 'c1800000-0000-4000-8000-000000000002'),
    'expected_lock_version', 3,
    'quantity', 2,
    'operation_key', 'c1900000-0000-4000-8000-000000000001'
  ))
$$, 'P0001', 'REPAIR_OPERATION_KEY_REUSED', 'a changed replay remains invalid');
select is(
  (select lock_version from public.repairs where id = 'c1800000-0000-4000-8000-000000000002'),
  3::bigint,
  'an invalid replay does not advance the aggregate version'
);

select * from finish();
rollback;
