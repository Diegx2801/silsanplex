begin;

select plan(48);

select has_trigger(
  'public', 'repair_parts', 'repair_parts_enforce_inventory_identity',
  'repair_parts protege la identidad de inventario reservada'
);
select has_trigger(
  'public', 'inventory_reservations', 'inventory_reservations_validate_repair_projection',
  'reservas canonicas validan la proyeccion de reparaciones'
);

insert into public.organizations (id, name, slug)
values ('b1000000-0000-4000-8000-000000000001', 'Reserva transversal', 'reserva-transversal');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  (
    'b2000000-0000-4000-8000-000000000001',
    'repair.inventory@test.local',
    '{"full_name":"Repair Inventory"}',
    now(), now()
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'repair.inventory.sales@test.local',
    '{"full_name":"Repair Inventory Sales"}',
    now(), now()
  );

create function pg_temp.repair_lock_version(organization_id uuid, repair_id uuid)
returns bigint
language sql
stable
as $$
  select repair.lock_version
  from public.repairs repair
  where repair.organization_id = organization_id
    and repair.id = repair_id;
$$;

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  (
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    now(), now()
  ),
  (
    'b3000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    now(), now()
  );

insert into public.organization_memberships (organization_id, user_id)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  ),
  (
    'b1000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000002'
  );

insert into public.user_roles (organization_id, user_id, role_code)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'ADMIN'
  ),
  (
    'b1000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000002',
    'VENTAS'
  );

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name
)
values (
  'b4000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'DNI', '40000001', 'Cliente reserva transversal'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, serial_control, created_by, updated_by
)
values (
  'b5000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'REP-CROSS-001', 'Repuesto reserva transversal', 'UND', 20,
  false, false,
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001'
);

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
)
values
  (
    'b6000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'SOURCE', 'Almacen origen',
    'b2000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  ),
  (
    'b6000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    'TARGET', 'Almacen destino',
    'b2000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  );

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values
  (
    'b7000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'b6000000-0000-4000-8000-000000000001',
    'S-01', 'Ubicacion origen',
    'b2000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  ),
  (
    'b7000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    'b6000000-0000-4000-8000-000000000002',
    'T-01', 'Ubicacion destino',
    'b2000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  );

insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot, product_code_snapshot,
  product_description_snapshot, created_by, updated_by
)
values
  (
    'b8000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000001',
    'b5000000-0000-4000-8000-000000000001',
    'in_repair', 'Validar reserva transversal',
    'Cliente reserva transversal', 'DNI 40000001',
    'REP-CROSS-001', 'Repuesto reserva transversal',
    'b2000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  ),
  (
    'b8000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000001',
    'b5000000-0000-4000-8000-000000000001',
    'in_repair', 'Validar liberacion transversal',
    'Cliente reserva transversal', 'DNI 40000001',
    'REP-CROSS-001', 'Repuesto reserva transversal',
    'b2000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  ),
  (
    'b8000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000001',
    'b5000000-0000-4000-8000-000000000001',
    'in_repair', 'Validar consumo sin asignable libre',
    'Cliente reserva transversal', 'DNI 40000001',
    'REP-CROSS-001', 'Repuesto reserva transversal',
    'b2000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b3000000-0000-4000-8000-000000000001"}',
  true
);

select lives_ok($$
  select public.record_inventory_movement('{
    "organization_id":"b1000000-0000-4000-8000-000000000001",
    "product_id":"b5000000-0000-4000-8000-000000000001",
    "warehouse_id":"b6000000-0000-4000-8000-000000000001",
    "location_id":"b7000000-0000-4000-8000-000000000001",
    "movement_type":"entrada","quantity":10,"unit_cost":8,
    "stock_status":"available","operation_date":"2026-08-29",
    "reason":"Stock para reserva transversal"
  }'::jsonb)
$$, 'prepara el stock fisico del bucket');

select lives_ok($$
  select public.reserve_repair_part('{
    "organization_id":"b1000000-0000-4000-8000-000000000001",
    "repair_id":"b8000000-0000-4000-8000-000000000001",
    "product_id":"b5000000-0000-4000-8000-000000000001",
    "warehouse_id":"b6000000-0000-4000-8000-000000000001",
    "location_id":"b7000000-0000-4000-8000-000000000001",
    "stock_status":"available","quantity_requested":4
  }'::jsonb || jsonb_build_object('expected_lock_version', pg_temp.repair_lock_version('b1000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001')))
$$, 'reserva cuatro unidades desde Reparaciones');

select results_eq(
  $$
    select reservation.id = part.id, reservation.source_type,
      reservation.product_id, reservation.warehouse_id, reservation.location_id,
      reservation.quantity, reservation.quantity_consumed, reservation.status
    from public.repair_parts part
    join public.inventory_reservations reservation
      on reservation.organization_id = part.organization_id
     and reservation.source_type = 'repair-part'
     and reservation.source_id = part.id
    where part.repair_id = 'b8000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      true, 'repair-part'::text,
      'b5000000-0000-4000-8000-000000000001'::uuid,
      'b6000000-0000-4000-8000-000000000001'::uuid,
      'b7000000-0000-4000-8000-000000000001'::uuid,
      4.000::numeric, 0.000::numeric, 'active'::text
    )
  $$,
  'la reserva de reparacion tiene una sola proyeccion canonica exacta'
);

select results_eq(
  $$
    select physical_quantity, reserved_quantity, assignable_quantity
    from public.inventory_bucket_availability
    where organization_id = 'b1000000-0000-4000-8000-000000000001'
      and product_id = 'b5000000-0000-4000-8000-000000000001'
      and warehouse_id = 'b6000000-0000-4000-8000-000000000001'
      and location_id = 'b7000000-0000-4000-8000-000000000001'
  $$,
  $$ values (10.000::numeric, 4.000::numeric, 6.000::numeric) $$,
  'la reserva reduce el asignable sin alterar el fisico'
);

select throws_ok($$
  select * from public.plan_inventory_fefo(
    'b1000000-0000-4000-8000-000000000001',
    'b5000000-0000-4000-8000-000000000001',
    'b6000000-0000-4000-8000-000000000001', 7, null
  )
$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'el plan FEFO descuenta la reserva de reparacion');

select throws_ok($$
  select public.record_inventory_fefo_outbound('{
    "organization_id":"b1000000-0000-4000-8000-000000000001",
    "product_id":"b5000000-0000-4000-8000-000000000001",
    "warehouse_id":"b6000000-0000-4000-8000-000000000001",
    "quantity":7,"operation_date":"2026-08-29",
    "reason":"Salida FEFO contra reparacion"
  }'::jsonb)
$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'la salida FEFO no usa stock reservado');

select is(
  (select count(*) from public.inventory_movements where reason = 'Salida FEFO contra reparacion'),
  0::bigint,
  'la salida FEFO rechazada no deja movimientos'
);

select throws_ok($$
  select public.record_inventory_movement('{
    "organization_id":"b1000000-0000-4000-8000-000000000001",
    "product_id":"b5000000-0000-4000-8000-000000000001",
    "warehouse_id":"b6000000-0000-4000-8000-000000000001",
    "location_id":"b7000000-0000-4000-8000-000000000001",
    "movement_type":"salida","quantity":7,"stock_status":"available",
    "operation_date":"2026-08-29","reason":"Salida contra reparacion"
  }'::jsonb)
$$, 'P0001', 'INVENTORY_RESERVED_STOCK', 'la salida manual no usa stock reservado');

select throws_ok($$
  select public.record_inventory_movement('{
    "organization_id":"b1000000-0000-4000-8000-000000000001",
    "product_id":"b5000000-0000-4000-8000-000000000001",
    "warehouse_id":"b6000000-0000-4000-8000-000000000001",
    "location_id":"b7000000-0000-4000-8000-000000000001",
    "movement_type":"ajuste-negativo","quantity":7,"stock_status":"available",
    "operation_date":"2026-08-29","reason":"Ajuste contra reparacion"
  }'::jsonb)
$$, 'P0001', 'INVENTORY_RESERVED_STOCK', 'el ajuste negativo no usa stock reservado');

select throws_ok($$
  select public.transfer_inventory('{
    "organization_id":"b1000000-0000-4000-8000-000000000001",
    "reference":"TR-REPAIR-RESERVED",
    "source_warehouse_id":"b6000000-0000-4000-8000-000000000001",
    "destination_warehouse_id":"b6000000-0000-4000-8000-000000000002",
    "items":[{
      "product_id":"b5000000-0000-4000-8000-000000000001",
      "source_location_id":"b7000000-0000-4000-8000-000000000001",
      "destination_location_id":"b7000000-0000-4000-8000-000000000002",
      "quantity":7,"stock_status":"available"
    }]
  }'::jsonb)
$$, 'P0001', 'INVENTORY_RESERVED_STOCK', 'la transferencia exacta no usa stock reservado');

select is(
  (select count(*) from public.warehouse_transfers where reference = 'TR-REPAIR-RESERVED'),
  0::bigint,
  'la transferencia exacta rechazada revierte su cabecera'
);

select throws_ok($$
  select public.reclassify_inventory('{
    "organization_id":"b1000000-0000-4000-8000-000000000001",
    "product_id":"b5000000-0000-4000-8000-000000000001",
    "warehouse_id":"b6000000-0000-4000-8000-000000000001",
    "location_id":"b7000000-0000-4000-8000-000000000001",
    "source_status":"available","destination_status":"damaged",
    "quantity":7,"reason":"Reclasificacion contra reparacion"
  }'::jsonb)
$$, 'P0001', 'INVENTORY_RESERVED_STOCK', 'la reclasificacion no usa stock reservado');

select throws_ok($$
  select public.transfer_inventory_fefo('{
    "organization_id":"b1000000-0000-4000-8000-000000000001",
    "reference":"TR-REPAIR-FEFO",
    "source_warehouse_id":"b6000000-0000-4000-8000-000000000001",
    "destination_warehouse_id":"b6000000-0000-4000-8000-000000000002",
    "destination_location_id":"b7000000-0000-4000-8000-000000000002",
    "product_id":"b5000000-0000-4000-8000-000000000001",
    "quantity":7
  }'::jsonb)
$$, 'P0001', 'INVENTORY_FEFO_INSUFFICIENT_STOCK', 'la transferencia FEFO no usa stock reservado');

select is(
  (select count(*) from public.warehouse_transfers where reference = 'TR-REPAIR-FEFO'),
  0::bigint,
  'la transferencia FEFO rechazada no deja cabecera'
);

reset role;

select throws_ok($$
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, operation_date, reason, created_by
  ) values (
    'b1000000-0000-4000-8000-000000000001',
    'b5000000-0000-4000-8000-000000000001',
    'REP-CROSS-001', 'Repuesto reserva transversal', 'UND',
    'salida', 7, 'Almacen origen',
    'b6000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000001',
    'available', 8, current_date, 'Insercion directa contra reparacion',
    'b2000000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'INVENTORY_RESERVED_STOCK', 'la barrera protege la reserva ante insercion directa');

select throws_ok($$
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, operation_date, reason, source_type, reservation_id, created_by
  ) values (
    'b1000000-0000-4000-8000-000000000001',
    'b5000000-0000-4000-8000-000000000001',
    'REP-CROSS-001', 'Repuesto reserva transversal', 'UND',
    'salida', 1, 'Almacen origen',
    'b6000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000001',
    'available', 8, current_date, 'Apropiacion manual de reserva', 'manual',
    (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000001'),
    'b2000000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'REPAIR_PART_CONSUMPTION_RPC_REQUIRED', 'un movimiento manual no se apropia de la reserva');

select throws_ok($$
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, operation_date, reason, source_type, source_id, reservation_id, created_by
  ) values (
    'b1000000-0000-4000-8000-000000000001',
    'b5000000-0000-4000-8000-000000000001',
    'REP-CROSS-001', 'Repuesto reserva transversal', 'UND',
    'salida', 1, 'Almacen origen',
    'b6000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000001',
    'available', 8, current_date, 'Consumo de reparacion directo',
    'repair-consumption', 'ba000000-0000-4000-8000-000000000001',
    (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000001'),
    'b2000000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'REPAIR_PART_CONSUMPTION_RPC_REQUIRED', 'declarar repair-consumption no evita el RPC especializado');

select throws_ok($outer$
  do $inner$
  begin
    perform set_config('app.repair_consumption_tracking_write', 'true', true);
    insert into public.inventory_movements (
      id, organization_id, product_id, product_code, product_description,
      unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
      location_id, stock_status, unit_cost, operation_date, reason, source_type,
      source_id, reservation_id, created_by
    ) values (
      'bb000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      'b5000000-0000-4000-8000-000000000001',
      'REP-CROSS-001', 'Repuesto reserva transversal', 'UND',
      'salida', 1, 'Almacen origen',
      'b6000000-0000-4000-8000-000000000001',
      'b7000000-0000-4000-8000-000000000001',
      'available', 8, current_date, 'Consumo con GUC falsificado',
      'repair-consumption', 'bc000000-0000-4000-8000-000000000001',
      (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000001'),
      'b2000000-0000-4000-8000-000000000001'
    );
    execute 'set constraints inventory_movements_validate_repair_reservation_tracking immediate';
  end;
  $inner$
$outer$, 'P0001', 'REPAIR_PART_CONSUMPTION_TRACKING_REQUIRED', 'el tracking diferido rechaza incluso un GUC falsificado');

select set_config('app.repair_consumption_tracking_write', 'false', true);

select throws_ok($$
  update public.repair_parts
  set quantity_requested = 5
  where repair_id = 'b8000000-0000-4000-8000-000000000001'
$$, 'P0001', 'REPAIR_PART_INVENTORY_IDENTITY_IMMUTABLE', 'no se altera la cantidad fuente despues de reservar');

select throws_ok($$
  delete from public.repair_parts
  where repair_id = 'b8000000-0000-4000-8000-000000000001'
$$, 'P0001', 'REPAIR_PART_DELETE_FORBIDDEN', 'no se elimina la fuente de una reserva canonica');

select throws_ok($$
  update public.inventory_reservations
  set quantity = 3
  where source_type = 'repair-part'
    and source_id = (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000001')
$$, 'P0001', 'REPAIR_INVENTORY_RESERVATION_PROJECTION_MISMATCH', 'no se altera la cantidad proyectada directamente');

select throws_ok($$
  update public.inventory_reservations
  set status = 'released'
  where source_type = 'repair-part'
    and source_id = (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000001')
$$, 'P0001', 'REPAIR_INVENTORY_RESERVATION_PROJECTION_MISMATCH', 'no se libera solo la proyeccion canonica');

select throws_ok($$
  delete from public.inventory_reservations
  where source_type = 'repair-part'
    and source_id = (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000001')
$$, 'P0001', 'REPAIR_INVENTORY_RESERVATION_DELETE_FORBIDDEN', 'no se elimina la proyeccion de una reparacion');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b3000000-0000-4000-8000-000000000001"}',
  true
);

select results_eq(
  $$
    select physical_quantity
    from public.inventory_bucket_availability
    where organization_id = 'b1000000-0000-4000-8000-000000000001'
      and product_id = 'b5000000-0000-4000-8000-000000000001'
      and warehouse_id = 'b6000000-0000-4000-8000-000000000001'
      and location_id = 'b7000000-0000-4000-8000-000000000001'
  $$,
  $$ values (10.000::numeric) $$,
  'los rechazos transversales no cambian el fisico'
);

select lives_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'b1000000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000001'),
    'expected_lock_version', pg_temp.repair_lock_version('b1000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001'),
    'quantity', 2,
    'operation_key', 'b9000000-0000-4000-8000-000000000001'::uuid
  ))
$$, 'el consumo parcial usa su propia reserva');

select results_eq(
  $$
    select reservation.quantity, reservation.quantity_consumed, reservation.status
    from public.inventory_reservations reservation
    where reservation.source_type = 'repair-part'
      and reservation.source_id = (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000001')
  $$,
  $$ values (4.000::numeric, 2.000::numeric, 'active'::text) $$,
  'el consumo parcial sincroniza la reserva canonica'
);

select results_eq(
  $$
    select movement.reservation_id = part.id, movement.quantity
    from public.inventory_movements movement
    join public.repair_part_consumptions consumption
      on consumption.organization_id = movement.organization_id
     and consumption.inventory_movement_id = movement.id
    join public.repair_parts part
      on part.organization_id = consumption.organization_id
     and part.id = consumption.repair_part_id
    where consumption.operation_key = 'b9000000-0000-4000-8000-000000000001'
  $$,
  $$ values (true, 2.000::numeric) $$,
  'el movimiento consume la reserva propia sin doble conteo'
);

select results_eq(
  $$
    select physical_quantity, reserved_quantity, assignable_quantity
    from public.inventory_bucket_availability
    where organization_id = 'b1000000-0000-4000-8000-000000000001'
      and product_id = 'b5000000-0000-4000-8000-000000000001'
      and warehouse_id = 'b6000000-0000-4000-8000-000000000001'
      and location_id = 'b7000000-0000-4000-8000-000000000001'
  $$,
  $$ values (8.000::numeric, 2.000::numeric, 6.000::numeric) $$,
  'el consumo parcial conserva seis unidades asignables'
);

select lives_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'b1000000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000001'),
    'expected_lock_version', pg_temp.repair_lock_version('b1000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001'),
    'quantity', 2,
    'operation_key', 'b9000000-0000-4000-8000-000000000002'::uuid
  ))
$$, 'el consumo final completa la reserva propia');

select results_eq(
  $$
    select reservation.quantity, reservation.quantity_consumed, reservation.status
    from public.inventory_reservations reservation
    where reservation.source_type = 'repair-part'
      and reservation.source_id = (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000001')
  $$,
  $$ values (4.000::numeric, 4.000::numeric, 'consumed'::text) $$,
  'el consumo total cierra la proyeccion canonica'
);

select results_eq(
  $$
    select physical_quantity, reserved_quantity, assignable_quantity
    from public.inventory_bucket_availability
    where organization_id = 'b1000000-0000-4000-8000-000000000001'
      and product_id = 'b5000000-0000-4000-8000-000000000001'
      and warehouse_id = 'b6000000-0000-4000-8000-000000000001'
      and location_id = 'b7000000-0000-4000-8000-000000000001'
  $$,
  $$ values (6.000::numeric, 0.000::numeric, 6.000::numeric) $$,
  'el consumo total no descuenta dos veces la reserva'
);

select lives_ok($$
  select public.reserve_repair_part('{
    "organization_id":"b1000000-0000-4000-8000-000000000001",
    "repair_id":"b8000000-0000-4000-8000-000000000002",
    "product_id":"b5000000-0000-4000-8000-000000000001",
    "warehouse_id":"b6000000-0000-4000-8000-000000000001",
    "location_id":"b7000000-0000-4000-8000-000000000001",
    "stock_status":"available","quantity_requested":2
  }'::jsonb || jsonb_build_object('expected_lock_version', pg_temp.repair_lock_version('b1000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000002')))
$$, 'crea otra reserva para validar liberacion');

select results_eq(
  $$
    select physical_quantity, reserved_quantity, assignable_quantity
    from public.inventory_bucket_availability
    where organization_id = 'b1000000-0000-4000-8000-000000000001'
      and product_id = 'b5000000-0000-4000-8000-000000000001'
      and warehouse_id = 'b6000000-0000-4000-8000-000000000001'
      and location_id = 'b7000000-0000-4000-8000-000000000001'
  $$,
  $$ values (6.000::numeric, 2.000::numeric, 4.000::numeric) $$,
  'la segunda reserva vuelve a reducir el asignable'
);

select lives_ok($$
  select public.cancel_repair_part(
    'b1000000-0000-4000-8000-000000000001',
    (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000002'),
    'Parte no requerida',
    pg_temp.repair_lock_version('b1000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000002')
  )
$$, 'cancelar la parte libera la reserva');

select results_eq(
  $$
    select reservation.quantity, reservation.quantity_consumed, reservation.status
    from public.inventory_reservations reservation
    where reservation.source_type = 'repair-part'
      and reservation.source_id = (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000002')
  $$,
  $$ values (2.000::numeric, 0.000::numeric, 'released'::text) $$,
  'cancelar sincroniza el estado released canonico'
);

select results_eq(
  $$
    select physical_quantity, reserved_quantity, assignable_quantity
    from public.inventory_bucket_availability
    where organization_id = 'b1000000-0000-4000-8000-000000000001'
      and product_id = 'b5000000-0000-4000-8000-000000000001'
      and warehouse_id = 'b6000000-0000-4000-8000-000000000001'
      and location_id = 'b7000000-0000-4000-8000-000000000001'
  $$,
  $$ values (6.000::numeric, 0.000::numeric, 6.000::numeric) $$,
  'liberar restaura todo el stock fisico restante como asignable'
);

select lives_ok($$
  select public.reserve_repair_part('{
    "organization_id":"b1000000-0000-4000-8000-000000000001",
    "repair_id":"b8000000-0000-4000-8000-000000000003",
    "product_id":"b5000000-0000-4000-8000-000000000001",
    "warehouse_id":"b6000000-0000-4000-8000-000000000001",
    "location_id":"b7000000-0000-4000-8000-000000000001",
    "stock_status":"available","quantity_requested":6
  }'::jsonb || jsonb_build_object('expected_lock_version', pg_temp.repair_lock_version('b1000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000003')))
$$, 'permite reservar todo el stock asignable restante');

select lives_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'b1000000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000003'),
    'expected_lock_version', pg_temp.repair_lock_version('b1000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000003'),
    'quantity', 3,
    'operation_key', 'b9000000-0000-4000-8000-000000000003'::uuid
  ))
$$, 'el consumo parcial sincroniza un bucket totalmente reservado');

select results_eq(
  $$
    select availability.physical_quantity, availability.reserved_quantity,
      availability.assignable_quantity, reservation.quantity,
      reservation.quantity_consumed, reservation.status
    from public.inventory_bucket_availability availability
    join public.inventory_reservations reservation
      on reservation.organization_id = availability.organization_id
     and reservation.product_id = availability.product_id
     and reservation.warehouse_id = availability.warehouse_id
     and reservation.location_id = availability.location_id
     and reservation.stock_status = availability.stock_status
     and lower(coalesce(reservation.lot, '')) = availability.normalized_lot
     and reservation.expiration_date is not distinct from availability.expiration_date
    where availability.organization_id = 'b1000000-0000-4000-8000-000000000001'
      and availability.product_id = 'b5000000-0000-4000-8000-000000000001'
      and reservation.source_type = 'repair-part'
      and reservation.source_id = (select id from public.repair_parts where repair_id = 'b8000000-0000-4000-8000-000000000003')
  $$,
  $$ values (3.000::numeric, 3.000::numeric, 0.000::numeric, 6.000::numeric, 3.000::numeric, 'active'::text) $$,
  'el consumo ajusta fisico y reserva sin exigir asignable libre adicional'
);

-- Simula una cotizacion pendiente historica con una reserva parcialmente
-- consumida. El flujo publico actual no vuelve desde in_repair a cotizacion.
reset role;
alter table public.repairs disable trigger repairs_protect_status_transition;
update public.repairs
set status = 'waiting_customer_approval'
where id = 'b8000000-0000-4000-8000-000000000003';
alter table public.repairs enable trigger repairs_protect_status_transition;

insert into public.repair_quotes (
  id, organization_id, repair_id, version_number, status, is_current, created_by, updated_by
) values (
  'ba000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b8000000-0000-4000-8000-000000000003',
  1, 'pending', true,
  'b2000000-0000-4000-8000-000000000002',
  'b2000000-0000-4000-8000-000000000002'
);

update public.warehouse_locations
set is_active = false
where id = 'b7000000-0000-4000-8000-000000000001';
update public.warehouses
set is_active = false
where id = 'b6000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b3000000-0000-4000-8000-000000000002"}',
  true
);

select results_eq(
  $$
    select
      public.has_organization_permission(
        'b1000000-0000-4000-8000-000000000001', 'REPAIRS_APPROVE_QUOTE'
      ),
      public.has_organization_permission(
        'b1000000-0000-4000-8000-000000000001', 'REPAIRS_USE_PARTS'
      )
  $$,
  $$ values (true, false) $$,
  'VENTAS puede rechazar cotizaciones sin administrar repuestos'
);

select lives_ok($$
  select public.reject_repair_quote(
    'b1000000-0000-4000-8000-000000000001',
    'b8000000-0000-4000-8000-000000000003',
    'ba000000-0000-4000-8000-000000000001',
    'Cliente rechaza reparacion con reserva parcial',
    pg_temp.repair_lock_version('b1000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000003')
  )
$$, 'rechazar libera la reserva aunque almacen y ubicacion esten inactivos');

select results_eq(
  $$
    select repair.status, quote.status, part.status,
      part.quantity_requested, part.quantity_consumed,
      reservation.status, reservation.quantity_consumed
    from public.repairs repair
    join public.repair_quotes quote
      on quote.organization_id = repair.organization_id
     and quote.repair_id = repair.id
    join public.repair_parts part
      on part.organization_id = repair.organization_id
     and part.repair_id = repair.id
    join public.inventory_reservations reservation
      on reservation.organization_id = part.organization_id
     and reservation.source_type = 'repair-part'
     and reservation.source_id = part.id
    where repair.id = 'b8000000-0000-4000-8000-000000000003'
  $$,
  $$ values (
    'rejected'::text, 'rejected'::text, 'cancelled'::text,
    6.000::numeric, 3.000::numeric, 'released'::text, 3.000::numeric
  ) $$,
  'el rechazo conserva el consumo y libera solo el saldo pendiente'
);

select results_eq(
  $$
    select physical_quantity, reserved_quantity, assignable_quantity
    from public.inventory_bucket_availability
    where organization_id = 'b1000000-0000-4000-8000-000000000001'
      and product_id = 'b5000000-0000-4000-8000-000000000001'
      and warehouse_id = 'b6000000-0000-4000-8000-000000000001'
      and location_id = 'b7000000-0000-4000-8000-000000000001'
      and stock_status = 'available'
      and normalized_lot = ''
      and expiration_date is null
  $$,
  $$ values (3.000::numeric, 0.000::numeric, 3.000::numeric) $$,
  'liberar no revierte el consumo fisico y restaura el asignable restante'
);

select results_eq(
  $$
    select count(*), sum(consumption.quantity),
      count(movement.id), sum(movement.quantity)
    from public.repair_part_consumptions consumption
    join public.repair_parts part
      on part.organization_id = consumption.organization_id
     and part.id = consumption.repair_part_id
    join public.inventory_movements movement
      on movement.organization_id = consumption.organization_id
     and movement.id = consumption.inventory_movement_id
    where part.repair_id = 'b8000000-0000-4000-8000-000000000003'
  $$,
  $$ values (1::bigint, 3.000::numeric, 1::bigint, 3.000::numeric) $$,
  'el rechazo no altera consumos ni movimientos historicos'
);

select results_eq(
  $$
    select event.actor_user_id, event.metadata ->> 'source',
      event.metadata ->> 'quote_id',
      (event.metadata ->> 'released_quantity')::numeric
    from public.repair_events event
    where event.repair_id = 'b8000000-0000-4000-8000-000000000003'
      and event.event_type = 'PART_CANCELLED'
  $$,
  $$ values (
    'b2000000-0000-4000-8000-000000000002'::uuid,
    'quote_rejection'::text,
    'ba000000-0000-4000-8000-000000000001'::text,
    3.000::numeric
  ) $$,
  'la liberacion identifica actor, cotizacion, origen y cantidad'
);

reset role;
select results_eq(
  $$
    select count(*), bool_and(
      audit.actor_user_id = 'b2000000-0000-4000-8000-000000000002'
    )
    from public.audit_events audit
    where audit.entity_id = 'b8000000-0000-4000-8000-000000000003'
      and audit.action = 'REPAIR_PART_CANCELLED'
      and audit.metadata ->> 'source' = 'quote_rejection'
  $$,
  $$ values (
    1::bigint,
    true
  ) $$,
  'la liberacion por rechazo deja una auditoria atribuida a VENTAS'
);

select * from finish();
rollback;
