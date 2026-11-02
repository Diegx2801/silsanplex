begin;
select no_plan();
-- Self-contained fixture: Supabase CLI transports SQL inputs, not include assets.
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
    'accessories','[{"name":"Cable","quantity_received":3,"received_condition":"Bueno","observations":"Original"},
      {"name":"Sensor","quantity_received":2},{"name":"Estuche","quantity_received":1}]'::jsonb));
  legacy := public.create_repair(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),
    'requester_type','internal','requesting_area','Fixture area','equipment_type','external',
    'external_equipment_description','Historical equipment','problem_description','Legacy problem','notes','Accesorios: cable y estuche'));
  return jsonb_build_object('org',org,'actor',actor,'sid',sid,'repair',repair,'legacy',legacy,
    'cable',(select id from public.repair_accessories where repair_id=repair and name='Cable'),
    'sensor',(select id from public.repair_accessories where repair_id=repair and name='Sensor'),
    'case',(select id from public.repair_accessories where repair_id=repair and name='Estuche'));
end;
$$;
create function pg_temp.acc_payload(f jsonb, changes jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('organization_id',f->>'org','repair_id',f->>'repair','operation_key',gen_random_uuid(),
    'expected_lock_version',(select lock_version from public.repairs where id=(f->>'repair')::uuid)) || changes;
$$;
create temporary table f as select pg_temp.acc_fixture() data;
grant select on f to authenticated;
set local role authenticated;
select is((select count(*) from repair_accessories),3::bigint,'multiple accessories persisted');
select is((select sum(quantity_received) from repair_accessories),6::bigint,'integer received quantities');
select is((select notes from repairs where id=(select (data->>'repair')::uuid from f)),'Reception notes unchanged','notes remain separate');
select is((select accessories_reviewed_at is not null from repairs where id=(select (data->>'repair')::uuid from f)),true,'structured reception marked');
select is((select accessories_reviewed_at is null from repairs where id=(select (data->>'legacy')::uuid from f)),true,'omitted property preserves legacy distinction');
select is((select count(*) from repair_accessories where repair_id=(select (data->>'legacy')::uuid from f)),0::bigint,'notes never parsed');
select is((select count(*) from repair_events where event_type='ACCESSORY_RECEIVED'),3::bigint,'each accessory has reception event');
select is((select bool_and(registered_by=(select (data->>'actor')::uuid from f) and registered_at=now()) from repair_accessories),true,'actor and timestamp are server values');

create function pg_temp.acc_create(items jsonb) returns uuid language sql as $$
  select create_repair(jsonb_build_object('organization_id',(select data->>'org' from f),'operation_key',gen_random_uuid(),
    'requester_type','internal','requesting_area','Area','equipment_type','external','external_equipment_description','Device',
    'problem_description','Fixture problem','accessories',items));
$$;
select lives_ok($$select pg_temp.acc_create('[]')$$,'empty reception valid');
select is((select count(*) from repair_accessories),3::bigint,'no fictional accessories');
select throws_ok($$select pg_temp.acc_create('[{"name":"","quantity_received":1}]')$$,'22023','REPAIR_ACCESSORY_DATA_INVALID','name required');
select throws_ok($$select pg_temp.acc_create('[{"name":"Cable","quantity_received":0}]')$$,'22023','REPAIR_ACCESSORY_QUANTITY_INVALID','zero rejected');
select throws_ok($$select pg_temp.acc_create('[{"name":"Cable","quantity_received":-1}]')$$,'22023','REPAIR_ACCESSORY_QUANTITY_INVALID','negative rejected');
select throws_ok($$select pg_temp.acc_create('[{"name":"Cable","quantity_received":1.5}]')$$,'22023','REPAIR_ACCESSORY_QUANTITY_INVALID','fraction rejected');
select throws_ok($$select pg_temp.acc_create('[{"name":"Cable","quantity_received":"2"}]')$$,'22023','REPAIR_ACCESSORY_QUANTITY_INVALID','string quantity rejected');
select throws_ok($$select pg_temp.acc_create('[{"name":"Cable","quantity_received":1000001}]')$$,'22023','REPAIR_ACCESSORY_QUANTITY_INVALID','excessive quantity rejected');
select throws_ok($$select pg_temp.acc_create('null')$$,'22023','REPAIR_ACCESSORIES_INVALID','null differs from empty');
select throws_ok($$select pg_temp.acc_create('{}')$$,'22023','REPAIR_ACCESSORIES_INVALID','object rejected');
select throws_ok($$select pg_temp.acc_create('[{"name":"Valid","quantity_received":1},{"name":"Invalid","quantity_received":0}]')$$,
  '22023','REPAIR_ACCESSORY_QUANTITY_INVALID','invalid second accessory rolls back creation');
select is((select count(*) from repairs),3::bigint,'all failed repairs rolled back');
select is((select count(*) from repair_events where event_type='ACCESSORY_RECEIVED'),3::bigint,'failed reception leaves no events');

reset role;
create temp table command as select pg_temp.acc_payload(data,jsonb_build_object('accessories',jsonb_build_array(
  jsonb_build_object('id',data->>'cable','name','Cable corregido','quantity_received',4,'received_condition','Regular','observations','Corrección')))) p from f;
grant select on command to authenticated;
set local role authenticated;
select lives_ok($$select save_repair_accessories((select p from command))$$,'correction succeeds');
select lives_ok($$select save_repair_accessories((select p from command))$$,'correction replays');
select is((select quantity_received from repair_accessories where id=(select (data->>'cable')::uuid from f)),4,'quantity corrected');
select is((select lock_version from repairs where id=(select (data->>'repair')::uuid from f)),2::bigint,'batch increments version once');
select is((select count(*) from repair_events where event_type='ACCESSORY_UPDATED'),1::bigint,'replay adds no event');
select throws_ok($$select save_repair_accessories((select p||'{"accessories":[]}' from command))$$,'P0001','REPAIR_OPERATION_KEY_REUSED','changed replay rejected');
select lives_ok($$select save_repair_accessories(pg_temp.acc_payload((select data from f),' {"accessories":[]}'))$$,'empty patch valid');
select is((select count(*) from repair_accessories),3::bigint,'empty patch never deletes');
select lives_ok($$select update_repair(pg_temp.acc_payload((select data from f),jsonb_build_object('id',(select data->>'repair' from f),'notes','New note')))$$,'old update payload still valid');
select is((select count(*) from repair_accessories),3::bigint,'omitted property unchanged');
select lives_ok($$select save_repair_accessories(pg_temp.acc_payload((select data from f),jsonb_build_object('accessories',jsonb_build_array(
  jsonb_build_object('id',(select data->>'case' from f),'void',true,'reason','Registered in error')))))$$,'explicit logical void');
select is((select count(*) from repair_accessories),3::bigint,'void keeps stable row');
select is((select void_reason from repair_accessories where name='Estuche'),'Registered in error','void reason persisted');
select is((select count(*) from repair_events where event_type='ACCESSORY_VOIDED'),1::bigint,'void audited');
select throws_ok($$select save_repair_accessories(pg_temp.acc_payload((select data from f),jsonb_build_object('accessories',jsonb_build_array(
  jsonb_build_object('id',(select data->>'sensor' from f),'void',true,'reason',' ')))))$$,'22023','REPAIR_ACCESSORY_REASON_REQUIRED','void requires reason');
select is((select count(*) from inventory_movements),0::bigint,'no stock movements');
select is((select count(*) from repair_parts),0::bigint,'no fictional replacement parts');
reset role;
select is((select count(*) from audit_events where action='REPAIR_ACCESSORY_UPDATED'),1::bigint,'one correction audit');
select is((select metadata->'old_values'->>'name' from audit_events where action='REPAIR_ACCESSORY_UPDATED'),'Cable','before retained');
select is((select metadata->'new_values'->>'name' from audit_events where action='REPAIR_ACCESSORY_UPDATED'),'Cable corregido','after retained');
create temporary table general_update as select pg_temp.acc_payload(data,jsonb_build_object('id',data->>'repair','notes','Updated reception notes',
  'accessories',jsonb_build_array(jsonb_build_object('name','Bolsa','quantity_received',1)))) p from f;
grant select on general_update to authenticated;
set local role authenticated;
select lives_ok($$select update_repair((select p from general_update))$$,'generic update integrates accessories atomically');
select lives_ok($$select update_repair((select p from general_update))$$,'generic collection update replays');
select is((select count(*) from repair_accessories where name='Bolsa'),1::bigint,'generic replay preserves row identity');
select is((select notes from repairs where id=(select (data->>'repair')::uuid from f)),'Updated reception notes','general fields persisted with accessories');
select throws_ok($$select update_repair((select p||'{"notes":"Changed intention"}' from general_update))$$,'P0001','REPAIR_OPERATION_KEY_REUSED','generic update key cannot change payload');
select * from finish();
rollback;
