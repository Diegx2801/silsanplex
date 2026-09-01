create temporary table order_inventory_reservation_extension_state (
  was_installed boolean not null
);
insert into order_inventory_reservation_extension_state
select exists (
  select 1 from pg_catalog.pg_extension where extname = 'dblink'
);

create extension if not exists dblink with schema extensions;

select plan(11);

begin;
drop schema if exists order_inventory_reservation_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events
where organization_id = 'bc100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions
where organization_id = 'bc100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.orders
where organization_id = 'bc100000-0000-4000-8000-000000000001';
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements
where organization_id = 'bc100000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.inventory_reservations
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.warehouse_locations
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.warehouses
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.products
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.customers
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.user_roles
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.organization_memberships
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.profiles
where id in (
  'bc200000-0000-4000-8000-000000000001',
  'bc200000-0000-4000-8000-000000000002'
);
delete from auth.users
where id in (
  'bc200000-0000-4000-8000-000000000001',
  'bc200000-0000-4000-8000-000000000002'
);
delete from public.organizations
where id = 'bc100000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug)
values ('bc100000-0000-4000-8000-000000000001', 'Reservas concurrentes', 'reservas-concurrentes');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('bc200000-0000-4000-8000-000000000001', 'reservas.a@test.local', '{"full_name":"Reserva A"}', now(), now()),
  ('bc200000-0000-4000-8000-000000000002', 'reservas.b@test.local', '{"full_name":"Reserva B"}', now(), now());
insert into public.organization_memberships (organization_id, user_id) values
  ('bc100000-0000-4000-8000-000000000001', 'bc200000-0000-4000-8000-000000000001'),
  ('bc100000-0000-4000-8000-000000000001', 'bc200000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('bc100000-0000-4000-8000-000000000001', 'bc200000-0000-4000-8000-000000000001', 'VENTAS'),
  ('bc100000-0000-4000-8000-000000000001', 'bc200000-0000-4000-8000-000000000001', 'ALMACEN'),
  ('bc100000-0000-4000-8000-000000000001', 'bc200000-0000-4000-8000-000000000002', 'VENTAS');
insert into public.customers (
  id, organization_id, document_type, document_number, legal_name,
  created_by, updated_by
) values (
  'bc300000-0000-4000-8000-000000000001',
  'bc100000-0000-4000-8000-000000000001',
  'RUC', '20999999997', 'Cliente reservas concurrentes',
  'bc200000-0000-4000-8000-000000000001',
  'bc200000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  batch_control, expiration_control, created_by, updated_by
) values (
  'bc400000-0000-4000-8000-000000000001',
  'bc100000-0000-4000-8000-000000000001',
  'CONC-RES-001', 'Producto reservas concurrentes', 'UND', false, false,
  'bc200000-0000-4000-8000-000000000001',
  'bc200000-0000-4000-8000-000000000001'
);
insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
) values (
  'bc500000-0000-4000-8000-000000000001',
  'bc100000-0000-4000-8000-000000000001',
  'CONC', 'Almacen reservas concurrentes',
  'bc200000-0000-4000-8000-000000000001',
  'bc200000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'bc600000-0000-4000-8000-000000000001',
  'bc100000-0000-4000-8000-000000000001',
  'bc500000-0000-4000-8000-000000000001',
  'GENERAL', 'Ubicacion general',
  'bc200000-0000-4000-8000-000000000001',
  'bc200000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bc200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','bc100000-0000-4000-8000-000000000001',
  'product_id','bc400000-0000-4000-8000-000000000001',
  'warehouse_id','bc500000-0000-4000-8000-000000000001',
  'location_id','bc600000-0000-4000-8000-000000000001',
  'movement_type','entrada','quantity',10,'unit_cost',10,
  'stock_status','available','operation_date','2026-09-01','reason','Stock concurrente'
));
reset role;

create schema order_inventory_reservation_concurrency_test;
create function order_inventory_reservation_concurrency_test.create_order_worker(
  requested_gate_key bigint,
  requested_operation_key uuid,
  requested_user_id uuid,
  requested_quantity numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_order_id uuid;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', requested_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', requested_user_id),
    true
  );
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  begin
    created_order_id := public.create_order(jsonb_build_object(
      'organization_id','bc100000-0000-4000-8000-000000000001',
      'operation_key',requested_operation_key,
      'customer_id','bc300000-0000-4000-8000-000000000001',
      'warehouse_id','bc500000-0000-4000-8000-000000000001',
      'items',jsonb_build_array(jsonb_build_object(
        'product_id','bc400000-0000-4000-8000-000000000001',
        'quantity',requested_quantity,'unit_price',10
      ))
    ));
    return 'ok:' || created_order_id::text;
  exception when others then
    return 'error:' || sqlstate || ':' || sqlerrm;
  end;
end;
$$;
commit;

create temporary table order_inventory_reservation_concurrency_workers (
  worker_name text primary key,
  process_id integer not null
);
create temporary table order_inventory_reservation_concurrency_results (
  worker_name text primary key,
  result text not null
);

select extensions.dblink_connect(
  'order_reservation_worker_a',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'order_reservation_worker_b',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);

insert into order_inventory_reservation_concurrency_workers
select 'a', process_id
from extensions.dblink('order_reservation_worker_a', 'select pg_backend_pid()')
  as worker(process_id integer);
insert into order_inventory_reservation_concurrency_workers
select 'b', process_id
from extensions.dblink('order_reservation_worker_b', 'select pg_backend_pid()')
  as worker(process_id integer);

select isnt(
  (select process_id from order_inventory_reservation_concurrency_workers where worker_name = 'a'),
  (select process_id from order_inventory_reservation_concurrency_workers where worker_name = 'b'),
  'las reservas concurrentes se prueban en sesiones distintas'
);

select pg_catalog.pg_advisory_lock(907290100000000002);
select is(
  extensions.dblink_send_query(
    'order_reservation_worker_a',
    $$select order_inventory_reservation_concurrency_test.create_order_worker(907290100000000002, 'bc700000-0000-4000-8000-000000000001', 'bc200000-0000-4000-8000-000000000001', 7)$$
  ),
  1,
  'la reserva A concurrente se inicia'
);
select is(
  extensions.dblink_send_query(
    'order_reservation_worker_b',
    $$select order_inventory_reservation_concurrency_test.create_order_worker(907290100000000002, 'bc700000-0000-4000-8000-000000000002', 'bc200000-0000-4000-8000-000000000002', 6)$$
  ),
  1,
  'la reserva B concurrente se inicia'
);

do $$
begin
  for attempt in 1..100 loop
    exit when (
      select count(*)
      from pg_catalog.pg_locks lock
      where lock.locktype = 'advisory'
        and not lock.granted
        and lock.pid in (select process_id from order_inventory_reservation_concurrency_workers)
    ) = 2;
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;

select ok(
  (
    select count(*)
    from pg_catalog.pg_locks lock
    where lock.locktype = 'advisory'
      and not lock.granted
      and lock.pid in (select process_id from order_inventory_reservation_concurrency_workers)
  ) = 2,
  'ambas reservas esperan la barrera antes de competir por el stock'
);
select ok(pg_catalog.pg_advisory_unlock(907290100000000002), 'se libera la barrera concurrente');

insert into order_inventory_reservation_concurrency_results
select 'a', result
from extensions.dblink_get_result('order_reservation_worker_a') as response(result text);
insert into order_inventory_reservation_concurrency_results
select 'b', result
from extensions.dblink_get_result('order_reservation_worker_b') as response(result text);

select is((select count(*) from order_inventory_reservation_concurrency_results where result like 'ok:%'), 1::bigint, 'solo un pedido consigue las unidades disponibles');
select is((select count(*) from order_inventory_reservation_concurrency_results where result like 'error:P0001:INVENTORY_FEFO_INSUFFICIENT_STOCK%'), 1::bigint, 'el segundo pedido falla por stock insuficiente');
select is((select count(*) from public.orders where organization_id = 'bc100000-0000-4000-8000-000000000001'), 1::bigint, 'la concurrencia no deja dos pedidos sobre el mismo stock');
select ok((select coalesce(sum(quantity - quantity_consumed), 0) from public.inventory_reservations where organization_id = 'bc100000-0000-4000-8000-000000000001' and source_type = 'order-item') between 6 and 7, 'las reservas concurrentes nunca superan el stock asignable');
select ok((select sum(physical_quantity) = 10 and sum(reserved_quantity) between 6 and 7 and sum(assignable_quantity) between 3 and 4 from public.inventory_bucket_availability where organization_id = 'bc100000-0000-4000-8000-000000000001' and product_id = 'bc400000-0000-4000-8000-000000000001' and warehouse_id = 'bc500000-0000-4000-8000-000000000001'), 'el stock fisico no disminuye en la carrera');
select is((select count(*) from public.inventory_movements where organization_id = 'bc100000-0000-4000-8000-000000000001'), 1::bigint, 'la reserva concurrente no genera movimientos');

select extensions.dblink_disconnect('order_reservation_worker_a');
select extensions.dblink_disconnect('order_reservation_worker_b');

begin;
drop schema if exists order_inventory_reservation_concurrency_test cascade;
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements
where organization_id = 'bc100000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.inventory_reservations
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.orders
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.warehouse_locations
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.warehouses
where organization_id = 'bc100000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions
where organization_id = 'bc100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.customers
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.user_roles
where organization_id = 'bc100000-0000-4000-8000-000000000001';
delete from public.organization_memberships
where organization_id = 'bc100000-0000-4000-8000-000000000001';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events
where organization_id = 'bc100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
delete from public.profiles
where id in (
  'bc200000-0000-4000-8000-000000000001',
  'bc200000-0000-4000-8000-000000000002'
);
delete from auth.users
where id in (
  'bc200000-0000-4000-8000-000000000001',
  'bc200000-0000-4000-8000-000000000002'
);
delete from public.organizations
where id = 'bc100000-0000-4000-8000-000000000001';
commit;

do $$
begin
  if not (select was_installed from order_inventory_reservation_extension_state) then
    drop extension if exists dblink;
  end if;
end;
$$;

select * from finish();
