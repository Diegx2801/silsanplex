create temporary table repair_cycle_concurrency_extension_state (
  was_installed boolean not null
);
insert into repair_cycle_concurrency_extension_state
select exists (
  select 1 from pg_catalog.pg_extension where extname = 'dblink'
);

create extension if not exists dblink with schema extensions;

select plan(10);

begin;
drop schema if exists repair_cycle_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events
where organization_id = 'ec100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.repair_events disable trigger repair_events_immutable;
delete from public.repair_events
where organization_id = 'ec100000-0000-4000-8000-000000000001';
alter table public.repair_events enable trigger repair_events_immutable;
delete from public.repair_tests
where organization_id = 'ec100000-0000-4000-8000-000000000001';
delete from public.repairs
where organization_id = 'ec100000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions
where organization_id = 'ec100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.customers
where organization_id = 'ec100000-0000-4000-8000-000000000001';
delete from public.products
where organization_id = 'ec100000-0000-4000-8000-000000000001';
delete from public.user_roles
where organization_id = 'ec100000-0000-4000-8000-000000000001';
delete from public.organization_memberships
where organization_id = 'ec100000-0000-4000-8000-000000000001';
delete from public.profiles
where id = 'ec200000-0000-4000-8000-000000000001';
delete from auth.users
where id = 'ec200000-0000-4000-8000-000000000001';
delete from public.organizations
where id = 'ec100000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug)
values (
  'ec100000-0000-4000-8000-000000000001',
  'Concurrencia ciclos reparacion',
  'concurrencia-ciclos-reparacion'
);

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'ec200000-0000-4000-8000-000000000001',
  'repair.cycle.concurrent@test.local',
  '{"full_name":"Repair Cycle Concurrent"}',
  now(), now()
);

insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  'ec300000-0000-4000-8000-000000000001',
  'ec200000-0000-4000-8000-000000000001',
  now(), now()
);

insert into public.organization_memberships (organization_id, user_id)
values (
  'ec100000-0000-4000-8000-000000000001',
  'ec200000-0000-4000-8000-000000000001'
);

insert into public.user_roles (organization_id, user_id, role_code)
values (
  'ec100000-0000-4000-8000-000000000001',
  'ec200000-0000-4000-8000-000000000001',
  'ADMIN'
);

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name
)
values (
  'ec400000-0000-4000-8000-000000000001',
  'ec100000-0000-4000-8000-000000000001',
  'DNI', '52000001', 'Cliente concurrencia ciclos'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, expiration_control, serial_control, created_by, updated_by
)
values (
  'ec500000-0000-4000-8000-000000000001',
  'ec100000-0000-4000-8000-000000000001',
  'CYCLE-CONC', 'Producto concurrencia ciclos', 'UND', 10,
  false, false, false,
  'ec200000-0000-4000-8000-000000000001',
  'ec200000-0000-4000-8000-000000000001'
);

insert into public.repairs (
  id, organization_id, customer_id, product_id, status,
  current_test_cycle_number, problem_description, assigned_technician_id,
  customer_name_snapshot, customer_document_snapshot,
  product_code_snapshot, product_description_snapshot, created_by, updated_by
)
values (
  'ec600000-0000-4000-8000-000000000001',
  'ec100000-0000-4000-8000-000000000001',
  'ec400000-0000-4000-8000-000000000001',
  'ec500000-0000-4000-8000-000000000001',
  'testing', 1, 'Prueba final concurrente',
  'ec200000-0000-4000-8000-000000000001',
  'Cliente concurrencia ciclos', 'DNI 52000001',
  'CYCLE-CONC', 'Producto concurrencia ciclos',
  'ec200000-0000-4000-8000-000000000001',
  'ec200000-0000-4000-8000-000000000001'
);

create schema repair_cycle_concurrency_test;

create function repair_cycle_concurrency_test.record_passed_and_wait(
  requested_gate_key bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  test_id uuid;
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    'ec200000-0000-4000-8000-000000000001',
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"ec200000-0000-4000-8000-000000000001","role":"authenticated","session_id":"ec300000-0000-4000-8000-000000000001"}',
    true
  );

  test_id := public.record_repair_test(
    '{"organization_id":"ec100000-0000-4000-8000-000000000001","repair_id":"ec600000-0000-4000-8000-000000000001","test_type":"Operacion","result":"Aprobada concurrente","passed":true}'::jsonb
  );
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  return test_id;
end;
$$;

create function repair_cycle_concurrency_test.change_to_ready()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    'ec200000-0000-4000-8000-000000000001',
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"ec200000-0000-4000-8000-000000000001","role":"authenticated","session_id":"ec300000-0000-4000-8000-000000000001"}',
    true
  );

  perform public.change_repair_status(
    'ec100000-0000-4000-8000-000000000001',
    'ec600000-0000-4000-8000-000000000001',
    'ready_for_delivery',
    'Ready concurrente'
  );
  return (
    select status
    from public.repairs
    where id = 'ec600000-0000-4000-8000-000000000001'
  );
end;
$$;
commit;

create temporary table repair_cycle_concurrency_workers (
  worker_name text primary key,
  process_id integer not null
);
create temporary table repair_cycle_concurrency_results (
  test_id uuid,
  final_status text
);

select extensions.dblink_connect(
  'repair_cycle_worker_test',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'repair_cycle_worker_ready',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);

insert into repair_cycle_concurrency_workers
select 'test', process_id
from extensions.dblink('repair_cycle_worker_test', 'select pg_backend_pid()')
  as worker(process_id integer);
insert into repair_cycle_concurrency_workers
select 'ready', process_id
from extensions.dblink('repair_cycle_worker_ready', 'select pg_backend_pid()')
  as worker(process_id integer);

select isnt(
  (select process_id from repair_cycle_concurrency_workers where worker_name = 'test'),
  (select process_id from repair_cycle_concurrency_workers where worker_name = 'ready'),
  'la prueba usa dos sesiones PostgreSQL'
);

select pg_catalog.pg_advisory_lock(908292000000000001);

select is(
  extensions.dblink_send_query(
    'repair_cycle_worker_test',
    'select repair_cycle_concurrency_test.record_passed_and_wait(908292000000000001)'
  ),
  1,
  'la prueba PASSED se inicia asincronicamente'
);

do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1
      from pg_catalog.pg_locks lock
      where lock.pid = (
        select process_id
        from repair_cycle_concurrency_workers
        where worker_name = 'test'
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
      from repair_cycle_concurrency_workers
      where worker_name = 'test'
    )
      and lock.locktype = 'advisory'
      and not lock.granted
  ),
  'record_repair_test conserva abierta la transaccion con el lock de reparacion'
);

select is(
  extensions.dblink_send_query(
    'repair_cycle_worker_ready',
    'select repair_cycle_concurrency_test.change_to_ready()'
  ),
  1,
  'la transicion ready se inicia mientras la prueba no confirma'
);

do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1
      from pg_catalog.pg_locks lock
      where lock.pid = (
        select process_id
        from repair_cycle_concurrency_workers
        where worker_name = 'ready'
      )
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
      from repair_cycle_concurrency_workers
      where worker_name = 'ready'
    )
      and not lock.granted
  ),
  'change_repair_status espera el lock de la misma reparacion'
);

select ok(
  pg_catalog.pg_advisory_unlock(908292000000000001),
  'la prueba final puede confirmar de forma controlada'
);

insert into repair_cycle_concurrency_results (test_id)
select test_id
from extensions.dblink_get_result('repair_cycle_worker_test')
  as result(test_id uuid);

select ok(
  (select test_id from repair_cycle_concurrency_results) is not null,
  'el PASSED confirma correctamente'
);

update repair_cycle_concurrency_results result
set final_status = worker.final_status
from extensions.dblink_get_result('repair_cycle_worker_ready')
  as worker(final_status text);

select is(
  (select final_status from repair_cycle_concurrency_results),
  'ready_for_delivery'::text,
  'ready relee el PASSED confirmado y avanza'
);
select is(
  (select count(*) from public.repair_tests where repair_id = 'ec600000-0000-4000-8000-000000000001' and test_cycle_number = 1 and passed),
  1::bigint,
  'solo queda una prueba PASSED en el ciclo vigente'
);
select is(
  (select status from public.repairs where id = 'ec600000-0000-4000-8000-000000000001'),
  'ready_for_delivery'::text,
  'el estado persistido coincide con el resultado concurrente'
);

select extensions.dblink_disconnect('repair_cycle_worker_test');
select extensions.dblink_disconnect('repair_cycle_worker_ready');

begin;
drop schema repair_cycle_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events
where organization_id = 'ec100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.repair_events disable trigger repair_events_immutable;
delete from public.repair_events
where organization_id = 'ec100000-0000-4000-8000-000000000001';
alter table public.repair_events enable trigger repair_events_immutable;
delete from public.repair_tests
where organization_id = 'ec100000-0000-4000-8000-000000000001';
delete from public.repairs
where organization_id = 'ec100000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions
where organization_id = 'ec100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.customers
where organization_id = 'ec100000-0000-4000-8000-000000000001';
delete from public.products
where organization_id = 'ec100000-0000-4000-8000-000000000001';
delete from public.user_roles
where organization_id = 'ec100000-0000-4000-8000-000000000001';
delete from public.organization_memberships
where organization_id = 'ec100000-0000-4000-8000-000000000001';
delete from public.profiles
where id = 'ec200000-0000-4000-8000-000000000001';
delete from auth.users
where id = 'ec200000-0000-4000-8000-000000000001';
delete from public.organizations
where id = 'ec100000-0000-4000-8000-000000000001';
commit;

select * from finish();

do $$
begin
  if not (select was_installed from repair_cycle_concurrency_extension_state) then
    drop extension dblink;
  end if;
end;
$$;
