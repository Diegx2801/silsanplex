-- Serializa el saldo devolvible por linea fisica de recepcion.
--
-- purchase_receipt_items es la fila estable que define el limite historico
-- o, cuando existe inspeccion, la linea cuyo accepted_quantity limita la
-- devolucion. El lock se toma antes de leer devoluciones anteriores y se
-- mantiene hasta el INSERT y el evento de auditoria.
create or replace function public.register_supplier_return(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  receipt_item_id uuid := (payload ->> 'purchase_receipt_item_id')::uuid;
  requested_quantity numeric := (payload ->> 'quantity')::numeric;
  accepted_quantity_value numeric;
  receipt_data record;
  return_id uuid;
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'SUPPLIERS_MANAGE') then
    raise exception using errcode = '42501', message = 'SUPPLIER_RETURN_FORBIDDEN';
  end if;

  -- Este lock debe preceder a la lectura de accepted_quantity y del saldo
  -- acumulado para que validacion e insercion sean una sola seccion critica.
  select receipt_item.*, purchase.id as order_id, item.id as order_item_id
  into receipt_data
  from public.purchase_receipt_items receipt_item
  join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id
    and receipt.organization_id = receipt_item.organization_id
  join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id
    and purchase.organization_id = receipt.organization_id
  join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id
    and item.organization_id = receipt_item.organization_id
  where receipt_item.id = receipt_item_id
    and receipt_item.organization_id = organization_id
    and purchase.supplier_id = supplier_id
  for update of receipt_item;

  if not found then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_RECEIPT_ITEM_INVALID';
  end if;

  select coalesce((
    select inspection.accepted_quantity
    from public.purchase_receipt_inspections inspection
    where inspection.organization_id = organization_id
      and inspection.purchase_receipt_item_id = receipt_item_id
      and inspection.status = 'completed'
    order by inspection.completed_at desc, inspection.id desc
    limit 1
  ), receipt_data.quantity)
  into accepted_quantity_value;

  if accepted_quantity_value <= 0 then
    raise exception using errcode = '22023', message = 'SUPPLIER_RETURN_NO_ACCEPTED_QUANTITY';
  end if;

  if requested_quantity <= 0 or requested_quantity + coalesce((
    select sum(previous.quantity)
    from public.supplier_returns previous
    where previous.organization_id = organization_id
      and previous.purchase_receipt_item_id = receipt_item_id
      and previous.status <> 'cancelled'
  ), 0) > accepted_quantity_value
  then
    raise exception using errcode = '22023', message = 'SUPPLIER_RETURN_QUANTITY_INVALID';
  end if;

  insert into public.supplier_returns (
    organization_id, supplier_id, purchase_order_id, purchase_order_item_id,
    purchase_receipt_item_id, product_id, quantity, reason, requested_at,
    responsible_user_id, responsible_name
  ) values (
    organization_id, supplier_id, receipt_data.order_id, receipt_data.order_item_id,
    receipt_item_id, receipt_data.product_id, requested_quantity,
    btrim(payload ->> 'reason'),
    coalesce(nullif(payload ->> 'requested_at', '')::date, current_date),
    actor_id, public.supplier_responsible_name(actor_id)
  )
  returning id into return_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values
  ) values (
    organization_id, actor_id, 'SUPPLIER_RETURN_REGISTERED',
    'supplier_return', return_id::text, payload - 'organization_id'
  );

  return return_id;
end;
$$;

revoke all on function public.register_supplier_return(jsonb)
from public, anon, authenticated;
grant execute on function public.register_supplier_return(jsonb)
to authenticated;
