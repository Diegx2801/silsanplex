-- Serializa los reintentos por orden antes de ejecutar la implementación.
-- Así dos solicitudes simultáneas con la misma clave devuelven la misma
-- recepción, incluso si la primera completó totalmente la orden.
alter function public.receive_purchase_order_partial(jsonb)
  rename to receive_purchase_order_partial_core;

revoke all on function public.receive_purchase_order_partial_core(jsonb)
from public, anon, authenticated;

create function public.receive_purchase_order_partial(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  order_id uuid := (payload ->> 'purchase_order_id')::uuid;
  idempotency_key uuid := (payload ->> 'operation_key')::uuid;
  receipt_id uuid;
begin
  if actor_id is null
    or not public.has_organization_permission(organization_id, 'PURCHASES_RECEIVE') then
    raise exception using errcode = '42501', message = 'PURCHASE_RECEIPT_FORBIDDEN';
  end if;

  perform 1 from public.purchase_orders purchase
  where purchase.id = order_id and purchase.organization_id = organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;

  select receipt.id into receipt_id
  from public.purchase_receipts receipt
  where receipt.organization_id = organization_id
    and receipt.operation_key = idempotency_key;
  if found then
    if not exists (
      select 1 from public.purchase_receipts receipt
      where receipt.id = receipt_id and receipt.purchase_order_id = order_id
    ) then
      raise exception using errcode = '23505', message = 'PURCHASE_RECEIPT_KEY_CONFLICT';
    end if;
    return receipt_id;
  end if;

  return public.receive_purchase_order_partial_core(payload);
end;
$$;

revoke all on function public.receive_purchase_order_partial(jsonb)
from public, anon, authenticated;
grant execute on function public.receive_purchase_order_partial(jsonb) to authenticated;
