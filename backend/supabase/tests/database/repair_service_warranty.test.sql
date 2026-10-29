begin;
select no_plan();

select has_table('public', 'repair_external_services', 'external custody is persisted separately');
select has_table('public', 'repair_service_warranties', 'post-service warranty is explicit');
select is(has_table_privilege('authenticated', 'public.repair_external_services', 'INSERT'), false,
  'clients cannot bypass custody commands');
select is(has_table_privilege('authenticated', 'public.repair_service_warranties', 'UPDATE'), false,
  'clients cannot rewrite delivered warranty');
select is(has_function_privilege('anon', 'public.send_repair_external_service(jsonb)', 'EXECUTE'), false,
  'anonymous callers cannot send equipment');
select is(has_function_privilege('anon', 'public.configure_repair_service_warranty(jsonb)', 'EXECUTE'), false,
  'anonymous callers cannot promise coverage');

insert into public.organizations(id, name, slug) values
 ('bc100000-0000-4000-8000-000000000001', 'Repair service test', 'repair-service-test'),
 ('bc100000-0000-4000-8000-000000000002', 'Other service test', 'other-service-test');
insert into auth.users(id, email, raw_user_meta_data, created_at, updated_at) values
 ('bc200000-0000-4000-8000-000000000001', 'repair.service@test.local', '{"full_name":"Service Admin"}', now(), now());
insert into auth.sessions(id, user_id, created_at, updated_at) values
 ('bc300000-0000-4000-8000-000000000001', 'bc200000-0000-4000-8000-000000000001', now(), now());
insert into public.organization_memberships(organization_id, user_id) values
 ('bc100000-0000-4000-8000-000000000001', 'bc200000-0000-4000-8000-000000000001');
insert into public.user_roles(organization_id, user_id, role_code) values
 ('bc100000-0000-4000-8000-000000000001', 'bc200000-0000-4000-8000-000000000001', 'ADMIN');
insert into public.customers(id, organization_id, document_type, document_number, legal_name) values
 ('bc400000-0000-4000-8000-000000000001', 'bc100000-0000-4000-8000-000000000001', 'DNI', '44000001', 'Service Customer');
insert into public.products(id, organization_id, code, description, unit_of_measure, sale_price,
 batch_control, serial_control) values
 ('bc500000-0000-4000-8000-000000000001', 'bc100000-0000-4000-8000-000000000001', 'SERVICE-EQUIPMENT', 'Equipment', 'UND', 100, false, false);
insert into public.suppliers(id, organization_id, document_type, document_number, business_name, is_active) values
 ('bc600000-0000-4000-8000-000000000001', 'bc100000-0000-4000-8000-000000000001', 'ruc', '20123456789', 'Service Supplier', true),
 ('bc600000-0000-4000-8000-000000000002', 'bc100000-0000-4000-8000-000000000001', 'ruc', '20123456788', 'Inactive Supplier', false),
 ('bc600000-0000-4000-8000-000000000003', 'bc100000-0000-4000-8000-000000000002', 'ruc', '20123456787', 'Other Supplier', true);
insert into public.repairs(id, organization_id, customer_id, product_id, status, problem_description,
 customer_name_snapshot, customer_document_snapshot, product_code_snapshot, product_description_snapshot) values
 ('bc800000-0000-4000-8000-000000000001', 'bc100000-0000-4000-8000-000000000001',
 'bc400000-0000-4000-8000-000000000001', 'bc500000-0000-4000-8000-000000000001', 'in_repair', 'Does not start',
 'Service Customer', 'DNI 44000001', 'SERVICE-EQUIPMENT', 'Equipment'),
 ('bc800000-0000-4000-8000-000000000002', 'bc100000-0000-4000-8000-000000000001',
 'bc400000-0000-4000-8000-000000000001', 'bc500000-0000-4000-8000-000000000001', 'ready_for_delivery', 'Warranty fixture',
 'Service Customer', 'DNI 44000001', 'SERVICE-EQUIPMENT', 'Equipment');

create function pg_temp.service_payload(changes jsonb default '{}'::jsonb) returns jsonb language sql as $$
 select jsonb_build_object('organization_id', 'bc100000-0000-4000-8000-000000000001',
 'repair_id', 'bc800000-0000-4000-8000-000000000001', 'expected_lock_version', 1,
 'operation_key', 'bc900000-0000-4000-8000-000000000001',
 'supplier_id', 'bc600000-0000-4000-8000-000000000001', 'description', 'Replace external power module') || changes;
$$;
create function pg_temp.return_payload(changes jsonb default '{}'::jsonb) returns jsonb language sql as $$
 select pg_temp.service_payload(jsonb_build_object('expected_lock_version', 2,
 'operation_key', 'bc900000-0000-4000-8000-000000000003', 'external_service_id',
 (select id from public.repair_external_services limit 1), 'cost_amount', 120.50, 'currency', 'PEN')) || changes;
$$;
create function pg_temp.warranty_payload(changes jsonb default '{}'::jsonb) returns jsonb language sql as $$
 select pg_temp.service_payload('{"repair_id":"bc800000-0000-4000-8000-000000000002",
 "operation_key":"bc900000-0000-4000-8000-000000000004","warranty_days":90,
 "coverage":"Power module workmanship only"}') || changes;
$$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"bc200000-0000-4000-8000-000000000001","session_id":"bc300000-0000-4000-8000-000000000001"}', true);
set local role authenticated;

select throws_ok($$select public.send_repair_external_service(pg_temp.service_payload('{"supplier_id":"bc600000-0000-4000-8000-000000000002"}'))$$,
 'P0001', 'REPAIR_EXTERNAL_SUPPLIER_INVALID', 'inactive suppliers cannot receive equipment');
select throws_ok($$select public.send_repair_external_service(pg_temp.service_payload('{"supplier_id":"bc600000-0000-4000-8000-000000000003"}'))$$,
 'P0001', 'REPAIR_EXTERNAL_SUPPLIER_INVALID', 'cross-organization supplier is rejected');
select throws_ok($$select public.send_repair_external_service(pg_temp.service_payload('{"organization_id":"bc100000-0000-4000-8000-000000000002"}'))$$,
 '42501', 'REPAIR_FORBIDDEN', 'cross-organization command is forbidden');
select throws_ok($$select public.send_repair_external_service(pg_temp.service_payload('{"expected_lock_version":null}'))$$,
 'P0001', 'REPAIR_VERSION_REQUIRED', 'missing repair version is rejected');
select throws_ok($$select public.send_repair_external_service(pg_temp.service_payload('{"operation_key":null}'))$$,
 '22023', 'REPAIR_OPERATION_KEY_REQUIRED', 'missing operation key cannot create custody');
select throws_ok($$select public.send_repair_external_service(pg_temp.service_payload('{"expected_lock_version":99}'))$$,
 'P0001', 'REPAIR_VERSION_CONFLICT', 'stale clients cannot send equipment');
select throws_ok($$select public.send_repair_external_service('[]'::jsonb)$$,
 '22023', 'REPAIR_PAYLOAD_INVALID', 'command rejects non-object payload');
select lives_ok($$select public.send_repair_external_service(pg_temp.service_payload())$$, 'equipment can be sent to active supplier');
select lives_ok($$select public.send_repair_external_service(pg_temp.service_payload())$$, 'send retry replays before stale-version check');
select is((select count(*) from public.repair_external_services), 1::bigint, 'retry creates no duplicate custody');
select is((select lock_version from public.repairs where id = 'bc800000-0000-4000-8000-000000000001'), 2::bigint,
 'send advances aggregate version once');
select throws_ok($$select public.send_repair_external_service(pg_temp.service_payload('{"description":"Different intention"}'))$$,
 'P0001', 'REPAIR_OPERATION_KEY_REUSED', 'key cannot be reused for a changed intent');
select throws_ok($$select public.send_repair_external_service(pg_temp.service_payload('{"expected_lock_version":2,"operation_key":"bc900000-0000-4000-8000-000000000002"}'))$$,
 'P0001', 'REPAIR_EXTERNAL_SERVICE_OUTSTANDING', 'only one supplier can hold equipment');
select is((select supplier_name_snapshot from public.repair_external_services), 'Service Supplier', 'supplier display name is captured');
select is((select external_service_pending from public.repair_list where id = 'bc800000-0000-4000-8000-000000000001'),
 true, 'work queue exposes custody without opening optional sections');
select throws_ok($$select public.change_repair_status('bc100000-0000-4000-8000-000000000001',
 'bc800000-0000-4000-8000-000000000001', 'testing', null, 2)$$,
 'P0001', 'REPAIR_EXTERNAL_SERVICE_OUTSTANDING', 'physical tests cannot start before equipment return');

select throws_ok($$select public.receive_repair_external_service(pg_temp.return_payload('{"cost_amount":-1}'))$$,
 '22023', 'REPAIR_EXTERNAL_COST_INVALID', 'negative total cost is rejected');
select throws_ok($$select public.receive_repair_external_service(pg_temp.return_payload('{"cost_amount":1.001}'))$$,
 '22023', 'REPAIR_EXTERNAL_COST_INVALID', 'cost is not silently rounded');
select throws_ok($$select public.receive_repair_external_service(pg_temp.return_payload('{"currency":"EUR"}'))$$,
 '22023', 'REPAIR_EXTERNAL_COST_INVALID', 'unsupported currency is rejected');
select lives_ok($$select public.receive_repair_external_service(pg_temp.return_payload())$$, 'equipment return records final total cost');
select lives_ok($$select public.receive_repair_external_service(pg_temp.return_payload())$$, 'return retry is idempotent');
select is((select cost_amount from public.repair_external_services), 120.50::numeric, 'recorded external total is exact');
select ok((select returned_at is not null from public.repair_external_services), 'returned custody has a timestamp');
select is((select external_service_pending from public.repair_list where id = 'bc800000-0000-4000-8000-000000000001'),
 false, 'return clears custody in the work queue');
select is((select status from public.repairs where id = 'bc800000-0000-4000-8000-000000000001'), 'in_repair',
 'external service does not bypass technical workflow');
select is((select count(*) from public.repair_events where event_type in ('EXTERNAL_SERVICE_SENT','EXTERNAL_SERVICE_RECEIVED')),
 2::bigint, 'only one audit event for each external intention');
select is((select count(*) from public.inventory_movements where organization_id='bc100000-0000-4000-8000-000000000001'),
 0::bigint, 'supplier custody creates no inventory movement');
select is((select count(*) from public.repair_parts where organization_id='bc100000-0000-4000-8000-000000000001'),
 0::bigint, 'supplier custody creates no fictitious replacement part');

select throws_ok($$select public.configure_repair_service_warranty(pg_temp.warranty_payload('{"warranty_days":0}'))$$,
 '22023', 'REPAIR_SERVICE_WARRANTY_INVALID', 'no implicit or zero-day coverage');
select throws_ok($$select public.configure_repair_service_warranty(pg_temp.warranty_payload('{"coverage":""}'))$$,
 '22023', 'REPAIR_SERVICE_WARRANTY_INVALID', 'explicit coverage is required');
select lives_ok($$select public.configure_repair_service_warranty(pg_temp.warranty_payload())$$, 'explicit warranty may be configured before delivery');
select lives_ok($$select public.configure_repair_service_warranty(pg_temp.warranty_payload())$$, 'warranty retry is idempotent');
select is((select count(*) from public.repair_service_warranties), 1::bigint, 'retry creates no duplicate warranty');
select ok((select starts_at is null and ends_at is null from public.repair_service_warranty_details),
 'warranty does not run before actual delivery');
select is((select status from public.repairs where id = 'bc800000-0000-4000-8000-000000000002'), 'ready_for_delivery',
 'post-service warranty does not change existing incoming warranty state');

reset role;
-- Administrative fixture updates test the independent custody guard and derived dates,
-- not an alternative public delivery command. No trigger is disabled.
select set_config('app.repairs_status_write', 'true', true);
select lives_ok($$update public.repairs set status='delivered', delivered_at=now()
 where id='bc800000-0000-4000-8000-000000000002'$$, 'fixture reaches actual delivery');
select is((select ends_at - starts_at from public.repair_service_warranty_details), interval '90 days',
 'coverage expiration is derived from actual delivered_at');
set local role authenticated;
select throws_ok($$select public.configure_repair_service_warranty(pg_temp.warranty_payload('{"expected_lock_version":2,"operation_key":"bc900000-0000-4000-8000-000000000005"}'))$$,
 'P0001', 'REPAIR_SERVICE_WARRANTY_IMMUTABLE', 'delivered coverage cannot be rewritten silently');
select is((select count(*) from public.repair_service_warranties where repair_id='bc800000-0000-4000-8000-000000000001'),
 0::bigint, 'repairs without an explicit promise do not receive a warranty');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.send_repair_external_service(pg_temp.service_payload('{"expected_lock_version":3,"operation_key":"bc900000-0000-4000-8000-000000000006"}'));
select throws_ok($$update public.repairs set status='ready_for_delivery'
 where id='bc800000-0000-4000-8000-000000000001'$$, 'P0001', 'REPAIR_EXTERNAL_SERVICE_OUTSTANDING',
 'absent equipment cannot be marked ready');
select throws_ok($$update public.repairs set status='cancelled'
 where id='bc800000-0000-4000-8000-000000000001'$$, 'P0001', 'REPAIR_EXTERNAL_SERVICE_OUTSTANDING',
 'cancellation cannot hide outstanding custody');
select * from finish();
rollback;
