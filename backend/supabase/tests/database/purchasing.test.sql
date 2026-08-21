begin;

select plan(46);

-- Estructura y superficie del Data API.
select has_table('public', 'products', 'existe el catálogo persistente');
select has_table('public', 'purchase_orders', 'existen las órdenes de compra');
select has_table('public', 'purchase_order_items', 'existe el detalle de órdenes');
select has_table('public', 'inventory_movements', 'existe el inventario persistente');
select has_function('public', 'save_purchase_order', array['jsonb'], 'existe guardado transaccional');
select has_function('public', 'issue_purchase_order', array['uuid', 'uuid'], 'existe emisión transaccional');
select has_function('public', 'receive_purchase_order', array['uuid', 'uuid'], 'existe recepción transaccional');
select has_function('public', 'record_inventory_movement', array['jsonb'], 'existe movimiento manual transaccional');

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

insert into public.products (id, organization_id, code, description, unit_of_measure, batch_control, created_by, updated_by) values
  ('f1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'MED-001', 'Producto con lote', 'UND', true, 'e1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111'),
  ('f2222222-2222-4222-8222-222222222222', 'd1111111-1111-4111-8111-111111111111', 'MED-002', 'Producto sin lote', 'UND', false, 'e1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111');

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
      "warehouse":"Almacén principal","currency":"PEN","prices_include_tax":true,
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
select throws_ok($$
  select public.receive_purchase_order('d1111111-1111-4111-8111-111111111111', (select id from public.purchase_orders where document_number = '1001'))
$$, 'P0001', 'PURCHASE_ORDER_NOT_RECEIVABLE', 'una segunda recepción no duplica inventario');
select throws_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'id', (select id from public.purchase_orders where document_number = '1001'),
    'organization_id', 'd1111111-1111-4111-8111-111111111111',
    'supplier_id', 'fa111111-1111-4111-8111-111111111111',
    'document_type', 'factura', 'series', 'F001', 'document_number', '1001',
    'issue_date', '2026-08-21', 'payment_due_date', '', 'warehouse', 'Almacén principal',
    'items', jsonb_build_array(jsonb_build_object('product_id','f2222222-2222-4222-8222-222222222222','quantity','1','unit_cost','1','lot','','expiration_date',''))
  ))
$$, 'P0001', 'PURCHASE_ORDER_NOT_EDITABLE', 'una orden recibida es inmutable');
select throws_ok($$
  select public.cancel_purchase_order('d1111111-1111-4111-8111-111111111111', (select id from public.purchase_orders where document_number = '1001'))
$$, 'P0001', 'PURCHASE_ORDER_NOT_CANCELLABLE', 'una orden recibida no se anula');
select throws_ok($$
  select public.save_purchase_order(
    '{"organization_id":"d1111111-1111-4111-8111-111111111111","supplier_id":"fa111111-1111-4111-8111-111111111111","document_type":"factura","series":"F001","document_number":"1001","issue_date":"2026-08-21","payment_due_date":"","warehouse":"Almacén principal","items":[{"product_id":"f2222222-2222-4222-8222-222222222222","quantity":"1","unit_cost":"1","lot":"","expiration_date":""}]}'::jsonb
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
select is((select count(*) from public.purchase_orders), 1::bigint, 'GERENCIA consulta órdenes de su empresa');
select throws_ok($$
  select public.issue_purchase_order('d1111111-1111-4111-8111-111111111111', (select id from public.purchase_orders limit 1))
$$, '42501', 'PURCHASE_ORDER_FORBIDDEN', 'GERENCIA no emite órdenes');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4444444-4444-4444-8444-444444444444', true);
select is((select count(*) from public.purchase_orders), 0::bigint, 'otra empresa no consulta órdenes ajenas');

reset role;
select cmp_ok((select count(*) from public.audit_events where entity_type in ('product','purchase_order','inventory_movement')), '>=', 6::bigint, 'las operaciones relevantes dejan auditoría');

select * from finish();
rollback;
