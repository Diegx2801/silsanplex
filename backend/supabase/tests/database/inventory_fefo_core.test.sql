begin;

select plan(37);

select has_view('public', 'inventory_fefo_candidates', 'existe la disponibilidad ordenada por FEFO');
select has_function(
  'public', 'plan_inventory_fefo', array['uuid', 'uuid', 'uuid', 'numeric', 'uuid'],
  'existe el planificador FEFO reutilizable'
);
select has_function(
  'public', 'lock_inventory_fefo_scope', array['uuid', 'uuid', 'uuid'],
  'existe el bloqueo transaccional por producto y almacen'
);
select has_function(
  'public', 'assert_inventory_fefo_bucket',
  array['uuid', 'uuid', 'uuid', 'date'],
  'existe la barrera que valida la seleccion FEFO'
);
select has_function(
  'public', 'record_inventory_fefo_outbound', array['jsonb'],
  'existe la salida atomica FEFO multilote'
);
select has_function(
  'public', 'transfer_inventory_fefo', array['jsonb'],
  'existe la transferencia atomica FEFO multilote'
);

insert into public.organizations (id, name, slug)
values ('a1000000-0000-4000-8000-000000000001', 'Inventario FEFO', 'inventario-fefo');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'a2000000-0000-4000-8000-000000000001', 'fefo@test.local',
  '{"full_name":"Operador FEFO"}', now(), now()
);
insert into public.organization_memberships (organization_id, user_id)
values ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'ALMACEN');

insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  batch_control, expiration_control
) values (
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'FEFO-001', 'Producto controlado por FEFO', 'UND', true, true
);

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values
  (
    'a4000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001', 'CENTRAL', 'Central',
    'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'
  ),
  (
    'a4000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001', 'NORTE', 'Norte',
    'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'
  );

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values
  (
    'a5000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001', 'A-01', 'Anaquel A-01',
    'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'
  ),
  (
    'a5000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000002', 'B-01', 'Anaquel B-01',
    'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "location_id":"a5000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"5","unit_cost":"10",
    "stock_status":"available","lot":"LOTE-PRIMERO","expiration_date":"2026-09-10",
    "operation_date":"2026-08-29","reason":"Ingreso FEFO primero"
  }'::jsonb)
$$, 'registra el lote que vence primero');

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "location_id":"a5000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"7","unit_cost":"20",
    "stock_status":"available","lot":"LOTE-DESPUES","expiration_date":"2026-10-01",
    "operation_date":"2026-08-29","reason":"Ingreso FEFO posterior"
  }'::jsonb)
$$, 'registra el lote que vence despues');

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "location_id":"a5000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"9","unit_cost":"5",
    "stock_status":"quarantine","lot":"LOTE-CUARENTENA","expiration_date":"2026-09-01",
    "operation_date":"2026-08-29","reason":"No asignable por cuarentena"
  }'::jsonb)
$$, 'registra un lote en cuarentena');

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "location_id":"a5000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"8","unit_cost":"4",
    "stock_status":"available","lot":"LOTE-VENCIDO","expiration_date":"2026-08-01",
    "operation_date":"2026-08-01","reason":"Historico vencido"
  }'::jsonb)
$$, 'registra un lote vencido historico');

reset role;
insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status,
  lot, expiration_date, quantity, quantity_consumed, status, source_type, source_id,
  created_by, updated_by
) values (
  'a6000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'available', 'LOTE-PRIMERO', '2026-09-10', 4, 0, 'active',
  'test-fefo', 'a7000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select lot, expiration_date, assignable_quantity, fefo_rank
    from public.inventory_fefo_candidates
    where organization_id = 'a1000000-0000-4000-8000-000000000001'
      and product_id = 'a3000000-0000-4000-8000-000000000001'
      and warehouse_id = 'a4000000-0000-4000-8000-000000000001'
    order by fefo_rank$$,
  $$values
    ('LOTE-PRIMERO'::text, '2026-09-10'::date, 1.000::numeric, 1::bigint),
    ('LOTE-DESPUES'::text, '2026-10-01'::date, 7.000::numeric, 2::bigint)$$,
  'candidatos excluyen vencido y cuarentena, descuentan reservas y ordenan por vencimiento'
);

select results_eq(
  $$select lot, expiration_date, allocation_quantity
    from public.plan_inventory_fefo(
      'a1000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'a4000000-0000-4000-8000-000000000001', 6, null
    ) order by allocation_order$$,
  $$values
    ('LOTE-PRIMERO'::text, '2026-09-10'::date, 1.000::numeric),
    ('LOTE-DESPUES'::text, '2026-10-01'::date, 5.000::numeric)$$,
  'el plan distribuye la cantidad respetando FEFO'
);

select throws_ok($$
  select * from public.plan_inventory_fefo(
    'a1000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001', 9, null
  )
$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'el plan rechaza una cantidad no asignable');

select throws_ok($$
  select public.record_inventory_movement('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "location_id":"a5000000-0000-4000-8000-000000000001",
    "movement_type":"salida","quantity":"1","stock_status":"available",
    "lot":"LOTE-DESPUES","expiration_date":"2026-10-01",
    "operation_date":"2026-08-29","reason":"Intento fuera de FEFO"
  }'::jsonb)
$$, 'P0001', 'INVENTORY_FEFO_VIOLATION', 'una salida manual no salta el primer lote asignable');

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "location_id":"a5000000-0000-4000-8000-000000000001",
    "movement_type":"salida","quantity":"1","stock_status":"available",
    "lot":"LOTE-PRIMERO","expiration_date":"2026-09-10",
    "operation_date":"2026-08-29","reason":"Salida FEFO"
  }'::jsonb)
$$, 'permite consumir la parte no reservada del primer lote');

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "location_id":"a5000000-0000-4000-8000-000000000001",
    "movement_type":"salida","quantity":"1","stock_status":"available",
    "lot":"LOTE-DESPUES","expiration_date":"2026-10-01",
    "operation_date":"2026-08-29","reason":"Primer lote totalmente reservado"
  }'::jsonb)
$$, 'permite el siguiente lote si el anterior ya no es asignable');

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "location_id":"a5000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"2","unit_cost":"15",
    "stock_status":"available","lot":"LOTE-INTERMEDIO","expiration_date":"2026-09-20",
    "operation_date":"2026-08-29","reason":"Nuevo candidato intermedio"
  }'::jsonb)
$$, 'registra un nuevo lote anterior al lote posterior');

select throws_ok($$
  select public.transfer_inventory('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "reference":"TR-FEFO-INVALIDA",
    "source_warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "destination_warehouse_id":"a4000000-0000-4000-8000-000000000002",
    "items":[{
      "product_id":"a3000000-0000-4000-8000-000000000001",
      "source_location_id":"a5000000-0000-4000-8000-000000000001",
      "destination_location_id":"a5000000-0000-4000-8000-000000000002",
      "quantity":"1","lot":"LOTE-DESPUES","expiration_date":"2026-10-01",
      "stock_status":"available"
    }]
  }'::jsonb)
$$, 'P0001', 'INVENTORY_FEFO_VIOLATION', 'una transferencia tampoco salta el primer lote');

select is(
  (select count(*) from public.warehouse_transfers where reference = 'TR-FEFO-INVALIDA'),
  0::bigint,
  'la transferencia FEFO rechazada revierte su cabecera'
);

select lives_ok($$
  select public.transfer_inventory('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "reference":"TR-FEFO-VALIDA",
    "source_warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "destination_warehouse_id":"a4000000-0000-4000-8000-000000000002",
    "items":[{
      "product_id":"a3000000-0000-4000-8000-000000000001",
      "source_location_id":"a5000000-0000-4000-8000-000000000001",
      "destination_location_id":"a5000000-0000-4000-8000-000000000002",
      "quantity":"1","lot":"LOTE-INTERMEDIO","expiration_date":"2026-09-20",
      "stock_status":"available"
    }]
  }'::jsonb)
$$, 'la transferencia del primer lote asignable es valida');

select lives_ok($$
  select public.record_inventory_fefo_outbound('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "quantity":"3","operation_date":"2026-08-29",
    "reason":"Salida automatica multilote"
  }'::jsonb)
$$, 'la salida atomica distribuye una cantidad entre varios lotes');

select results_eq(
  $$select lot, quantity, unit_cost
    from public.inventory_movements
    where source_type = 'fefo-outbound'
      and reason = 'Salida automatica multilote'
    order by expiration_date$$,
  $$values
    ('LOTE-INTERMEDIO'::text, 1.000::numeric, 15.0000::numeric),
    ('LOTE-DESPUES'::text, 2.000::numeric, 20.0000::numeric)$$,
  'la salida conserva lote, vencimiento y costo del bucket exacto'
);

select throws_ok($$
  select public.record_inventory_fefo_outbound('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "quantity":"5","operation_date":"2026-08-29",
    "reason":"Salida atomica insuficiente"
  }'::jsonb)
$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'la salida atomica rechaza stock insuficiente');

select is(
  (select count(*) from public.inventory_movements where reason = 'Salida atomica insuficiente'),
  0::bigint,
  'una salida atomica rechazada no deja movimientos parciales'
);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "location_id":"a5000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"2","unit_cost":"12",
    "stock_status":"available","lot":"LOTE-NUEVO-PRIMERO","expiration_date":"2026-09-15",
    "operation_date":"2026-08-29","reason":"Lote para transferencia multilote"
  }'::jsonb)
$$, 'registra un lote anterior para probar transferencia multilote');

select lives_ok($$
  select public.transfer_inventory_fefo('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "reference":"TR-FEFO-MULTILOTE",
    "source_warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "destination_warehouse_id":"a4000000-0000-4000-8000-000000000002",
    "destination_location_id":"a5000000-0000-4000-8000-000000000002",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "quantity":"3","notes":"Transferencia atomica"
  }'::jsonb)
$$, 'la transferencia atomica distribuye una cantidad entre varios lotes');

select results_eq(
  $$select lot, quantity, unit_cost
    from public.warehouse_transfer_items item
    join public.warehouse_transfers transfer on transfer.id = item.transfer_id
    where transfer.reference = 'TR-FEFO-MULTILOTE'
    order by expiration_date$$,
  $$values
    ('LOTE-NUEVO-PRIMERO'::text, 2.000::numeric, 12.0000::numeric),
    ('LOTE-DESPUES'::text, 1.000::numeric, 20.0000::numeric)$$,
  'la transferencia conserva identidad y valorizacion de cada bucket'
);

select throws_ok($$
  select public.transfer_inventory_fefo('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "reference":"TR-FEFO-MULTILOTE-INVALIDA",
    "source_warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "destination_warehouse_id":"a4000000-0000-4000-8000-000000000002",
    "destination_location_id":"a5000000-0000-4000-8000-000000000002",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "quantity":"10"
  }'::jsonb)
$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'la transferencia atomica rechaza stock insuficiente');

select is(
  (select count(*) from public.warehouse_transfers where reference = 'TR-FEFO-MULTILOTE-INVALIDA'),
  0::bigint,
  'una transferencia atomica rechazada no deja cabecera ni items'
);

select is(
  has_function_privilege('authenticated', 'public.record_inventory_fefo_outbound(jsonb)', 'EXECUTE'),
  true,
  'authenticated puede ejecutar salidas FEFO atomicas'
);

select is(
  has_function_privilege('anon', 'public.transfer_inventory_fefo(jsonb)', 'EXECUTE'),
  false,
  'anon no puede ejecutar transferencias FEFO atomicas'
);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"a1000000-0000-4000-8000-000000000001",
    "product_id":"a3000000-0000-4000-8000-000000000001",
    "warehouse_id":"a4000000-0000-4000-8000-000000000001",
    "location_id":"a5000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":"2","unit_cost":"25",
    "stock_status":"available","lot":"LOTE-ULTIMO","expiration_date":"2026-11-01",
    "operation_date":"2026-08-29","reason":"Lote posterior para validar reservas"
  }'::jsonb)
$$, 'registra un lote posterior para conservar la regresion FEFO de reservas');

reset role;
select throws_ok($$
  insert into public.inventory_reservations (
    organization_id, product_id, warehouse_id, location_id, stock_status,
    lot, expiration_date, quantity, status, source_type, source_id
  ) values (
    'a1000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'available', 'LOTE-ULTIMO', '2026-11-01', 1, 'active',
    'test-fefo-later', 'a7000000-0000-4000-8000-000000000002'
  )
$$, 'P0001', 'INVENTORY_FEFO_VIOLATION', 'una reserva nueva tampoco puede saltar un lote anterior');

select is(
  has_table_privilege('anon', 'public.inventory_fefo_candidates', 'SELECT'),
  false,
  'anon no consulta candidatos FEFO'
);
select is(
  has_table_privilege('authenticated', 'public.inventory_fefo_candidates', 'SELECT'),
  true,
  'authenticated puede consultar candidatos bajo RLS'
);
select is(
  has_function_privilege(
    'authenticated', 'public.plan_inventory_fefo(uuid, uuid, uuid, numeric, uuid)', 'EXECUTE'
  ),
  true,
  'authenticated puede solicitar un plan FEFO'
);
select is(
  has_function_privilege(
    'anon', 'public.plan_inventory_fefo(uuid, uuid, uuid, numeric, uuid)', 'EXECUTE'
  ),
  false,
  'anon no puede solicitar planes FEFO'
);

select * from finish();
rollback;
