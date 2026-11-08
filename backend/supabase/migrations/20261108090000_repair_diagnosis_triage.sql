begin;

-- Priority and target delivery date are decided after initial inspection.
-- Save them atomically with the diagnosis and retain the existing OCC contract.
create or replace function public.record_repair_diagnosis(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  organization_id uuid;
  repair_id uuid;
  expected_lock_version bigint;
  actor_id uuid;
  result_id uuid;
  repair_before public.repairs%rowtype;
  repair_after public.repairs%rowtype;
  priority_value text;
  estimated_delivery_date_value date;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;

  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_CHANGE_STATUS');
  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);

  select repair.*
  into repair_before
  from public.repairs repair
  where repair.organization_id = organization_id
    and repair.id = repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;

  if payload ? 'priority' then
    if jsonb_typeof(payload -> 'priority') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'REPAIR_PRIORITY_INVALID';
    end if;
    priority_value := lower(btrim(payload ->> 'priority'));
    if priority_value not in ('low', 'normal', 'high', 'urgent') then
      raise exception using errcode = '22023', message = 'REPAIR_PRIORITY_INVALID';
    end if;
  end if;

  if payload ? 'estimated_delivery_date' then
    if jsonb_typeof(payload -> 'estimated_delivery_date') not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'REPAIR_ESTIMATED_DELIVERY_DATE_INVALID';
    end if;
    begin
      estimated_delivery_date_value :=
        nullif(btrim(payload ->> 'estimated_delivery_date'), '')::date;
    exception
      when datetime_field_overflow or invalid_datetime_format then
        raise exception using errcode = '22023', message = 'REPAIR_ESTIMATED_DELIVERY_DATE_INVALID';
    end;
  end if;

  -- The original function validates diagnosis state and content, creates the
  -- diagnosis record, and writes its own immutable event/audit entry.
  result_id := public.record_repair_diagnosis_unchecked(payload);

  update public.repairs repair
  set priority = case when payload ? 'priority' then priority_value else repair.priority end,
      estimated_delivery_date = case
        when payload ? 'estimated_delivery_date' then estimated_delivery_date_value
        else repair.estimated_delivery_date
      end,
      updated_by = actor_id
  where repair.organization_id = organization_id
    and repair.id = repair_id
  returning repair.* into repair_after;

  if repair_before.priority is distinct from repair_after.priority
    or repair_before.estimated_delivery_date is distinct from repair_after.estimated_delivery_date
  then
    perform public.record_repair_event(
      organization_id,
      repair_id,
      'UPDATED',
      repair_before.status,
      repair_after.status,
      actor_id,
      null,
      jsonb_build_object(
        'old_values', jsonb_build_object(
          'priority', repair_before.priority,
          'estimated_delivery_date', repair_before.estimated_delivery_date
        ),
        'new_values', jsonb_build_object(
          'priority', repair_after.priority,
          'estimated_delivery_date', repair_after.estimated_delivery_date
        )
      ),
      'REPAIR_UPDATED'
    );
  end if;

  perform public.advance_repair_version(organization_id, repair_id);
  return result_id;
end;
$$;

revoke all on function public.record_repair_diagnosis(jsonb) from public, anon, authenticated;
grant execute on function public.record_repair_diagnosis(jsonb) to authenticated, service_role;

comment on function public.record_repair_diagnosis(jsonb) is
  'Atomically records diagnosis, priority and estimated delivery date under the repair aggregate lock.';

commit;
