-- Make repair creation commands safely replayable after an ambiguous response.

begin;

create table public.repair_command_operations (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operation_key uuid not null,
  command_type text not null,
  request_payload jsonb not null,
  result_id uuid not null,
  created_at timestamptz not null default now(),

  constraint repair_command_operations_pkey primary key (organization_id, operation_key),
  constraint repair_command_operations_command_type_valid check (
    command_type in (
      'create_repair', 'save_repair_quote', 'revise_repair_quote',
      'reserve_repair_part'
    )
  ),
  constraint repair_command_operations_payload_object check (
    jsonb_typeof(request_payload) = 'object'
  )
);

alter table public.repair_command_operations enable row level security;

revoke all on table public.repair_command_operations
  from public, anon, authenticated, service_role;

create function public.prevent_repair_command_operation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'REPAIR_COMMAND_OPERATION_IMMUTABLE';
end;
$$;

create trigger repair_command_operations_immutable
before update or delete on public.repair_command_operations
for each row execute function public.prevent_repair_command_operation_mutation();

create function public.replay_repair_command(
  requested_organization_id uuid,
  requested_operation_key uuid,
  requested_command_type text,
  requested_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_operation public.repair_command_operations%rowtype;
begin
  if requested_operation_key is null then
    raise exception using errcode = '22023', message = 'REPAIR_OPERATION_KEY_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      requested_organization_id::text || ':repair-command:' || requested_operation_key::text,
      0
    )
  );

  select operation.*
  into existing_operation
  from public.repair_command_operations operation
  where operation.organization_id = requested_organization_id
    and operation.operation_key = requested_operation_key
  for update;

  if not found then
    return null;
  end if;
  if existing_operation.command_type is distinct from requested_command_type
    or existing_operation.request_payload is distinct from requested_payload
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_OPERATION_KEY_REUSED';
  end if;

  return existing_operation.result_id;
end;
$$;

create function public.complete_repair_command(
  requested_organization_id uuid,
  requested_operation_key uuid,
  requested_command_type text,
  requested_payload jsonb,
  requested_result_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.repair_command_operations (
    organization_id, operation_key, command_type, request_payload, result_id
  ) values (
    requested_organization_id, requested_operation_key, requested_command_type,
    requested_payload, requested_result_id
  );
$$;

alter function public.create_repair(jsonb)
  rename to create_repair_unchecked;

create function public.create_repair(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  operation_key_value uuid;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_CREATE');

  result_id := public.replay_repair_command(
    organization_id, operation_key_value, 'create_repair', payload
  );
  if result_id is not null then
    return result_id;
  end if;

  result_id := public.create_repair_unchecked(payload);
  perform public.complete_repair_command(
    organization_id, operation_key_value, 'create_repair', payload, result_id
  );
  return result_id;
end;
$$;

create or replace function public.save_repair_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  if expected_lock_version is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_VERSION_REQUIRED';
  end if;

  result_id := public.replay_repair_command(
    organization_id, operation_key_value, 'save_repair_quote', payload
  );
  if result_id is not null then
    return result_id;
  end if;

  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.save_repair_quote_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  perform public.complete_repair_command(
    organization_id, operation_key_value, 'save_repair_quote', payload, result_id
  );
  return result_id;
end;
$$;

create or replace function public.revise_repair_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  if expected_lock_version is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_VERSION_REQUIRED';
  end if;

  result_id := public.replay_repair_command(
    organization_id, operation_key_value, 'revise_repair_quote', payload
  );
  if result_id is not null then
    return result_id;
  end if;

  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.revise_repair_quote_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  perform public.complete_repair_command(
    organization_id, operation_key_value, 'revise_repair_quote', payload, result_id
  );
  return result_id;
end;
$$;

create or replace function public.reserve_repair_part(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_USE_PARTS');
  if expected_lock_version is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_VERSION_REQUIRED';
  end if;

  result_id := public.replay_repair_command(
    organization_id, operation_key_value, 'reserve_repair_part', payload
  );
  if result_id is not null then
    return result_id;
  end if;

  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.reserve_repair_part_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  perform public.complete_repair_command(
    organization_id, operation_key_value, 'reserve_repair_part', payload, result_id
  );
  return result_id;
end;
$$;

revoke all on function public.replay_repair_command(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_repair_command(uuid, uuid, text, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_repair_command_operation_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.create_repair_unchecked(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.create_repair(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.save_repair_quote(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.revise_repair_quote(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.reserve_repair_part(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.create_repair(jsonb) to authenticated, service_role;
grant execute on function public.save_repair_quote(jsonb) to authenticated, service_role;
grant execute on function public.revise_repair_quote(jsonb) to authenticated, service_role;
grant execute on function public.reserve_repair_part(jsonb) to authenticated, service_role;

comment on table public.repair_command_operations is
  'Resultados inmutables de comandos de reparacion, usados para reintentos idempotentes.';
comment on column public.repair_command_operations.operation_key is
  'Clave unica de la intencion cliente dentro de la organizacion.';

commit;
