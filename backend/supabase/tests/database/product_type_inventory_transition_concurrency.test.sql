create temporary table product_type_transition_extension_state (
  was_installed boolean not null
);
insert into product_type_transition_extension_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');

create extension if not exists dblink with schema extensions;

select plan(19);

begin;
drop schema if exists product_type_transition_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events
where organization_id = 'e1100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements
where organization_id = 'e1100000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.inventory_reservations
where organization_id = 'e1100000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions
where organization_id = 'e1100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.warehouse_locations
where organization_id = 'e1100000-0000-4000-8000-000000000001';
delete from public.warehouses
where organization_id = 'e1100000-0000-4000-8000-000000000001';
delete from public.products
where organization_id = 'e1100000-0000-4000-8000-000000000001';
delete from public.organizations
where id = 'e1100000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug)
values ('e1100000-0000-4000-8000-000000000001', 'Concurrencia tipo producto', 'concurrencia-tipo-producto');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control
) values
  ('e1300000-0000-4000-8000-000000000001', 'e1100000-0000-4000-8000-000000000001', 'CONC-STOCK', 'Entrada concurrente', 'UND', 'good', 'gravado', false, false),
  ('e1300000-0000-4000-8000-000000000002', 'e1100000-0000-4000-8000-000000000001', 'CONC-RES', 'Reserva concurrente', 'UND', 'good', 'gravado', false, false);

insert into public.warehouses (id, organization_id, code, name)
values ('e1400000-0000-4000-8000-000000000001', 'e1100000-0000-4000-8000-000000000001', 'CENTRAL', 'Almacén concurrencia');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name)
values (
  'e1500000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000001', 'A-01', 'Ubicación concurrencia'
);

insert into public.inventory_movements (
  organization_id, product_id, product_code, product_description,
  unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
  location_id, stock_status, unit_cost, operation_date, reason, source_type
) values (
  'e1100000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000002',
  'CONC-RES', 'Reserva concurrente', 'UND', 'entrada', 5,
  'Almacén concurrencia', 'e1400000-0000-4000-8000-000000000001',
  'e1500000-0000-4000-8000-000000000001', 'available', 10,
  current_date, 'Stock para reserva concurrente', 'manual'
);

create schema product_type_transition_concurrency_test;

create function product_type_transition_concurrency_test.insert_stock_and_wait(
  requested_product_id uuid,
  requested_gate_key bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description,
    unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
    location_id, stock_status, unit_cost, operation_date, reason, source_type
  ) values (
    'e1100000-0000-4000-8000-000000000001', requested_product_id,
    'CONC-STOCK', 'Entrada concurrente', 'UND', 'entrada', 1,
    'Almacén concurrencia', 'e1400000-0000-4000-8000-000000000001',
    'e1500000-0000-4000-8000-000000000001', 'available', 10,
    current_date, 'Entrada concurrente', 'manual'
  );
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  return 'ok';
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function product_type_transition_concurrency_test.insert_reservation_and_wait(
  requested_product_id uuid,
  requested_gate_key bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_reservations (
    organization_id, product_id, warehouse_id, location_id, stock_status,
    quantity, source_type, source_id
  ) values (
    'e1100000-0000-4000-8000-000000000001', requested_product_id,
    'e1400000-0000-4000-8000-000000000001',
    'e1500000-0000-4000-8000-000000000001',
    'available', 1, 'transition-concurrency', gen_random_uuid()
  );
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  return 'ok';
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function product_type_transition_concurrency_test.change_to_service(
  requested_product_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
  set product_type = 'service'
  where organization_id = 'e1100000-0000-4000-8000-000000000001'
    and id = requested_product_id;
  return 'ok';
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;
commit;

select extensions.dblink_connect('product_transition_writer', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('product_transition_changer', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');

create temporary table product_type_transition_workers (
  worker_name text primary key,
  process_id integer not null
);
insert into product_type_transition_workers
select 'writer', process_id
from extensions.dblink('product_transition_writer', 'select pg_backend_pid()') as worker(process_id integer);
insert into product_type_transition_workers
select 'changer', process_id
from extensions.dblink('product_transition_changer', 'select pg_backend_pid()') as worker(process_id integer);

select isnt(
  (select process_id from product_type_transition_workers where worker_name = 'writer'),
  (select process_id from product_type_transition_workers where worker_name = 'changer'),
  'las carreras usan sesiones independientes'
);

select pg_catalog.pg_advisory_lock(908100000000000001);
select is(
  extensions.dblink_send_query(
    'product_transition_writer',
    $$select product_type_transition_concurrency_test.insert_stock_and_wait('e1300000-0000-4000-8000-000000000001', 908100000000000001)$$
  ), 1, 'se inicia la entrada concurrente'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from product_type_transition_workers where worker_name = 'writer')
        and lock.locktype = 'advisory' and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from product_type_transition_workers where worker_name = 'writer')
      and lock.locktype = 'advisory' and not lock.granted
  ), 'la entrada conserva abierto su bloqueo de producto'
);
select is(
  extensions.dblink_send_query(
    'product_transition_changer',
    $$select product_type_transition_concurrency_test.change_to_service('e1300000-0000-4000-8000-000000000001')$$
  ), 1, 'se inicia el cambio de tipo concurrente con la entrada'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from product_type_transition_workers where worker_name = 'changer')
        and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from product_type_transition_workers where worker_name = 'changer')
      and not lock.granted
  ), 'el cambio espera la entrada en vez de comprobar un estado obsoleto'
);
select ok(pg_catalog.pg_advisory_unlock(908100000000000001), 'se libera la entrada concurrente');
select is(
  (select result from extensions.dblink_get_result('product_transition_writer') as response(result text)),
  'ok', 'la entrada concurrente confirma primero'
);
select ok(
  (select result from extensions.dblink_get_result('product_transition_changer') as response(result text))
    like 'error:P0001:PRODUCT_TYPE_CHANGE_INVENTORY_CONFLICT%',
  'el cambio concurrente se rechaza al observar el stock confirmado'
);
select is((select product_type from public.products where id = 'e1300000-0000-4000-8000-000000000001'), 'good', 'la carrera con entrada conserva el tipo good');
select is(
  (select sum(physical_quantity) from public.inventory_bucket_balances where product_id = 'e1300000-0000-4000-8000-000000000001'),
  1::numeric, 'la entrada concurrente permanece visible'
);
select * from extensions.dblink_get_result('product_transition_writer') as cleared(result text);
select * from extensions.dblink_get_result('product_transition_changer') as cleared(result text);

select pg_catalog.pg_advisory_lock(908100000000000002);
select is(
  extensions.dblink_send_query(
    'product_transition_writer',
    $$select product_type_transition_concurrency_test.insert_reservation_and_wait('e1300000-0000-4000-8000-000000000002', 908100000000000002)$$
  ), 1, 'se inicia la reserva concurrente'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from product_type_transition_workers where worker_name = 'writer')
        and lock.locktype = 'advisory' and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from product_type_transition_workers where worker_name = 'writer')
      and lock.locktype = 'advisory' and not lock.granted
  ), 'la reserva conserva abierto su bloqueo de producto'
);
select is(
  extensions.dblink_send_query(
    'product_transition_changer',
    $$select product_type_transition_concurrency_test.change_to_service('e1300000-0000-4000-8000-000000000002')$$
  ), 1, 'se inicia el cambio de tipo concurrente con la reserva'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from product_type_transition_workers where worker_name = 'changer')
        and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from product_type_transition_workers where worker_name = 'changer')
      and not lock.granted
  ), 'el cambio espera la reserva en vez de comprobar un estado obsoleto'
);
select ok(pg_catalog.pg_advisory_unlock(908100000000000002), 'se libera la reserva concurrente');
select is(
  (select result from extensions.dblink_get_result('product_transition_writer') as response(result text)),
  'ok', 'la reserva concurrente confirma primero'
);
select ok(
  (select result from extensions.dblink_get_result('product_transition_changer') as response(result text))
    like 'error:P0001:PRODUCT_TYPE_CHANGE_INVENTORY_CONFLICT%',
  'el cambio concurrente se rechaza al observar la reserva confirmada'
);
select is((select product_type from public.products where id = 'e1300000-0000-4000-8000-000000000002'), 'good', 'la carrera con reserva conserva el tipo good');
select is(
  (select sum(quantity - quantity_consumed) from public.inventory_reservations where product_id = 'e1300000-0000-4000-8000-000000000002' and status = 'active'),
  1::numeric, 'la reserva concurrente permanece activa'
);
select * from extensions.dblink_get_result('product_transition_writer') as cleared(result text);
select * from extensions.dblink_get_result('product_transition_changer') as cleared(result text);

select extensions.dblink_disconnect('product_transition_writer');
select extensions.dblink_disconnect('product_transition_changer');

begin;
drop schema if exists product_type_transition_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'e1100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where organization_id = 'e1100000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.inventory_reservations where organization_id = 'e1100000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'e1100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.warehouse_locations where organization_id = 'e1100000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'e1100000-0000-4000-8000-000000000001';
delete from public.products where organization_id = 'e1100000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'e1100000-0000-4000-8000-000000000001';
commit;

do $$
begin
  if not (select was_installed from product_type_transition_extension_state) then
    drop extension if exists dblink;
  end if;
end;
$$;

select * from finish();
