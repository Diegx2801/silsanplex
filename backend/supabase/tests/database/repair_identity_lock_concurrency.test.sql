create temporary table repair_identity_concurrency_extension_state (
  was_installed boolean not null
);
insert into repair_identity_concurrency_extension_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');

create extension if not exists dblink with schema extensions;

select plan(25);

begin;
drop schema if exists repair_identity_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'bc140000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.repair_events disable trigger repair_events_immutable;
delete from public.repair_events where organization_id = 'bc140000-0000-4000-8000-000000000001';
alter table public.repair_events enable trigger repair_events_immutable;
delete from public.repairs where organization_id = 'bc140000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'bc140000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.customers where organization_id = 'bc140000-0000-4000-8000-000000000001';
delete from public.products where organization_id = 'bc140000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'bc140000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'bc140000-0000-4000-8000-000000000001';
delete from public.profiles where id = 'bc240000-0000-4000-8000-000000000001';
delete from auth.sessions where user_id = 'bc240000-0000-4000-8000-000000000001';
delete from auth.users where id = 'bc240000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'bc140000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug)
values ('bc140000-0000-4000-8000-000000000001', 'Repair identity concurrency', 'repair-identity-concurrency');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('bc240000-0000-4000-8000-000000000001', 'identity.concurrent@test.local', '{"full_name":"Identity Concurrent"}', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('bc340000-0000-4000-8000-000000000001', 'bc240000-0000-4000-8000-000000000001', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('bc140000-0000-4000-8000-000000000001', 'bc240000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('bc140000-0000-4000-8000-000000000001', 'bc240000-0000-4000-8000-000000000001', 'ADMIN');

insert into public.customers (id, organization_id, document_type, document_number, legal_name)
values
  ('bc440000-0000-4000-8000-000000000001', 'bc140000-0000-4000-8000-000000000001', 'DNI', '56400001', 'Concurrent old customer'),
  ('bc440000-0000-4000-8000-000000000002', 'bc140000-0000-4000-8000-000000000001', 'RUC', '20564000002', 'Concurrent new customer');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, expiration_control, serial_control, created_by, updated_by
)
values
  ('bc540000-0000-4000-8000-000000000001', 'bc140000-0000-4000-8000-000000000001', 'CONC-OLD', 'Concurrent old product', 'UND', 10, false, false, false, 'bc240000-0000-4000-8000-000000000001', 'bc240000-0000-4000-8000-000000000001'),
  ('bc540000-0000-4000-8000-000000000002', 'bc140000-0000-4000-8000-000000000001', 'CONC-NEW', 'Concurrent serial product', 'UND', 20, false, false, true, 'bc240000-0000-4000-8000-000000000001', 'bc240000-0000-4000-8000-000000000001');

insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot,
  product_code_snapshot, product_description_snapshot, created_by, updated_by
)
values
  ('bc640000-0000-4000-8000-000000000001', 'bc140000-0000-4000-8000-000000000001', 'bc440000-0000-4000-8000-000000000001', 'bc540000-0000-4000-8000-000000000001', 'received', 'Identity commits first', 'Concurrent old customer', 'DNI 56400001', 'CONC-OLD', 'Concurrent old product', 'bc240000-0000-4000-8000-000000000001', 'bc240000-0000-4000-8000-000000000001'),
  ('bc640000-0000-4000-8000-000000000002', 'bc140000-0000-4000-8000-000000000001', 'bc440000-0000-4000-8000-000000000001', 'bc540000-0000-4000-8000-000000000001', 'received', 'History commits first', 'Concurrent old customer', 'DNI 56400001', 'CONC-OLD', 'Concurrent old product', 'bc240000-0000-4000-8000-000000000001', 'bc240000-0000-4000-8000-000000000001');

insert into public.repair_events (
  organization_id, repair_id, event_type, from_status, to_status, actor_user_id, metadata
)
select organization_id, id, 'CREATED', null, 'received', created_by, '{}'
from public.repairs
where id in ('bc640000-0000-4000-8000-000000000001', 'bc640000-0000-4000-8000-000000000002');

create schema repair_identity_concurrency_test;

create function repair_identity_concurrency_test.set_actor()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', 'bc240000-0000-4000-8000-000000000001', true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"bc240000-0000-4000-8000-000000000001","role":"authenticated","session_id":"bc340000-0000-4000-8000-000000000001"}',
    true
  );
end;
$$;

create function repair_identity_concurrency_test.identity_and_wait(
  requested_repair_id uuid,
  requested_gate_key bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_value text;
begin
  perform repair_identity_concurrency_test.set_actor();
  perform public.update_repair(jsonb_build_object(
    'organization_id', 'bc140000-0000-4000-8000-000000000001',
    'id', requested_repair_id,
    'customer_id', 'bc440000-0000-4000-8000-000000000002',
    'product_id', 'bc540000-0000-4000-8000-000000000002',
    'serial_number', 'CONCURRENT-SERIAL'
  ));
  select repair.customer_id::text || '/' || repair.product_id::text || '/' || repair.serial_number
  into identity_value
  from public.repairs repair
  where repair.id = requested_repair_id;
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  return identity_value;
end;
$$;

create function repair_identity_concurrency_test.history_and_wait(
  requested_repair_id uuid,
  requested_gate_key bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  observed_identity text;
begin
  perform repair_identity_concurrency_test.set_actor();
  perform public.record_repair_solution(jsonb_build_object(
    'organization_id', 'bc140000-0000-4000-8000-000000000001',
    'repair_id', requested_repair_id,
    'applied_solution', 'Concurrent substantive history'
  ));
  select repair.customer_id::text || '/' || repair.product_id::text || '/' || coalesce(repair.serial_number, '<null>')
  into observed_identity
  from public.repairs repair
  where repair.id = requested_repair_id;
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  return observed_identity;
end;
$$;

create function repair_identity_concurrency_test.attempt_identity(requested_repair_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform repair_identity_concurrency_test.set_actor();
  perform public.update_repair(jsonb_build_object(
    'organization_id', 'bc140000-0000-4000-8000-000000000001',
    'id', requested_repair_id,
    'customer_id', 'bc440000-0000-4000-8000-000000000002',
    'product_id', 'bc540000-0000-4000-8000-000000000002',
    'serial_number', 'CONCURRENT-SERIAL'
  ));
  return 'UPDATED';
exception when others then
  return sqlerrm;
end;
$$;
commit;

create temporary table repair_identity_concurrency_workers (
  worker_name text primary key,
  process_id integer not null
);
create temporary table repair_identity_concurrency_results (
  scenario text primary key,
  identity_result text,
  history_result text
);
insert into repair_identity_concurrency_results (scenario) values ('identity-first'), ('history-first');

select extensions.dblink_connect('repair_identity_worker', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('repair_history_worker', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
insert into repair_identity_concurrency_workers
select 'identity', process_id from extensions.dblink('repair_identity_worker', 'select pg_backend_pid()') as worker(process_id integer);
insert into repair_identity_concurrency_workers
select 'history', process_id from extensions.dblink('repair_history_worker', 'select pg_backend_pid()') as worker(process_id integer);

select isnt(
  (select process_id from repair_identity_concurrency_workers where worker_name = 'identity'),
  (select process_id from repair_identity_concurrency_workers where worker_name = 'history'),
  'the invariant test uses two PostgreSQL sessions'
);

-- Ordering A: identity owns the repair lock, then history serializes and sees it.
select pg_catalog.pg_advisory_lock(908301300000000001);
select is(
  extensions.dblink_send_query('repair_identity_worker', $$select repair_identity_concurrency_test.identity_and_wait('bc640000-0000-4000-8000-000000000001', 908301300000000001)$$),
  1,
  'identity-first correction starts asynchronously'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from repair_identity_concurrency_workers where worker_name = 'identity')
        and lock.locktype = 'advisory' and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from repair_identity_concurrency_workers where worker_name = 'identity')
      and lock.locktype = 'advisory' and not lock.granted
  ),
  'identity-first transaction holds the repair row until controlled commit'
);
select is(
  extensions.dblink_send_query('repair_history_worker', $$select repair_identity_concurrency_test.history_and_wait('bc640000-0000-4000-8000-000000000001', 908301300000000099)$$),
  1,
  'history starts while identity is uncommitted'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from repair_identity_concurrency_workers where worker_name = 'history')
        and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from repair_identity_concurrency_workers where worker_name = 'history')
      and not lock.granted
  ),
  'history waits on the same repair row'
);
select ok(pg_catalog.pg_advisory_unlock(908301300000000001), 'identity-first transaction can commit');
update repair_identity_concurrency_results result
set identity_result = worker.identity_result
from extensions.dblink_get_result('repair_identity_worker') as worker(identity_result text)
where result.scenario = 'identity-first';
update repair_identity_concurrency_results result
set history_result = worker.history_result
from extensions.dblink_get_result('repair_history_worker') as worker(history_result text)
where result.scenario = 'identity-first';
select * from extensions.dblink_get_result('repair_identity_worker') as cleared(result text);
select * from extensions.dblink_get_result('repair_history_worker') as cleared(result text);
select is(
  (select identity_result from repair_identity_concurrency_results where scenario = 'identity-first'),
  'bc440000-0000-4000-8000-000000000002/bc540000-0000-4000-8000-000000000002/CONCURRENT-SERIAL'::text,
  'identity-first worker commits the complete effective identity'
);
select is(
  (select history_result from repair_identity_concurrency_results where scenario = 'identity-first'),
  'bc440000-0000-4000-8000-000000000002/bc540000-0000-4000-8000-000000000002/CONCURRENT-SERIAL'::text,
  'serialized history observes the committed corrected identity'
);
select results_eq(
  $$ select customer_id, product_id, serial_number, serial_control_snapshot from public.repairs where id = 'bc640000-0000-4000-8000-000000000001' $$,
  $$ values ('bc440000-0000-4000-8000-000000000002'::uuid, 'bc540000-0000-4000-8000-000000000002'::uuid, 'CONCURRENT-SERIAL'::text, true) $$,
  'identity-first final repair stores identity and serial-control snapshot'
);
select is((select count(*) from public.repair_events where repair_id = 'bc640000-0000-4000-8000-000000000001' and event_type = 'SOLUTION_RECORDED'), 1::bigint, 'identity-first history event commits once');
select is((select count(*) from public.audit_events where entity_id = 'bc640000-0000-4000-8000-000000000001' and action = 'REPAIR_SOLUTION_RECORDED'), 1::bigint, 'identity-first history audit commits once');
select is((select count(*) from public.repair_events where repair_id = 'bc640000-0000-4000-8000-000000000001' and event_type = 'UPDATED'), 1::bigint, 'identity-first correction commits before its history');

-- Ordering B: substantive history owns the lock; the stale identity request must fail.
select pg_catalog.pg_advisory_lock(908301300000000002);
select is(
  extensions.dblink_send_query('repair_history_worker', $$select repair_identity_concurrency_test.history_and_wait('bc640000-0000-4000-8000-000000000002', 908301300000000002)$$),
  1,
  'history-first writer starts asynchronously'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from repair_identity_concurrency_workers where worker_name = 'history')
        and lock.locktype = 'advisory' and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from repair_identity_concurrency_workers where worker_name = 'history')
      and lock.locktype = 'advisory' and not lock.granted
  ),
  'history-first transaction holds the repair row until controlled commit'
);
select is(
  extensions.dblink_send_query('repair_identity_worker', $$select repair_identity_concurrency_test.attempt_identity('bc640000-0000-4000-8000-000000000002')$$),
  1,
  'identity attempt starts while history is uncommitted'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from repair_identity_concurrency_workers where worker_name = 'identity')
        and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from repair_identity_concurrency_workers where worker_name = 'identity')
      and not lock.granted
  ),
  'identity attempt waits on the history writer repair lock'
);
select ok(pg_catalog.pg_advisory_unlock(908301300000000002), 'history-first transaction can commit');
update repair_identity_concurrency_results result
set history_result = worker.history_result
from extensions.dblink_get_result('repair_history_worker') as worker(history_result text)
where result.scenario = 'history-first';
update repair_identity_concurrency_results result
set identity_result = worker.identity_result
from extensions.dblink_get_result('repair_identity_worker') as worker(identity_result text)
where result.scenario = 'history-first';
select * from extensions.dblink_get_result('repair_history_worker') as cleared(result text);
select * from extensions.dblink_get_result('repair_identity_worker') as cleared(result text);
select is(
  (select history_result from repair_identity_concurrency_results where scenario = 'history-first'),
  'bc440000-0000-4000-8000-000000000001/bc540000-0000-4000-8000-000000000001/<null>'::text,
  'history-first writer observes the original identity it locked'
);
select is(
  (select identity_result from repair_identity_concurrency_results where scenario = 'history-first'),
  'REPAIR_IDENTITY_LOCKED'::text,
  'waiting identity attempt re-reads history and is rejected'
);
select results_eq(
  $$ select customer_id, product_id, serial_number, serial_control_snapshot from public.repairs where id = 'bc640000-0000-4000-8000-000000000002' $$,
  $$ values ('bc440000-0000-4000-8000-000000000001'::uuid, 'bc540000-0000-4000-8000-000000000001'::uuid, null::text, false) $$,
  'history-first final repair retains its complete original identity'
);
select is((select applied_solution from public.repairs where id = 'bc640000-0000-4000-8000-000000000002'), 'Concurrent substantive history'::text, 'history-first substantive field commits');
select is((select count(*) from public.repair_events where repair_id = 'bc640000-0000-4000-8000-000000000002' and event_type = 'SOLUTION_RECORDED'), 1::bigint, 'history-first event commits once');
select is((select count(*) from public.audit_events where entity_id = 'bc640000-0000-4000-8000-000000000002' and action = 'REPAIR_SOLUTION_RECORDED'), 1::bigint, 'history-first audit commits once');
select is((select count(*) from public.repair_events where repair_id = 'bc640000-0000-4000-8000-000000000002' and event_type = 'UPDATED'), 0::bigint, 'rejected waiting identity writes no update event');
select ok(
  not exists (
    select 1
    from public.repairs repair
    where repair.id = 'bc640000-0000-4000-8000-000000000002'
      and repair.applied_solution is not null
      and (
        repair.customer_id <> 'bc440000-0000-4000-8000-000000000001'
        or repair.product_id <> 'bc540000-0000-4000-8000-000000000001'
        or repair.serial_number is not null
      )
  ),
  'the invariant forbids substantive history with a later identity change'
);

select extensions.dblink_disconnect('repair_identity_worker');
select extensions.dblink_disconnect('repair_history_worker');

begin;
drop schema repair_identity_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'bc140000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.repair_events disable trigger repair_events_immutable;
delete from public.repair_events where organization_id = 'bc140000-0000-4000-8000-000000000001';
alter table public.repair_events enable trigger repair_events_immutable;
delete from public.repairs where organization_id = 'bc140000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'bc140000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.customers where organization_id = 'bc140000-0000-4000-8000-000000000001';
delete from public.products where organization_id = 'bc140000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'bc140000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'bc140000-0000-4000-8000-000000000001';
delete from public.profiles where id = 'bc240000-0000-4000-8000-000000000001';
delete from auth.sessions where user_id = 'bc240000-0000-4000-8000-000000000001';
delete from auth.users where id = 'bc240000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'bc140000-0000-4000-8000-000000000001';
commit;

select * from finish();

do $$
begin
  if not (select was_installed from repair_identity_concurrency_extension_state) then
    drop extension dblink;
  end if;
end;
$$;
