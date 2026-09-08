-- B0: evita que el wrapper legado revele la existencia o el estado de
-- ordenes ajenas antes de comprobar la autorizacion del llamador.
create or replace function public.receive_purchase_order(
  requested_organization_id uuid,
  requested_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_row public.purchase_orders%rowtype;
  items_payload jsonb;
begin
  if actor_id is null
    or requested_organization_id is null
    or not public.has_organization_permission(
      requested_organization_id,
      'PURCHASES_RECEIVE'
    )
  then
    raise exception using
      errcode = '42501',
      message = 'PURCHASE_RECEIPT_FORBIDDEN';
  end if;

  select * into order_row
  from public.purchase_orders purchase
  where purchase.organization_id = requested_organization_id
    and purchase.id = requested_order_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;

  select jsonb_agg(jsonb_build_object(
    'purchase_order_item_id', item.id,
    'quantity', item.quantity - coalesce(received.quantity, 0),
    'fulfillment_mode', case item.product_type
      when 'good' then 'physical'
      when 'service' then 'administrative'
    end,
    'location_id', case when item.product_type = 'good'
      then coalesce(setting.default_location_id, fallback.id)
    end,
    'lot', case when item.product_type = 'good' then item.lot end,
    'expiration_date', case when item.product_type = 'good'
      then item.expiration_date
    end
  ) order by item.id) into items_payload
  from public.purchase_order_items item
  left join public.product_warehouse_settings setting
    on setting.organization_id = item.organization_id
    and setting.product_id = item.product_id
    and setting.warehouse_id = order_row.warehouse_id
  left join lateral (
    select location.id
    from public.warehouse_locations location
    where location.organization_id = item.organization_id
      and location.warehouse_id = order_row.warehouse_id
      and location.is_active
    order by (location.code = 'GENERAL') desc, location.created_at, location.id
    limit 1
  ) fallback on true
  left join lateral (
    select coalesce(sum(receipt_item.quantity), 0) quantity
    from public.purchase_receipt_items receipt_item
    where receipt_item.organization_id = item.organization_id
      and receipt_item.purchase_order_item_id = item.id
  ) received on true
  where item.organization_id = requested_organization_id
    and item.purchase_order_id = requested_order_id
    and item.quantity > coalesce(received.quantity, 0);

  perform public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', requested_organization_id,
    'purchase_order_id', requested_order_id,
    'operation_key', extensions.gen_random_uuid(),
    'items', items_payload
  ));
end;
$$;

revoke all on function public.receive_purchase_order(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.receive_purchase_order(uuid, uuid)
  to authenticated;

comment on function public.receive_purchase_order(uuid, uuid) is
  'Wrapper legado de recepcion: autoriza PURCHASES_RECEIVE antes de consultar la orden y delega la escritura al RPC parcial estricto.';
