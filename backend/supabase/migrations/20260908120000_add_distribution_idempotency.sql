-- SILSANPLEX: reintentos idempotentes para guardar entregas.

create table public.distribution_command_operations (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operation_key uuid not null,
  command_type text not null,
  request_payload jsonb not null,
  result_id uuid not null,
  created_at timestamptz not null default now(),

  constraint distribution_command_operations_pkey primary key (organization_id, operation_key),
  constraint distribution_command_operations_command_type_valid check (
    command_type = 'save_distribution_delivery'
  ),
  constraint distribution_command_operations_payload_object check (
    jsonb_typeof(request_payload) = 'object'
  )
);

alter table public.distribution_command_operations enable row level security;

revoke all on table public.distribution_command_operations
  from public, anon, authenticated, service_role;

create or replace function public.prevent_distribution_command_operation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OPERATION_IMMUTABLE';
end;
$$;

create trigger distribution_command_operations_immutable
before update or delete on public.distribution_command_operations
for each row execute function public.prevent_distribution_command_operation_mutation();

alter function public.save_distribution_delivery(jsonb)
  rename to save_distribution_delivery_without_idempotency;

create or replace function public.replay_distribution_command(
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
  existing_operation public.distribution_command_operations%rowtype;
begin
  if requested_operation_key is null then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      requested_organization_id::text || ':distribution-command:' || requested_operation_key::text,
      0
    )
  );

  select operation.*
    into existing_operation
  from public.distribution_command_operations operation
  where operation.organization_id = requested_organization_id
    and operation.operation_key = requested_operation_key
  for update;

  if not found then
    return null;
  end if;
  if existing_operation.command_type is distinct from requested_command_type
     or existing_operation.request_payload is distinct from requested_payload then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OPERATION_KEY_REUSED';
  end if;

  return existing_operation.result_id;
end;
$$;

create or replace function public.complete_distribution_command(
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
  insert into public.distribution_command_operations (
    organization_id, operation_key, command_type, request_payload, result_id
  ) values (
    requested_organization_id, requested_operation_key, requested_command_type,
    requested_payload, requested_result_id
  );
$$;

create or replace function public.save_distribution_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  operation_key_value uuid;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;

  result_id := public.replay_distribution_command(
    target_organization_id,
    operation_key_value,
    'save_distribution_delivery',
    payload
  );
  if result_id is not null then
    return result_id;
  end if;

  result_id := public.save_distribution_delivery_without_idempotency(payload);

  if operation_key_value is not null then
    perform public.complete_distribution_command(
      target_organization_id,
      operation_key_value,
      'save_distribution_delivery',
      payload,
      result_id
    );
  end if;

  return result_id;
end;
$$;

revoke all on function public.replay_distribution_command(uuid, uuid, text, jsonb),
  public.complete_distribution_command(uuid, uuid, text, jsonb, uuid),
  public.save_distribution_delivery_without_idempotency(jsonb),
  public.save_distribution_delivery(jsonb)
  from public, anon, authenticated;

grant execute on function public.save_distribution_delivery(jsonb) to authenticated;

comment on table public.distribution_command_operations is
  'Registro inmutable de operaciones de distribución para repetir comandos sin duplicarlos.';
