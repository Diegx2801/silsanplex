begin;

select plan(30);

select has_function(
  'public', 'update_order_quantities', array['jsonb'],
  'existe la RPC de modificacion atomica de cantidades'
);
select has_function(
  'public', 'cancel_order', array['jsonb'],
  'existe la RPC de cancelacion atomica'
);

insert into public.organizations (id, name, slug) values
  ('b2f10000-0000-4000-8000-000000000001', 'Modificacion reservas', 'modificacion-reservas'),
  ('b2f10000-0000-4000-8000-000000000002', 'Otra organizacion modificacion', 'otra-modificacion-reservas');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('b2f20000-0000-4000-8000-000000000001', 'modificacion.reservas@test.local', '{"full_name":"Modificacion reservas"}', now(), now()),
  ('b2f20000-0000-4000-8000-000000000002', 'modificacion.otra@test.local', '{"full_name":"Otra organizacion"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('b2f10000-0000-4000-8000-000000000001', 'b2f20000-0000-4000-8000-000000000001'),
  ('b2f10000-0000-4000-8000-000000000002', 'b2f20000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('b2f10000-0000-4000-8000-000000000001', 'b2f20000-0000-4000-8000-000000000001', 'ADMIN'),
  ('b2f10000-0000-4000-8000-000000000002', 'b2f20000-0000-4000-8000-000000000002', 'ADMIN');

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name, created_by, updated_by
) values (
  'b2f30000-0000-4000-8000-000000000001',
  'b2f10000-0000-4000-8000-000000000001',
  'RUC', '20999999991', 'Cliente modificacion reservas',
  'b2f20000-0000-4000-8000-000000000001', 'b2f20000-0000-4000-8000-000000000001'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  batch_control, expiration_control, created_by, updated_by
) values
  ('b2f40000-0000-4000-8000-000000000001', 'b2f10000-0000-4000-8000-000000000001', 'MOD-001', 'Producto modificable FEFO', 'UND', true, true, 'b2f20000-0000-4000-8000-000000000001', 'b2f20000-0000-4000-8000-000000000001'),
  ('b2f40000-0000-4000-8000-000000000002', 'b2f10000-0000-4000-8000-000000000001', 'MOD-002', 'Producto modificable simple', 'UND', false, false, 'b2f20000-0000-4000-8000-000000000001', 'b2f20000-0000-4000-8000-000000000001'),
  ('b2f40000-0000-4000-8000-000000000003', 'b2f10000-0000-4000-8000-000000000001', 'MOD-003', 'Producto rollback multilinea', 'UND', false, false, 'b2f20000-0000-4000-8000-000000000001', 'b2f20000-0000-4000-8000-000000000001');

insert into public.warehouses (id, organization_id, code, name, is_active, created_by, updated_by) values
  ('b2f50000-0000-4000-8000-000000000001', 'b2f10000-0000-4000-8000-000000000001', 'MOD', 'Almacen modificacion', true, 'b2f20000-0000-4000-8000-000000000001', 'b2f20000-0000-4000-8000-000000000001'),
  ('b2f50000-0000-4000-8000-000000000002', 'b2f10000-0000-4000-8000-000000000001', 'INAC', 'Almacen inactivo', false, 'b2f20000-0000-4000-8000-000000000001', 'b2f20000-0000-4000-8000-000000000001');
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'b2f60000-0000-4000-8000-000000000001', 'b2f10000-0000-4000-8000-000000000001', 'b2f50000-0000-4000-8000-000000000001', 'A-01', 'Ubicacion modificacion A', 'b2f20000-0000-4000-8000-000000000001', 'b2f20000-0000-4000-8000-000000000001'
), (
  'b2f60000-0000-4000-8000-000000000002', 'b2f10000-0000-4000-8000-000000000001', 'b2f50000-0000-4000-8000-000000000001', 'B-01', 'Ubicacion modificacion B', 'b2f20000-0000-4000-8000-000000000001', 'b2f20000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2f20000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2f10000-0000-4000-8000-000000000001', 'product_id','b2f40000-0000-4000-8000-000000000001',
  'warehouse_id','b2f50000-0000-4000-8000-000000000001', 'location_id','b2f60000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',5, 'unit_cost',10, 'stock_status','available', 'lot','MOD-A',
  'expiration_date','2099-01-01', 'operation_date','2026-09-01', 'reason','Stock modificacion lote A'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2f10000-0000-4000-8000-000000000001', 'product_id','b2f40000-0000-4000-8000-000000000001',
  'warehouse_id','b2f50000-0000-4000-8000-000000000001', 'location_id','b2f60000-0000-4000-8000-000000000002',
  'movement_type','entrada', 'quantity',5, 'unit_cost',12, 'stock_status','available', 'lot','MOD-B',
  'expiration_date','2099-02-01', 'operation_date','2026-09-01', 'reason','Stock modificacion lote B'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2f10000-0000-4000-8000-000000000001', 'product_id','b2f40000-0000-4000-8000-000000000002',
  'warehouse_id','b2f50000-0000-4000-8000-000000000001', 'location_id','b2f60000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',10, 'unit_cost',4, 'stock_status','available',
  'operation_date','2026-09-01', 'reason','Stock modificacion simple'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2f10000-0000-4000-8000-000000000001', 'product_id','b2f40000-0000-4000-8000-000000000003',
  'warehouse_id','b2f50000-0000-4000-8000-000000000001', 'location_id','b2f60000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',2, 'unit_cost',3, 'stock_status','available',
  'operation_date','2026-09-01', 'reason','Stock rollback multilinea'
));

select public.create_order(jsonb_build_object(
  'organization_id','b2f10000-0000-4000-8000-000000000001',
  'operation_key','b2f70000-0000-4000-8000-000000000001',
  'customer_id','b2f30000-0000-4000-8000-000000000001',
  'warehouse_id','b2f50000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('product_id','b2f40000-0000-4000-8000-000000000001','quantity',7,'unit_price',10))
));

select is((select count(*) from public.inventory_reservations where source_type = 'order-item'), 2::bigint, 'la linea inicial se distribuye en dos buckets');
select results_eq($$select lot, quantity from public.inventory_reservations where source_type = 'order-item' order by expiration_date$$, $$values ('MOD-A'::text, 5.000::numeric), ('MOD-B'::text, 2.000::numeric)$$, 'la reserva inicial conserva FEFO');
select is((select sum(physical_quantity) from public.inventory_bucket_availability where organization_id = 'b2f10000-0000-4000-8000-000000000001' and product_id = 'b2f40000-0000-4000-8000-000000000001' and warehouse_id = 'b2f50000-0000-4000-8000-000000000001'), 10.000::numeric, 'el fisico inicial es diez');
select is((select sum(reserved_quantity) from public.inventory_bucket_availability where organization_id = 'b2f10000-0000-4000-8000-000000000001' and product_id = 'b2f40000-0000-4000-8000-000000000001' and warehouse_id = 'b2f50000-0000-4000-8000-000000000001'), 7.000::numeric, 'la reserva inicial es siete');

select is(
  public.update_order_quantities(jsonb_build_object(
    'organization_id','b2f10000-0000-4000-8000-000000000001',
    'order_id',(select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
    'operation_key','b2f70000-0000-4000-8000-000000000002',
    'items',jsonb_build_array(jsonb_build_object('order_item_id',(select id from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001')),'quantity',4))
  )),
  (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
  'la reduccion devuelve el pedido y es atomica'
);
select is((select quantity from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001')), 4.000::numeric, 'la cantidad de linea queda reducida');
select is((select sum(quantity - quantity_consumed) from public.inventory_reservations where source_type = 'order-item' and source_id = (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001') ) and status = 'active'), 4.000::numeric, 'la reduccion libera cuatro unidades');
select is((select count(*) from public.inventory_reservations where source_type = 'order-item' and status = 'released'), 1::bigint, 'el bucket menos prioritario se libera completo');
select is((select sum(assignable_quantity) from public.inventory_bucket_availability where organization_id = 'b2f10000-0000-4000-8000-000000000001' and product_id = 'b2f40000-0000-4000-8000-000000000001' and warehouse_id = 'b2f50000-0000-4000-8000-000000000001'), 6.000::numeric, 'la reduccion devuelve disponibilidad asignable');

select is(
  public.update_order_quantities(jsonb_build_object(
    'organization_id','b2f10000-0000-4000-8000-000000000001',
    'order_id',(select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
    'operation_key','b2f70000-0000-4000-8000-000000000003',
    'items',jsonb_build_array(jsonb_build_object('order_item_id',(select id from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001')),'quantity',8))
  )),
  (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
  'el incremento reserva el delta disponible'
);
select results_eq($$select lot, quantity, status from public.inventory_reservations where source_type = 'order-item' and product_id = 'b2f40000-0000-4000-8000-000000000001' order by expiration_date$$, $$values ('MOD-A'::text, 5.000::numeric, 'active'::text), ('MOD-B'::text, 3.000::numeric, 'active'::text)$$, 'el incremento reactiva/fusiona el bucket FEFO sin duplicarlo');
select is((select sum(physical_quantity) from public.inventory_bucket_availability where organization_id = 'b2f10000-0000-4000-8000-000000000001' and product_id = 'b2f40000-0000-4000-8000-000000000001' and warehouse_id = 'b2f50000-0000-4000-8000-000000000001'), 10.000::numeric, 'el incremento no reduce fisico');
select is((select sum(reserved_quantity) from public.inventory_bucket_availability where organization_id = 'b2f10000-0000-4000-8000-000000000001' and product_id = 'b2f40000-0000-4000-8000-000000000001' and warehouse_id = 'b2f50000-0000-4000-8000-000000000001'), 8.000::numeric, 'el incremento deja ocho reservadas');
select is((select sum(assignable_quantity) from public.inventory_bucket_availability where organization_id = 'b2f10000-0000-4000-8000-000000000001' and product_id = 'b2f40000-0000-4000-8000-000000000001' and warehouse_id = 'b2f50000-0000-4000-8000-000000000001'), 2.000::numeric, 'el incremento deja dos asignables');

select is(
  public.update_order_quantities(jsonb_build_object(
    'organization_id','b2f10000-0000-4000-8000-000000000001',
    'order_id',(select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
    'operation_key','b2f70000-0000-4000-8000-000000000004',
    'items',jsonb_build_array(jsonb_build_object('order_item_id',(select id from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001')),'quantity',8))
  )),
  (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
  'un retry de modificacion devuelve el mismo pedido'
);
select is((select sum(quantity - quantity_consumed) from public.inventory_reservations where source_type = 'order-item' and source_id = (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'))), 8.000::numeric, 'el retry no duplica reservas');

select throws_ok($$select public.update_order_quantities(jsonb_build_object(
  'organization_id','b2f10000-0000-4000-8000-000000000001',
  'order_id',(select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
  'operation_key','b2f70000-0000-4000-8000-000000000005',
  'items',jsonb_build_array(jsonb_build_object('order_item_id',(select id from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001')),'quantity',20))
))$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'el incremento insuficiente falla completamente');
select is((select quantity from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001')), 8.000::numeric, 'el fallo de incremento conserva la cantidad anterior');

select public.create_order(jsonb_build_object(
  'organization_id','b2f10000-0000-4000-8000-000000000001',
  'operation_key','b2f70000-0000-4000-8000-000000000006',
  'customer_id','b2f30000-0000-4000-8000-000000000001',
  'warehouse_id','b2f50000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(
    jsonb_build_object('product_id','b2f40000-0000-4000-8000-000000000002','quantity',2,'unit_price',4),
    jsonb_build_object('product_id','b2f40000-0000-4000-8000-000000000003','quantity',1,'unit_price',3)
  )
));
select throws_ok($$select public.update_order_quantities(jsonb_build_object(
  'organization_id','b2f10000-0000-4000-8000-000000000001',
  'order_id',(select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000006'),
  'operation_key','b2f70000-0000-4000-8000-000000000007',
  'items',jsonb_build_array(
    jsonb_build_object('order_item_id',(select id from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000006') and product_id = 'b2f40000-0000-4000-8000-000000000002'),'quantity',8),
    jsonb_build_object('order_item_id',(select id from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000006') and product_id = 'b2f40000-0000-4000-8000-000000000003'),'quantity',5)
  )
))$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'una linea insuficiente revierte la modificacion multilinea');
select is((select quantity from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000006') and product_id = 'b2f40000-0000-4000-8000-000000000002'), 2.000::numeric, 'rollback multilinea conserva la primera linea');

select is(
  public.cancel_order(jsonb_build_object(
    'organization_id','b2f10000-0000-4000-8000-000000000001',
    'order_id',(select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
    'operation_key','b2f70000-0000-4000-8000-000000000008'
  )),
  (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
  'cancelar devuelve el pedido'
);
select is((select status from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'), 'cancelado', 'la cancelacion cambia el estado');
select is((select count(*) from public.inventory_reservations where source_type = 'order-item' and source_id = (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001') ) and status = 'active'), 0::bigint, 'la cancelacion libera todas las reservas activas');
select is((select sum(assignable_quantity) from public.inventory_bucket_availability where organization_id = 'b2f10000-0000-4000-8000-000000000001' and product_id = 'b2f40000-0000-4000-8000-000000000001' and warehouse_id = 'b2f50000-0000-4000-8000-000000000001'), 10.000::numeric, 'la cancelacion devuelve disponibilidad asignable');
select is(
  public.cancel_order(jsonb_build_object(
    'organization_id','b2f10000-0000-4000-8000-000000000001',
    'order_id',(select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
    'operation_key','b2f70000-0000-4000-8000-000000000008'
  )),
  (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
  'cancelar es idempotente con la misma clave'
);
select throws_ok($$select public.cancel_order(jsonb_build_object(
  'organization_id','b2f10000-0000-4000-8000-000000000001',
  'order_id',(select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
  'operation_key','b2f70000-0000-4000-8000-000000000009'
))$$, 'P0001', 'ORDER_NOT_CANCELLABLE', 'no se puede cancelar dos veces con otra operacion');
select throws_ok($$select public.update_order_quantities(jsonb_build_object(
  'organization_id','b2f10000-0000-4000-8000-000000000001',
  'order_id',(select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001'),
  'operation_key','b2f70000-0000-4000-8000-000000000010',
  'items',jsonb_build_array(jsonb_build_object('order_item_id',(select id from public.order_items where order_id = (select id from public.orders where operation_key = 'b2f70000-0000-4000-8000-000000000001')),'quantity',9))
))$$, 'P0001', 'ORDER_NOT_MODIFIABLE', 'no se modifica un pedido cancelado');
select is((select count(*) from public.inventory_movements where organization_id = 'b2f10000-0000-4000-8000-000000000001'), 4::bigint, 'modificar y cancelar no generan movimientos');

select * from finish();
rollback;
