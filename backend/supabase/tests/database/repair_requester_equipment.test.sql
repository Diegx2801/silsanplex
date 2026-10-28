begin;
select no_plan();

insert into public.organizations(id, name, slug) values
 ('f1280000-0000-4000-8000-000000000001', 'Repair identity variants', 'repair-identity-variants'),
 ('f1280000-0000-4000-8000-000000000002', 'Other repair identity variants', 'other-repair-identity-variants');
insert into auth.users(id, email, raw_user_meta_data, created_at, updated_at)
 values ('f2280000-0000-4000-8000-000000000001', 'repair.variants@test.local', '{"full_name":"Repair Variants Admin"}', now(), now());
insert into auth.sessions(id, user_id, created_at, updated_at)
 values ('f3280000-0000-4000-8000-000000000001', 'f2280000-0000-4000-8000-000000000001', now(), now());
insert into public.organization_memberships(organization_id, user_id)
 values ('f1280000-0000-4000-8000-000000000001', 'f2280000-0000-4000-8000-000000000001');
insert into public.user_roles(organization_id, user_id, role_code)
 values ('f1280000-0000-4000-8000-000000000001', 'f2280000-0000-4000-8000-000000000001', 'ADMIN');
insert into public.customers(id, organization_id, document_type, document_number, legal_name, is_active) values
 ('f4280000-0000-4000-8000-000000000001', 'f1280000-0000-4000-8000-000000000001', 'DNI', '54280001', 'Repair Variants Customer', true),
 ('f4280000-0000-4000-8000-000000000002', 'f1280000-0000-4000-8000-000000000002', 'DNI', '54280002', 'Other Repair Variants Customer', true);
insert into public.products(id, organization_id, code, description, unit_of_measure, serial_control, is_active) values
 ('f5280000-0000-4000-8000-000000000001', 'f1280000-0000-4000-8000-000000000001', 'REPAIR-VARIANTS', 'Repair variants catalog equipment', 'UND', true, true),
 ('f5280000-0000-4000-8000-000000000002', 'f1280000-0000-4000-8000-000000000002', 'OTHER-REPAIR-VARIANTS', 'Other repair variants equipment', 'UND', false, true);

create function pg_temp.create_variant(extra jsonb default '{}'::jsonb) returns uuid language sql as $$
 select public.create_repair(jsonb_build_object(
  'organization_id', 'f1280000-0000-4000-8000-000000000001',
  'operation_key', gen_random_uuid(), 'problem_description', 'Equipment does not start',
  'requester_type', 'internal', 'requesting_area', 'Laboratorio',
  'equipment_type', 'external', 'external_equipment_description', 'Centrífuga ABC modelo 20'
 ) || extra);
$$;
create function pg_temp.update_variant(repair_id uuid, extra jsonb) returns void language sql as $$
 select public.update_repair(jsonb_build_object(
  'organization_id', 'f1280000-0000-4000-8000-000000000001', 'id', repair_id,
  'expected_lock_version', (select lock_version from public.repairs where id = repair_id)
 ) || extra);
$$;
create temporary table variants(name text primary key, id uuid);
grant all on variants to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2280000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f3280000-0000-4000-8000-000000000001"}', true);

select lives_ok($$insert into variants values ('external', pg_temp.create_variant())$$,
 'Internal external equipment requires neither a fake customer nor product');
select is((select customer_id from public.repairs where id = (select id from variants where name='external')), null::uuid, 'Internal repair has no customer FK');
select is((select product_id from public.repairs where id = (select id from variants where name='external')), null::uuid, 'External equipment has no inventory product FK');
select is((select customer_name_snapshot from public.repairs where id = (select id from variants where name='external')), 'Laboratorio', 'Area snapshot is meaningful');
select is((select product_description_snapshot from public.repairs where id = (select id from variants where name='external')), 'Centrífuga ABC modelo 20', 'Equipment snapshot is meaningful');
select is((select requester_type from public.repair_list where id = (select id from variants where name='external')), 'internal', 'RLS view exposes requester variant');
select is((select count(*)::integer from public.inventory_movements where organization_id = 'f1280000-0000-4000-8000-000000000001'), 0, 'Receiving external equipment creates no stock');
select lives_ok($$insert into variants values ('external-idempotent', pg_temp.create_variant('{"operation_key":"f6280000-0000-4000-8000-000000000002"}'))$$,
 'External reception accepts a stable operation key');
select is(pg_temp.create_variant('{"operation_key":"f6280000-0000-4000-8000-000000000002"}'),
 (select id from variants where name='external-idempotent'), 'External reception retry returns the same repair');
select throws_ok($$select pg_temp.create_variant('{"operation_key":"f6280000-0000-4000-8000-000000000002","requesting_area":"Otra área"}')$$,
 'P0001', 'REPAIR_OPERATION_KEY_REUSED', 'External reception key cannot be reused with a different identity');
select lives_ok($$insert into variants values ('external-serial', pg_temp.create_variant('{"serial_number":"EXT-ABC-123"}'))$$,
 'External serial may be recorded without a product serial rule');
select lives_ok($$insert into variants values ('customer-external', pg_temp.create_variant('{
 "requester_type":"customer", "requesting_area":null, "customer_id":"f4280000-0000-4000-8000-000000000001"}'))$$,
 'Registered customer may bring equipment outside catalog');
select lives_ok($$insert into variants values ('internal-catalog', pg_temp.create_variant('{
 "equipment_type":"catalog", "external_equipment_description":null,
 "product_id":"f5280000-0000-4000-8000-000000000001", "serial_number":"CAT-ABC-123"}'))$$,
 'Internal requester may use catalog equipment');
select lives_ok($$insert into variants values ('legacy', public.create_repair('{
 "organization_id":"f1280000-0000-4000-8000-000000000001", "operation_key":"f6280000-0000-4000-8000-000000000001",
 "customer_id":"f4280000-0000-4000-8000-000000000001", "product_id":"f5280000-0000-4000-8000-000000000001",
 "serial_number":"LEGACY-123", "problem_description":"Legacy equipment does not start"}'))$$,
 'Legacy create contract defaults to customer and catalog');
select throws_ok($$select pg_temp.create_variant('{"requesting_area":null}')$$, 'P0001', 'REPAIR_REQUESTING_AREA_INVALID', 'Internal area is required');
select throws_ok($$select pg_temp.create_variant('{"customer_id":"f4280000-0000-4000-8000-000000000001"}')$$, 'P0001', 'REPAIR_REQUESTING_AREA_INVALID', 'Internal requester cannot silently retain customer FK');
select throws_ok($$select pg_temp.create_variant('{"external_equipment_description":null}')$$, 'P0001', 'REPAIR_EXTERNAL_EQUIPMENT_INVALID', 'External description is required');
select throws_ok($$select pg_temp.create_variant('{"product_id":"f5280000-0000-4000-8000-000000000001"}')$$, 'P0001', 'REPAIR_EXTERNAL_EQUIPMENT_INVALID', 'External equipment cannot silently retain product FK');
select throws_ok($$select pg_temp.create_variant('{"requester_type":"other"}')$$, 'P0001', 'REPAIR_REQUESTER_TYPE_INVALID', 'Unknown requester type rejected');
select throws_ok($$select pg_temp.create_variant('{"equipment_type":"other"}')$$, 'P0001', 'REPAIR_EQUIPMENT_TYPE_INVALID', 'Unknown equipment type rejected');
select throws_ok($$select pg_temp.create_variant('{"requester_type":"customer", "requesting_area":null, "customer_id":"f4280000-0000-4000-8000-000000000002"}')$$,
 'P0001', 'REPAIR_CUSTOMER_UNAVAILABLE', 'Cross-organization customer rejected');
select throws_ok($$select pg_temp.create_variant('{"equipment_type":"catalog", "external_equipment_description":null, "product_id":"f5280000-0000-4000-8000-000000000002"}')$$,
 'P0001', 'REPAIR_PRODUCT_UNAVAILABLE', 'Cross-organization product rejected');
select throws_ok($$select pg_temp.create_variant('{"equipment_type":"catalog", "external_equipment_description":null, "product_id":"f5280000-0000-4000-8000-000000000001"}')$$,
 'P0001', 'REPAIR_SERIAL_NUMBER_RULE_VIOLATION', 'Catalog serial requirement unchanged');

select lives_ok($$select pg_temp.update_variant((select id from variants where name='external'), '{"requesting_area":"Área técnica", "external_equipment_description":"Centrífuga ABC modelo 21"}')$$,
 'Identity can be corrected before technical history');
select is((select customer_name_snapshot from public.repairs where id=(select id from variants where name='external')), 'Área técnica', 'Area correction updates snapshot');
select is((select lock_version from public.repairs where id=(select id from variants where name='external')), 2::bigint, 'Identity update advances aggregate version exactly once');
select throws_ok($$select public.update_repair(jsonb_build_object('organization_id','f1280000-0000-4000-8000-000000000001', 'id',(select id from variants where name='external'), 'expected_lock_version',1, 'notes','Stale edit'))$$,
 'P0001','REPAIR_VERSION_CONFLICT','Stale update remains rejected');
select lives_ok($$select pg_temp.update_variant((select id from variants where name='external-serial'), '{
 "requester_type":"customer", "requesting_area":null, "customer_id":"f4280000-0000-4000-8000-000000000001",
 "equipment_type":"catalog", "external_equipment_description":null, "product_id":"f5280000-0000-4000-8000-000000000001"}')$$,
 'Variant can be corrected to registered customer and catalog before history');
select lives_ok($$select public.record_repair_solution(jsonb_build_object(
 'organization_id','f1280000-0000-4000-8000-000000000001',
 'repair_id',(select id from variants where name='external'), 'expected_lock_version',2,
 'applied_solution','Se reemplazó el interruptor'))$$, 'Technical work supports external equipment');
select throws_ok($$select pg_temp.update_variant((select id from variants where name='external'), '{"requesting_area":"Otra área"}')$$,
 'P0001','REPAIR_IDENTITY_LOCKED','Internal requester immutable after substantive history');
select throws_ok($$select pg_temp.update_variant((select id from variants where name='external'), '{"external_equipment_description":"Otro equipo"}')$$,
 'P0001','REPAIR_IDENTITY_LOCKED','External equipment immutable after substantive history');
select lives_ok($$select pg_temp.update_variant((select id from variants where name='external'), '{"notes":"Accesorio recibido: cable"}')$$,
 'Nonidentity reception metadata remains editable');

-- Same create operation key/payload returns the original aggregate, not a duplicate.
select is(public.create_repair('{
 "organization_id":"f1280000-0000-4000-8000-000000000001", "operation_key":"f6280000-0000-4000-8000-000000000001",
 "customer_id":"f4280000-0000-4000-8000-000000000001", "product_id":"f5280000-0000-4000-8000-000000000001",
 "serial_number":"LEGACY-123", "problem_description":"Legacy equipment does not start"}'),
 (select id from variants where name='legacy'), 'Existing create idempotency retained');
select is(has_function_privilege('authenticated','public.create_repair_unchecked(jsonb)','EXECUTE'),false,'Unchecked create remains private');
select is(has_function_privilege('authenticated','public.update_repair_unchecked(jsonb)','EXECUTE'),false,'Unchecked update remains private');
select is(has_table_privilege('authenticated','public.repairs','INSERT'),false,'Clients cannot bypass JSON commands with raw insert');
select is(has_table_privilege('authenticated','public.repairs','UPDATE'),false,'Clients cannot bypass identity lock with raw update');
select is((select count(*)::integer from public.repair_list where organization_id='f1280000-0000-4000-8000-000000000002'),0,'RLS does not expose other organization');

reset role;
update public.customers set is_active=false where id='f4280000-0000-4000-8000-000000000001';
update public.products set is_active=false where id='f5280000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select pg_temp.update_variant((select id from variants where name='legacy'), '{"notes":"Archived references still readable"}')$$,
 'Unchanged historical inactive references remain editable');

select * from finish();
rollback;
