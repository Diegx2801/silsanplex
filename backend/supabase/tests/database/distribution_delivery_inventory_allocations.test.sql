begin;

select plan(49);

select has_table(
  'public',
  'distribution_delivery_inventory_allocations',
  'D3 crea la tabla normalizada de allocations explícitas'
);
select has_function(
  'public',
  'list_distribution_inventory_movements',
  array['uuid', 'uuid', 'uuid'],
  'D3 expone movimientos físicos disponibles por pedido y línea'
);
select has_function(
  'public',
  'list_distribution_delivery_inventory_trace',
  array['uuid', 'uuid'],
  'D3 expone la trazabilidad persistida de una entrega'
);
select is(
  has_function_privilege('anon', 'public.save_distribution_delivery(jsonb)', 'EXECUTE'),
  false,
  'anon no puede escribir deliveries ni allocations'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.distribution_delivery_inventory_allocations'::regclass),
  'RLS está activo en la tabla de allocations'
);
select is(
  has_table_privilege('authenticated', 'public.distribution_delivery_inventory_allocations', 'INSERT'),
  false,
  'authenticated no inserta allocations directamente'
);
select is(
  (select count(*) from pg_catalog.pg_constraint where conname = 'distribution_delivery_inventory_allocations_quantity_positive'),
  1::bigint,
  'allocation.quantity tiene constraint positivo'
);

insert into public.organizations (id, name, slug)
values
  ('d3300000-0000-4000-8000-000000000001', 'D3 explícito', 'd3-explicito'),
  ('d3300000-0000-4000-8000-000000000002', 'D3 otra organización', 'd3-otra-organizacion');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('d33c0000-0000-4000-8000-000000000001', 'd3.operador@test.local', '{"full_name":"Operador D3"}', now(), now()),
  ('d33c0000-0000-4000-8000-000000000002', 'd3.otro@test.local', '{"full_name":"Otro operador D3"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values
  ('d3300000-0000-4000-8000-000000000001', 'd33c0000-0000-4000-8000-000000000001'),
  ('d3300000-0000-4000-8000-000000000002', 'd33c0000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code)
values
  ('d3300000-0000-4000-8000-000000000001', 'd33c0000-0000-4000-8000-000000000001', 'ADMIN'),
  ('d3300000-0000-4000-8000-000000000002', 'd33c0000-0000-4000-8000-000000000002', 'ADMIN');
insert into public.customers (
  id, organization_id, document_type, document_number, legal_name, created_by, updated_by
) values (
  'd33d0000-0000-4000-8000-000000000001',
  'd3300000-0000-4000-8000-000000000001',
  'RUC', '20933333333', 'Cliente D3 explícito',
  'd33c0000-0000-4000-8000-000000000001', 'd33c0000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure, tax_affectation,
  batch_control, expiration_control, created_by, updated_by
) values
  (
    'd33e0000-0000-4000-8000-000000000001',
    'd3300000-0000-4000-8000-000000000001',
    'D3-001', 'Producto D3 por lotes', 'UND', 'gravado', true, true,
    'd33c0000-0000-4000-8000-000000000001', 'd33c0000-0000-4000-8000-000000000001'
  ),
  (
    'd33e0000-0000-4000-8000-000000000002',
    'd3300000-0000-4000-8000-000000000002',
    'D3-FOR', 'Producto D3 otra organización', 'UND', 'gravado', true, true,
    'd33c0000-0000-4000-8000-000000000002', 'd33c0000-0000-4000-8000-000000000002'
  );
insert into public.warehouses (
  id, organization_id, code, name, is_active, created_by, updated_by
) values
  (
    'd33f0000-0000-4000-8000-000000000001',
    'd3300000-0000-4000-8000-000000000001',
    'D3', 'Almacén D3', true,
    'd33c0000-0000-4000-8000-000000000001', 'd33c0000-0000-4000-8000-000000000001'
  ),
  (
    'd33f0000-0000-4000-8000-000000000002',
    'd3300000-0000-4000-8000-000000000002',
    'D3F', 'Almacén D3 externo', true,
    'd33c0000-0000-4000-8000-000000000002', 'd33c0000-0000-4000-8000-000000000002'
  );
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values
  (
    'd33a0000-0000-4000-8000-000000000001',
    'd3300000-0000-4000-8000-000000000001',
    'd33f0000-0000-4000-8000-000000000001',
    'L1', 'Ubicación lote L1',
    'd33c0000-0000-4000-8000-000000000001', 'd33c0000-0000-4000-8000-000000000001'
  ),
  (
    'd33a0000-0000-4000-8000-000000000002',
    'd3300000-0000-4000-8000-000000000001',
    'd33f0000-0000-4000-8000-000000000001',
    'L2', 'Ubicación lote L2',
    'd33c0000-0000-4000-8000-000000000001', 'd33c0000-0000-4000-8000-000000000001'
  ),
  (
    'd33a0000-0000-4000-8000-000000000003',
    'd3300000-0000-4000-8000-000000000002',
    'd33f0000-0000-4000-8000-000000000002',
    'F1', 'Ubicación externa',
    'd33c0000-0000-4000-8000-000000000002', 'd33c0000-0000-4000-8000-000000000002'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d33c0000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.record_inventory_movement(jsonb_build_object(
  'document_reference', 'D3-IN-L1',
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'product_id', 'd33e0000-0000-4000-8000-000000000001',
  'warehouse_id', 'd33f0000-0000-4000-8000-000000000001',
  'location_id', 'd33a0000-0000-4000-8000-000000000001',
  'movement_type', 'entrada', 'quantity', 60, 'unit_cost', 10,
  'stock_status', 'available', 'lot', 'L1', 'expiration_date', '2027-01-01',
  'operation_date', '2026-09-29', 'reason', 'Ingreso D3 lote L1'
)) as inbound_l1 \gset
select lives_ok($$select public.record_inventory_movement(jsonb_build_object(
  'document_reference', 'D3-IN-L2',
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'product_id', 'd33e0000-0000-4000-8000-000000000001',
  'warehouse_id', 'd33f0000-0000-4000-8000-000000000001',
  'location_id', 'd33a0000-0000-4000-8000-000000000002',
  'movement_type', 'entrada', 'quantity', 40, 'unit_cost', 11,
  'stock_status', 'available', 'lot', 'L2', 'expiration_date', '2027-06-01',
  'operation_date', '2026-09-29', 'reason', 'Ingreso D3 lote L2'
))$$, 'crea el stock físico del segundo lote mediante el ledger canónico');
select lives_ok($$select public.record_inventory_movement(jsonb_build_object(
  'document_reference', 'D3-IN-L3',
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'product_id', 'd33e0000-0000-4000-8000-000000000001',
  'warehouse_id', 'd33f0000-0000-4000-8000-000000000001',
  'location_id', 'd33a0000-0000-4000-8000-000000000002',
  'movement_type', 'entrada', 'quantity', 1, 'unit_cost', 12,
  'stock_status', 'available', 'lot', 'L3', 'expiration_date', '2028-01-01',
  'operation_date', '2026-09-29', 'reason', 'Ingreso D3 lote L3'
))$$, 'crea stock adicional para validar un movimiento de otra línea');

select set_config(
  'request.jwt.claims',
  '{"sub":"d33c0000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select public.record_inventory_movement(jsonb_build_object(
  'document_reference', 'D3-FOR-IN',
  'organization_id', 'd3300000-0000-4000-8000-000000000002',
  'product_id', 'd33e0000-0000-4000-8000-000000000002',
  'warehouse_id', 'd33f0000-0000-4000-8000-000000000002',
  'location_id', 'd33a0000-0000-4000-8000-000000000003',
  'movement_type', 'entrada', 'quantity', 1, 'unit_cost', 9,
  'stock_status', 'available', 'lot', 'FOR', 'expiration_date', '2028-01-01',
  'operation_date', '2026-09-29', 'reason', 'Ingreso otra organización'
)) as foreign_movement \gset
create temporary table d3_foreign_movement_ref (id uuid not null);
insert into d3_foreign_movement_ref values (:'foreign_movement'::uuid);
select set_config(
  'request.jwt.claims',
  '{"sub":"d33c0000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.create_order(jsonb_build_object(
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'operation_key', 'd3100000-0000-4000-8000-000000000001',
  'customer_id', 'd33d0000-0000-4000-8000-000000000001',
  'warehouse_id', 'd33f0000-0000-4000-8000-000000000001',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'd33e0000-0000-4000-8000-000000000001',
    'quantity', 100, 'unit_price', 20
  ))
)) as order_one \gset
select id as line_one
from public.order_items
where organization_id = 'd3300000-0000-4000-8000-000000000001'
  and order_id = :'order_one'::uuid \gset
select public.create_sale_from_order(
  'd3300000-0000-4000-8000-000000000001',
  :'order_one'::uuid,
  jsonb_build_object(
    'operation_key', 'd3200000-0000-4000-8000-000000000001',
    'document_type', 'boleta', 'series', 'B003', 'document_number', '1',
    'warehouse', 'Almacén D3'
  )
) as sale_one \gset

select public.create_order(jsonb_build_object(
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'operation_key', 'd3100000-0000-4000-8000-000000000002',
  'customer_id', 'd33d0000-0000-4000-8000-000000000001',
  'warehouse_id', 'd33f0000-0000-4000-8000-000000000001',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'd33e0000-0000-4000-8000-000000000001',
    'quantity', 1, 'unit_price', 20
  ))
)) as order_two \gset
select id as line_two
from public.order_items
where organization_id = 'd3300000-0000-4000-8000-000000000001'
  and order_id = :'order_two'::uuid \gset
select public.create_sale_from_order(
  'd3300000-0000-4000-8000-000000000001',
  :'order_two'::uuid,
  jsonb_build_object(
    'operation_key', 'd3200000-0000-4000-8000-000000000002',
    'document_type', 'boleta', 'series', 'B003', 'document_number', '2',
    'warehouse', 'Almacén D3'
  )
) as sale_two \gset

select public.dispatch_order_from_reservations(jsonb_build_object(
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'operation_key', 'd3300000-0000-4000-8000-000000000001',
  'items', jsonb_build_array(jsonb_build_object(
    'order_item_id', :'line_one'::uuid, 'quantity', 100
  ))
)) as dispatch_one \gset
select public.dispatch_order_from_reservations(jsonb_build_object(
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'order_id', (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000002'),
  'sale_id', (select id from public.sales where operation_key = 'd3200000-0000-4000-8000-000000000002'),
  'operation_key', 'd3300000-0000-4000-8000-000000000002',
  'items', jsonb_build_array(jsonb_build_object(
    'order_item_id', :'line_two'::uuid, 'quantity', 1
  ))
)) as dispatch_two \gset

select id as movement_l1
from public.inventory_movements
where organization_id = 'd3300000-0000-4000-8000-000000000001'
  and source_type = 'order-dispatch'
  and source_id = :'line_one'::uuid
  and lot = 'L1' \gset
select id as movement_l2
from public.inventory_movements
where organization_id = 'd3300000-0000-4000-8000-000000000001'
  and source_type = 'order-dispatch'
  and source_id = :'line_one'::uuid
  and lot = 'L2' \gset
select id as movement_other_line
from public.inventory_movements
where organization_id = 'd3300000-0000-4000-8000-000000000001'
  and source_type = 'order-dispatch'
  and source_id = :'line_two'::uuid \gset

select is(
  (select count(*) from public.inventory_movements where source_type = 'order-dispatch' and source_id = :'line_one'::uuid),
  2::bigint,
  'D2 crea dos movements para la línea FEFO de 100 unidades'
);
select is(
  (select sum(quantity) from public.inventory_movements where source_type = 'order-dispatch' and source_id = :'line_one'::uuid),
  100.000::numeric,
  'la cantidad física del despacho es exactamente 100'
);
select is(
  (select quantity from public.inventory_movements where id = :'movement_l1'::uuid),
  60.000::numeric,
  'movement L1 conserva 60 unidades'
);
select is(
  (select quantity from public.inventory_movements where id = :'movement_l2'::uuid),
  40.000::numeric,
  'movement L2 conserva 40 unidades'
);
select is(
  (select count(*) from public.inventory_movements where source_type = 'order-dispatch' and document_reference = 'PED:' || (select order_number from public.orders where id = :'order_one'::uuid) || '|OP:d3300000-0000-4000-8000-000000000001'),
  2::bigint,
  'D2 deja document_reference estable en los dos movements'
);
select is(
  (select count(*) from public.audit_events where action = 'ORDER_DISPATCHED' and entity_id = :'order_one'),
  1::bigint,
  'ORDER_DISPATCHED identifica la operación física completa'
);
select is(
  (select sum(quantity_consumed) from public.inventory_reservations where source_id = :'line_one'::uuid),
  100.000::numeric,
  'D2 consume las reservas FEFO sin que D3 participe'
);

select public.save_distribution_delivery(jsonb_build_object(
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid),
  'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-A', 'transport_type', 'interno', 'tracking_status', 'en_curso',
  'delivery_status', 'programado', 'direction', 'Av. Lote A', 'numero_despacho', 'D3-A',
  'modalidad', 'movilidad_propia', 'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '',
  'evidencia', '', 'incidencias', '[]'::jsonb, 'observations', 'Entrega A',
  'operation_key', 'd3700000-0000-4000-8000-000000000001',
  'items', jsonb_build_array(jsonb_build_object(
    'id', :'line_one'::uuid, 'cantidad', 50,
    'movement_allocations', jsonb_build_array(jsonb_build_object(
      'inventory_movement_id', :'movement_l1'::uuid, 'quantity', 50
    ))
  ))
)) as delivery_a \gset
select is(
  (select count(*) from public.list_distribution_delivery_inventory_trace(
    'd3300000-0000-4000-8000-000000000001', :'delivery_a'::uuid
  )),
  1::bigint,
  'la lectura D3 funciona para una entrega explícita'
);
select is(
  (select count(*) from public.distribution_delivery_inventory_allocations where delivery_id = :'delivery_a'::uuid),
  1::bigint,
  'una entrega conserva una allocation explícita'
);
select is(
  (select sum(quantity) from public.distribution_delivery_inventory_allocations where delivery_id = :'delivery_a'::uuid),
  50.000::numeric,
  'la suma de allocations de la entrega A es exacta'
);

select public.save_distribution_delivery(jsonb_build_object(
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid),
  'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-B', 'transport_type', 'interno', 'tracking_status', 'en_curso',
  'delivery_status', 'programado', 'direction', 'Av. Lote B', 'numero_despacho', 'D3-B',
  'modalidad', 'movilidad_propia', 'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '',
  'evidencia', '', 'incidencias', '[]'::jsonb, 'observations', 'Entrega B',
  'operation_key', 'd3700000-0000-4000-8000-000000000002',
  'items', jsonb_build_array(jsonb_build_object(
    'id', :'line_one'::uuid, 'cantidad', 50,
    'movement_allocations', jsonb_build_array(
      jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 10),
      jsonb_build_object('inventory_movement_id', :'movement_l2'::uuid, 'quantity', 40)
    )
  ))
)) as delivery_b \gset
select is(
  (select count(*) from public.distribution_delivery_inventory_allocations where delivery_id = :'delivery_b'::uuid),
  2::bigint,
  'una entrega puede tomar cantidades de varios movements'
);
select is(
  (select sum(quantity) from public.distribution_delivery_inventory_allocations where delivery_id = :'delivery_b'::uuid),
  50.000::numeric,
  'la suma de allocations de la entrega B es exacta'
);
select is(
  (select sum(quantity) from public.distribution_delivery_inventory_allocations where inventory_movement_id = :'movement_l1'::uuid),
  60.000::numeric,
  'un movement puede dividirse entre dos deliveries sin duplicarse'
);
select is(
  (select sum(quantity) from public.distribution_delivery_inventory_allocations where inventory_movement_id = :'movement_l2'::uuid),
  40.000::numeric,
  'el segundo movement queda asignado exactamente una vez'
);
select is(
  (select count(*) from public.list_distribution_delivery_inventory_trace(
    'd3300000-0000-4000-8000-000000000001', null
  )),
  3::bigint,
  'el read model devuelve las tres allocations explícitas'
);
select is(
  (select sum(allocated_quantity) from public.list_distribution_delivery_inventory_trace(
    'd3300000-0000-4000-8000-000000000001', :'delivery_a'::uuid
  )),
  50.000::numeric,
  'la lectura de la entrega A devuelve 50 del lote L1'
);
select is(
  (select sum(allocated_quantity) from public.list_distribution_delivery_inventory_trace(
    'd3300000-0000-4000-8000-000000000001', :'delivery_b'::uuid
  ) where lot = 'L1'),
  10.000::numeric,
  'la entrega B conserva explícitamente 10 del lote L1'
);
select is(
  (select sum(allocated_quantity) from public.list_distribution_delivery_inventory_trace(
    'd3300000-0000-4000-8000-000000000001', :'delivery_b'::uuid
  ) where lot = 'L2'),
  40.000::numeric,
  'la entrega B conserva explícitamente 40 del lote L2'
);
select is(
  (select count(*) from public.list_distribution_delivery_inventory_trace(
    'd3300000-0000-4000-8000-000000000001', :'delivery_b'::uuid
  ) where expiration_date in ('2027-01-01', '2027-06-01') and location_id in (
    'd33a0000-0000-4000-8000-000000000001'::uuid,
    'd33a0000-0000-4000-8000-000000000002'::uuid
  )),
  2::bigint,
  'la trazabilidad conserva vencimiento y ubicación desde inventory_movements'
);
select is(
  (select count(*) from public.list_distribution_inventory_movements(
    'd3300000-0000-4000-8000-000000000001', :'order_one'::uuid, null
  )),
  0::bigint,
  'no queda cantidad física disponible después de asignar 100 logísticamente'
);
select is(
  (select count(*) from public.inventory_movements where source_type = 'order-dispatch' and source_id = :'line_one'::uuid),
  2::bigint,
  'D3 no crea inventory_movements adicionales'
);
select is(
  (select sum(quantity_consumed) from public.inventory_reservations where source_id = :'line_one'::uuid),
  100.000::numeric,
  'D3 no modifica quantity_consumed de las reservas'
);

-- Una entrega creada antes de D3 puede tener delivery_items normalizados, pero
-- no allocations explícitas. Mantener su estado no debe inventar trazabilidad
-- ni obligar un backfill; solo un cambio físico exige allocations D3.
reset role;
insert into public.distribution_deliveries (
  id, organization_id, order_id, order_number, customer_name, issue_date,
  delivery_date, guide_number, transport_type, tracking_status, observations,
  order_items, created_by, updated_by
) values (
  'd3d30000-0000-4000-8000-000000000001',
  'd3300000-0000-4000-8000-000000000001',
  :'order_two'::uuid,
  (select order_number from public.orders where id = :'order_two'::uuid),
  'Cliente D3 legacy', '2026-09-29', '2026-09-30', 'D3-LEGACY', 'interno',
  'en_curso', 'Mantenimiento de entrega histórica',
  jsonb_build_array(jsonb_build_object('id', :'line_two'::uuid, 'cantidad', 1)),
  'd33c0000-0000-4000-8000-000000000001',
  'd33c0000-0000-4000-8000-000000000001'
);
insert into public.distribution_delivery_items (
  organization_id, delivery_id, order_id, order_line_id, quantity
) values (
  'd3300000-0000-4000-8000-000000000001',
  'd3d30000-0000-4000-8000-000000000001',
  :'order_two'::uuid,
  :'line_two'::uuid,
  1
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d33c0000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(public.save_distribution_delivery(jsonb_build_object(
  'id', 'd3d30000-0000-4000-8000-000000000001',
  'expected_lock_version', (select lock_version from public.distribution_deliveries where id = 'd3d30000-0000-4000-8000-000000000001'),
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'order_id', (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000002'),
  'sale_id', (select id from public.sales where operation_key = 'd3200000-0000-4000-8000-000000000002'),
  'order_number', (select order_number from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000002'),
  'customer_name', 'Cliente D3 legacy', 'issue_date', '2026-09-29',
  'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-LEGACY', 'transport_type', 'interno',
  'tracking_status', 'en_curso', 'delivery_status', 'preparando',
  'direction', '', 'numero_despacho', 'D3-LEGACY',
  'modalidad', 'movilidad_propia', 'transportista', '', 'conductor', '',
  'vehiculo', '', 'placa', '', 'evidencia', '', 'incidencias', '[]'::jsonb,
  'observations', 'Mantenimiento de entrega histórica',
  'operation_key', 'd3700000-0000-4000-8000-000000000016',
  'items', jsonb_build_array(jsonb_build_object(
    'id', (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000002')), 'cantidad', 1
  ))
)), 'd3d30000-0000-4000-8000-000000000001'::uuid,
  'una entrega legacy normalizada puede mantenerse sin inventar allocations');
select is(
  (select count(*) from public.distribution_delivery_inventory_allocations
   where delivery_id = 'd3d30000-0000-4000-8000-000000000001'),
  0::bigint,
  'la compatibilidad legacy no crea allocations ficticias'
);

select is(
  public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3300000-0000-4000-8000-000000000001',
    'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
    'order_number', (select order_number from public.orders where id = :'order_one'::uuid),
    'customer_name', 'Cliente D3 explícito', 'issue_date', '2026-09-29',
    'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
    'guide_number', 'D3-B', 'transport_type', 'interno', 'tracking_status', 'en_curso',
    'delivery_status', 'programado', 'direction', 'Av. Lote B', 'numero_despacho', 'D3-B',
    'modalidad', 'movilidad_propia', 'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '',
    'evidencia', '', 'incidencias', '[]'::jsonb, 'observations', 'Entrega B',
    'operation_key', 'd3700000-0000-4000-8000-000000000002',
    'items', jsonb_build_array(jsonb_build_object(
      'id', :'line_one'::uuid, 'cantidad', 50,
      'movement_allocations', jsonb_build_array(
        jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 10),
        jsonb_build_object('inventory_movement_id', :'movement_l2'::uuid, 'quantity', 40)
      )
    ))
  )),
  :'delivery_b'::uuid,
  'la misma operation_key con el mismo payload devuelve el mismo delivery'
);
select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3300000-0000-4000-8000-000000000001',
    'order_id', (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'),
    'sale_id', (select id from public.sales where operation_key = 'd3200000-0000-4000-8000-000000000001'),
    'order_number', (select order_number from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'),
    'customer_name', 'Cliente D3 modificado', 'issue_date', '2026-09-29',
    'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
    'guide_number', 'D3-B', 'transport_type', 'interno', 'direction', 'Otro destino',
    'numero_despacho', 'D3-B', 'operation_key', 'd3700000-0000-4000-8000-000000000002',
    'items', jsonb_build_array(jsonb_build_object(
      'id', (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001')), 'cantidad', 50,
      'movement_allocations', jsonb_build_array(jsonb_build_object(
        'inventory_movement_id', (select id from public.inventory_movements where organization_id = 'd3300000-0000-4000-8000-000000000001' and source_type = 'order-dispatch' and lot = 'L2' and source_id = (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'))), 'quantity', 50
      ))
    ))
  ));
$$, 'P0001', 'DISTRIBUTION_OPERATION_KEY_REUSED', 'una allocation distinta entra en conflicto idempotente');

select public.save_distribution_delivery(jsonb_build_object(
  'id', :'delivery_a'::uuid, 'expected_lock_version', (select lock_version from public.distribution_deliveries where id = :'delivery_a'::uuid),
  'organization_id', 'd3300000-0000-4000-8000-000000000001', 'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid), 'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-A', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'programado',
  'direction', 'Av. Lote A', 'numero_despacho', 'D3-A', 'modalidad', 'movilidad_propia',
  'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '', 'evidencia', '', 'incidencias', '[]'::jsonb,
  'operation_key', 'd3700000-0000-4000-8000-000000000003',
  'items', jsonb_build_array(jsonb_build_object('id', :'line_one'::uuid, 'cantidad', 30,
    'movement_allocations', jsonb_build_array(jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 30))))
)) as delivery_a_reduced \gset
select is(
  (select sum(quantity) from public.distribution_delivery_inventory_allocations where delivery_id = :'delivery_a'::uuid),
  30.000::numeric,
  'reducir una entrega libera la cantidad anterior del movement'
);
select public.save_distribution_delivery(jsonb_build_object(
  'id', :'delivery_a'::uuid, 'expected_lock_version', (select lock_version from public.distribution_deliveries where id = :'delivery_a'::uuid),
  'organization_id', 'd3300000-0000-4000-8000-000000000001', 'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid), 'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-A', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'programado',
  'direction', 'Av. Lote A', 'numero_despacho', 'D3-A', 'modalidad', 'movilidad_propia',
  'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '', 'evidencia', '', 'incidencias', '[]'::jsonb,
  'operation_key', 'd3700000-0000-4000-8000-000000000004',
    'items', jsonb_build_array(jsonb_build_object('id', :'line_one'::uuid, 'cantidad', 50,
      'movement_allocations', jsonb_build_array(jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 50))))
)) as delivery_a_increased \gset
select is(
  (select sum(quantity) from public.distribution_delivery_inventory_allocations where delivery_id = :'delivery_a'::uuid),
  50.000::numeric,
  'aumentar una entrega permite asignar un movement adicional'
);

select public.save_distribution_delivery(jsonb_build_object(
  'id', :'delivery_a'::uuid, 'expected_lock_version', (select lock_version from public.distribution_deliveries where id = :'delivery_a'::uuid),
  'organization_id', 'd3300000-0000-4000-8000-000000000001', 'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid), 'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-A', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'programado',
  'direction', 'Av. Lote A', 'numero_despacho', 'D3-A', 'modalidad', 'movilidad_propia',
  'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '', 'evidencia', '', 'incidencias', '[]'::jsonb,
  'operation_key', 'd3700000-0000-4000-8000-000000000005',
  'items', jsonb_build_array(jsonb_build_object('id', :'line_one'::uuid, 'cantidad', 30,
    'movement_allocations', jsonb_build_array(jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 30))))
)) as delivery_a_again_reduced \gset
select public.save_distribution_delivery(jsonb_build_object(
  'organization_id', 'd3300000-0000-4000-8000-000000000001', 'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid), 'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-C', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'programado',
  'direction', 'Av. Lote C', 'numero_despacho', 'D3-C', 'modalidad', 'movilidad_propia',
  'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '', 'evidencia', '', 'incidencias', '[]'::jsonb,
  'operation_key', 'd3700000-0000-4000-8000-000000000006',
  'items', jsonb_build_array(jsonb_build_object('id', :'line_one'::uuid, 'cantidad', 10,
    'movement_allocations', jsonb_build_array(jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 10))))
)) as delivery_c \gset
select is(
  (select sum(quantity) from public.distribution_delivery_inventory_allocations where delivery_id = :'delivery_c'::uuid),
  10.000::numeric,
  'la tercera entrega puede usar el saldo liberado'
);
select public.save_distribution_delivery(jsonb_build_object(
  'id', :'delivery_c'::uuid, 'expected_lock_version', (select lock_version from public.distribution_deliveries where id = :'delivery_c'::uuid),
  'organization_id', 'd3300000-0000-4000-8000-000000000001', 'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid), 'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-C', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'cancelado',
  'direction', 'Av. Lote C', 'numero_despacho', 'D3-C', 'modalidad', 'movilidad_propia',
  'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '', 'evidencia', '', 'incidencias', '[]'::jsonb,
  'operation_key', 'd3700000-0000-4000-8000-000000000007',
  'items', jsonb_build_array(jsonb_build_object('id', :'line_one'::uuid, 'cantidad', 10,
    'movement_allocations', jsonb_build_array(jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 10))))
)) as delivery_c_cancelled \gset
select is(
  (select count(*) from public.distribution_delivery_inventory_allocations where delivery_id = :'delivery_c'::uuid),
  0::bigint,
  'cancelar una entrega editable libera sus allocations sin tocar el movimiento'
);

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3300000-0000-4000-8000-000000000001',
    'order_id', (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'),
    'sale_id', (select id from public.sales where operation_key = 'd3200000-0000-4000-8000-000000000001'),
    'order_number', (select order_number from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'), 'customer_name', 'Cliente D3 explícito',
    'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
    'guide_number', 'D3-INVALID', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'programado',
    'direction', 'Av. Inválida', 'numero_despacho', 'D3-INVALID', 'operation_key', 'd3700000-0000-4000-8000-000000000008',
    'items', jsonb_build_array(jsonb_build_object(
      'id', (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001')), 'cantidad', 1,
      'movement_allocations', jsonb_build_array(jsonb_build_object('inventory_movement_id', (select id from public.inventory_movements where document_reference = 'D3-IN-L1'), 'quantity', 1))))
  ));
$$, 'P0001', 'DISTRIBUTION_MOVEMENT_NOT_ORDER_DISPATCH', 'rechaza un movement que no es salida order-dispatch');
select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3300000-0000-4000-8000-000000000001',
    'order_id', (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'),
    'sale_id', (select id from public.sales where operation_key = 'd3200000-0000-4000-8000-000000000001'),
    'order_number', (select order_number from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'), 'customer_name', 'Cliente D3 explícito',
    'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
    'guide_number', 'D3-WRONG-LINE', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'programado',
    'direction', 'Av. Línea incorrecta', 'numero_despacho', 'D3-WRONG-LINE', 'operation_key', 'd3700000-0000-4000-8000-000000000009',
    'items', jsonb_build_array(jsonb_build_object(
      'id', (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001')), 'cantidad', 1,
      'movement_allocations', jsonb_build_array(jsonb_build_object(
        'inventory_movement_id', (select id from public.inventory_movements where source_type = 'order-dispatch' and source_id = (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000002'))), 'quantity', 1))))
  ));
$$, 'P0001', 'DISTRIBUTION_MOVEMENT_ORDER_LINE_MISMATCH', 'rechaza un movement de otra línea del pedido');
select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3300000-0000-4000-8000-000000000001',
    'order_id', (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'),
    'sale_id', (select id from public.sales where operation_key = 'd3200000-0000-4000-8000-000000000001'),
    'order_number', (select order_number from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'), 'customer_name', 'Cliente D3 explícito',
    'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
    'guide_number', 'D3-CROSS-ORG', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'programado',
    'direction', 'Av. Otra organización', 'numero_despacho', 'D3-CROSS-ORG', 'operation_key', 'd3700000-0000-4000-8000-000000000010',
    'items', jsonb_build_array(jsonb_build_object(
      'id', (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001')), 'cantidad', 1,
      'movement_allocations', jsonb_build_array(jsonb_build_object(
        'inventory_movement_id', (select id from d3_foreign_movement_ref), 'quantity', 1))))
  ));
$$, 'P0001', 'DISTRIBUTION_MOVEMENT_NOT_FOUND', 'rechaza un movement de otra organización');

select public.save_distribution_delivery(jsonb_build_object(
  'organization_id', 'd3300000-0000-4000-8000-000000000001', 'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid), 'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-D', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'programado',
  'direction', 'Av. Lote D', 'numero_despacho', 'D3-D', 'modalidad', 'movilidad_propia',
  'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '', 'evidencia', '', 'incidencias', '[]'::jsonb,
  'operation_key', 'd3700000-0000-4000-8000-000000000011',
  'items', jsonb_build_array(jsonb_build_object('id', :'line_one'::uuid, 'cantidad', 5,
    'movement_allocations', jsonb_build_array(jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 5))))
)) as delivery_d \gset
select public.save_distribution_delivery(jsonb_build_object(
  'id', :'delivery_d'::uuid,
  'expected_lock_version', (select lock_version from public.distribution_deliveries where id = :'delivery_d'::uuid),
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid), 'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-D', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'preparando',
  'direction', 'Av. Lote D', 'numero_despacho', 'D3-D', 'modalidad', 'movilidad_propia',
  'transportista', 'Transportes D3', 'conductor', 'Operador D3', 'vehiculo', 'Camión D3', 'placa', 'D3-001', 'evidencia', '', 'incidencias', '[]'::jsonb,
  'operation_key', 'd3700000-0000-4000-8000-000000000012',
  'items', jsonb_build_array(jsonb_build_object('id', :'line_one'::uuid, 'cantidad', 5,
    'movement_allocations', jsonb_build_array(jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 5))))
)) as delivery_d_preparing \gset
select public.save_distribution_delivery(jsonb_build_object(
  'id', :'delivery_d'::uuid,
  'expected_lock_version', (select lock_version from public.distribution_deliveries where id = :'delivery_d'::uuid),
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid), 'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-D', 'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'en_curso',
  'direction', 'Av. Lote D', 'numero_despacho', 'D3-D', 'modalidad', 'movilidad_propia',
  'transportista', 'Transportes D3', 'conductor', 'Operador D3', 'vehiculo', 'Camión D3', 'placa', 'D3-001', 'evidencia', '', 'incidencias', '[]'::jsonb,
  'operation_key', 'd3700000-0000-4000-8000-000000000013',
  'items', jsonb_build_array(jsonb_build_object('id', :'line_one'::uuid, 'cantidad', 5,
    'movement_allocations', jsonb_build_array(jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 5))))
)) as delivery_d_in_course \gset
select public.save_distribution_delivery(jsonb_build_object(
  'id', :'delivery_d'::uuid,
  'expected_lock_version', (select lock_version from public.distribution_deliveries where id = :'delivery_d'::uuid),
  'organization_id', 'd3300000-0000-4000-8000-000000000001',
  'order_id', :'order_one'::uuid, 'sale_id', :'sale_one'::uuid,
  'order_number', (select order_number from public.orders where id = :'order_one'::uuid), 'customer_name', 'Cliente D3 explícito',
  'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
  'guide_number', 'D3-D', 'transport_type', 'interno', 'tracking_status', 'en_destino', 'delivery_status', 'en_destino',
  'direction', 'Av. Lote D', 'numero_despacho', 'D3-D', 'modalidad', 'movilidad_propia',
  'transportista', 'Transportes D3', 'conductor', 'Operador D3', 'vehiculo', 'Camión D3', 'placa', 'D3-001', 'evidencia', '', 'incidencias', '[]'::jsonb,
  'operation_key', 'd3700000-0000-4000-8000-000000000014',
  'items', jsonb_build_array(jsonb_build_object('id', :'line_one'::uuid, 'cantidad', 5,
    'movement_allocations', jsonb_build_array(jsonb_build_object('inventory_movement_id', :'movement_l1'::uuid, 'quantity', 5))))
)) as delivery_d_in_destination \gset
select public.record_distribution_delivery_outcome(jsonb_build_object(
  'organizationId', 'd3300000-0000-4000-8000-000000000001',
  'entregaId', :'delivery_d'::uuid,
  'expectedLockVersion', (select lock_version from public.distribution_deliveries where id = :'delivery_d'::uuid),
  'operationKey', 'd3800000-0000-4000-8000-000000000001',
  'resultado', 'entregado', 'fecha', pg_catalog.timezone('America/Lima', pg_catalog.now())::date, 'evidencia', 'D3 test',
  'incidencias', '[]'::jsonb,
  'lineas', jsonb_build_array(jsonb_build_object(
    'orderLineId', :'line_one'::uuid, 'cantidad', 5
  ))
)) as outcome_d \gset
select is(
  (select delivery_status from public.distribution_deliveries where id = :'delivery_d'::uuid),
  'entregado',
  'una entrega final conserva sus allocations'
);
select is(
  (select count(*) from public.list_distribution_delivery_inventory_trace(
    'd3300000-0000-4000-8000-000000000001', :'delivery_d'::uuid
  )),
  1::bigint,
  'la entrega entregada mantiene su trazabilidad explícita'
);
select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', (select id from public.distribution_deliveries where guide_number = 'D3-D'),
    'expected_lock_version', (select lock_version from public.distribution_deliveries where guide_number = 'D3-D'),
    'organization_id', 'd3300000-0000-4000-8000-000000000001',
    'order_id', (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'),
    'sale_id', (select id from public.sales where operation_key = 'd3200000-0000-4000-8000-000000000001'),
    'order_number', (select order_number from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'), 'customer_name', 'Cliente D3 explícito',
    'issue_date', '2026-09-29', 'delivery_date', '2026-09-30', 'scheduled_date', '2026-09-30',
    'guide_number', 'D3-D', 'transport_type', 'interno', 'tracking_status', 'en_destino', 'delivery_status', 'entregado',
    'direction', 'Av. Lote D', 'numero_despacho', 'D3-D', 'modalidad', 'movilidad_propia',
    'transportista', 'Transportes D3', 'conductor', 'Operador D3', 'vehiculo', 'Camión D3', 'placa', 'D3-001', 'evidencia', 'D3 test',
    'operation_key', 'd3700000-0000-4000-8000-000000000015',
    'items', jsonb_build_array(jsonb_build_object('id', (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001')), 'cantidad', 5,
      'movement_allocations', jsonb_build_array(
        jsonb_build_object('inventory_movement_id', (select id from public.inventory_movements where source_type = 'order-dispatch' and lot = 'L1' and source_id = (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'))), 'quantity', 4),
        jsonb_build_object('inventory_movement_id', (select id from public.inventory_movements where source_type = 'order-dispatch' and lot = 'L2' and source_id = (select id from public.order_items where order_id = (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'))), 'quantity', 1))))
  ));
$$, 'P0001', 'DISTRIBUTION_ALLOCATION_LOCKED', 'una entrega final no permite cambiar sus allocations');

select throws_ok($$
  select public.list_distribution_inventory_movements(
    'd3300000-0000-4000-8000-000000000002',
    (select id from public.orders where operation_key = 'd3100000-0000-4000-8000-000000000001'),
    null
  );
$$, '42501', 'DISTRIBUTION_FORBIDDEN', 'un usuario no puede leer movimientos de otra organización');
select is(
  has_function_privilege('anon', 'public.list_distribution_inventory_movements(uuid, uuid, uuid)', 'EXECUTE'),
  false,
  'anon no puede consultar movements disponibles'
);
select is(
  (select count(*) from public.inventory_movements where source_type = 'order-dispatch' and source_id = :'line_one'::uuid),
  2::bigint,
  'el flujo completo D3 deja exactamente los dos movements físicos originales'
);
select is(
  (select sum(quantity_consumed) from public.inventory_reservations where source_id = :'line_one'::uuid),
  100.000::numeric,
  'el flujo completo D3 no cambia la salida física ni las reservas'
);

select * from finish();
rollback;
