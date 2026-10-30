-- Independent, overlapping sessions exercise public RPCs, not unlocked cores.
create extension if not exists dblink with schema extensions;
select no_plan();
create temporary table r13_orgs_before on commit preserve rows as select id,name,slug from organizations;
begin;
create schema r13_races;
create table r13_races.fixtures(kind text primary key,f jsonb);
do $$ declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); repair uuid; diagnosis uuid; kind text;
begin
  insert into organizations(id,name,slug) values(org,'R13 concurrency','r13-race-'||org);
  insert into auth.users(id,email,raw_user_meta_data) values(actor,actor||'@example.invalid','{"full_name":"R13 race technician"}');
  insert into auth.sessions(id,user_id,created_at,updated_at) values(actor,actor,now(),now());
  insert into organization_memberships(organization_id,user_id) values(org,actor);
  insert into user_roles(organization_id,user_id,role_code) values(org,actor,'ADMIN');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',actor)::text,true);
  foreach kind in array array['ready-ready','ready-replay','ready-rework','rework-ready','ready-test','test-ready','ready-r28','r28-ready','delivery-rework','rework-delivery','legacy-new','new-legacy'] loop
    repair:=create_repair(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),'requester_type','internal','requesting_area','R13 race',
      'equipment_type','external','external_equipment_description','R13 race equipment','problem_description','No enciende','accessories','[]'::jsonb));
    perform assign_repair(org,repair,actor,1); perform change_repair_status(org,repair,'diagnosis',null,2);
    diagnosis:=record_repair_diagnosis(jsonb_build_object('organization_id',org,'repair_id',repair,'expected_lock_version',3,'symptoms','Daño de placa'));
    perform change_repair_status(org,repair,'in_repair',null,4); perform change_repair_status(org,repair,'testing',null,5);
    perform record_repair_test(jsonb_build_object('organization_id',org,'repair_id',repair,'expected_lock_version',6,'test_type','Encendido','result','Aprobada','passed',true));
    if kind in ('delivery-rework','rework-delivery') then perform change_repair_status(org,repair,'ready_for_delivery',null,7); end if;
    insert into r13_races.fixtures values(kind,jsonb_build_object('org',org,'actor',actor,'repair',repair,'diagnosis',diagnosis));
  end loop;
end $$;
create function r13_races.command(action text,p jsonb,f jsonb,gate bigint) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f->>'actor','role','authenticated','session_id',f->>'actor')::text,true);
  case action
    when 'legacy' then perform change_repair_status((p->>'organization_id')::uuid,(p->>'repair_id')::uuid,'ready_for_delivery',null,(p->>'expected_lock_version')::bigint);
    when 'ready' then perform change_repair_status_idempotent(p||'{"status":"ready_for_delivery"}');
    when 'rework' then perform change_repair_status_idempotent(p||'{"status":"in_repair"}');
    when 'test' then perform record_repair_test(p||'{"test_type":"Carga","result":"Falla concurrente","passed":false}');
    when 'r28' then perform declare_repair_non_repairable(p||jsonb_build_object('diagnosis_id',f->>'diagnosis','reason','Daño irreversible'));
    when 'delivery' then perform deliver_repair_with_accessories(p||'{"returns":[]}');
  end case;
  if gate is not null then perform pg_advisory_xact_lock(gate); end if;
  return 'OK';
exception when others then return sqlerrm;
end $$;
commit;
create function pg_temp.r13_race(kind text,a text,b text,replay boolean default false) returns setof text language plpgsql as $$
declare f jsonb; p jsonb; q jsonb; gate bigint:=631300001; i integer; winner text; loser text;
  version bigint; events bigint; audits bigint; commands bigint; completion jsonb;
begin
  select x.f into f from r13_races.fixtures x where x.kind=r13_race.kind;
  select lock_version into version from repairs where id=(f->>'repair')::uuid;
  select count(*) into events from repair_events where repair_id=(f->>'repair')::uuid;
  select count(*) into audits from audit_events where entity_id=f->>'repair';
  select count(*) into commands from repair_command_operations where result_id=(f->>'repair')::uuid;
  select technical_completion into completion from repair_list where id=(f->>'repair')::uuid;
  p:=jsonb_build_object('organization_id',f->>'org','repair_id',f->>'repair','expected_lock_version',version,'operation_key',gen_random_uuid());
  q:=case when replay then p else p||jsonb_build_object('operation_key',gen_random_uuid()) end;
  perform extensions.dblink_connect('r13_a','host=supabase_db_backend port=5432 dbname='||current_database()||' user=postgres password=postgres application_name=r13_race_a');
  perform extensions.dblink_connect('r13_b','host=supabase_db_backend port=5432 dbname='||current_database()||' user=postgres password=postgres application_name=r13_race_b');
  perform pg_advisory_lock(gate);
  perform extensions.dblink_send_query('r13_a',format('select r13_races.command(%L,%L::jsonb,%L::jsonb,%s)',a,p,f,gate));
  for i in 1..300 loop
    perform pg_stat_clear_snapshot();
    exit when exists(select 1 from pg_stat_activity where application_name='r13_race_a' and wait_event='advisory');
    perform pg_sleep(0.01);
  end loop;
  return next ok(exists(select 1 from pg_stat_activity where application_name='r13_race_a' and wait_event='advisory'),kind||': first worker holds aggregate');
  perform extensions.dblink_send_query('r13_b',format('select r13_races.command(%L,%L::jsonb,%L::jsonb,null)',b,q,f));
  for i in 1..300 loop
    perform pg_stat_clear_snapshot();
    exit when exists(select 1 from pg_stat_activity where application_name='r13_race_b' and wait_event_type='Lock');
    perform pg_sleep(0.01);
  end loop;
  return next ok(exists(select 1 from pg_stat_activity where application_name='r13_race_b' and wait_event_type='Lock'),kind||': independent second worker overlaps');
  perform pg_advisory_unlock(gate);
  select value into winner from extensions.dblink_get_result('r13_a') as t(value text);
  select value into loser from extensions.dblink_get_result('r13_b') as t(value text);
  return next is(winner,'OK',kind||': first command wins');
  return next is(loser,case when replay then 'OK' else 'REPAIR_VERSION_CONFLICT' end,kind||': exact replay or stale conflict');
  return next is((select lock_version from repairs where id=(f->>'repair')::uuid),version+1,kind||': one version advance');
  return next is((select count(*) from repair_events where repair_id=(f->>'repair')::uuid),events+1,kind||': one event, no partial losing effects');
  return next is((select count(*) from audit_events where entity_id=f->>'repair'),audits+1,kind||': one audit');
  return next is((select count(*) from repair_command_operations where result_id=(f->>'repair')::uuid),commands+case when a in ('legacy','test') then 0 else 1 end,kind||': losing command creates no ledger entry');
  return next is((select status from repairs where id=(f->>'repair')::uuid),case a when 'legacy' then 'ready_for_delivery' when 'ready' then 'ready_for_delivery' when 'rework' then 'in_repair'
    when 'test' then 'testing' when 'r28' then 'non_repairable' else 'delivered' end,kind||': coherent winning state');
  if a in ('ready','legacy') then
    return next ok((select technical_completion is not null and technical_completion=first_technical_completion from repair_list where id=(f->>'repair')::uuid),kind||': one current canonical completion');
  elsif a='delivery' then
    return next is((select technical_completion from repair_list where id=(f->>'repair')::uuid),completion,kind||': delivery preserves completion');
  else
    return next is((select technical_completion from repair_list where id=(f->>'repair')::uuid),null::jsonb,kind||': no stale successful completion');
  end if;
  perform extensions.dblink_disconnect('r13_a'); perform extensions.dblink_disconnect('r13_b');
end $$;
select * from pg_temp.r13_race('ready-ready','ready','ready');
select * from pg_temp.r13_race('ready-replay','ready','ready',true);
select * from pg_temp.r13_race('ready-rework','ready','rework');
select * from pg_temp.r13_race('rework-ready','rework','ready');
select * from pg_temp.r13_race('ready-test','ready','test');
select * from pg_temp.r13_race('test-ready','test','ready');
select * from pg_temp.r13_race('ready-r28','ready','r28');
select * from pg_temp.r13_race('r28-ready','r28','ready');
select * from pg_temp.r13_race('delivery-rework','delivery','rework');
select * from pg_temp.r13_race('rework-delivery','rework','delivery');
select * from pg_temp.r13_race('legacy-new','legacy','ready');
select * from pg_temp.r13_race('new-legacy','ready','legacy');

-- Only fixture teardown bypasses immutable protections, never a tested command.
begin;
do $$ declare org uuid; actor uuid; begin
  select (f->>'org')::uuid,(f->>'actor')::uuid into org,actor from r13_races.fixtures limit 1;
  alter table repairs disable trigger repairs_guard_non_repairable;
  alter table repairs disable trigger repairs_protect_status_transition;
  update repairs set status='diagnosis',non_repairable_decision_event_id=null,returned_unrepaired_at=null,delivered_at=null where organization_id=org;
  alter table repairs enable trigger repairs_guard_non_repairable;
  alter table repairs enable trigger repairs_protect_status_transition;
  alter table repair_command_operations disable trigger repair_command_operations_immutable;
  alter table repair_events disable trigger repair_events_immutable;
  alter table audit_events disable trigger audit_events_immutable;
  delete from repair_command_operations where organization_id=org;
  delete from repair_events where organization_id=org;
  delete from audit_events where organization_id=org;
  alter table repair_command_operations enable trigger repair_command_operations_immutable;
  alter table repair_events enable trigger repair_events_immutable;
  alter table audit_events enable trigger audit_events_immutable;
  delete from repair_tests where organization_id=org;
  delete from repair_diagnostics where organization_id=org;
  delete from repairs where organization_id=org;
  delete from organization_memberships where organization_id=org;
  delete from organizations where id=org;
  delete from auth.sessions where user_id=actor;
  delete from auth.users where id=actor;
end $$;
drop schema r13_races cascade;
commit;
select results_eq($$select id,name,slug from organizations order by id$$,$$select id,name,slug from r13_orgs_before order by id$$,'R13 races leave all organizations unchanged');
select * from finish();
