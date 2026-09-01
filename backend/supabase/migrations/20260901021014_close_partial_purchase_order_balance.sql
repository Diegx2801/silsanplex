alter table public.purchase_orders
  add column closed_at timestamptz,
  add column closed_by uuid references auth.users(id) on delete set null,
  add column close_reason text;

update public.purchase_orders
set closed_at = cancelled_at,
    closed_by = updated_by,
    close_reason = 'Anulacion historica migrada'
where status = 'cancelled';

alter table public.purchase_orders
  drop constraint purchase_orders_status_valid,
  drop constraint purchase_orders_status_dates_consistent,
  add constraint purchase_orders_status_valid
    check (status in ('draft', 'issued', 'partially_received', 'received', 'closed_partial', 'cancelled')),
  add constraint purchase_orders_close_reason_length
    check (close_reason is null or char_length(btrim(close_reason)) between 5 and 240),
  add constraint purchase_orders_status_dates_consistent
    check (
      (status = 'draft' and issued_at is null and received_at is null and cancelled_at is null and closed_at is null)
      or (status in ('issued', 'partially_received') and issued_at is not null and received_at is null and cancelled_at is null and closed_at is null)
      or (status = 'received' and issued_at is not null and received_at is not null and cancelled_at is null and closed_at is null)
      or (status = 'closed_partial' and issued_at is not null and received_at is null and cancelled_at is null and closed_at is not null and close_reason is not null)
      or (status = 'cancelled' and received_at is null and cancelled_at is not null and closed_at is not null and close_reason is not null)
    );

create or replace function public.close_purchase_order(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  order_id uuid := (payload ->> 'purchase_order_id')::uuid;
  reason_value text := nullif(btrim(payload ->> 'reason'), '');
  order_row public.purchase_orders%rowtype;
  closed_order public.purchase_orders%rowtype;
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'PURCHASES_MANAGE') then
    raise exception using errcode = '42501', message = 'PURCHASE_ORDER_FORBIDDEN';
  end if;
  if reason_value is null or char_length(reason_value) not between 5 and 240 then
    raise exception using errcode = '22023', message = 'PURCHASE_ORDER_CLOSE_REASON_INVALID';
  end if;
  select * into order_row from public.purchase_orders purchase
  where purchase.id = order_id and purchase.organization_id = organization_id for update;
  if not found or order_row.status not in ('draft', 'issued', 'partially_received') then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_CANCELLABLE';
  end if;

  update public.purchase_orders purchase
  set status = case when order_row.status = 'partially_received' then 'closed_partial' else 'cancelled' end,
      cancelled_at = case when order_row.status = 'partially_received' then null else now() end,
      closed_at = now(), closed_by = actor_id, close_reason = reason_value, updated_by = actor_id
  where purchase.id = order_id
  returning * into closed_order;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, old_values, new_values, metadata
  ) values (
    organization_id, actor_id,
    case when closed_order.status = 'closed_partial' then 'PURCHASE_ORDER_BALANCE_CLOSED' else 'PURCHASE_ORDER_CANCELLED' end,
    'purchase_order', order_id::text, to_jsonb(order_row), to_jsonb(closed_order),
    jsonb_build_object('reason', reason_value)
  );
end;
$$;

revoke all on function public.close_purchase_order(jsonb) from public, anon, authenticated;
grant execute on function public.close_purchase_order(jsonb) to authenticated;
