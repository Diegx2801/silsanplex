-- Evita reiniciar una entrega que ya está en ruta y conserva la trazabilidad
-- de cambios de fecha desde el historial específico de Distribución.

create or replace function public.distribution_delivery_transition_allowed(
  current_status text,
  next_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case current_status
    when 'programado' then next_status = any (array['programado', 'preparando', 'reprogramado', 'cancelado']::text[])
    when 'preparando' then next_status = any (array['preparando', 'en_curso', 'reprogramado', 'cancelado']::text[])
    when 'en_curso' then next_status = any (array['en_curso', 'en_destino', 'entrega_parcial', 'rechazado']::text[])
    when 'en_destino' then next_status = any (array['en_destino', 'entregado', 'entrega_parcial', 'rechazado']::text[])
    when 'entregado' then next_status = 'entregado'
    when 'entrega_parcial' then next_status = any (array['entrega_parcial', 'en_curso', 'en_destino', 'entregado', 'rechazado', 'reprogramado']::text[])
    when 'reprogramado' then next_status = any (array['reprogramado', 'preparando', 'cancelado']::text[])
    when 'rechazado' then next_status = any (array['rechazado', 'reprogramado']::text[])
    when 'devuelto' then next_status = 'devuelto'
    when 'cancelado' then next_status = 'cancelado'
    else false
  end;
$$;

create or replace function public.guard_distribution_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scheduled_date is distinct from old.scheduled_date
    and old.delivery_status in ('en_curso', 'en_destino', 'entregado', 'devuelto', 'cancelado') then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ROUTE_ALREADY_STARTED';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_distribution_schedule_change()
  from public, anon, authenticated, service_role;

drop trigger if exists distribution_deliveries_guard_schedule_change
  on public.distribution_deliveries;
create trigger distribution_deliveries_guard_schedule_change
before update of scheduled_date on public.distribution_deliveries
for each row execute function public.guard_distribution_schedule_change();

create or replace function public.record_distribution_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scheduled_date is distinct from old.scheduled_date then
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
      jsonb_build_object('delivery_id', new.id, 'source', 'distribution_delivery_update')
    );
  end if;

  return new;
end;
$$;

revoke all on function public.record_distribution_schedule_change()
  from public, anon, authenticated, service_role;

drop trigger if exists distribution_deliveries_record_schedule_change
  on public.distribution_deliveries;
create trigger distribution_deliveries_record_schedule_change
after update of scheduled_date on public.distribution_deliveries
for each row execute function public.record_distribution_schedule_change();

-- La rutina histórica guarda `delivery_date` por compatibilidad. El RPC de
-- idempotencia aplica además `scheduled_date` explícitamente, que es la fecha
-- canónica usada por Distribución y su bitácora.
create or replace function public.save_distribution_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  target_delivery_id uuid;
  operation_key_value uuid;
  requested_scheduled_date date;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_delivery_id := nullif(payload ->> 'id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  requested_scheduled_date := nullif(payload ->> 'scheduled_date', '')::date;

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

  if target_delivery_id is not null and requested_scheduled_date is not null then
    update public.distribution_deliveries
    set scheduled_date = requested_scheduled_date
    where organization_id = target_organization_id
      and id = target_delivery_id;
  end if;

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

revoke all on function public.save_distribution_delivery(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_distribution_delivery(jsonb) to authenticated;

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
      history.from_scheduled_date, history.to_scheduled_date, history.actor_name, history.occurred_at
    from (
      select
        'created-' || delivery.id::text as event_id,
        'status'::text as event_type,
        null::text as from_status,
        'programado'::text as to_status,
        null::date as from_scheduled_date,
        null::date as to_scheduled_date,
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

comment on function public.guard_distribution_schedule_change() is
  'Impide mover fechas de entregas que ya están en ruta o cerradas.';
comment on function public.record_distribution_schedule_change() is
  'Audita cada cambio de fecha programada, conservando antes, después y usuario.';
comment on function public.list_distribution_delivery_status_history(uuid, uuid) is
  'Entrega a usuarios autorizados el historial de etapas y fechas de una sola entrega.';
