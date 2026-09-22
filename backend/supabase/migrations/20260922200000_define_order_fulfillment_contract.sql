-- SILSANPLEX: contrato persistente de cumplimiento de pedidos.
--
-- `orders.status` conserva el estado comercial legado. El cumplimiento
-- logístico se separa para no confundir salida de inventario con entrega al
-- cliente y para soportar recojo en tienda sin forzar una ruta de transporte.

alter table public.orders
  add column if not exists fulfillment_mode text not null default 'delivery',
  add column if not exists fulfillment_status text not null default 'pending';

-- Conserva la semántica de los registros existentes. Las entregas históricas
-- con modalidad de recojo son la única fuente suficiente para inferir pickup;
-- el resto mantiene delivery por compatibilidad con el flujo actual.
update public.orders order_row
set fulfillment_mode = 'pickup'
where exists (
  select 1
  from public.distribution_deliveries delivery
  where delivery.organization_id = order_row.organization_id
    and delivery.order_id = order_row.id
    and delivery.modalidad = 'recojo_cliente'
);

-- El estado nuevo se deriva de hechos persistentes, en orden de cierre. No se
-- inventan fechas, guías ni entregas: solo se refleja lo que ya existe.
update public.orders order_row
set fulfillment_status = case
  when order_row.status = 'cancelado' then 'cancelled'
  when exists (
    select 1
    from public.distribution_deliveries delivery
    where delivery.organization_id = order_row.organization_id
      and delivery.order_id = order_row.id
      and delivery.delivery_status = 'entregado'
  ) then 'delivered'
  when exists (
    select 1
    from public.distribution_deliveries delivery
    where delivery.organization_id = order_row.organization_id
      and delivery.order_id = order_row.id
      and delivery.delivery_status = 'entrega_parcial'
  ) then 'partially_fulfilled'
  when exists (
    select 1
    from public.distribution_deliveries delivery
    where delivery.organization_id = order_row.organization_id
      and delivery.order_id = order_row.id
      and delivery.delivery_status in ('preparando', 'en_curso', 'en_destino')
  ) then 'preparing'
  when exists (
    select 1
    from public.sales sale
    where sale.organization_id = order_row.organization_id
      and sale.order_id = order_row.id
      and sale.status = 'despachada'
  ) then 'dispatched'
  else 'pending'
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_fulfillment_mode_valid'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_fulfillment_mode_valid
      check (fulfillment_mode in ('delivery', 'pickup'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_fulfillment_status_valid'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_fulfillment_status_valid
      check (fulfillment_status in (
        'pending', 'preparing', 'dispatched', 'delivered',
        'partially_fulfilled', 'out_of_stock', 'cancelled'
      ));
  end if;
end;
$$;

create index if not exists orders_organization_fulfillment_idx
  on public.orders (organization_id, fulfillment_mode, fulfillment_status, created_at desc, id);

comment on column public.orders.fulfillment_mode is
  'Modalidad de cumplimiento comercial: delivery para entrega al cliente o pickup para recojo del cliente.';
comment on column public.orders.fulfillment_status is
  'Estado logístico separado del estado comercial; no implica por sí mismo que el cliente recibió el pedido.';
