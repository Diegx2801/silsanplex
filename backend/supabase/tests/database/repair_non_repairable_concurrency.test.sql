-- Real overlapping committed sessions, with exact synthetic-fixture teardown.
create extension if not exists dblink with schema extensions;
select no_plan();
begin;
create temporary table b1_organizations_before on commit preserve rows as select id,name,slug from organizations;
create schema b1_races;
create table b1_races.fixtures(kind text primary key, f jsonb);
do $$
declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid();
  repair uuid; diagnosis uuid; kind text; decision bigint;
begin
 insert into organizations(id,name,slug) values(org,'B1 concurrency','b1-race-'||org);
 insert into auth.users(id,email,raw_user_meta_data) values(actor,actor||'@example.invalid','{"full_name":"B1 race technician"}');
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,actor,now(),now());
 insert into organization_memberships(organization_id,user_id) values(org,actor);
 insert into user_roles(organization_id,user_id,role_code) values(org,actor,'ADMIN');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',sid)::text,true);
  foreach kind in array array['declare-declare','return-reopen','reopen-return','declare-replay','return-replay','return-return'] loop
  repair:=create_repair(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),
    'requester_type','internal','requesting_area','B1 race','equipment_type','external','external_equipment_description','B1 race equipment','problem_description','No enciende',
    'accessories',case when kind='return-return' then '[{"name":"Cable de carrera","quantity_received":1}]'::jsonb else '[]'::jsonb end));
  perform assign_repair(org,repair,actor,1);
  perform change_repair_status(org,repair,'diagnosis',null,2);
  diagnosis:=record_repair_diagnosis(jsonb_build_object('organization_id',org,'repair_id',repair,'expected_lock_version',3,'symptoms','Placa destruida'));
  if kind not like 'declare-%' then
   perform declare_repair_non_repairable(jsonb_build_object('organization_id',org,'repair_id',repair,'expected_lock_version',4,
    'operation_key',gen_random_uuid(),'diagnosis_id',diagnosis,'reason','Daño irreversible'));
  end if;
  select non_repairable_decision_event_id into decision from repairs where id=repair;
   insert into b1_races.fixtures values(kind,jsonb_build_object('org',org,'actor',actor,'sid',sid,'repair',repair,'diagnosis',diagnosis,'decision',decision::text,
     'accessory',(select id from repair_accessories where repair_id=repair)));
 end loop;
end $$;
create function b1_races.command(command text,p jsonb,f jsonb,gate bigint) returns text language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f->>'actor','role','authenticated','session_id',f->>'sid')::text,true);
 execute format('select public.%I($1)',command) using p;
 if gate is not null then perform pg_advisory_xact_lock(gate); end if;
 return 'OK';
exception when others then return sqlerrm;
end $$;
commit;
create function pg_temp.b1_race(kind text,first_command text,second_command text,replay boolean default false) returns setof text language plpgsql as $$
declare f jsonb; p jsonb; a jsonb; b jsonb; gate bigint:=628300001; i integer; winner text; loser text; version bigint;
begin
 select fixtures.f into f from b1_races.fixtures where fixtures.kind=b1_race.kind;
 select lock_version into version from repairs where id=(f->>'repair')::uuid;
 p:=jsonb_build_object('organization_id',f->>'org','repair_id',f->>'repair','diagnosis_id',f->>'diagnosis',
   'decision_event_id',f->>'decision','expected_lock_version',version,'reason','Decisión de carrera',
   'returns',case when f->>'accessory' is not null then jsonb_build_array(jsonb_build_object('accessory_id',f->>'accessory','quantity',1)) else '[]'::jsonb end);
 a:=p||jsonb_build_object('operation_key',gen_random_uuid());
 b:=case when replay then a else p||jsonb_build_object('operation_key',gen_random_uuid()) end;
 perform extensions.dblink_connect('b1_a','host=supabase_db_backend port=5432 dbname='||current_database()||' user=postgres password=postgres application_name=b1_race_a');
 perform extensions.dblink_connect('b1_b','host=supabase_db_backend port=5432 dbname='||current_database()||' user=postgres password=postgres application_name=b1_race_b');
 perform pg_advisory_lock(gate);
 perform extensions.dblink_send_query('b1_a',format('select b1_races.command(%L,%L::jsonb,%L::jsonb,%s)',first_command,a,f,gate));
 for i in 1..300 loop
  perform pg_stat_clear_snapshot();
  exit when exists(select 1 from pg_stat_activity where application_name='b1_race_a' and wait_event='advisory');
  perform pg_sleep(0.01);
 end loop;
 return next ok(exists(select 1 from pg_stat_activity where application_name='b1_race_a' and wait_event='advisory'),kind||': first worker holds aggregate lock');
 perform extensions.dblink_send_query('b1_b',format('select b1_races.command(%L,%L::jsonb,%L::jsonb,null)',second_command,b,f));
 for i in 1..300 loop
  perform pg_stat_clear_snapshot();
  exit when exists(select 1 from pg_stat_activity where application_name='b1_race_b' and wait_event_type='Lock');
  perform pg_sleep(0.01);
 end loop;
 return next ok(exists(select 1 from pg_stat_activity where application_name='b1_race_b' and wait_event_type='Lock'),kind||': second independent session actually overlaps');
 perform pg_advisory_unlock(gate);
 select value into winner from extensions.dblink_get_result('b1_a') as t(value text);
 select value into loser from extensions.dblink_get_result('b1_b') as t(value text);
 return next is(winner,'OK',kind||': one winner');
 return next is(loser,case when replay then 'OK' else 'REPAIR_VERSION_CONFLICT' end,kind||': stale conflict or identical replay');
 return next is((select lock_version from repairs where id=(f->>'repair')::uuid),version+1,kind||': advances exactly once');
  return next is((select status from repairs where id=(f->>'repair')::uuid),
  case first_command when 'declare_repair_non_repairable' then 'non_repairable' when 'return_unrepaired_repair' then 'returned_unrepaired' else 'diagnosis' end,
   kind||': winner state preserved');
  return next is((select count(*) from repair_events where repair_id=(f->>'repair')::uuid and event_type='RETURNED_UNREPAIRED'),
    case when first_command='return_unrepaired_repair' then 1 else 0 end::bigint,kind||': physical return is never duplicated');
  return next is((select count(*) from repair_accessory_returns where repair_id=(f->>'repair')::uuid),
    case when f->>'accessory' is not null then 1 else 0 end::bigint,kind||': accessory return is never duplicated');
 perform extensions.dblink_disconnect('b1_a'); perform extensions.dblink_disconnect('b1_b');
end $$;
select * from pg_temp.b1_race('declare-declare','declare_repair_non_repairable','declare_repair_non_repairable');
select * from pg_temp.b1_race('return-reopen','return_unrepaired_repair','reopen_repair_non_repairable_assessment');
select * from pg_temp.b1_race('reopen-return','reopen_repair_non_repairable_assessment','return_unrepaired_repair');
select * from pg_temp.b1_race('declare-replay','declare_repair_non_repairable','declare_repair_non_repairable',true);
select * from pg_temp.b1_race('return-replay','return_unrepaired_repair','return_unrepaired_repair',true);
select * from pg_temp.b1_race('return-return','return_unrepaired_repair','return_unrepaired_repair');

-- Only teardown bypasses immutable guards, after all assertions. The transaction
-- restores every trigger before commit; no business mutation uses this bypass.
begin;
do $$ declare org uuid; actor uuid; begin
 select (f->>'org')::uuid,(f->>'actor')::uuid into org,actor from b1_races.fixtures limit 1;
 alter table repairs disable trigger repairs_guard_non_repairable;
 alter table repairs disable trigger repairs_protect_status_transition;
 update repairs set status='diagnosis',non_repairable_decision_event_id=null,returned_unrepaired_at=null where organization_id=org;
 alter table repairs enable trigger repairs_guard_non_repairable;
 alter table repairs enable trigger repairs_protect_status_transition;
  alter table repair_command_operations disable trigger repair_command_operations_immutable;
  alter table repair_events disable trigger repair_events_immutable;
  alter table audit_events disable trigger audit_events_immutable;
  alter table repair_accessory_returns disable trigger repair_accessory_returns_immutable;
  delete from repair_accessory_returns where organization_id=org;
  delete from repair_accessories where organization_id=org;
  alter table repair_accessory_returns enable trigger repair_accessory_returns_immutable;
 delete from repair_command_operations where organization_id=org;
 delete from repair_events where organization_id=org;
 delete from audit_events where organization_id=org;
 alter table repair_command_operations enable trigger repair_command_operations_immutable;
 alter table repair_events enable trigger repair_events_immutable;
 alter table audit_events enable trigger audit_events_immutable;
 delete from repair_diagnostics where organization_id=org;
 delete from repairs where organization_id=org;
 delete from organization_memberships where organization_id=org;
 delete from organizations where id=org;
 delete from auth.sessions where user_id=actor;
 delete from auth.users where id=actor;
end $$;
drop schema b1_races cascade;
commit;
select results_eq($$select id,name,slug from organizations order by id$$,
 $$select id,name,slug from b1_organizations_before order by id$$,'concurrency fixtures leave all organizations unchanged');
select * from finish();
