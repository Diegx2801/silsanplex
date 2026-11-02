begin;
select no_plan();
create function pg_temp.acc_fixture() returns jsonb language plpgsql as $$
declare org uuid := gen_random_uuid(); actor uuid := gen_random_uuid(); sid uuid := gen_random_uuid(); repair uuid; legacy uuid;
begin
  insert into public.organizations(id,name,slug) values(org,'Accessory SQL fixture','acc-'||org);
  insert into auth.users(id,email,raw_user_meta_data) values(actor,actor||'@example.invalid','{"full_name":"Accessory actor"}');
  insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,actor,now(),now());
  insert into public.organization_memberships(organization_id,user_id) values(org,actor);
  insert into public.user_roles(organization_id,user_id,role_code) values(org,actor,'ADMIN');
  perform set_config('request.jwt.claims', jsonb_build_object('sub',actor,'role','authenticated','session_id',sid)::text,true);
  repair := public.create_repair(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),
    'requester_type','internal','requesting_area','Fixture area','equipment_type','external',
    'external_equipment_description','Fixture equipment','problem_description','Does not start','notes','Reception notes unchanged',
    'accessories','[{"name":"Cable","quantity_received":3},{"name":"Sensor","quantity_received":2},{"name":"Estuche","quantity_received":1}]'::jsonb));
  legacy := public.create_repair(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),
    'requester_type','internal','requesting_area','Fixture area','equipment_type','external',
    'external_equipment_description','Historical equipment','problem_description','Legacy problem','notes','Accesorios: cable y estuche'));
  return jsonb_build_object('org',org,'actor',actor,'sid',sid,'repair',repair,'legacy',legacy,
    'cable',(select id from public.repair_accessories where repair_id=repair and name='Cable'));
end;
$$;
create function pg_temp.acc_payload(f jsonb, changes jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('organization_id',f->>'org','repair_id',f->>'repair','operation_key',gen_random_uuid(),
    'expected_lock_version',(select lock_version from public.repairs where id=(f->>'repair')::uuid)) || changes;
$$;
create temporary table f as select pg_temp.acc_fixture() data;
create temporary table other_fixture as select pg_temp.acc_fixture() data;
-- Restore first tenant's session after constructing the other tenant.
select set_config('request.jwt.claims',(select jsonb_build_object('sub',data->>'actor','role','authenticated','session_id',data->>'sid')::text from f),true);
grant select on f, other_fixture to authenticated;
select is((select array_agg(role_code order by role_code) from role_permissions where permission_code='REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION'),array['ADMIN']::text[],'only ADMIN initially receives exception capability');
select is((select is_directly_assignable from permissions where code='REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION'),false,'not silently included in ordinary operational grants');
select throws_ok($$select normalize_operational_permission_codes(array['REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION'])$$,'P0001','INVALID_OR_INACTIVE_PERMISSION','operational user administration cannot silently grant exception');
select is(has_function_privilege('anon','public.deliver_repair_with_accessories(jsonb)','execute'),false,'anonymous exception denied');
select is(has_function_privilege('service_role','public.deliver_repair_with_accessories(jsonb)','execute'),false,'no delegated exception actor');
select is(has_function_privilege('authenticated','public.deliver_repair_before_accessories(uuid,uuid,text)','execute'),false,'technical implementation private');
select is(has_function_privilege('authenticated','public.apply_repair_accessory_returns(uuid,uuid,jsonb,uuid,uuid)','execute'),false,'internal return writer private');
select is(has_table_privilege('authenticated','public.repair_accessories','insert'),false,'direct reception writes denied');
select is(has_table_privilege('authenticated','public.repair_accessory_returns','insert'),false,'direct returns denied');
select is(has_table_privilege('authenticated','public.repair_accessory_returns','update'),false,'direct return rewrites denied');
select is((select relrowsecurity from pg_class where oid='public.repair_accessories'::regclass),true,'accessory RLS enabled');
select is((select relrowsecurity from pg_class where oid='public.repair_accessory_returns'::regclass),true,'return RLS enabled');
set local role authenticated;
select is((select count(*) from repair_accessories),3::bigint,'RLS hides other tenant');
select throws_ok($$select get_repair_accessories((select (data->>'org')::uuid from other_fixture),(select (data->>'repair')::uuid from other_fixture))$$,'42501','REPAIR_FORBIDDEN','foreign read RPC rejected');
select throws_ok($$select get_repair_accessories((select (data->>'org')::uuid from f),(select (data->>'repair')::uuid from other_fixture))$$,'P0001','REPAIR_NOT_FOUND','mixed scope read rejected');
select throws_ok($$select record_repair_accessory_return(pg_temp.acc_payload((select data from f),jsonb_build_object('returns',jsonb_build_array(
  jsonb_build_object('accessory_id',(select data->>'cable' from other_fixture),'quantity',1)))))$$,'P0001','REPAIR_ACCESSORY_NOT_FOUND','foreign accessory rejected');
select throws_ok($$select record_repair_accessory_return(pg_temp.acc_payload((select data from f),jsonb_build_object('repair_id',(select data->>'legacy' from f),'returns',jsonb_build_array(
  jsonb_build_object('accessory_id',(select data->>'cable' from f),'quantity',1)))))$$,'P0001','REPAIR_ACCESSORY_NOT_FOUND','other repair accessory rejected');
reset role;
-- Same user retains ordinary delivery but loses the independently granted exception capability.
delete from user_roles where user_id=(select (data->>'actor')::uuid from f);
insert into organization_user_permissions(organization_id,user_id,permission_code)
select (data->>'org')::uuid,(data->>'actor')::uuid,code from f cross join unnest(array['REPAIRS_VIEW','REPAIRS_DELIVER']) code;
set local role authenticated;
select throws_ok($$select save_repair_accessories(pg_temp.acc_payload((select data from f),'{"accessories":[]}'))$$,'42501','REPAIR_FORBIDDEN','delivery permission cannot edit reception');
select throws_ok($$select deliver_repair_with_accessories(pg_temp.acc_payload((select data from f),'{"authorize_exception":true,"exception_reason":"Not authorized"}'))$$,
  '42501','REPAIR_FORBIDDEN','ordinary delivery cannot authorize exception');
select lives_ok($$select record_repair_accessory_return(pg_temp.acc_payload((select data from f),jsonb_build_object('returns',jsonb_build_array(
  jsonb_build_object('accessory_id',(select data->>'cable' from f),'quantity',1)))))$$,'ordinary delivery can return belongings');
reset role;
delete from organization_user_permissions where user_id=(select (data->>'actor')::uuid from f) and permission_code='REPAIRS_DELIVER';
insert into organization_user_permissions(organization_id,user_id,permission_code)
select (data->>'org')::uuid,(data->>'actor')::uuid,'REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION' from f;
set local role authenticated;
select throws_ok($$select deliver_repair_with_accessories(pg_temp.acc_payload((select data from f),'{"authorize_exception":true,"exception_reason":"Missing ordinary permission"}'))$$,'42501','REPAIR_FORBIDDEN','special permission alone cannot deliver');
select throws_ok($$select record_repair_accessory_return(pg_temp.acc_payload((select data from f),'{"returns":[]}'))$$,'42501','REPAIR_FORBIDDEN','revocation enforced before replay/write');
reset role;
update organization_memberships set is_active=false, deactivated_at=now() where user_id=(select (data->>'actor')::uuid from f);
set local role authenticated;
select throws_ok($$select get_repair_accessories((select (data->>'org')::uuid from f),(select (data->>'repair')::uuid from f))$$,'42501','REPAIR_FORBIDDEN','inactive membership denied');
reset role;
select set_config('request.jwt.claims','{}',true);
set local role authenticated;
select throws_ok($$select record_repair_accessory_return('{}')$$,'42501','REPAIR_ACCESSORY_USER_REQUIRED','real authenticated actor required');
reset role;
select is((select count(*) from repair_accessory_returns),1::bigint,'failed access produces no partial rows');
select is((select count(*) from repair_events where event_type='ACCESSORY_DELIVERY_EXCEPTION'),0::bigint,'denied exception creates no audit event');
select * from finish();
rollback;
