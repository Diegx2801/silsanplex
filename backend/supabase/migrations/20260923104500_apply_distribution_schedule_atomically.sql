-- Actualiza estado y fecha programada en una misma transición. Esto permite
-- reprogramar desde un resultado fallido/parcial sin validar la fecha anterior.

create or replace function public.save_distribution_delivery(payload jsonb)
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
  requested_delivery_status text;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_delivery_id := nullif(payload ->> 'id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  requested_scheduled_date := nullif(payload ->> 'scheduled_date', '')::date;
  requested_delivery_status := coalesce(nullif(btrim(payload ->> 'delivery_status'), ''), 'programado');

  if actor_id is null
    or target_organization_id is null
    or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  result_id := public.replay_distribution_command(
    target_organization_id,
    operation_key_value,
    'save_distribution_delivery',
    payload
  );
  if result_id is not null then
    return result_id;
  end if;

  if target_delivery_id is not null then
    expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
    perform public.lock_distribution_delivery_version(
      target_organization_id,
      target_delivery_id,
      expected_lock_version
    );

    if requested_scheduled_date is not null then
      update public.distribution_deliveries
      set scheduled_date = requested_scheduled_date,
          delivery_status = requested_delivery_status
      where organization_id = target_organization_id
        and id = target_delivery_id;
    end if;
  end if;

  result_id := public.save_distribution_delivery_unchecked(payload);

  if target_delivery_id is not null then
    perform public.advance_distribution_delivery_version(
      target_organization_id,
      target_delivery_id
    );
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

comment on function public.save_distribution_delivery(jsonb) is
  'Persiste cambios de distribución de forma idempotente y optimista; cambia etapa y fecha canónica en una sola transición.';
