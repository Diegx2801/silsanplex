begin;
select no_plan();

create function pg_temp.tech_id(label text) returns uuid
language sql immutable as $$ select md5('p1-06:' || label)::uuid $$;

insert into public.organizations (id, name, slug) values
  (pg_temp.tech_id('org'), 'Technical capability', 'technical-capability'),
  (pg_temp.tech_id('other-org'), 'Other technical capability', 'other-technical-capability');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
select pg_temp.tech_id(label), label || '@technical-capability.test',
  jsonb_build_object('full_name', label), now(), now()
from unnest(array['admin', 'worker', 'other-admin', 'member']) label;
insert into auth.sessions (id, user_id, created_at, updated_at)
values (pg_temp.tech_id('session'), pg_temp.tech_id('admin'), now(), now());
insert into public.organization_memberships (organization_id, user_id)
select pg_temp.tech_id(case when label = 'other-admin' then 'other-org' else 'org' end),
  pg_temp.tech_id(label)
from unnest(array['admin', 'worker', 'other-admin', 'member']) label;
insert into public.user_roles (organization_id, user_id, role_code) values
  (pg_temp.tech_id('org'), pg_temp.tech_id('admin'), 'ADMIN'),
  (pg_temp.tech_id('org'), pg_temp.tech_id('worker'), 'CONTABILIDAD'),
  (pg_temp.tech_id('other-org'), pg_temp.tech_id('other-admin'), 'ADMIN');

select ok(public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('admin')),
  'ADMIN has an explicit technical capability');
select ok(not public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('worker')),
  'an active accountant is not a technician');
select ok(not public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('member')),
  'an active member without roles is not a technician');
select ok(not public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('other-admin')),
  'technical capability in another organization is insufficient');
select ok(not public.repair_technician_is_active(pg_temp.tech_id('org'), null),
  'a null technician is rejected');

insert into public.customers (id, organization_id, document_type, document_number, legal_name)
values (pg_temp.tech_id('customer'), pg_temp.tech_id('org'), 'DNI', '61060001', 'Technical customer');
insert into public.products (id, organization_id, code, description, unit_of_measure, sale_price)
values (pg_temp.tech_id('product'), pg_temp.tech_id('org'), 'TECH-CAP', 'Technical product', 'UND', 10);
insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot, product_code_snapshot,
  product_description_snapshot, current_test_cycle_number
)
select pg_temp.tech_id(state), pg_temp.tech_id('org'), pg_temp.tech_id('customer'),
  pg_temp.tech_id('product'), state, 'No enciende', 'Technical customer', 'DNI 61060001',
  'TECH-CAP', 'Technical product', case when state = 'testing' then 1 else 0 end
from unnest(array['diagnosis', 'testing']) state;

create function pg_temp.tech_payload(state text) returns jsonb
language sql as $$
  select jsonb_build_object('organization_id', pg_temp.tech_id('org'),
    'repair_id', repair.id, 'expected_lock_version', repair.lock_version,
    'symptoms', 'No enciende', 'test_type', 'Encendido', 'result', 'Correcto', 'passed', true)
  from public.repairs repair where repair.id = pg_temp.tech_id(state);
$$;

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.tech_id('admin'),
  'role', 'authenticated', 'session_id', pg_temp.tech_id('session'))::text, true);

select results_eq(
  $$ select user_id from public.list_repair_technicians(pg_temp.tech_id('org')) $$,
  $$ values (pg_temp.tech_id('admin')) $$,
  'listing excludes active members without technical capability');
select throws_ok($$
  select public.assign_repair(pg_temp.tech_id('org'), pg_temp.tech_id('diagnosis'),
    pg_temp.tech_id('worker'), 1)
$$, 'P0001', 'REPAIR_TECHNICIAN_UNAVAILABLE', 'assignment rejects an active nontechnical member');
select throws_ok($$
  select public.create_repair(jsonb_build_object('organization_id', pg_temp.tech_id('org'),
    'operation_key', pg_temp.tech_id('create'), 'customer_id', pg_temp.tech_id('customer'),
    'product_id', pg_temp.tech_id('product'), 'problem_description', 'No enciende',
    'assigned_technician_id', pg_temp.tech_id('worker')))
$$, 'P0001', 'REPAIR_TECHNICIAN_UNAVAILABLE', 'creation cannot assign an unqualified technician');
select throws_ok($$
  select public.record_repair_diagnosis(pg_temp.tech_payload('diagnosis') ||
    jsonb_build_object('technician_id', pg_temp.tech_id('worker')))
$$, 'P0001', 'REPAIR_TECHNICIAN_UNAVAILABLE', 'diagnosis rejects an unqualified technician');
select throws_ok($$
  select public.record_repair_test(pg_temp.tech_payload('testing') ||
    jsonb_build_object('performed_by', pg_temp.tech_id('worker')))
$$, 'P0001', 'REPAIR_TECHNICIAN_UNAVAILABLE', 'test rejects an unqualified performer');

reset role;
-- A role containing only the capability proves there is no hardcoded ADMIN check.
insert into public.roles (code, name) values ('TEST_TECH_CAPABILITY', 'Test technical capability');
insert into public.role_permissions (role_code, permission_code)
values ('TEST_TECH_CAPABILITY', 'REPAIRS_PERFORM_TECHNICAL');
insert into public.user_roles (organization_id, user_id, role_code)
values (pg_temp.tech_id('org'), pg_temp.tech_id('worker'), 'TEST_TECH_CAPABILITY');
select ok(public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('worker')),
  'an explicit capability qualifies a non-admin');

set local role authenticated;
select results_eq(
  $$ select user_id from public.list_repair_technicians(pg_temp.tech_id('org'), 'worker') $$,
  $$ values (pg_temp.tech_id('worker')) $$,
  'the list uses the same capability check');
select lives_ok($$
  select public.assign_repair(pg_temp.tech_id('org'), pg_temp.tech_id('diagnosis'),
    pg_temp.tech_id('worker'), 1)
$$, 'assignment accepts an explicitly qualified technician');
select lives_ok($$
  select public.record_repair_diagnosis(pg_temp.tech_payload('diagnosis'))
$$, 'diagnosis accepts the qualified assigned technician fallback');
select lives_ok($$
  select public.record_repair_test(pg_temp.tech_payload('testing') ||
    jsonb_build_object('performed_by', pg_temp.tech_id('worker')))
$$, 'test accepts a qualified non-admin performer');

reset role;
update public.roles set is_active = false where code = 'TEST_TECH_CAPABILITY';
select ok(not public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('worker')),
  'an inactive role grants no technical capability');
update public.roles set is_active = true where code = 'TEST_TECH_CAPABILITY';
update public.permissions set is_active = false where code = 'REPAIRS_PERFORM_TECHNICAL';
select ok(not public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('worker')),
  'an inactive permission grants no technical capability');
update public.permissions set is_active = true where code = 'REPAIRS_PERFORM_TECHNICAL';
update public.profiles set is_active = false, deactivated_at = now() where id = pg_temp.tech_id('worker');
select ok(not public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('worker')),
  'technical capability does not override an inactive profile');
update public.profiles set is_active = true, deactivated_at = null where id = pg_temp.tech_id('worker');
update public.organization_memberships set is_active = false, deactivated_at = now() where user_id = pg_temp.tech_id('worker');
select ok(not public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('worker')),
  'technical capability does not override inactive membership');
update public.organization_memberships set is_active = true, deactivated_at = null where user_id = pg_temp.tech_id('worker');
update public.organizations set is_active = false where id = pg_temp.tech_id('org');
select ok(not public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('worker')),
  'technical capability does not override an inactive organization');
update public.organizations set is_active = true where id = pg_temp.tech_id('org');
delete from public.role_permissions where role_code = 'TEST_TECH_CAPABILITY';
select ok(not public.repair_technician_is_active(pg_temp.tech_id('org'), pg_temp.tech_id('worker')),
  'revoking the capability invalidates the technician immediately');

set local role authenticated;
select is((select count(*) from public.list_repair_technicians(pg_temp.tech_id('org'), 'worker')),
  0::bigint, 'revoked technicians disappear from the list');
select throws_ok($$
  select public.record_repair_diagnosis(pg_temp.tech_payload('diagnosis'))
$$, 'P0001', 'REPAIR_TECHNICIAN_UNAVAILABLE', 'an old assignment cannot bypass revocation');
select throws_ok($$
  select public.record_repair_test(pg_temp.tech_payload('testing') ||
    jsonb_build_object('performed_by', pg_temp.tech_id('worker')))
$$, 'P0001', 'REPAIR_TECHNICIAN_UNAVAILABLE', 'new tests reject a revoked technician');
select is((select count(*) from public.repair_diagnostics where repair_id = pg_temp.tech_id('diagnosis')),
  1::bigint, 'revocation preserves historical diagnoses');
select is((select count(*) from public.repair_tests where repair_id = pg_temp.tech_id('testing')),
  1::bigint, 'revocation preserves historical tests');

reset role;
-- Actor fallback must also have technical capacity, even with command permission.
delete from public.role_permissions where role_code = 'ADMIN' and permission_code = 'REPAIRS_PERFORM_TECHNICAL';
set local role authenticated;
select throws_ok($$
  select public.record_repair_test(pg_temp.tech_payload('testing'))
$$, 'P0001', 'REPAIR_TECHNICIAN_UNAVAILABLE', 'command permission alone does not qualify the actor fallback');

select * from finish();
rollback;
