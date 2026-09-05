begin;
select no_plan();

create function pg_temp.tr_id(label text) returns uuid
language sql immutable as $$ select md5('r-aud-05:' || label)::uuid $$;

insert into public.organizations (id, name, slug)
values (pg_temp.tr_id('org'), 'Technician role', 'technician-role');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
select pg_temp.tr_id(label), label || '@technician-role.test',
  jsonb_build_object('full_name', label), now(), now()
from unnest(array['admin', 'technician', 'member']) label;
insert into auth.sessions (id, user_id, created_at, updated_at)
select pg_temp.tr_id(label || '-session'), pg_temp.tr_id(label), now(), now()
from unnest(array['admin', 'technician', 'member']) label;
insert into public.organization_memberships (organization_id, user_id)
values (pg_temp.tr_id('org'), pg_temp.tr_id('admin'));
insert into public.user_roles (organization_id, user_id, role_code)
values (pg_temp.tr_id('org'), pg_temp.tr_id('admin'), 'ADMIN');

-- Exercise the existing administration contract, as invoked by the Edge Function.
set local role service_role;
select lives_ok($$ select public.admin_create_user_membership(
  pg_temp.tr_id('admin'), pg_temp.tr_id('technician'), array['TECNICO_REPARACIONES']) $$,
  'administration can assign the new role');
select lives_ok($$ select public.admin_create_user_membership(
  pg_temp.tr_id('admin'), pg_temp.tr_id('member'), array['VENTAS']) $$,
  'existing role assignment still works');
select lives_ok($$ select public.admin_update_user_membership(
  pg_temp.tr_id('admin'), pg_temp.tr_id('technician'), 'technician@technician-role.test',
  'technician@technician-role.test', 'technician', '', array['TECNICO_REPARACIONES']) $$,
  'administration can edit a user keeping only the technical role');
reset role;

select results_eq($$ select permission_code from public.role_permissions
  where role_code = 'TECNICO_REPARACIONES' order by permission_code $$,
  $$ values ('REPAIRS_CHANGE_STATUS'::text), ('REPAIRS_PERFORM_TECHNICAL'), ('REPAIRS_VIEW') $$,
  'technical role has exactly the three intended permissions');
select ok(public.repair_technician_is_active(pg_temp.tr_id('org'), pg_temp.tr_id('technician')),
  'technical role qualifies for assignment');
select ok(public.repair_technician_is_active(pg_temp.tr_id('org'), pg_temp.tr_id('admin')),
  'ADMIN retains technical capability');
select ok(not public.repair_technician_is_active(pg_temp.tr_id('org'), pg_temp.tr_id('member')),
  'sales member remains unqualified');

insert into public.customers (id, organization_id, document_type, document_number, legal_name)
values (pg_temp.tr_id('customer'), pg_temp.tr_id('org'), 'DNI', '61050001', 'Technician customer');
insert into public.products (id, organization_id, code, description, unit_of_measure, sale_price)
values (pg_temp.tr_id('product'), pg_temp.tr_id('org'), 'TECH-ROLE', 'Equipment', 'UND', 10);
insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot, product_code_snapshot,
  product_description_snapshot, current_test_cycle_number
)
select pg_temp.tr_id(state), pg_temp.tr_id('org'), pg_temp.tr_id('customer'),
  pg_temp.tr_id('product'), state, 'No enciende', 'Technician customer', 'DNI 61050001',
  'TECH-ROLE', 'Equipment', case when state = 'testing' then 1 else 0 end
from unnest(array['diagnosis', 'testing']) state;

create function pg_temp.tr_payload(state text) returns jsonb language sql as $$
  select jsonb_build_object('organization_id', pg_temp.tr_id('org'), 'repair_id', id,
    'expected_lock_version', lock_version, 'symptoms', 'No enciende',
    'applied_solution', 'Fuente reemplazada', 'test_type', 'Encendido', 'result', 'Correcto', 'passed', true)
  from public.repairs where id = pg_temp.tr_id(state);
$$;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.tr_id('admin'),
  'role', 'authenticated', 'session_id', pg_temp.tr_id('admin-session'))::text, true);
select results_eq($$ select user_id from public.list_repair_technicians(pg_temp.tr_id('org'), 'technician@') $$,
  $$ values (pg_temp.tr_id('technician')) $$, 'ADMIN can select the technician');
select lives_ok($$ select public.assign_repair(pg_temp.tr_id('org'), pg_temp.tr_id('diagnosis'),
  pg_temp.tr_id('technician'), 1) $$, 'ADMIN can assign the technician');

select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.tr_id('technician'),
  'role', 'authenticated', 'session_id', pg_temp.tr_id('technician-session'))::text, true);
select is((select count(*) from public.repair_list where organization_id = pg_temp.tr_id('org')),
  2::bigint, 'technician can read repairs with RLS');
select ok(not public.has_organization_permission(pg_temp.tr_id('org'), 'USERS_MANAGE'),
  'technician cannot administer users');
select ok(not public.has_organization_permission(pg_temp.tr_id('org'), 'REPAIRS_APPROVE_QUOTE'),
  'technician cannot approve quotes');
select lives_ok($$ select public.record_repair_diagnosis(pg_temp.tr_payload('diagnosis')) $$,
  'technician session can record diagnosis');
select lives_ok($$ select public.record_repair_solution(pg_temp.tr_payload('diagnosis')) $$,
  'technician session can record solution');
select lives_ok($$ select public.record_repair_test(pg_temp.tr_payload('testing')) $$,
  'technician session can perform a test using actor fallback');
select is((select performed_by from public.repair_tests where repair_id = pg_temp.tr_id('testing')),
  pg_temp.tr_id('technician'), 'test records the real technician actor');
select lives_ok($$ select public.change_repair_status(pg_temp.tr_id('org'), pg_temp.tr_id('diagnosis'),
  'quote_pending', null, (select lock_version from public.repairs where id = pg_temp.tr_id('diagnosis'))) $$,
  'technician session can advance repair state');
select throws_ok($$ select public.assign_repair(pg_temp.tr_id('org'), pg_temp.tr_id('testing'),
  pg_temp.tr_id('technician'), 1) $$, '42501', 'REPAIR_FORBIDDEN', 'technician cannot assign repair technicians');

select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.tr_id('member'),
  'role', 'authenticated', 'session_id', pg_temp.tr_id('member-session'))::text, true);
select throws_ok($$ select public.record_repair_test(pg_temp.tr_payload('testing')) $$,
  '42501', 'REPAIR_FORBIDDEN', 'member without command capability is rejected');

reset role;
set local role service_role;
select throws_ok($$ select public.admin_create_user_membership(pg_temp.tr_id('technician'),
  pg_temp.tr_id('member'), array['ADMIN']) $$, 'P0001', 'ADMIN_ACCESS_REQUIRED',
  'administration rejects technician actor even through the server contract');
reset role;

-- Command permission must not substitute for technical capacity.
delete from public.role_permissions where role_code = 'TECNICO_REPARACIONES'
  and permission_code = 'REPAIRS_PERFORM_TECHNICAL';
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.tr_id('technician'),
  'role', 'authenticated', 'session_id', pg_temp.tr_id('technician-session'))::text, true);
select throws_ok($$ select public.record_repair_test(pg_temp.tr_payload('testing')) $$,
  'P0001', 'REPAIR_TECHNICIAN_UNAVAILABLE', 'revoked capability rejects the technician with command permission');

select * from finish();
rollback;
