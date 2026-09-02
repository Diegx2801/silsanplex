begin;

select plan(57);

-- -------------------------------------------------------------------------
-- Catálogo, matriz, RLS y superficie RPC
-- -------------------------------------------------------------------------

select is(
  (select count(*) from public.permissions where code in ('SALES_VIEW', 'SALES_MANAGE')),
  2::bigint,
  'existen los dos permisos mínimos de Ventas'
);
select is((select count(*) from public.role_permissions where role_code = 'ADMIN' and permission_code like 'SALES_%'), 2::bigint, 'ADMIN gestiona y consulta Ventas');
select is((select count(*) from public.role_permissions where role_code = 'GERENCIA' and permission_code = 'SALES_VIEW'), 1::bigint, 'GERENCIA consulta Ventas');
select is((select count(*) from public.role_permissions where role_code = 'VENTAS' and permission_code like 'SALES_%'), 2::bigint, 'VENTAS gestiona y consulta Ventas');
select is((select count(*) from public.role_permissions where role_code = 'LOGISTICA' and permission_code = 'SALES_VIEW'), 1::bigint, 'LOGISTICA consulta Ventas como dependencia operativa');

select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'orders mantiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.order_items'::regclass), 'order_items mantiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.sales'::regclass), 'sales mantiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.sale_items'::regclass), 'sale_items mantiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.distribution_deliveries'::regclass), 'distribution_deliveries mantiene RLS');

select is(has_table_privilege('authenticated', 'public.orders', 'SELECT'), true, 'authenticated puede consultar pedidos bajo RLS');
select is(has_table_privilege('authenticated', 'public.orders', 'INSERT'), false, 'authenticated no inserta pedidos directamente');
select is(has_table_privilege('authenticated', 'public.distribution_deliveries', 'INSERT'), false, 'authenticated no inserta entregas directamente');

select has_function('public', 'create_order', array['jsonb'], 'existe el endpoint protegido de crear pedido');
select has_function('public', 'create_sale_from_order', array['uuid', 'uuid', 'jsonb'], 'existe el endpoint protegido de crear venta');
select has_function('public', 'update_order_quantities', array['jsonb'], 'existe el endpoint protegido de modificar pedido');
select has_function('public', 'cancel_order', array['jsonb'], 'existe el endpoint protegido de cancelar pedido');
select has_function('public', 'dispatch_order_from_reservations', array['jsonb'], 'existe el endpoint protegido de despachar');
select has_function('public', 'save_distribution_delivery', array['jsonb'], 'existe el endpoint protegido de guardar entrega');

select ok(position('has_organization_permission' in pg_get_functiondef('public.create_order(jsonb)'::regprocedure)) > 0, 'crear pedido valida permiso en backend');
select ok(position('has_organization_permission' in pg_get_functiondef('public.create_sale_from_order(uuid, uuid, jsonb)'::regprocedure)) > 0, 'crear venta valida permiso en backend');
select ok(position('has_organization_permission' in pg_get_functiondef('public.update_order_quantities(jsonb)'::regprocedure)) > 0, 'modificar pedido valida permiso en backend');
select ok(position('has_organization_permission' in pg_get_functiondef('public.cancel_order(jsonb)'::regprocedure)) > 0, 'cancelar pedido valida permiso en backend');
select ok(position('has_organization_permission' in pg_get_functiondef('public.dispatch_order_from_reservations(jsonb)'::regprocedure)) > 0, 'despachar valida permiso en backend');

select is(has_function_privilege('anon', 'public.create_order(jsonb)', 'EXECUTE'), false, 'anon no puede crear pedidos');
select is(has_function_privilege('anon', 'public.create_sale_from_order(uuid, uuid, jsonb)', 'EXECUTE'), false, 'anon no puede crear ventas');
select is(has_function_privilege('anon', 'public.update_order_quantities(jsonb)', 'EXECUTE'), false, 'anon no puede modificar pedidos');
select is(has_function_privilege('anon', 'public.cancel_order(jsonb)', 'EXECUTE'), false, 'anon no puede cancelar pedidos');
select is(has_function_privilege('anon', 'public.dispatch_order_from_reservations(jsonb)', 'EXECUTE'), false, 'anon no puede despachar');
select is(has_function_privilege('anon', 'public.save_distribution_delivery(jsonb)', 'EXECUTE'), false, 'anon no puede guardar entregas');
select is(has_function_privilege('authenticated', 'public.create_order(jsonb)', 'EXECUTE'), true, 'authenticated llega al guard de crear pedido');
select is(has_function_privilege('authenticated', 'public.create_sale_from_order(uuid, uuid, jsonb)', 'EXECUTE'), true, 'authenticated llega al guard de crear venta');
select is(has_function_privilege('authenticated', 'public.update_order_quantities(jsonb)', 'EXECUTE'), true, 'authenticated llega al guard de modificar pedido');
select is(has_function_privilege('authenticated', 'public.cancel_order(jsonb)', 'EXECUTE'), true, 'authenticated llega al guard de cancelar pedido');
select is(has_function_privilege('authenticated', 'public.dispatch_order_from_reservations(jsonb)', 'EXECUTE'), true, 'authenticated llega al guard de despachar');
select is(has_function_privilege('authenticated', 'public.save_distribution_delivery(jsonb)', 'EXECUTE'), true, 'authenticated llega al guard de guardar entrega');

-- -------------------------------------------------------------------------
-- Datos aislados para comprobar VIEW, MANAGE y organización
-- -------------------------------------------------------------------------

insert into public.organizations (id, name, slug)
values
  ('d4a00000-0000-4000-8000-000000000001', 'Autorización comercial', 'autorizacion-comercial'),
  ('d4a00000-0000-4000-8000-000000000002', 'Autorización comercial dos', 'autorizacion-comercial-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('d4b00000-0000-4000-8000-000000000001', 'ventas.view@test.local', '{"full_name":"Ventas consulta"}', now(), now()),
  ('d4b00000-0000-4000-8000-000000000002', 'ventas.manage@test.local', '{"full_name":"Ventas gestión"}', now(), now()),
  ('d4b00000-0000-4000-8000-000000000003', 'logistica.view@test.local', '{"full_name":"Logística consulta"}', now(), now()),
  ('d4b00000-0000-4000-8000-000000000004', 'sin.permiso@test.local', '{"full_name":"Sin permiso"}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('d4a00000-0000-4000-8000-000000000001', 'd4b00000-0000-4000-8000-000000000001'),
  ('d4a00000-0000-4000-8000-000000000002', 'd4b00000-0000-4000-8000-000000000002'),
  ('d4a00000-0000-4000-8000-000000000001', 'd4b00000-0000-4000-8000-000000000003'),
  ('d4a00000-0000-4000-8000-000000000001', 'd4b00000-0000-4000-8000-000000000004');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('d4a00000-0000-4000-8000-000000000001', 'd4b00000-0000-4000-8000-000000000001', 'GERENCIA'),
  ('d4a00000-0000-4000-8000-000000000002', 'd4b00000-0000-4000-8000-000000000002', 'VENTAS'),
  ('d4a00000-0000-4000-8000-000000000001', 'd4b00000-0000-4000-8000-000000000003', 'LOGISTICA'),
  ('d4a00000-0000-4000-8000-000000000001', 'd4b00000-0000-4000-8000-000000000004', 'CONTABILIDAD');

insert into public.customers (id, organization_id, document_type, document_number, legal_name, created_by, updated_by)
values ('d4c00000-0000-4000-8000-000000000001', 'd4a00000-0000-4000-8000-000000000001', 'RUC', '20444444444', 'Cliente autorización', 'd4b00000-0000-4000-8000-000000000002', 'd4b00000-0000-4000-8000-000000000002');
insert into public.products (id, organization_id, code, description, unit_of_measure, created_by, updated_by)
values ('d4d00000-0000-4000-8000-000000000001', 'd4a00000-0000-4000-8000-000000000001', 'AUTH-001', 'Producto autorización', 'UND', 'd4b00000-0000-4000-8000-000000000002', 'd4b00000-0000-4000-8000-000000000002');
insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values ('d4e00000-0000-4000-8000-000000000001', 'd4a00000-0000-4000-8000-000000000001', 'AUTH', 'Almacén autorización', 'd4b00000-0000-4000-8000-000000000002', 'd4b00000-0000-4000-8000-000000000002');
insert into public.orders (id, organization_id, order_number, customer_id, warehouse_id, order_date, status, operation_key, created_by, updated_by)
values ('d4f00000-0000-4000-8000-000000000001', 'd4a00000-0000-4000-8000-000000000001', 'PED-000001', 'd4c00000-0000-4000-8000-000000000001', 'd4e00000-0000-4000-8000-000000000001', current_date, 'confirmado', 'd4100000-0000-4000-8000-000000000001', 'd4b00000-0000-4000-8000-000000000002', 'd4b00000-0000-4000-8000-000000000002');
insert into public.order_items (id, organization_id, order_id, product_id, product_code, product_description, unit_of_measure, quantity, unit_price)
values ('d4110000-0000-4000-8000-000000000001', 'd4a00000-0000-4000-8000-000000000001', 'd4f00000-0000-4000-8000-000000000001', 'd4d00000-0000-4000-8000-000000000001', 'AUTH-001', 'Producto autorización', 'UND', 2, 10);
insert into public.sales (id, organization_id, order_id, customer_id, internal_number, document_type, series, document_number, sale_date, warehouse, operation_key, created_by, updated_by)
values ('d4120000-0000-4000-8000-000000000001', 'd4a00000-0000-4000-8000-000000000001', 'd4f00000-0000-4000-8000-000000000001', 'd4c00000-0000-4000-8000-000000000001', 'VEN-000001', 'boleta', 'B001', '1', current_date, 'Almacén autorización', 'd4130000-0000-4000-8000-000000000001', 'd4b00000-0000-4000-8000-000000000002', 'd4b00000-0000-4000-8000-000000000002');
insert into public.sale_items (id, organization_id, sale_id, order_id, order_item_id, product_id, product_code, product_description, unit_of_measure, quantity, unit_price)
values ('d4140000-0000-4000-8000-000000000001', 'd4a00000-0000-4000-8000-000000000001', 'd4120000-0000-4000-8000-000000000001', 'd4f00000-0000-4000-8000-000000000001', 'd4110000-0000-4000-8000-000000000001', 'd4d00000-0000-4000-8000-000000000001', 'AUTH-001', 'Producto autorización', 'UND', 2, 10);
insert into public.distribution_deliveries (id, organization_id, order_id, order_number, customer_name, issue_date, delivery_date, guide_number, transport_type, tracking_status, observations, order_items)
values ('d4150000-0000-4000-8000-000000000001', 'd4a00000-0000-4000-8000-000000000001', 'd4f00000-0000-4000-8000-000000000001', 'PED-000001', 'Cliente autorización', current_date, current_date, 'G-AUTH-001', 'interno', 'en_curso', '', '[{"productoId":"d4d00000-0000-4000-8000-000000000001"}]'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd4b00000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.orders), 1::bigint, 'SALES_VIEW consulta pedidos de su organización');
select is((select count(*) from public.sales), 1::bigint, 'SALES_VIEW consulta ventas de su organización');
select throws_ok($$select public.create_order('{"organization_id":"d4a00000-0000-4000-8000-000000000001"}'::jsonb)$$, '42501', 'ORDER_FORBIDDEN', 'SALES_VIEW no crea pedidos');
select throws_ok($$select public.create_sale_from_order('d4a00000-0000-4000-8000-000000000001', 'd4f00000-0000-4000-8000-000000000001', '{}'::jsonb)$$, '42501', 'SALE_FORBIDDEN', 'SALES_VIEW no crea ventas');
select throws_ok($$select public.update_order_quantities('{"organization_id":"d4a00000-0000-4000-8000-000000000001"}'::jsonb)$$, '42501', 'ORDER_FORBIDDEN', 'SALES_VIEW no modifica pedidos');
select throws_ok($$select public.cancel_order('{"organization_id":"d4a00000-0000-4000-8000-000000000001"}'::jsonb)$$, '42501', 'ORDER_FORBIDDEN', 'SALES_VIEW no cancela pedidos');
select throws_ok($$select public.dispatch_order_from_reservations('{"organization_id":"d4a00000-0000-4000-8000-000000000001"}'::jsonb)$$, '42501', 'ORDER_DISPATCH_FORBIDDEN', 'SALES_VIEW no despacha');
select throws_ok($$select public.save_distribution_delivery('{"organization_id":"d4a00000-0000-4000-8000-000000000001"}'::jsonb)$$, '42501', 'DISTRIBUTION_FORBIDDEN', 'sin permiso de distribución no guarda entregas');
select is((select count(*) from public.orders), 1::bigint, 'las RPCs rechazadas no modifican pedidos');
select is((select count(*) from public.sales), 1::bigint, 'las RPCs rechazadas no modifican ventas');
reset role;

-- LOGISTICA se comprueba como usuario de solo consulta de distribución.
delete from public.role_permissions where role_code = 'LOGISTICA' and permission_code = 'DISTRIBUTION_MANAGE';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd4b00000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.orders), 1::bigint, 'DISTRIBUTION_VIEW consulta pedidos dependientes');
select is((select count(*) from public.sales), 1::bigint, 'DISTRIBUTION_VIEW consulta ventas dependientes');
select is((select count(*) from public.distribution_deliveries), 1::bigint, 'DISTRIBUTION_VIEW consulta entregas');
select throws_ok($$select public.save_distribution_delivery('{"organization_id":"d4a00000-0000-4000-8000-000000000001"}'::jsonb)$$, '42501', 'DISTRIBUTION_FORBIDDEN', 'DISTRIBUTION_VIEW no guarda entregas');
select throws_ok($$select public.dispatch_order_from_reservations('{"organization_id":"d4a00000-0000-4000-8000-000000000001"}'::jsonb)$$, '42501', 'ORDER_DISPATCH_FORBIDDEN', 'DISTRIBUTION_VIEW no despacha');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd4b00000-0000-4000-8000-000000000002', true);
select is(public.has_organization_permission('d4a00000-0000-4000-8000-000000000002', 'SALES_MANAGE'), true, 'SALES_MANAGE permite operar su organización');
select throws_ok($$select public.create_order('{"organization_id":"d4a00000-0000-4000-8000-000000000002","operation_key":"d4160000-0000-4000-8000-000000000001","items":[]}'::jsonb)$$, '22023', 'ORDER_ITEMS_REQUIRED', 'SALES_MANAGE supera el guard de autorización');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd4b00000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.orders), 0::bigint, 'un usuario sin SALES_VIEW no consulta pedidos');
select is((select count(*) from public.distribution_deliveries), 0::bigint, 'un usuario sin DISTRIBUTION_VIEW no consulta entregas');
select throws_ok($$select public.create_order('{"organization_id":"d4a00000-0000-4000-8000-000000000001"}'::jsonb)$$, '42501', 'ORDER_FORBIDDEN', 'un usuario sin SALES_MANAGE no crea pedidos');
select throws_ok($$select public.save_distribution_delivery('{"organization_id":"d4a00000-0000-4000-8000-000000000001"}'::jsonb)$$, '42501', 'DISTRIBUTION_FORBIDDEN', 'un usuario sin DISTRIBUTION_MANAGE no guarda entregas');
reset role;

select * from finish();
rollback;
