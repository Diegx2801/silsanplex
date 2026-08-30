-- Cada entrada a testing inicia un ciclo explicito. Las pruebas historicas se
-- asocian solo cuando repair_events demuestra de forma inequivoca su ciclo.

alter table public.repairs
  add column current_test_cycle_number integer not null default 0,
  add constraint repairs_current_test_cycle_number_valid
    check (current_test_cycle_number >= 0);

alter table public.repair_tests
  add column test_cycle_number integer,
  add constraint repair_tests_cycle_number_valid
    check (test_cycle_number is null or test_cycle_number > 0);

create index repair_tests_repair_cycle_result_idx
  on public.repair_tests (
    organization_id, repair_id, test_cycle_number, passed, created_at, id
  );

-- El id bigint de repair_events conserva el orden transaccional entre la
-- entrada a testing y TEST_COMPLETED, sin depender de completed_at manipulable.
with testing_entries as (
  select
    event.organization_id,
    event.repair_id,
    event.id as event_id,
    row_number() over (
      partition by event.organization_id, event.repair_id
      order by event.id
    )::integer as cycle_number
  from public.repair_events event
  where event.event_type = 'STATUS_CHANGED'
    and event.to_status = 'testing'
    and event.from_status is distinct from 'testing'
), cycle_totals as (
  select organization_id, repair_id, max(cycle_number) as cycle_number
  from testing_entries
  group by organization_id, repair_id
)
update public.repairs repair
set current_test_cycle_number = cycle_totals.cycle_number
from cycle_totals
where repair.organization_id = cycle_totals.organization_id
  and repair.id = cycle_totals.repair_id;

with testing_entries as (
  select
    event.organization_id,
    event.repair_id,
    event.id as event_id,
    row_number() over (
      partition by event.organization_id, event.repair_id
      order by event.id
    )::integer as cycle_number
  from public.repair_events event
  where event.event_type = 'STATUS_CHANGED'
    and event.to_status = 'testing'
    and event.from_status is distinct from 'testing'
), unique_test_events as (
  select
    test.organization_id,
    test.repair_id,
    test.id as test_id,
    min(event.id) as test_event_id
  from public.repair_tests test
  join public.repair_events event
    on event.organization_id = test.organization_id
   and event.repair_id = test.repair_id
   and event.event_type = 'TEST_COMPLETED'
   and event.from_status = 'testing'
   and event.to_status = 'testing'
   and event.metadata ->> 'test_id' = test.id::text
  group by test.organization_id, test.repair_id, test.id
  having count(*) = 1
), resolved_cycles as (
  select
    test_event.organization_id,
    test_event.test_id,
    entry.cycle_number
  from unique_test_events test_event
  join testing_entries entry
    on entry.organization_id = test_event.organization_id
   and entry.repair_id = test_event.repair_id
   and entry.event_id < test_event.test_event_id
  where not exists (
    select 1
    from public.repair_events later_status
    where later_status.organization_id = test_event.organization_id
      and later_status.repair_id = test_event.repair_id
      and later_status.to_status is not null
      and later_status.from_status is distinct from later_status.to_status
      and later_status.id > entry.event_id
      and later_status.id < test_event.test_event_id
  )
)
update public.repair_tests test
set test_cycle_number = resolved_cycles.cycle_number
from resolved_cycles
where test.organization_id = resolved_cycles.organization_id
  and test.id = resolved_cycles.test_id
  and resolved_cycles.cycle_number > 0;

-- Si una base historica esta actualmente en testing sin evento reconstruible,
-- se abre un ciclo de compatibilidad para pruebas futuras. Las pruebas antiguas
-- ambiguas permanecen con ciclo NULL y nunca se reinterpretan.
update public.repairs repair
set current_test_cycle_number = 1
where repair.status = 'testing'
  and repair.current_test_cycle_number = 0;

create or replace function public.enforce_repair_test_current_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_status text;
  current_cycle integer;
begin
  select repair.status, repair.current_test_cycle_number
  into repair_status, current_cycle
  from public.repairs repair
  where repair.organization_id = new.organization_id
    and repair.id = new.repair_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_status <> 'testing' then
    raise exception using errcode = 'P0001', message = 'REPAIR_TESTING_STATE_REQUIRED';
  end if;
  if new.test_cycle_number is null
    or current_cycle <= 0
    or new.test_cycle_number <> current_cycle
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_TEST_CYCLE_INVALID';
  end if;

  return new;
end;
$$;

create trigger repair_tests_enforce_current_cycle
before insert on public.repair_tests
for each row execute function public.enforce_repair_test_current_cycle();

create or replace function public.assert_repair_ready_for_delivery(
  requested_organization_id uuid,
  requested_repair_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_row public.repairs%rowtype;
begin
  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_row.status not in ('testing', 'ready_for_delivery') then
    raise exception using errcode = 'P0001', message = 'REPAIR_READY_GATE_STATE_INVALID';
  end if;
  if repair_row.assigned_technician_id is null
    or not public.repair_technician_is_active(
      requested_organization_id, repair_row.assigned_technician_id
    )
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_ASSIGNED_TECHNICIAN_REQUIRED';
  end if;
  if exists (
    select 1
    from public.repair_tests test
    where test.organization_id = requested_organization_id
      and test.repair_id = requested_repair_id
      and test.test_cycle_number = repair_row.current_test_cycle_number
      and not test.passed
  ) then
    raise exception using errcode = 'P0001', message = 'REPAIR_FAILED_TEST_PRESENT';
  end if;
  if repair_row.current_test_cycle_number <= 0
    or not exists (
      select 1
      from public.repair_tests test
      where test.organization_id = requested_organization_id
        and test.repair_id = requested_repair_id
        and test.test_cycle_number = repair_row.current_test_cycle_number
        and test.passed
    )
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_APPROVED_TEST_REQUIRED';
  end if;
  if exists (
    select 1
    from public.repair_parts part
    where part.organization_id = requested_organization_id
      and part.repair_id = requested_repair_id
      and part.status = 'reserved'
      and part.quantity_consumed < part.quantity_requested
  ) then
    raise exception using errcode = 'P0001', message = 'REPAIR_PENDING_PARTS';
  end if;
end;
$$;

create or replace function public.change_repair_status(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_status text,
  requested_observation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  repair_row public.repairs%rowtype;
  target_status text := lower(btrim(requested_status));
  next_cycle integer;
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_CHANGE_STATUS');
  if target_status in ('quote_approved', 'rejected', 'delivered', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'REPAIR_SPECIALIZED_STATUS_REQUIRED';
  end if;

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if not public.repair_status_transition_allowed(repair_row.status, target_status) then
    raise exception using errcode = 'P0001', message = 'REPAIR_STATUS_TRANSITION_INVALID';
  end if;
  if target_status = 'waiting_customer_approval'
    and not exists (
      select 1
      from public.repair_quotes quote
      where quote.organization_id = requested_organization_id
        and quote.repair_id = requested_repair_id
        and quote.status = 'pending'
    )
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_PENDING_QUOTE_REQUIRED';
  end if;
  if target_status = 'ready_for_delivery' then
    perform public.assert_repair_ready_for_delivery(
      requested_organization_id, requested_repair_id
    );
  end if;

  next_cycle := case
    when target_status = 'testing' then repair_row.current_test_cycle_number + 1
    else repair_row.current_test_cycle_number
  end;

  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = target_status,
      current_test_cycle_number = next_cycle,
      updated_by = actor_id
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'STATUS_CHANGED',
    repair_row.status,
    target_status,
    actor_id,
    requested_observation,
    case
      when target_status = 'testing'
        then jsonb_build_object('test_cycle_number', next_cycle)
      else '{}'::jsonb
    end,
    'REPAIR_STATUS_CHANGED'
  );
end;
$$;

create or replace function public.record_repair_test(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id uuid := nullif(payload ->> 'repair_id', '')::uuid;
  performed_by_id uuid;
  test_type_value text := nullif(btrim(payload ->> 'test_type'), '');
  result_value text := nullif(btrim(payload ->> 'result'), '');
  passed_value boolean;
  notes_value text := nullif(btrim(payload ->> 'notes'), '');
  completed_at_value timestamptz := coalesce(nullif(payload ->> 'completed_at', '')::timestamptz, now());
  repair_row public.repairs%rowtype;
  test_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_CHANGE_STATUS');
  if not (payload ? 'passed') or jsonb_typeof(payload -> 'passed') <> 'boolean' then
    raise exception using errcode = '22023', message = 'REPAIR_TEST_RESULT_REQUIRED';
  end if;
  passed_value := (payload ->> 'passed')::boolean;

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = organization_id
    and repair.id = repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_row.status <> 'testing' then
    raise exception using errcode = 'P0001', message = 'REPAIR_TESTING_STATE_REQUIRED';
  end if;
  if repair_row.current_test_cycle_number <= 0 then
    raise exception using errcode = 'P0001', message = 'REPAIR_TEST_CYCLE_INVALID';
  end if;
  if test_type_value is null or result_value is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_TEST_DATA_REQUIRED';
  end if;

  performed_by_id := nullif(payload ->> 'performed_by', '')::uuid;
  performed_by_id := coalesce(performed_by_id, repair_row.assigned_technician_id, actor_id);
  if performed_by_id is null
    or not public.repair_technician_is_active(organization_id, performed_by_id)
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICIAN_UNAVAILABLE';
  end if;

  insert into public.repair_tests (
    organization_id, repair_id, test_cycle_number, test_type, result, passed,
    performed_by, notes, completed_at, created_by
  ) values (
    organization_id, repair_id, repair_row.current_test_cycle_number,
    test_type_value, result_value, passed_value, performed_by_id, notes_value,
    completed_at_value, actor_id
  ) returning id into test_id;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'TEST_COMPLETED',
    repair_row.status,
    repair_row.status,
    actor_id,
    notes_value,
    jsonb_build_object(
      'test_id', test_id,
      'test_cycle_number', repair_row.current_test_cycle_number,
      'passed', passed_value,
      'test_type', test_type_value
    ),
    'REPAIR_TEST_COMPLETED'
  );
  return test_id;
end;
$$;

create or replace function public.deliver_repair(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_observation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  repair_row public.repairs%rowtype;
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_DELIVER');
  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_row.status <> 'ready_for_delivery' then
    raise exception using errcode = 'P0001', message = 'REPAIR_DELIVERY_STATE_REQUIRED';
  end if;

  perform public.assert_repair_ready_for_delivery(
    requested_organization_id, requested_repair_id
  );

  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = 'delivered', delivered_at = now(), updated_by = actor_id
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'DELIVERED',
    repair_row.status,
    'delivered',
    actor_id,
    requested_observation,
    '{}'::jsonb,
    'REPAIR_DELIVERED'
  );
end;
$$;

revoke all on function public.enforce_repair_test_current_cycle()
  from public, anon, authenticated, service_role;
revoke all on function public.assert_repair_ready_for_delivery(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.change_repair_status(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.record_repair_test(jsonb)
  from public, anon, authenticated;
revoke all on function public.deliver_repair(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.change_repair_status(uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.record_repair_test(jsonb)
  to authenticated, service_role;
grant execute on function public.deliver_repair(uuid, uuid, text)
  to authenticated, service_role;

comment on column public.repairs.current_test_cycle_number is
  'Numero del ultimo ciclo iniciado al entrar a testing.';
comment on column public.repair_tests.test_cycle_number is
  'Ciclo explicito de la prueba; NULL conserva historia legacy ambigua.';
comment on function public.assert_repair_ready_for_delivery(uuid, uuid) is
  'Gate canonico de tecnico, ciclo vigente aprobado y repuestos pendientes.';
