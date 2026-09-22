-- Distribución solo recibe ventas de envío cuyo despacho físico se completó.
-- Las cantidades parciales permanecen en Ventas porque hoy existe una única
-- programación por pedido; múltiples guías requieren un modelo por despacho.
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

  -- Una programación ya creada puede avanzar de estado aunque el cumplimiento
  -- del pedido cambie a preparing. Solo validar despacho al crear o cambiar
  -- la asociación, manteniendo la trazabilidad de la programación existente.
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
  if sale_row.status <> 'despachada' or order_row.fulfillment_status <> 'dispatched' then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ORDER_NOT_DISPATCHED';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_distribution_order_fulfillment()
  from public, anon, authenticated, service_role;

drop trigger if exists distribution_deliveries_require_fulfilled_order
  on public.distribution_deliveries;

create trigger distribution_deliveries_require_fulfilled_order
before insert or update on public.distribution_deliveries
for each row execute function public.guard_distribution_order_fulfillment();

comment on function public.guard_distribution_order_fulfillment() is
  'Impide crear una entrega en ruta para recojos o pedidos cuyo despacho de bienes sigue parcial o pendiente.';
