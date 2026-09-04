-- Serialize every repair aggregate command through one optimistic concurrency token.

begin;

alter table public.repairs
  add column lock_version bigint not null default 1
  check (lock_version > 0);

create or replace view public.repair_list
with (security_invoker = true)
as
select
  repair.id,
  repair.organization_id,
  repair.repair_code,
  repair.customer_id,
  repair.product_id,
  repair.serial_number,
  repair.received_at,
  repair.estimated_delivery_date,
  repair.delivered_at,
  repair.status,
  repair.priority,
  repair.problem_description,
  repair.diagnosis,
  repair.applied_solution,
  repair.notes,
  repair.customer_reference,
  repair.sale_document_id,
  repair.warranty_reference,
  repair.assigned_technician_id,
  repair.customer_name_snapshot,
  repair.customer_document_snapshot,
  repair.product_code_snapshot,
  repair.product_description_snapshot,
  repair.created_by,
  repair.updated_by,
  repair.created_at,
  repair.updated_at,
  repair.serial_control_snapshot,
  repair.lock_version
from public.repairs repair;

create or replace function public.record_repair_event(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_event_type text,
  requested_from_status text,
  requested_to_status text,
  requested_actor_user_id uuid,
  requested_observation text,
  requested_metadata jsonb,
  requested_audit_action text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_event_id bigint;
  event_metadata jsonb := coalesce(requested_metadata, '{}'::jsonb);
begin
  if jsonb_typeof(event_metadata -> 'old_values') = 'object' then
    event_metadata := jsonb_set(
      event_metadata,
      '{old_values}',
      (event_metadata -> 'old_values') - 'lock_version'
    );
  end if;
  if jsonb_typeof(event_metadata -> 'new_values') = 'object' then
    event_metadata := jsonb_set(
      event_metadata,
      '{new_values}',
      (event_metadata -> 'new_values') - 'lock_version'
    );
  end if;

  insert into public.repair_events (
    organization_id, repair_id, event_type, from_status, to_status,
    actor_user_id, observation, metadata
  ) values (
    requested_organization_id, requested_repair_id, requested_event_type,
    requested_from_status, requested_to_status, requested_actor_user_id,
    nullif(btrim(requested_observation), ''), event_metadata
  ) returning id into repair_event_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    requested_organization_id,
    requested_actor_user_id,
    requested_audit_action,
    'repair',
    requested_repair_id::text,
    case
      when requested_from_status is null then null
      else jsonb_build_object('status', requested_from_status)
    end,
    case
      when requested_to_status is null then '{}'::jsonb
      else jsonb_build_object('status', requested_to_status)
    end,
    event_metadata || jsonb_build_object(
      'repair_event_id', repair_event_id,
      'event_type', requested_event_type
    )
  );

  return repair_event_id;
end;
$$;

alter function public.update_repair(jsonb)
  rename to update_repair_unchecked;
alter function public.assign_repair(uuid, uuid, uuid)
  rename to assign_repair_unchecked;
alter function public.change_repair_status(uuid, uuid, text, text)
  rename to change_repair_status_unchecked;
alter function public.record_repair_diagnosis(jsonb)
  rename to record_repair_diagnosis_unchecked;
alter function public.record_repair_solution(jsonb)
  rename to record_repair_solution_unchecked;
alter function public.save_repair_quote(jsonb)
  rename to save_repair_quote_unchecked;
alter function public.revise_repair_quote(jsonb)
  rename to revise_repair_quote_unchecked;
alter function public.approve_repair_quote(uuid, uuid, uuid, text)
  rename to approve_repair_quote_unchecked;
alter function public.reject_repair_quote(uuid, uuid, uuid, text)
  rename to reject_repair_quote_unchecked;
alter function public.reserve_repair_part(jsonb)
  rename to reserve_repair_part_unchecked;
alter function public.consume_repair_part(jsonb)
  rename to consume_repair_part_unchecked;
alter function public.cancel_repair_part(uuid, uuid, text)
  rename to cancel_repair_part_unchecked;
alter function public.record_repair_test(jsonb)
  rename to record_repair_test_unchecked;
alter function public.deliver_repair(uuid, uuid, text)
  rename to deliver_repair_unchecked;
alter function public.cancel_repair(uuid, uuid, text)
  rename to cancel_repair_unchecked;

create function public.lock_repair_version(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_expected_lock_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_lock_version bigint;
begin
  select repair.lock_version
  into current_lock_version
  from public.repairs repair
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if requested_expected_lock_version is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_VERSION_REQUIRED';
  end if;
  if current_lock_version <> requested_expected_lock_version then
    raise exception using errcode = 'P0001', message = 'REPAIR_VERSION_CONFLICT';
  end if;
end;
$$;

create function public.advance_repair_version(
  requested_organization_id uuid,
  requested_repair_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.repairs repair
  set
    lock_version = repair.lock_version + 1,
    updated_by = (select auth.uid())
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id;
$$;

create function public.update_repair(payload jsonb)
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
  repair_id := nullif(payload ->> 'id', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  perform public.update_repair_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
end;
$$;

create function public.assign_repair(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_technician_id uuid,
  requested_expected_lock_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_repair_actor(requested_organization_id, 'REPAIRS_ASSIGN');
  perform public.lock_repair_version(
    requested_organization_id, requested_repair_id, requested_expected_lock_version
  );
  perform public.assign_repair_unchecked(
    requested_organization_id, requested_repair_id, requested_technician_id
  );
  perform public.advance_repair_version(requested_organization_id, requested_repair_id);
end;
$$;

create function public.change_repair_status(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_status text,
  requested_observation text,
  requested_expected_lock_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_repair_actor(requested_organization_id, 'REPAIRS_CHANGE_STATUS');
  perform public.lock_repair_version(
    requested_organization_id, requested_repair_id, requested_expected_lock_version
  );
  perform public.change_repair_status_unchecked(
    requested_organization_id, requested_repair_id, requested_status, requested_observation
  );
  perform public.advance_repair_version(requested_organization_id, requested_repair_id);
end;
$$;

create function public.record_repair_diagnosis(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  expected_lock_version bigint;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_CHANGE_STATUS');
  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.record_repair_diagnosis_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  return result_id;
end;
$$;

create function public.record_repair_solution(payload jsonb)
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
  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  perform public.record_repair_solution_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
end;
$$;

create function public.save_repair_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  expected_lock_version bigint;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.save_repair_quote_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  return result_id;
end;
$$;

create function public.revise_repair_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  expected_lock_version bigint;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.revise_repair_quote_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  return result_id;
end;
$$;

create function public.approve_repair_quote(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_quote_id uuid,
  requested_observation text,
  requested_expected_lock_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_repair_actor(requested_organization_id, 'REPAIRS_APPROVE_QUOTE');
  perform public.lock_repair_version(
    requested_organization_id, requested_repair_id, requested_expected_lock_version
  );
  perform public.approve_repair_quote_unchecked(
    requested_organization_id, requested_repair_id, requested_quote_id, requested_observation
  );
  perform public.advance_repair_version(requested_organization_id, requested_repair_id);
end;
$$;

create function public.reject_repair_quote(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_quote_id uuid,
  requested_observation text,
  requested_expected_lock_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_repair_actor(requested_organization_id, 'REPAIRS_APPROVE_QUOTE');
  perform public.lock_repair_version(
    requested_organization_id, requested_repair_id, requested_expected_lock_version
  );
  perform public.reject_repair_quote_unchecked(
    requested_organization_id, requested_repair_id, requested_quote_id, requested_observation
  );
  perform public.advance_repair_version(requested_organization_id, requested_repair_id);
end;
$$;

create function public.reserve_repair_part(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  expected_lock_version bigint;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_USE_PARTS');
  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.reserve_repair_part_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  return result_id;
end;
$$;

create function public.consume_repair_part(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  organization_id uuid;
  repair_part_id uuid;
  repair_id uuid;
  quantity_value numeric;
  operation_key_value uuid;
  expected_lock_version bigint;
  existing_consumption public.repair_part_consumptions%rowtype;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_part_id := nullif(payload ->> 'repair_part_id', '')::uuid;
  quantity_value := (payload ->> 'quantity')::numeric;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_USE_PARTS');

  if repair_part_id is null or operation_key_value is null then
    raise exception using errcode = '22023', message = 'REPAIR_CONSUMPTION_KEYS_REQUIRED';
  end if;
  if quantity_value is null or quantity_value <= 0 then
    raise exception using errcode = '22023', message = 'REPAIR_CONSUMPTION_QUANTITY_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      organization_id::text || ':repair-operation:' || operation_key_value::text, 0
    )
  );
  if expected_lock_version is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_VERSION_REQUIRED';
  end if;

  select consumption.*
  into existing_consumption
  from public.repair_part_consumptions consumption
  where consumption.organization_id = organization_id
    and consumption.operation_key = operation_key_value
  for update;
  if found then
    if existing_consumption.repair_part_id is distinct from repair_part_id
      or existing_consumption.quantity <> quantity_value
    then
      raise exception using errcode = 'P0001', message = 'REPAIR_OPERATION_KEY_REUSED';
    end if;
    return public.consume_repair_part_unchecked(payload);
  end if;

  select part.repair_id
  into repair_id
  from public.repair_parts part
  where part.organization_id = organization_id
    and part.id = repair_part_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;

  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.consume_repair_part_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  return result_id;
end;
$$;

create function public.cancel_repair_part(
  requested_organization_id uuid,
  requested_repair_part_id uuid,
  requested_observation text,
  requested_expected_lock_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_id uuid;
begin
  perform public.assert_repair_actor(requested_organization_id, 'REPAIRS_USE_PARTS');
  select part.repair_id
  into repair_id
  from public.repair_parts part
  where part.organization_id = requested_organization_id
    and part.id = requested_repair_part_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_NOT_FOUND';
  end if;
  perform public.lock_repair_version(
    requested_organization_id, repair_id, requested_expected_lock_version
  );
  perform public.cancel_repair_part_unchecked(
    requested_organization_id, requested_repair_part_id, requested_observation
  );
  perform public.advance_repair_version(requested_organization_id, repair_id);
end;
$$;

create function public.record_repair_test(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  expected_lock_version bigint;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_CHANGE_STATUS');
  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.record_repair_test_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  return result_id;
end;
$$;

create function public.deliver_repair(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_observation text,
  requested_expected_lock_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_repair_actor(requested_organization_id, 'REPAIRS_DELIVER');
  perform public.lock_repair_version(
    requested_organization_id, requested_repair_id, requested_expected_lock_version
  );
  perform public.deliver_repair_unchecked(
    requested_organization_id, requested_repair_id, requested_observation
  );
  perform public.advance_repair_version(requested_organization_id, requested_repair_id);
end;
$$;

create function public.cancel_repair(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_observation text,
  requested_expected_lock_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_repair_actor(requested_organization_id, 'REPAIRS_CHANGE_STATUS');
  perform public.lock_repair_version(
    requested_organization_id, requested_repair_id, requested_expected_lock_version
  );
  perform public.cancel_repair_unchecked(
    requested_organization_id, requested_repair_id, requested_observation
  );
  perform public.advance_repair_version(requested_organization_id, requested_repair_id);
end;
$$;

revoke all on function public.lock_repair_version(uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.advance_repair_version(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.update_repair_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.assign_repair_unchecked(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.change_repair_status_unchecked(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_repair_diagnosis_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.record_repair_solution_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.save_repair_quote_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.revise_repair_quote_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.approve_repair_quote_unchecked(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_repair_quote_unchecked(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reserve_repair_part_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.consume_repair_part_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_repair_part_unchecked(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_repair_test_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.deliver_repair_unchecked(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_repair_unchecked(uuid, uuid, text)
  from public, anon, authenticated, service_role;

revoke all on function public.update_repair(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.assign_repair(uuid, uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.change_repair_status(uuid, uuid, text, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.record_repair_diagnosis(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.record_repair_solution(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.save_repair_quote(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.revise_repair_quote(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.approve_repair_quote(uuid, uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_repair_quote(uuid, uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.reserve_repair_part(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.consume_repair_part(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_repair_part(uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.record_repair_test(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.deliver_repair(uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_repair(uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;

grant execute on function public.update_repair(jsonb) to authenticated, service_role;
grant execute on function public.assign_repair(uuid, uuid, uuid, bigint) to authenticated, service_role;
grant execute on function public.change_repair_status(uuid, uuid, text, text, bigint) to authenticated, service_role;
grant execute on function public.record_repair_diagnosis(jsonb) to authenticated, service_role;
grant execute on function public.record_repair_solution(jsonb) to authenticated, service_role;
grant execute on function public.save_repair_quote(jsonb) to authenticated, service_role;
grant execute on function public.revise_repair_quote(jsonb) to authenticated, service_role;
grant execute on function public.approve_repair_quote(uuid, uuid, uuid, text, bigint) to authenticated, service_role;
grant execute on function public.reject_repair_quote(uuid, uuid, uuid, text, bigint) to authenticated, service_role;
grant execute on function public.reserve_repair_part(jsonb) to authenticated, service_role;
grant execute on function public.consume_repair_part(jsonb) to authenticated, service_role;
grant execute on function public.cancel_repair_part(uuid, uuid, text, bigint) to authenticated, service_role;
grant execute on function public.record_repair_test(jsonb) to authenticated, service_role;
grant execute on function public.deliver_repair(uuid, uuid, text, bigint) to authenticated, service_role;
grant execute on function public.cancel_repair(uuid, uuid, text, bigint) to authenticated, service_role;

comment on column public.repairs.lock_version is
  'Token de concurrencia optimista del agregado de reparacion.';

commit;
