begin;

select plan(36);

select has_trigger(
  'public', 'repair_parts', 'repair_parts_enforce_available_stock',
  'repair_parts bloquea nuevas reservas no disponibles'
);
select is(
  (
    select convalidated
    from pg_constraint
    where conrelid = 'public.repair_part_consumptions'::regclass
      and conname = 'repair_part_consumptions_available_stock'
  ),
  false,
  'el constraint de consumos conserva datos historicos sin validar'
);
select is(
  (
    select convalidated
    from pg_constraint
    where conrelid = 'public.inventory_movements'::regclass
      and conname = 'inventory_movements_repair_consumption_available'
  ),
  false,
  'el constraint del ledger conserva movimientos historicos sin validar'
);
select ok(
  position(
    'return existing_consumption.id'
    in pg_get_functiondef('public.consume_repair_part(jsonb)'::regprocedure)
  ) < position(
    'REPAIR_PART_STOCK_NOT_ASSIGNABLE'
    in pg_get_functiondef('public.consume_repair_part(jsonb)'::regprocedure)
  ),
  'el guard sanitario se ejecuta despues de resolver la idempotencia'
);

insert into public.organizations (id, name, slug)
values
  ('d1000000-0000-4000-8000-000000000001', 'Reparaciones disponibles', 'reparaciones-disponibles'),
  ('d1000000-0000-4000-8000-000000000002', 'Reparaciones otro tenant', 'reparaciones-otro-tenant');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('d2000000-0000-4000-8000-000000000001', 'repair.available@test.local', '{"full_name":"Repair Available"}', now(), now()),
  ('d2000000-0000-4000-8000-000000000002', 'repair.other.tenant@test.local', '{"full_name":"Repair Other"}', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', now(), now()),
  ('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001'),
  ('d1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'ADMIN'),
  ('d1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'ADMIN');

insert into public.customers (id, organization_id, document_type, document_number, legal_name)
values
  ('d4000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'DNI', '41000001', 'Cliente disponible'),
  ('d4000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'DNI', '41000002', 'Cliente otro tenant');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, serial_control, created_by, updated_by
)
values
  (
    'd5000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'REP-AVAILABLE', 'Repuesto sanitario', 'UND', 20,
    false, false,
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  ),
  (
    'd5000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002',
    'REP-OTHER', 'Repuesto otro tenant', 'UND', 20,
    false, false,
    'd2000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002'
  );

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
)
values
  (
    'd6000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'REPAIR', 'Almacen Reparaciones',
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  ),
  (
    'd6000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002',
    'REPAIR', 'Almacen Otro',
    'd2000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002'
  );

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values
  (
    'd7000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    'R-01', 'Ubicacion Reparaciones',
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  ),
  (
    'd7000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002',
    'd6000000-0000-4000-8000-000000000002',
    'R-01', 'Ubicacion Otro',
    'd2000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002'
  );

insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot, product_code_snapshot,
  product_description_snapshot, created_by, updated_by
)
values
  (
    'd8000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    'in_repair', 'Reserva disponible', 'Cliente disponible', 'DNI 41000001',
    'REP-AVAILABLE', 'Repuesto sanitario',
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  ),
  (
    'd8000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    'in_repair', 'Historico danado', 'Cliente disponible', 'DNI 41000001',
    'REP-AVAILABLE', 'Repuesto sanitario',
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  ),
  (
    'd8000000-0000-4000-8000-000000000003',
    'd1000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    'in_repair', 'Historico en cuarentena', 'Cliente disponible', 'DNI 41000001',
    'REP-AVAILABLE', 'Repuesto sanitario',
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  ),
  (
    'd8000000-0000-4000-8000-000000000004',
    'd1000000-0000-4000-8000-000000000002',
    'd4000000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000002',
    'in_repair', 'Reparacion otro tenant', 'Cliente otro tenant', 'DNI 41000002',
    'REP-OTHER', 'Repuesto otro tenant',
    'd2000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"d3000000-0000-4000-8000-000000000001"}',
  true
);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"d1000000-0000-4000-8000-000000000001",
    "product_id":"d5000000-0000-4000-8000-000000000001",
    "warehouse_id":"d6000000-0000-4000-8000-000000000001",
    "location_id":"d7000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":10,"unit_cost":8,
    "stock_status":"available","operation_date":"2026-08-29",
    "reason":"Stock disponible para Reparaciones"
  }'::jsonb)
$$, 'registra stock available');

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"d1000000-0000-4000-8000-000000000001",
    "product_id":"d5000000-0000-4000-8000-000000000001",
    "warehouse_id":"d6000000-0000-4000-8000-000000000001",
    "location_id":"d7000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":5,"unit_cost":8,
    "stock_status":"damaged","operation_date":"2026-08-29",
    "reason":"Stock danado historico"
  }'::jsonb)
$$, 'registra stock damaged como inventario fisico valido');

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"d1000000-0000-4000-8000-000000000001",
    "product_id":"d5000000-0000-4000-8000-000000000001",
    "warehouse_id":"d6000000-0000-4000-8000-000000000001",
    "location_id":"d7000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":5,"unit_cost":8,
    "stock_status":"quarantine","operation_date":"2026-08-29",
    "reason":"Stock en cuarentena historico"
  }'::jsonb)
$$, 'registra stock quarantine como inventario fisico valido');

select lives_ok($$
  select public.reserve_repair_part('{
    "organization_id":"d1000000-0000-4000-8000-000000000001",
    "repair_id":"d8000000-0000-4000-8000-000000000001",
    "product_id":"d5000000-0000-4000-8000-000000000001",
    "warehouse_id":"d6000000-0000-4000-8000-000000000001",
    "location_id":"d7000000-0000-4000-8000-000000000001",
    "stock_status":"available","quantity_requested":4
  }'::jsonb)
$$, 'reserva stock available por el flujo normal');

select results_eq(
  $$
    select part.stock_status, part.status, reservation.stock_status, reservation.status
    from public.repair_parts part
    join public.inventory_reservations reservation
      on reservation.organization_id = part.organization_id
     and reservation.source_type = 'repair-part'
     and reservation.source_id = part.id
    where part.repair_id = 'd8000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('available'::text, 'reserved'::text, 'available'::text, 'active'::text) $$,
  'la reserva available conserva la proyeccion canonica'
);

select throws_ok($$
  select public.reserve_repair_part('{
    "organization_id":"d1000000-0000-4000-8000-000000000001",
    "repair_id":"d8000000-0000-4000-8000-000000000002",
    "product_id":"d5000000-0000-4000-8000-000000000001",
    "warehouse_id":"d6000000-0000-4000-8000-000000000001",
    "location_id":"d7000000-0000-4000-8000-000000000001",
    "stock_status":"damaged","quantity_requested":2
  }'::jsonb)
$$, 'P0001', 'REPAIR_PART_STOCK_NOT_ASSIGNABLE', 'rechaza reservar stock damaged');

select throws_ok($$
  select public.reserve_repair_part('{
    "organization_id":"d1000000-0000-4000-8000-000000000001",
    "repair_id":"d8000000-0000-4000-8000-000000000003",
    "product_id":"d5000000-0000-4000-8000-000000000001",
    "warehouse_id":"d6000000-0000-4000-8000-000000000001",
    "location_id":"d7000000-0000-4000-8000-000000000001",
    "stock_status":"quarantine","quantity_requested":2
  }'::jsonb)
$$, 'P0001', 'REPAIR_PART_STOCK_NOT_ASSIGNABLE', 'rechaza reservar stock quarantine');

select results_eq(
  $$
    select
      (select count(*) from public.repair_parts where repair_id in (
        'd8000000-0000-4000-8000-000000000002',
        'd8000000-0000-4000-8000-000000000003'
      )),
      (select count(*) from public.repair_events where event_type = 'PART_RESERVED' and repair_id in (
        'd8000000-0000-4000-8000-000000000002',
        'd8000000-0000-4000-8000-000000000003'
      )),
      (select count(*) from public.audit_events where action = 'REPAIR_PART_RESERVED' and entity_id in (
        'd8000000-0000-4000-8000-000000000002',
        'd8000000-0000-4000-8000-000000000003'
      ))
  $$,
  $$ values (0::bigint, 0::bigint, 0::bigint) $$,
  'reservas no disponibles rechazadas no dejan fuente, eventos ni auditoria'
);

reset role;

select throws_ok($$
  insert into public.repair_parts (
    organization_id, repair_id, product_id, product_code_snapshot,
    product_description_snapshot, warehouse_id, location_id, stock_status,
    quantity_requested, created_by, updated_by
  ) values (
    'd1000000-0000-4000-8000-000000000001',
    'd8000000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000001',
    'REP-AVAILABLE', 'Repuesto sanitario',
    'd6000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000001',
    'damaged', 2,
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'REPAIR_PART_STOCK_NOT_ASSIGNABLE', 'bloquea alta directa damaged');

select throws_ok($$
  insert into public.repair_parts (
    organization_id, repair_id, product_id, product_code_snapshot,
    product_description_snapshot, warehouse_id, location_id, stock_status,
    quantity_requested, created_by, updated_by
  ) values (
    'd1000000-0000-4000-8000-000000000001',
    'd8000000-0000-4000-8000-000000000003',
    'd5000000-0000-4000-8000-000000000001',
    'REP-AVAILABLE', 'Repuesto sanitario',
    'd6000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000001',
    'quarantine', 2,
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'REPAIR_PART_STOCK_NOT_ASSIGNABLE', 'bloquea alta directa quarantine');

-- Simula filas creadas antes del hardening. Solo se desactiva el nuevo guard;
-- sincronizacion, proyeccion canonica y demas invariantes siguen activas.
alter table public.repair_parts disable trigger repair_parts_enforce_available_stock;
insert into public.repair_parts (
  id, organization_id, repair_id, product_id, product_code_snapshot,
  product_description_snapshot, warehouse_id, location_id, stock_status,
  quantity_requested, quantity_consumed, status, created_by, updated_by
)
values
  (
    'da000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'd8000000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000001',
    'REP-AVAILABLE', 'Repuesto sanitario',
    'd6000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000001',
    'damaged', 2, 0, 'reserved',
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  ),
  (
    'da000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000001',
    'd8000000-0000-4000-8000-000000000003',
    'd5000000-0000-4000-8000-000000000001',
    'REP-AVAILABLE', 'Repuesto sanitario',
    'd6000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000001',
    'quarantine', 2, 0, 'reserved',
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  );
alter table public.repair_parts enable trigger repair_parts_enforce_available_stock;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"d3000000-0000-4000-8000-000000000001"}',
  true
);

select results_eq(
  $$
    select part.stock_status, part.status, reservation.stock_status, reservation.status
    from public.repair_parts part
    join public.inventory_reservations reservation
      on reservation.organization_id = part.organization_id
     and reservation.source_type = 'repair-part'
     and reservation.source_id = part.id
    where part.id in (
      'da000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000002'
    )
    order by part.stock_status
  $$,
  $$ values
    ('damaged'::text, 'reserved'::text, 'damaged'::text, 'active'::text),
    ('quarantine'::text, 'reserved'::text, 'quarantine'::text, 'active'::text)
  $$,
  'los historicos no disponibles conservan su bucket y proyeccion'
);

select throws_ok($$
  select public.consume_repair_part('{
    "organization_id":"d1000000-0000-4000-8000-000000000001",
    "repair_part_id":"da000000-0000-4000-8000-000000000001",
    "quantity":1,
    "operation_key":"db000000-0000-4000-8000-000000000001"
  }'::jsonb)
$$, 'P0001', 'REPAIR_PART_STOCK_NOT_ASSIGNABLE', 'rechaza consumo historico damaged');

select throws_ok($$
  select public.consume_repair_part('{
    "organization_id":"d1000000-0000-4000-8000-000000000001",
    "repair_part_id":"da000000-0000-4000-8000-000000000002",
    "quantity":1,
    "operation_key":"db000000-0000-4000-8000-000000000002"
  }'::jsonb)
$$, 'P0001', 'REPAIR_PART_STOCK_NOT_ASSIGNABLE', 'rechaza consumo historico quarantine');

select results_eq(
  $$
    select
      (select count(*) from public.inventory_movements where source_type = 'repair-consumption'),
      (select count(*) from public.repair_part_consumptions
       where organization_id = 'd1000000-0000-4000-8000-000000000001'),
      (select count(*) from public.repair_events
       where organization_id = 'd1000000-0000-4000-8000-000000000001'
         and event_type = 'PART_CONSUMED'),
      (select count(*) from public.audit_events
       where organization_id = 'd1000000-0000-4000-8000-000000000001'
         and action = 'REPAIR_PART_CONSUMED'),
      (select coalesce(sum(quantity_consumed), 0) from public.repair_parts where id in (
        'da000000-0000-4000-8000-000000000001',
        'da000000-0000-4000-8000-000000000002'
      )),
      (select array_agg(status order by stock_status) from public.repair_parts where id in (
        'da000000-0000-4000-8000-000000000001',
        'da000000-0000-4000-8000-000000000002'
      )),
      (select array_agg(reservation.status order by part.stock_status)
       from public.repair_parts part
       join public.inventory_reservations reservation
         on reservation.organization_id = part.organization_id
        and reservation.source_type = 'repair-part'
        and reservation.source_id = part.id
       where part.id in (
         'da000000-0000-4000-8000-000000000001',
         'da000000-0000-4000-8000-000000000002'
       ))
  $$,
  $$ values (
    0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::numeric,
    array['reserved', 'reserved']::text[],
    array['active', 'active']::text[]
  ) $$,
  'consumos rechazados no dejan ledger, tracking, eventos, auditoria ni estado'
);

select results_eq(
  $$
    select stock_status, physical_quantity, reserved_quantity, assignable_quantity
    from public.inventory_bucket_availability
    where organization_id = 'd1000000-0000-4000-8000-000000000001'
      and product_id = 'd5000000-0000-4000-8000-000000000001'
      and stock_status in ('damaged', 'quarantine')
    order by stock_status
  $$,
  $$ values
    ('damaged'::text, 5.000::numeric, 2.000::numeric, 0.000::numeric),
    ('quarantine'::text, 5.000::numeric, 2.000::numeric, 0.000::numeric)
  $$,
  'los rechazos conservan fisico y reservas historicas sin asignable'
);

select lives_ok($$
  select public.cancel_repair_part(
    'd1000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000001',
    'Liberacion explicita de historico damaged'
  )
$$, 'permite cancelar historico damaged');

select lives_ok($$
  select public.cancel_repair_part(
    'd1000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000002',
    'Liberacion explicita de historico quarantine'
  )
$$, 'permite cancelar historico quarantine');

select results_eq(
  $$
    select part.stock_status, part.status, reservation.status
    from public.repair_parts part
    join public.inventory_reservations reservation
      on reservation.organization_id = part.organization_id
     and reservation.source_type = 'repair-part'
     and reservation.source_id = part.id
    where part.id in (
      'da000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000002'
    )
    order by part.stock_status
  $$,
  $$ values
    ('damaged'::text, 'cancelled'::text, 'released'::text),
    ('quarantine'::text, 'cancelled'::text, 'released'::text)
  $$,
  'cancelar conserva el estado sanitario historico y libera la proyeccion'
);

select results_eq(
  $$
    select
      (select count(*) from public.repair_events where event_type = 'PART_CANCELLED' and repair_id in (
        'd8000000-0000-4000-8000-000000000002',
        'd8000000-0000-4000-8000-000000000003'
      )),
      (select count(*) from public.audit_events where action = 'REPAIR_PART_CANCELLED' and entity_id in (
        'd8000000-0000-4000-8000-000000000002',
        'd8000000-0000-4000-8000-000000000003'
      ))
  $$,
  $$ values (2::bigint, 2::bigint) $$,
  'la liberacion explicita conserva evento y auditoria'
);

select results_eq(
  $$
    select stock_status, physical_quantity, reserved_quantity, assignable_quantity
    from public.inventory_bucket_availability
    where organization_id = 'd1000000-0000-4000-8000-000000000001'
      and product_id = 'd5000000-0000-4000-8000-000000000001'
      and stock_status in ('damaged', 'quarantine')
    order by stock_status
  $$,
  $$ values
    ('damaged'::text, 5.000::numeric, 0.000::numeric, 0.000::numeric),
    ('quarantine'::text, 5.000::numeric, 0.000::numeric, 0.000::numeric)
  $$,
  'cancelar no altera el fisico no disponible'
);

select lives_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'd1000000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (
      select id from public.repair_parts
      where repair_id = 'd8000000-0000-4000-8000-000000000001'
    ),
    'quantity', 2,
    'operation_key', 'db000000-0000-4000-8000-000000000003'::uuid
  ))
$$, 'consume parcialmente stock available');

select results_eq(
  $$
    select part.quantity_consumed, part.status,
      reservation.quantity_consumed, reservation.status,
      count(movement.id)
    from public.repair_parts part
    join public.inventory_reservations reservation
      on reservation.organization_id = part.organization_id
     and reservation.source_type = 'repair-part'
     and reservation.source_id = part.id
    left join public.inventory_movements movement
      on movement.organization_id = part.organization_id
     and movement.reservation_id = part.id
    where part.repair_id = 'd8000000-0000-4000-8000-000000000001'
    group by part.quantity_consumed, part.status,
      reservation.quantity_consumed, reservation.status
  $$,
  $$ values (2.000::numeric, 'reserved'::text, 2.000::numeric, 'active'::text, 1::bigint) $$,
  'el consumo parcial available sincroniza P1-01'
);

select is(
  public.consume_repair_part(jsonb_build_object(
    'organization_id', 'd1000000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (
      select id from public.repair_parts
      where repair_id = 'd8000000-0000-4000-8000-000000000001'
    ),
    'quantity', 2,
    'operation_key', 'db000000-0000-4000-8000-000000000003'::uuid
  )),
  (
    select id from public.repair_part_consumptions
    where operation_key = 'db000000-0000-4000-8000-000000000003'
  ),
  'reintentar el consumo available conserva idempotencia'
);

select lives_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'd1000000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (
      select id from public.repair_parts
      where repair_id = 'd8000000-0000-4000-8000-000000000001'
    ),
    'quantity', 2,
    'operation_key', 'db000000-0000-4000-8000-000000000004'::uuid
  ))
$$, 'completa el consumo available');

select results_eq(
  $$
    select part.quantity_consumed, part.status,
      reservation.quantity_consumed, reservation.status,
      count(movement.id)
    from public.repair_parts part
    join public.inventory_reservations reservation
      on reservation.organization_id = part.organization_id
     and reservation.source_type = 'repair-part'
     and reservation.source_id = part.id
    left join public.inventory_movements movement
      on movement.organization_id = part.organization_id
     and movement.reservation_id = part.id
    where part.repair_id = 'd8000000-0000-4000-8000-000000000001'
    group by part.quantity_consumed, part.status,
      reservation.quantity_consumed, reservation.status
  $$,
  $$ values (4.000::numeric, 'consumed'::text, 4.000::numeric, 'consumed'::text, 2::bigint) $$,
  'el consumo completo available conserva tracking y proyeccion'
);

select results_eq(
  $$
    select physical_quantity, reserved_quantity, assignable_quantity
    from public.inventory_bucket_availability
    where organization_id = 'd1000000-0000-4000-8000-000000000001'
      and product_id = 'd5000000-0000-4000-8000-000000000001'
      and warehouse_id = 'd6000000-0000-4000-8000-000000000001'
      and location_id = 'd7000000-0000-4000-8000-000000000001'
      and stock_status = 'available'
  $$,
  $$ values (6.000::numeric, 0.000::numeric, 6.000::numeric) $$,
  'el consumo available mantiene saldo canonico sin doble conteo'
);

reset role;

select throws_ok($$
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, operation_date, reason, source_type, source_id, created_by
  ) values (
    'd1000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    'REP-AVAILABLE', 'Repuesto sanitario', 'UND',
    'salida', 1, 'Almacen Reparaciones',
    'd6000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000001',
    'available', 8, current_date, 'Repair consumption sin reserva',
    'repair-consumption', 'dc000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'REPAIR_PART_CONSUMPTION_RPC_REQUIRED', 'repair-consumption exige reserva');

select throws_ok($$
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, operation_date, reason, source_type, source_id, created_by
  ) values (
    'd1000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    'REP-AVAILABLE', 'Repuesto sanitario', 'UND',
    'salida', 1, 'Almacen Reparaciones',
    'd6000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000001',
    'damaged', 8, current_date, 'Repair consumption damaged',
    'repair-consumption', 'dc000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'REPAIR_PART_STOCK_NOT_ASSIGNABLE', 'repair-consumption exige available');

select is(
  (
    select count(*) from public.inventory_movements
    where reason in ('Repair consumption sin reserva', 'Repair consumption damaged')
  ),
  0::bigint,
  'hardening directo no deja movimientos parciales'
);

alter table public.repair_part_consumptions disable trigger repair_part_consumptions_validate;
select throws_ok($$
  insert into public.repair_part_consumptions (
    organization_id, repair_part_id, quantity, warehouse_id, location_id,
    stock_status, unit_cost, inventory_movement_id, operation_key, consumed_by
  ) values (
    'd1000000-0000-4000-8000-000000000001',
    (select id from public.repair_parts where repair_id = 'd8000000-0000-4000-8000-000000000001'),
    1,
    'd6000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000001',
    'damaged', 8,
    (select inventory_movement_id from public.repair_part_consumptions where operation_key = 'db000000-0000-4000-8000-000000000003'),
    'db000000-0000-4000-8000-000000000005',
    'd2000000-0000-4000-8000-000000000001'
  )
$$, '23514', 'new row for relation "repair_part_consumptions" violates check constraint "repair_part_consumptions_available_stock"', 'constraint bloquea consumo directo damaged');
alter table public.repair_part_consumptions enable trigger repair_part_consumptions_validate;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"d3000000-0000-4000-8000-000000000002"}',
  true
);

select throws_ok($$
  select public.consume_repair_part('{
    "organization_id":"d1000000-0000-4000-8000-000000000001",
    "repair_part_id":"da000000-0000-4000-8000-000000000001",
    "quantity":1,
    "operation_key":"db000000-0000-4000-8000-000000000006"
  }'::jsonb)
$$, '42501', 'REPAIR_FORBIDDEN', 'otro tenant no consume reservas ajenas');

select is(
  (
    select count(*) from public.repair_parts
    where organization_id = 'd1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'RLS oculta reservas de otro tenant'
);

select * from finish();
rollback;
