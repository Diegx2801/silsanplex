-- Keep rescheduling narrowly scoped and preserve the reason in the delivery audit history.

alter table public.distribution_command_operations
  drop constraint distribution_command_operations_command_type_valid,
  add constraint distribution_command_operations_command_type_valid
    check (command_type = any (array['save_distribution_delivery', 'reschedule_distribution_delivery']::text[]));

create or replace function public.guard_distribution_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reschedule_reason text := nullif(btrim(pg_catalog.current_setting('silsanplex.distribution_reschedule_reason', true)), '');
begin
  if new.scheduled_date is distinct from old.scheduled_date
    and old.delivery_status in ('en_curso', 'en_destino', 'entregado', 'devuelto', 'cancelado') then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ROUTE_ALREADY_STARTED';
  end if;

  if (
      new.delivery_status = 'reprogramado'
      and old.delivery_status is distinct from new.delivery_status
    ) or (
      old.delivery_status in ('entrega_parcial', 'rechazado', 'reprogramado')
      and new.scheduled_date is distinct from old.scheduled_date
    ) then
    if new.delivery_status <> 'reprogramado'
      or reschedule_reason is null
      or char_length(reschedule_reason) < 3
      or char_length(reschedule_reason) > 300 then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_RESCHEDULE_COMMAND_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_distribution_schedule_change()
  from public, anon, authenticated, service_role;

drop trigger if exists distribution_deliveries_guard_schedule_change
  on public.distribution_deliveries;
create trigger distribution_deliveries_guard_schedule_change
before update of delivery_status, scheduled_date on public.distribution_deliveries
for each row execute function public.guard_distribution_schedule_change();

create or replace function public.record_distribution_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scheduled_date is distinct from old.scheduled_date
    and not (
      new.delivery_status = 'reprogramado'
      and old.delivery_status in ('entrega_parcial', 'rechazado', 'reprogramado')
    ) then
    insert into public.audit_events (
      organization_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      old_values,
      new_values,
      metadata
    ) values (
      new.organization_id,
      (select auth.uid()),
      'DISTRIBUTION_SCHEDULE_CHANGED',
      'distribution_delivery',
      new.id::text,
      jsonb_build_object('scheduled_date', old.scheduled_date),
      jsonb_build_object('scheduled_date', new.scheduled_date),
      jsonb_build_object(
        'delivery_id', new.id,
        'source', 'distribution_delivery_update'
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.record_distribution_schedule_change()
  from public, anon, authenticated, service_role;

create or replace function public.reschedule_distribution_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_delivery_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  requested_scheduled_date date;
  requested_reason text;
  current_delivery_status text;
  current_scheduled_date date;
  replayed_delivery_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_delivery_id := nullif(payload ->> 'delivery_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  requested_scheduled_date := nullif(payload ->> 'scheduled_date', '')::date;
  requested_reason := nullif(btrim(payload ->> 'reason'), '');

  if actor_id is null
    or target_organization_id is null
    or target_delivery_id is null
    or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;
  if operation_key_value is null then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OPERATION_KEY_REQUIRED';
  end if;
  if requested_scheduled_date is null then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_RESCHEDULE_DATE_REQUIRED';
  end if;
  if requested_reason is null or char_length(requested_reason) < 3 or char_length(requested_reason) > 300 then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_RESCHEDULE_REASON_REQUIRED';
  end if;

  replayed_delivery_id := public.replay_distribution_command(
    target_organization_id,
    operation_key_value,
    'reschedule_distribution_delivery',
    payload
  );
  if replayed_delivery_id is not null then
    return replayed_delivery_id;
  end if;

  perform public.lock_distribution_delivery_version(
    target_organization_id,
    target_delivery_id,
    expected_lock_version
  );

  select delivery.delivery_status, delivery.scheduled_date
    into current_delivery_status, current_scheduled_date
  from public.distribution_deliveries delivery
  where delivery.organization_id = target_organization_id
    and delivery.id = target_delivery_id
  for update;

  if current_delivery_status not in ('entrega_parcial', 'rechazado', 'reprogramado') then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_RESCHEDULE_STATE_INVALID';
  end if;
  if requested_scheduled_date = current_scheduled_date then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_RESCHEDULE_DATE_UNCHANGED';
  end if;
  if requested_scheduled_date < pg_catalog.timezone('America/Lima', pg_catalog.now())::date then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_RESCHEDULE_DATE_IN_PAST';
  end if;

  perform pg_catalog.set_config('silsanplex.distribution_reschedule_reason', requested_reason, true);

  update public.distribution_deliveries delivery
  set scheduled_date = requested_scheduled_date,
      delivery_status = 'reprogramado'
  where delivery.organization_id = target_organization_id
    and delivery.id = target_delivery_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    metadata
  ) values (
    target_organization_id,
    actor_id,
    'DISTRIBUTION_SCHEDULE_CHANGED',
    'distribution_delivery',
    target_delivery_id::text,
    jsonb_build_object('scheduled_date', current_scheduled_date),
    jsonb_build_object('scheduled_date', requested_scheduled_date),
    jsonb_build_object(
      'delivery_id', target_delivery_id,
      'source', 'reschedule_distribution_delivery',
      'reason', requested_reason
    )
  );

  perform public.advance_distribution_delivery_version(target_organization_id, target_delivery_id);
  perform public.complete_distribution_command(
    target_organization_id,
    operation_key_value,
    'reschedule_distribution_delivery',
    payload,
    target_delivery_id
  );
  perform pg_catalog.set_config('silsanplex.distribution_reschedule_reason', '', true);

  return target_delivery_id;
end;
$$;

revoke all on function public.reschedule_distribution_delivery(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.reschedule_distribution_delivery(jsonb) to authenticated;

comment on function public.reschedule_distribution_delivery(jsonb) is
  'Changes only the next scheduled date and status after a partial or failed attempt, with concurrency control, idempotency, and an audited reason.';

drop function public.list_distribution_delivery_status_history(uuid, uuid);

create function public.list_distribution_delivery_status_history(
  requested_organization_id uuid,
  requested_delivery_id uuid
)
returns table (
  event_id text,
  event_type text,
  from_status text,
  to_status text,
  from_scheduled_date date,
  to_scheduled_date date,
  schedule_reason text,
  actor_name text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_actor_id uuid := (select auth.uid());
begin
  if current_actor_id is null
    or requested_organization_id is null
    or requested_delivery_id is null
    or not public.has_organization_permission(requested_organization_id, 'DISTRIBUTION_VIEW') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.distribution_deliveries delivery
    where delivery.organization_id = requested_organization_id
      and delivery.id = requested_delivery_id
  ) then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_NOT_FOUND';
  end if;

  return query
    select history.event_id, history.event_type, history.from_status, history.to_status,
      history.from_scheduled_date, history.to_scheduled_date, history.schedule_reason,
      history.actor_name, history.occurred_at
    from (
      select
        'created-' || delivery.id::text as event_id,
        'status'::text as event_type,
        null::text as from_status,
        'programado'::text as to_status,
        null::date as from_scheduled_date,
        null::date as to_scheduled_date,
        null::text as schedule_reason,
        coalesce(profile.full_name, 'Usuario del sistema') as actor_name,
        delivery.created_at as occurred_at
      from public.distribution_deliveries delivery
      left join public.profiles profile on profile.id = delivery.created_by
      where delivery.organization_id = requested_organization_id
        and delivery.id = requested_delivery_id

      union all

      select
        audit.id::text as event_id,
        'status'::text as event_type,
        audit.old_values ->> 'delivery_status' as from_status,
        audit.new_values ->> 'delivery_status' as to_status,
        null::date as from_scheduled_date,
        null::date as to_scheduled_date,
        null::text as schedule_reason,
        coalesce(profile.full_name, 'Usuario del sistema') as actor_name,
        audit.created_at as occurred_at
      from public.audit_events audit
      left join public.profiles profile on profile.id = audit.actor_user_id
      where audit.organization_id = requested_organization_id
        and audit.entity_type = 'distribution_delivery'
        and audit.entity_id = requested_delivery_id::text
        and audit.action = 'DISTRIBUTION_STATUS_CHANGED'

      union all

      select
        audit.id::text as event_id,
        'schedule'::text as event_type,
        null::text as from_status,
        null::text as to_status,
        nullif(audit.old_values ->> 'scheduled_date', '')::date as from_scheduled_date,
        nullif(audit.new_values ->> 'scheduled_date', '')::date as to_scheduled_date,
        nullif(audit.metadata ->> 'reason', '') as schedule_reason,
        coalesce(profile.full_name, 'Usuario del sistema') as actor_name,
        audit.created_at as occurred_at
      from public.audit_events audit
      left join public.profiles profile on profile.id = audit.actor_user_id
      where audit.organization_id = requested_organization_id
        and audit.entity_type = 'distribution_delivery'
        and audit.entity_id = requested_delivery_id::text
        and audit.action = 'DISTRIBUTION_SCHEDULE_CHANGED'
    ) as history
    order by history.occurred_at, history.event_id;
end;
$$;

revoke all on function public.list_distribution_delivery_status_history(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_distribution_delivery_status_history(uuid, uuid)
  to authenticated;

comment on function public.list_distribution_delivery_status_history(uuid, uuid) is
  'Returns authorized stage and schedule history, including the reason for each reschedule.';
