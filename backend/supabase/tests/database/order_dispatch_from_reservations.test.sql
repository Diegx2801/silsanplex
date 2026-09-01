begin;

select plan(28);

select has_function(
  'public', 'dispatch_order_from_reservations', array['jsonb'],
  'existe la RPC transaccional de despacho desde reservas'
);

insert into public.organizations (id, name, slug) values
  ('b3b00000-0000-4000-8000-000000000001', 'Despachos uno', 'despachos-uno');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('b3c00000-0000-4000-8000-000000000001', 'despachos@test.local', '{"full_name":"Despachos"}', now(), now());
insert into public.organization_memberships (organization_id, user_id) values
  ('b3b00000-0000-4000-8000-000000000001', 'b3c00000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('b3b00000-0000-4000-8000-000000000001', 'b3c00000-0000-4000-8000-000000000001', 'ADMIN');
insert into public.customers (
  id, organization_id, document_type, document_number, legal_name,
  created_by, updated_by
) values (
  'b3d00000-0000-4000-8000-000000000001',
  'b3b00000-0000-4000-8000-000000000001', 'RUC', '20111111111',
  'Cliente despacho', 'b3c00000-0000-4000-8000-000000000001',
  'b3c00000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  batch_control, expiration_control, created_by, updated_by
) values (
  'b3e00000-0000-4000-8000-000000000001',
  'b3b00000-0000-4000-8000-000000000001', 'DSP-001', 'Producto despacho FEFO',
  'UND', true, true, 'b3c00000-0000-4000-8000-000000000001',
  'b3c00000-0000-4000-8000-000000000001'
);
insert into public.warehouses (
  id, organization_id, code, name, is_active, created_by, updated_by
) values (
  'b3f00000-0000-4000-8000-000000000001',
  'b3b00000-0000-4000-8000-000000000001', 'DSP', 'Almacen despacho', true,
  'b3c00000-0000-4000-8000-000000000001', 'b3c00000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values
  ('b3a00000-0000-4000-8000-000000000001', 'b3b00000-0000-4000-8000-000000000001',
   'b3f00000-0000-4000-8000-000000000001', 'A', 'Ubicacion A',
   'b3c00000-0000-4000-8000-000000000001', 'b3c00000-0000-4000-8000-000000000001'),
  ('b3a00000-0000-4000-8000-000000000002', 'b3b00000-0000-4000-8000-000000000001',
   'b3f00000-0000-4000-8000-000000000001', 'B', 'Ubicacion B',
   'b3c00000-0000-4000-8000-000000000001', 'b3c00000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b3c00000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b3b00000-0000-4000-8000-000000000001',
  'product_id','b3e00000-0000-4000-8000-000000000001',
  'warehouse_id','b3f00000-0000-4000-8000-000000000001',
  'location_id','b3a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',4, 'unit_cost',10,
  'stock_status','available', 'lot','A', 'expiration_date','2099-01-01',
  'operation_date','2026-09-01', 'reason','Ingreso lote A'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b3b00000-0000-4000-8000-000000000001',
  'product_id','b3e00000-0000-4000-8000-000000000001',
  'warehouse_id','b3f00000-0000-4000-8000-000000000001',
  'location_id','b3a00000-0000-4000-8000-000000000002',
  'movement_type','entrada', 'quantity',6, 'unit_cost',12,
  'stock_status','available', 'lot','B', 'expiration_date','2099-02-01',
  'operation_date','2026-09-01', 'reason','Ingreso lote B'
));

select public.create_order(jsonb_build_object(
  'organization_id','b3b00000-0000-4000-8000-000000000001',
  'operation_key','b3100000-0000-4000-8000-000000000001',
  'customer_id','b3d00000-0000-4000-8000-000000000001',
  'warehouse_id','b3f00000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object(
    'product_id','b3e00000-0000-4000-8000-000000000001', 'quantity',10, 'unit_price',20
  ))
)) as order_id \gset
select public.create_sale_from_order(
  'b3b00000-0000-4000-8000-000000000001', :'order_id',
  jsonb_build_object(
    'operation_key','b3200000-0000-4000-8000-000000000001',
    'document_type','boleta', 'series','B001', 'document_number','1',
    'warehouse','Almacen despacho'
  )
) as sale_id \gset

select public.dispatch_order_from_reservations(jsonb_build_object(
  'organization_id','b3b00000-0000-4000-8000-000000000001',
  'order_id', :'order_id', 'sale_id', :'sale_id',
  'operation_key','b3300000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object(
    'order_item_id',(select id from public.order_items where order_id = :'order_id'), 'quantity',6
  ))
)) as partial_dispatch_id \gset
select is((select count(*) from public.inventory_movements where source_type = 'order-dispatch'), 2::bigint, 'el despacho parcial consume dos lotes FEFO');
select is((select sum(quantity) from public.inventory_movements where source_type = 'order-dispatch'), 6.000::numeric, 'el parcial genera exactamente la cantidad solicitada');
select is((select sum(quantity - quantity_consumed) from public.inventory_reservations where source_type = 'order-item' and source_id = (select id from public.order_items where order_id = :'order_id')), 4.000::numeric, 'quedan cuatro unidades reservadas');
select is((select sum(physical_quantity) from public.inventory_bucket_availability where product_id = 'b3e00000-0000-4000-8000-000000000001'), 4.000::numeric, 'el stock fisico disminuye a cuatro');
select is((select sum(reserved_quantity) from public.inventory_bucket_availability where product_id = 'b3e00000-0000-4000-8000-000000000001'), 4.000::numeric, 'la reserva disminuye a cuatro');
select is((select sum(assignable_quantity) from public.inventory_bucket_availability where product_id = 'b3e00000-0000-4000-8000-000000000001'), 0.000::numeric, 'el saldo asignable permanece cero');
select is((select status from public.sales where id = :'sale_id'), 'registrada', 'la venta parcial conserva registrada');
select is((select status from public.orders where id = :'order_id'), 'confirmado', 'el pedido parcial conserva confirmado');
select is((select count(*) from public.inventory_kardex where source_type = 'order-dispatch'), 2::bigint, 'Kardex refleja las salidas comerciales');
select is((select count(*) from public.inventory_movements movement join public.inventory_reservations reservation on reservation.organization_id = movement.organization_id and reservation.id = movement.reservation_id where movement.source_type = 'order-dispatch' and reservation.source_id = (select id from public.order_items where order_id = :'order_id')), 2::bigint, 'la trazabilidad une linea reserva y movimiento');
select throws_ok($$select public.dispatch_order_from_reservations(jsonb_build_object(
  'organization_id','b3b00000-0000-4000-8000-000000000001', 'order_id',(select id from public.orders where order_number = 'PED-000001'), 'sale_id',(select id from public.sales where internal_number = 'VEN-000001'),
  'operation_key','b3300000-0000-4000-8000-000000000005', 'items',jsonb_build_array(jsonb_build_object('order_item_id',(select id from public.order_items where order_id = (select id from public.orders where order_number = 'PED-000001')), 'quantity',5))
))$$, 'P0001', 'ORDER_DISPATCH_EXCEEDS_RESERVED', 'no se puede despachar por encima del pendiente');
select is((select count(*) from public.inventory_movements where source_type = 'order-dispatch'), 2::bigint, 'el exceso revierte cualquier movimiento parcial');

select public.dispatch_order_from_reservations(jsonb_build_object(
  'organization_id','b3b00000-0000-4000-8000-000000000001', 'order_id', :'order_id', 'sale_id', :'sale_id',
  'operation_key','b3300000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('order_item_id',(select id from public.order_items where order_id = :'order_id'), 'quantity',6))
)) as retry_dispatch_id \gset
select is(:'retry_dispatch_id'::uuid, :'order_id'::uuid, 'retry devuelve el pedido original');
select is((select count(*) from public.inventory_movements where source_type = 'order-dispatch'), 2::bigint, 'retry no duplica movimientos');

select public.dispatch_order_from_reservations(jsonb_build_object(
  'organization_id','b3b00000-0000-4000-8000-000000000001', 'order_id', :'order_id', 'sale_id', :'sale_id',
  'operation_key','b3300000-0000-4000-8000-000000000002',
  'items',jsonb_build_array(jsonb_build_object('order_item_id',(select id from public.order_items where order_id = :'order_id'), 'quantity',4))
)) as complete_dispatch_id \gset
select is((select count(*) from public.inventory_movements where source_type = 'order-dispatch'), 3::bigint, 'segundo despacho crea el movimiento restante');
select is((select sum(quantity - quantity_consumed) from public.inventory_reservations where source_type = 'order-item' and source_id = (select id from public.order_items where order_id = :'order_id')), 0.000::numeric, 'la reserva queda completamente consumida');
select is((select status from public.inventory_reservations where source_type = 'order-item' and source_id = (select id from public.order_items where order_id = :'order_id') and lot = 'A'), 'consumed', 'lote A consumido');
select is((select status from public.inventory_reservations where source_type = 'order-item' and source_id = (select id from public.order_items where order_id = :'order_id') and lot = 'B'), 'consumed', 'lote B consumido');
select is((select sum(physical_quantity) from public.inventory_bucket_availability where product_id = 'b3e00000-0000-4000-8000-000000000001'), 0.000::numeric, 'stock fisico queda en cero');
select is((select sum(reserved_quantity) from public.inventory_bucket_availability where product_id = 'b3e00000-0000-4000-8000-000000000001'), 0.000::numeric, 'reservado queda en cero');
select is((select status from public.sales where id = :'sale_id'), 'despachada', 'venta completa queda despachada');
select is((select status from public.orders where id = :'order_id'), 'atendido', 'pedido completo queda atendido');
select is((select count(*) from public.audit_events where action = 'ORDER_DISPATCHED' and entity_id = :'order_id'), 2::bigint, 'cada despacho queda auditado');
select is((select running_quantity from public.inventory_kardex where source_type = 'order-dispatch' order by ledger_sequence desc limit 1), 0.000::numeric, 'Kardex conserva saldo final cero');

select throws_ok($$select public.dispatch_order_from_reservations(jsonb_build_object(
  'organization_id','b3b00000-0000-4000-8000-000000000001',
  'order_id',(select id from public.orders where order_number = 'PED-000001'),
  'sale_id',(select id from public.sales where internal_number = 'VEN-000001'),
  'operation_key','b3300000-0000-4000-8000-000000000003',
  'items',jsonb_build_array(jsonb_build_object(
    'order_item_id',(select id from public.order_items where order_id = (select id from public.orders where order_number = 'PED-000001')), 'quantity',1
  ))
))$$, 'P0001', 'ORDER_NOT_DISPATCHABLE', 'no se puede despachar dos veces una venta completada');

select throws_ok($$select public.dispatch_order_from_reservations(jsonb_build_object(
  'organization_id','b3b00000-0000-4000-8000-000000000001',
  'order_id',(select id from public.orders where order_number = 'PED-000001'),
  'sale_id',(select id from public.sales where internal_number = 'VEN-000001'),
  'operation_key','b3300000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object(
    'order_item_id',(select id from public.order_items where order_id = (select id from public.orders where order_number = 'PED-000001')), 'quantity',4
  ))
))$$, 'P0001', 'ORDER_OPERATION_KEY_REUSED', 'la clave no se reutiliza con otro payload');

select throws_ok($$select public.dispatch_order_from_reservations(jsonb_build_object(
  'organization_id','b3b00000-0000-4000-8000-000000000001',
  'order_id',(select id from public.orders where order_number = 'PED-000001'),
  'sale_id',(select id from public.sales where internal_number = 'VEN-000001'),
  'operation_key','b3300000-0000-4000-8000-000000000004',
  'items',jsonb_build_array(jsonb_build_object(
    'order_item_id',(select id from public.order_items where order_id = (select id from public.orders where order_number = 'PED-000001')), 'quantity',1
  ))
))$$, 'P0001', 'ORDER_NOT_DISPATCHABLE', 'no se permite salida adicional');

select * from finish();
rollback;
