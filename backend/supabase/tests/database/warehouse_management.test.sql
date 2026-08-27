begin;

select plan(50);

select has_table('public', 'warehouses', 'existe el maestro de almacenes');
select has_table('public', 'warehouse_locations', 'existen ubicaciones fisicas');
select has_table('public', 'product_warehouse_settings', 'existe configuracion de stock');
select has_table('public', 'warehouse_transfers', 'existen transferencias');
select has_table('public', 'warehouse_transfer_items', 'existe detalle de transferencias');
select has_view('public', 'inventory_balances', 'existe vista de stock agrupado');
select has_view('public', 'inventory_alerts', 'existe vista de alertas');
select has_view('public', 'inventory_kardex', 'existe kardex valorizado');
select has_function('public', 'transfer_inventory', array['jsonb'], 'existe transferencia atomica');
select has_function('public', 'reclassify_inventory', array['jsonb'], 'existe reclasificacion atomica');
select ok(position('pg_advisory_xact_lock' in pg_get_functiondef('public.transfer_inventory(jsonb)'::regprocedure)) > 0, 'transferencias serializan el bucket de stock');
select has_function(
  'public',
  'inventory_bucket_lock_key',
  array['uuid', 'uuid', 'uuid', 'uuid', 'text', 'text', 'date'],
  'existe una identidad canonica reutilizable para el bucket'
);
select has_function(
  'public',
  'inventory_bucket_quantity',
  array['uuid', 'uuid', 'uuid', 'uuid', 'text', 'text', 'date'],
  'existe un calculo canonico del saldo del bucket'
);
select has_function(
  'public',
  'lock_inventory_bucket',
  array['uuid', 'uuid', 'uuid', 'uuid', 'text', 'text', 'date'],
  'existe un bloqueo canonico del bucket'
);
select trigger_is(
  'public',
  'inventory_movements',
  'inventory_movements_enforce_outbound_balance',
  'public',
  'enforce_inventory_outbound_balance',
  'toda salida pasa por la barrera autoritativa de saldo'
);
select is(
  public.inventory_bucket_lock_key(
    '81000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001',
    '85000000-0000-4000-8000-000000000001',
    'available',
    'L-2026',
    '2026-09-15'
  ),
  public.inventory_bucket_lock_key(
    '81000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001',
    '85000000-0000-4000-8000-000000000001',
    'available',
    'l-2026',
    '2026-09-15'
  ),
  'el lote usa la misma normalizacion en toda clave de bucket'
);
select isnt(
  public.inventory_bucket_lock_key(
    '81000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001',
    '85000000-0000-4000-8000-000000000001',
    'available',
    'L-2026',
    '2026-09-15'
  ),
  public.inventory_bucket_lock_key(
    '81000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001',
    '85000000-0000-4000-8000-000000000001',
    'available',
    'L-2026',
    '2026-10-15'
  ),
  'vencimientos diferentes generan buckets diferentes'
);

select ok((select relrowsecurity from pg_class where oid = 'public.warehouses'::regclass), 'almacenes tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.warehouse_locations'::regclass), 'ubicaciones tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.warehouse_transfers'::regclass), 'transferencias tiene RLS');
select is(has_table_privilege('anon', 'public.warehouses', 'SELECT'), false, 'anon no consulta almacenes');
select is(has_table_privilege('authenticated', 'public.inventory_movements', 'UPDATE'), false, 'movimientos no se editan por Data API');

insert into public.organizations (id, name, slug) values
  ('81000000-0000-4000-8000-000000000001', 'Almacenes uno', 'almacenes-prueba-uno'),
  ('81000000-0000-4000-8000-000000000002', 'Almacenes dos', 'almacenes-prueba-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('82000000-0000-4000-8000-000000000001', 'almacen.uno@test.local', '{"full_name":"Almacen Uno"}', now(), now()),
  ('82000000-0000-4000-8000-000000000002', 'gerencia.uno@test.local', '{"full_name":"Gerencia Uno"}', now(), now()),
  ('82000000-0000-4000-8000-000000000003', 'almacen.dos@test.local', '{"full_name":"Almacen Dos"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000002'),
  ('81000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000003');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'ALMACEN'),
  ('81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000002', 'GERENCIA'),
  ('81000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000003', 'ALMACEN');

insert into public.products (id, organization_id, code, description, unit_of_measure, batch_control) values
  ('83000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'LOT-001', 'Producto trazable', 'UND', true),
  ('83000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'OTR-001', 'Producto ajeno', 'UND', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  insert into public.warehouses (id, organization_id, code, name, address, created_by, updated_by) values
    ('84000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'CENTRAL', 'Almacen central', 'Trujillo', '82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001'),
    ('84000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001', 'NORTE', 'Almacen norte', 'Chiclayo', '82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001')
$$, 'ALMACEN crea maestros persistentes');

select lives_ok($$
  insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by) values
    ('85000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', 'A-01', 'Pasillo A nivel 1', '82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001'),
    ('85000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002', 'B-01', 'Pasillo B nivel 1', '82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001')
$$, 'ALMACEN crea ubicaciones fisicas');

select lives_ok($$
  insert into public.product_warehouse_settings (organization_id, product_id, warehouse_id, default_location_id, minimum_stock, expiration_alert_days, updated_by)
  values ('81000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', 12, 45, '82000000-0000-4000-8000-000000000001')
$$, 'configura minimo y ventana de vencimiento');
select is((select has_low_stock_alert from public.inventory_alerts where product_id = '83000000-0000-4000-8000-000000000001'), true, 'alerta stock cero aun sin movimientos');

select lives_ok($$
  select public.record_inventory_movement('{"organization_id":"81000000-0000-4000-8000-000000000001","product_id":"83000000-0000-4000-8000-000000000001","warehouse_id":"84000000-0000-4000-8000-000000000001","location_id":"85000000-0000-4000-8000-000000000001","movement_type":"entrada","quantity":"10","unit_cost":"7.5","stock_status":"available","lot":"L-2026","expiration_date":"2026-09-15","operation_date":"2026-08-21","reason":"Entrada inicial valorizada"}'::jsonb)
$$, 'registra entrada por almacen, ubicacion y lote');

select throws_ok($$
  select public.record_inventory_movement('{"organization_id":"81000000-0000-4000-8000-000000000001","product_id":"83000000-0000-4000-8000-000000000001","warehouse_id":"84000000-0000-4000-8000-000000000001","location_id":"85000000-0000-4000-8000-000000000001","movement_type":"salida","quantity":"1","stock_status":"available","lot":"L-2026","expiration_date":"2026-10-15","operation_date":"2026-08-21","reason":"Vencimiento sin saldo"}'::jsonb)
$$, 'P0001', 'INVENTORY_INSUFFICIENT_STOCK', 'no usa el saldo de otro vencimiento del mismo lote');

select results_eq(
  $$select quantity, inventory_value, average_cost from public.inventory_balances where product_id = '83000000-0000-4000-8000-000000000001'$$,
  $$values (10.000::numeric, 75.0000::numeric, 7.5000::numeric)$$,
  'agrupa stock y valor por bucket'
);
select is((select has_low_stock_alert from public.inventory_alerts where product_id = '83000000-0000-4000-8000-000000000001'), true, 'genera alerta de stock minimo');
select is((select has_expiration_alert from public.inventory_alerts where product_id = '83000000-0000-4000-8000-000000000001'), true, 'genera alerta de vencimiento');
select throws_ok($$
  select public.record_inventory_movement('{"organization_id":"81000000-0000-4000-8000-000000000001","product_id":"83000000-0000-4000-8000-000000000001","warehouse_id":"84000000-0000-4000-8000-000000000001","location_id":"85000000-0000-4000-8000-000000000001","movement_type":"salida","quantity":"11","stock_status":"available","lot":"L-2026","expiration_date":"2026-09-15","operation_date":"2026-08-21","reason":"Salida excesiva"}'::jsonb)
$$, 'P0001', 'INVENTORY_INSUFFICIENT_STOCK', 'impide stock negativo');

select lives_ok($$
  select public.reclassify_inventory('{"organization_id":"81000000-0000-4000-8000-000000000001","product_id":"83000000-0000-4000-8000-000000000001","warehouse_id":"84000000-0000-4000-8000-000000000001","location_id":"85000000-0000-4000-8000-000000000001","source_status":"available","destination_status":"damaged","quantity":"2","lot":"L-2026","expiration_date":"2026-09-15","reason":"Envase deteriorado"}'::jsonb)
$$, 'inmoviliza producto danado con doble asiento');
select is((select quantity from public.inventory_balances where product_id = '83000000-0000-4000-8000-000000000001' and stock_status = 'available'), 8.000::numeric, 'reduce stock disponible al inmovilizar');
select is((select quantity from public.inventory_balances where product_id = '83000000-0000-4000-8000-000000000001' and stock_status = 'damaged'), 2.000::numeric, 'conserva stock danado separado');

select lives_ok($$
  select public.transfer_inventory('{"organization_id":"81000000-0000-4000-8000-000000000001","reference":"TR-0001","source_warehouse_id":"84000000-0000-4000-8000-000000000001","destination_warehouse_id":"84000000-0000-4000-8000-000000000002","notes":"Reposicion norte","items":[{"product_id":"83000000-0000-4000-8000-000000000001","source_location_id":"85000000-0000-4000-8000-000000000001","destination_location_id":"85000000-0000-4000-8000-000000000002","quantity":"3","lot":"L-2026","expiration_date":"2026-09-15","stock_status":"available"}]}'::jsonb)
$$, 'transfiere stock atomico entre almacenes');
select is((select count(*) from public.warehouse_transfer_items), 1::bigint, 'persiste detalle de transferencia');
select is((select count(*) from public.inventory_movements where source_type = 'warehouse-transfer'), 2::bigint, 'transferencia crea salida y entrada trazables');
select is((select quantity from public.inventory_balances where warehouse_id = '84000000-0000-4000-8000-000000000001' and stock_status = 'available'), 5.000::numeric, 'descuenta origen');
select is((select quantity from public.inventory_balances where warehouse_id = '84000000-0000-4000-8000-000000000002'), 3.000::numeric, 'incrementa destino');
select is((select max(running_quantity) from public.inventory_kardex where product_id = '83000000-0000-4000-8000-000000000001'), 10.000::numeric, 'kardex calcula saldo cronologico');
select is((select max(unit_cost) from public.inventory_kardex where product_id = '83000000-0000-4000-8000-000000000001'), 7.5000::numeric, 'kardex conserva costo de transferencia');
reset role;
select throws_ok($$update public.inventory_movements set reason = 'Alterado' where product_id = '83000000-0000-4000-8000-000000000001'$$,
  'P0001', 'INVENTORY_MOVEMENT_IMMUTABLE', 'historial no se altera');
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select throws_ok($$
  select public.transfer_inventory('{"organization_id":"81000000-0000-4000-8000-000000000001","reference":"TR-0002","source_warehouse_id":"84000000-0000-4000-8000-000000000001","destination_warehouse_id":"84000000-0000-4000-8000-000000000002","items":[{"product_id":"83000000-0000-4000-8000-000000000001","source_location_id":"85000000-0000-4000-8000-000000000001","destination_location_id":"85000000-0000-4000-8000-000000000002","quantity":"99","lot":"L-2026","expiration_date":"2026-09-15","stock_status":"available"}]}'::jsonb)
$$, 'P0001', 'INVENTORY_INSUFFICIENT_STOCK', 'transferencia no produce stock negativo');
select is((select count(*) from public.warehouse_transfers), 1::bigint, 'transferencia fallida revierte cabecera');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.inventory_balances), 3::bigint, 'GERENCIA consulta balances de su empresa');
select throws_ok($$
  select public.record_inventory_movement('{"organization_id":"81000000-0000-4000-8000-000000000001","product_id":"83000000-0000-4000-8000-000000000001","warehouse_id":"84000000-0000-4000-8000-000000000001","location_id":"85000000-0000-4000-8000-000000000001","movement_type":"entrada","quantity":"1","unit_cost":"1","stock_status":"available","lot":"L-2026","operation_date":"2026-08-21","reason":"Sin permiso"}'::jsonb)
$$, '42501', 'INVENTORY_FORBIDDEN', 'GERENCIA no modifica inventario');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.warehouses), 0::bigint, 'otra organizacion no ve almacenes ajenos');
select is((select count(*) from public.inventory_movements), 0::bigint, 'otra organizacion no ve movimientos ajenos');

reset role;
select cmp_ok((select count(*) from public.audit_events where action in ('INVENTORY_MOVEMENT_CREATED','INVENTORY_RECLASSIFIED','WAREHOUSE_TRANSFER_COMPLETED')), '>=', 3::bigint, 'operaciones dejan auditoria');

select * from finish();
rollback;
