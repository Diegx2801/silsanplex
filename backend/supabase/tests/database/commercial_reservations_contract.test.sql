begin;

select plan(29);

-- La constraint historica no puede permanecer porque una linea comercial puede
-- repartirse entre varios buckets. Reparaciones conserva su propia unicidad.
select is(
  (select count(*) from pg_constraint
   where conrelid = 'public.inventory_reservations'::regclass
     and conname = 'inventory_reservations_source_unique'),
  0::bigint,
  'se elimina la unicidad global de reservas'
);
select ok(
  exists (
    select 1 from pg_class index_row
    join pg_index index_definition on index_definition.indexrelid = index_row.oid
    where index_row.relnamespace = 'public'::regnamespace
      and index_row.relname = 'inventory_reservations_repair_part_source_unique'
      and index_definition.indpred is not null
  ),
  'repair-part conserva una unicidad parcial por origen'
);
select ok(
  exists (
    select 1 from pg_class index_row
    join pg_index index_definition on index_definition.indexrelid = index_row.oid
    where index_row.relnamespace = 'public'::regnamespace
      and index_row.relname = 'inventory_reservations_order_item_bucket_unique'
      and index_definition.indpred is not null
  ),
  'order-item tiene una unicidad parcial por bucket'
);
select ok(
  position('nulls not distinct' in lower(
    pg_get_indexdef('public.inventory_reservations_order_item_bucket_unique'::regclass)
  )) > 0,
  'la unicidad de order-item trata NULL de lote y vencimiento como iguales'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'warehouse_id' and udt_name = 'uuid'
  ),
  'orders expone warehouse_id UUID'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_warehouse_same_organization'
  ),
  'pedido y almacen comparten organizacion mediante FK compuesta'
);
select is(
  (select attnotnull from pg_attribute
   where attrelid = 'public.orders'::regclass
     and attname = 'warehouse_id' and not attisdropped),
  false,
  'warehouse_id permanece nullable para historicos'
);
select is(
  (select convalidated from pg_constraint
   where conrelid = 'public.orders'::regclass
     and conname = 'orders_confirmed_warehouse_required'),
  false,
  'la regla de almacen obligatorio no exige backfill arbitrario'
);

insert into public.organizations (id, name, slug)
values
  ('f2b00000-0000-4000-8000-000000000001', 'Contrato comercial uno', 'contrato-comercial-uno'),
  ('f2b00000-0000-4000-8000-000000000002', 'Contrato comercial dos', 'contrato-comercial-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'f2c00000-0000-4000-8000-000000000001',
  'commercial.contract@test.local',
  '{"full_name":"Contrato comercial"}', now(), now()
);

insert into public.organization_memberships (organization_id, user_id)
values ('f2b00000-0000-4000-8000-000000000001', 'f2c00000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('f2b00000-0000-4000-8000-000000000001', 'f2c00000-0000-4000-8000-000000000001', 'ADMIN');

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name,
  created_by, updated_by
)
values (
  'f2d00000-0000-4000-8000-000000000001',
  'f2b00000-0000-4000-8000-000000000001',
  'RUC', '20999999994', 'Cliente contrato comercial',
  'f2c00000-0000-4000-8000-000000000001',
  'f2c00000-0000-4000-8000-000000000001'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  batch_control, expiration_control, created_by, updated_by
)
values
  (
    'f2e00000-0000-4000-8000-000000000001',
    'f2b00000-0000-4000-8000-000000000001',
    'COM-001', 'Producto comercial por lote', 'UND', true, true,
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  ),
  (
    'f2e00000-0000-4000-8000-000000000002',
    'f2b00000-0000-4000-8000-000000000001',
    'COM-002', 'Producto comercial sin lote', 'UND', false, false,
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  );

insert into public.warehouses (
  id, organization_id, code, name, is_active, created_by, updated_by
)
values
  (
    'f2f00000-0000-4000-8000-000000000001',
    'f2b00000-0000-4000-8000-000000000001',
    'COM', 'Almacen comercial', true,
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  ),
  (
    'f2f00000-0000-4000-8000-000000000002',
    'f2b00000-0000-4000-8000-000000000001',
    'INACT', 'Almacen inactivo', false,
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  ),
  (
    'f2f00000-0000-4000-8000-000000000003',
    'f2b00000-0000-4000-8000-000000000002',
    'OTRA', 'Almacen otra organizacion', true,
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  );

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values
  (
    'f2a00000-0000-4000-8000-000000000001',
    'f2b00000-0000-4000-8000-000000000001',
    'f2f00000-0000-4000-8000-000000000001',
    'A-01', 'Ubicacion lote A',
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  ),
  (
    'f2a00000-0000-4000-8000-000000000002',
    'f2b00000-0000-4000-8000-000000000001',
    'f2f00000-0000-4000-8000-000000000001',
    'B-01', 'Ubicacion lote B',
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  );

-- La validacion no depende solo de create_order: cualquier escritura de
-- backend que intente apuntar a un almacen inactivo tambien queda bloqueada.
select throws_ok($$
  insert into public.orders (
    id, organization_id, order_number, customer_id, warehouse_id, status,
    operation_key
  ) values (
    'f2300000-0000-4000-8000-000000000001',
    'f2b00000-0000-4000-8000-000000000001',
    'PED-900001',
    'f2d00000-0000-4000-8000-000000000001',
    'f2f00000-0000-4000-8000-000000000002',
    'atendido',
    'f2300000-0000-4000-8000-000000000002'
  )
$$, 'P0001', 'ORDER_WAREHOUSE_UNAVAILABLE', 'la barrera de backend rechaza almacenes inactivos');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2c00000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"f2b00000-0000-4000-8000-000000000001",
    "product_id":"f2e00000-0000-4000-8000-000000000001",
    "warehouse_id":"f2f00000-0000-4000-8000-000000000001",
    "location_id":"f2a00000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":5,"unit_cost":10,
    "stock_status":"available","lot":"LOTE-A","expiration_date":"2027-01-01",
    "operation_date":"2026-09-01","reason":"Stock lote A"
  }'::jsonb)
$$, 'registra stock fisico en el primer lote');
select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"f2b00000-0000-4000-8000-000000000001",
    "product_id":"f2e00000-0000-4000-8000-000000000001",
    "warehouse_id":"f2f00000-0000-4000-8000-000000000001",
    "location_id":"f2a00000-0000-4000-8000-000000000002",
    "movement_type":"entrada","quantity":5,"unit_cost":12,
    "stock_status":"available","lot":"LOTE-B","expiration_date":"2027-02-01",
    "operation_date":"2026-09-01","reason":"Stock lote B"
  }'::jsonb)
$$, 'registra stock fisico en el segundo lote');
select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"f2b00000-0000-4000-8000-000000000001",
    "product_id":"f2e00000-0000-4000-8000-000000000002",
    "warehouse_id":"f2f00000-0000-4000-8000-000000000001",
    "location_id":"f2a00000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":3,"unit_cost":4,
    "stock_status":"available",
    "operation_date":"2026-09-01","reason":"Stock sin lote"
  }'::jsonb)
$$, 'registra stock sin lote ni vencimiento');

reset role;
insert into public.orders (
  id, organization_id, order_number, customer_id, warehouse_id, order_date,
  status, operation_key, created_by, updated_by
) values (
  'f2300000-0000-4000-8000-000000000003',
  'f2b00000-0000-4000-8000-000000000001',
  'PED-900001',
  'f2d00000-0000-4000-8000-000000000001',
  'f2f00000-0000-4000-8000-000000000001',
  '2026-09-01', 'atendido',
  'f2100000-0000-4000-8000-000000000001',
  'f2c00000-0000-4000-8000-000000000001',
  'f2c00000-0000-4000-8000-000000000001'
);
insert into public.order_items (
  id, organization_id, order_id, product_id, product_code,
  product_description, unit_of_measure, quantity, unit_price
) values (
  'f2400000-0000-4000-8000-000000000001',
  'f2b00000-0000-4000-8000-000000000001',
  'f2300000-0000-4000-8000-000000000003',
  'f2e00000-0000-4000-8000-000000000001',
  'COM-001', 'Producto comercial por lote', 'UND', 7, 10
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2c00000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.orders), 1::bigint,
  'el pedido se crea una sola vez'
);
select is(
  (select warehouse_id from public.orders limit 1),
  'f2f00000-0000-4000-8000-000000000001'::uuid,
  'el pedido conserva el UUID del almacen'
);
select is(
  (select count(*) from public.order_items), 1::bigint,
  'el pedido conserva sus lineas persistentes'
);

reset role;
insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status,
  lot, expiration_date, quantity, quantity_consumed, status, source_type,
  source_id, created_by, updated_by
)
values
  (
    'f2200000-0000-4000-8000-000000000001',
    'f2b00000-0000-4000-8000-000000000001',
    'f2e00000-0000-4000-8000-000000000001',
    'f2f00000-0000-4000-8000-000000000001',
    'f2a00000-0000-4000-8000-000000000001',
    'available', 'LOTE-A', '2027-01-01', 5, 0, 'active', 'order-item',
    (select id from public.order_items limit 1),
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  ),
  (
    'f2200000-0000-4000-8000-000000000002',
    'f2b00000-0000-4000-8000-000000000001',
    'f2e00000-0000-4000-8000-000000000001',
    'f2f00000-0000-4000-8000-000000000001',
    'f2a00000-0000-4000-8000-000000000002',
    'available', 'LOTE-B', '2027-02-01', 2, 0, 'active', 'order-item',
    (select id from public.order_items limit 1),
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  );

select is(
  (select count(*) from public.inventory_reservations where source_type = 'order-item'),
  2::bigint,
  'una linea permite dos reservas en buckets FEFO distintos'
);
select is(
  (select sum(quantity) from public.inventory_reservations where source_type = 'order-item'),
  7.000::numeric,
  'las reservas de la linea suman la cantidad solicitada'
);
select results_eq(
  $$select sum(physical_quantity), sum(reserved_quantity), sum(assignable_quantity)
    from public.inventory_bucket_availability
    where organization_id = 'f2b00000-0000-4000-8000-000000000001'
      and product_id = 'f2e00000-0000-4000-8000-000000000001'
      and warehouse_id = 'f2f00000-0000-4000-8000-000000000001'$$,
  $$values (10.000::numeric, 7.000::numeric, 3.000::numeric)$$,
  'la reserva reduce asignable sin reducir stock fisico'
);
select is(
  (select count(*) from public.inventory_movements
   where organization_id = 'f2b00000-0000-4000-8000-000000000001'),
  3::bigint,
  'preparar el contrato no genera movimientos de inventario'
);

select throws_ok($$
  insert into public.inventory_reservations (
    id, organization_id, product_id, warehouse_id, location_id, stock_status,
    lot, expiration_date, quantity, quantity_consumed, status, source_type,
    source_id, created_by, updated_by
  ) values (
    'f2200000-0000-4000-8000-000000000003',
    'f2b00000-0000-4000-8000-000000000001',
    'f2e00000-0000-4000-8000-000000000001',
    'f2f00000-0000-4000-8000-000000000001',
    'f2a00000-0000-4000-8000-000000000002',
    'available', 'LOTE-B', '2027-02-01', 1, 0, 'active', 'order-item',
    (select id from public.order_items limit 1),
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  )
$$, '23505', null, 'no permite duplicar un bucket de la misma linea');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2c00000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
reset role;
insert into public.orders (
  id, organization_id, order_number, customer_id, warehouse_id, order_date,
  status, operation_key, created_by, updated_by
) values (
  'f2300000-0000-4000-8000-000000000004',
  'f2b00000-0000-4000-8000-000000000001',
  'PED-900002',
  'f2d00000-0000-4000-8000-000000000001',
  'f2f00000-0000-4000-8000-000000000001',
  '2026-09-01', 'atendido',
  'f2100000-0000-4000-8000-000000000002',
  'f2c00000-0000-4000-8000-000000000001',
  'f2c00000-0000-4000-8000-000000000001'
);
insert into public.order_items (
  id, organization_id, order_id, product_id, product_code,
  product_description, unit_of_measure, quantity, unit_price
) values (
  'f2400000-0000-4000-8000-000000000002',
  'f2b00000-0000-4000-8000-000000000001',
  'f2300000-0000-4000-8000-000000000004',
  'f2e00000-0000-4000-8000-000000000002',
  'COM-002', 'Producto comercial sin lote', 'UND', 1, 4
);
set local role authenticated;
reset role;
select lives_ok($$
  insert into public.inventory_reservations (
    id, organization_id, product_id, warehouse_id, location_id, stock_status,
    lot, expiration_date, quantity, quantity_consumed, status, source_type,
    source_id, created_by, updated_by
  ) values (
    'f2200000-0000-4000-8000-000000000004',
    'f2b00000-0000-4000-8000-000000000001',
    'f2e00000-0000-4000-8000-000000000002',
    'f2f00000-0000-4000-8000-000000000001',
    'f2a00000-0000-4000-8000-000000000001',
    'available', null, null, 1, 0, 'active', 'order-item',
    (select id from public.order_items where product_id = 'f2e00000-0000-4000-8000-000000000002'),
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  )
$$, 'permite la primera reserva del bucket sin lote');
select throws_ok($$
  insert into public.inventory_reservations (
    id, organization_id, product_id, warehouse_id, location_id, stock_status,
    lot, expiration_date, quantity, quantity_consumed, status, source_type,
    source_id, created_by, updated_by
  ) values (
    'f2200000-0000-4000-8000-000000000005',
    'f2b00000-0000-4000-8000-000000000001',
    'f2e00000-0000-4000-8000-000000000002',
    'f2f00000-0000-4000-8000-000000000001',
    'f2a00000-0000-4000-8000-000000000001',
    'available', null, null, 1, 0, 'active', 'order-item',
    (select id from public.order_items where product_id = 'f2e00000-0000-4000-8000-000000000002'),
    'f2c00000-0000-4000-8000-000000000001',
    'f2c00000-0000-4000-8000-000000000001'
  )
$$, '23505', null, 'NULL de lote y vencimiento no permite duplicar el bucket');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2c00000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','f2b00000-0000-4000-8000-000000000001',
    'operation_key','f2100000-0000-4000-8000-000000000003',
    'customer_id','f2d00000-0000-4000-8000-000000000001',
    'warehouse_id','f2f00000-0000-4000-8000-000000000003',
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','f2e00000-0000-4000-8000-000000000001',
      'quantity',1,'unit_price',10
    ))
  ))
$$, 'P0001', 'ORDER_WAREHOUSE_UNAVAILABLE', 'rechaza almacen de otra organizacion');
select throws_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','f2b00000-0000-4000-8000-000000000001',
    'operation_key','f2100000-0000-4000-8000-000000000004',
    'customer_id','f2d00000-0000-4000-8000-000000000001',
    'warehouse_id','f2f00000-0000-4000-8000-000000000002',
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','f2e00000-0000-4000-8000-000000000001',
      'quantity',1,'unit_price',10
    ))
  ))
$$, 'P0001', 'ORDER_WAREHOUSE_UNAVAILABLE', 'rechaza almacen inactivo');
select throws_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','f2b00000-0000-4000-8000-000000000001',
    'operation_key','f2100000-0000-4000-8000-000000000005',
    'customer_id','f2d00000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','f2e00000-0000-4000-8000-000000000001',
      'quantity',1,'unit_price',10
    ))
  ))
$$, '22023', 'ORDER_WAREHOUSE_REQUIRED', 'exige almacen en pedidos nuevos');
select is(
  public.create_order(jsonb_build_object(
    'organization_id','f2b00000-0000-4000-8000-000000000001',
    'operation_key','f2100000-0000-4000-8000-000000000001',
    'customer_id','f2d00000-0000-4000-8000-000000000001',
    'warehouse_id','f2f00000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','f2e00000-0000-4000-8000-000000000001',
      'quantity',7,'unit_price',10
    ))
  )),
  (select id from public.orders order by order_number limit 1),
  'reintentar create_order conserva idempotencia con warehouse_id'
);
select is(
  (select count(*) from public.orders), 2::bigint,
  'el retry no crea otro pedido'
);
select is(
  (select count(*) from public.inventory_reservations where source_type = 'order-item'),
  3::bigint,
  'las reservas no se duplican por retry del pedido'
);
select ok(
  position('on conflict (organization_id, source_type, source_id)' in lower(
    pg_get_functiondef('public.sync_repair_part_inventory_reservation()'::regprocedure)
  )) = 0,
  'la sincronizacion de Reparaciones no depende de la constraint eliminada'
);

select * from finish();
rollback;
