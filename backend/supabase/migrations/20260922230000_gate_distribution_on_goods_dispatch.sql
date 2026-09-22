-- Distribución sigue la salida física de bienes, no el estado agregado de la
-- venta: puede haber servicios pendientes aunque todos los bienes ya salieron.
create or replace function public.guard_distribution_order_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  sale_row public.sales%rowtype;
begin
  select order_data.*
    into order_row
  from public.orders order_data
  where order_data.organization_id = new.organization_id
    and order_data.id = new.order_id
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ORDER_NOT_FOUND';
  end if;
  if order_row.status = 'cancelado' then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ORDER_NOT_AVAILABLE';
  end if;
  if order_row.fulfillment_mode <> 'delivery' or new.modalidad = 'recojo_cliente' then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_PICKUP_NOT_SUPPORTED';
  end if;

  -- Una programación ya creada puede avanzar de estado aunque el pedido pase
  -- a preparing. Validamos elegibilidad al crearla o cambiar su pedido/venta.
  if tg_op = 'UPDATE'
    and new.order_id = old.order_id
    and new.sale_id is not distinct from old.sale_id then
    return new;
  end if;

  select sale_data.*
    into sale_row
  from public.sales sale_data
  where sale_data.organization_id = new.organization_id
    and sale_data.order_id = new.order_id
    and (new.sale_id is null or sale_data.id = new.sale_id)
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_SALE_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.order_items item
    join public.products product
      on product.organization_id = item.organization_id
     and product.id = item.product_id
    where item.organization_id = new.organization_id
      and item.order_id = new.order_id
      and product.product_type = 'good'
  ) then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_GOODS_REQUIRED';
  end if;

  if exists (
    select 1
    from public.order_items item
    join public.products product
      on product.organization_id = item.organization_id
     and product.id = item.product_id
    left join lateral (
      select sum(reservation.quantity_consumed) as quantity_dispatched
      from public.inventory_reservations reservation
      where reservation.organization_id = item.organization_id
        and reservation.source_type = 'order-item'
        and reservation.source_id = item.id
    ) dispatched on true
    where item.organization_id = new.organization_id
      and item.order_id = new.order_id
      and product.product_type = 'good'
      and coalesce(dispatched.quantity_dispatched, 0) < item.quantity
  ) then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ORDER_NOT_DISPATCHED';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_distribution_order_fulfillment()
  from public, anon, authenticated, service_role;

comment on function public.guard_distribution_order_fulfillment() is
  'Impide programar recojos o pedidos con bienes físicos pendientes de despacho, sin bloquear entregas por servicios aún abiertos.';
