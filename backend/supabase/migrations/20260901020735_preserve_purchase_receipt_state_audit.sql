create or replace function public.audit_purchase_order_receipt_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    and new.status in ('partially_received', 'received') then
    insert into public.audit_events (
      organization_id, actor_user_id, action, entity_type, entity_id,
      old_values, new_values
    ) values (
      new.organization_id, (select auth.uid()),
      case when new.status = 'received' then 'PURCHASE_ORDER_RECEIVED'
           else 'PURCHASE_ORDER_PARTIALLY_RECEIVED' end,
      'purchase_order', new.id::text, to_jsonb(old), to_jsonb(new)
    );
  end if;
  return new;
end;
$$;

create trigger purchase_orders_audit_receipt_transition
after update of status on public.purchase_orders
for each row execute function public.audit_purchase_order_receipt_transition();

revoke all on function public.audit_purchase_order_receipt_transition()
from public, anon, authenticated;
