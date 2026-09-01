begin;

select plan(31);

select has_function(
  'public', 'reserve_order_item_fefo',
  array['uuid', 'uuid', 'uuid', 'uuid'],
  'existe la primitiva interna de reserva FEFO por linea'
);

insert into public.organizations (id, name, slug) values
  ('b2b00000-0000-4000-8000-000000000001', 'Pedidos inventario uno', 'pedidos-inventario-uno'),
  ('b2b00000-0000-4000-8000-000000000002', 'Pedidos inventario dos', 'pedidos-inventario-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('b2c00000-0000-4000-8000-000000000001', 'pedidos.inventario@test.local', '{"full_name":"Pedidos inventario"}', now(), now()),
  ('b2c00000-0000-4000-8000-000000000002', 'pedidos.inventario.otro@test.local', '{"full_name":"Otra organizacion"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('b2b00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2b00000-0000-4000-8000-000000000002', 'b2c00000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('b2b00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001', 'ADMIN'),
  ('b2b00000-0000-4000-8000-000000000002', 'b2c00000-0000-4000-8000-000000000002', 'ADMIN');

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name,
  created_by, updated_by
) values
  ('b2d00000-0000-4000-8000-000000000001', 'b2b00000-0000-4000-8000-000000000001', 'RUC', '20999999995', 'Cliente inventario uno', 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2d00000-0000-4000-8000-000000000002', 'b2b00000-0000-4000-8000-000000000002', 'RUC', '20999999996', 'Cliente inventario dos', 'b2c00000-0000-4000-8000-000000000002', 'b2c00000-0000-4000-8000-000000000002');

insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  batch_control, expiration_control, created_by, updated_by
) values
  ('b2e00000-0000-4000-8000-000000000001', 'b2b00000-0000-4000-8000-000000000001', 'ORD-001', 'Producto FEFO multilote', 'UND', true, true, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2e00000-0000-4000-8000-000000000002', 'b2b00000-0000-4000-8000-000000000001', 'ORD-002', 'Producto simple', 'UND', false, false, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2e00000-0000-4000-8000-000000000003', 'b2b00000-0000-4000-8000-000000000001', 'ORD-003', 'Producto multilinea', 'UND', false, false, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2e00000-0000-4000-8000-000000000004', 'b2b00000-0000-4000-8000-000000000001', 'ORD-004', 'Producto reserva parcial', 'UND', false, false, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2e00000-0000-4000-8000-000000000005', 'b2b00000-0000-4000-8000-000000000001', 'ORD-005', 'Producto lote vencido', 'UND', true, true, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2e00000-0000-4000-8000-000000000006', 'b2b00000-0000-4000-8000-000000000001', 'ORD-006', 'Producto cuarentena', 'UND', true, true, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2e00000-0000-4000-8000-000000000007', 'b2b00000-0000-4000-8000-000000000001', 'ORD-007', 'Producto danado', 'UND', true, true, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2e00000-0000-4000-8000-000000000008', 'b2b00000-0000-4000-8000-000000000001', 'ORD-008', 'Producto insuficiente A', 'UND', false, false, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2e00000-0000-4000-8000-000000000009', 'b2b00000-0000-4000-8000-000000000001', 'ORD-009', 'Producto insuficiente B', 'UND', false, false, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001');

insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  batch_control, expiration_control, created_by, updated_by
) values (
  'b2e00000-0000-4000-8000-000000000010', 'b2b00000-0000-4000-8000-000000000002', 'OTR-010', 'Producto otra organizacion', 'UND', false, false, 'b2c00000-0000-4000-8000-000000000002', 'b2c00000-0000-4000-8000-000000000002'
);

insert into public.warehouses (id, organization_id, code, name, is_active, created_by, updated_by) values
  ('b2f00000-0000-4000-8000-000000000001', 'b2b00000-0000-4000-8000-000000000001', 'ORD1', 'Almacen pedidos uno', true, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2f00000-0000-4000-8000-000000000002', 'b2b00000-0000-4000-8000-000000000001', 'ORD2', 'Almacen pedidos dos', true, 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001');
insert into public.warehouses (id, organization_id, code, name, is_active, created_by, updated_by) values
  ('b2f00000-0000-4000-8000-000000000003', 'b2b00000-0000-4000-8000-000000000002', 'OTRA', 'Almacen otra organizacion', true, 'b2c00000-0000-4000-8000-000000000002', 'b2c00000-0000-4000-8000-000000000002');

insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by) values
  ('b2a00000-0000-4000-8000-000000000001', 'b2b00000-0000-4000-8000-000000000001', 'b2f00000-0000-4000-8000-000000000001', 'A-01', 'Ubicacion A', 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2a00000-0000-4000-8000-000000000002', 'b2b00000-0000-4000-8000-000000000001', 'b2f00000-0000-4000-8000-000000000001', 'B-01', 'Ubicacion B', 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001'),
  ('b2a00000-0000-4000-8000-000000000003', 'b2b00000-0000-4000-8000-000000000001', 'b2f00000-0000-4000-8000-000000000002', 'A-01', 'Ubicacion A dos', 'b2c00000-0000-4000-8000-000000000001', 'b2c00000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2c00000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000001',
  'warehouse_id','b2f00000-0000-4000-8000-000000000001', 'location_id','b2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',5, 'unit_cost',10, 'stock_status','available', 'lot','LOTE-A',
  'expiration_date','2099-01-01', 'operation_date','2026-09-01', 'reason','Stock lote A'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000001',
  'warehouse_id','b2f00000-0000-4000-8000-000000000001', 'location_id','b2a00000-0000-4000-8000-000000000002',
  'movement_type','entrada', 'quantity',5, 'unit_cost',12, 'stock_status','available', 'lot','LOTE-B',
  'expiration_date','2099-02-01', 'operation_date','2026-09-01', 'reason','Stock lote B'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000002',
  'warehouse_id','b2f00000-0000-4000-8000-000000000001', 'location_id','b2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',5, 'unit_cost',4, 'stock_status','available',
  'operation_date','2026-09-01', 'reason','Stock simple uno'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000002',
  'warehouse_id','b2f00000-0000-4000-8000-000000000002', 'location_id','b2a00000-0000-4000-8000-000000000003',
  'movement_type','entrada', 'quantity',2, 'unit_cost',5, 'stock_status','available',
  'operation_date','2026-09-01', 'reason','Stock simple dos'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000003',
  'warehouse_id','b2f00000-0000-4000-8000-000000000001', 'location_id','b2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',4, 'unit_cost',3, 'stock_status','available',
  'operation_date','2026-09-01', 'reason','Stock multilinea'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000004',
  'warehouse_id','b2f00000-0000-4000-8000-000000000001', 'location_id','b2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',2, 'unit_cost',3, 'stock_status','available',
  'operation_date','2026-09-01', 'reason','Stock insuficiente A'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000008',
  'warehouse_id','b2f00000-0000-4000-8000-000000000001', 'location_id','b2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',1, 'unit_cost',3, 'stock_status','available',
  'operation_date','2026-09-01', 'reason','Stock parcial A'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000009',
  'warehouse_id','b2f00000-0000-4000-8000-000000000001', 'location_id','b2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',1, 'unit_cost',3, 'stock_status','available',
  'operation_date','2026-09-01', 'reason','Stock parcial B'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000005',
  'warehouse_id','b2f00000-0000-4000-8000-000000000001', 'location_id','b2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',5, 'unit_cost',2, 'stock_status','available', 'lot','EXP',
  'expiration_date','2020-01-01', 'operation_date','2026-09-01', 'reason','Lote vencido'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000006',
  'warehouse_id','b2f00000-0000-4000-8000-000000000001', 'location_id','b2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',5, 'unit_cost',2, 'stock_status','quarantine', 'lot','Q',
  'expiration_date','2027-01-01', 'operation_date','2026-09-01', 'reason','Lote cuarentena'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001', 'product_id','b2e00000-0000-4000-8000-000000000007',
  'warehouse_id','b2f00000-0000-4000-8000-000000000001', 'location_id','b2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada', 'quantity',5, 'unit_cost',2, 'stock_status','damaged', 'lot','D',
  'expiration_date','2027-01-01', 'operation_date','2026-09-01', 'reason','Lote danado'
));

select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','b2b00000-0000-4000-8000-000000000001',
    'operation_key','b2100000-0000-4000-8000-000000000001',
    'customer_id','b2d00000-0000-4000-8000-000000000001',
    'warehouse_id','b2f00000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000002','quantity',3,'unit_price',4))
  ))
$$, 'reserva una linea simple');
select is((select count(*) from public.inventory_reservations where source_type = 'order-item'), 1::bigint, 'la reserva simple crea una fila');
select is((select sum(quantity) from public.inventory_reservations where source_type = 'order-item'), 3.000::numeric, 'la reserva simple conserva la cantidad');
select results_eq($$select sum(physical_quantity), sum(reserved_quantity), sum(assignable_quantity) from public.inventory_bucket_availability where organization_id = 'b2b00000-0000-4000-8000-000000000001' and product_id = 'b2e00000-0000-4000-8000-000000000002' and warehouse_id = 'b2f00000-0000-4000-8000-000000000001'$$, $$values (5.000::numeric, 3.000::numeric, 2.000::numeric)$$, 'fisico permanece y asignable disminuye');
select is((select count(*) from public.inventory_movements where organization_id = 'b2b00000-0000-4000-8000-000000000001'), 11::bigint, 'reservar no crea movimientos');
select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001','operation_key','b2100000-0000-4000-8000-000000000011',
  'customer_id','b2d00000-0000-4000-8000-000000000001','warehouse_id','b2f00000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000002','quantity',3,'unit_price',4))
))$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'respeta reservas activas de otras operaciones');
select is((select count(*) from public.orders where operation_key = 'b2100000-0000-4000-8000-000000000011'), 0::bigint, 'la falta de asignable no deja pedido');

select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','b2b00000-0000-4000-8000-000000000001',
    'operation_key','b2100000-0000-4000-8000-000000000002',
    'customer_id','b2d00000-0000-4000-8000-000000000001',
    'warehouse_id','b2f00000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000001','quantity',7,'unit_price',10))
  ))
$$, 'reserva por varios lotes en orden FEFO');
select is((select count(*) from public.inventory_reservations where source_id = (select id from public.order_items where product_id = 'b2e00000-0000-4000-8000-000000000001')), 2::bigint, 'una linea genera dos reservas');
select results_eq($$select lot, quantity from public.inventory_reservations where source_type = 'order-item' and product_id = 'b2e00000-0000-4000-8000-000000000001' order by expiration_date$$, $$values ('LOTE-A'::text, 5.000::numeric), ('LOTE-B'::text, 2.000::numeric)$$, 'la asignacion respeta FEFO');
select is((select count(*) from public.inventory_reservations where source_id = (select id from public.order_items where product_id = 'b2e00000-0000-4000-8000-000000000001') and source_id is not null), 2::bigint, 'source_id apunta a la linea de pedido');

select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','b2b00000-0000-4000-8000-000000000001',
    'operation_key','b2100000-0000-4000-8000-000000000003',
    'customer_id','b2d00000-0000-4000-8000-000000000001',
    'warehouse_id','b2f00000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(
      jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000003','quantity',2,'unit_price',3),
      jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000004','quantity',1,'unit_price',3)
    )
  ))
$$, 'reserva todas las lineas de un pedido');
select is((select count(*) from public.inventory_reservations where source_type = 'order-item'), 5::bigint, 'pedido multilinea deja una reserva por linea');

select is(
  public.create_order(jsonb_build_object(
    'organization_id','b2b00000-0000-4000-8000-000000000001',
    'operation_key','b2100000-0000-4000-8000-000000000001',
    'customer_id','b2d00000-0000-4000-8000-000000000001',
    'warehouse_id','b2f00000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000002','quantity',3,'unit_price',4))
  )),
  (select id from public.orders where operation_key = 'b2100000-0000-4000-8000-000000000001'),
  'retry no crea otro pedido'
);
select is((select count(*) from public.inventory_reservations where source_type = 'order-item'), 5::bigint, 'retry no duplica reservas');

select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001','operation_key','b2100000-0000-4000-8000-000000000004',
  'customer_id','b2d00000-0000-4000-8000-000000000001','warehouse_id','b2f00000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000001','quantity',4,'unit_price',10))
))$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'stock insuficiente revierte el pedido completo');
select is((select count(*) from public.orders where operation_key = 'b2100000-0000-4000-8000-000000000004'), 0::bigint, 'rollback no deja encabezado insuficiente');
select is((select count(*) from public.order_items item join public.orders order_row on order_row.id = item.order_id where order_row.operation_key = 'b2100000-0000-4000-8000-000000000004'), 0::bigint, 'rollback no deja lineas insuficientes');

select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001','operation_key','b2100000-0000-4000-8000-000000000005',
  'customer_id','b2d00000-0000-4000-8000-000000000001','warehouse_id','b2f00000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(
    jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000008','quantity',1,'unit_price',3),
    jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000009','quantity',2,'unit_price',3)
  )
))$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'una linea insuficiente revierte las demas');
select is((select count(*) from public.orders where operation_key = 'b2100000-0000-4000-8000-000000000005'), 0::bigint, 'multilinea fallida no deja pedido');
select is((select coalesce(sum(quantity), 0) from public.inventory_reservations where product_id in ('b2e00000-0000-4000-8000-000000000008','b2e00000-0000-4000-8000-000000000009')), 0::numeric, 'multilinea fallida no deja reservas parciales');

select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001','operation_key','b2100000-0000-4000-8000-000000000006',
  'customer_id','b2d00000-0000-4000-8000-000000000001','warehouse_id','b2f00000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000005','quantity',1,'unit_price',2))
))$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'excluye lotes vencidos');
select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001','operation_key','b2100000-0000-4000-8000-000000000007',
  'customer_id','b2d00000-0000-4000-8000-000000000001','warehouse_id','b2f00000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000006','quantity',1,'unit_price',2))
))$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'excluye cuarentena');
select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001','operation_key','b2100000-0000-4000-8000-000000000008',
  'customer_id','b2d00000-0000-4000-8000-000000000001','warehouse_id','b2f00000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000007','quantity',1,'unit_price',2))
))$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'excluye danado');

select lives_ok($$select public.create_order(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000001','operation_key','b2100000-0000-4000-8000-000000000009',
  'customer_id','b2d00000-0000-4000-8000-000000000001','warehouse_id','b2f00000-0000-4000-8000-000000000002',
  'items',jsonb_build_array(jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000002','quantity',2,'unit_price',5))
))$$, 'reserva unicamente desde el almacen del pedido');
select is((select count(*) from public.inventory_reservations where product_id = 'b2e00000-0000-4000-8000-000000000002' and warehouse_id = 'b2f00000-0000-4000-8000-000000000002'), 1::bigint, 'la reserva conserva el almacen solicitado');

select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','b2b00000-0000-4000-8000-000000000002','operation_key','b2100000-0000-4000-8000-000000000010',
  'customer_id','b2d00000-0000-4000-8000-000000000002','warehouse_id','b2f00000-0000-4000-8000-000000000003',
  'items',jsonb_build_array(jsonb_build_object('product_id','b2e00000-0000-4000-8000-000000000010','quantity',1,'unit_price',1))
))$$, '42501', 'ORDER_FORBIDDEN', 'organizacion cruzada rechazada');

select is((select count(*) from public.inventory_movements where organization_id = 'b2b00000-0000-4000-8000-000000000001'), 11::bigint, 'ninguna reserva crea movimientos outbound');
select is((select count(*) from public.inventory_reservations where source_type = 'order-item' and status = 'active'), 6::bigint, 'todas las reservas exitosas permanecen activas');
select ok((select bool_and(quantity_consumed = 0) from public.inventory_reservations where source_type = 'order-item'), 'las reservas nuevas no consumen stock');

select * from finish();
rollback;
