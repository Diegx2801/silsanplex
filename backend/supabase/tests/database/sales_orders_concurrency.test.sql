create temporary table sales_orders_concurrency_extension_state (
  was_installed boolean not null
);
insert into sales_orders_concurrency_extension_state
select exists (
  select 1 from pg_catalog.pg_extension where extname = 'dblink'
);

create extension if not exists dblink with schema extensions;

select plan(10);

-- La configuracion se confirma para que las sesiones dblink puedan observarla.
begin;
drop schema if exists sales_orders_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events
where organization_id = 'ca100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions
where organization_id = 'ca100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.orders
where organization_id = 'ca100000-0000-4000-8000-000000000001';
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements
where organization_id = 'ca100000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.inventory_reservations
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.warehouse_locations
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.warehouses
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.products
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.customers
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.user_roles
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.organization_memberships
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.profiles
where id = 'ca200000-0000-4000-8000-000000000001';
delete from auth.users
where id = 'ca200000-0000-4000-8000-000000000001';
delete from public.organizations
where id = 'ca100000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug)
values (
  'ca100000-0000-4000-8000-000000000001',
  'Pedidos concurrentes',
  'pedidos-concurrentes'
);
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'ca200000-0000-4000-8000-000000000001',
  'pedidos.concurrentes@test.local',
  '{"full_name":"Pedidos concurrentes"}',
  now(),
  now()
);
insert into public.organization_memberships (organization_id, user_id)
values (
  'ca100000-0000-4000-8000-000000000001',
  'ca200000-0000-4000-8000-000000000001'
);
insert into public.user_roles (organization_id, user_id, role_code)
values (
  'ca100000-0000-4000-8000-000000000001',
  'ca200000-0000-4000-8000-000000000001',
  'VENTAS'
), (
  'ca100000-0000-4000-8000-000000000001',
  'ca200000-0000-4000-8000-000000000001',
  'ALMACEN'
);
insert into public.customers (
  id, organization_id, document_type, document_number, legal_name,
  created_by, updated_by
)
values (
  'ca300000-0000-4000-8000-000000000001',
  'ca100000-0000-4000-8000-000000000001',
  'RUC', '20999999993', 'Cliente pedidos concurrentes',
  'ca200000-0000-4000-8000-000000000001',
  'ca200000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  tax_affectation, batch_control, created_by, updated_by
)
values (
  'ca400000-0000-4000-8000-000000000001',
  'ca100000-0000-4000-8000-000000000001',
  'CONC-ORDER-001', 'Producto pedidos concurrentes', 'UND', 'gravado', false,
  'ca200000-0000-4000-8000-000000000001',
  'ca200000-0000-4000-8000-000000000001'
);
insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
)
values (
  'ca500000-0000-4000-8000-000000000001',
  'ca100000-0000-4000-8000-000000000001',
  'CONC',
  'Almacen pedidos concurrentes',
  'ca200000-0000-4000-8000-000000000001',
  'ca200000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values (
  'ca600000-0000-4000-8000-000000000001',
  'ca100000-0000-4000-8000-000000000001',
  'ca500000-0000-4000-8000-000000000001',
  'GENERAL',
  'Ubicacion general',
  'ca200000-0000-4000-8000-000000000001',
  'ca200000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"ca200000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','ca100000-0000-4000-8000-000000000001',
  'product_id','ca400000-0000-4000-8000-000000000001',
  'warehouse_id','ca500000-0000-4000-8000-000000000001',
  'location_id','ca600000-0000-4000-8000-000000000001',
  'movement_type','entrada','quantity',10,'unit_cost',10,
  'stock_status','available','operation_date','2026-09-01','reason','Stock para concurrencia'
));
reset role;

create schema sales_orders_concurrency_test;
create function sales_orders_concurrency_test.create_order_worker(
  requested_gate_key bigint,
  requested_operation_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    'ca200000-0000-4000-8000-000000000001',
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"ca200000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  return public.create_order(jsonb_build_object(
    'organization_id', 'ca100000-0000-4000-8000-000000000001',
    'operation_key', requested_operation_key,
    'customer_id', 'ca300000-0000-4000-8000-000000000001',
    'warehouse_id', 'ca500000-0000-4000-8000-000000000001',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', 'ca400000-0000-4000-8000-000000000001',
      'quantity', 1,
      'unit_price', 10
    ))
  ));
end;
$$;
commit;

create temporary table sales_orders_concurrency_workers (
  worker_name text primary key,
  process_id integer not null
);
create temporary table sales_orders_concurrency_results (
  worker_name text primary key,
  order_id uuid
);

select extensions.dblink_connect(
  'sales_order_worker_a',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'sales_order_worker_b',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);

insert into sales_orders_concurrency_workers
select 'a', process_id
from extensions.dblink('sales_order_worker_a', 'select pg_backend_pid()')
  as worker(process_id integer);
insert into sales_orders_concurrency_workers
select 'b', process_id
from extensions.dblink('sales_order_worker_b', 'select pg_backend_pid()')
  as worker(process_id integer);

select isnt(
  (select process_id from sales_orders_concurrency_workers where worker_name = 'a'),
  (select process_id from sales_orders_concurrency_workers where worker_name = 'b'),
  'la numeracion se prueba en dos sesiones PostgreSQL distintas'
);

select pg_catalog.pg_advisory_lock(907290100000000001);
select is(
  extensions.dblink_send_query(
    'sales_order_worker_a',
    $$select sales_orders_concurrency_test.create_order_worker(907290100000000001, 'da500000-0000-4000-8000-000000000001')$$
  ),
  1,
  'la primera creacion concurrente se inicia'
);
select is(
  extensions.dblink_send_query(
    'sales_order_worker_b',
    $$select sales_orders_concurrency_test.create_order_worker(907290100000000001, 'da500000-0000-4000-8000-000000000002')$$
  ),
  1,
  'la segunda creacion concurrente se inicia'
);

do $$
begin
  for attempt in 1..100 loop
    exit when (
      select count(*)
      from pg_catalog.pg_locks lock
      where lock.locktype = 'advisory'
        and not lock.granted
        and lock.pid in (
          select process_id from sales_orders_concurrency_workers
        )
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
      and lock.pid in (select process_id from sales_orders_concurrency_workers)
  ) = 2,
  'las dos operaciones permanecen bloqueadas antes de entrar a la seccion critica'
);
select ok(
  pg_catalog.pg_advisory_unlock(907290100000000001),
  'la barrera concurrente se libera'
);

insert into sales_orders_concurrency_results
select 'a', order_id
from extensions.dblink_get_result('sales_order_worker_a')
  as result(order_id uuid);
insert into sales_orders_concurrency_results
select 'b', order_id
from extensions.dblink_get_result('sales_order_worker_b')
  as result(order_id uuid);

select ok(
  (select count(*) from sales_orders_concurrency_results where order_id is not null) = 2,
  'ambas creaciones finalizan correctamente'
);
select is(
  (select count(*) from public.orders where organization_id = 'ca100000-0000-4000-8000-000000000001'),
  2::bigint,
  'dos sesiones generan exactamente dos pedidos'
);
select is(
  (select count(distinct order_number) from public.orders where organization_id = 'ca100000-0000-4000-8000-000000000001'),
  2::bigint,
  'la numeracion concurrente no colisiona'
);
select results_eq(
  $$select order_number from public.orders where organization_id = 'ca100000-0000-4000-8000-000000000001' order by order_number$$,
  $$values ('PED-000001'::text), ('PED-000002'::text)$$,
  'la numeracion concurrente conserva el correlativo esperado'
);
select is(
  (select count(*) from public.order_items where organization_id = 'ca100000-0000-4000-8000-000000000001'),
  2::bigint,
  'cada pedido concurrente conserva sus lineas'
);

select extensions.dblink_disconnect('sales_order_worker_a');
select extensions.dblink_disconnect('sales_order_worker_b');

begin;
drop schema if exists sales_orders_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events
where organization_id = 'ca100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions
where organization_id = 'ca100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.orders
where organization_id = 'ca100000-0000-4000-8000-000000000001';
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements
where organization_id = 'ca100000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.inventory_reservations
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.warehouse_locations
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.warehouses
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.products
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.customers
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.user_roles
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.organization_memberships
where organization_id = 'ca100000-0000-4000-8000-000000000001';
delete from public.profiles
where id = 'ca200000-0000-4000-8000-000000000001';
delete from auth.users
where id = 'ca200000-0000-4000-8000-000000000001';
delete from public.organizations
where id = 'ca100000-0000-4000-8000-000000000001';
commit;

do $$
begin
  if not (select was_installed from sales_orders_concurrency_extension_state) then
    drop extension if exists dblink;
  end if;
end;
$$;

select * from finish();
