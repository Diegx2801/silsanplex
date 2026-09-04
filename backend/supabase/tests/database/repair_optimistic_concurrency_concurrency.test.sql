create temporary table repair_occ_concurrency_extension_state (
  was_installed boolean not null
);
insert into repair_occ_concurrency_extension_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');

create extension if not exists dblink with schema extensions;

select plan(11);

begin;
drop schema if exists repair_occ_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'cc110000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.repair_events disable trigger repair_events_immutable;
delete from public.repair_events where organization_id = 'cc110000-0000-4000-8000-000000000001';
alter table public.repair_events enable trigger repair_events_immutable;
delete from public.repairs where organization_id = 'cc110000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'cc110000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.customers where organization_id = 'cc110000-0000-4000-8000-000000000001';
delete from public.products where organization_id = 'cc110000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'cc110000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'cc110000-0000-4000-8000-000000000001';
delete from public.profiles where id = 'cc120000-0000-4000-8000-000000000001';
delete from auth.sessions where user_id = 'cc120000-0000-4000-8000-000000000001';
delete from auth.users where id = 'cc120000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'cc110000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug)
values ('cc110000-0000-4000-8000-000000000001', 'Repair OCC concurrency', 'repair-occ-concurrency');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'cc120000-0000-4000-8000-000000000001',
  'repair.occ.concurrent@test.local',
  '{"full_name":"Repair OCC Concurrent"}',
  now(), now()
);
insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  'cc130000-0000-4000-8000-000000000001',
  'cc120000-0000-4000-8000-000000000001',
  now(), now()
);
insert into public.organization_memberships (organization_id, user_id)
values (
  'cc110000-0000-4000-8000-000000000001',
  'cc120000-0000-4000-8000-000000000001'
);
insert into public.user_roles (organization_id, user_id, role_code)
values (
  'cc110000-0000-4000-8000-000000000001',
  'cc120000-0000-4000-8000-000000000001',
  'ADMIN'
);

insert into public.customers (id, organization_id, document_type, document_number, legal_name)
values (
  'cc140000-0000-4000-8000-000000000001',
  'cc110000-0000-4000-8000-000000000001',
  'DNI', '42000001', 'Repair OCC Concurrent Customer'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, expiration_control, serial_control, created_by, updated_by
)
values (
  'cc150000-0000-4000-8000-000000000001',
  'cc110000-0000-4000-8000-000000000001',
  'OCC-CONCURRENT', 'Repair OCC Concurrent Product', 'UND', 10,
  false, false, false,
  'cc120000-0000-4000-8000-000000000001',
  'cc120000-0000-4000-8000-000000000001'
);
insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot, product_code_snapshot,
  product_description_snapshot, created_by, updated_by
)
values (
  'cc180000-0000-4000-8000-000000000001',
  'cc110000-0000-4000-8000-000000000001',
  'cc140000-0000-4000-8000-000000000001',
  'cc150000-0000-4000-8000-000000000001',
  'received', 'Exercise concurrent OCC writers',
  'Repair OCC Concurrent Customer', 'DNI 42000001',
  'OCC-CONCURRENT', 'Repair OCC Concurrent Product',
  'cc120000-0000-4000-8000-000000000001',
  'cc120000-0000-4000-8000-000000000001'
);
insert into public.repair_events (
  organization_id, repair_id, event_type, from_status, to_status, actor_user_id, metadata
)
values (
  'cc110000-0000-4000-8000-000000000001',
  'cc180000-0000-4000-8000-000000000001',
  'CREATED', null, 'received',
  'cc120000-0000-4000-8000-000000000001', '{}'
);

create schema repair_occ_concurrency_test;

create function repair_occ_concurrency_test.set_actor()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"cc120000-0000-4000-8000-000000000001","role":"authenticated","session_id":"cc130000-0000-4000-8000-000000000001"}',
    true
  );
end;
$$;

create function repair_occ_concurrency_test.update_and_wait(requested_gate_key bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform repair_occ_concurrency_test.set_actor();
  perform public.update_repair(jsonb_build_object(
    'organization_id', 'cc110000-0000-4000-8000-000000000001',
    'id', 'cc180000-0000-4000-8000-000000000001',
    'expected_lock_version', 1,
    'notes', 'winner'
  ));
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  return 'winner';
end;
$$;

create function repair_occ_concurrency_test.attempt_stale_update()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform repair_occ_concurrency_test.set_actor();
  perform public.update_repair(jsonb_build_object(
    'organization_id', 'cc110000-0000-4000-8000-000000000001',
    'id', 'cc180000-0000-4000-8000-000000000001',
    'expected_lock_version', 1,
    'notes', 'waiter'
  ));
  return 'unexpected success';
exception
  when sqlstate 'P0001' then
    return sqlerrm;
end;
$$;
commit;

create temporary table repair_occ_concurrency_workers (
  worker_name text primary key,
  process_id integer not null
);
create temporary table repair_occ_concurrency_results (
  worker_name text primary key,
  result text
);
insert into repair_occ_concurrency_results (worker_name) values ('winner'), ('waiter');

select extensions.dblink_connect('repair_occ_winner', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('repair_occ_waiter', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
insert into repair_occ_concurrency_workers
select 'winner', process_id
from extensions.dblink('repair_occ_winner', 'select pg_backend_pid()') as worker(process_id integer);
insert into repair_occ_concurrency_workers
select 'waiter', process_id
from extensions.dblink('repair_occ_waiter', 'select pg_backend_pid()') as worker(process_id integer);

select isnt(
  (select process_id from repair_occ_concurrency_workers where worker_name = 'winner'),
  (select process_id from repair_occ_concurrency_workers where worker_name = 'waiter'),
  'OCC contention uses two PostgreSQL sessions'
);

select pg_catalog.pg_advisory_lock(909040100000000001);
select is(
  extensions.dblink_send_query(
    'repair_occ_winner',
    $$select repair_occ_concurrency_test.update_and_wait(909040100000000001)$$
  ),
  1,
  'the first public OCC mutation starts asynchronously'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1
      from pg_catalog.pg_locks lock
      where lock.pid = (
          select process_id
          from repair_occ_concurrency_workers
          where worker_name = 'winner'
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
        from repair_occ_concurrency_workers
        where worker_name = 'winner'
      )
      and lock.locktype = 'advisory'
      and not lock.granted
  ),
  'the first mutation holds its repair row lock before commit'
);

select is(
  extensions.dblink_send_query(
    'repair_occ_waiter',
    $$select repair_occ_concurrency_test.attempt_stale_update()$$
  ),
  1,
  'the second mutation starts with the same expected version'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1
      from pg_catalog.pg_locks lock
      where lock.pid = (
          select process_id
          from repair_occ_concurrency_workers
          where worker_name = 'waiter'
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
        from repair_occ_concurrency_workers
        where worker_name = 'waiter'
      )
      and not lock.granted
  ),
  'the stale waiter blocks on the repair row lock'
);

select ok(pg_catalog.pg_advisory_unlock(909040100000000001), 'the first mutation can commit');
update repair_occ_concurrency_results result
set result = worker.result
from extensions.dblink_get_result('repair_occ_winner') as worker(result text)
where result.worker_name = 'winner';
update repair_occ_concurrency_results result
set result = worker.result
from extensions.dblink_get_result('repair_occ_waiter') as worker(result text)
where result.worker_name = 'waiter';
select * from extensions.dblink_get_result('repair_occ_winner') as cleared(result text);
select * from extensions.dblink_get_result('repair_occ_waiter') as cleared(result text);

select is(
  (select result from repair_occ_concurrency_results where worker_name = 'winner'),
  'winner'::text,
  'the first public wrapper call succeeds'
);
select is(
  (select result from repair_occ_concurrency_results where worker_name = 'waiter'),
  'REPAIR_VERSION_CONFLICT'::text,
  'the blocked waiter rechecks and rejects the stale version'
);
select results_eq(
  $$
    select notes, lock_version
    from public.repairs
    where id = 'cc180000-0000-4000-8000-000000000001'
  $$,
  $$ values ('winner'::text, 2::bigint) $$,
  'exactly one business mutation commits and the version advances once'
);
select is(
  (
    select count(*)
    from public.repair_events
    where repair_id = 'cc180000-0000-4000-8000-000000000001'
      and event_type = 'UPDATED'
  ),
  1::bigint,
  'exactly one repair update event commits'
);
select is(
  (
    select count(*)
    from public.audit_events
    where entity_id = 'cc180000-0000-4000-8000-000000000001'
      and action = 'REPAIR_UPDATED'
  ),
  1::bigint,
  'exactly one repair update audit commits'
);

select extensions.dblink_disconnect('repair_occ_winner');
select extensions.dblink_disconnect('repair_occ_waiter');

begin;
drop schema repair_occ_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'cc110000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.repair_events disable trigger repair_events_immutable;
delete from public.repair_events where organization_id = 'cc110000-0000-4000-8000-000000000001';
alter table public.repair_events enable trigger repair_events_immutable;
delete from public.repairs where organization_id = 'cc110000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'cc110000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.customers where organization_id = 'cc110000-0000-4000-8000-000000000001';
delete from public.products where organization_id = 'cc110000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'cc110000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'cc110000-0000-4000-8000-000000000001';
delete from public.profiles where id = 'cc120000-0000-4000-8000-000000000001';
delete from auth.sessions where user_id = 'cc120000-0000-4000-8000-000000000001';
delete from auth.users where id = 'cc120000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'cc110000-0000-4000-8000-000000000001';
commit;

select * from finish();

do $$
begin
  if not (select was_installed from repair_occ_concurrency_extension_state) then
    drop extension dblink;
  end if;
end;
$$;
