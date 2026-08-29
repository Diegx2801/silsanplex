begin;

select plan(34);

select has_table('public', 'inventory_reservations', 'existe el registro canonico de reservas');
select has_view('public', 'inventory_bucket_balances', 'existe la vista canonica de saldos por bucket');
select has_view('public', 'inventory_bucket_availability', 'existe la vista canonica de disponibilidad');
select has_view('public', 'inventory_stock_summary', 'existe el resumen agregado por producto y almacen');
select has_view('public', 'inventory_low_stock_alerts', 'stock minimo tiene una vista agregada propia');
select has_view('public', 'inventory_expiration_alerts', 'vencimientos tienen una vista por bucket');
select has_function(
  'public', 'inventory_bucket_state',
  array['uuid', 'uuid', 'uuid', 'uuid', 'text', 'text', 'date'],
  'cantidad, reserva, disponibilidad y valor comparten una primitiva'
);

insert into public.organizations (id, name, slug)
values ('91000000-0000-4000-8000-000000000001', 'Inventario canonico', 'inventario-canonico');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  '92000000-0000-4000-8000-000000000001',
  'inventario.canonico@test.local',
  '{"full_name":"Inventario Canonico"}',
  now(), now()
);

insert into public.organization_memberships (organization_id, user_id)
values ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001');

insert into public.user_roles (organization_id, user_id, role_code)
values ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'ALMACEN');

insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  batch_control, expiration_control
)
values
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'CAN-001', 'Producto valorizado', 'UND', true, true),
  ('93000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'CAN-002', 'Producto en cuarentena', 'UND', false, false),
  ('93000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'CAN-003', 'Producto vencido', 'UND', true, true);

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
)
values
  ('94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'CENTRAL', 'Almacen central', '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'NORTE', 'Almacen norte', '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001');

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values
  ('95000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'A-01', 'Anaquel principal', '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'),
  ('95000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002', 'B-01', 'Anaquel norte', '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"91000000-0000-4000-8000-000000000001",
    "product_id":"93000000-0000-4000-8000-000000000001",
    "warehouse_id":"94000000-0000-4000-8000-000000000001",
    "location_id":"95000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"5","unit_cost":"10",
    "stock_status":"available","lot":"MISMO-LOTE","expiration_date":"2027-06-30",
    "operation_date":"2026-08-29","reason":"Primera valorizacion"
  }'::jsonb)
$$, 'registra el primer vencimiento del lote');

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"91000000-0000-4000-8000-000000000001",
    "product_id":"93000000-0000-4000-8000-000000000001",
    "warehouse_id":"94000000-0000-4000-8000-000000000001",
    "location_id":"95000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"5","unit_cost":"20",
    "stock_status":"available","lot":"MISMO-LOTE","expiration_date":"2027-12-31",
    "operation_date":"2026-08-29","reason":"Segunda valorizacion"
  }'::jsonb)
$$, 'registra otro vencimiento con costo diferente');

select results_eq(
  $$select expiration_date, physical_quantity, inventory_value, average_cost
    from public.inventory_bucket_balances
    where product_id = '93000000-0000-4000-8000-000000000001'
    order by expiration_date$$,
  $$values
    ('2027-06-30'::date, 5.000::numeric, 50.0000::numeric, 10.0000::numeric),
    ('2027-12-31'::date, 5.000::numeric, 100.0000::numeric, 20.0000::numeric)$$,
  'cantidad y valor permanecen separados por vencimiento'
);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"91000000-0000-4000-8000-000000000001",
    "product_id":"93000000-0000-4000-8000-000000000001",
    "warehouse_id":"94000000-0000-4000-8000-000000000001",
    "location_id":"95000000-0000-4000-8000-000000000001",
    "movement_type":"salida","quantity":"2",
    "stock_status":"available","lot":"MISMO-LOTE","expiration_date":"2027-06-30",
    "operation_date":"2026-08-29","reason":"Salida valorizada canonica"
  }'::jsonb)
$$, 'la salida usa el vencimiento solicitado');

select results_eq(
  $$select physical_quantity, inventory_value, average_cost
    from public.inventory_bucket_balances
    where product_id = '93000000-0000-4000-8000-000000000001'
      and expiration_date = '2027-06-30'$$,
  $$values (3.000::numeric, 30.0000::numeric, 10.0000::numeric)$$,
  'la salida conserva la valorizacion del bucket exacto'
);

select is(
  (select bucket_count from public.inventory_stock_summary
   where product_id = '93000000-0000-4000-8000-000000000001'),
  2::bigint,
  'el resumen expone buckets con stock sin descargar movimientos'
);
select is(
  (select lot_count from public.inventory_stock_summary
   where product_id = '93000000-0000-4000-8000-000000000001'),
  2::bigint,
  'el resumen distingue el mismo lote cuando cambia su vencimiento'
);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"91000000-0000-4000-8000-000000000001",
    "product_id":"93000000-0000-4000-8000-000000000002",
    "warehouse_id":"94000000-0000-4000-8000-000000000001",
    "location_id":"95000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"4","unit_cost":"8",
    "stock_status":"quarantine","operation_date":"2026-08-29",
    "reason":"Ingreso en cuarentena"
  }'::jsonb)
$$, 'registra producto unicamente en cuarentena');

select results_eq(
  $$select physical_quantity, sanitary_available_quantity, reserved_quantity,
           assignable_quantity, quarantine_quantity, damaged_quantity, expired_quantity
    from public.inventory_stock_summary
    where product_id = '93000000-0000-4000-8000-000000000002'$$,
  $$values (4.000::numeric, 0.000::numeric, 0.000::numeric,
            0.000::numeric, 4.000::numeric, 0.000::numeric, 0.000::numeric)$$,
  'cuarentena es fisico pero nunca asignable'
);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"91000000-0000-4000-8000-000000000001",
    "product_id":"93000000-0000-4000-8000-000000000003",
    "warehouse_id":"94000000-0000-4000-8000-000000000001",
    "location_id":"95000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"3","unit_cost":"6",
    "stock_status":"available","lot":"VENCIDO","expiration_date":"2020-01-01",
    "operation_date":"2026-08-29","reason":"Stock historico vencido"
  }'::jsonb)
$$, 'el ledger puede representar stock vencido historico');

select results_eq(
  $$select physical_quantity, sanitary_available_quantity, assignable_quantity, expired_quantity
    from public.inventory_stock_summary
    where product_id = '93000000-0000-4000-8000-000000000003'$$,
  $$values (3.000::numeric, 0.000::numeric, 0.000::numeric, 3.000::numeric)$$,
  'stock vencido queda excluido de disponibilidad sanitaria'
);

reset role;

insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status,
  lot, expiration_date, quantity, quantity_consumed, status, source_type, source_id,
  created_by, updated_by
)
values (
  '96000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  'available', 'MISMO-LOTE', '2027-06-30', 3, 0, 'active',
  'test', '97000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001'
);

select results_eq(
  $$select physical_quantity, reserved_quantity, assignable_quantity
    from public.inventory_bucket_availability
    where product_id = '93000000-0000-4000-8000-000000000001'
      and expiration_date = '2027-06-30'$$,
  $$values (3.000::numeric, 3.000::numeric, 0.000::numeric)$$,
  'la reserva reduce el asignable sin alterar el fisico'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);

select throws_ok($$
  select public.record_inventory_movement('{
    "organization_id":"91000000-0000-4000-8000-000000000001",
    "product_id":"93000000-0000-4000-8000-000000000001",
    "warehouse_id":"94000000-0000-4000-8000-000000000001",
    "location_id":"95000000-0000-4000-8000-000000000001",
    "movement_type":"salida","quantity":"2",
    "stock_status":"available","lot":"MISMO-LOTE","expiration_date":"2027-06-30",
    "operation_date":"2026-08-29","reason":"Salida contra reserva"
  }'::jsonb)
$$, 'P0001', 'INVENTORY_RESERVED_STOCK', 'una salida manual no consume stock reservado');

select throws_ok($$
  select public.transfer_inventory('{
    "organization_id":"91000000-0000-4000-8000-000000000001",
    "reference":"TR-RESERVA",
    "source_warehouse_id":"94000000-0000-4000-8000-000000000001",
    "destination_warehouse_id":"94000000-0000-4000-8000-000000000002",
    "items":[{
      "product_id":"93000000-0000-4000-8000-000000000001",
      "source_location_id":"95000000-0000-4000-8000-000000000001",
      "destination_location_id":"95000000-0000-4000-8000-000000000002",
      "quantity":"2","lot":"MISMO-LOTE","expiration_date":"2027-06-30",
      "stock_status":"available"
    }]
  }'::jsonb)
$$, 'P0001', 'INVENTORY_RESERVED_STOCK', 'una transferencia no consume stock reservado');

select is(
  (select count(*) from public.warehouse_transfers where reference = 'TR-RESERVA'),
  0::bigint,
  'la transferencia bloqueada revierte su cabecera'
);

reset role;

insert into public.product_warehouse_settings (
  organization_id, product_id, warehouse_id, default_location_id,
  minimum_stock, expiration_alert_days, updated_by
)
values (
  '91000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  5, 45, '92000000-0000-4000-8000-000000000001'
);

select results_eq(
  $$select assignable_quantity, minimum_stock, has_low_stock_alert
    from public.inventory_low_stock_alerts
    where product_id = '93000000-0000-4000-8000-000000000001'$$,
  $$values (5.000::numeric, 5.000::numeric, true)$$,
  'stock minimo usa el asignable agregado entre lotes'
);

select is(
  (select count(*) from public.inventory_low_stock_alerts
   where product_id = '93000000-0000-4000-8000-000000000001'),
  1::bigint,
  'stock minimo genera una sola fila por producto y almacen'
);

select results_eq(
  $$select expiration_state
    from public.inventory_expiration_alerts
    where product_id = '93000000-0000-4000-8000-000000000003'$$,
  $$values ('expired'::text)$$,
  'alertas distinguen vencido'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.inventory_reservations'::regclass),
  'reservas tiene RLS'
);
select is(
  has_table_privilege('anon', 'public.inventory_reservations', 'SELECT'),
  false,
  'anon no consulta reservas'
);
select is(
  has_table_privilege('authenticated', 'public.inventory_reservations', 'INSERT'),
  false,
  'reservas no se escriben directamente desde Data API'
);
select is(
  has_table_privilege('authenticated', 'public.inventory_reservations', 'SELECT'),
  true,
  'usuarios autorizados pueden consultar reservas mediante RLS'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory_movements'::regclass
      and conname = 'inventory_movements_product_tenant_fk'
  ),
  'movimientos tienen FK compuesta de producto y organizacion'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.warehouse_transfer_items'::regclass
      and conname = 'warehouse_transfer_items_source_location_fk'
  ),
  'detalle de transferencia valida ubicacion origen'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.warehouse_transfer_items'::regclass
      and conname = 'warehouse_transfer_items_destination_location_fk'
  ),
  'detalle de transferencia valida ubicacion destino'
);

select throws_ok($$
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, created_by
  ) values (
    '91000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001', 'CAN-001', 'Producto valorizado', 'UND',
    'salida', 2, 'Almacen central',
    '94000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    'available', 10, 'MISMO-LOTE', '2027-06-30', current_date,
    'Salida directa contra reserva', '92000000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'INVENTORY_RESERVED_STOCK', 'la barrera protege reservas incluso en insercion directa');

select is(
  public.inventory_bucket_quantity(
    '91000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    'available', 'MISMO-LOTE', '2027-06-30'
  ),
  3.000::numeric,
  'los rechazos no alteran el saldo fisico'
);

select * from finish();
rollback;
