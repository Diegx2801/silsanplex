-- Deliberately incomplete legacy/import evidence. No business RPC is bypassed
-- to produce new completions: these are pre-existing-history fixtures only.
begin;
select no_plan();
create temporary table tch_org(id uuid default gen_random_uuid()); insert into tch_org default values;
insert into organizations(id,name,slug) select id,'R13 legacy','r13-legacy-'||id from tch_org;
create temporary table tch_actor(id uuid default gen_random_uuid()); insert into tch_actor default values;
insert into auth.users(id,email) select id,id||'@example.invalid' from tch_actor;
insert into organization_memberships(organization_id,user_id) select o.id,a.id from tch_org o cross join tch_actor a;
create temporary table tch_f(label text,repair uuid default gen_random_uuid());
insert into tch_f(label) values('no-events'),('ready-only'),('missing-pass'),('valid-legacy'),('contradiction'),('delivered-later'),('same-time'),('ambiguous-test'),('unknown-contract'),('duplicate-test'),('wrong-cycle'),('bad-certified-cycle'),('missing-certified-cycle'),
  ('gap'),('gap-next'),('orphan-failed'),('orphan-approved'),('wrong-association'),('duplicate-outside'),('complete'),('anchored-v1'),('complete-two');
insert into repairs(id,organization_id,requester_type,requesting_area,equipment_type,external_equipment_description,
  received_at,status,current_test_cycle_number,delivered_at,problem_description,customer_name_snapshot,customer_document_snapshot,product_code_snapshot,product_description_snapshot)
select f.repair,o.id,'internal','Legacy','external','Legacy equipment',now()-interval '10 days',
  'testing',1,null,'Legacy problem','Legacy','INTERNO','EXTERNO','Legacy equipment' from tch_f f cross join tch_org o;
-- No event may be inferred from delivered_at or status alone.
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
select o.id,f.repair,'CREATED',null,'received' from tch_f f cross join tch_org o where label in ('gap','gap-next','anchored-v1','complete','complete-two');
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
select o.id,f.repair,'STATUS_CHANGED','received','diagnosis' from tch_f f cross join tch_org o where label in ('complete','complete-two');
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
select o.id,f.repair,'STATUS_CHANGED','diagnosis','in_repair' from tch_f f cross join tch_org o where label in ('complete','complete-two');
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata,created_at)
select o.id,f.repair,'STATUS_CHANGED',case when label in ('gap','gap-next','anchored-v1') then 'diagnosis' else 'in_repair' end,'testing','{"test_cycle_number":1}',now()-interval '5 days'
  from tch_f f cross join tch_org o where label not in ('no-events','ready-only');
create temporary table tch_tests(label text,id uuid default gen_random_uuid());
insert into tch_tests(label) select label from tch_f where label not in ('no-events','ready-only','missing-pass');
insert into repair_tests(id,organization_id,repair_id,test_cycle_number,test_type,result,passed,performed_by)
select t.id,o.id,f.repair,1,'Legacy test','Approved',true,a.id from tch_tests t join tch_f f using(label) cross join tch_org o cross join tch_actor a;
insert into repair_tests(organization_id,repair_id,test_cycle_number,test_type,result,passed,performed_by)
select o.id,f.repair,1,'Test without event','Incomplete import',f.label='orphan-approved',a.id
from tch_f f cross join tch_org o cross join tch_actor a where label in ('orphan-failed','orphan-approved');
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata,created_at)
select o.id,f.repair,'TEST_COMPLETED','testing','testing',jsonb_build_object('test_id',case when f.label='wrong-association'
  then (select id from tch_tests where label='valid-legacy') else t.id end,'test_cycle_number',1,'passed',f.label<>'ambiguous-test'),now()-interval '5 days'
  from tch_tests t join tch_f f using(label) cross join tch_org o;
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata)
select o.id,f.repair,'TEST_COMPLETED','testing','testing',jsonb_build_object('test_id',t.id,'test_cycle_number',1,'passed',true)
  from tch_tests t join tch_f f using(label) cross join tch_org o where f.label='duplicate-test';
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,created_at,metadata)
select o.id,f.repair,'STATUS_CHANGED','testing','ready_for_delivery',now()-interval '5 days',
  case label when 'unknown-contract' then '{"technical_completion_version":2}'::jsonb when 'wrong-cycle' then '{"test_cycle_number":2}'::jsonb
    when 'bad-certified-cycle' then jsonb_build_object('technical_completion_version',1,'test_cycle_number',-1,'assigned_technician_id',(select id from tch_actor),'assigned_technician_name',null,'actor_name',null)
    when 'missing-certified-cycle' then jsonb_build_object('technical_completion_version',1,'assigned_technician_id',(select id from tch_actor),'assigned_technician_name',null,'actor_name',null)
    else '{}'::jsonb end
  from tch_f f cross join tch_org o
  where label not in ('no-events','same-time');
insert into repair_events(id,organization_id,repair_id,event_type,from_status,to_status,created_at) overriding system value
select 9007199254740993,o.id,f.repair,'STATUS_CHANGED','testing','ready_for_delivery',now()-interval '5 days' from tch_f f cross join tch_org o where label='same-time';
select set_config('app.repairs_status_write','true',true);
update repairs set status='ready_for_delivery' where id in(select repair from tch_f);
update repairs set status='delivered',delivered_at=now() where id=(select repair from tch_f where label='delivered-later');
select set_config('app.repairs_status_write','false',true);
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
select o.id,f.repair,'DELIVERED','ready_for_delivery','delivered' from tch_f f cross join tch_org o where label='delivered-later';
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
select o.id,f.repair,'STATUS_CHANGED','diagnosis','in_repair' from tch_f f cross join tch_org o where label='contradiction';
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata)
select o.id,f.repair,'TEST_COMPLETED','testing','testing',jsonb_build_object('test_id',t.id,'test_cycle_number',1,'passed',true)
from tch_tests t join tch_f f using(label) cross join tch_org o where f.label='duplicate-outside';
select is(technical_completion,null::jsonb,'no evidence stays unknown: '||f.label) from repair_list r join tch_f f on f.repair=r.id
  where f.label in ('no-events','ready-only','missing-pass','contradiction','ambiguous-test','unknown-contract','duplicate-test','wrong-cycle','bad-certified-cycle','missing-certified-cycle');
select is(first_technical_completion,null::jsonb,'incomplete certificate never invents historical completion: '||f.label) from repair_list r join tch_f f on f.repair=r.id
  where f.label in ('unknown-contract','duplicate-test','bad-certified-cycle','missing-certified-cycle');
select ok(technical_completion is not null,'reconstructable legacy completion: '||f.label) from repair_list r join tch_f f on f.repair=r.id
  where f.label in ('valid-legacy','delivered-later','same-time');
select ok(technical_completion->>'assigned_technician_id' is null and technical_completion->>'assigned_technician_name' is null,
  'legacy never fills missing historical technician from current assignment') from repair_list where id=(select repair from tch_f where label='valid-legacy');
select is(technical_completion->>'event_id','9007199254740993','bigint remains exact text and equal timestamps use ID order') from repair_list where id=(select repair from tch_f where label='same-time');
select ok((technical_completion->>'completed_at')::timestamptz=now()-interval '5 days' and delivered_at=now(),
  'delivery five days later preserves independently evidenced technical date') from repair_list where id=(select repair from tch_f where label='delivered-later');
select ok(technical_completion is null and first_technical_completion is null and technical_completion_summary->'verified_technical_completions'='[]'::jsonb,
  'reject incomplete or contradictory cycle: '||f.label) from repair_list r join tch_f f on f.repair=r.id
where label in ('gap','gap-next','anchored-v1','orphan-failed','orphan-approved','wrong-association','duplicate-outside');
select ok(technical_completion is not null and technical_completion=first_technical_completion
  and jsonb_array_length(technical_completion_summary->'verified_technical_completions')=1,'complete legacy chain is certified: '||f.label)
from repair_list r join tch_f f on f.repair=r.id where label in ('complete','complete-two');

-- A later testing entry alone cannot erase a known gap. Only the explicit,
-- server-issued v1 certificate anchors a new contiguous cycle, not the old one.
select set_config('app.repairs_status_write','true',true);
update repairs set status='in_repair' where id in(select repair from tch_f where label in ('gap-next','anchored-v1','complete-two'));
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
select o.id,f.repair,'STATUS_CHANGED','ready_for_delivery','in_repair' from tch_f f cross join tch_org o where label in ('gap-next','anchored-v1','complete-two');
update repairs set status='testing',current_test_cycle_number=2 where id in(select repair from tch_f where label in ('gap-next','anchored-v1','complete-two'));
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata)
select o.id,f.repair,'STATUS_CHANGED','in_repair','testing','{"test_cycle_number":2}' from tch_f f cross join tch_org o where label in ('gap-next','anchored-v1','complete-two');
create temporary table tch_second as select label,gen_random_uuid() id from tch_f where label in ('gap-next','anchored-v1','complete-two');
insert into repair_tests(id,organization_id,repair_id,test_cycle_number,test_type,result,passed,performed_by)
select t.id,o.id,f.repair,2,'Second cycle','Approved',true,a.id from tch_second t join tch_f f using(label) cross join tch_org o cross join tch_actor a;
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata)
select o.id,f.repair,'TEST_COMPLETED','testing','testing',jsonb_build_object('test_id',t.id,'test_cycle_number',2,'passed',true)
from tch_second t join tch_f f using(label) cross join tch_org o;
insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata)
select o.id,f.repair,'STATUS_CHANGED','testing','ready_for_delivery',case when label='anchored-v1' then jsonb_build_object(
  'technical_completion_version',1,'test_cycle_number',2,'assigned_technician_id',a.id,'assigned_technician_name',null,'actor_name',null) else '{}'::jsonb end
from tch_f f cross join tch_org o cross join tch_actor a where label in ('gap-next','anchored-v1','complete-two');
update repairs set status='ready_for_delivery' where id in(select repair from tch_f where label in ('gap-next','anchored-v1','complete-two'));
select set_config('app.repairs_status_write','false',true);
select ok(technical_completion is null and first_technical_completion is null,'later legacy entry does not silently erase ambiguity') from repair_list where id=(select repair from tch_f where label='gap-next');
select ok(technical_completion->>'test_cycle_number'='2' and first_technical_completion=technical_completion
  and jsonb_array_length(technical_completion_summary->'verified_technical_completions')=1,'valid v1 anchors only the new cycle') from repair_list where id=(select repair from tch_f where label='anchored-v1');
select ok(technical_completion->>'test_cycle_number'='2' and first_technical_completion->>'test_cycle_number'='1'
  and jsonb_array_length(technical_completion_summary->'verified_technical_completions')=2,'complete successive legacy cycles keep first and current distinct') from repair_list where id=(select repair from tch_f where label='complete-two');
select * from finish();
rollback;
