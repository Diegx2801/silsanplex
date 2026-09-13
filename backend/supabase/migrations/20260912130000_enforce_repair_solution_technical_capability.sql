-- Align applied solutions with the technical-capability contract used by
-- diagnoses and tests.

begin;

create or replace function public.record_repair_solution_unchecked(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid;
  repair_id uuid;
  technician_id uuid;
  applied_solution_value text;
  repair_row public.repairs%rowtype;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;

  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  applied_solution_value := nullif(btrim(payload ->> 'applied_solution'), '');
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_CHANGE_STATUS');

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = organization_id
    and repair.id = repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_row.status in ('delivered', 'cancelled', 'rejected') then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_EDITABLE';
  end if;
  if repair_row.status in ('testing', 'ready_for_delivery') then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_TECHNICAL_CHANGE_REQUIRES_REWORK';
  end if;
  if applied_solution_value is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_APPLIED_SOLUTION_REQUIRED';
  end if;

  technician_id := nullif(payload ->> 'technician_id', '')::uuid;
  technician_id := coalesce(technician_id, repair_row.assigned_technician_id, actor_id);
  if technician_id is null
    or not public.repair_technician_is_active(organization_id, technician_id)
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICIAN_UNAVAILABLE';
  end if;

  update public.repairs repair
  set applied_solution = applied_solution_value,
      updated_by = actor_id
  where repair.organization_id = organization_id
    and repair.id = repair_id;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'SOLUTION_RECORDED',
    repair_row.status,
    repair_row.status,
    actor_id,
    null,
    jsonb_build_object(
      'applied_solution_before', repair_row.applied_solution,
      'applied_solution_after', applied_solution_value,
      'technician_id', technician_id
    ),
    'REPAIR_SOLUTION_RECORDED'
  );
end;
$$;

create or replace function public.record_repair_solution(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  expected_lock_version bigint;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_CHANGE_STATUS');
  perform public.assert_repair_actor(organization_id, 'REPAIRS_PERFORM_TECHNICAL');
  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  perform public.record_repair_solution_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
end;
$$;

revoke all on function public.record_repair_solution_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.record_repair_solution(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_repair_solution(jsonb)
  to authenticated, service_role;

comment on function public.record_repair_solution(jsonb) is
  'Registra una solucion aplicada. Exige cambio de estado y capacidad tecnica; valida technician_id, el tecnico asignado o el actor.';

commit;
