begin;

select plan(76);

-- Contract and row-lock audit.
select has_function('public', 'update_repair', array['jsonb'], 'update_repair(jsonb) keeps its signature');
select is(
  (select prosecdef from pg_proc where oid = 'public.update_repair(jsonb)'::regprocedure),
  true,
  'update_repair remains SECURITY DEFINER'
);
select ok(
  pg_get_functiondef('public.update_repair(jsonb)'::regprocedure) ~* $$SET search_path (TO|=) ''$$,
  'update_repair keeps an empty search_path'
);
select is(has_function_privilege('authenticated', 'public.update_repair(jsonb)', 'EXECUTE'), true, 'authenticated keeps execute');
select is(has_function_privilege('service_role', 'public.update_repair(jsonb)', 'EXECUTE'), true, 'service_role keeps execute');
select is(has_function_privilege('anon', 'public.update_repair(jsonb)', 'EXECUTE'), false, 'anon has no execute');

select ok(pg_get_functiondef('public.record_repair_diagnosis_unchecked(jsonb)'::regprocedure) ~* 'for update', 'diagnosis keeps its domain repair lock');
select ok(pg_get_functiondef('public.save_repair_quote_unchecked(jsonb)'::regprocedure) ~* 'for update', 'quote save and submit keep their domain repair lock');
select ok(pg_get_functiondef('public.reserve_repair_part_unchecked(jsonb)'::regprocedure) ~* 'for update', 'part reservation keeps its domain repair lock');
select ok(pg_get_functiondef('public.consume_repair_part_unchecked(jsonb)'::regprocedure) ~* 'for update of repair', 'part consumption keeps its domain repair lock');
select ok(pg_get_functiondef('public.record_repair_test_unchecked(jsonb)'::regprocedure) ~* 'for update', 'test recording keeps its domain repair lock');
select ok(pg_get_functiondef('public.record_repair_solution_unchecked(jsonb)'::regprocedure) ~* 'for update', 'solution recording keeps its domain repair lock');
select ok(pg_get_functiondef('public.change_repair_status_unchecked(uuid,uuid,text,text)'::regprocedure) ~* 'for update', 'status progression keeps its domain repair lock');
select ok(
  pg_get_functiondef('public.approve_repair_quote_unchecked(uuid,uuid,uuid,text)'::regprocedure) ~* 'for update'
    and pg_get_functiondef('public.reject_repair_quote_unchecked(uuid,uuid,uuid,text)'::regprocedure) ~* 'for update'
    and pg_get_functiondef('public.cancel_repair_part_unchecked(uuid,uuid,text)'::regprocedure) ~* 'for update of repair'
    and pg_get_functiondef('public.deliver_repair_unchecked(uuid,uuid,text)'::regprocedure) ~* 'for update'
    and pg_get_functiondef('public.cancel_repair_unchecked(uuid,uuid,text)'::regprocedure) ~* 'for update',
  'all specialized status progression implementations keep their domain repair lock'
);

-- Fixture for 24 focal scenarios.
insert into public.organizations (id, name, slug)
values
  ('b1040000-0000-4000-8000-000000000001', 'Repair identity one', 'repair-identity-one'),
  ('b1040000-0000-4000-8000-000000000002', 'Repair identity two', 'repair-identity-two');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('b2040000-0000-4000-8000-000000000001', 'identity.admin@test.local', '{"full_name":"Identity Admin"}', now(), now()),
  ('b2040000-0000-4000-8000-000000000002', 'identity.sales@test.local', '{"full_name":"Identity Sales"}', now(), now()),
  ('b2040000-0000-4000-8000-000000000003', 'identity.tech@test.local', '{"full_name":"Identity Tech"}', now(), now()),
  ('b2040000-0000-4000-8000-000000000004', 'identity.other@test.local', '{"full_name":"Identity Other"}', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('b3040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000001', now(), now()),
  ('b3040000-0000-4000-8000-000000000002', 'b2040000-0000-4000-8000-000000000002', now(), now()),
  ('b3040000-0000-4000-8000-000000000003', 'b2040000-0000-4000-8000-000000000003', now(), now()),
  ('b3040000-0000-4000-8000-000000000004', 'b2040000-0000-4000-8000-000000000004', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('b1040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000001'),
  ('b1040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000002'),
  ('b1040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000003'),
  ('b1040000-0000-4000-8000-000000000002', 'b2040000-0000-4000-8000-000000000004');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('b1040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000001', 'ADMIN'),
  ('b1040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000002', 'VENTAS'),
  ('b1040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000003', 'ALMACEN'),
  ('b1040000-0000-4000-8000-000000000002', 'b2040000-0000-4000-8000-000000000004', 'ADMIN');

insert into public.customers (id, organization_id, document_type, document_number, legal_name, trade_name, is_active)
values
  ('b4040000-0000-4000-8000-000000000001', 'b1040000-0000-4000-8000-000000000001', 'DNI', '54000001', 'Identity Customer One', null, true),
  ('b4040000-0000-4000-8000-000000000002', 'b1040000-0000-4000-8000-000000000001', 'RUC', '20540000002', 'Identity Customer Two SAC', 'Customer Two', true),
  ('b4040000-0000-4000-8000-000000000003', 'b1040000-0000-4000-8000-000000000001', 'DNI', '54000003', 'Inactive Customer', null, false),
  ('b4040000-0000-4000-8000-000000000004', 'b1040000-0000-4000-8000-000000000002', 'DNI', '54000004', 'Other Customer', null, true);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, expiration_control, serial_control, is_active, created_by, updated_by
)
values
  ('b5040000-0000-4000-8000-000000000001', 'b1040000-0000-4000-8000-000000000001', 'IDENT-NO-1', 'Identity no serial one', 'UND', 10, false, false, false, true, 'b2040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000001'),
  ('b5040000-0000-4000-8000-000000000002', 'b1040000-0000-4000-8000-000000000001', 'IDENT-SER-2', 'Identity serial product', 'UND', 20, false, false, true, true, 'b2040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000001'),
  ('b5040000-0000-4000-8000-000000000003', 'b1040000-0000-4000-8000-000000000001', 'IDENT-NO-3', 'Identity no serial three', 'UND', 30, false, false, false, true, 'b2040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000001'),
  ('b5040000-0000-4000-8000-000000000004', 'b1040000-0000-4000-8000-000000000002', 'IDENT-OTHER', 'Identity other product', 'UND', 40, false, false, false, true, 'b2040000-0000-4000-8000-000000000004', 'b2040000-0000-4000-8000-000000000004');

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values ('b6040000-0000-4000-8000-000000000001', 'b1040000-0000-4000-8000-000000000001', 'IDENT', 'Identity warehouse', 'b2040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000001');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by)
values ('b7040000-0000-4000-8000-000000000001', 'b1040000-0000-4000-8000-000000000001', 'b6040000-0000-4000-8000-000000000001', 'I-01', 'Identity location', 'b2040000-0000-4000-8000-000000000001', 'b2040000-0000-4000-8000-000000000001');

insert into public.repairs (
  id, organization_id, customer_id, product_id, serial_number, status,
  current_test_cycle_number, problem_description, diagnosis, applied_solution,
  assigned_technician_id, customer_name_snapshot, customer_document_snapshot,
  product_code_snapshot, product_description_snapshot, created_by, updated_by, updated_at
)
select
  ('b8040000-0000-4000-8000-' || lpad(scenario::text, 12, '0'))::uuid,
  case when scenario = 17 then 'b1040000-0000-4000-8000-000000000002'::uuid else 'b1040000-0000-4000-8000-000000000001'::uuid end,
  case when scenario = 17 then 'b4040000-0000-4000-8000-000000000004'::uuid else 'b4040000-0000-4000-8000-000000000001'::uuid end,
  case when scenario = 17 then 'b5040000-0000-4000-8000-000000000004'::uuid when scenario = 15 then 'b5040000-0000-4000-8000-000000000002'::uuid else 'b5040000-0000-4000-8000-000000000001'::uuid end,
  case when scenario = 15 then 'SERIAL-OLD' else null end,
  case when scenario in (2, 7, 22, 23) then 'warranty' when scenario in (5, 6) then 'diagnosis' when scenario = 8 then 'testing' when scenario = 12 then 'in_repair' else 'received' end,
  case when scenario = 8 then 1 else 0 end,
  'Identity focal scenario ' || scenario,
  case when scenario = 9 then 'Existing direct diagnosis' else null end,
  case when scenario = 10 then 'Existing direct solution' else null end,
  case when scenario in (5, 8) then 'b2040000-0000-4000-8000-000000000003'::uuid else null end,
  case when scenario = 17 then 'Other Customer' else 'Identity Customer One' end,
  case when scenario = 17 then 'DNI 54000004' else 'DNI 54000001' end,
  case when scenario = 17 then 'IDENT-OTHER' when scenario = 15 then 'IDENT-SER-2' else 'IDENT-NO-1' end,
  case when scenario = 17 then 'Identity other product' when scenario = 15 then 'Identity serial product' else 'Identity no serial one' end,
  case when scenario = 17 then 'b2040000-0000-4000-8000-000000000004'::uuid else 'b2040000-0000-4000-8000-000000000001'::uuid end,
  case when scenario = 17 then 'b2040000-0000-4000-8000-000000000004'::uuid else 'b2040000-0000-4000-8000-000000000001'::uuid end,
  '2000-01-01 00:00:00+00'::timestamptz
from generate_series(1, 24) scenario;

create function pg_temp.with_repair_version(payload jsonb)
returns jsonb
language sql
stable
as $$
  select payload || jsonb_build_object(
    'expected_lock_version', (
      select repair.lock_version
      from public.repairs repair
      where repair.organization_id = nullif(payload ->> 'organization_id', '')::uuid
        and repair.id = coalesce(
          nullif(payload ->> 'id', '')::uuid,
          nullif(payload ->> 'repair_id', '')::uuid
        )
    )
  );
$$;

insert into public.repair_events (
  organization_id, repair_id, event_type, from_status, to_status, actor_user_id, metadata
)
select repair.organization_id, repair.id, 'CREATED', null,
  case when repair.id = 'b8040000-0000-4000-8000-000000000011' then 'received' else repair.status end,
  repair.created_by, '{}'::jsonb
from public.repairs repair
where repair.id::text like 'b8040000-0000-4000-8000-%'
  and repair.id not in (
    'b8040000-0000-4000-8000-000000000021',
    'b8040000-0000-4000-8000-000000000022'
  );

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2040000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b3040000-0000-4000-8000-000000000001"}', true);

do $$
declare
  quote_id uuid;
  part_id uuid;
begin
  perform public.record_inventory_movement('{
    "organization_id":"b1040000-0000-4000-8000-000000000001",
    "product_id":"b5040000-0000-4000-8000-000000000001",
    "warehouse_id":"b6040000-0000-4000-8000-000000000001",
    "location_id":"b7040000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":10,"unit_cost":5,
    "stock_status":"available","operation_date":"2026-08-30","reason":"Identity lock stock"
  }'::jsonb);
  perform public.assign_repair('b1040000-0000-4000-8000-000000000001', 'b8040000-0000-4000-8000-000000000003', 'b2040000-0000-4000-8000-000000000003', (select lock_version from public.repairs where organization_id = 'b1040000-0000-4000-8000-000000000001' and id = 'b8040000-0000-4000-8000-000000000003'));
  perform public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000003","priority":"urgent","notes":"Administrative intake edit"}'::jsonb));
  perform public.assign_repair('b1040000-0000-4000-8000-000000000001', 'b8040000-0000-4000-8000-000000000023', 'b2040000-0000-4000-8000-000000000003', (select lock_version from public.repairs where organization_id = 'b1040000-0000-4000-8000-000000000001' and id = 'b8040000-0000-4000-8000-000000000023'));
  perform public.record_repair_solution(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","repair_id":"b8040000-0000-4000-8000-000000000004","applied_solution":"Substantive solution"}'::jsonb));
  perform public.record_repair_diagnosis(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","repair_id":"b8040000-0000-4000-8000-000000000005","technician_id":"b2040000-0000-4000-8000-000000000003","symptoms":"Does not start","cause_found":"Power board","recommended_solution":"Replace board"}'::jsonb));
  quote_id := public.save_repair_quote(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","repair_id":"b8040000-0000-4000-8000-000000000006","items":[{"line_type":"labor","description":"Diagnosis","quantity":1,"unit_price":20}]}'::jsonb));
  perform public.save_repair_quote(jsonb_build_object(
    'organization_id', 'b1040000-0000-4000-8000-000000000001',
    'repair_id', 'b8040000-0000-4000-8000-000000000006',
    'expected_lock_version', (select lock_version from public.repairs where organization_id = 'b1040000-0000-4000-8000-000000000001' and id = 'b8040000-0000-4000-8000-000000000006'),
    'id', quote_id,
    'submit', true,
    'items', '[{"line_type":"labor","description":"Diagnosis submitted","quantity":1,"unit_price":20}]'::jsonb
  ));
  part_id := public.reserve_repair_part(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","repair_id":"b8040000-0000-4000-8000-000000000007","product_id":"b5040000-0000-4000-8000-000000000001","warehouse_id":"b6040000-0000-4000-8000-000000000001","location_id":"b7040000-0000-4000-8000-000000000001","quantity_requested":1}'::jsonb));
  perform public.consume_repair_part(jsonb_build_object(
    'organization_id', 'b1040000-0000-4000-8000-000000000001',
    'repair_part_id', part_id,
    'expected_lock_version', (select lock_version from public.repairs where organization_id = 'b1040000-0000-4000-8000-000000000001' and id = 'b8040000-0000-4000-8000-000000000007'),
    'quantity', 1,
    'operation_key', 'b9040000-0000-4000-8000-000000000007'
  ));
  perform public.record_repair_test(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","repair_id":"b8040000-0000-4000-8000-000000000008","test_type":"Operation","result":"Passed","passed":true}'::jsonb));
  perform public.record_repair_solution(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","repair_id":"b8040000-0000-4000-8000-000000000010","applied_solution":"Specialized replacement"}'::jsonb));
  perform public.change_repair_status('b1040000-0000-4000-8000-000000000001', 'b8040000-0000-4000-8000-000000000011', 'warranty', 'Warranty progression', (select lock_version from public.repairs where organization_id = 'b1040000-0000-4000-8000-000000000001' and id = 'b8040000-0000-4000-8000-000000000011'));
end;
$$;

reset role;
insert into public.repair_events (organization_id, repair_id, event_type, from_status, to_status, actor_user_id, metadata)
values ('b1040000-0000-4000-8000-000000000001', 'b8040000-0000-4000-8000-000000000024', 'UPDATED', 'diagnosis', 'diagnosis', 'b2040000-0000-4000-8000-000000000001', '{}');

create temporary table repair_identity_before as
select repair.id, repair.customer_id, repair.product_id, repair.serial_number,
  repair.serial_control_snapshot,
  repair.customer_name_snapshot, repair.customer_document_snapshot,
  repair.product_code_snapshot, repair.product_description_snapshot,
  repair.updated_by, repair.updated_at,
  (select count(*) from public.repair_events event where event.repair_id = repair.id) as event_count,
  (select count(*) from public.audit_events audit where audit.entity_id = repair.id::text) as audit_count
from public.repairs repair
where repair.id in (
  'b8040000-0000-4000-8000-000000000005', 'b8040000-0000-4000-8000-000000000006',
  'b8040000-0000-4000-8000-000000000007', 'b8040000-0000-4000-8000-000000000008',
  'b8040000-0000-4000-8000-000000000009', 'b8040000-0000-4000-8000-000000000010',
  'b8040000-0000-4000-8000-000000000011', 'b8040000-0000-4000-8000-000000000022',
  'b8040000-0000-4000-8000-000000000024'
);
grant select on repair_identity_before to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2040000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b3040000-0000-4000-8000-000000000001"}', true);

-- 1: received correction updates active tenant references, snapshots and traceability.
select lives_ok($$
  select public.create_repair('{"organization_id":"b1040000-0000-4000-8000-000000000001","customer_id":"b4040000-0000-4000-8000-000000000001","product_id":"b5040000-0000-4000-8000-000000000002","serial_number":"  CREATED-SERIAL  ","problem_description":"Normal identity creation","customer_reference":"IDENTITY_CREATE"}'::jsonb)
$$, 'normal repair creation still accepts customer, product and serial identity');
select results_eq(
  $$ select customer_id, product_id, serial_number, serial_control_snapshot from public.repairs where customer_reference = 'IDENTITY_CREATE' $$,
  $$ values ('b4040000-0000-4000-8000-000000000001'::uuid, 'b5040000-0000-4000-8000-000000000002'::uuid, 'CREATED-SERIAL'::text, true) $$,
  'normal creation stores the complete normalized identity'
);

select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000001","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb))
$$, 'initial received identity correction is allowed');
select results_eq(
  $$ select customer_id, customer_name_snapshot, customer_document_snapshot from public.repairs where id = 'b8040000-0000-4000-8000-000000000001' $$,
  $$ values ('b4040000-0000-4000-8000-000000000002'::uuid, 'Customer Two'::text, 'RUC 20540000002'::text) $$,
  'customer correction refreshes snapshots'
);
select is((select count(*) from public.repair_events where repair_id = 'b8040000-0000-4000-8000-000000000001' and event_type = 'UPDATED'), 1::bigint, 'allowed correction writes one general event');
select is((select count(*) from public.audit_events where entity_id = 'b8040000-0000-4000-8000-000000000001' and action = 'REPAIR_UPDATED'), 1::bigint, 'allowed correction writes one general audit');
select ok((select updated_at > '2000-01-01'::timestamptz from public.repairs where id = 'b8040000-0000-4000-8000-000000000001'), 'allowed correction advances updated_at');

-- 2: a repair created directly in warranty is still initial intake.
select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000002","product_id":"b5040000-0000-4000-8000-000000000002","serial_number":"  WARRANTY-SERIAL  "}'::jsonb))
$$, 'initial warranty identity correction is allowed');
select results_eq(
  $$ select product_id, serial_number, serial_control_snapshot, product_code_snapshot, product_description_snapshot from public.repairs where id = 'b8040000-0000-4000-8000-000000000002' $$,
  $$ values ('b5040000-0000-4000-8000-000000000002'::uuid, 'WARRANTY-SERIAL'::text, true, 'IDENT-SER-2'::text, 'Identity serial product'::text) $$,
  'warranty product switch preserves serial trigger and snapshots'
);

-- 3 and 23: administrative UPDATED, priority, notes and assignment do not lock identity.
select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000003","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb))
$$, 'assignment and general UPDATED history do not lock received identity');
select is((select customer_id from public.repairs where id = 'b8040000-0000-4000-8000-000000000003'), 'b4040000-0000-4000-8000-000000000002'::uuid, 'received identity changes after administrative history');
select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000023","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb))
$$, 'assignment alone does not lock initial warranty identity');
select is((select customer_id from public.repairs where id = 'b8040000-0000-4000-8000-000000000023'), 'b4040000-0000-4000-8000-000000000002'::uuid, 'warranty identity changes after assignment-only history');

-- 14 and 15: both serial-control product switch directions remain trigger-safe.
select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000014","product_id":"b5040000-0000-4000-8000-000000000002","serial_number":"SERIAL-NEW"}'::jsonb))
$$, 'early switch to serial-controlled product is allowed atomically');
select results_eq($$ select product_id, serial_number, serial_control_snapshot from public.repairs where id = 'b8040000-0000-4000-8000-000000000014' $$, $$ values ('b5040000-0000-4000-8000-000000000002'::uuid, 'SERIAL-NEW'::text, true) $$, 'serial-controlled switch stores normalized identity');
select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000015","product_id":"b5040000-0000-4000-8000-000000000003","serial_number":"   "}'::jsonb))
$$, 'early switch away from serial control accepts btrim empty-null serial');
select results_eq($$ select product_id, serial_number, serial_control_snapshot from public.repairs where id = 'b8040000-0000-4000-8000-000000000015' $$, $$ values ('b5040000-0000-4000-8000-000000000003'::uuid, null::text, false) $$, 'non-serial switch clears serial and snapshot');

-- 4 and 12: equivalent identity and non-identity edits remain available late.
select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000004","customer_id":"b4040000-0000-4000-8000-000000000001","product_id":"b5040000-0000-4000-8000-000000000001","serial_number":"   ","notes":"Equivalent late edit"}'::jsonb))
$$, 'equivalent normalized identity values are allowed after history');
select is((select notes from public.repairs where id = 'b8040000-0000-4000-8000-000000000004'), 'Equivalent late edit'::text, 'equivalent late update persists general fields');
select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000012","priority":"high","notes":"Late general edit"}'::jsonb))
$$, 'late general edit remains allowed outside initial intake');
select results_eq($$ select priority, notes, customer_id, product_id from public.repairs where id = 'b8040000-0000-4000-8000-000000000012' $$, $$ values ('high'::text, 'Late general edit'::text, 'b4040000-0000-4000-8000-000000000001'::uuid, 'b5040000-0000-4000-8000-000000000001'::uuid) $$, 'late general edit does not alter identity');

-- 19: VENTAS keeps authorized early corrections.
select set_config('request.jwt.claims', '{"sub":"b2040000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b3040000-0000-4000-8000-000000000002"}', true);
select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000019","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb))
$$, 'VENTAS can correct initial identity');
select is((select updated_by from public.repairs where id = 'b8040000-0000-4000-8000-000000000019'), 'b2040000-0000-4000-8000-000000000002'::uuid, 'VENTAS is retained as update actor');
select throws_ok(
  $$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000005","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb)) $$,
  'P0001', 'REPAIR_IDENTITY_LOCKED', 'VENTAS cannot bypass the identity lock through direct RPC'
);

-- 20: service_role keeps server-to-server access and tenant predicates.
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000020","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb))
$$, 'service_role can correct initial identity');
select is((select customer_id from public.repairs where id = 'b8040000-0000-4000-8000-000000000020'), 'b4040000-0000-4000-8000-000000000002'::uuid, 'service_role correction persists');
select throws_ok(
  $$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000006","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb)) $$,
  'P0001', 'REPAIR_IDENTITY_LOCKED', 'service_role cannot bypass the identity lock through direct RPC'
);

-- 21: conservative legacy fallback permits only a no-history received row.
select lives_ok($$
  select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000021","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb))
$$, 'legacy received row without CREATED can be corrected');
select is((select customer_id from public.repairs where id = 'b8040000-0000-4000-8000-000000000021'), 'b4040000-0000-4000-8000-000000000002'::uuid, 'legacy received fallback persists correction');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2040000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b3040000-0000-4000-8000-000000000001"}', true);

-- 5-11, 22 and 24: every substantive source or unsafe progression locks identity.
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000005","customer_id":"b4040000-0000-4000-8000-000000000002","product_id":"b5040000-0000-4000-8000-000000000002","serial_number":"LOCKED-SERIAL"}'::jsonb)) $$, 'P0001', 'REPAIR_IDENTITY_LOCKED', 'diagnostic history locks the complete identity');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000006","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb)) $$, 'P0001', 'REPAIR_IDENTITY_LOCKED', 'draft quote history locks identity');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000007","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb)) $$, 'P0001', 'REPAIR_IDENTITY_LOCKED', 'part reservation and its consumption path lock identity');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000008","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb)) $$, 'P0001', 'REPAIR_IDENTITY_LOCKED', 'test history locks identity');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000009","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb)) $$, 'P0001', 'REPAIR_IDENTITY_LOCKED', 'nonnull diagnosis locks identity');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000010","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb)) $$, 'P0001', 'REPAIR_IDENTITY_LOCKED', 'nonnull solution and SOLUTION_RECORDED lock identity');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000011","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb)) $$, 'P0001', 'REPAIR_IDENTITY_LOCKED', 'warranty reached by progression is not initial warranty');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000022","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb)) $$, 'P0001', 'REPAIR_IDENTITY_LOCKED', 'warranty without CREATED proof fails safely');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000024","customer_id":"b4040000-0000-4000-8000-000000000002"}'::jsonb)) $$, 'P0001', 'REPAIR_IDENTITY_LOCKED', 'status evidence away from intake locks even in an otherwise administrative event');
select results_eq(
  $$
    select repair.id, repair.customer_id, repair.product_id, repair.serial_number,
      repair.serial_control_snapshot,
      repair.customer_name_snapshot, repair.customer_document_snapshot,
      repair.product_code_snapshot, repair.product_description_snapshot,
      repair.updated_by, repair.updated_at,
      (select count(*) from public.repair_events event where event.repair_id = repair.id),
      (select count(*) from public.audit_events audit where audit.entity_id = repair.id::text)
    from public.repairs repair
    where repair.id in (select id from repair_identity_before)
    order by repair.id
  $$,
  $$
    select id, customer_id, product_id, serial_number, serial_control_snapshot,
      customer_name_snapshot, customer_document_snapshot,
      product_code_snapshot, product_description_snapshot, updated_by, updated_at,
      event_count, audit_count
    from repair_identity_before
    order by id
  $$,
  'all identity-lock failures are atomic across row, snapshots, timestamp, events and audits'
);

-- 13: same-tenant references must remain active, with atomic failure.
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000013","customer_id":"b4040000-0000-4000-8000-000000000003","notes":"must roll back"}'::jsonb)) $$, 'P0001', 'REPAIR_CUSTOMER_UNAVAILABLE', 'inactive same-tenant customer is rejected');
select results_eq($$ select customer_id, notes, updated_at, (select count(*) from public.repair_events where repair_id = repair.id and event_type = 'UPDATED') from public.repairs repair where id = 'b8040000-0000-4000-8000-000000000013' $$, $$ values ('b4040000-0000-4000-8000-000000000001'::uuid, null::text, '2000-01-01'::timestamptz, 0::bigint) $$, 'unavailable reference failure changes no row, timestamp or event');

-- 16 and 17: cross-tenant references and repair keys cannot escape tenant scope.
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000016","product_id":"b5040000-0000-4000-8000-000000000004"}'::jsonb)) $$, 'P0001', 'REPAIR_PRODUCT_UNAVAILABLE', 'cross-tenant product is unavailable');
select is((select product_id from public.repairs where id = 'b8040000-0000-4000-8000-000000000016'), 'b5040000-0000-4000-8000-000000000001'::uuid, 'cross-tenant reference failure is atomic');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000002","id":"b8040000-0000-4000-8000-000000000017","notes":"forbidden"}'::jsonb)) $$, '42501', 'REPAIR_FORBIDDEN', 'authenticated ADMIN cannot address another tenant');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000017","notes":"wrong tenant key"}'::jsonb)) $$, 'P0001', 'REPAIR_NOT_FOUND', 'service_role still requires matching tenant and repair');
select results_eq($$ select notes, updated_at, (select count(*) from public.repair_events where repair_id = repair.id and event_type = 'UPDATED') from public.repairs repair where id = 'b8040000-0000-4000-8000-000000000017' $$, $$ values (null::text, '2000-01-01'::timestamptz, 0::bigint) $$, 'cross-tenant repair attempts leave no row or event mutation');

-- 18: all P1-03 boundaries retain their exact errors and atomicity.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2040000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b3040000-0000-4000-8000-000000000001"}', true);
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000018","status":"diagnosis"}'::jsonb)) $$, 'P0001', 'REPAIR_STATUS_USE_STATUS_RPC', 'P1-03 status error is preserved');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000018","assigned_technician_id":"b2040000-0000-4000-8000-000000000003"}'::jsonb)) $$, 'P0001', 'REPAIR_ASSIGN_USE_ASSIGN_RPC', 'P1-03 assignment error is preserved');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version(jsonb_build_object('organization_id', 'b1040000-0000-4000-8000-000000000001', 'id', 'b8040000-0000-4000-8000-000000000018', 'received_at', (select received_at + interval '1 hour' from public.repairs where id = 'b8040000-0000-4000-8000-000000000018')))) $$, 'P0001', 'REPAIR_RECEIVED_AT_IMMUTABLE', 'P1-03 received_at error is preserved');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000018","diagnosis":"bypass"}'::jsonb)) $$, 'P0001', 'REPAIR_DIAGNOSIS_USE_DIAGNOSIS_RPC', 'P1-03 diagnosis error is preserved');
select throws_ok($$ select public.update_repair(pg_temp.with_repair_version('{"organization_id":"b1040000-0000-4000-8000-000000000001","id":"b8040000-0000-4000-8000-000000000018","applied_solution":"bypass"}'::jsonb)) $$, 'P0001', 'REPAIR_APPLIED_SOLUTION_USE_SOLUTION_RPC', 'P1-03 solution error is preserved');
select results_eq($$ select assigned_technician_id, diagnosis, applied_solution, updated_at, (select count(*) from public.repair_events where repair_id = repair.id and event_type = 'UPDATED') from public.repairs repair where id = 'b8040000-0000-4000-8000-000000000018' $$, $$ values (null::uuid, null::text, null::text, '2000-01-01'::timestamptz, 0::bigint) $$, 'P1-03 failures remain atomic');

-- Specialized writer fixture proof and allowed-update trace payload.
select is((select count(*) from public.repair_diagnostics where repair_id = 'b8040000-0000-4000-8000-000000000005'), 1::bigint, 'diagnosis writer committed substantive history');
select is((select count(*) from public.repair_quotes where repair_id = 'b8040000-0000-4000-8000-000000000006'), 1::bigint, 'quote writer committed substantive history');
select is((select count(*) from public.repair_events where repair_id = 'b8040000-0000-4000-8000-000000000006' and event_type = 'QUOTE_SUBMITTED'), 1::bigint, 'quote submit path committed substantive history');
select is((select count(*) from public.repair_parts where repair_id = 'b8040000-0000-4000-8000-000000000007'), 1::bigint, 'part writer committed substantive history');
select is((select count(*) from public.repair_events where repair_id = 'b8040000-0000-4000-8000-000000000007' and event_type = 'PART_CONSUMED'), 1::bigint, 'part consumption path remains covered by the repair lock');
select is((select count(*) from public.repair_tests where repair_id = 'b8040000-0000-4000-8000-000000000008'), 1::bigint, 'test writer committed substantive history');
select is((select count(*) from public.repair_events where repair_id = 'b8040000-0000-4000-8000-000000000010' and event_type = 'SOLUTION_RECORDED'), 1::bigint, 'solution writer committed specialized history');
select is((select count(*) from public.repair_events where repair_id = 'b8040000-0000-4000-8000-000000000011' and event_type = 'STATUS_CHANGED'), 1::bigint, 'status writer committed progression history');
select ok(
  (
    select metadata ? 'old_values'
      and metadata ? 'new_values'
      and metadata -> 'old_values' ->> 'status' = 'received'
      and metadata -> 'new_values' ->> 'status' = 'received'
      and not (metadata -> 'old_values' ? 'lock_version')
      and not (metadata -> 'new_values' ? 'lock_version')
    from public.repair_events
    where repair_id = 'b8040000-0000-4000-8000-000000000001'
      and event_type = 'UPDATED'
  ),
  'allowed identity correction retains business metadata without the OCC token'
);
select ok(
  (select old_values ->> 'status' = 'received' and new_values ->> 'status' = 'received' from public.audit_events where entity_id = 'b8040000-0000-4000-8000-000000000001' and action = 'REPAIR_UPDATED'),
  'allowed identity correction retains general audit status snapshots'
);

select * from finish();
rollback;
