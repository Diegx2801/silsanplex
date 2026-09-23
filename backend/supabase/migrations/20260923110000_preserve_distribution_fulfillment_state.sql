-- SILSANPLEX: la planificación logística no debe deshacer la salida física
-- ya confirmada en Ventas. El estado de recepción sigue derivándose de los
-- resultados registrados por Distribución.

create or replace function public.sync_order_fulfillment_from_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  total_goods numeric(16,3);
  delivered_goods numeric(16,3);
  next_status text;
begin
  select order_data.*
    into order_row
  from public.orders order_data
  where order_data.organization_id = new.organization_id
    and order_data.id = new.order_id
  for update;

  if not found then
    return new;
  end if;

  select coalesce(sum(item.quantity), 0),
         coalesce(sum(coalesce(delivered.quantity, 0)), 0)
    into total_goods, delivered_goods
  from public.order_items item
  join public.products product
    on product.organization_id = item.organization_id
   and product.id = item.product_id
   and product.product_type = 'good'
  left join lateral (
    select sum(outcome_line.quantity_delivered) as quantity
    from public.distribution_delivery_outcomes outcome
    join public.distribution_delivery_outcome_lines outcome_line
      on outcome_line.organization_id = outcome.organization_id
     and outcome_line.outcome_id = outcome.id
    join public.distribution_deliveries delivery
      on delivery.organization_id = outcome.organization_id
     and delivery.id = outcome.delivery_id
    where delivery.organization_id = item.organization_id
      and delivery.order_id = item.order_id
      and outcome_line.order_line_id = item.id
  ) delivered on true
  where item.organization_id = new.organization_id
    and item.order_id = new.order_id;

  next_status := case
    when order_row.status = 'cancelado' or order_row.fulfillment_status = 'cancelled' then 'cancelled'
    when order_row.fulfillment_status = 'delivered' then 'delivered'
    when total_goods > 0 and delivered_goods >= total_goods then 'delivered'
    when delivered_goods > 0 then 'partially_fulfilled'
    when new.delivery_status = 'preparando' then 'preparing'
    when new.delivery_status in ('en_curso', 'en_destino', 'rechazado', 'devuelto') then 'dispatched'
    when new.delivery_status in ('programado', 'reprogramado') then case
      when order_row.fulfillment_status in ('preparing', 'dispatched', 'partially_fulfilled')
        then order_row.fulfillment_status
      else 'dispatched'
    end
    else order_row.fulfillment_status
  end;

  update public.orders
  set fulfillment_status = next_status,
      updated_at = pg_catalog.now()
  where organization_id = new.organization_id
    and id = new.order_id
    and fulfillment_status is distinct from next_status;

  return new;
end;
$$;

revoke all on function public.sync_order_fulfillment_from_delivery()
  from public, anon, authenticated, service_role;
