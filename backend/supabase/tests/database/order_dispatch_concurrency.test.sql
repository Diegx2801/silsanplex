create temporary table dispatch_concurrency_extension_state (was_installed boolean not null);
insert into dispatch_concurrency_extension_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');
create extension if not exists dblink with schema extensions;

select plan(10);

begin;
drop schema if exists dispatch_concurrency_test cascade;
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where organization_id = 'b4b00000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.inventory_reservations where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.sales where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.orders where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.warehouse_locations where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'b4b00000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'b4b00000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.customers where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'b4b00000-0000-4000-8000-000000000001';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'b4b00000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
delete from public.profiles where id in ('b4c00000-0000-4000-8000-000000000001','b4c00000-0000-4000-8000-000000000002');
delete from auth.users where id in ('b4c00000-0000-4000-8000-000000000001','b4c00000-0000-4000-8000-000000000002');
delete from public.organizations where id = 'b4b00000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug) values
  ('b4b00000-0000-4000-8000-000000000001', 'Despachos concurrentes', 'despachos-concurrentes');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('b4c00000-0000-4000-8000-000000000001', 'despacho.a@test.local', '{"full_name":"Despacho A"}', now(), now()),
  ('b4c00000-0000-4000-8000-000000000002', 'despacho.b@test.local', '{"full_name":"Despacho B"}', now(), now());
insert into public.organization_memberships (organization_id, user_id) values
  ('b4b00000-0000-4000-8000-000000000001', 'b4c00000-0000-4000-8000-000000000001'),
  ('b4b00000-0000-4000-8000-000000000001', 'b4c00000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('b4b00000-0000-4000-8000-000000000001', 'b4c00000-0000-4000-8000-000000000001', 'ADMIN'),
  ('b4b00000-0000-4000-8000-000000000001', 'b4c00000-0000-4000-8000-000000000002', 'ADMIN');
insert into public.customers (id, organization_id, document_type, document_number, legal_name, created_by, updated_by) values
  ('b4d00000-0000-4000-8000-000000000001', 'b4b00000-0000-4000-8000-000000000001', 'RUC', '20222222222', 'Cliente carrera', 'b4c00000-0000-4000-8000-000000000001', 'b4c00000-0000-4000-8000-000000000001');
insert into public.products (id, organization_id, code, description, unit_of_measure, created_by, updated_by) values
  ('b4e00000-0000-4000-8000-000000000001', 'b4b00000-0000-4000-8000-000000000001', 'DSP-CONC', 'Producto despacho concurrente', 'UND', 'b4c00000-0000-4000-8000-000000000001', 'b4c00000-0000-4000-8000-000000000001');
insert into public.warehouses (id, organization_id, code, name, created_by, updated_by) values
  ('b4f00000-0000-4000-8000-000000000001', 'b4b00000-0000-4000-8000-000000000001', 'DC', 'Almacen despacho concurrente', 'b4c00000-0000-4000-8000-000000000001', 'b4c00000-0000-4000-8000-000000000001');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by) values
  ('b4a00000-0000-4000-8000-000000000001', 'b4b00000-0000-4000-8000-000000000001', 'b4f00000-0000-4000-8000-000000000001', 'G', 'General concurrente', 'b4c00000-0000-4000-8000-000000000001', 'b4c00000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4c00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b4b00000-0000-4000-8000-000000000001', 'product_id','b4e00000-0000-4000-8000-000000000001',
  'warehouse_id','b4f00000-0000-4000-8000-000000000001', 'location_id','b4a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',10, 'unit_cost',8, 'stock_status','available', 'lot','C',
  'expiration_date','2099-01-01', 'operation_date','2026-09-01', 'reason','Stock carrera despacho'
));
select public.create_order(jsonb_build_object(
  'organization_id','b4b00000-0000-4000-8000-000000000001', 'operation_key','b4100000-0000-4000-8000-000000000001',
  'customer_id','b4d00000-0000-4000-8000-000000000001', 'warehouse_id','b4f00000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('product_id','b4e00000-0000-4000-8000-000000000001','quantity',10,'unit_price',8))
)) as order_id \gset
select public.create_sale_from_order(
  'b4b00000-0000-4000-8000-000000000001', :'order_id',
  jsonb_build_object('operation_key','b4200000-0000-4000-8000-000000000001','document_type','boleta','series','B001','document_number','1','warehouse','Almacen despacho concurrente')
) as sale_id \gset
commit;

create schema dispatch_concurrency_test;
create function dispatch_concurrency_test.worker(gate bigint, operation uuid, user_id uuid, requested_order uuid, requested_sale uuid, requested_item uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.format('{"sub":"%s","role":"authenticated"}', user_id), true);
  perform pg_catalog.pg_advisory_xact_lock(gate);
  begin
    result_id := public.dispatch_order_from_reservations(jsonb_build_object(
      'organization_id','b4b00000-0000-4000-8000-000000000001', 'order_id',requested_order, 'sale_id',requested_sale,
      'operation_key',operation, 'items',jsonb_build_array(jsonb_build_object('order_item_id',requested_item,'quantity',6))
    ));
    return 'ok:' || result_id::text;
  exception when others then
    return 'error:' || sqlstate || ':' || sqlerrm;
  end;
end;
$$;

create temporary table dispatch_concurrency_workers (worker_name text primary key, process_id integer not null);
create temporary table dispatch_concurrency_results (worker_name text primary key, result text not null);
select extensions.dblink_connect('dispatch_worker_a', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('dispatch_worker_b', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
insert into dispatch_concurrency_workers select 'a', process_id from extensions.dblink('dispatch_worker_a', 'select pg_backend_pid()') as worker(process_id integer);
insert into dispatch_concurrency_workers select 'b', process_id from extensions.dblink('dispatch_worker_b', 'select pg_backend_pid()') as worker(process_id integer);
select isnt((select process_id from dispatch_concurrency_workers where worker_name = 'a'), (select process_id from dispatch_concurrency_workers where worker_name = 'b'), 'los despachos concurrentes usan sesiones distintas');

select pg_catalog.pg_advisory_lock(907290100000000003);
select is(extensions.dblink_send_query('dispatch_worker_a', $$select dispatch_concurrency_test.worker(907290100000000003, 'b4300000-0000-4000-8000-000000000001', 'b4c00000-0000-4000-8000-000000000001', (select id from public.orders where order_number = 'PED-000001'), (select id from public.sales where internal_number = 'VEN-000001'), (select id from public.order_items where order_id = (select id from public.orders where order_number = 'PED-000001')))$$), 1, 'se inicia el despacho A');
select is(extensions.dblink_send_query('dispatch_worker_b', $$select dispatch_concurrency_test.worker(907290100000000003, 'b4300000-0000-4000-8000-000000000002', 'b4c00000-0000-4000-8000-000000000002', (select id from public.orders where order_number = 'PED-000001'), (select id from public.sales where internal_number = 'VEN-000001'), (select id from public.order_items where order_id = (select id from public.orders where order_number = 'PED-000001')))$$), 1, 'se inicia el despacho B');
do $$ begin for attempt in 1..100 loop exit when (select count(*) from pg_catalog.pg_locks lock where lock.locktype = 'advisory' and not lock.granted and lock.pid in (select process_id from dispatch_concurrency_workers)) = 2; perform pg_catalog.pg_sleep(0.02); end loop; end; $$;
select ok((select count(*) from pg_catalog.pg_locks lock where lock.locktype = 'advisory' and not lock.granted and lock.pid in (select process_id from dispatch_concurrency_workers)) = 2, 'ambos despachos esperan la barrera');
select ok(pg_catalog.pg_advisory_unlock(907290100000000003), 'se libera la barrera');
insert into dispatch_concurrency_results select 'a', result from extensions.dblink_get_result('dispatch_worker_a') as response(result text);
insert into dispatch_concurrency_results select 'b', result from extensions.dblink_get_result('dispatch_worker_b') as response(result text);
select is((select count(*) from dispatch_concurrency_results where result like 'ok:%'), 1::bigint, 'solo un despacho consume la reserva concurrente');
select is((select count(*) from dispatch_concurrency_results where result like 'error:P0001:ORDER_DISPATCH_EXCEEDS_RESERVED%'), 1::bigint, 'el segundo despacho excedente falla');
select is((select count(*) from public.inventory_movements where source_type = 'order-dispatch'), 1::bigint, 'la carrera no duplica movimientos');
select is((select sum(quantity - quantity_consumed) from public.inventory_reservations where source_type = 'order-item' and source_id = (select id from public.order_items where order_id = :'order_id')), 4.000::numeric, 'la reserva queda con el saldo pendiente correcto');
select is((select sum(physical_quantity) from public.inventory_bucket_availability where product_id = 'b4e00000-0000-4000-8000-000000000001'), 4.000::numeric, 'el fisico solo se descuenta una vez');

select extensions.dblink_disconnect('dispatch_worker_a');
select extensions.dblink_disconnect('dispatch_worker_b');
begin;
drop schema if exists dispatch_concurrency_test cascade;
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where organization_id = 'b4b00000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.inventory_reservations where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.sales where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.orders where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.warehouse_locations where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'b4b00000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'b4b00000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.customers where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'b4b00000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'b4b00000-0000-4000-8000-000000000001';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'b4b00000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
delete from public.profiles where id in ('b4c00000-0000-4000-8000-000000000001','b4c00000-0000-4000-8000-000000000002');
delete from auth.users where id in ('b4c00000-0000-4000-8000-000000000001','b4c00000-0000-4000-8000-000000000002');
delete from public.organizations where id = 'b4b00000-0000-4000-8000-000000000001';
commit;
do $$ begin if not (select was_installed from dispatch_concurrency_extension_state) then drop extension if exists dblink; end if; end; $$;
select * from finish();
