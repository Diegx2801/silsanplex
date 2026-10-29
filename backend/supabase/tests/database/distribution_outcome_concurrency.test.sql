-- Fixture and worker current_date values represent the Peru business date.
set timezone = 'America/Lima';

create temporary table distribution_outcome_dblink_state (was_installed boolean not null);
insert into distribution_outcome_dblink_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');
create extension if not exists dblink with schema extensions;

select plan(34);

-- Recover only this suite's fixed isolated fixtures from an interrupted run.
begin;
drop schema if exists distribution_outcome_concurrency_test cascade;
alter table public.distribution_deliveries disable trigger distribution_deliveries_require_outcome;
update public.distribution_deliveries set last_outcome_id = null
where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.distribution_delivery_outcome_lines where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.distribution_delivery_outcomes where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.distribution_delivery_items where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.distribution_deliveries where organization_id = 'd2c30000-0000-4000-8000-000000000001';
alter table public.distribution_deliveries enable trigger distribution_deliveries_require_outcome;
delete from public.order_items where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.orders where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'd2c30000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'd2c30000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.customers where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'd2c30000-0000-4000-8000-000000000001';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'd2c30000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
delete from public.profiles where id = 'e2c30000-0000-4000-8000-000000000001';
delete from auth.users where id = 'e2c30000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'd2c30000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug)
values ('d2c30000-0000-4000-8000-000000000001', 'Outcome concurrency test', 'outcome-concurrency-test');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('e2c30000-0000-4000-8000-000000000001', 'outcome-concurrency@test.local', '{"full_name":"Outcome concurrency test"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('d2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('d2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001', 'LOGISTICA');
insert into public.customers (id, organization_id, document_type, document_number, legal_name, created_by, updated_by)
values ('c2c30000-0000-4000-8000-000000000001', 'd2c30000-0000-4000-8000-000000000001', 'RUC', '20263000001', 'Outcome concurrency customer', 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001');
insert into public.products (
  id, organization_id, code, description, unit_of_measure, tax_affectation, batch_control,
  product_type, created_by, updated_by
) values (
  'b2c30000-0000-4000-8000-000000000001', 'd2c30000-0000-4000-8000-000000000001', 'OUT-CONC-1', 'Outcome concurrency item', 'UND', 'gravado', false, 'good', 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001'
);
insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values ('a2c30000-0000-4000-8000-000000000001', 'd2c30000-0000-4000-8000-000000000001', 'OUTC', 'Outcome concurrency warehouse', 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001');

insert into public.orders (
  id, organization_id, order_number, customer_id, warehouse_id, delivery_address_snapshot,
  order_date, status, fulfillment_status, operation_key, created_by, updated_by
) values
  ('a2c30000-0000-4000-8000-000000000011', 'd2c30000-0000-4000-8000-000000000001', 'PED-260011', 'c2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000001', '{"address_line":"Concurrency 1"}', current_date - 1, 'confirmado', 'dispatched', 'a2c30000-0000-4000-8000-000000000111', 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001'),
  ('a2c30000-0000-4000-8000-000000000012', 'd2c30000-0000-4000-8000-000000000001', 'PED-260012', 'c2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000001', '{"address_line":"Concurrency 2"}', current_date - 1, 'confirmado', 'dispatched', 'a2c30000-0000-4000-8000-000000000112', 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001'),
  ('a2c30000-0000-4000-8000-000000000013', 'd2c30000-0000-4000-8000-000000000001', 'PED-260013', 'c2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000001', '{"address_line":"Concurrency 3"}', current_date - 1, 'confirmado', 'dispatched', 'a2c30000-0000-4000-8000-000000000113', 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001'),
  ('a2c30000-0000-4000-8000-000000000014', 'd2c30000-0000-4000-8000-000000000001', 'PED-260014', 'c2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000001', '{"address_line":"Concurrency 4"}', current_date - 1, 'confirmado', 'dispatched', 'a2c30000-0000-4000-8000-000000000114', 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001');

insert into public.order_items (
  id, organization_id, order_id, product_id, product_code, product_description,
  unit_of_measure, quantity, unit_price
) values
  ('a2c30000-0000-4000-8000-000000000101', 'd2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000011', 'b2c30000-0000-4000-8000-000000000001', 'OUT-CONC-1', 'Outcome concurrency item', 'UND', 6, 10),
  ('a2c30000-0000-4000-8000-000000000102', 'd2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000012', 'b2c30000-0000-4000-8000-000000000001', 'OUT-CONC-1', 'Outcome concurrency item', 'UND', 6, 10),
  ('a2c30000-0000-4000-8000-000000000103', 'd2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000013', 'b2c30000-0000-4000-8000-000000000001', 'OUT-CONC-1', 'Outcome concurrency item', 'UND', 6, 10),
  ('a2c30000-0000-4000-8000-000000000104', 'd2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000014', 'b2c30000-0000-4000-8000-000000000001', 'OUT-CONC-1', 'Outcome concurrency item', 'UND', 6, 10);

-- These fixtures represent shipments already dispatched through Ventas.
-- Bypass only the creation-time fulfillment guard while inserting fixtures.
alter table public.distribution_deliveries disable trigger distribution_deliveries_require_fulfilled_order;
insert into public.distribution_deliveries (
  id, organization_id, order_id, order_number, customer_name, issue_date, delivery_date,
  guide_number, transport_type, tracking_status, delivery_status, modalidad, transportista,
  conductor, vehiculo, placa, evidencia, incidencias, direction, numero_despacho, order_items,
  created_by, updated_by
) values
  ('f2c30000-0000-4000-8000-000000000001', 'd2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000011', 'PED-260011', 'Outcome concurrency customer', current_date - 1, current_date, 'OUT-CONC-GUIDE-1', 'interno', 'en_curso', 'programado', 'movilidad_propia', '', 'E2E Driver', 'E2E Vehicle', 'E2E-001', '', '[]'::jsonb, 'Concurrency 1', 'OUT-CONC-DESPATCH-1', jsonb_build_array(jsonb_build_object('id', 'a2c30000-0000-4000-8000-000000000101', 'cantidad', 6)), 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001'),
  ('f2c30000-0000-4000-8000-000000000002', 'd2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000012', 'PED-260012', 'Outcome concurrency customer', current_date - 1, current_date, 'OUT-CONC-GUIDE-2', 'interno', 'en_curso', 'programado', 'movilidad_propia', '', 'E2E Driver', 'E2E Vehicle', 'E2E-002', '', '[]'::jsonb, 'Concurrency 2', 'OUT-CONC-DESPATCH-2', jsonb_build_array(jsonb_build_object('id', 'a2c30000-0000-4000-8000-000000000102', 'cantidad', 6)), 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001'),
  ('f2c30000-0000-4000-8000-000000000003', 'd2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000013', 'PED-260013', 'Outcome concurrency customer', current_date - 1, current_date, 'OUT-CONC-GUIDE-3', 'interno', 'en_curso', 'programado', 'movilidad_propia', '', 'E2E Driver', 'E2E Vehicle', 'E2E-003', '', '[]'::jsonb, 'Concurrency 3', 'OUT-CONC-DESPATCH-3', jsonb_build_array(jsonb_build_object('id', 'a2c30000-0000-4000-8000-000000000103', 'cantidad', 6)), 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001'),
  ('f2c30000-0000-4000-8000-000000000004', 'd2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000014', 'PED-260014', 'Outcome concurrency customer', current_date - 1, current_date, 'OUT-CONC-GUIDE-4A', 'interno', 'en_curso', 'programado', 'movilidad_propia', '', 'E2E Driver', 'E2E Vehicle', 'E2E-004', '', '[]'::jsonb, 'Concurrency 4A', 'OUT-CONC-DESPATCH-4A', jsonb_build_array(jsonb_build_object('id', 'a2c30000-0000-4000-8000-000000000104', 'cantidad', 3)), 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001'),
  ('f2c30000-0000-4000-8000-000000000005', 'd2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000014', 'PED-260014', 'Outcome concurrency customer', current_date - 1, current_date, 'OUT-CONC-GUIDE-4B', 'interno', 'en_curso', 'programado', 'movilidad_propia', '', 'E2E Driver', 'E2E Vehicle', 'E2E-005', '', '[]'::jsonb, 'Concurrency 4B', 'OUT-CONC-DESPATCH-4B', jsonb_build_array(jsonb_build_object('id', 'a2c30000-0000-4000-8000-000000000104', 'cantidad', 3)), 'e2c30000-0000-4000-8000-000000000001', 'e2c30000-0000-4000-8000-000000000001');
alter table public.distribution_deliveries enable trigger distribution_deliveries_require_fulfilled_order;

update public.distribution_deliveries set delivery_status = 'preparando'
where organization_id = 'd2c30000-0000-4000-8000-000000000001';
update public.distribution_deliveries set delivery_status = 'en_curso'
where organization_id = 'd2c30000-0000-4000-8000-000000000001';
update public.distribution_deliveries set delivery_status = 'en_destino', tracking_status = 'en_destino'
where organization_id = 'd2c30000-0000-4000-8000-000000000001';

insert into public.distribution_delivery_items (organization_id, delivery_id, order_id, order_line_id, quantity) values
  ('d2c30000-0000-4000-8000-000000000001', 'f2c30000-0000-4000-8000-000000000001', 'a2c30000-0000-4000-8000-000000000011', 'a2c30000-0000-4000-8000-000000000101', 6),
  ('d2c30000-0000-4000-8000-000000000001', 'f2c30000-0000-4000-8000-000000000002', 'a2c30000-0000-4000-8000-000000000012', 'a2c30000-0000-4000-8000-000000000102', 6),
  ('d2c30000-0000-4000-8000-000000000001', 'f2c30000-0000-4000-8000-000000000003', 'a2c30000-0000-4000-8000-000000000013', 'a2c30000-0000-4000-8000-000000000103', 6),
  ('d2c30000-0000-4000-8000-000000000001', 'f2c30000-0000-4000-8000-000000000004', 'a2c30000-0000-4000-8000-000000000014', 'a2c30000-0000-4000-8000-000000000104', 3),
  ('d2c30000-0000-4000-8000-000000000001', 'f2c30000-0000-4000-8000-000000000005', 'a2c30000-0000-4000-8000-000000000014', 'a2c30000-0000-4000-8000-000000000104', 3);

create schema distribution_outcome_concurrency_test;
create function distribution_outcome_concurrency_test.worker(payload jsonb)
returns text
language plpgsql
as $$
declare
  result_id uuid;
  result_state text;
  result_message text;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', 'e2c30000-0000-4000-8000-000000000001', false);
  result_id := public.record_distribution_delivery_outcome(payload);
  return 'ok:' || result_id::text;
exception when others then
  get stacked diagnostics result_state = returned_sqlstate, result_message = message_text;
  return 'error:' || result_state || ':' || result_message;
end;
$$;

create function distribution_outcome_concurrency_test.pause_selected_outcomes()
returns trigger
language plpgsql
as $$
begin
  if new.operation_key in (
    'd2c3a000-0000-4000-8000-000000000001'::uuid,
    'd2c3a000-0000-4000-8000-000000000002'::uuid,
    'd2c3a000-0000-4000-8000-000000000003'::uuid,
    'd2c3a000-0000-4000-8000-000000000004'::uuid
  ) then
    perform pg_catalog.pg_advisory_xact_lock(907290300002000001);
  end if;
  return new;
end;
$$;
create trigger distribution_outcome_concurrency_test_pause
before insert on public.distribution_delivery_outcomes
for each row execute function distribution_outcome_concurrency_test.pause_selected_outcomes();

create function distribution_outcome_concurrency_test.wait_for_two_blocked_workers(pid_a integer, pid_b integer)
returns boolean
language plpgsql
as $$
declare
  blocked_count integer;
  active_count integer;
begin
  for attempt in 1..1000 loop
    select count(distinct lock_row.pid)::integer into blocked_count
    from pg_catalog.pg_locks lock_row
    where lock_row.pid in (pid_a, pid_b) and not lock_row.granted;
    if blocked_count = 2 then return true; end if;

    -- A failed worker can finish before taking the test lock. Do not spend the
    -- full ten-second polling window waiting for a lock that cannot appear.
    if attempt = 100 then
      perform pg_catalog.pg_stat_clear_snapshot();
      select count(*)::integer into active_count
      from pg_catalog.pg_stat_activity
      where pid in (pid_a, pid_b) and state = 'active';
      if active_count < 2 then return false; end if;
    end if;

    perform pg_catalog.pg_sleep(0.01);
  end loop;
  return false;
end;
$$;
commit;

select extensions.dblink_connect(
  'outcome_worker_a',
  pg_catalog.format('host=%s port=%s dbname=postgres user=postgres password=postgres', pg_catalog.host(pg_catalog.inet_server_addr()), pg_catalog.inet_server_port())
);
select extensions.dblink_connect(
  'outcome_worker_b',
  pg_catalog.format('host=%s port=%s dbname=postgres user=postgres password=postgres', pg_catalog.host(pg_catalog.inet_server_addr()), pg_catalog.inet_server_port())
);
select extensions.dblink_exec('outcome_worker_a', 'set timezone = ''America/Lima''');
select extensions.dblink_exec('outcome_worker_b', 'set timezone = ''America/Lima''');
create temporary table distribution_outcome_workers (worker_name text primary key, process_id integer not null);
insert into distribution_outcome_workers
select 'a', process_id from extensions.dblink('outcome_worker_a', 'select pg_backend_pid()') as worker(process_id integer);
insert into distribution_outcome_workers
select 'b', process_id from extensions.dblink('outcome_worker_b', 'select pg_backend_pid()') as worker(process_id integer);
create temporary table distribution_outcome_results (worker_name text primary key, result text not null);
select isnt(
  (select process_id from distribution_outcome_workers where worker_name = 'a'),
  (select process_id from distribution_outcome_workers where worker_name = 'b'),
  'concurrent outcome calls use two independent PostgreSQL sessions'
);

select pg_catalog.pg_advisory_lock(907290300002000001);
select is(extensions.dblink_send_query('outcome_worker_a', $$select distribution_outcome_concurrency_test.worker(jsonb_build_object('organizationId','d2c30000-0000-4000-8000-000000000001','entregaId','f2c30000-0000-4000-8000-000000000001','expectedLockVersion',1,'operationKey','d2c3a000-0000-4000-8000-000000000001','resultado','entrega_parcial','fecha',current_date,'evidencia','same','lineas',jsonb_build_array(jsonb_build_object('orderLineId','a2c30000-0000-4000-8000-000000000101','cantidad',2))))$$), 1, 'starts the first identical retry session');
select is(extensions.dblink_send_query('outcome_worker_b', $$select distribution_outcome_concurrency_test.worker(jsonb_build_object('organizationId','d2c30000-0000-4000-8000-000000000001','entregaId','f2c30000-0000-4000-8000-000000000001','expectedLockVersion',1,'operationKey','d2c3a000-0000-4000-8000-000000000001','resultado','entrega_parcial','fecha',current_date,'evidencia','same','lineas',jsonb_build_array(jsonb_build_object('orderLineId','a2c30000-0000-4000-8000-000000000101','cantidad',2))))$$), 1, 'starts the second identical retry session');
select ok(distribution_outcome_concurrency_test.wait_for_two_blocked_workers(
  (select process_id from distribution_outcome_workers where worker_name = 'a'),
  (select process_id from distribution_outcome_workers where worker_name = 'b')
), 'both identical callers overlap at the operation key');
select ok(pg_catalog.pg_advisory_unlock(907290300002000001), 'releases the identical-call barrier');
insert into distribution_outcome_results
select 'a', result from extensions.dblink_get_result('outcome_worker_a') as response(result text);
insert into distribution_outcome_results
select 'b', result from extensions.dblink_get_result('outcome_worker_b') as response(result text);
select * from extensions.dblink_get_result('outcome_worker_a') as response(result text);
select * from extensions.dblink_get_result('outcome_worker_b') as response(result text);
select is((select count(*) from distribution_outcome_results where result like 'ok:%'), 2::bigint, 'both identical concurrent calls succeed');
select is((select count(distinct substring(result from 4)) from distribution_outcome_results), 1::bigint, 'identical concurrent calls return the same UUID');
select is((select count(*) from public.distribution_delivery_outcomes where operation_key = 'd2c3a000-0000-4000-8000-000000000001'), 1::bigint, 'identical concurrent calls persist one outcome');
select is((select count(*) from public.distribution_delivery_outcome_lines where outcome_id = (select id from public.distribution_delivery_outcomes where operation_key = 'd2c3a000-0000-4000-8000-000000000001')), 1::bigint, 'identical concurrent calls persist one line');
select is((select count(*) from public.audit_events where action = 'DISTRIBUTION_OUTCOME_RECORDED' and entity_id = 'f2c30000-0000-4000-8000-000000000001'), 1::bigint, 'identical concurrent calls create one audit event');
select is((select lock_version from public.distribution_deliveries where id = 'f2c30000-0000-4000-8000-000000000001'), 2::bigint, 'identical concurrent calls advance the version once');

truncate distribution_outcome_results;
select pg_catalog.pg_advisory_lock(907290300002000001);
select is(extensions.dblink_send_query('outcome_worker_a', $$select distribution_outcome_concurrency_test.worker(jsonb_build_object('organizationId','d2c30000-0000-4000-8000-000000000001','entregaId','f2c30000-0000-4000-8000-000000000002','expectedLockVersion',1,'operationKey','d2c3a000-0000-4000-8000-000000000002','resultado','entrega_parcial','fecha',current_date,'evidencia','conflicting payload','lineas',jsonb_build_array(jsonb_build_object('orderLineId','a2c30000-0000-4000-8000-000000000102','cantidad',2))))$$), 1, 'starts the first conflicting-key session');
select is(extensions.dblink_send_query('outcome_worker_b', $$select distribution_outcome_concurrency_test.worker(jsonb_build_object('organizationId','d2c30000-0000-4000-8000-000000000001','entregaId','f2c30000-0000-4000-8000-000000000002','expectedLockVersion',1,'operationKey','d2c3a000-0000-4000-8000-000000000002','resultado','entrega_parcial','fecha',current_date,'evidencia','conflicting payload','lineas',jsonb_build_array(jsonb_build_object('orderLineId','a2c30000-0000-4000-8000-000000000102','cantidad',3))))$$), 1, 'starts the second conflicting-key session');
select ok(distribution_outcome_concurrency_test.wait_for_two_blocked_workers(
  (select process_id from distribution_outcome_workers where worker_name = 'a'),
  (select process_id from distribution_outcome_workers where worker_name = 'b')
), 'both incompatible callers overlap before the winner commits');
select ok(pg_catalog.pg_advisory_unlock(907290300002000001), 'releases the conflicting-call barrier');
insert into distribution_outcome_results
select 'a', result from extensions.dblink_get_result('outcome_worker_a') as response(result text);
insert into distribution_outcome_results
select 'b', result from extensions.dblink_get_result('outcome_worker_b') as response(result text);
select * from extensions.dblink_get_result('outcome_worker_a') as response(result text);
select * from extensions.dblink_get_result('outcome_worker_b') as response(result text);
select is((select count(*) from distribution_outcome_results where result like 'ok:%'), 1::bigint, 'one incompatible same-key request wins');
select is((select count(*) from distribution_outcome_results where result = 'error:P0001:DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED'), 1::bigint, 'the incompatible same-key request is rejected');
select is((select count(*) from public.distribution_delivery_outcomes where operation_key = 'd2c3a000-0000-4000-8000-000000000002'), 1::bigint, 'conflicting concurrent calls persist one outcome');
select is((select count(*) from public.audit_events where action = 'DISTRIBUTION_OUTCOME_RECORDED' and entity_id = 'f2c30000-0000-4000-8000-000000000002'), 1::bigint, 'the losing conflicting call creates no audit event');
select is((select lock_version from public.distribution_deliveries where id = 'f2c30000-0000-4000-8000-000000000002'), 2::bigint, 'the losing conflicting call does not advance the version');

truncate distribution_outcome_results;
begin;
select id from public.distribution_deliveries where id = 'f2c30000-0000-4000-8000-000000000003' for update;
select is(extensions.dblink_send_query('outcome_worker_a', $$select distribution_outcome_concurrency_test.worker(jsonb_build_object('organizationId','d2c30000-0000-4000-8000-000000000001','entregaId','f2c30000-0000-4000-8000-000000000003','expectedLockVersion',1,'operationKey','d2c3a000-0000-4000-8000-000000000003','resultado','entrega_parcial','fecha',current_date,'evidencia','key one','lineas',jsonb_build_array(jsonb_build_object('orderLineId','a2c30000-0000-4000-8000-000000000103','cantidad',2))))$$), 1, 'starts the first distinct-key version contender');
select is(extensions.dblink_send_query('outcome_worker_b', $$select distribution_outcome_concurrency_test.worker(jsonb_build_object('organizationId','d2c30000-0000-4000-8000-000000000001','entregaId','f2c30000-0000-4000-8000-000000000003','expectedLockVersion',1,'operationKey','d2c3a000-0000-4000-8000-000000000004','resultado','entrega_parcial','fecha',current_date,'evidencia','key two','lineas',jsonb_build_array(jsonb_build_object('orderLineId','a2c30000-0000-4000-8000-000000000103','cantidad',3))))$$), 1, 'starts the second distinct-key version contender');
select ok(distribution_outcome_concurrency_test.wait_for_two_blocked_workers(
  (select process_id from distribution_outcome_workers where worker_name = 'a'),
  (select process_id from distribution_outcome_workers where worker_name = 'b')
), 'both distinct-key requests wait on the same delivery row');
commit;
insert into distribution_outcome_results
select 'a', result from extensions.dblink_get_result('outcome_worker_a') as response(result text);
insert into distribution_outcome_results
select 'b', result from extensions.dblink_get_result('outcome_worker_b') as response(result text);
select * from extensions.dblink_get_result('outcome_worker_a') as response(result text);
select * from extensions.dblink_get_result('outcome_worker_b') as response(result text);
select is((select count(*) from distribution_outcome_results where result like 'ok:%'), 1::bigint, 'one distinct-key request with the shared version succeeds');
select is((select count(*) from distribution_outcome_results where result = 'error:P0001:DISTRIBUTION_VERSION_CONFLICT'), 1::bigint, 'the stale distinct-key request is rejected by optimistic concurrency');
select is((select count(*) from public.distribution_delivery_outcomes where delivery_id = 'f2c30000-0000-4000-8000-000000000003'), 1::bigint, 'distinct-key version contention persists one result');
select is((select lock_version from public.distribution_deliveries where id = 'f2c30000-0000-4000-8000-000000000003'), 2::bigint, 'distinct-key version contention advances once');

truncate distribution_outcome_results;
begin;
select id from public.orders where id = 'a2c30000-0000-4000-8000-000000000014' for update;
select is(extensions.dblink_send_query('outcome_worker_a', $$select distribution_outcome_concurrency_test.worker(jsonb_build_object('organizationId','d2c30000-0000-4000-8000-000000000001','entregaId','f2c30000-0000-4000-8000-000000000004','expectedLockVersion',1,'operationKey','d2c3a000-0000-4000-8000-000000000005','resultado','entregado','fecha',current_date,'evidencia','delivery four A','lineas',jsonb_build_array(jsonb_build_object('orderLineId','a2c30000-0000-4000-8000-000000000104','cantidad',3))))$$), 1, 'starts the first delivery for the shared order');
select is(extensions.dblink_send_query('outcome_worker_b', $$select distribution_outcome_concurrency_test.worker(jsonb_build_object('organizationId','d2c30000-0000-4000-8000-000000000001','entregaId','f2c30000-0000-4000-8000-000000000005','expectedLockVersion',1,'operationKey','d2c3a000-0000-4000-8000-000000000006','resultado','entregado','fecha',current_date,'evidencia','delivery four B','lineas',jsonb_build_array(jsonb_build_object('orderLineId','a2c30000-0000-4000-8000-000000000104','cantidad',3))))$$), 1, 'starts the second delivery for the shared order');
select ok(distribution_outcome_concurrency_test.wait_for_two_blocked_workers(
  (select process_id from distribution_outcome_workers where worker_name = 'a'),
  (select process_id from distribution_outcome_workers where worker_name = 'b')
), 'both deliveries reach the shared fulfillment-order lock concurrently');
commit;
insert into distribution_outcome_results
select 'a', result from extensions.dblink_get_result('outcome_worker_a') as response(result text);
insert into distribution_outcome_results
select 'b', result from extensions.dblink_get_result('outcome_worker_b') as response(result text);
select * from extensions.dblink_get_result('outcome_worker_a') as response(result text);
select * from extensions.dblink_get_result('outcome_worker_b') as response(result text);
select is((select count(*) from distribution_outcome_results where result like 'ok:%'), 2::bigint, 'both different-delivery outcomes succeed');
select is((select count(*) from public.distribution_delivery_outcomes where delivery_id in ('f2c30000-0000-4000-8000-000000000004', 'f2c30000-0000-4000-8000-000000000005')), 2::bigint, 'both outcomes are persisted once');
select is((select fulfillment_status from public.orders where id = 'a2c30000-0000-4000-8000-000000000014'), 'delivered', 'concurrent delivery results preserve the aggregate order state');
select is((select count(*) from public.distribution_deliveries where id in ('f2c30000-0000-4000-8000-000000000004', 'f2c30000-0000-4000-8000-000000000005') and delivery_status = 'entregado' and lock_version = 2), 2::bigint, 'both delivery states and versions reach their terminal values');

select extensions.dblink_disconnect('outcome_worker_a');
select extensions.dblink_disconnect('outcome_worker_b');
drop trigger distribution_outcome_concurrency_test_pause on public.distribution_delivery_outcomes;
drop function distribution_outcome_concurrency_test.pause_selected_outcomes();
drop function distribution_outcome_concurrency_test.wait_for_two_blocked_workers(integer, integer);
drop function distribution_outcome_concurrency_test.worker(jsonb);
drop schema distribution_outcome_concurrency_test;

begin;
alter table public.distribution_deliveries disable trigger distribution_deliveries_require_outcome;
update public.distribution_deliveries set last_outcome_id = null
where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.distribution_delivery_outcome_lines where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.distribution_delivery_outcomes where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.distribution_delivery_items where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.distribution_deliveries where organization_id = 'd2c30000-0000-4000-8000-000000000001';
alter table public.distribution_deliveries enable trigger distribution_deliveries_require_outcome;
delete from public.order_items where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.orders where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.customers where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'd2c30000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'd2c30000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'd2c30000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'd2c30000-0000-4000-8000-000000000001';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'd2c30000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
delete from public.profiles where id = 'e2c30000-0000-4000-8000-000000000001';
delete from auth.users where id = 'e2c30000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'd2c30000-0000-4000-8000-000000000001';
commit;

do $$
begin
  if not (select was_installed from distribution_outcome_dblink_state) then
    drop extension if exists dblink;
  end if;
end;
$$;

select * from finish();
