create temporary table inventory_concurrency_extension_state (
  was_installed boolean not null
);
insert into inventory_concurrency_extension_state
select exists (
  select 1 from pg_catalog.pg_extension where extname = 'dblink'
);

create extension if not exists dblink with schema extensions;

select plan(10);

-- Recupera una ejecucion interrumpida anterior. El DDL queda protegido por la
-- transaccion para no dejar deshabilitada la inmutabilidad de movimientos.
begin;
drop schema if exists inventory_concurrency_test cascade;
delete from public.audit_events
where organization_id = 'c1000000-0000-4000-8000-000000000001';
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements
where organization_id = 'c1000000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions
where organization_id = 'c1000000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.warehouse_locations
where organization_id = 'c1000000-0000-4000-8000-000000000001';
delete from public.warehouses
where organization_id = 'c1000000-0000-4000-8000-000000000001';
delete from public.products
where organization_id = 'c1000000-0000-4000-8000-000000000001';
delete from public.user_roles
where organization_id = 'c1000000-0000-4000-8000-000000000001';
delete from public.organization_memberships
where organization_id = 'c1000000-0000-4000-8000-000000000001';
delete from public.profiles
where id = 'c2000000-0000-4000-8000-000000000001';
delete from auth.users
where id = 'c2000000-0000-4000-8000-000000000001';
delete from public.organizations
where id = 'c1000000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug)
values (
  'c1000000-0000-4000-8000-000000000001',
  'Concurrencia inventario',
  'concurrencia-inventario'
);

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'c2000000-0000-4000-8000-000000000001',
  'concurrencia.inventario@test.local',
  '{"full_name":"Concurrencia Inventario"}',
  now(),
  now()
);

insert into public.organization_memberships (organization_id, user_id)
values (
  'c1000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001'
);

insert into public.user_roles (organization_id, user_id, role_code)
values (
  'c1000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'ALMACEN'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  batch_control, expiration_control
)
values (
  'c3000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'CONC-001',
  'Producto para concurrencia',
  'UND',
  false,
  false
);

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
)
values (
  'c4000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'CONC',
  'Almacen concurrencia',
  'c2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001'
);

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values (
  'c5000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'CONC-01',
  'Ubicacion concurrencia',
  'c2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001'
);

insert into public.inventory_movements (
  organization_id, product_id, product_code, product_description,
  unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
  location_id, stock_status, unit_cost, lot, expiration_date,
  operation_date, reason, source_type, created_by
)
values (
  'c1000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'CONC-001',
  'Producto para concurrencia',
  'UND',
  'entrada',
  1,
  'Almacen concurrencia',
  'c4000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001',
  'available',
  10,
  'LOTE-CONC',
  '2030-01-31',
  current_date,
  'Entrada para prueba concurrente',
  'manual',
  'c2000000-0000-4000-8000-000000000001'
);

create schema inventory_concurrency_test;

create function inventory_concurrency_test.record_outbound_and_wait(
  requested_gate_key bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  movement_id uuid;
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    'c2000000-0000-4000-8000-000000000001',
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );

  movement_id := public.record_inventory_movement(
    jsonb_build_object(
      'organization_id', 'c1000000-0000-4000-8000-000000000001',
      'product_id', 'c3000000-0000-4000-8000-000000000001',
      'warehouse_id', 'c4000000-0000-4000-8000-000000000001',
      'location_id', 'c5000000-0000-4000-8000-000000000001',
      'movement_type', 'salida',
      'quantity', 1,
      'stock_status', 'available',
      'lot', 'LOTE-CONC',
      'expiration_date', '2030-01-31',
      'operation_date', current_date,
      'reason', 'Primera salida concurrente'
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  return movement_id;
end;
$$;

create function inventory_concurrency_test.direct_outbound()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  movement_id uuid;
begin
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description,
    unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
    location_id, stock_status, unit_cost, lot, expiration_date,
    operation_date, reason, source_type, created_by
  )
  values (
    'c1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'CONC-001',
    'Producto para concurrencia',
    'UND',
    'salida',
    1,
    'Almacen concurrencia',
    'c4000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001',
    'available',
    10,
    'LOTE-CONC',
    '2030-01-31',
    current_date,
    'Segunda salida concurrente',
    'manual',
    'c2000000-0000-4000-8000-000000000001'
  )
  returning id into movement_id;

  return movement_id;
end;
$$;
commit;

create temporary table inventory_concurrency_workers (
  worker_name text primary key,
  process_id integer not null
);
create temporary table inventory_concurrency_results (
  worker_name text primary key,
  movement_id uuid
);

select extensions.dblink_connect(
  'inventory_worker_a',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'inventory_worker_b',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);

insert into inventory_concurrency_workers
select 'a', process_id
from extensions.dblink('inventory_worker_a', 'select pg_backend_pid()')
  as worker(process_id integer);
insert into inventory_concurrency_workers
select 'b', process_id
from extensions.dblink('inventory_worker_b', 'select pg_backend_pid()')
  as worker(process_id integer);

select isnt(
  (select process_id from inventory_concurrency_workers where worker_name = 'a'),
  (select process_id from inventory_concurrency_workers where worker_name = 'b'),
  'la prueba utiliza dos sesiones PostgreSQL diferentes'
);

select pg_catalog.pg_advisory_lock(907270100000000001);

select is(
  extensions.dblink_send_query(
    'inventory_worker_a',
    'select inventory_concurrency_test.record_outbound_and_wait(907270100000000001)'
  ),
  1,
  'la primera salida se inicia de forma asincrona'
);

do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1
      from pg_catalog.pg_locks lock
      where lock.pid = (
        select process_id
        from inventory_concurrency_workers
        where worker_name = 'a'
      )
        and lock.locktype = 'advisory'
        and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;

select ok(
  exists (
    select 1
    from pg_catalog.pg_locks lock
    where lock.pid = (
      select process_id
      from inventory_concurrency_workers
      where worker_name = 'a'
    )
      and lock.locktype = 'advisory'
      and not lock.granted
  ),
  'la primera salida conserva el lock del bucket antes de confirmar'
);

select is(
  extensions.dblink_send_query(
    'inventory_worker_b',
    'select inventory_concurrency_test.direct_outbound()'
  ),
  1,
  'la segunda salida se inicia mientras la primera sigue abierta'
);

do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1
      from pg_catalog.pg_locks lock
      where lock.pid = (
        select process_id
        from inventory_concurrency_workers
        where worker_name = 'b'
      )
        and lock.locktype = 'advisory'
        and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;

select ok(
  exists (
    select 1
    from pg_catalog.pg_locks lock
    where lock.pid = (
      select process_id
      from inventory_concurrency_workers
      where worker_name = 'b'
    )
      and lock.locktype = 'advisory'
      and not lock.granted
  ),
  'la segunda salida espera el mismo lock canonico del bucket'
);

select ok(
  pg_catalog.pg_advisory_unlock(907270100000000001),
  'la barrera de confirmacion se libera de forma controlada'
);

insert into inventory_concurrency_results
select 'a', movement_id
from extensions.dblink_get_result('inventory_worker_a')
  as result(movement_id uuid);

select ok(
  (select movement_id from inventory_concurrency_results where worker_name = 'a') is not null,
  'la primera salida confirma correctamente'
);

insert into inventory_concurrency_results
select 'b', movement_id
from extensions.dblink_get_result('inventory_worker_b', false)
  as result(movement_id uuid);

select ok(
  extensions.dblink_error_message('inventory_worker_b') like '%INVENTORY_INSUFFICIENT_STOCK%',
  'la segunda salida relee el saldo confirmado y falla por stock insuficiente'
);

select is(
  public.inventory_bucket_quantity(
    'c1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001',
    'available',
    'LOTE-CONC',
    '2030-01-31'
  ),
  0::numeric,
  'el saldo final del bucket no es negativo'
);

select is(
  (
    select count(*)
    from public.inventory_movements movement
    where movement.organization_id = 'c1000000-0000-4000-8000-000000000001'
      and movement.movement_type = 'salida'
  ),
  1::bigint,
  'solo una de las dos salidas concurrentes queda persistida'
);

select extensions.dblink_disconnect('inventory_worker_a');
select extensions.dblink_disconnect('inventory_worker_b');

begin;
drop schema inventory_concurrency_test cascade;
delete from public.audit_events
where organization_id = 'c1000000-0000-4000-8000-000000000001';
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements
where organization_id = 'c1000000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions
where organization_id = 'c1000000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.warehouse_locations
where organization_id = 'c1000000-0000-4000-8000-000000000001';
delete from public.warehouses
where organization_id = 'c1000000-0000-4000-8000-000000000001';
delete from public.products
where organization_id = 'c1000000-0000-4000-8000-000000000001';
delete from public.user_roles
where organization_id = 'c1000000-0000-4000-8000-000000000001';
delete from public.organization_memberships
where organization_id = 'c1000000-0000-4000-8000-000000000001';
delete from public.profiles
where id = 'c2000000-0000-4000-8000-000000000001';
delete from auth.users
where id = 'c2000000-0000-4000-8000-000000000001';
delete from public.organizations
where id = 'c1000000-0000-4000-8000-000000000001';
commit;

select * from finish();

do $$
begin
  if not (select was_installed from inventory_concurrency_extension_state) then
    drop extension dblink;
  end if;
end;
$$;
