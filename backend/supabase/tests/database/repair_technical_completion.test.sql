begin;
select no_plan();
create temporary table tc_ids(label text primary key,id uuid default gen_random_uuid());
insert into tc_ids(label) values('org'),('foreign-org'),('admin'),('tech'),('viewer'),('foreign');
create function pg_temp.tc_id(text) returns uuid language sql as $$select id from tc_ids where label=$1$$;
insert into organizations(id,name,slug) select id,'R13 fixture','r13-'||id from tc_ids where label like '%org';
insert into auth.users(id,email,raw_user_meta_data) select id,id||'@example.invalid',jsonb_build_object('full_name','R13 '||label) from tc_ids where label not like '%org';
insert into auth.sessions(id,user_id,created_at,updated_at) select id,id,now(),now() from tc_ids where label not like '%org';
insert into organization_memberships(organization_id,user_id) select pg_temp.tc_id(case when label='foreign' then 'foreign-org' else 'org' end),id from tc_ids where label not like '%org';
insert into roles(code,name) values('R13_VIEWER','R13 viewer');
insert into role_permissions(role_code,permission_code) values('R13_VIEWER','REPAIRS_VIEW');
insert into user_roles(organization_id,user_id,role_code) select pg_temp.tc_id(case when label='foreign' then 'foreign-org' else 'org' end),id,
  case when label='tech' then 'TECNICO_REPARACIONES' when label='viewer' then 'R13_VIEWER' else 'ADMIN' end from tc_ids where label not like '%org';
create function pg_temp.tc_claim(who text) returns text language sql as $$select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.tc_id(who),'session_id',pg_temp.tc_id(who))::text,true)$$;
create temporary table tc_f(label text primary key,repair uuid,diagnosis uuid,payload jsonb,first_completion jsonb);
grant select,insert,update on tc_ids,tc_f to authenticated;
create function pg_temp.tc_payload(label text,target text) returns jsonb language sql as $$select jsonb_build_object('organization_id',pg_temp.tc_id('org'),'repair_id',r.id,
  'status',target,'observation','R13 transition','expected_lock_version',r.lock_version,'operation_key',gen_random_uuid()) from tc_f f join repairs r on r.id=f.repair where f.label=$1$$;
create function pg_temp.tc_state(label text,target text) returns uuid language sql as $$select change_repair_status_idempotent(pg_temp.tc_payload($1,$2))$$;
create function pg_temp.tc_fixture(label text) returns void language plpgsql as $$declare repair uuid; diagnosis uuid; begin
  repair:=create_repair(jsonb_build_object('organization_id',pg_temp.tc_id('org'),'operation_key',gen_random_uuid(),'requester_type','internal','requesting_area','R13 lab',
    'equipment_type','external','external_equipment_description','R13 equipment','problem_description','No enciende','accessories','[]'::jsonb));
  perform assign_repair(pg_temp.tc_id('org'),repair,pg_temp.tc_id('tech'),1);
  perform change_repair_status(pg_temp.tc_id('org'),repair,'diagnosis',null,2);
  diagnosis:=record_repair_diagnosis(jsonb_build_object('organization_id',pg_temp.tc_id('org'),'repair_id',repair,'expected_lock_version',3,'symptoms','R13 original diagnosis'));
  insert into tc_f(label,repair,diagnosis) values(label,repair,diagnosis);
  perform pg_temp.tc_state(label,'in_repair'); perform pg_temp.tc_state(label,'testing');
end $$;
create function pg_temp.tc_test(label text,passed boolean) returns uuid language sql as $$select record_repair_test(jsonb_build_object(
  'organization_id',pg_temp.tc_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,'test_type','Encendido','result','R13 result',
  'passed',$2,'completed_at','2000-01-01T00:00:00Z')) from tc_f f join repairs r on r.id=f.repair where f.label=$1$$;
create function pg_temp.tc_current(label text) returns jsonb language sql as $$select technical_completion from repair_list where id=(select repair from tc_f where label=$1)$$;
create function pg_temp.tc_first(label text) returns jsonb language sql as $$select first_technical_completion from repair_list where id=(select repair from tc_f where label=$1)$$;
create function pg_temp.tc_snapshot(label text) returns jsonb language sql security definer as $$select jsonb_build_object('repair',to_jsonb(r),
  'events',(select jsonb_agg(to_jsonb(e) order by id) from repair_events e where repair_id=r.id),
  'audits',(select jsonb_agg(to_jsonb(a) order by id) from audit_events a where entity_id=r.id::text),
  'commands',(select jsonb_agg(to_jsonb(c) order by operation_key) from repair_command_operations c where result_id=r.id))
  from tc_f f join repairs r on r.id=f.repair where f.label=$1$$;
create temporary table tc_snapshots(label text primary key,snapshot jsonb);
grant select,insert on tc_snapshots to authenticated;

select has_function('public','change_repair_status',array['uuid','uuid','text','text','bigint'],'legacy signature preserved');
select has_function('public','change_repair_status_idempotent',array['jsonb'],'unambiguous new RPC');
select ok((select 'security_invoker=true'=any(reloptions) from pg_class where oid='repair_list'::regclass),'view remains invoker');
select is(has_table_privilege('authenticated','repair_events','INSERT'),false,'no direct event insertion');
select is(has_table_privilege('authenticated','repairs','UPDATE'),false,'no direct repair update');
select is(has_function_privilege('authenticated','change_repair_status_unchecked(uuid,uuid,text,text)','EXECUTE'),false,'no private-core bypass');
select is(has_function_privilege('anon','change_repair_status_idempotent(jsonb)','EXECUTE'),false,'anonymous denied');
select pg_temp.tc_claim('admin');
set local role authenticated;
select pg_temp.tc_fixture('main'); select pg_temp.tc_fixture('failed'); select pg_temp.tc_fixture('r28'); select pg_temp.tc_fixture('cancel');
select is(pg_temp.tc_current('main'),null::jsonb,'testing is not complete');
select pg_temp.tc_test('main',true); select pg_temp.tc_test('main',true);
select is(pg_temp.tc_current('main'),null::jsonb,'repeated approved tests do not finalize');
select is(pg_temp.tc_first('main'),null::jsonb,'no historical completion before ready');
update tc_f set payload=pg_temp.tc_payload(label,'ready_for_delivery') where label='main';
select lives_ok($$select change_repair_status_idempotent(payload) from tc_f where label='main'$$,'valid completion');
update tc_f set first_completion=pg_temp.tc_current(label) where label='main';
select is((pg_temp.tc_current('main')->>'completed_at')::timestamptz,now(),'completion uses server event time, never supplied test time');
select is(pg_temp.tc_current('main')->>'actor_user_id',pg_temp.tc_id('admin')::text,'actual transition actor');
select is(pg_temp.tc_current('main')->>'actor_name','R13 admin','actor snapshot');
select is(pg_temp.tc_current('main')->>'assigned_technician_id',pg_temp.tc_id('tech')::text,'assigned technician is distinct');
select is(pg_temp.tc_current('main')->>'assigned_technician_name','R13 tech','technician snapshot');
select is(pg_temp.tc_current('main')->>'test_cycle_number','1','explicit current cycle');
select is(pg_temp.tc_first('main'),pg_temp.tc_current('main'),'first and current initially equal');
select is((select count(*) from repair_events where repair_id=(select repair from tc_f where label='main') and to_status='ready_for_delivery'),1::bigint,'no second completion event');
select ok((select a.metadata->>'assigned_technician_id'=pg_temp.tc_id('tech')::text and a.metadata->>'test_cycle_number'='1'
  from audit_events a where entity_id=(select repair::text from tc_f where label='main') and a.metadata->>'repair_event_id'=pg_temp.tc_current('main')->>'event_id'),
  'same event and audit share completion metadata');
select ok((select e.metadata->'technical_completion_version'='1'::jsonb and e.created_at=(pg_temp.tc_current('main')->>'completed_at')::timestamptz
  from repair_events e where id=(pg_temp.tc_current('main')->>'event_id')::bigint),'canonical event ID, date and contract version');
insert into tc_snapshots values('replay',pg_temp.tc_snapshot('main'));
select lives_ok($$select change_repair_status_idempotent(payload) from tc_f where label='main'$$,'replay succeeds with original stale version');
select is(pg_temp.tc_snapshot('main'),(select snapshot from tc_snapshots where label='replay'),'replay changes no row, event, audit or ledger');
select throws_ok($$select change_repair_status_idempotent(payload||'{"status":"in_repair"}') from tc_f where label='main'$$,'P0001','REPAIR_OPERATION_KEY_REUSED','changed intent rejected');
select throws_ok($$select change_repair_status_idempotent(payload||jsonb_build_object('operation_key',gen_random_uuid())) from tc_f where label='main'$$,'P0001','REPAIR_VERSION_CONFLICT','distinct stale key conflicts');
select throws_ok($$select change_repair_status_idempotent(payload||'{"completed_at":"2000-01-01"}') from tc_f where label='main'$$,'22023','REPAIR_PAYLOAD_INVALID','cannot provide completion date');
select is(pg_temp.tc_snapshot('main'),(select snapshot from tc_snapshots where label='replay'),'all rejected attempts have no partial effects');
select throws_ok($$update repairs set updated_at=now() where id=(select repair from tc_f where label='main')$$,'42501',null,'direct repair mutation denied');
select throws_ok($$insert into repair_events(organization_id,repair_id,event_type) select pg_temp.tc_id('org'),repair,'STATUS_CHANGED' from tc_f where label='main'$$,'42501',null,'direct event spoofing denied');
reset role;
delete from auth.sessions where id=pg_temp.tc_id('admin');
set local role authenticated;
select throws_ok($$select change_repair_status_idempotent(payload) from tc_f where label='main'$$,'42501','AUTH_SESSION_INACTIVE','session rechecked on exact replay');
reset role;
insert into auth.sessions(id,user_id,created_at,updated_at) values(pg_temp.tc_id('admin'),pg_temp.tc_id('admin'),now(),now());
set local role authenticated;
select pg_temp.tc_claim('viewer');
select throws_ok($$select change_repair_status_idempotent(payload) from tc_f where label='main'$$,'42501','REPAIR_FORBIDDEN','permissions rechecked before replay');
select pg_temp.tc_claim('foreign');
select is((select count(*) from repair_list where organization_id=pg_temp.tc_id('org')),0::bigint,'RLS hides projection across organizations');
select is((select count(*) from repair_technical_completions(pg_temp.tc_id('org'),(select repair from tc_f where label='main'))),0::bigint,'direct projection helper retains RLS');
select throws_ok($$select change_repair_status_idempotent(payload) from tc_f where label='main'$$,'42501','REPAIR_FORBIDDEN','foreign command denied');
select pg_temp.tc_claim('admin');
select pg_temp.tc_test('failed',false); select pg_temp.tc_test('failed',true);
insert into tc_snapshots values('failed',pg_temp.tc_snapshot('failed'));
select throws_ok($$select pg_temp.tc_state('failed','ready_for_delivery')$$,'P0001','REPAIR_FAILED_TEST_PRESENT','a later pass cannot erase failure');
select is(pg_temp.tc_current('failed'),null::jsonb,'failed cycle has no completion');
select is(pg_temp.tc_snapshot('failed'),(select snapshot from tc_snapshots where label='failed'),'failed gate has no partial effects');
select pg_temp.tc_state('failed','in_repair'); select pg_temp.tc_state('failed','testing');
select throws_ok($$select pg_temp.tc_state('failed','ready_for_delivery')$$,'P0001','REPAIR_APPROVED_TEST_REQUIRED','new cycle starts empty');
select pg_temp.tc_test('failed',true); select pg_temp.tc_state('failed','ready_for_delivery');
select is(pg_temp.tc_current('failed')->>'test_cycle_number','2','retest finalizes cycle two');

select pg_temp.tc_state('main','in_repair');
select is(pg_temp.tc_current('main'),null::jsonb,'rework invalidates immediately before cycle counter changes');
select is(pg_temp.tc_first('main'),(select first_completion from tc_f where label='main'),'first completion preserved during rework');
select pg_temp.tc_state('main','testing');
select throws_ok($$select pg_temp.tc_state('main','ready_for_delivery')$$,'P0001','REPAIR_APPROVED_TEST_REQUIRED','old successful tests cannot finalize new cycle');
select pg_temp.tc_test('main',true); select pg_temp.tc_state('main','ready_for_delivery');
select isnt(pg_temp.tc_current('main')->>'event_id',pg_temp.tc_first('main')->>'event_id','new finalization has new event');
select is(pg_temp.tc_current('main')->>'test_cycle_number','2','new cycle current');
select is(pg_temp.tc_first('main'),(select first_completion from tc_f where label='main'),'first historical event unchanged');
select lives_ok($$select assign_repair(pg_temp.tc_id('org'),repair,pg_temp.tc_id('admin'),(select lock_version from repairs where id=repair)) from tc_f where label='main'$$,'reassignment after completion');
select is(pg_temp.tc_current('main')->>'assigned_technician_id',pg_temp.tc_id('tech')::text,'reassignment does not rewrite technician');
reset role;
update profiles set is_active=false,deactivated_at=now(),full_name='Changed after completion' where id=pg_temp.tc_id('tech');
set local role authenticated;
select is(pg_temp.tc_current('main')->>'assigned_technician_name','R13 tech','deactivation and rename preserve historical snapshot');
select configure_repair_service_warranty(jsonb_build_object('organization_id',pg_temp.tc_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,
  'operation_key',gen_random_uuid(),'warranty_days',90,'coverage','R13 coverage')) from tc_f f join repairs r on r.id=f.repair where f.label='main';
select ok((select starts_at is null and ends_at is null from repair_service_warranty_details where repair_id=(select repair from tc_f where label='main')),'completion does not start warranty');
insert into tc_snapshots values('before-delivery',pg_temp.tc_current('main'));
select deliver_repair_with_accessories(jsonb_build_object('organization_id',pg_temp.tc_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,
  'operation_key',gen_random_uuid(),'returns','[]'::jsonb)) from tc_f f join repairs r on r.id=f.repair where f.label='main';
select is(pg_temp.tc_current('main'),(select snapshot from tc_snapshots where label='before-delivery'),'delivery preserves technical date and evidence');
select ok((select starts_at=r.delivered_at and ends_at=r.delivered_at+interval '90 days' from repair_service_warranty_details w join repairs r on r.id=w.repair_id where r.id=(select repair from tc_f where label='main')),'warranty starts only at actual delivery');
reset role;
update profiles set is_active=true,deactivated_at=null where id=pg_temp.tc_id('tech');
set local role authenticated;
select pg_temp.tc_test('cancel',true); select pg_temp.tc_state('cancel','ready_for_delivery');
select cancel_repair(pg_temp.tc_id('org'),r.id,'R13 cancellation',r.lock_version) from tc_f f join repairs r on r.id=f.repair where f.label='cancel';
select is(pg_temp.tc_current('cancel'),null::jsonb,'cancelled has no current completion');
select isnt(pg_temp.tc_first('cancel'),null::jsonb,'cancelled keeps historical completion');
select pg_temp.tc_test('r28',true); select pg_temp.tc_claim('tech');
select declare_repair_non_repairable(jsonb_build_object('organization_id',pg_temp.tc_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,
  'operation_key',gen_random_uuid(),'diagnosis_id',f.diagnosis,'reason','Daño irreversible')) from tc_f f join repairs r on r.id=f.repair where f.label='r28';
select is(pg_temp.tc_current('r28'),null::jsonb,'non repairable never finalizes');
select is(pg_temp.tc_first('r28'),null::jsonb,'decision is not historical successful completion');
select reopen_repair_non_repairable_assessment(jsonb_build_object('organization_id',pg_temp.tc_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,
  'operation_key',gen_random_uuid(),'decision_event_id',r.non_repairable_decision_event_id::text,'reason','Segunda evaluación')) from tc_f f join repairs r on r.id=f.repair where f.label='r28';
select pg_temp.tc_state('r28','in_repair'); select pg_temp.tc_state('r28','testing');
select throws_ok($$select pg_temp.tc_state('r28','ready_for_delivery')$$,'P0001','REPAIR_APPROVED_TEST_REQUIRED','R28 reevaluation cannot reuse old tests');
select pg_temp.tc_test('r28',true); select pg_temp.tc_state('r28','ready_for_delivery');
select is(pg_temp.tc_current('r28')->>'test_cycle_number','2','R28 reevaluation can finalize a new valid cycle');
select pg_temp.tc_state('r28','in_repair');
select declare_repair_non_repairable(jsonb_build_object('organization_id',pg_temp.tc_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,
  'operation_key',gen_random_uuid(),'diagnosis_id',f.diagnosis,'reason','Daño confirmado')) from tc_f f join repairs r on r.id=f.repair where f.label='r28';
select pg_temp.tc_claim('admin');
select return_unrepaired_repair(jsonb_build_object('organization_id',pg_temp.tc_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,
  'operation_key',gen_random_uuid(),'decision_event_id',r.non_repairable_decision_event_id::text,'returns','[]'::jsonb)) from tc_f f join repairs r on r.id=f.repair where f.label='r28';
select is(pg_temp.tc_current('r28'),null::jsonb,'returned unrepaired has no current successful completion');
select isnt(pg_temp.tc_first('r28'),null::jsonb,'prior successful completion remains only historical');
select ok((select returned_unrepaired_at=now() and delivered_at is null from repairs where id=(select repair from tc_f where label='r28')),'R28 date independent');
select is((select count(*) from repair_service_warranty_details where repair_id=(select repair from tc_f where label='r28')),0::bigint,'return does not create warranty');
select * from finish();
rollback;
