begin;

select plan(83);

-- Estructura y superficie del Data API.
select has_table('public', 'products', 'existe el catálogo persistente');
select has_table('public', 'purchase_orders', 'existen las órdenes de compra');
select has_table('public', 'purchase_order_items', 'existe el detalle de órdenes');
select has_table('public', 'inventory_movements', 'existe el inventario persistente');
select has_function('public', 'save_purchase_order', array['jsonb'], 'existe guardado transaccional');
select has_function('public', 'issue_purchase_order', array['uuid', 'uuid'], 'existe emisión transaccional');
select has_function('public', 'receive_purchase_order', array['uuid', 'uuid'], 'existe recepción transaccional');
select has_function('public', 'record_inventory_movement', array['jsonb'], 'existe movimiento manual transaccional');
select has_column('public', 'purchase_orders', 'warehouse_id', 'la orden referencia el maestro de almacenes');
select has_table('public', 'purchase_receipts', 'existen cabeceras de recepción');
select has_table('public', 'purchase_receipt_items', 'existen partidas de recepción');
select has_function('public', 'receive_purchase_order_partial', array['jsonb'], 'existe recepción parcial transaccional');
select has_function('public', 'close_purchase_order', array['jsonb'], 'existe cierre de saldo con motivo');
select ok((select relrowsecurity from pg_class where oid = 'public.purchase_receipts'::regclass), 'purchase_receipts tiene RLS');
select is(has_table_privilege('authenticated', 'public.purchase_receipts', 'INSERT'), false, 'las recepciones solo se crean mediante RPC');

select ok((select relrowsecurity from pg_class where oid = 'public.products'::regclass), 'products tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.purchase_orders'::regclass), 'purchase_orders tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.purchase_order_items'::regclass), 'purchase_order_items tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.inventory_movements'::regclass), 'inventory_movements tiene RLS');
select is(has_table_privilege('anon', 'public.products', 'SELECT'), false, 'anon no consulta productos');
select is(has_table_privilege('authenticated', 'public.products', 'INSERT'), true, 'authenticated registra productos bajo RLS');
select is(has_table_privilege('authenticated', 'public.purchase_orders', 'SELECT'), true, 'authenticated consulta órdenes bajo RLS');
select is(has_table_privilege('authenticated', 'public.purchase_orders', 'INSERT'), false, 'órdenes solo se crean mediante RPC');
select is((select count(*) from public.permissions where code in ('PRODUCTS_VIEW','PRODUCTS_MANAGE','PURCHASES_VIEW','PURCHASES_MANAGE','PURCHASES_RECEIVE','INVENTORY_VIEW','INVENTORY_MANAGE')), 7::bigint, 'existen siete capacidades operativas');
select is((select count(*) from public.role_permissions where role_code = 'COMPRAS' and permission_code in ('PRODUCTS_VIEW','PURCHASES_VIEW','PURCHASES_MANAGE','PURCHASES_RECEIVE','INVENTORY_VIEW')), 5::bigint, 'COMPRAS tiene las capacidades necesarias');
select is((select count(*) from public.role_permissions where role_code = 'ALMACEN' and permission_code in ('PRODUCTS_VIEW','PURCHASES_VIEW','PURCHASES_RECEIVE','INVENTORY_VIEW','INVENTORY_MANAGE')), 5::bigint, 'ALMACEN puede recibir y administrar inventario');

-- Dos organizaciones y cuatro identidades.
insert into public.organizations (id, name, slug) values
  ('d1111111-1111-4111-8111-111111111111', 'Compras empresa uno', 'compras-persistentes-uno'),
  ('d2222222-2222-4222-8222-222222222222', 'Compras empresa dos', 'compras-persistentes-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('e1111111-1111-4111-8111-111111111111', 'compras.persistente@test.local', '{"full_name":"Compras persistente"}', now(), now()),
  ('e2222222-2222-4222-8222-222222222222', 'almacen.persistente@test.local', '{"full_name":"Almacén persistente"}', now(), now()),
  ('e3333333-3333-4333-8333-333333333333', 'gerencia.persistente@test.local', '{"full_name":"Gerencia persistente"}', now(), now()),
  ('e4444444-4444-4444-8444-444444444444', 'compras.otra@test.local', '{"full_name":"Compras otra empresa"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('d1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111'),
  ('d1111111-1111-4111-8111-111111111111', 'e2222222-2222-4222-8222-222222222222'),
  ('d1111111-1111-4111-8111-111111111111', 'e3333333-3333-4333-8333-333333333333'),
  ('d2222222-2222-4222-8222-222222222222', 'e4444444-4444-4444-8444-444444444444');

insert into public.user_roles (organization_id, user_id, role_code) values
  ('d1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111', 'COMPRAS'),
  ('d1111111-1111-4111-8111-111111111111', 'e2222222-2222-4222-8222-222222222222', 'ALMACEN'),
  ('d1111111-1111-4111-8111-111111111111', 'e3333333-3333-4333-8333-333333333333', 'GERENCIA'),
  ('d2222222-2222-4222-8222-222222222222', 'e4444444-4444-4444-8444-444444444444', 'COMPRAS');

insert into public.products (id, organization_id, code, description, unit_of_measure, batch_control, tax_affectation, created_by, updated_by) values
  ('f1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'MED-001', 'Producto con lote', 'UND', true, 'gravado', 'e1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111'),
  ('f2222222-2222-4222-8222-222222222222', 'd1111111-1111-4111-8111-111111111111', 'MED-002', 'Producto sin lote', 'UND', false, 'gravado', 'e1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111');

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by) values
  ('a1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'ALM-01', 'Almacén principal', 'e2222222-2222-4222-8222-222222222222', 'e2222222-2222-4222-8222-222222222222');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by) values
  ('b1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'GENERAL', 'Ubicación general', 'e2222222-2222-4222-8222-222222222222', 'e2222222-2222-4222-8222-222222222222'),
  ('b2222222-2222-4222-8222-222222222222', 'd1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'RACK-02', 'Rack secundario', 'e2222222-2222-4222-8222-222222222222', 'e2222222-2222-4222-8222-222222222222');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1111111-1111-4111-8111-111111111111', true);

select ok(public.has_organization_permission('d1111111-1111-4111-8111-111111111111', 'PURCHASES_MANAGE'), 'COMPRAS administra órdenes');
select is((select count(*) from public.products), 2::bigint, 'COMPRAS consulta los productos de su empresa');
select ok(not public.has_organization_permission('d1111111-1111-4111-8111-111111111111', 'PRODUCTS_MANAGE'), 'COMPRAS no modifica el catálogo');
select lives_ok($$
  insert into public.suppliers (id, organization_id, document_type, document_number, business_name, created_by, updated_by)
  values ('fa111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'ruc', '20111111111', 'Proveedor de prueba SAC', 'e1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111')
$$, 'COMPRAS registra el proveedor');

select lives_ok($$
  select public.save_purchase_order(
    '{
      "organization_id":"d1111111-1111-4111-8111-111111111111",
      "supplier_id":"fa111111-1111-4111-8111-111111111111",
      "document_type":"factura","series":"f001","document_number":"1001",
      "issue_date":"2026-08-21","payment_due_date":"2026-09-20",
      "warehouse_id":"a1111111-1111-4111-8111-111111111111","warehouse":"Almacén principal","currency":"PEN","prices_include_tax":true,
      "notes":"Compra de prueba",
      "items":[
        {"product_id":"f1111111-1111-4111-8111-111111111111","quantity":"2","unit_cost":"10","lot":"L-001","expiration_date":"2027-12-31"},
        {"product_id":"f2222222-2222-4222-8222-222222222222","quantity":"3","unit_cost":"5","lot":"","expiration_date":""}
      ]
    }'::jsonb
  )
$$, 'la orden y sus líneas se guardan en una transacción');

select is((select count(*) from public.purchase_order_items), 2::bigint, 'la orden conserva dos líneas');
select results_eq(
  $$select subtotal, tax, total from public.purchase_orders where series = 'F001' and document_number = '1001'$$,
  $$values (29.66::numeric, 5.34::numeric, 35.00::numeric)$$,
  'los totales con IGV se calculan en base de datos'
);
select is((select status from public.purchase_orders where document_number = '1001'), 'draft', 'la orden inicia en borrador');
select lives_ok($$
  select public.issue_purchase_order('d1111111-1111-4111-8111-111111111111', (select id from public.purchase_orders where document_number = '1001'))
$$, 'COMPRAS emite el borrador');
select is((select status from public.purchase_orders where document_number = '1001'), 'issued', 'la orden queda emitida');
select lives_ok($$
  select public.receive_purchase_order('d1111111-1111-4111-8111-111111111111', (select id from public.purchase_orders where document_number = '1001'))
$$, 'COMPRAS confirma la recepción');
select is((select status from public.purchase_orders where document_number = '1001'), 'received', 'la orden queda recibida');
select is((select count(*) from public.inventory_movements where source_type = 'purchase-receipt'), 2::bigint, 'la recepción crea un movimiento por línea');
select is((select sum(quantity) from public.inventory_movements where source_type = 'purchase-receipt'), 5.000::numeric, 'las cantidades recibidas coinciden');
select is((select count(*) from public.warehouses), 1::bigint, 'la recepción no crea almacenes implícitos');
select is((select count(*) from public.inventory_movements where source_type = 'purchase-receipt' and warehouse_id = 'a1111111-1111-4111-8111-111111111111'), 2::bigint, 'los movimientos usan el almacén seleccionado');
select throws_ok($$
  select public.receive_purchase_order('d1111111-1111-4111-8111-111111111111', (select id from public.purchase_orders where document_number = '1001'))
$$, 'P0001', 'PURCHASE_ORDER_NOT_RECEIVABLE', 'una segunda recepción no duplica inventario');

select lives_ok($$
  select public.save_purchase_order(
    '{"organization_id":"d1111111-1111-4111-8111-111111111111","supplier_id":"fa111111-1111-4111-8111-111111111111","document_type":"factura","series":"F002","document_number":"2002","issue_date":"2026-08-22","warehouse_id":"a1111111-1111-4111-8111-111111111111","warehouse":"Almacén principal","items":[{"product_id":"f2222222-2222-4222-8222-222222222222","quantity":"4","unit_cost":"8","lot":"","expiration_date":""}]}'::jsonb
  )
$$, 'crea una orden para recepción parcial');
select lives_ok($$
  select public.issue_purchase_order('d1111111-1111-4111-8111-111111111111', (select id from public.purchase_orders where document_number = '2002'))
$$, 'emite la orden parcial');
select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id','d1111111-1111-4111-8111-111111111111',
    'purchase_order_id',(select id from public.purchase_orders where document_number = '2002'),
    'operation_key','c1111111-1111-4111-8111-111111111111',
    'items',jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '2002')),
      'quantity','1','location_id','b1111111-1111-4111-8111-111111111111','lot','LOTE-A','expiration_date',''
    ))
  ))
$$, 'registra la primera recepción parcial');
select is((select status from public.purchase_orders where document_number = '2002'), 'partially_received', 'la orden queda parcialmente recibida');
select is((select sum(receipt_item.quantity) from public.purchase_receipt_items receipt_item join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '2002'), 1.000::numeric, 'registra solo la cantidad efectivamente recibida');
select is((select count(*) from public.purchase_receipts receipt join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = '2002'), 1::bigint, 'crea una cabecera de recepción');
select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id','d1111111-1111-4111-8111-111111111111','purchase_order_id',(select id from public.purchase_orders where document_number = '2002'),
    'operation_key','c1111111-1111-4111-8111-111111111111','items','[]'::jsonb
  ))
$$, 'un reintento con la misma clave es idempotente');
select is((select count(*) from public.purchase_receipts receipt join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = '2002'), 1::bigint, 'el reintento no duplica la recepción');
select is((select count(*) from public.inventory_movements movement join public.purchase_receipt_items receipt_item on receipt_item.id = movement.source_id join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '2002'), 1::bigint, 'el reintento tampoco duplica inventario');
select throws_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id','d1111111-1111-4111-8111-111111111111','purchase_order_id',(select id from public.purchase_orders where document_number = '2002'),
    'operation_key','c2222222-2222-4222-8222-222222222222','items',jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '2002')),
      'quantity','4','location_id','b1111111-1111-4111-8111-111111111111','lot','LOTE-X','expiration_date',''
    ))
  ))
$$, '22023', 'PURCHASE_RECEIPT_EXCEEDS_ORDERED_QUANTITY', 'impide recibir más de lo solicitado');
select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id','d1111111-1111-4111-8111-111111111111','purchase_order_id',(select id from public.purchase_orders where document_number = '2002'),
    'operation_key','c3333333-3333-4333-8333-333333333333','items',jsonb_build_array(
      jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '2002')),'quantity','1','location_id','b1111111-1111-4111-8111-111111111111','lot','LOTE-B','expiration_date',''),
      jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '2002')),'quantity','2','location_id','b2222222-2222-4222-8222-222222222222','lot','LOTE-C','expiration_date','')
    )
  ))
$$, 'divide el saldo entre lotes y ubicaciones');
select is((select status from public.purchase_orders where document_number = '2002'), 'received', 'completar el saldo cierra la orden como recibida');
select is((select sum(receipt_item.quantity) from public.purchase_receipt_items receipt_item join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '2002'), 4.000::numeric, 'la suma recibida coincide exactamente con lo ordenado');
select is((select count(*) from public.inventory_movements movement join public.purchase_receipt_items receipt_item on receipt_item.id = movement.source_id join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '2002'), 3::bigint, 'cada partida crea su movimiento trazable');
select is((select count(distinct receipt_item.location_id) from public.purchase_receipt_items receipt_item join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '2002'), 2::bigint, 'conserva las ubicaciones exactas');
select is((select count(distinct receipt_item.lot) from public.purchase_receipt_items receipt_item join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '2002'), 3::bigint, 'conserva los lotes exactos');
select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id','d1111111-1111-4111-8111-111111111111','purchase_order_id',(select id from public.purchase_orders where document_number = '2002'),
    'operation_key','c3333333-3333-4333-8333-333333333333','items','[]'::jsonb
  ))
$$, 'el reintento sigue siendo idempotente después de completar la orden');
select is((select count(*) from public.inventory_movements movement join public.purchase_receipt_items receipt_item on receipt_item.id = movement.source_id join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '2002'), 3::bigint, 'el reintento final no duplica movimientos');

select lives_ok($$
  select public.save_purchase_order(
    '{"organization_id":"d1111111-1111-4111-8111-111111111111","supplier_id":"fa111111-1111-4111-8111-111111111111","document_type":"factura","series":"F003","document_number":"3003","issue_date":"2026-08-23","warehouse_id":"a1111111-1111-4111-8111-111111111111","warehouse":"Almacén principal","items":[{"product_id":"f2222222-2222-4222-8222-222222222222","quantity":"5","unit_cost":"9","lot":"","expiration_date":""}]}'::jsonb
  )
$$, 'crea una orden cuyo saldo será cancelado');
select lives_ok($$
  select public.issue_purchase_order('d1111111-1111-4111-8111-111111111111', (select id from public.purchase_orders where document_number = '3003'))
$$, 'emite la orden a cerrar parcialmente');
select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id','d1111111-1111-4111-8111-111111111111','purchase_order_id',(select id from public.purchase_orders where document_number = '3003'),
    'operation_key','c4444444-4444-4444-8444-444444444444','items',jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '3003')),
      'quantity','2','location_id','b1111111-1111-4111-8111-111111111111','lot','','expiration_date',''
    ))
  ))
$$, 'recibe una parte antes del cierre');
select lives_ok($$
  select public.close_purchase_order(jsonb_build_object(
    'organization_id','d1111111-1111-4111-8111-111111111111','purchase_order_id',(select id from public.purchase_orders where document_number = '3003'),
    'reason','Proveedor no entregará el saldo restante'
  ))
$$, 'cierra el saldo pendiente con motivo');
select is((select status from public.purchase_orders where document_number = '3003'), 'closed_partial', 'distingue la orden cerrada parcialmente');
select is((select close_reason from public.purchase_orders where document_number = '3003'), 'Proveedor no entregará el saldo restante', 'conserva el motivo del cierre');
select is((select sum(movement.quantity) from public.inventory_movements movement join public.purchase_receipt_items receipt_item on receipt_item.id = movement.source_id join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '3003'), 2.000::numeric, 'cerrar el saldo no altera lo recibido');
select throws_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id','d1111111-1111-4111-8111-111111111111','purchase_order_id',(select id from public.purchase_orders where document_number = '3003'),
    'operation_key','c5555555-5555-4555-8555-555555555555','items','[]'::jsonb
  ))
$$, 'P0001', 'PURCHASE_ORDER_NOT_RECEIVABLE', 'una orden cerrada no admite más recepciones');
select throws_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'id', (select id from public.purchase_orders where document_number = '1001'),
    'organization_id', 'd1111111-1111-4111-8111-111111111111',
    'supplier_id', 'fa111111-1111-4111-8111-111111111111',
    'document_type', 'factura', 'series', 'F001', 'document_number', '1001',
    'issue_date', '2026-08-21', 'payment_due_date', '', 'warehouse_id', 'a1111111-1111-4111-8111-111111111111', 'warehouse', 'Almacén principal',
    'items', jsonb_build_array(jsonb_build_object('product_id','f2222222-2222-4222-8222-222222222222','quantity','1','unit_cost','1','lot','','expiration_date',''))
  ))
$$, 'P0001', 'PURCHASE_ORDER_NOT_EDITABLE', 'una orden recibida es inmutable');
select throws_ok($$
  select public.cancel_purchase_order('d1111111-1111-4111-8111-111111111111', (select id from public.purchase_orders where document_number = '1001'))
$$, 'P0001', 'PURCHASE_ORDER_NOT_CANCELLABLE', 'una orden recibida no se anula');
select throws_ok($$
  select public.save_purchase_order(
    '{"organization_id":"d1111111-1111-4111-8111-111111111111","supplier_id":"fa111111-1111-4111-8111-111111111111","document_type":"factura","series":"F001","document_number":"1001","issue_date":"2026-08-21","payment_due_date":"","warehouse_id":"a1111111-1111-4111-8111-111111111111","warehouse":"Almacén principal","items":[{"product_id":"f2222222-2222-4222-8222-222222222222","quantity":"1","unit_cost":"1","lot":"","expiration_date":""}]}'::jsonb
  )
$$, '23505', null, 'el documento de compra no se duplica');
select throws_ok($$
  select public.record_inventory_movement('{"organization_id":"d1111111-1111-4111-8111-111111111111","product_id":"f2222222-2222-4222-8222-222222222222","movement_type":"entrada","quantity":"1","warehouse":"Almacén principal","lot":"","expiration_date":"","operation_date":"2026-08-21","reason":"Entrada manual"}'::jsonb)
$$, '42501', 'INVENTORY_FORBIDDEN', 'COMPRAS no registra movimientos manuales');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', true);
select ok(public.has_organization_permission('d1111111-1111-4111-8111-111111111111', 'PURCHASES_RECEIVE'), 'ALMACEN puede recibir compras');
select lives_ok($$
  select public.record_inventory_movement('{"organization_id":"d1111111-1111-4111-8111-111111111111","product_id":"f2222222-2222-4222-8222-222222222222","movement_type":"entrada","quantity":"2","warehouse":"Almacén principal","lot":"","expiration_date":"","operation_date":"2026-08-21","reason":"Entrada manual"}'::jsonb)
$$, 'ALMACEN registra una entrada manual');
select throws_ok($$
  select public.record_inventory_movement('{"organization_id":"d1111111-1111-4111-8111-111111111111","product_id":"f2222222-2222-4222-8222-222222222222","movement_type":"salida","quantity":"100","warehouse":"Almacén principal","lot":"","expiration_date":"","operation_date":"2026-08-21","reason":"Salida excesiva"}'::jsonb)
$$, 'P0001', 'INVENTORY_INSUFFICIENT_STOCK', 'inventario rechaza saldo negativo');
select throws_ok($$
  select public.save_purchase_order('{"organization_id":"d1111111-1111-4111-8111-111111111111","supplier_id":"fa111111-1111-4111-8111-111111111111","document_type":"factura","series":"F002","document_number":"1","issue_date":"2026-08-21","warehouse":"Almacén principal","items":[]}'::jsonb)
$$, '42501', 'PURCHASE_ORDER_FORBIDDEN', 'ALMACEN no crea órdenes');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e3333333-3333-4333-8333-333333333333', true);
select is((select count(*) from public.purchase_orders), 3::bigint, 'GERENCIA consulta órdenes de su empresa');
select throws_ok($$
  select public.issue_purchase_order('d1111111-1111-4111-8111-111111111111', (select id from public.purchase_orders limit 1))
$$, '42501', 'PURCHASE_ORDER_FORBIDDEN', 'GERENCIA no emite órdenes');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4444444-4444-4444-8444-444444444444', true);
select is((select count(*) from public.purchase_orders), 0::bigint, 'otra empresa no consulta órdenes ajenas');

reset role;
select throws_ok($$
  update public.purchase_receipt_items set quantity = quantity + 1 where lot = 'LOTE-A'
$$, '55000', 'PURCHASE_RECEIPT_IMMUTABLE', 'una partida confirmada es inmutable');
select ok((select old_values is not null and new_values is not null from public.audit_events where action = 'PURCHASE_ORDER_RECEIVED' order by created_at desc, id desc limit 1), 'la recepción conserva estados anterior y nuevo en auditoría');
select cmp_ok((select count(*) from public.audit_events where entity_type in ('product','purchase_order','inventory_movement')), '>=', 6::bigint, 'las operaciones relevantes dejan auditoría');

select * from finish();
rollback;
