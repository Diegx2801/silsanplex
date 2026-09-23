-- Expone solo la bitacora de etapas de una entrega al personal con permiso
-- de consulta; audit_events permanece restringida a administradores.

create or replace function public.list_distribution_delivery_status_history(
  requested_organization_id uuid,
  requested_delivery_id uuid
)
returns table (
  event_id text,
  from_status text,
  to_status text,
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
    select history.event_id, history.from_status, history.to_status,
      history.actor_name, history.occurred_at
    from (
      select
        'created-' || delivery.id::text as event_id,
        null::text as from_status,
        'programado'::text as to_status,
        coalesce(profile.full_name, 'Usuario del sistema') as actor_name,
        delivery.created_at as occurred_at
      from public.distribution_deliveries delivery
      left join public.profiles profile on profile.id = delivery.created_by
      where delivery.organization_id = requested_organization_id
        and delivery.id = requested_delivery_id

      union all

      select
        audit.id::text as event_id,
        audit.old_values ->> 'delivery_status' as from_status,
        audit.new_values ->> 'delivery_status' as to_status,
        coalesce(profile.full_name, 'Usuario del sistema') as actor_name,
        audit.created_at as occurred_at
      from public.audit_events audit
      left join public.profiles profile on profile.id = audit.actor_user_id
      where audit.organization_id = requested_organization_id
        and audit.entity_type = 'distribution_delivery'
        and audit.entity_id = requested_delivery_id::text
        and audit.action = 'DISTRIBUTION_STATUS_CHANGED'
    ) as history
    order by history.occurred_at, history.event_id;
end;
$$;

revoke all on function public.list_distribution_delivery_status_history(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_distribution_delivery_status_history(uuid, uuid)
  to authenticated;

comment on function public.list_distribution_delivery_status_history(uuid, uuid) is
  'Entrega a usuarios autorizados el historial de etapas de una sola entrega, sin abrir la bitacora global.';
