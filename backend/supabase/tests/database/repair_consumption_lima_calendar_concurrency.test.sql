-- Real independent transactions, different caller timezones, public RPCs.
create extension if not exists dblink with schema extensions;
select no_plan();
create temporary table d06_orgs_before on commit preserve rows as select id,name,slug from organizations;
begin;
create schema d06_races;
revoke all on schema d06_races from public,anon,authenticated,service_role;
create table d06_races.fixtures(kind text primary key,data jsonb);
do $$declare org uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();product uuid:=gen_random_uuid();warehouse uuid;location uuid;
 repair uuid;part uuid;kind text;begin
 insert into organizations(id,name,slug) values(org,'D06 concurrent fixture','d06-race-'||org);
 insert into auth.users(id,email,raw_user_meta_data) values(actor,actor||'@example.invalid','{"full_name":"D06 race operator"}');
 insert into auth.sessions(id,user_id,created_at,updated_at) values(actor,actor,now(),now());
 insert into organization_memberships(organization_id,user_id) values(org,actor);
 insert into user_roles(organization_id,user_id,role_code) values(org,actor,'ADMIN');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor,'session_id',actor)::text,true);
 insert into products(id,organization_id,code,description,unit_of_measure,product_type,tax_affectation,batch_control,expiration_control,created_by,updated_by)
 values(product,org,'D06-RACE','D06 concurrent part','UND','good','gravado',true,true,actor,actor);
 warehouse:=save_warehouse(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),'code','D06-RACE','name','D06 race warehouse','address','Disposable fixture'));
 select id into location from warehouse_locations where warehouse_id=warehouse and code='GENERAL';
 perform record_inventory_movement(jsonb_build_object('organization_id',org,'product_id',product,'warehouse_id',warehouse,'location_id',location,
 'movement_type','entrada','quantity',100,'unit_cost',7.1234,'stock_status','available','lot','RACE','expiration_date','2099-01-01',
 'operation_date',(transaction_timestamp() at time zone 'America/Lima')::date,'reason','D06 race stock','document_reference','D06 race fixture'));
 foreach kind in array array['replay','conflict'] loop
  repair:=create_repair(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),'requester_type','internal','requesting_area','D06 race',
  'equipment_type','external','external_equipment_description','D06 race equipment','problem_description','D06 concurrent consumption'));
  perform assign_repair(org,repair,actor,1);perform change_repair_status(org,repair,'diagnosis',null,2);perform change_repair_status(org,repair,'in_repair',null,3);
  part:=reserve_repair_part(jsonb_build_object('organization_id',org,'repair_id',repair,'expected_lock_version',4,'operation_key',gen_random_uuid(),
  'product_id',product,'warehouse_id',warehouse,'location_id',location,'stock_status','available','lot','RACE','expiration_date','2099-01-01','quantity_requested',2));
  insert into d06_races.fixtures values(kind,jsonb_build_object('org',org,'actor',actor,'repair',repair,'part',part));
 end loop;
end$$;
create function d06_races.consume(f jsonb,p jsonb,zone text,gate bigint) returns jsonb language plpgsql as $$
declare result uuid;begin
 perform set_config('TimeZone',zone,true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f->>'actor','session_id',f->>'actor')::text,true);
 perform set_config('role','authenticated',true);
 result:=public.consume_repair_part(p);
 if gate is not null then perform pg_advisory_xact_lock(gate);end if;
 return jsonb_build_object('id',result);
exception when others then return jsonb_build_object('error',sqlerrm,'code',sqlstate);end$$;
commit;

create function pg_temp.d06_race(kind text) returns setof text language plpgsql as $$
declare f jsonb;p jsonb;q jsonb;a jsonb;b jsonb;v bigint;events bigint;audits bigint;movements bigint;i integer;gate bigint:=67060001;consumption_id_value uuid;
begin
 select data into f from d06_races.fixtures where fixtures.kind=$1;
 select lock_version into v from repairs where id=(f->>'repair')::uuid;
 select count(*) into events from repair_events where repair_id=(f->>'repair')::uuid;
 select count(*) into audits from audit_events where entity_id=f->>'repair';
 select count(*) into movements from inventory_movements where organization_id=(f->>'org')::uuid;
 p:=jsonb_build_object('organization_id',f->>'org','repair_part_id',f->>'part','operation_key',gen_random_uuid(),'expected_lock_version',v,'quantity',1.234);
 q:=case when kind='replay' then p else p||jsonb_build_object('operation_key',gen_random_uuid()) end;
 perform extensions.dblink_connect('d06_a','host=supabase_db_backend port=5432 dbname='||current_database()||' user=postgres password=postgres application_name=d06_race_a');
 perform extensions.dblink_connect('d06_b','host=supabase_db_backend port=5432 dbname='||current_database()||' user=postgres password=postgres application_name=d06_race_b');
 perform pg_advisory_lock(gate);
 perform extensions.dblink_send_query('d06_a',format('select d06_races.consume(%L::jsonb,%L::jsonb,%L,%s)',f,p,'UTC',gate));
 for i in 1..300 loop perform pg_stat_clear_snapshot();exit when exists(select 1 from pg_stat_activity where application_name='d06_race_a' and wait_event='advisory');perform pg_sleep(0.01);end loop;
 return next ok(exists(select 1 from pg_stat_activity where application_name='d06_race_a' and wait_event='advisory'),kind||': winner holds the aggregate and inventory locks');
 perform extensions.dblink_send_query('d06_b',format('select d06_races.consume(%L::jsonb,%L::jsonb,%L,null)',f,q,'Pacific/Kiritimati'));
 for i in 1..300 loop perform pg_stat_clear_snapshot();exit when exists(select 1 from pg_stat_activity where application_name='d06_race_b' and wait_event_type='Lock');perform pg_sleep(0.01);end loop;
 return next ok(exists(select 1 from pg_stat_activity where application_name='d06_race_b' and wait_event_type='Lock'),kind||': second real session overlaps and waits');
 perform pg_advisory_unlock(gate);
 select result into a from extensions.dblink_get_result('d06_a') as t(result jsonb);
 select result into b from extensions.dblink_get_result('d06_b') as t(result jsonb);
 return next ok(a ? 'id',kind||': first authenticated public command succeeds');
 if kind='replay' then return next is(b->>'id',a->>'id',kind||': same key in another timezone returns the same consumption');
 else return next is(b->>'error','REPAIR_VERSION_CONFLICT',kind||': different stale key cannot overwrite the winning consumption');end if;
 consumption_id_value:=(a->>'id')::uuid;
 return next is((select lock_version from repairs where id=(f->>'repair')::uuid),v+1,kind||': one version advance');
 return next is((select count(*) from repair_events where repair_id=(f->>'repair')::uuid),events+1,kind||': one event');
 return next is((select count(*) from audit_events where entity_id=f->>'repair'),audits+1,kind||': one audit');
 return next is((select count(*) from inventory_movements where organization_id=(f->>'org')::uuid),movements+1,kind||': one physical movement');
 return next is((select quantity_consumed from repair_parts where id=(f->>'part')::uuid),1.234::numeric,kind||': partial reservation consumed once');
 return next ok((select m.operation_date=(c.consumed_at at time zone 'America/Lima')::date and m.created_at=c.consumed_at
 from repair_part_consumptions c join inventory_movements m on m.id=c.inventory_movement_id where c.id=consumption_id_value),kind||': date is derived from the persisted transaction instant in Lima');
 return next is((select unit_cost from repair_part_consumptions where repair_part_consumptions.id=consumption_id_value),7.1234::numeric,kind||': historical unit cost is unchanged');
 perform extensions.dblink_disconnect('d06_a');perform extensions.dblink_disconnect('d06_b');
end$$;
select * from pg_temp.d06_race('replay');
select * from pg_temp.d06_race('conflict');

-- Exact fixture teardown AFTER assertions. Restore every guard in this transaction.
begin;
do $$declare org uuid;actor uuid;begin
 select (data->>'org')::uuid,(data->>'actor')::uuid into org,actor from d06_races.fixtures limit 1;
 alter table repair_command_operations disable trigger repair_command_operations_immutable;
 alter table repair_events disable trigger repair_events_immutable;
 alter table audit_events disable trigger audit_events_immutable;
 alter table repair_part_consumptions disable trigger repair_part_consumptions_immutable;
 alter table inventory_movements disable trigger inventory_movements_immutable;
 delete from repair_command_operations where organization_id=org;delete from repair_events where organization_id=org;delete from audit_events where organization_id=org;
 delete from repair_part_consumptions where organization_id=org;delete from inventory_movements where organization_id=org;
 alter table repair_command_operations enable trigger repair_command_operations_immutable;
 alter table repair_events enable trigger repair_events_immutable;
 alter table audit_events enable trigger audit_events_immutable;
 alter table repair_part_consumptions enable trigger repair_part_consumptions_immutable;
 alter table inventory_movements enable trigger inventory_movements_immutable;
 alter table inventory_reservations disable trigger inventory_reservations_validate_repair_projection;
 delete from inventory_reservations where organization_id=org;
 alter table inventory_reservations enable trigger inventory_reservations_validate_repair_projection;
 alter table repair_parts disable trigger repair_parts_enforce_inventory_identity;
 delete from repair_parts where organization_id=org;
 alter table repair_parts enable trigger repair_parts_enforce_inventory_identity;
 delete from repairs where organization_id=org;
 alter table product_versions disable trigger product_versions_immutable;
 delete from product_versions where organization_id=org;
 alter table product_versions enable trigger product_versions_immutable;
 delete from products where organization_id=org;delete from warehouse_locations where organization_id=org;delete from warehouses where organization_id=org;
 alter table warehouse_master_operations disable trigger warehouse_master_operations_immutable;
 delete from warehouse_master_operations where organization_id=org;
 alter table warehouse_master_operations enable trigger warehouse_master_operations_immutable;
 delete from organization_memberships where organization_id=org;delete from organizations where id=org;
 delete from auth.sessions where user_id=actor;delete from auth.users where id=actor;
end$$;
drop schema d06_races cascade;
commit;
select results_eq($$select id,name,slug from organizations order by id$$,$$select id,name,slug from d06_orgs_before order by id$$,
 'D06 races leave original organizations unchanged');
select ok(not exists(select 1 from pg_trigger where tgname like '%immutable%' and tgenabled='D'),'D06 teardown leaves immutable guards enabled');
select * from finish();
