begin;
select no_plan();

create temporary table rdt_ids(label text primary key, id uuid default gen_random_uuid());
insert into rdt_ids(label) values ('org'), ('admin');
create function pg_temp.rdt_id(text) returns uuid language sql as
  $$ select id from rdt_ids where label = $1 $$;
create function pg_temp.rdt_claim(text) returns text language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', pg_temp.rdt_id($1),
    'session_id', pg_temp.rdt_id($1)
  )::text, true)
$$;

insert into public.organizations(id, name, slug, legal_name)
values (pg_temp.rdt_id('org'), 'Diagnosis triage tests', 'diagnosis-triage-tests', 'Diagnosis triage tests SAC');
insert into auth.users(id, email, raw_user_meta_data, created_at, updated_at)
values (pg_temp.rdt_id('admin'), 'diagnosis-triage@example.invalid',
  '{"full_name":"Diagnosis triage admin"}', now(), now());
insert into auth.sessions(id, user_id, created_at, updated_at)
values (pg_temp.rdt_id('admin'), pg_temp.rdt_id('admin'), now(), now());
insert into public.organization_memberships(organization_id, user_id)
values (pg_temp.rdt_id('org'), pg_temp.rdt_id('admin'));
insert into public.user_roles(organization_id, user_id, role_code)
values (pg_temp.rdt_id('org'), pg_temp.rdt_id('admin'), 'ADMIN');

create temporary table rdt_fixtures(repair_id uuid);
create temporary table rdt_snapshots(label text primary key, value jsonb);
grant select, insert, update on rdt_ids, rdt_fixtures, rdt_snapshots to authenticated;

set local role authenticated;
select pg_temp.rdt_claim('admin');
insert into rdt_fixtures(repair_id)
select public.create_repair(jsonb_build_object(
  'organization_id', pg_temp.rdt_id('org'),
  'operation_key', gen_random_uuid(),
  'requester_type', 'internal',
  'requesting_area', 'Pruebas',
  'equipment_type', 'external',
  'external_equipment_description', 'Equipo de prueba',
  'problem_description', 'No enciende'
));
select public.assign_repair(pg_temp.rdt_id('org'), repair_id, pg_temp.rdt_id('admin'), 1)
from rdt_fixtures;
select public.change_repair_status(pg_temp.rdt_id('org'), repair_id, 'diagnosis', null, 2)
from rdt_fixtures;

select lives_ok($$
  select public.record_repair_diagnosis(jsonb_build_object(
    'organization_id', pg_temp.rdt_id('org'),
    'repair_id', repair_id,
    'expected_lock_version', 3,
    'symptoms', 'No enciende durante la revisión',
    'priority', 'urgent',
    'estimated_delivery_date', '2026-11-20'
  ))
  from rdt_fixtures
$$, 'diagnosis saves planning fields atomically');
select is((select priority from public.repairs where id = (select repair_id from rdt_fixtures)),
  'urgent', 'priority is persisted');
select is((select estimated_delivery_date from public.repairs where id = (select repair_id from rdt_fixtures)),
  date '2026-11-20', 'estimated delivery date is persisted');
select is((select lock_version from public.repairs where id = (select repair_id from rdt_fixtures)),
  4::bigint, 'diagnosis and planning advance the aggregate version once');
select is((select metadata #>> '{new_values,priority}' from public.repair_events
  where repair_id = (select repair_id from rdt_fixtures) and event_type = 'UPDATED'
  order by id desc limit 1), 'urgent', 'planning changes are included in the immutable audit trail');

insert into rdt_snapshots(label, value)
select 'before-invalid-priority', jsonb_build_object(
  'lock_version', repair.lock_version,
  'diagnoses', (select count(*) from public.repair_diagnostics diagnosis where diagnosis.repair_id = repair.id),
  'events', (select count(*) from public.repair_events event where event.repair_id = repair.id)
)
from public.repairs repair join rdt_fixtures fixture on fixture.repair_id = repair.id;
select throws_ok($$
  select public.record_repair_diagnosis(jsonb_build_object(
    'organization_id', pg_temp.rdt_id('org'),
    'repair_id', repair_id,
    'expected_lock_version', 4,
    'symptoms', 'No enciende durante la revisión',
    'priority', 'critical'
  ))
  from rdt_fixtures
$$, '22023', 'REPAIR_PRIORITY_INVALID', 'invalid priority is rejected');
select is((
  select jsonb_build_object(
    'lock_version', repair.lock_version,
    'diagnoses', (select count(*) from public.repair_diagnostics diagnosis where diagnosis.repair_id = repair.id),
    'events', (select count(*) from public.repair_events event where event.repair_id = repair.id)
  )
  from public.repairs repair join rdt_fixtures fixture on fixture.repair_id = repair.id
), (select value from rdt_snapshots where label = 'before-invalid-priority'),
  'invalid priority leaves diagnosis, events and version unchanged');

select throws_ok($$
  select public.record_repair_diagnosis(jsonb_build_object(
    'organization_id', pg_temp.rdt_id('org'),
    'repair_id', repair_id,
    'expected_lock_version', 4,
    'symptoms', 'No enciende durante la revisión',
    'estimated_delivery_date', '2026-02-30'
  ))
  from rdt_fixtures
$$, '22023', 'REPAIR_ESTIMATED_DELIVERY_DATE_INVALID', 'invalid estimated date is rejected');
select is((
  select jsonb_build_object(
    'lock_version', repair.lock_version,
    'diagnoses', (select count(*) from public.repair_diagnostics diagnosis where diagnosis.repair_id = repair.id),
    'events', (select count(*) from public.repair_events event where event.repair_id = repair.id)
  )
  from public.repairs repair join rdt_fixtures fixture on fixture.repair_id = repair.id
), (select value from rdt_snapshots where label = 'before-invalid-priority'),
  'invalid date leaves diagnosis, events and version unchanged');

reset role;
select * from finish();
rollback;
