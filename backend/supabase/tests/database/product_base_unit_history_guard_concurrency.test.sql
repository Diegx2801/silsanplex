create temporary table base_unit_extension_state (was_installed boolean not null);
insert into base_unit_extension_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');
create extension if not exists dblink with schema extensions;

select plan(17);

create function pg_temp.clear_base_unit_concurrency_fixture()
returns void language plpgsql as $$
begin
  drop schema if exists base_unit_concurrency_test cascade;
  alter table public.audit_events disable trigger audit_events_immutable;
  delete from public.audit_events where organization_id = 'ba210000-0000-4000-8000-000000000001';
  alter table public.audit_events enable trigger audit_events_immutable;
  alter table public.inventory_movements disable trigger inventory_movements_immutable;
  delete from public.inventory_movements where organization_id = 'ba210000-0000-4000-8000-000000000001';
  alter table public.inventory_movements enable trigger inventory_movements_immutable;
  alter table public.product_versions disable trigger product_versions_immutable;
  delete from public.product_versions where organization_id = 'ba210000-0000-4000-8000-000000000001';
  alter table public.product_versions enable trigger product_versions_immutable;
  delete from public.warehouse_locations where organization_id = 'ba210000-0000-4000-8000-000000000001';
  delete from public.warehouses where organization_id = 'ba210000-0000-4000-8000-000000000001';
  delete from public.products where organization_id = 'ba210000-0000-4000-8000-000000000001';
  delete from public.organizations where id = 'ba210000-0000-4000-8000-000000000001';
end;
$$;

begin;
select pg_temp.clear_base_unit_concurrency_fixture();
insert into public.organizations (id, name, slug)
values ('ba210000-0000-4000-8000-000000000001', 'Base unit concurrency', 'base-unit-concurrency');
insert into public.products (
  id, organization_id, code, description, unit_of_measure, batch_control, expiration_control
) values
  ('ba230000-0000-4000-8000-000000000001', 'ba210000-0000-4000-8000-000000000001', 'MOVE-FIRST', 'Movement first', 'UND', false, false),
  ('ba230000-0000-4000-8000-000000000002', 'ba210000-0000-4000-8000-000000000001', 'UNIT-FIRST', 'Unit first', 'UND', false, false);
insert into public.warehouses (id, organization_id, code, name)
values ('ba240000-0000-4000-8000-000000000001', 'ba210000-0000-4000-8000-000000000001', 'CENTRAL', 'Concurrency warehouse');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name)
values ('ba250000-0000-4000-8000-000000000001', 'ba210000-0000-4000-8000-000000000001', 'ba240000-0000-4000-8000-000000000001', 'A-01', 'Concurrency shelf');

create schema base_unit_concurrency_test;
create function base_unit_concurrency_test.insert_movement(product_id uuid, gate_key bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description,
    unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
    location_id, stock_status, unit_cost, operation_date, reason, source_type
  ) values (
    'ba210000-0000-4000-8000-000000000001', product_id, 'CONCURRENT', 'Concurrent receipt',
    'UND', 'entrada', 2, 'Concurrency warehouse', 'ba240000-0000-4000-8000-000000000001',
    'ba250000-0000-4000-8000-000000000001', 'available', 10, current_date, 'Concurrent receipt', 'manual'
  );
  if gate_key is not null then perform pg_catalog.pg_advisory_xact_lock(gate_key); end if;
  return 'ok';
exception when others then return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;
create function base_unit_concurrency_test.change_base(product_id uuid, gate_key bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.products set unit_of_measure = 'Caja'
  where organization_id = 'ba210000-0000-4000-8000-000000000001' and id = product_id;
  if gate_key is not null then perform pg_catalog.pg_advisory_xact_lock(gate_key); end if;
  return 'ok';
exception when others then return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;
commit;

select extensions.dblink_connect('base_unit_writer', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('base_unit_changer', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
create temporary table base_unit_workers (name text primary key, pid integer not null);
insert into base_unit_workers select 'writer', pid from extensions.dblink('base_unit_writer', 'select pg_backend_pid()') as worker(pid integer);
insert into base_unit_workers select 'changer', pid from extensions.dblink('base_unit_changer', 'select pg_backend_pid()') as worker(pid integer);
create function pg_temp.wait_base_unit_worker(worker_name text, advisory_only boolean default false)
returns boolean language plpgsql as $$
begin
  for attempt in 1..100 loop
    if exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select pid from base_unit_workers where name = worker_name)
        and not lock.granted and (not advisory_only or lock.locktype = 'advisory')
    ) then return true; end if;
    perform pg_catalog.pg_sleep(0.02);
  end loop;
  return false;
end;
$$;

select isnt((select pid from base_unit_workers where name = 'writer'),
  (select pid from base_unit_workers where name = 'changer'), 'race uses independent sessions');

-- The first movement wins the row lock; the waiting unit edit must observe it.
select pg_catalog.pg_advisory_lock(908200000000000001);
select is(extensions.dblink_send_query('base_unit_writer',
  $$select base_unit_concurrency_test.insert_movement('ba230000-0000-4000-8000-000000000001', 908200000000000001)$$),
  1, 'first movement starts');
select ok(pg_temp.wait_base_unit_worker('writer', true), 'movement holds product lock before commit');
select is(extensions.dblink_send_query('base_unit_changer',
  $$select base_unit_concurrency_test.change_base('ba230000-0000-4000-8000-000000000001')$$),
  1, 'unit change starts while movement is pending');
select ok(pg_temp.wait_base_unit_worker('changer'), 'base edit waits for first movement');
select pg_catalog.pg_advisory_unlock(908200000000000001);
select is((select result from extensions.dblink_get_result('base_unit_writer') as response(result text)),
  'ok', 'first movement commits');
select is((select result from extensions.dblink_get_result('base_unit_changer') as response(result text)),
  'error:P0001:PRODUCT_BASE_UNIT_CHANGE_INVENTORY_CONFLICT', 'waiting base edit sees new history and fails');
select is((select unit_of_measure from public.products where id = 'ba230000-0000-4000-8000-000000000001'),
  'Unidad', 'first movement keeps original base unit');
select is((select sum(physical_quantity) from public.inventory_bucket_balances where product_id = 'ba230000-0000-4000-8000-000000000001'),
  2::numeric, 'committed movement keeps its exact quantity');
select * from extensions.dblink_get_result('base_unit_writer') as cleared(result text);
select * from extensions.dblink_get_result('base_unit_changer') as cleared(result text);

-- The base edit wins the row lock; the old receipt snapshot must be rejected.
select pg_catalog.pg_advisory_lock(908200000000000002);
select is(extensions.dblink_send_query('base_unit_changer',
  $$select base_unit_concurrency_test.change_base('ba230000-0000-4000-8000-000000000002', 908200000000000002)$$),
  1, 'first base edit starts');
select ok(pg_temp.wait_base_unit_worker('changer', true), 'base edit holds product lock before commit');
select is(extensions.dblink_send_query('base_unit_writer',
  $$select base_unit_concurrency_test.insert_movement('ba230000-0000-4000-8000-000000000002')$$),
  1, 'obsolete-unit receipt starts while base edit is pending');
select ok(pg_temp.wait_base_unit_worker('writer'), 'receipt waits for base edit');
select pg_catalog.pg_advisory_unlock(908200000000000002);
select is((select result from extensions.dblink_get_result('base_unit_changer') as response(result text)),
  'ok', 'base edit commits before any movement');
select is((select result from extensions.dblink_get_result('base_unit_writer') as response(result text)),
  'error:P0001:INVENTORY_BASE_UNIT_MISMATCH', 'waiting receipt rejects obsolete unit without conversion');
select is((select unit_of_measure from public.products where id = 'ba230000-0000-4000-8000-000000000002'),
  'Caja', 'base-first race retains chosen base');
select is((select count(*) from public.inventory_movements where product_id = 'ba230000-0000-4000-8000-000000000002'),
  0::bigint, 'obsolete-unit receipt leaves no ledger record');
select * from extensions.dblink_get_result('base_unit_writer') as cleared(result text);
select * from extensions.dblink_get_result('base_unit_changer') as cleared(result text);

select extensions.dblink_disconnect('base_unit_writer');
select extensions.dblink_disconnect('base_unit_changer');
begin;
select pg_temp.clear_base_unit_concurrency_fixture();
commit;
do $$ begin
  if not (select was_installed from base_unit_extension_state) then drop extension if exists dblink; end if;
end; $$;
select * from finish();
