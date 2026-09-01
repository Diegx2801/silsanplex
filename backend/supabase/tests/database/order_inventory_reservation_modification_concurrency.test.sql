create temporary table order_inventory_reservation_modification_extension_state (
  was_installed boolean not null
);
insert into order_inventory_reservation_modification_extension_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');

create extension if not exists dblink with schema extensions;

select plan(10);

begin;
insert into public.organizations (id, name, slug)
values ('bd100000-0000-4000-8000-000000000001', 'Concurrencia modificaciones', 'concurrencia-modificaciones');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('bd200000-0000-4000-8000-000000000001', 'modificacion.concurrente.a@test.local', '{"full_name":"Modificacion A"}', now(), now()),
  ('bd200000-0000-4000-8000-000000000002', 'modificacion.concurrente.b@test.local', '{"full_name":"Modificacion B"}', now(), now());
insert into public.organization_memberships (organization_id, user_id) values
  ('bd100000-0000-4000-8000-000000000001', 'bd200000-0000-4000-8000-000000000001'),
  ('bd100000-0000-4000-8000-000000000001', 'bd200000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('bd100000-0000-4000-8000-000000000001', 'bd200000-0000-4000-8000-000000000001', 'ADMIN'),
  ('bd100000-0000-4000-8000-000000000001', 'bd200000-0000-4000-8000-000000000002', 'ADMIN');
insert into public.customers (
  id, organization_id, document_type, document_number, legal_name, created_by, updated_by
) values (
  'bd300000-0000-4000-8000-000000000001', 'bd100000-0000-4000-8000-000000000001',
  'RUC', '20999999992', 'Cliente concurrencia modificaciones',
  'bd200000-0000-4000-8000-000000000001', 'bd200000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure, batch_control,
  expiration_control, created_by, updated_by
) values (
  'bd400000-0000-4000-8000-000000000001', 'bd100000-0000-4000-8000-000000000001',
  'CONC-MOD-001', 'Producto concurrencia modificaciones', 'UND', false, false,
  'bd200000-0000-4000-8000-000000000001', 'bd200000-0000-4000-8000-000000000001'
);
insert into public.warehouses (
  id, organization_id, code, name, is_active, created_by, updated_by
) values (
  'bd500000-0000-4000-8000-000000000001', 'bd100000-0000-4000-8000-000000000001',
  'CONC-MOD', 'Almacen concurrencia modificaciones', true,
  'bd200000-0000-4000-8000-000000000001', 'bd200000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'bd600000-0000-4000-8000-000000000001', 'bd100000-0000-4000-8000-000000000001',
  'bd500000-0000-4000-8000-000000000001', 'GENERAL', 'Ubicacion concurrencia modificaciones',
  'bd200000-0000-4000-8000-000000000001', 'bd200000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bd200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','bd100000-0000-4000-8000-000000000001',
  'product_id','bd400000-0000-4000-8000-000000000001',
  'warehouse_id','bd500000-0000-4000-8000-000000000001',
  'location_id','bd600000-0000-4000-8000-000000000001',
  'movement_type','entrada','quantity',10,'unit_cost',10,
  'stock_status','available','operation_date','2026-09-01','reason','Stock concurrencia modificacion'
));
select public.create_order(jsonb_build_object(
  'organization_id','bd100000-0000-4000-8000-000000000001',
  'operation_key','bd700000-0000-4000-8000-000000000001',
  'customer_id','bd300000-0000-4000-8000-000000000001',
  'warehouse_id','bd500000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('product_id','bd400000-0000-4000-8000-000000000001','quantity',4,'unit_price',10))
));
select public.create_order(jsonb_build_object(
  'organization_id','bd100000-0000-4000-8000-000000000001',
  'operation_key','bd700000-0000-4000-8000-000000000002',
  'customer_id','bd300000-0000-4000-8000-000000000001',
  'warehouse_id','bd500000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('product_id','bd400000-0000-4000-8000-000000000001','quantity',4,'unit_price',10))
));
reset role;
commit;

create schema order_inventory_reservation_modification_concurrency_test;
create function order_inventory_reservation_modification_concurrency_test.update_order_worker(
  requested_gate_key bigint,
  requested_order_id uuid,
  requested_item_id uuid,
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
  updated_order_id uuid;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', requested_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', requested_user_id), true
  );
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  begin
    updated_order_id := public.update_order_quantities(jsonb_build_object(
      'organization_id','bd100000-0000-4000-8000-000000000001',
      'order_id',requested_order_id,
      'operation_key',requested_operation_key,
      'items',jsonb_build_array(jsonb_build_object('order_item_id',requested_item_id,'quantity',requested_quantity))
    ));
    return 'ok:' || updated_order_id::text;
  exception when others then
    return 'error:' || sqlstate || ':' || sqlerrm;
  end;
end;
$$;
revoke all on function order_inventory_reservation_modification_concurrency_test.update_order_worker(bigint, uuid, uuid, uuid, uuid, numeric) from public;

create temporary table order_inventory_reservation_modification_workers (
  worker_name text primary key,
  process_id integer not null
);
create temporary table order_inventory_reservation_modification_results (
  worker_name text primary key,
  result text not null
);

select extensions.dblink_connect(
  'order_modification_worker_a',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'order_modification_worker_b',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);
insert into order_inventory_reservation_modification_workers
select 'a', process_id from extensions.dblink('order_modification_worker_a', 'select pg_backend_pid()') as worker(process_id integer);
insert into order_inventory_reservation_modification_workers
select 'b', process_id from extensions.dblink('order_modification_worker_b', 'select pg_backend_pid()') as worker(process_id integer);

select isnt(
  (select process_id from order_inventory_reservation_modification_workers where worker_name = 'a'),
  (select process_id from order_inventory_reservation_modification_workers where worker_name = 'b'),
  'los incrementos concurrentes usan sesiones distintas'
);

select pg_catalog.pg_advisory_lock(907290100000000003);
select is(
  extensions.dblink_send_query(
    'order_modification_worker_a',
    format($query$select order_inventory_reservation_modification_concurrency_test.update_order_worker(907290100000000003, '%s', '%s', 'bd800000-0000-4000-8000-000000000001', 'bd200000-0000-4000-8000-000000000001', 6)$query$,
      (select id from public.orders where operation_key = 'bd700000-0000-4000-8000-000000000001'),
      (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'bd700000-0000-4000-8000-000000000001'))
    )
  ),
  1,
  'se inicia el incremento concurrente A'
);
select is(
  extensions.dblink_send_query(
    'order_modification_worker_b',
    format($query$select order_inventory_reservation_modification_concurrency_test.update_order_worker(907290100000000003, '%s', '%s', 'bd800000-0000-4000-8000-000000000002', 'bd200000-0000-4000-8000-000000000002', 6)$query$,
      (select id from public.orders where operation_key = 'bd700000-0000-4000-8000-000000000002'),
      (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'bd700000-0000-4000-8000-000000000002'))
    )
  ),
  1,
  'se inicia el incremento concurrente B'
);

do $$
begin
  for attempt in 1..100 loop
    exit when (
      select count(*)
      from pg_catalog.pg_locks lock
      where lock.locktype = 'advisory'
        and not lock.granted
        and lock.pid in (select process_id from order_inventory_reservation_modification_workers)
    ) = 2;
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  (
    select count(*) from pg_catalog.pg_locks lock
    where lock.locktype = 'advisory' and not lock.granted
      and lock.pid in (select process_id from order_inventory_reservation_modification_workers)
  ) = 2,
  'ambos incrementos esperan la barrera antes de competir'
);
select ok(pg_catalog.pg_advisory_unlock(907290100000000003), 'se libera la barrera de incrementos');

insert into order_inventory_reservation_modification_results
select 'a', result from extensions.dblink_get_result('order_modification_worker_a') as response(result text);
insert into order_inventory_reservation_modification_results
select 'b', result from extensions.dblink_get_result('order_modification_worker_b') as response(result text);

select is((select count(*) from order_inventory_reservation_modification_results where result like 'ok:%'), 1::bigint, 'solo un incremento obtiene las dos unidades libres');
select is((select count(*) from order_inventory_reservation_modification_results where result like 'error:P0001:INVENTORY_FEFO_INSUFFICIENT_STOCK%'), 1::bigint, 'el otro incremento falla por disponibilidad');
select is((select sum(quantity - quantity_consumed) from public.inventory_reservations where organization_id = 'bd100000-0000-4000-8000-000000000001' and source_type = 'order-item' and status = 'active'), 10.000::numeric, 'la concurrencia nunca sobrerreserva');
select ok((select sum(physical_quantity) = 10 from public.inventory_bucket_availability where organization_id = 'bd100000-0000-4000-8000-000000000001' and product_id = 'bd400000-0000-4000-8000-000000000001' and warehouse_id = 'bd500000-0000-4000-8000-000000000001'), 'el stock fisico permanece intacto');
select is((select count(*) from public.inventory_movements where organization_id = 'bd100000-0000-4000-8000-000000000001'), 1::bigint, 'los incrementos no generan movimientos');

select extensions.dblink_disconnect('order_modification_worker_a');
select extensions.dblink_disconnect('order_modification_worker_b');

begin;
drop schema if exists order_inventory_reservation_modification_concurrency_test cascade;
delete from public.inventory_reservations where organization_id = 'bd100000-0000-4000-8000-000000000001';
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where organization_id = 'bd100000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.orders where organization_id = 'bd100000-0000-4000-8000-000000000001';
delete from public.warehouse_locations where organization_id = 'bd100000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'bd100000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'bd100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'bd100000-0000-4000-8000-000000000001';
delete from public.customers where organization_id = 'bd100000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'bd100000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'bd100000-0000-4000-8000-000000000001';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'bd100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
delete from public.profiles where id in ('bd200000-0000-4000-8000-000000000001','bd200000-0000-4000-8000-000000000002');
delete from auth.users where id in ('bd200000-0000-4000-8000-000000000001','bd200000-0000-4000-8000-000000000002');
delete from public.organizations where id = 'bd100000-0000-4000-8000-000000000001';
commit;

do $$
begin
  if not (select was_installed from order_inventory_reservation_modification_extension_state) then
    drop extension if exists dblink;
  end if;
end;
$$;

select * from finish();
