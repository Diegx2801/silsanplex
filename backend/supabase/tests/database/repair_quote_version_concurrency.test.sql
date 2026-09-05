create temporary table repair_quote_concurrency_extension_state (
  was_installed boolean not null
);
insert into repair_quote_concurrency_extension_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');

create extension if not exists dblink with schema extensions;

select plan(19);

begin;
drop schema if exists repair_quote_concurrency_test cascade;
alter table public.repair_command_operations disable trigger repair_command_operations_immutable;
delete from public.repair_command_operations where organization_id = 'bd140000-0000-4000-8000-000000000001';
alter table public.repair_command_operations enable trigger repair_command_operations_immutable;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'bd140000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.repair_events disable trigger repair_events_immutable;
delete from public.repair_events where organization_id = 'bd140000-0000-4000-8000-000000000001';
alter table public.repair_events enable trigger repair_events_immutable;
delete from public.repair_quote_items where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.repair_quotes where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.repairs where organization_id = 'bd140000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'bd140000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.customers where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.products where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.profiles where id = 'bd240000-0000-4000-8000-000000000001';
delete from auth.sessions where user_id = 'bd240000-0000-4000-8000-000000000001';
delete from auth.users where id = 'bd240000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'bd140000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug)
values ('bd140000-0000-4000-8000-000000000001', 'Repair quote concurrency', 'repair-quote-concurrency');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('bd240000-0000-4000-8000-000000000001', 'quote.concurrent@test.local', '{"full_name":"Quote Concurrent"}', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('bd340000-0000-4000-8000-000000000001', 'bd240000-0000-4000-8000-000000000001', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('bd140000-0000-4000-8000-000000000001', 'bd240000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('bd140000-0000-4000-8000-000000000001', 'bd240000-0000-4000-8000-000000000001', 'ADMIN');

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name
) values (
  'bd440000-0000-4000-8000-000000000001',
  'bd140000-0000-4000-8000-000000000001',
  'DNI', '57400001', 'Concurrent quote customer'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, expiration_control, serial_control, created_by, updated_by
) values (
  'bd540000-0000-4000-8000-000000000001',
  'bd140000-0000-4000-8000-000000000001',
  'QUOTE-CONC', 'Concurrent quote product', 'UND', 10,
  false, false, false,
  'bd240000-0000-4000-8000-000000000001',
  'bd240000-0000-4000-8000-000000000001'
);
insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot,
  product_code_snapshot, product_description_snapshot, created_by, updated_by
) values (
  'bd640000-0000-4000-8000-000000000001',
  'bd140000-0000-4000-8000-000000000001',
  'bd440000-0000-4000-8000-000000000001',
  'bd540000-0000-4000-8000-000000000001',
  'diagnosis', 'Concurrent quote creation',
  'Concurrent quote customer', 'DNI 57400001',
  'QUOTE-CONC', 'Concurrent quote product',
  'bd240000-0000-4000-8000-000000000001',
  'bd240000-0000-4000-8000-000000000001'
);

create schema repair_quote_concurrency_test;

create function repair_quote_concurrency_test.set_actor()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', 'bd240000-0000-4000-8000-000000000001', true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"bd240000-0000-4000-8000-000000000001","role":"authenticated","session_id":"bd340000-0000-4000-8000-000000000001"}',
    true
  );
end;
$$;

create function repair_quote_concurrency_test.save_and_wait(requested_gate_key bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_id uuid;
begin
  perform repair_quote_concurrency_test.set_actor();
  quote_id := public.save_repair_quote_unchecked('{
    "organization_id":"bd140000-0000-4000-8000-000000000001",
    "repair_id":"bd640000-0000-4000-8000-000000000001",
    "items":[{"line_type":"labor","description":"First concurrent quote","quantity":1,"unit_price":20}]
  }'::jsonb);
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  return quote_id;
end;
$$;

create function repair_quote_concurrency_test.attempt_second_save()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform repair_quote_concurrency_test.set_actor();
  perform public.save_repair_quote_unchecked('{
    "organization_id":"bd140000-0000-4000-8000-000000000001",
    "repair_id":"bd640000-0000-4000-8000-000000000001",
    "items":[{"line_type":"labor","description":"Second concurrent quote","quantity":1,"unit_price":30}]
  }'::jsonb);
  return 'CREATED';
exception when others then
  return sqlerrm;
end;
$$;

create function repair_quote_concurrency_test.revise_and_wait(requested_gate_key bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rejected_quote_id uuid;
  revised_quote_id uuid;
begin
  perform repair_quote_concurrency_test.set_actor();
  select quote.id
  into rejected_quote_id
  from public.repair_quotes quote
  where quote.repair_id = 'bd640000-0000-4000-8000-000000000001'
    and quote.is_current;
  revised_quote_id := public.revise_repair_quote_unchecked(jsonb_build_object(
    'organization_id', 'bd140000-0000-4000-8000-000000000001',
    'repair_id', 'bd640000-0000-4000-8000-000000000001',
    'rejected_quote_id', rejected_quote_id,
    'items', '[{"line_type":"labor","description":"First concurrent revision","quantity":1,"unit_price":18}]'::jsonb
  ));
  perform pg_catalog.pg_advisory_xact_lock(requested_gate_key);
  return revised_quote_id;
end;
$$;

create function repair_quote_concurrency_test.attempt_second_revision()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  rejected_quote_id uuid;
begin
  perform repair_quote_concurrency_test.set_actor();
  select quote.id
  into rejected_quote_id
  from public.repair_quotes quote
  where quote.repair_id = 'bd640000-0000-4000-8000-000000000001'
    and quote.is_current;
  perform public.revise_repair_quote_unchecked(jsonb_build_object(
    'organization_id', 'bd140000-0000-4000-8000-000000000001',
    'repair_id', 'bd640000-0000-4000-8000-000000000001',
    'rejected_quote_id', rejected_quote_id,
    'items', '[{"line_type":"labor","description":"Second concurrent revision","quantity":1,"unit_price":17}]'::jsonb
  ));
  return 'CREATED';
exception when others then
  return sqlerrm;
end;
$$;
commit;

create temporary table repair_quote_concurrency_workers (
  worker_name text primary key,
  process_id integer not null
);
create temporary table repair_quote_concurrency_results (
  first_quote_id uuid,
  second_result text,
  revised_quote_id uuid,
  second_revision_result text
);
insert into repair_quote_concurrency_results default values;

select extensions.dblink_connect('repair_quote_worker_a', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('repair_quote_worker_b', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
insert into repair_quote_concurrency_workers
select 'a', process_id from extensions.dblink('repair_quote_worker_a', 'select pg_backend_pid()') as worker(process_id integer);
insert into repair_quote_concurrency_workers
select 'b', process_id from extensions.dblink('repair_quote_worker_b', 'select pg_backend_pid()') as worker(process_id integer);

select isnt(
  (select process_id from repair_quote_concurrency_workers where worker_name = 'a'),
  (select process_id from repair_quote_concurrency_workers where worker_name = 'b'),
  'quote versioning uses two PostgreSQL sessions'
);

select pg_catalog.pg_advisory_lock(909010300000000001);
select is(
  extensions.dblink_send_query(
    'repair_quote_worker_a',
    'select repair_quote_concurrency_test.save_and_wait(909010300000000001)'
  ),
  1,
  'the first quote starts asynchronously'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from repair_quote_concurrency_workers where worker_name = 'a')
        and lock.locktype = 'advisory'
        and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from repair_quote_concurrency_workers where worker_name = 'a')
      and lock.locktype = 'advisory'
      and not lock.granted
  ),
  'the first transaction holds the repair lock before commit'
);
select is(
  extensions.dblink_send_query(
    'repair_quote_worker_b',
    'select repair_quote_concurrency_test.attempt_second_save()'
  ),
  1,
  'the second quote starts while the first is uncommitted'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from repair_quote_concurrency_workers where worker_name = 'b')
        and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from repair_quote_concurrency_workers where worker_name = 'b')
      and not lock.granted
  ),
  'the second quote waits on the same repair row'
);
select ok(pg_catalog.pg_advisory_unlock(909010300000000001), 'the first quote can commit');

update repair_quote_concurrency_results result
set first_quote_id = worker.quote_id
from extensions.dblink_get_result('repair_quote_worker_a') as worker(quote_id uuid);
update repair_quote_concurrency_results result
set second_result = worker.result
from extensions.dblink_get_result('repair_quote_worker_b') as worker(result text);
select * from extensions.dblink_get_result('repair_quote_worker_a') as cleared(result text);
select * from extensions.dblink_get_result('repair_quote_worker_b') as cleared(result text);

select ok(
  (select first_quote_id from repair_quote_concurrency_results) is not null,
  'the first concurrent quote commits'
);
select is(
  (select second_result from repair_quote_concurrency_results),
  'REPAIR_QUOTE_REVISION_REQUIRED'::text,
  'the second concurrent quote is rejected after serialization'
);
select results_eq(
  $$
    select count(*), count(*) filter (where is_current), min(version_number), max(version_number)
    from public.repair_quotes
    where repair_id = 'bd640000-0000-4000-8000-000000000001'
  $$,
  $$ values (1::bigint, 1::bigint, 1, 1) $$,
  'only one current version is persisted'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'bd640000-0000-4000-8000-000000000001' and event_type = 'QUOTE_CREATED'),
  1::bigint,
  'only the committed quote records creation history'
);

begin;
select set_config('request.jwt.claim.sub', 'bd240000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"bd240000-0000-4000-8000-000000000001","role":"authenticated","session_id":"bd340000-0000-4000-8000-000000000001"}',
  true
);
select public.save_repair_quote(jsonb_build_object(
  'organization_id', 'bd140000-0000-4000-8000-000000000001',
  'operation_key', 'bd910000-0000-4000-8000-000000000001',
  'repair_id', 'bd640000-0000-4000-8000-000000000001',
  'expected_lock_version', (select lock_version from public.repairs where organization_id = 'bd140000-0000-4000-8000-000000000001' and id = 'bd640000-0000-4000-8000-000000000001'),
  'id', (select id from public.repair_quotes where repair_id = 'bd640000-0000-4000-8000-000000000001' and is_current),
  'submit', true,
  'items', '[{"line_type":"labor","description":"Submitted before rejection","quantity":1,"unit_price":20}]'::jsonb
));
select public.reject_repair_quote(
  'bd140000-0000-4000-8000-000000000001',
  'bd640000-0000-4000-8000-000000000001',
  (select id from public.repair_quotes where repair_id = 'bd640000-0000-4000-8000-000000000001' and is_current),
  'Customer requests a concurrent revision test',
  (select lock_version from public.repairs where organization_id = 'bd140000-0000-4000-8000-000000000001' and id = 'bd640000-0000-4000-8000-000000000001')
);
commit;

select pg_catalog.pg_advisory_lock(909010300000000002);
select is(
  extensions.dblink_send_query(
    'repair_quote_worker_a',
    'select repair_quote_concurrency_test.revise_and_wait(909010300000000002)'
  ),
  1,
  'the first revision starts asynchronously'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from repair_quote_concurrency_workers where worker_name = 'a')
        and lock.locktype = 'advisory'
        and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from repair_quote_concurrency_workers where worker_name = 'a')
      and lock.locktype = 'advisory'
      and not lock.granted
  ),
  'the first revision holds the repair lock before commit'
);
select is(
  extensions.dblink_send_query(
    'repair_quote_worker_b',
    'select repair_quote_concurrency_test.attempt_second_revision()'
  ),
  1,
  'the second revision starts while the first is uncommitted'
);
do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.pid = (select process_id from repair_quote_concurrency_workers where worker_name = 'b')
        and not lock.granted
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
select ok(
  exists (
    select 1 from pg_catalog.pg_locks lock
    where lock.pid = (select process_id from repair_quote_concurrency_workers where worker_name = 'b')
      and not lock.granted
  ),
  'the second revision waits on the same repair row'
);
select ok(pg_catalog.pg_advisory_unlock(909010300000000002), 'the first revision can commit');

update repair_quote_concurrency_results result
set revised_quote_id = worker.quote_id
from extensions.dblink_get_result('repair_quote_worker_a') as worker(quote_id uuid);
update repair_quote_concurrency_results result
set second_revision_result = worker.result
from extensions.dblink_get_result('repair_quote_worker_b') as worker(result text);
select * from extensions.dblink_get_result('repair_quote_worker_a') as cleared(result text);
select * from extensions.dblink_get_result('repair_quote_worker_b') as cleared(result text);

select ok(
  (select revised_quote_id from repair_quote_concurrency_results) is not null,
  'the first concurrent revision commits'
);
select is(
  (select second_revision_result from repair_quote_concurrency_results),
  'REPAIR_QUOTE_REVISION_STATE_INVALID'::text,
  'the second concurrent revision is rejected after serialization'
);
select results_eq(
  $$
    select version_number, status, is_current
    from public.repair_quotes
    where repair_id = 'bd640000-0000-4000-8000-000000000001'
    order by version_number
  $$,
  $$ values
    (1, 'rejected'::text, false),
    (2, 'draft'::text, true)
  $$,
  'the revision race persists one current version 2'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'bd640000-0000-4000-8000-000000000001' and event_type = 'QUOTE_REVISION_CREATED'),
  1::bigint,
  'only the committed revision records creation history'
);

select extensions.dblink_disconnect('repair_quote_worker_a');
select extensions.dblink_disconnect('repair_quote_worker_b');
select * from finish();

begin;
drop schema repair_quote_concurrency_test cascade;
alter table public.repair_command_operations disable trigger repair_command_operations_immutable;
delete from public.repair_command_operations where organization_id = 'bd140000-0000-4000-8000-000000000001';
alter table public.repair_command_operations enable trigger repair_command_operations_immutable;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'bd140000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.repair_events disable trigger repair_events_immutable;
delete from public.repair_events where organization_id = 'bd140000-0000-4000-8000-000000000001';
alter table public.repair_events enable trigger repair_events_immutable;
delete from public.repair_quote_items where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.repair_quotes where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.repairs where organization_id = 'bd140000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'bd140000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.customers where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.products where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'bd140000-0000-4000-8000-000000000001';
delete from public.profiles where id = 'bd240000-0000-4000-8000-000000000001';
delete from auth.sessions where user_id = 'bd240000-0000-4000-8000-000000000001';
delete from auth.users where id = 'bd240000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'bd140000-0000-4000-8000-000000000001';
commit;

do $$
begin
  if not (select was_installed from repair_quote_concurrency_extension_state) then
    drop extension dblink;
  end if;
end;
$$;
