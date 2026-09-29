create temporary table distribution_allocation_extension_state (was_installed boolean not null);
insert into distribution_allocation_extension_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');
create extension if not exists dblink with schema extensions;

select plan(10);

begin;
drop schema if exists distribution_allocation_concurrency_test cascade;
delete from public.distribution_delivery_outcome_lines where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.distribution_delivery_outcomes where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.distribution_delivery_items where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.distribution_command_operations disable trigger distribution_command_operations_immutable;
delete from public.distribution_command_operations where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.distribution_command_operations enable trigger distribution_command_operations_immutable;
delete from public.distribution_deliveries where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.sale_items where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.sales where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.inventory_reservations where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.order_items where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.orders where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.warehouse_locations where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.warehouses where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.customers where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.user_roles where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.organization_memberships where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.audit_events enable trigger audit_events_immutable;
delete from public.profiles where id in (
  'd51c0000-0000-4000-8000-000000000001',
  'd51c0000-0000-4000-8000-000000000002'
);
delete from auth.users where id in (
  'd51c0000-0000-4000-8000-000000000001',
  'd51c0000-0000-4000-8000-000000000002'
);
delete from public.organizations where id = 'd5111111-1111-4111-8111-111111111111';
commit;

begin;
insert into public.organizations (id, name, slug)
values ('d5111111-1111-4111-8111-111111111111', 'Distribucion asignacion concurrente', 'distribucion-asignacion-concurrente');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('d51c0000-0000-4000-8000-000000000001', 'distribution.a@test.local', '{"full_name":"Distribution A"}', now(), now()),
  ('d51c0000-0000-4000-8000-000000000002', 'distribution.b@test.local', '{"full_name":"Distribution B"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values
  ('d5111111-1111-4111-8111-111111111111', 'd51c0000-0000-4000-8000-000000000001'),
  ('d5111111-1111-4111-8111-111111111111', 'd51c0000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code)
values
  ('d5111111-1111-4111-8111-111111111111', 'd51c0000-0000-4000-8000-000000000001', 'ADMIN'),
  ('d5111111-1111-4111-8111-111111111111', 'd51c0000-0000-4000-8000-000000000002', 'ADMIN');
insert into public.customers (id, organization_id, document_type, document_number, legal_name, created_by, updated_by)
values (
  'd51d0000-0000-4000-8000-000000000001',
  'd5111111-1111-4111-8111-111111111111',
  'RUC', '20555555555', 'Cliente concurrencia distribucion',
  'd51c0000-0000-4000-8000-000000000001', 'd51c0000-0000-4000-8000-000000000001'
);
insert into public.products (id, organization_id, code, description, unit_of_measure, tax_affectation, batch_control, created_by, updated_by)
values (
  'd51e0000-0000-4000-8000-000000000001',
  'd5111111-1111-4111-8111-111111111111',
  'DIST-CONC', 'Producto distribucion concurrente', 'UND', 'gravado', false,
  'd51c0000-0000-4000-8000-000000000001', 'd51c0000-0000-4000-8000-000000000001'
);
insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values (
  'd51f0000-0000-4000-8000-000000000001',
  'd5111111-1111-4111-8111-111111111111',
  'DC', 'Almacen concurrencia distribucion',
  'd51c0000-0000-4000-8000-000000000001', 'd51c0000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by)
values (
  'd51a0000-0000-4000-8000-000000000001',
  'd5111111-1111-4111-8111-111111111111',
  'd51f0000-0000-4000-8000-000000000001',
  'GENERAL', 'Ubicacion general concurrencia',
  'd51c0000-0000-4000-8000-000000000001', 'd51c0000-0000-4000-8000-000000000001'
);
insert into public.orders (
  id, organization_id, order_number, customer_id, warehouse_id,
  delivery_address_snapshot, order_date, status, fulfillment_mode,
  fulfillment_status, operation_key, created_by, updated_by
) values (
  'd51b0000-0000-4000-8000-000000000001',
  'd5111111-1111-4111-8111-111111111111', 'PED-000001',
  'd51d0000-0000-4000-8000-000000000001',
  'd51f0000-0000-4000-8000-000000000001',
  '{"address_line":"Av. Concurrencia 100"}'::jsonb,
  '2026-09-29', 'confirmado', 'delivery', 'dispatched',
  'd5100000-0000-4000-8000-000000000001',
  'd51c0000-0000-4000-8000-000000000001', 'd51c0000-0000-4000-8000-000000000001'
);
insert into public.order_items (
  id, organization_id, order_id, product_id, product_code,
  product_description, unit_of_measure, quantity, unit_price
) values (
  'd51b0000-0000-4000-8000-000000000011',
  'd5111111-1111-4111-8111-111111111111',
  'd51b0000-0000-4000-8000-000000000001',
  'd51e0000-0000-4000-8000-000000000001',
  'DIST-CONC', 'Producto distribucion concurrente', 'UND', 100, 10
);
insert into public.sales (
  id, organization_id, order_id, customer_id, internal_number,
  document_type, series, document_number, sale_date, warehouse,
  status, operation_key, created_by, updated_by
) values (
  'd51b0000-0000-4000-8000-000000000021',
  'd5111111-1111-4111-8111-111111111111',
  'd51b0000-0000-4000-8000-000000000001',
  'd51d0000-0000-4000-8000-000000000001',
  'VEN-000001', 'boleta', 'B001', '1', '2026-09-29',
  'Almacen concurrencia distribucion', 'despachada',
  'd5100000-0000-4000-8000-000000000002',
  'd51c0000-0000-4000-8000-000000000001', 'd51c0000-0000-4000-8000-000000000001'
);
insert into public.sale_items (
  id, organization_id, sale_id, order_id, order_item_id, product_id,
  product_code, product_description, unit_of_measure, quantity, unit_price
) values (
  'd51b0000-0000-4000-8000-000000000031',
  'd5111111-1111-4111-8111-111111111111',
  'd51b0000-0000-4000-8000-000000000021',
  'd51b0000-0000-4000-8000-000000000001',
  'd51b0000-0000-4000-8000-000000000011',
  'd51e0000-0000-4000-8000-000000000001',
  'DIST-CONC', 'Producto distribucion concurrente', 'UND', 100, 10
);
insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status,
  quantity, quantity_consumed, status, source_type, source_id,
  created_by, updated_by
) values (
  'd51b0000-0000-4000-8000-000000000041',
  'd5111111-1111-4111-8111-111111111111',
  'd51e0000-0000-4000-8000-000000000001',
  'd51f0000-0000-4000-8000-000000000001',
  'd51a0000-0000-4000-8000-000000000001',
  'available', 100, 100, 'consumed', 'order-item',
  'd51b0000-0000-4000-8000-000000000011',
  'd51c0000-0000-4000-8000-000000000001', 'd51c0000-0000-4000-8000-000000000001'
);
commit;

create schema distribution_allocation_concurrency_test;
create function distribution_allocation_concurrency_test.worker(
  gate bigint,
  operation uuid,
  user_id uuid,
  requested_direction text,
  requested_guide text,
  requested_dispatch text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id uuid;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', user_id),
    true
  );
  perform pg_catalog.pg_advisory_xact_lock(gate);
  begin
    result_id := public.save_distribution_delivery(jsonb_build_object(
      'organization_id', 'd5111111-1111-4111-8111-111111111111',
      'order_id', 'd51b0000-0000-4000-8000-000000000001',
      'sale_id', 'd51b0000-0000-4000-8000-000000000021',
      'order_number', 'PED-000001',
      'customer_name', 'Cliente concurrencia distribucion',
      'issue_date', '2026-09-29',
      'delivery_date', '2026-09-29',
      'guide_number', requested_guide,
      'transport_type', 'interno',
      'delivery_status', 'programado',
      'direction', requested_direction,
      'numero_despacho', requested_dispatch,
      'items', jsonb_build_array(jsonb_build_object(
        'id', 'd51b0000-0000-4000-8000-000000000011',
        'cantidad', 70
      )),
      'operation_key', operation
    ));
    return 'ok:' || result_id::text;
  exception when others then
    return 'error:' || sqlstate || ':' || sqlerrm;
  end;
end;
$$;

create temporary table distribution_allocation_workers (
  worker_name text primary key,
  process_id integer not null
);
create temporary table distribution_allocation_results (
  worker_name text primary key,
  result text not null
);
select extensions.dblink_connect('distribution_allocation_worker_a', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('distribution_allocation_worker_b', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
insert into distribution_allocation_workers
select 'a', process_id from extensions.dblink('distribution_allocation_worker_a', 'select pg_backend_pid()') as worker(process_id integer);
insert into distribution_allocation_workers
select 'b', process_id from extensions.dblink('distribution_allocation_worker_b', 'select pg_backend_pid()') as worker(process_id integer);
select isnt(
  (select process_id from distribution_allocation_workers where worker_name = 'a'),
  (select process_id from distribution_allocation_workers where worker_name = 'b'),
  'los asignadores concurrentes usan sesiones distintas'
);

select pg_catalog.pg_advisory_lock(907290300000000001);
select is(extensions.dblink_send_query(
  'distribution_allocation_worker_a',
  $$select distribution_allocation_concurrency_test.worker(
    907290300000000001,
    'd5300000-0000-4000-8000-000000000001',
    'd51c0000-0000-4000-8000-000000000001',
    'Av. Concurrente A', 'G-CONC-A', 'DES-CONC-A'
  )$$
), 1, 'se inicia la asignacion concurrente A');
select is(extensions.dblink_send_query(
  'distribution_allocation_worker_b',
  $$select distribution_allocation_concurrency_test.worker(
    907290300000000001,
    'd5300000-0000-4000-8000-000000000002',
    'd51c0000-0000-4000-8000-000000000002',
    'Av. Concurrente B', 'G-CONC-B', 'DES-CONC-B'
  )$$
), 1, 'se inicia la asignacion concurrente B');
do $$
begin
  for attempt in 1..100 loop
    exit when (
      select count(*)
      from pg_catalog.pg_locks lock_row
      where lock_row.locktype = 'advisory'
        and not lock_row.granted
        and lock_row.pid in (select process_id from distribution_allocation_workers)
    ) = 2;
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok((select count(*) from pg_catalog.pg_locks lock_row where lock_row.locktype = 'advisory' and not lock_row.granted and lock_row.pid in (select process_id from distribution_allocation_workers)) = 2, 'ambas asignaciones esperan la barrera');
select ok(pg_catalog.pg_advisory_unlock(907290300000000001), 'se libera la barrera de asignacion');
insert into distribution_allocation_results
select 'a', result from extensions.dblink_get_result('distribution_allocation_worker_a') as response(result text);
insert into distribution_allocation_results
select 'b', result from extensions.dblink_get_result('distribution_allocation_worker_b') as response(result text);
select is((select count(*) from distribution_allocation_results where result like 'ok:%'), 1::bigint, 'solo una asignacion de 70 gana la carrera');
select is((select count(*) from distribution_allocation_results where result like 'error:P0001:DISTRIBUTION_ALLOCATION_EXCEEDS_DISPATCHED%'), 1::bigint, 'la segunda asignacion de 70 respeta el saldo disponible de 30');
select is((select count(*) from public.distribution_deliveries where organization_id = 'd5111111-1111-4111-8111-111111111111'), 1::bigint, 'la carrera no persiste dos entregas');
select is((select sum(quantity) from public.distribution_delivery_items where organization_id = 'd5111111-1111-4111-8111-111111111111'), 70::numeric, 'la carrera persiste como maximo 70 unidades asignadas');
select ok((select direction in ('Av. Concurrente A', 'Av. Concurrente B') from public.distribution_deliveries where organization_id = 'd5111111-1111-4111-8111-111111111111'), 'la entrega ganadora conserva su snapshot de destino');

select extensions.dblink_disconnect('distribution_allocation_worker_a');
select extensions.dblink_disconnect('distribution_allocation_worker_b');
drop schema distribution_allocation_concurrency_test cascade;

begin;
delete from public.distribution_delivery_items where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.distribution_command_operations disable trigger distribution_command_operations_immutable;
delete from public.distribution_command_operations where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.distribution_command_operations enable trigger distribution_command_operations_immutable;
delete from public.distribution_deliveries where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.sale_items where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.sales where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.inventory_reservations where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.order_items where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.orders where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.warehouse_locations where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.warehouses where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.customers where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.user_roles where organization_id = 'd5111111-1111-4111-8111-111111111111';
delete from public.organization_memberships where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'd5111111-1111-4111-8111-111111111111';
alter table public.audit_events enable trigger audit_events_immutable;
delete from public.profiles where id in ('d51c0000-0000-4000-8000-000000000001', 'd51c0000-0000-4000-8000-000000000002');
delete from auth.users where id in ('d51c0000-0000-4000-8000-000000000001', 'd51c0000-0000-4000-8000-000000000002');
delete from public.organizations where id = 'd5111111-1111-4111-8111-111111111111';
commit;

do $$
begin
  if not (select was_installed from distribution_allocation_extension_state) then
    drop extension if exists dblink;
  end if;
end;
$$;

select * from finish();
