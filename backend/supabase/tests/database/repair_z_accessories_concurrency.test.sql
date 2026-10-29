-- Uses independent committed sessions; synthetic tenants are deleted before the suite finishes.
create extension if not exists dblink with schema extensions;
select no_plan();
begin;
create temporary table repair_accessory_organizations_before on commit preserve rows as
  select id,name,slug from public.organizations;
create function pg_temp.acc_fixture() returns jsonb language plpgsql as $$
declare org uuid := gen_random_uuid(); actor uuid := gen_random_uuid(); sid uuid := gen_random_uuid(); repair uuid;
begin
  insert into public.organizations(id,name,slug) values(org,'Accessory race fixture','acc-'||org);
  insert into auth.users(id,email,raw_user_meta_data) values(actor,actor||'@example.invalid','{"full_name":"Accessory actor"}');
  insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,actor,now(),now());
  insert into public.organization_memberships(organization_id,user_id) values(org,actor);
  insert into public.user_roles(organization_id,user_id,role_code) values(org,actor,'ADMIN');
  perform set_config('request.jwt.claims', jsonb_build_object('sub',actor,'role','authenticated','session_id',sid)::text,true);
  repair := public.create_repair(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),
    'requester_type','internal','requesting_area','Fixture area','equipment_type','external',
    'external_equipment_description','Fixture equipment','problem_description','Does not start',
    'accessories','[{"name":"Cable","quantity_received":3}]'::jsonb));
  return jsonb_build_object('org',org,'actor',actor,'sid',sid,'repair',repair,
    'cable',(select id from public.repair_accessories where repair_id=repair and name='Cable'));
end;
$$;
create function pg_temp.acc_ready(f jsonb) returns void language plpgsql as $$
declare repair uuid := (f->>'repair')::uuid; org uuid := (f->>'org')::uuid; v bigint;
begin
  select lock_version into v from public.repairs where id=repair;
  perform public.assign_repair(org,repair,(f->>'actor')::uuid,v);
  select lock_version into v from public.repairs where id=repair;
  perform public.change_repair_status(org,repair,'diagnosis',null,v);
  select lock_version into v from public.repairs where id=repair;
  perform public.change_repair_status(org,repair,'in_repair',null,v);
  select lock_version into v from public.repairs where id=repair;
  perform public.change_repair_status(org,repair,'testing',null,v);
  select lock_version into v from public.repairs where id=repair;
  perform public.record_repair_test(jsonb_build_object('organization_id',org,'repair_id',repair,'expected_lock_version',v,
    'test_type','Encendido','result','Stable','passed',true));
  select lock_version into v from public.repairs where id=repair;
  perform public.change_repair_status(org,repair,'ready_for_delivery',null,v);
end;
$$;
create schema repair_accessory_races;
create table repair_accessory_races.fixtures(kind text primary key, f jsonb not null);
do $$ declare kind text; f jsonb; other_actor uuid; other_sid uuid; begin
  foreach kind in array array['edit-edit','return-return','edit-return','return-delivery','delivery-edit','exception-return','replay'] loop
    f := pg_temp.acc_fixture();
    if kind in ('return-delivery','delivery-edit','exception-return') then perform pg_temp.acc_ready(f); end if;
    other_actor := gen_random_uuid(); other_sid := gen_random_uuid();
    insert into auth.users(id,email,raw_user_meta_data) values(other_actor,other_actor||'@example.invalid','{"full_name":"Other race actor"}');
    insert into auth.sessions(id,user_id,created_at,updated_at) values(other_sid,other_actor,now(),now());
    insert into organization_memberships(organization_id,user_id) values((f->>'org')::uuid,other_actor);
    insert into user_roles(organization_id,user_id,role_code) values((f->>'org')::uuid,other_actor,'ADMIN');
    f := f || jsonb_build_object('other_actor',other_actor,'other_sid',other_sid);
    insert into repair_accessory_races.fixtures values(kind,f);
  end loop;
end $$;
create function repair_accessory_races.write_command(command text, p jsonb, f jsonb, gate bigint) returns text
language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f->>'actor','role','authenticated','session_id',f->>'sid')::text,true);
  execute format('select public.%I($1)',command) using p;
  if gate is not null then perform pg_advisory_xact_lock(gate); end if;
  return 'OK';
exception when others then return sqlerrm;
end $$;
commit;

create function pg_temp.acc_race(kind text, first_command text, second_command text, first_data jsonb, second_data jsonb, replay boolean default false)
returns setof text language plpgsql as $$
declare f jsonb; a jsonb; b jsonb; gate bigint := 620629001; i integer; v bigint; winner text; loser text; overlap boolean;
begin
  select fixtures.f into f from repair_accessory_races.fixtures where fixtures.kind=acc_race.kind;
  select lock_version into v from public.repairs where id=(f->>'repair')::uuid;
  a := jsonb_build_object('organization_id',f->>'org','repair_id',f->>'repair','operation_key',gen_random_uuid(),'expected_lock_version',v) || first_data;
  b := jsonb_build_object('organization_id',f->>'org','repair_id',f->>'repair','operation_key',gen_random_uuid(),'expected_lock_version',v) || second_data;
  -- Substitute real accessory IDs into test payload templates.
  a := replace(a::text,'CABLE_ID',f->>'cable')::jsonb;
  b := replace(b::text,'CABLE_ID',f->>'cable')::jsonb;
  if replay then b := a; end if;
  perform extensions.dblink_connect('acc_a','host=supabase_db_backend port=5432 dbname='||current_database()||' user=postgres password=postgres application_name=acc_race_a');
  perform extensions.dblink_connect('acc_b','host=supabase_db_backend port=5432 dbname='||current_database()||' user=postgres password=postgres application_name=acc_race_b');
  perform pg_advisory_lock(gate);
  perform extensions.dblink_send_query('acc_a',format('select repair_accessory_races.write_command(%L,%L::jsonb,%L::jsonb,%s)',first_command,a,f,gate));
  for i in 1..200 loop
    perform pg_stat_clear_snapshot();
    exit when exists(select 1 from pg_stat_activity where application_name='acc_race_a' and wait_event='advisory');
    perform pg_sleep(0.01);
  end loop;
  return next ok(exists(select 1 from pg_stat_activity where application_name='acc_race_a' and wait_event='advisory'),kind||': winner holds committed-intent locks at barrier');
  perform extensions.dblink_send_query('acc_b',format('select repair_accessory_races.write_command(%L,%L::jsonb,%L::jsonb,null)',second_command,b,
    f || jsonb_build_object('actor',f->>'other_actor','sid',f->>'other_sid')));
  for i in 1..200 loop
    perform pg_stat_clear_snapshot();
    exit when exists(select 1 from pg_stat_activity where application_name='acc_race_b' and wait_event_type='Lock');
    perform pg_sleep(0.01);
  end loop;
  select count(distinct pid)=2 into overlap from pg_stat_activity where application_name in ('acc_race_a','acc_race_b') and wait_event_type='Lock';
  return next ok(overlap,kind||': two overlapping independent sessions actually block');
  perform pg_advisory_unlock(gate);
  select value into winner from extensions.dblink_get_result('acc_a') as t(value text);
  select value into loser from extensions.dblink_get_result('acc_b') as t(value text);
  return next is(winner,'OK',kind||': first command confirmed');
  return next is(loser,case when replay then 'OK' else 'REPAIR_VERSION_CONFLICT' end,kind||': replay or stale conflict');
  return next is((select lock_version from public.repairs where id=(f->>'repair')::uuid),v+1,kind||': aggregate advanced once');
  return next ok(not exists(select 1 from public.repair_accessories x where x.repair_id=(f->>'repair')::uuid
    and (select coalesce(sum(quantity),0) from public.repair_accessory_returns where accessory_id=x.id)>x.quantity_received),kind||': no negative balance');
  perform extensions.dblink_disconnect('acc_a'); perform extensions.dblink_disconnect('acc_b');
end $$;
select * from pg_temp.acc_race('edit-edit','save_repair_accessories','save_repair_accessories',
  '{"accessories":[{"id":"CABLE_ID","name":"Winner cable","quantity_received":4}]}',
  '{"accessories":[{"id":"CABLE_ID","name":"Loser cable","quantity_received":5}]}');
select * from pg_temp.acc_race('return-return','record_repair_accessory_return','record_repair_accessory_return',
  '{"returns":[{"accessory_id":"CABLE_ID","quantity":2}]}','{"returns":[{"accessory_id":"CABLE_ID","quantity":2}]}');
select * from pg_temp.acc_race('edit-return','save_repair_accessories','record_repair_accessory_return',
  '{"accessories":[{"id":"CABLE_ID","name":"Corrected","quantity_received":2}]}','{"returns":[{"accessory_id":"CABLE_ID","quantity":3}]}');
select * from pg_temp.acc_race('return-delivery','record_repair_accessory_return','deliver_repair_with_accessories',
  '{"returns":[{"accessory_id":"CABLE_ID","quantity":1}]}','{"authorize_exception":true,"exception_reason":"Approved pending custody"}');
select * from pg_temp.acc_race('delivery-edit','deliver_repair_with_accessories','save_repair_accessories',
  '{"authorize_exception":true,"exception_reason":"Approved pending custody"}',
  '{"accessories":[{"id":"CABLE_ID","name":"Late correction","quantity_received":5}]}');
select * from pg_temp.acc_race('exception-return','deliver_repair_with_accessories','record_repair_accessory_return',
  '{"authorize_exception":true,"exception_reason":"Approved pending custody"}','{"returns":[{"accessory_id":"CABLE_ID","quantity":1}]}');
select * from pg_temp.acc_race('replay','record_repair_accessory_return','record_repair_accessory_return',
  '{"returns":[{"accessory_id":"CABLE_ID","quantity":1}]}','{}',true);
select is((select sum(quantity) from repair_accessory_returns where repair_id=(select (f->>'repair')::uuid from repair_accessory_races.fixtures where kind='replay')),1::bigint,'concurrent replay has one physical return');
select is((select count(*) from inventory_movements where organization_id in (select (f->>'org')::uuid from repair_accessory_races.fixtures)),0::bigint,'all races preserve inventory');

-- dblink workers need committed fixtures, but this suite runs before the shared
-- operational E2E fixture. Remove only the exact synthetic tenants created here.
begin;
do $$
declare org_ids uuid[]; user_ids uuid[];
begin
  select array_agg(distinct (fixture.f->>'org')::uuid), array_agg(distinct actor.id)
  into org_ids, user_ids
  from repair_accessory_races.fixtures fixture
  cross join lateral (values ((fixture.f->>'actor')::uuid), ((fixture.f->>'other_actor')::uuid)) actor(id);

  alter table public.repair_accessory_returns disable trigger repair_accessory_returns_immutable;
  alter table public.repair_command_operations disable trigger repair_command_operations_immutable;
  alter table public.repair_events disable trigger repair_events_immutable;
  alter table public.audit_events disable trigger audit_events_immutable;

  delete from public.repair_accessory_returns where organization_id = any(org_ids);
  delete from public.repair_accessories where organization_id = any(org_ids);
  delete from public.repair_part_consumptions where organization_id = any(org_ids);
  delete from public.repair_parts where organization_id = any(org_ids);
  delete from public.repair_quote_items where organization_id = any(org_ids);
  delete from public.repair_quotes where organization_id = any(org_ids);
  delete from public.repair_diagnostics where organization_id = any(org_ids);
  delete from public.repair_tests where organization_id = any(org_ids);
  delete from public.repair_attachments where organization_id = any(org_ids);
  delete from public.repair_external_services where organization_id = any(org_ids);
  delete from public.repair_service_warranties where organization_id = any(org_ids);
  delete from public.repair_events where organization_id = any(org_ids);
  delete from public.repair_command_operations where organization_id = any(org_ids);
  delete from public.audit_events where organization_id = any(org_ids);

  alter table public.repair_accessory_returns enable trigger repair_accessory_returns_immutable;
  alter table public.repair_command_operations enable trigger repair_command_operations_immutable;
  alter table public.repair_events enable trigger repair_events_immutable;
  alter table public.audit_events enable trigger audit_events_immutable;

  delete from public.repairs where organization_id = any(org_ids);
  delete from public.organization_memberships where organization_id = any(org_ids);
  delete from public.organizations where id = any(org_ids);
  delete from auth.sessions where user_id = any(user_ids);
  delete from auth.users where id = any(user_ids);
end $$;
commit;

select is((select count(*) from public.organizations),
  (select count(*) from repair_accessory_organizations_before),
  'concurrency fixtures restore organization cardinality for subsequent E2E');
select results_eq(
  $$select id,name,slug from public.organizations order by id$$,
  $$select id,name,slug from repair_accessory_organizations_before order by id$$,
  'concurrency fixtures leave every pre-existing organization unchanged'
);
select * from finish();
drop schema repair_accessory_races cascade;
