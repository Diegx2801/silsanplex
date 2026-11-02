create extension if not exists dblink with schema extensions;
select no_plan();
create temporary table r14_orgs_before on commit preserve rows as select id,name,slug from organizations;
begin;
create schema r14_races;
create table r14_races.f(kind text primary key,data jsonb);
do $$ declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); warehouse uuid; location uuid; supplier uuid:=gen_random_uuid();
 r uuid; entry uuid; part uuid; service uuid; version bigint; p jsonb; kind text; summary jsonb;
begin
 insert into organizations(id,name,slug) values(org,'R14 race','r14-race-'||org);
 insert into auth.users(id,email,raw_user_meta_data) values(actor,actor||'@example.invalid','{"full_name":"R14 race finance"}');
 insert into auth.sessions(id,user_id,created_at,updated_at) values(actor,actor,now(),now());
 insert into organization_memberships(organization_id,user_id) values(org,actor);
 insert into user_roles(organization_id,user_id,role_code) values(org,actor,'ADMIN');
 insert into organization_user_permissions(organization_id,user_id,permission_code) values(org,actor,'REPAIRS_MANAGE_ACTUAL_COST'),(org,actor,'REPAIRS_CONFIRM_ACTUAL_COST');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor,'session_id',actor)::text,true);
 insert into products(id,organization_id,code,description,unit_of_measure,batch_control,expiration_control,created_by,updated_by)
 values(product,org,'R14-RACE','R14 race part','UND',false,false,actor,actor);
 insert into suppliers(id,organization_id,document_type,document_number,business_name,created_by,updated_by) values(supplier,org,'ruc','20999999992','R14 race provider',actor,actor);
 warehouse:=save_warehouse(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),'code','R14-RACE','name','R14 race warehouse','address','Disposable'));
 select id into location from warehouse_locations where warehouse_id=warehouse and code='GENERAL';
 perform record_inventory_movement(jsonb_build_object('organization_id',org,'product_id',product,'warehouse_id',warehouse,'location_id',location,
  'movement_type','entrada','quantity',100,'unit_cost',5,'stock_status','available','operation_date',(now() at time zone 'America/Lima')::date,'reason','Race stock','document_reference','R14 race'));
 foreach kind in array array['edit-edit','edit-replay','external-edit','confirm-confirm','confirm-consume','consume-confirm','return-confirm','correction-original-replay'] loop
  r:=create_repair(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),'requester_type','internal','requesting_area','R14 race',
   'equipment_type','external','external_equipment_description','Race equipment','problem_description','Race problem','accessories','[]'::jsonb));
  perform assign_repair(org,r,actor,1); perform change_repair_status(org,r,'diagnosis',null,2); perform change_repair_status(org,r,'in_repair',null,3);
  p:=jsonb_build_object('organization_id',org,'repair_id',r,'expected_lock_version',4,'operation_key',gen_random_uuid(),'category','labor','description','Race labor','amount','10.00',
    'currency','PEN','cost_basis','not_applicable','incurred_on',(now() at time zone 'America/Lima')::date,'evidence_reference','Race original','reason','Race initial cost');
  entry:=record_repair_actual_cost(p); part:=null; service:=null;
  if kind in ('confirm-consume','consume-confirm') then
   select lock_version into version from repairs where id=r;
   part:=reserve_repair_part(jsonb_build_object('organization_id',org,'repair_id',r,'expected_lock_version',version,'operation_key',gen_random_uuid(),'product_id',product,
    'warehouse_id',warehouse,'location_id',location,'stock_status','available','quantity_requested',2));
  end if;
  if kind in ('external-edit','return-confirm') then
   select lock_version into version from repairs where id=r;
   service:=send_repair_external_service(jsonb_build_object('organization_id',org,'repair_id',r,'expected_lock_version',version,'operation_key',gen_random_uuid(),'supplier_id',supplier,'description','Race service'));
   if kind='external-edit' then
    select lock_version into version from repairs where id=r;
    perform receive_repair_external_service(jsonb_build_object('organization_id',org,'repair_id',r,'expected_lock_version',version,'operation_key',gen_random_uuid(),'external_service_id',service,'cost_amount',5,'currency','PEN'));
   end if;
  end if;
  if kind in ('confirm-confirm','confirm-consume','consume-confirm') then
   select lock_version into version from repairs where id=r;
   summary:=get_repair_actual_cost_summaries(org,array[r])->0;
   perform confirm_repair_actual_cost_review(jsonb_build_object('organization_id',org,'repair_id',r,'expected_lock_version',version,'operation_key',gen_random_uuid(),
    'source_fingerprint',summary->>'source_fingerprint','scope',jsonb_build_object('consumption','not_applicable','external','not_applicable','labor','complete','other','not_applicable'),
    'evidence_reference','Race review','reason','Complete at cutoff'));
  end if;
  insert into r14_races.f values(kind,jsonb_build_object('org',org,'actor',actor,'repair',r,'entry',entry,'part',part,'service',service,'original',p));
 end loop;
end $$;
create function r14_races.command(action text,p jsonb,f jsonb,gate bigint) returns text language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f->>'actor','session_id',f->>'actor')::text,true);
 case action
 when 'edit' then perform revise_repair_actual_cost(p||jsonb_build_object('entry_id',f->>'entry','description','Corrected real work','amount','9.00','currency','PEN','cost_basis','not_applicable','incurred_on',(now() at time zone 'America/Lima')::date));
 when 'external' then perform revise_repair_external_cost(p||jsonb_build_object('source_id',f->>'service','amount','4.00','currency','USD','cost_basis','tax_exclusive'));
 when 'confirm' then perform confirm_repair_actual_cost_review(p||jsonb_build_object('source_fingerprint',f->>'fingerprint','scope',jsonb_build_object('consumption','not_applicable','external','not_applicable','labor','complete','other','not_applicable')));
 when 'consume' then perform consume_repair_part(p||jsonb_build_object('repair_part_id',f->>'part','quantity',1));
 when 'return' then perform receive_repair_external_service(p||jsonb_build_object('external_service_id',f->>'service','cost_amount',5,'currency','PEN'));
 when 'original' then perform record_repair_actual_cost(f->'original');
 end case;
 if gate is not null then perform pg_advisory_xact_lock(gate); end if;
 return 'OK';
exception when others then return sqlerrm;
end $$;
commit;
create function pg_temp.r14_race(kind text,a text,b text,replay boolean default false,original_replay boolean default false) returns setof text language plpgsql as $$
declare f jsonb; p jsonb; q jsonb; gate bigint:=614140001; version bigint; events bigint; audits bigint; entries bigint; reviews bigint; i integer; first_result text; second_result text;
begin
 select x.data into f from r14_races.f x where x.kind=r14_race.kind;
 select lock_version into version from repairs where id=(f->>'repair')::uuid;
 select count(*) into events from repair_events where repair_id=(f->>'repair')::uuid;
 select count(*) into audits from audit_events where entity_id=f->>'repair';
 select count(*) into entries from repair_actual_cost_entries where repair_id=(f->>'repair')::uuid;
 select count(*) into reviews from repair_actual_cost_reviews where repair_id=(f->>'repair')::uuid;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f->>'actor','session_id',f->>'actor')::text,true);
 f:=f||jsonb_build_object('fingerprint',get_repair_actual_cost_summaries((f->>'org')::uuid,array[(f->>'repair')::uuid])->0->>'source_fingerprint');
 p:=jsonb_build_object('organization_id',f->>'org','repair_id',f->>'repair','expected_lock_version',version,'operation_key',gen_random_uuid(),'evidence_reference','Race correction','reason','Documented race operation');
 q:=case when replay then p else p||jsonb_build_object('operation_key',gen_random_uuid()) end;
 perform extensions.dblink_connect('r14_a','host=supabase_db_backend port=5432 dbname='||current_database()||' user=postgres password=postgres application_name=r14_race_a');
 perform extensions.dblink_connect('r14_b','host=supabase_db_backend port=5432 dbname='||current_database()||' user=postgres password=postgres application_name=r14_race_b');
 perform pg_advisory_lock(gate);
 perform extensions.dblink_send_query('r14_a',format('select r14_races.command(%L,%L::jsonb,%L::jsonb,%s)',a,p,f,gate));
 for i in 1..300 loop perform pg_stat_clear_snapshot(); exit when exists(select 1 from pg_stat_activity where application_name='r14_race_a' and wait_event='advisory'); perform pg_sleep(0.01); end loop;
 return next ok(exists(select 1 from pg_stat_activity where application_name='r14_race_a' and wait_event='advisory'),kind||': first worker holds aggregate');
 perform extensions.dblink_send_query('r14_b',format('select r14_races.command(%L,%L::jsonb,%L::jsonb,null)',b,q,f));
 if not original_replay then
  for i in 1..300 loop perform pg_stat_clear_snapshot(); exit when exists(select 1 from pg_stat_activity where application_name='r14_race_b' and wait_event_type='Lock'); perform pg_sleep(0.01); end loop;
  return next ok(exists(select 1 from pg_stat_activity where application_name='r14_race_b' and wait_event_type='Lock'),kind||': independent worker actually overlaps');
 else
  select value into second_result from extensions.dblink_get_result('r14_b') as t(value text);
  return next is(second_result,'OK',kind||': committed original replay succeeds while correction holds row');
 end if;
 perform pg_advisory_unlock(gate);
 select value into first_result from extensions.dblink_get_result('r14_a') as t(value text);
 if not original_replay then select value into second_result from extensions.dblink_get_result('r14_b') as t(value text); end if;
 return next is(first_result,'OK',kind||': winner succeeds');
 return next is(second_result,case when replay or original_replay then 'OK' else 'REPAIR_VERSION_CONFLICT' end,kind||': exact replay or stale conflict');
 return next is((select lock_version from repairs where id=(f->>'repair')::uuid),version+1,kind||': one version advance');
 return next is((select count(*) from repair_events where repair_id=(f->>'repair')::uuid),events+1,kind||': one event only');
 return next is((select count(*) from audit_events where entity_id=f->>'repair'),audits+1,kind||': one audit only');
 return next is((select count(*) from repair_actual_cost_entries where repair_id=(f->>'repair')::uuid),entries+case when a='edit' then 1 else 0 end::bigint,kind||': no duplicate line revision');
 return next is((select count(*) from repair_actual_cost_reviews where repair_id=(f->>'repair')::uuid),reviews+case when a='confirm' then 1 else 0 end::bigint,kind||': no duplicate review');
 return next is((select status from repairs where id=(f->>'repair')::uuid),'in_repair',kind||': no technical status mutation');
 if a='consume' then
  return next is((get_repair_actual_cost_summaries((f->>'org')::uuid,array[(f->>'repair')::uuid])->0)->>'state','partial',kind||': new consumption makes prior confirmation historical');
 elsif a='edit' then
  return next is((get_repair_actual_cost_summaries((f->>'org')::uuid,array[(f->>'repair')::uuid])->0)->'subtotals'->0->>'amount','9.00',kind||': original replay cannot restore old amount');
 end if;
 perform extensions.dblink_disconnect('r14_a'); perform extensions.dblink_disconnect('r14_b');
end $$;
select * from pg_temp.r14_race('edit-edit','edit','edit');
select * from pg_temp.r14_race('edit-replay','edit','edit',true);
select * from pg_temp.r14_race('external-edit','external','external');
select * from pg_temp.r14_race('confirm-confirm','confirm','confirm');
select * from pg_temp.r14_race('confirm-consume','confirm','consume');
select * from pg_temp.r14_race('consume-confirm','consume','confirm');
select * from pg_temp.r14_race('return-confirm','return','confirm');
select * from pg_temp.r14_race('correction-original-replay','edit','original',false,true);

-- Exact synthetic-fixture teardown only; every guard is restored in this transaction.
begin;
do $$ declare org uuid; actor uuid; t text; begin
 select (data->>'org')::uuid,(data->>'actor')::uuid into org,actor from r14_races.f limit 1;
 foreach t in array array['repair_actual_cost_reviews','repair_cost_source_reviews','repair_actual_cost_entries'] loop
  execute format('alter table public.%I disable trigger %I',t,t||'_immutable');
  execute format('delete from public.%I where organization_id=$1',t) using org;
  execute format('alter table public.%I enable trigger %I',t,t||'_immutable');
 end loop;
 alter table repair_command_operations disable trigger repair_command_operations_immutable;
 alter table repair_events disable trigger repair_events_immutable;
 alter table audit_events disable trigger audit_events_immutable;
 alter table repair_part_consumptions disable trigger repair_part_consumptions_immutable;
 alter table inventory_movements disable trigger inventory_movements_immutable;
 delete from repair_command_operations where organization_id=org; delete from repair_events where organization_id=org; delete from audit_events where organization_id=org;
 delete from repair_part_consumptions where organization_id=org; delete from inventory_movements where organization_id=org;
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
 delete from repair_external_services where organization_id=org;
 delete from repairs where organization_id=org;
 alter table product_versions disable trigger product_versions_immutable; delete from product_versions where organization_id=org; alter table product_versions enable trigger product_versions_immutable;
 delete from products where organization_id=org; delete from warehouse_locations where organization_id=org; delete from warehouses where organization_id=org; delete from suppliers where organization_id=org;
 alter table warehouse_master_operations disable trigger warehouse_master_operations_immutable;
 delete from warehouse_master_operations where organization_id=org;
 alter table warehouse_master_operations enable trigger warehouse_master_operations_immutable;
 delete from organization_user_permissions where organization_id=org; delete from organization_memberships where organization_id=org; delete from organizations where id=org;
 delete from auth.sessions where user_id=actor; delete from auth.users where id=actor;
end $$;
drop schema r14_races cascade;
commit;
select results_eq($$select id,name,slug from organizations order by id$$,$$select id,name,slug from r14_orgs_before order by id$$,'R14 concurrency leaves operational organizations intact');
select * from finish();
