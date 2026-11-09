begin;

select plan(10);

select has_function(
  'public', 'create_order_with_fulfillment', array['jsonb'],
  'existe el RPC para crear pedidos con modalidad explícita'
);
select has_function(
  'public', 'sync_order_fulfillment_from_sale', '{}',
  'existe la proyección de despacho desde ventas'
);
select has_function(
  'public', 'sync_order_fulfillment_from_delivery', '{}',
  'existe la proyección de estado desde distribución'
);
select has_trigger(
  'public', 'sales', 'sales_sync_order_fulfillment',
  'ventas actualiza el estado logístico del pedido'
);
select has_trigger(
  'public', 'distribution_deliveries', 'distribution_deliveries_sync_order_fulfillment',
  'distribución actualiza el estado logístico del pedido'
);
select has_trigger(
  'public', 'orders', 'orders_sync_order_fulfillment',
  'la cancelación comercial actualiza el cumplimiento'
);

insert into public.organizations (id, name, slug)
values ('f2100000-0000-4000-8000-000000000001', 'Cumplimiento de prueba', 'cumplimiento-prueba');

insert into public.customers (id, organization_id, document_type, document_number, legal_name)
values (
  'f2200000-0000-4000-8000-000000000001',
  'f2100000-0000-4000-8000-000000000001',
  'RUC', '20999999991', 'Cliente cumplimiento'
);

insert into public.warehouses (id, organization_id, code, name)
values (
  'f2300000-0000-4000-8000-000000000001',
  'f2100000-0000-4000-8000-000000000001',
  'F01', 'Almacén cumplimiento'
);

insert into public.orders (
  id, organization_id, order_number, customer_id, warehouse_id,
  order_date, status, operation_key
) values (
  'f2400000-0000-4000-8000-000000000001',
  'f2100000-0000-4000-8000-000000000001',
  'PED-910001', 'f2200000-0000-4000-8000-000000000001',
  'f2300000-0000-4000-8000-000000000001', '2026-09-22',
  'confirmado', 'f2500000-0000-4000-8000-000000000001'
);

select is(
  (select fulfillment_status from public.orders where id = 'f2400000-0000-4000-8000-000000000001'),
  'pending',
  'un pedido nuevo inicia pendiente de cumplimiento'
);

insert into public.sales (
  id, organization_id, order_id, customer_id, internal_number,
  document_type, series, document_number, sale_date, warehouse, operation_key
) values (
  'f2600000-0000-4000-8000-000000000001',
  'f2100000-0000-4000-8000-000000000001',
  'f2400000-0000-4000-8000-000000000001',
  'f2200000-0000-4000-8000-000000000001', 'VEN-910001',
  'boleta', 'F001', '910001', '2026-09-22', 'Almacén cumplimiento',
  'f2700000-0000-4000-8000-000000000001'
);

update public.sales
set status = 'despachada'
where id = 'f2600000-0000-4000-8000-000000000001';

select is(
  (select fulfillment_status from public.orders where id = 'f2400000-0000-4000-8000-000000000001'),
  'dispatched',
  'el despacho de una venta deja pendiente la entrega física'
);

insert into public.orders (
  id, organization_id, order_number, customer_id, warehouse_id,
  order_date, status, fulfillment_mode, operation_key
) values (
  'f2400000-0000-4000-8000-000000000002',
  'f2100000-0000-4000-8000-000000000001',
  'PED-910002', 'f2200000-0000-4000-8000-000000000001',
  'f2300000-0000-4000-8000-000000000001', '2026-09-22',
  'confirmado', 'pickup', 'f2500000-0000-4000-8000-000000000002'
);

insert into public.sales (
  id, organization_id, order_id, customer_id, internal_number,
  document_type, series, document_number, sale_date, warehouse, operation_key
) values (
  'f2600000-0000-4000-8000-000000000002',
  'f2100000-0000-4000-8000-000000000001',
  'f2400000-0000-4000-8000-000000000002',
  'f2200000-0000-4000-8000-000000000001', 'VEN-910002',
  'boleta', 'F001', '910002', '2026-09-22', 'Almacén cumplimiento',
  'f2700000-0000-4000-8000-000000000002'
);

update public.sales
set status = 'despachada'
where id = 'f2600000-0000-4000-8000-000000000002';

select is(
  (select fulfillment_status from public.orders where id = 'f2400000-0000-4000-8000-000000000002'),
  'delivered',
  'el despacho de un recojo confirma la entrega al cliente'
);

update public.orders
set status = 'cancelado'
where id = 'f2400000-0000-4000-8000-000000000001';

select is(
  (select fulfillment_status from public.orders where id = 'f2400000-0000-4000-8000-000000000001'),
  'cancelled',
  'la cancelación del pedido actualiza su cumplimiento'
);

select * from finish();
rollback;
