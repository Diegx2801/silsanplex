-- D01: an unexpired JWT is not proof that its Auth session still exists.
-- Keep the existing administrator/tenant contract and the same single policy.
begin;

alter policy audit_events_select_admin on public.audit_events
using (
  (select public.current_auth_session_is_active())
  and organization_id is not null
  and public.is_organization_admin(organization_id)
);

-- These three authorized projections read audit_events as SECURITY DEFINER,
-- so table RLS alone cannot protect them. Add only the shared session guard;
-- preserve signatures, results, capability/tenant checks, volatility and ACLs.
create or replace function public.list_distribution_delivery_status_history(
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
    or not public.current_auth_session_is_active()
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

create or replace function public.list_distribution_inventory_movements(
  requested_organization_id uuid,
  requested_order_id uuid,
  requested_delivery_id uuid default null
)
returns table (
  inventory_movement_id uuid,
  order_item_id uuid,
  quantity_physical numeric,
  quantity_allocated numeric,
  quantity_available numeric,
  lot text,
  expiration_date date,
  warehouse text,
  warehouse_id uuid,
  location_id uuid,
  stock_status text,
  reservation_id uuid,
  document_reference text,
  operation_date date,
  operation_key text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or requested_organization_id is null
    or not public.current_auth_session_is_active()
    or not public.has_organization_permission(requested_organization_id, 'DISTRIBUTION_VIEW') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  return query
  select movement.id,
    item.id,
    movement.quantity,
    coalesce(allocated.quantity_allocated, 0),
    movement.quantity - coalesce(allocated.quantity_allocated, 0),
    movement.lot,
    movement.expiration_date,
    movement.warehouse,
    movement.warehouse_id,
    movement.location_id,
    movement.stock_status,
    movement.reservation_id,
    movement.document_reference,
    movement.operation_date,
    dispatch.operation_key
  from public.inventory_movements movement
  join public.order_items item
    on item.organization_id = movement.organization_id
   and item.id = movement.source_id
   and item.order_id = requested_order_id
  left join lateral (
    select coalesce(sum(allocation.quantity), 0)::numeric as quantity_allocated
    from public.distribution_delivery_inventory_allocations allocation
    join public.distribution_deliveries delivery
      on delivery.organization_id = allocation.organization_id
     and delivery.id = allocation.delivery_id
    where allocation.organization_id = requested_organization_id
      and allocation.inventory_movement_id = movement.id
      and allocation.delivery_id is distinct from requested_delivery_id
      and delivery.delivery_status <> 'cancelado'
  ) allocated on true
  left join lateral (
    select audit.metadata ->> 'operation_key' as operation_key
    from public.audit_events audit
    where audit.organization_id = requested_organization_id
      and audit.action = 'ORDER_DISPATCHED'
      and audit.entity_type = 'order'
      and audit.entity_id = requested_order_id::text
      and audit.metadata -> 'movement_ids' @> pg_catalog.jsonb_build_array(movement.id::text)
    order by audit.id desc
    limit 1
  ) dispatch on true
  where movement.organization_id = requested_organization_id
    and movement.movement_type = 'salida'
    and movement.source_type = 'order-dispatch'
    and movement.quantity - coalesce(allocated.quantity_allocated, 0) > 0
    and dispatch.operation_key is not null
  order by item.id, movement.expiration_date nulls last, movement.id;
end;
$$;

create or replace function public.list_distribution_delivery_inventory_trace(
  requested_organization_id uuid,
  requested_delivery_id uuid default null
)
returns table (
  delivery_id uuid,
  order_id uuid,
  order_item_id uuid,
  inventory_movement_id uuid,
  allocated_quantity numeric,
  lot text,
  expiration_date date,
  warehouse text,
  warehouse_id uuid,
  location_id uuid,
  stock_status text,
  reservation_id uuid,
  document_reference text,
  operation_date date,
  operation_key text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or requested_organization_id is null
    or not public.current_auth_session_is_active()
    or not public.has_organization_permission(requested_organization_id, 'DISTRIBUTION_VIEW') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  return query
  select allocation.delivery_id,
    allocation.order_id,
    allocation.order_line_id,
    allocation.inventory_movement_id,
    allocation.quantity,
    movement.lot,
    movement.expiration_date,
    movement.warehouse,
    movement.warehouse_id,
    movement.location_id,
    movement.stock_status,
    movement.reservation_id,
    movement.document_reference,
    movement.operation_date,
    dispatch.operation_key
  from public.distribution_delivery_inventory_allocations allocation
  join public.inventory_movements movement
    on movement.organization_id = allocation.organization_id
   and movement.id = allocation.inventory_movement_id
  left join lateral (
    select audit.metadata ->> 'operation_key' as operation_key
    from public.audit_events audit
    where audit.organization_id = requested_organization_id
      and audit.action = 'ORDER_DISPATCHED'
      and audit.entity_type = 'order'
      and audit.entity_id = allocation.order_id::text
      and audit.metadata -> 'movement_ids' @> pg_catalog.jsonb_build_array(allocation.inventory_movement_id::text)
    order by audit.id desc
    limit 1
  ) dispatch on true
  where allocation.organization_id = requested_organization_id
    and (requested_delivery_id is null or allocation.delivery_id = requested_delivery_id)
  order by allocation.delivery_id, allocation.order_line_id, allocation.inventory_movement_id;
end;
$$;

-- No GRANTs, backfill, event rewrites or business-data mutations. Future R39
-- work must extend this policy instead of adding a permissive alternative.
commit;
