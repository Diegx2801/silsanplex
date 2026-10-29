-- Independent sessions require committed, tenant-isolated fixtures. Cleanup
-- removes only this test's fixed organization after all workers disconnect.
create temporary table transfer_extension_state(was_installed boolean);
insert into transfer_extension_state select exists(select 1 from pg_extension where extname='dblink');
create extension if not exists dblink with schema extensions;
select no_plan();
create function pg_temp.clear_transfer_concurrency_fixture()
returns void language plpgsql as $$
begin
  drop schema if exists transfer_concurrency_test cascade;
  alter table public.audit_events disable trigger audit_events_immutable;
  delete from public.audit_events where organization_id='ac150000-0000-4000-8000-000000000001';
  alter table public.audit_events enable trigger audit_events_immutable;
  alter table public.inventory_movements disable trigger inventory_movements_immutable;
  delete from public.inventory_movements where organization_id='ac150000-0000-4000-8000-000000000001';
  alter table public.inventory_movements enable trigger inventory_movements_immutable;
  delete from public.warehouse_transfer_items where organization_id='ac150000-0000-4000-8000-000000000001';
  delete from public.warehouse_transfers where organization_id='ac150000-0000-4000-8000-000000000001';
  alter table public.product_versions disable trigger product_versions_immutable;
  delete from public.product_versions where organization_id='ac150000-0000-4000-8000-000000000001';
  alter table public.product_versions enable trigger product_versions_immutable;
  delete from public.warehouse_locations where organization_id='ac150000-0000-4000-8000-000000000001';
  delete from public.warehouses where organization_id='ac150000-0000-4000-8000-000000000001';
  delete from public.products where organization_id='ac150000-0000-4000-8000-000000000001';
  delete from public.user_roles where organization_id='ac150000-0000-4000-8000-000000000001';
  delete from public.organization_memberships where organization_id='ac150000-0000-4000-8000-000000000001';
  delete from public.organizations where id='ac150000-0000-4000-8000-000000000001';
  delete from auth.users where id='ac151000-0000-4000-8000-000000000001';
end;
$$;
begin;
select pg_temp.clear_transfer_concurrency_fixture();
insert into public.organizations(id,name,slug) values('ac150000-0000-4000-8000-000000000001','Transfer concurrency','transfer-concurrency');
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
values('ac151000-0000-4000-8000-000000000001','transfer-concurrency@test.local','{"full_name":"Transfer concurrency"}',now(),now());
insert into public.organization_memberships(organization_id,user_id) values('ac150000-0000-4000-8000-000000000001','ac151000-0000-4000-8000-000000000001');
insert into public.user_roles(organization_id,user_id,role_code) values('ac150000-0000-4000-8000-000000000001','ac151000-0000-4000-8000-000000000001','ADMIN');
insert into public.products(id,organization_id,code,description,unit_of_measure,batch_control,expiration_control)
values('ac152000-0000-4000-8000-000000000001','ac150000-0000-4000-8000-000000000001','TRANSFER-RACE','Transfer race','UND',false,false);
insert into public.warehouses(id,organization_id,code,name) values
 ('ac153000-0000-4000-8000-000000000001','ac150000-0000-4000-8000-000000000001','FIRST','First warehouse'),
 ('ac153000-0000-4000-8000-000000000002','ac150000-0000-4000-8000-000000000001','SECOND','Second warehouse');
insert into public.warehouse_locations(id,organization_id,warehouse_id,code,name) values
 ('ac154000-0000-4000-8000-000000000001','ac150000-0000-4000-8000-000000000001','ac153000-0000-4000-8000-000000000001','A','First shelf'),
 ('ac154000-0000-4000-8000-000000000002','ac150000-0000-4000-8000-000000000001','ac153000-0000-4000-8000-000000000002','B','Second shelf');
insert into public.inventory_movements(organization_id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,
 warehouse,warehouse_id,location_id,stock_status,unit_cost,operation_date,reason,source_type)
values('ac150000-0000-4000-8000-000000000001','ac152000-0000-4000-8000-000000000001','TRANSFER-RACE','Transfer race','Unidad','entrada',200,
 'First warehouse','ac153000-0000-4000-8000-000000000001','ac154000-0000-4000-8000-000000000001','available',5,current_date,'Initial stock','manual');
create schema transfer_concurrency_test;
create function transfer_concurrency_test.transfer(operation_key uuid, quantity numeric default 1, gate bigint default null, prelock boolean default false)
returns text language plpgsql as $$
declare result uuid;
begin
 perform set_config('request.jwt.claim.sub','ac151000-0000-4000-8000-000000000001',true);
 if prelock then
  perform public.lock_inventory_fefo_scope('ac150000-0000-4000-8000-000000000001','ac152000-0000-4000-8000-000000000001','ac153000-0000-4000-8000-000000000001');
  perform pg_advisory_xact_lock(gate);
 end if;
 result := public.transfer_inventory_position(jsonb_build_object(
  'organization_id','ac150000-0000-4000-8000-000000000001','product_id','ac152000-0000-4000-8000-000000000001',
  'source_warehouse_id','ac153000-0000-4000-8000-000000000001','source_location_id','ac154000-0000-4000-8000-000000000001',
  'destination_warehouse_id','ac153000-0000-4000-8000-000000000002','destination_location_id','ac154000-0000-4000-8000-000000000002',
  'operation_key',operation_key,'quantity',quantity,'stock_status','available','expected_conversion_factor',1
 ));
 if gate is not null and not prelock then perform pg_advisory_xact_lock(gate); end if;
 return 'ok:'||result::text;
exception when others then return 'error:'||sqlstate||':'||sqlerrm;
end;
$$;
create function transfer_concurrency_test.manual(gate bigint)
returns text language plpgsql as $$
declare result uuid;
begin
 perform set_config('request.jwt.claim.sub','ac151000-0000-4000-8000-000000000001',true);
 perform public.lock_inventory_fefo_scope('ac150000-0000-4000-8000-000000000001','ac152000-0000-4000-8000-000000000001','ac153000-0000-4000-8000-000000000001');
 perform pg_advisory_xact_lock(gate);
 result := public.record_inventory_movement(jsonb_build_object(
  'organization_id','ac150000-0000-4000-8000-000000000001','product_id','ac152000-0000-4000-8000-000000000001',
  'warehouse_id','ac153000-0000-4000-8000-000000000001','location_id','ac154000-0000-4000-8000-000000000001',
  'movement_type','entrada','quantity',1,'unit_cost',5,'stock_status','available','reason','Concurrent receipt','operation_date',current_date
 ));
 return 'ok:'||result::text;
exception when others then return 'error:'||sqlstate||':'||sqlerrm;
end;
$$;
create function transfer_concurrency_test.outbound()
returns text language plpgsql as $$
declare result uuid;
begin
 perform set_config('request.jwt.claim.sub','ac151000-0000-4000-8000-000000000001',true);
 result := public.record_inventory_fefo_outbound(jsonb_build_object(
  'organization_id','ac150000-0000-4000-8000-000000000001','product_id','ac152000-0000-4000-8000-000000000001',
  'warehouse_id','ac153000-0000-4000-8000-000000000001','quantity',1,'reason','Concurrent consumption'
 ));
 return 'ok:'||result::text;
exception when others then return 'error:'||sqlstate||':'||sqlerrm;
end;
$$;
commit;

select extensions.dblink_connect('transfer_a','host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('transfer_b','host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_exec('transfer_a','set statement_timeout=''8s''');
select extensions.dblink_exec('transfer_b','set statement_timeout=''8s''');
create temporary table transfer_workers(name text,pid integer);
insert into transfer_workers select 'a',pid from extensions.dblink('transfer_a','select pg_backend_pid()') as worker(pid integer);
insert into transfer_workers select 'b',pid from extensions.dblink('transfer_b','select pg_backend_pid()') as worker(pid integer);
create function pg_temp.wait_transfer_worker(worker_name text)
returns boolean language plpgsql as $$
begin
 for attempt in 1..100 loop
  if exists(select 1 from pg_locks where pid=(select pid from transfer_workers where name=worker_name) and not granted) then return true; end if;
  perform pg_sleep(0.02);
 end loop;
 return false;
end;
$$;
create temporary table transfer_responses(name text,result text);

-- A public manual writer owns the master while the new transfer starts.
-- The transfer must wait WITHOUT owning a product lock needed by the receipt.
select pg_advisory_lock(908215000000000001);
select is(extensions.dblink_send_query('transfer_a',$$select transfer_concurrency_test.manual(908215000000000001)$$),1,'manual starts');
select ok(pg_temp.wait_transfer_worker('a'),'manual owns master before product');
select is(extensions.dblink_send_query('transfer_b',$$select transfer_concurrency_test.transfer('ac156000-0000-4000-8000-000000000001')$$),1,'transfer starts');
select ok(pg_temp.wait_transfer_worker('b'),'transfer waits for manual master');
select pg_advisory_unlock(908215000000000001);
select matches((select result from extensions.dblink_get_result('transfer_a') as response(result text)),'^ok:','manual commits without deadlock');
select matches((select result from extensions.dblink_get_result('transfer_b') as response(result text)),'^ok:','transfer commits after manual');
select * from extensions.dblink_get_result('transfer_a') as cleared(result text);
select * from extensions.dblink_get_result('transfer_b') as cleared(result text);

-- A new transfer owns the master while a FEFO outbound starts. The outbound
-- must wait BEFORE retaining the resolver's product share lock.
select pg_advisory_lock(908215000000000002);
select is(extensions.dblink_send_query('transfer_a',$$select transfer_concurrency_test.transfer('ac156000-0000-4000-8000-000000000002',1,908215000000000002,true)$$),1,'transfer prelocks master');
select ok(pg_temp.wait_transfer_worker('a'),'transfer reaches master gate');
select is(extensions.dblink_send_query('transfer_b',$$select transfer_concurrency_test.outbound()$$),1,'FEFO outbound starts');
select ok(pg_temp.wait_transfer_worker('b'),'FEFO waits for transfer master');
select pg_advisory_unlock(908215000000000002);
select matches((select result from extensions.dblink_get_result('transfer_a') as response(result text)),'^ok:','transfer commits without FEFO deadlock');
select matches((select result from extensions.dblink_get_result('transfer_b') as response(result text)),'^ok:','FEFO outbound commits after transfer');
select * from extensions.dblink_get_result('transfer_a') as cleared(result text);
select * from extensions.dblink_get_result('transfer_b') as cleared(result text);

-- Lost-response retry races the first commit: same operation creates only one.
select pg_advisory_lock(908215000000000003);
select is(extensions.dblink_send_query('transfer_a',$$select transfer_concurrency_test.transfer('ac156000-0000-4000-8000-000000000003',20,908215000000000003)$$),1,'first idempotent transfer starts');
select ok(pg_temp.wait_transfer_worker('a'),'first transfer waits before commit');
select is(extensions.dblink_send_query('transfer_b',$$select transfer_concurrency_test.transfer('ac156000-0000-4000-8000-000000000003',20)$$),1,'concurrent identical retry starts');
select ok(pg_temp.wait_transfer_worker('b'),'retry waits for operation mutex');
select pg_advisory_unlock(908215000000000003);
insert into transfer_responses select 'first',result from extensions.dblink_get_result('transfer_a') as response(result text);
insert into transfer_responses select 'retry',result from extensions.dblink_get_result('transfer_b') as response(result text);
select matches((select result from transfer_responses where name='first'),'^ok:','first transfer commits');
select is((select result from transfer_responses where name='retry'),(select result from transfer_responses where name='first'),'concurrent retry returns same id');
select is((select count(*) from public.inventory_movements where transfer_id=(select id from public.warehouse_transfers where operation_key='ac156000-0000-4000-8000-000000000003')),2::bigint,'concurrent retry creates only two paired movements');
select * from extensions.dblink_get_result('transfer_a') as cleared(result text);
select * from extensions.dblink_get_result('transfer_b') as cleared(result text);

-- Separate operations cannot oversubscribe the same source position.
select pg_advisory_lock(908215000000000004);
select is(extensions.dblink_send_query('transfer_a',$$select transfer_concurrency_test.transfer('ac156000-0000-4000-8000-000000000004',100,908215000000000004)$$),1,'first large transfer starts');
select ok(pg_temp.wait_transfer_worker('a'),'first large transfer owns source locks');
select is(extensions.dblink_send_query('transfer_b',$$select transfer_concurrency_test.transfer('ac156000-0000-4000-8000-000000000005',100)$$),1,'competing transfer starts');
select ok(pg_temp.wait_transfer_worker('b'),'competing transfer waits');
select pg_advisory_unlock(908215000000000004);
select matches((select result from extensions.dblink_get_result('transfer_a') as response(result text)),'^ok:','first large transfer commits');
select is((select result from extensions.dblink_get_result('transfer_b') as response(result text)),'error:P0001:TRANSFER_INSUFFICIENT_STOCK','waiting transfer sees committed source balance and fails');
select is((select count(*) from public.warehouse_transfers where operation_key='ac156000-0000-4000-8000-000000000005'),0::bigint,'failed concurrent transfer leaves no header');
select is(public.inventory_bucket_quantity('ac150000-0000-4000-8000-000000000001','ac152000-0000-4000-8000-000000000001','ac153000-0000-4000-8000-000000000001','ac154000-0000-4000-8000-000000000001','available',null,null),78::numeric,'source remains nonnegative after races');
select is((select sum(physical_quantity) from public.inventory_bucket_balances where product_id='ac152000-0000-4000-8000-000000000001'),200::numeric,'all transfers conserve enterprise stock');
select * from extensions.dblink_get_result('transfer_a') as cleared(result text);
select * from extensions.dblink_get_result('transfer_b') as cleared(result text);
select extensions.dblink_disconnect('transfer_a');
select extensions.dblink_disconnect('transfer_b');
begin;
select pg_temp.clear_transfer_concurrency_fixture();
commit;
do $$begin
 if not (select was_installed from transfer_extension_state) then drop extension if exists dblink; end if;
end;$$;
select * from finish();
