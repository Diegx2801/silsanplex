begin;

select plan(66);

select has_column(
  'public', 'repairs', 'current_test_cycle_number',
  'repairs identifica el ciclo vigente'
);
select has_column(
  'public', 'repair_tests', 'test_cycle_number',
  'repair_tests conserva el ciclo de cada intento'
);
select has_function(
  'public', 'assert_repair_ready_for_delivery', array['uuid', 'uuid'],
  'existe un gate canonico de ready'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.assert_repair_ready_for_delivery(uuid, uuid)'::regprocedure),
  true,
  'el gate canonico es security definer'
);
select is(
  has_function_privilege('authenticated', 'public.assert_repair_ready_for_delivery(uuid, uuid)', 'EXECUTE'),
  false,
  'authenticated no invoca directamente el gate interno'
);
select has_trigger(
  'public', 'repair_tests', 'repair_tests_enforce_current_cycle',
  'un trigger protege la asociacion de nuevas pruebas'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.repair_tests'::regclass),
  true,
  'repair_tests conserva RLS'
);
select ok(
  position('for update' in lower(pg_get_functiondef('public.change_repair_status_unchecked(uuid, uuid, text, text)'::regprocedure))) > 0
  and position('for update' in lower(pg_get_functiondef('public.record_repair_test_unchecked(jsonb)'::regprocedure))) > 0
  and position('for update' in lower(pg_get_functiondef('public.deliver_repair_unchecked(uuid, uuid, text)'::regprocedure))) > 0,
  'estado, prueba y entrega conservan el lock de la reparacion'
);
select ok(
  position('test_cycle_number' in pg_get_functiondef('public.record_repair_test_unchecked(jsonb)'::regprocedure)) > 0,
  'record_repair_test asigna explicitamente el ciclo vigente'
);

insert into public.organizations (id, name, slug)
values
  ('e1100000-0000-4000-8000-000000000001', 'Ciclos reparacion uno', 'ciclos-reparacion-uno'),
  ('e1100000-0000-4000-8000-000000000002', 'Ciclos reparacion dos', 'ciclos-reparacion-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('e1200000-0000-4000-8000-000000000001', 'cycle.admin.one@test.local', '{"full_name":"Cycle Admin One"}', now(), now()),
  ('e1200000-0000-4000-8000-000000000002', 'cycle.admin.two@test.local', '{"full_name":"Cycle Admin Two"}', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('e1300000-0000-4000-8000-000000000001', 'e1200000-0000-4000-8000-000000000001', now(), now()),
  ('e1300000-0000-4000-8000-000000000002', 'e1200000-0000-4000-8000-000000000002', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('e1100000-0000-4000-8000-000000000001', 'e1200000-0000-4000-8000-000000000001'),
  ('e1100000-0000-4000-8000-000000000002', 'e1200000-0000-4000-8000-000000000002');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('e1100000-0000-4000-8000-000000000001', 'e1200000-0000-4000-8000-000000000001', 'ADMIN'),
  ('e1100000-0000-4000-8000-000000000002', 'e1200000-0000-4000-8000-000000000002', 'ADMIN');

insert into public.customers (id, organization_id, document_type, document_number, legal_name)
values
  ('e1400000-0000-4000-8000-000000000001', 'e1100000-0000-4000-8000-000000000001', 'DNI', '51000001', 'Cliente ciclos uno'),
  ('e1400000-0000-4000-8000-000000000002', 'e1100000-0000-4000-8000-000000000002', 'DNI', '51000002', 'Cliente ciclos dos');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, expiration_control, serial_control, created_by, updated_by
)
values
  (
    'e1500000-0000-4000-8000-000000000001',
    'e1100000-0000-4000-8000-000000000001',
    'CYCLE-001', 'Producto para ciclos', 'UND', 10, false, false, false,
    'e1200000-0000-4000-8000-000000000001',
    'e1200000-0000-4000-8000-000000000001'
  ),
  (
    'e1500000-0000-4000-8000-000000000002',
    'e1100000-0000-4000-8000-000000000002',
    'CYCLE-002', 'Producto para otro tenant', 'UND', 10, false, false, false,
    'e1200000-0000-4000-8000-000000000002',
    'e1200000-0000-4000-8000-000000000002'
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

create function pg_temp.with_repair_version(payload jsonb)
returns jsonb
language sql
stable
as $$
  select payload || jsonb_build_object(
    'expected_lock_version', pg_temp.repair_lock_version(
      nullif(payload ->> 'organization_id', '')::uuid,
      nullif(payload ->> 'repair_id', '')::uuid
    )
  );
$$;

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values (
  'e1600000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001',
  'CYCLE', 'Almacen ciclos',
  'e1200000-0000-4000-8000-000000000001',
  'e1200000-0000-4000-8000-000000000001'
);

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values (
  'e1700000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001',
  'e1600000-0000-4000-8000-000000000001',
  'C-01', 'Ubicacion ciclos',
  'e1200000-0000-4000-8000-000000000001',
  'e1200000-0000-4000-8000-000000000001'
);

insert into public.inventory_movements (
  organization_id, product_id, product_code, product_description, unit_of_measure,
  movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
  unit_cost, operation_date, reason, source_type, created_by
)
values (
  'e1100000-0000-4000-8000-000000000001',
  'e1500000-0000-4000-8000-000000000001',
  'CYCLE-001', 'Producto para ciclos', 'UND', 'entrada', 10,
  'Almacen ciclos', 'e1600000-0000-4000-8000-000000000001',
  'e1700000-0000-4000-8000-000000000001', 'available', 5,
  current_date, 'Stock para gate de repuestos', 'manual',
  'e1200000-0000-4000-8000-000000000001'
);

insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  assigned_technician_id, customer_name_snapshot, customer_document_snapshot,
  product_code_snapshot, product_description_snapshot, created_by, updated_by
)
values
  (
    'e1800000-0000-4000-8000-000000000001',
    'e1100000-0000-4000-8000-000000000001',
    'e1400000-0000-4000-8000-000000000001',
    'e1500000-0000-4000-8000-000000000001', 'in_repair',
    'Recuperacion entre ciclos', 'e1200000-0000-4000-8000-000000000001',
    'Cliente ciclos uno', 'DNI 51000001', 'CYCLE-001', 'Producto para ciclos',
    'e1200000-0000-4000-8000-000000000001', 'e1200000-0000-4000-8000-000000000001'
  ),
  (
    'e1800000-0000-4000-8000-000000000002',
    'e1100000-0000-4000-8000-000000000001',
    'e1400000-0000-4000-8000-000000000001',
    'e1500000-0000-4000-8000-000000000001', 'in_repair',
    'Ciclo sin pruebas', 'e1200000-0000-4000-8000-000000000001',
    'Cliente ciclos uno', 'DNI 51000001', 'CYCLE-001', 'Producto para ciclos',
    'e1200000-0000-4000-8000-000000000001', 'e1200000-0000-4000-8000-000000000001'
  ),
  (
    'e1800000-0000-4000-8000-000000000003',
    'e1100000-0000-4000-8000-000000000001',
    'e1400000-0000-4000-8000-000000000001',
    'e1500000-0000-4000-8000-000000000001', 'in_repair',
    'Aprobada en ciclo anterior', 'e1200000-0000-4000-8000-000000000001',
    'Cliente ciclos uno', 'DNI 51000001', 'CYCLE-001', 'Producto para ciclos',
    'e1200000-0000-4000-8000-000000000001', 'e1200000-0000-4000-8000-000000000001'
  ),
  (
    'e1800000-0000-4000-8000-000000000004',
    'e1100000-0000-4000-8000-000000000001',
    'e1400000-0000-4000-8000-000000000001',
    'e1500000-0000-4000-8000-000000000001', 'in_repair',
    'Sin tecnico asignado', null,
    'Cliente ciclos uno', 'DNI 51000001', 'CYCLE-001', 'Producto para ciclos',
    'e1200000-0000-4000-8000-000000000001', 'e1200000-0000-4000-8000-000000000001'
  ),
  (
    'e1800000-0000-4000-8000-000000000005',
    'e1100000-0000-4000-8000-000000000001',
    'e1400000-0000-4000-8000-000000000001',
    'e1500000-0000-4000-8000-000000000001', 'in_repair',
    'Parte pendiente', 'e1200000-0000-4000-8000-000000000001',
    'Cliente ciclos uno', 'DNI 51000001', 'CYCLE-001', 'Producto para ciclos',
    'e1200000-0000-4000-8000-000000000001', 'e1200000-0000-4000-8000-000000000001'
  ),
  (
    'e1800000-0000-4000-8000-000000000006',
    'e1100000-0000-4000-8000-000000000001',
    'e1400000-0000-4000-8000-000000000001',
    'e1500000-0000-4000-8000-000000000001', 'in_repair',
    'Revalidacion en entrega', 'e1200000-0000-4000-8000-000000000001',
    'Cliente ciclos uno', 'DNI 51000001', 'CYCLE-001', 'Producto para ciclos',
    'e1200000-0000-4000-8000-000000000001', 'e1200000-0000-4000-8000-000000000001'
  ),
  (
    'e1800000-0000-4000-8000-000000000007',
    'e1100000-0000-4000-8000-000000000002',
    'e1400000-0000-4000-8000-000000000002',
    'e1500000-0000-4000-8000-000000000002', 'in_repair',
    'Reparacion otro tenant', 'e1200000-0000-4000-8000-000000000002',
    'Cliente ciclos dos', 'DNI 51000002', 'CYCLE-002', 'Producto para otro tenant',
    'e1200000-0000-4000-8000-000000000002', 'e1200000-0000-4000-8000-000000000002'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated","session_id":"e1300000-0000-4000-8000-000000000001"}',
  true
);

select lives_ok($$
  select public.change_repair_status(
    'e1100000-0000-4000-8000-000000000001',
    'e1800000-0000-4000-8000-000000000001', 'testing', 'Ciclo inicial',
    pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000001')
  )
$$, 'entrar a testing inicia el ciclo 1');
select results_eq(
  $$
    select repair.current_test_cycle_number,
      (event.metadata ->> 'test_cycle_number')::integer
    from public.repairs repair
    join public.repair_events event
      on event.organization_id = repair.organization_id
     and event.repair_id = repair.id
     and event.event_type = 'STATUS_CHANGED'
     and event.to_status = 'testing'
    where repair.id = 'e1800000-0000-4000-8000-000000000001'
  $$,
  $$ values (1, 1) $$,
  'estado y evento identifican el ciclo 1'
);
select throws_ok($$
  select public.change_repair_status(
    'e1100000-0000-4000-8000-000000000001',
    'e1800000-0000-4000-8000-000000000001', 'testing', 'No inicia otro ciclo',
    pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000001')
  )
$$, 'P0001', 'REPAIR_STATUS_TRANSITION_INVALID', 'testing a testing no representa una nueva entrada');
select is(
  (select current_test_cycle_number from public.repairs where id = 'e1800000-0000-4000-8000-000000000001'),
  1,
  'una transicion testing a testing rechazada no incrementa el ciclo'
);
select lives_ok($$
  select public.record_repair_test(pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000001","test_type":"Seguridad","result":"Falla inicial","passed":false,"performed_by":"e1200000-0000-4000-8000-000000000001","notes":"Requiere correccion"}'::jsonb))
$$, 'registra FAILED en ciclo 1');
select results_eq(
  $$
    select test_cycle_number, test_type, result, passed, notes
    from public.repair_tests
    where repair_id = 'e1800000-0000-4000-8000-000000000001'
  $$,
  $$ values (1, 'Seguridad'::text, 'Falla inicial'::text, false, 'Requiere correccion'::text) $$,
  'FAILED conserva ciclo, tipo, resultado y notas'
);
select throws_ok($$
  select public.change_repair_status(
    'e1100000-0000-4000-8000-000000000001',
    'e1800000-0000-4000-8000-000000000001', 'ready_for_delivery', null,
    pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000001')
  )
$$, 'P0001', 'REPAIR_FAILED_TEST_PRESENT', 'FAILED vigente bloquea ready');
select is(
  (select status from public.repairs where id = 'e1800000-0000-4000-8000-000000000001'),
  'testing'::text,
  'el rechazo no cambia indebidamente el estado'
);
select lives_ok($$
  select public.change_repair_status(
    'e1100000-0000-4000-8000-000000000001',
    'e1800000-0000-4000-8000-000000000001', 'in_repair', 'Corregir falla',
    pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000001')
  )
$$, 'FAILED puede volver a reparacion');
select lives_ok($$
  select public.change_repair_status(
    'e1100000-0000-4000-8000-000000000001',
    'e1800000-0000-4000-8000-000000000001', 'testing', 'Retest',
    pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000001')
  )
$$, 'reentrar a testing inicia ciclo 2');
select results_eq(
  $$
    select current_test_cycle_number,
      (select max((event.metadata ->> 'test_cycle_number')::integer)
       from public.repair_events event
       where event.repair_id = repair.id
         and event.event_type = 'STATUS_CHANGED'
         and event.to_status = 'testing')
    from public.repairs repair
    where id = 'e1800000-0000-4000-8000-000000000001'
  $$,
  $$ values (2, 2) $$,
  'reparacion y eventos avanzan al ciclo 2'
);
select lives_ok($$
  select public.record_repair_test(pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000001","test_type":"Seguridad","result":"Correccion validada","passed":true,"performed_by":"e1200000-0000-4000-8000-000000000001","notes":"Retest aprobado"}'::jsonb))
$$, 'registra PASSED en ciclo 2');
select lives_ok($$
  select public.change_repair_status(
    'e1100000-0000-4000-8000-000000000001',
    'e1800000-0000-4000-8000-000000000001', 'ready_for_delivery', 'Ciclo vigente aprobado',
    pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000001')
  )
$$, 'FAILED historico no bloquea el ciclo 2 aprobado');
select results_eq(
  $$
    select test_cycle_number, passed, result
    from public.repair_tests
    where repair_id = 'e1800000-0000-4000-8000-000000000001'
    order by test_cycle_number
  $$,
  $$ values
    (1, false, 'Falla inicial'::text),
    (2, true, 'Correccion validada'::text)
  $$,
  'ambos intentos permanecen en repair_tests'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'e1800000-0000-4000-8000-000000000001' and event_type = 'TEST_COMPLETED'),
  2::bigint,
  'ambos intentos permanecen en repair_events'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'e1800000-0000-4000-8000-000000000001' and action = 'REPAIR_TEST_COMPLETED'),
  2::bigint,
  'ambos intentos permanecen en auditoria'
);
select is(
  (select count(*) from public.repair_tests where repair_id = 'e1800000-0000-4000-8000-000000000001' and test_cycle_number = 1 and not passed),
  1::bigint,
  'el FAILED historico no se elimina ni reescribe'
);
select lives_ok($$
  select public.deliver_repair(
    'e1100000-0000-4000-8000-000000000001',
    'e1800000-0000-4000-8000-000000000001', 'Entrega tras retest',
    pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000001')
  )
$$, 'deliver_repair acepta el ciclo vigente aprobado');
select is(
  (select status from public.repairs where id = 'e1800000-0000-4000-8000-000000000001'),
  'delivered'::text,
  'el flujo recuperado termina en delivered'
);

select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000002', 'testing', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000002'))
$$, 'abre un ciclo sin pruebas');
select throws_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000002', 'ready_for_delivery', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000002'))
$$, 'P0001', 'REPAIR_APPROVED_TEST_REQUIRED', 'cero pruebas bloquea ready');

select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000003', 'testing', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000003'))
$$, 'abre ciclo 1 para prueba aprobada historica');
select lives_ok($$
  select public.record_repair_test(pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000003","test_type":"Operacion","result":"Aprobada ciclo 1","passed":true}'::jsonb))
$$, 'registra PASSED en ciclo 1');
select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000003', 'in_repair', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000003'))
$$, 'vuelve a reparacion tras ciclo aprobado');
select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000003', 'testing', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000003'))
$$, 'abre ciclo 2 independiente');
select throws_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000003', 'ready_for_delivery', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000003'))
$$, 'P0001', 'REPAIR_APPROVED_TEST_REQUIRED', 'PASSED anterior no satisface el ciclo nuevo');

select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000004', 'testing', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000004'))
$$, 'abre ciclo sin tecnico asignado');
select lives_ok($$
  select public.record_repair_test(pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000004","test_type":"Operacion","result":"Aprobada","passed":true}'::jsonb))
$$, 'el actor activo registra prueba sin tecnico asignado');
select throws_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000004', 'ready_for_delivery', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000004'))
$$, 'P0001', 'REPAIR_ASSIGNED_TECHNICIAN_REQUIRED', 'la regla actual de tecnico bloquea ready');

select lives_ok($$
  select public.reserve_repair_part(pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","operation_key":"e1910000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000005","product_id":"e1500000-0000-4000-8000-000000000001","warehouse_id":"e1600000-0000-4000-8000-000000000001","location_id":"e1700000-0000-4000-8000-000000000001","stock_status":"available","quantity_requested":1}'::jsonb))
$$, 'reserva un repuesto por el flujo P1-05');
select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005', 'testing', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005'))
$$, 'abre testing con repuesto pendiente');
select lives_ok($$
  select public.record_repair_test(pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000005","test_type":"Operacion","result":"Aprobada","passed":true}'::jsonb))
$$, 'aprueba el ciclo con repuesto pendiente');
select throws_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'e1100000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (select id from public.repair_parts where repair_id = 'e1800000-0000-4000-8000-000000000005'),
    'expected_lock_version', pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005'),
    'quantity', 1,
    'operation_key', 'e1900000-0000-4000-8000-000000000001'::uuid
  ))
$$, 'P0001', 'REPAIR_TECHNICAL_CHANGE_REQUIRES_REWORK', 'testing rechaza consumo posterior a una prueba');
select results_eq(
  $$
    select part.quantity_consumed, part.status,
      (select count(*) from public.repair_part_consumptions consumption where consumption.repair_part_id = part.id),
      (select count(*) from public.inventory_movements movement where movement.organization_id = part.organization_id and movement.source_type = 'repair-consumption')
    from public.repair_parts part
    where part.repair_id = 'e1800000-0000-4000-8000-000000000005'
  $$,
  $$ values (0.000::numeric, 'reserved'::text, 0::bigint, 0::bigint) $$,
  'el consumo rechazado no altera reserva, fisico ni tracking'
);
select throws_ok($$
  select public.record_repair_solution(
    pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000005","applied_solution":"Cambio posterior a la prueba"}'::jsonb)
  )
$$, 'P0001', 'REPAIR_TECHNICAL_CHANGE_REQUIRES_REWORK', 'testing rechaza cambios de solucion posteriores a una prueba');
select results_eq(
  $$
    select repair.applied_solution,
      (select count(*) from public.repair_events event where event.repair_id = repair.id and event.event_type in ('SOLUTION_RECORDED', 'PART_CONSUMED')),
      (select count(*) from public.audit_events audit where audit.entity_id = repair.id::text and audit.action in ('REPAIR_SOLUTION_RECORDED', 'REPAIR_PART_CONSUMED'))
    from public.repairs repair
    where repair.id = 'e1800000-0000-4000-8000-000000000005'
  $$,
  $$ values (null::text, 0::bigint, 0::bigint) $$,
  'los cambios tecnicos rechazados no dejan valor, evento ni auditoria'
);
select throws_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005', 'ready_for_delivery', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005'))
$$, 'P0001', 'REPAIR_PENDING_PARTS', 'repuesto reservado pendiente bloquea ready');
select lives_ok($$
  select public.cancel_repair_part(
    'e1100000-0000-4000-8000-000000000001',
    (select id from public.repair_parts where repair_id = 'e1800000-0000-4000-8000-000000000005'),
    'No requerido',
    pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005')
  )
$$, 'cancela correctamente el repuesto pendiente');
select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005', 'ready_for_delivery', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005'))
$$, 'el gate se reevalua luego de liberar el repuesto');
select throws_ok($$
  select public.record_repair_solution(
    pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000005","applied_solution":"Cambio cuando ya estaba lista"}'::jsonb)
  )
$$, 'P0001', 'REPAIR_TECHNICAL_CHANGE_REQUIRES_REWORK', 'ready rechaza cambios tecnicos que volverian obsoleta la prueba');
select results_eq(
  $$
    select repair.status, repair.applied_solution,
      (select count(*) from public.repair_events event where event.repair_id = repair.id and event.event_type = 'SOLUTION_RECORDED'),
      (select count(*) from public.audit_events audit where audit.entity_id = repair.id::text and audit.action = 'REPAIR_SOLUTION_RECORDED')
    from public.repairs repair
    where repair.id = 'e1800000-0000-4000-8000-000000000005'
  $$,
  $$ values ('ready_for_delivery'::text, null::text, 0::bigint, 0::bigint) $$,
  'el cambio rechazado en ready es atomico'
);
select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005', 'in_repair', 'Requiere retrabajo', pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005'))
$$, 'ready puede volver explicitamente a reparacion');
select lives_ok($$
  select public.record_repair_solution(
    pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000005","applied_solution":"Retrabajo controlado"}'::jsonb)
  )
$$, 'in_repair permite registrar el retrabajo');
select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005', 'testing', 'Nueva validacion', pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005'))
$$, 'el retrabajo vuelve a testing por la ruta explicita');
select is(
  (select current_test_cycle_number from public.repairs where id = 'e1800000-0000-4000-8000-000000000005'),
  2,
  'volver a testing despues del retrabajo abre un ciclo nuevo'
);
select throws_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005', 'ready_for_delivery', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005'))
$$, 'P0001', 'REPAIR_APPROVED_TEST_REQUIRED', 'la prueba anterior no aprueba el ciclo posterior al retrabajo');
select lives_ok($$
  select public.record_repair_test(pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000005","test_type":"Operacion","result":"Retrabajo aprobado","passed":true}'::jsonb))
$$, 'registra una prueba para el nuevo ciclo');
select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005', 'ready_for_delivery', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000005'))
$$, 'solo la prueba posterior al retrabajo recupera ready');

select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000006', 'testing', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000006'))
$$, 'abre ciclo para defensa en profundidad');
select lives_ok($$
  select public.record_repair_test(pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000006","test_type":"Operacion","result":"Aprobada","passed":true}'::jsonb))
$$, 'registra PASSED para ready');
select lives_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000006', 'ready_for_delivery', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000006'))
$$, 'el gate inicial permite ready');

reset role;
update public.repair_tests
set passed = false, result = 'Falla detectada antes de entregar'
where repair_id = 'e1800000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated","session_id":"e1300000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok($$
  select public.deliver_repair('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000006', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000006'))
$$, 'P0001', 'REPAIR_FAILED_TEST_PRESENT', 'deliver_repair revalida el mismo gate');
select is(
  (select status from public.repairs where id = 'e1800000-0000-4000-8000-000000000006'),
  'ready_for_delivery'::text,
  'la revalidacion fallida no entrega la reparacion'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000002","role":"authenticated","session_id":"e1300000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok($$
  select public.change_repair_status('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000002', 'in_repair', null, pg_temp.repair_lock_version('e1100000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000002'))
$$, '42501', 'REPAIR_FORBIDDEN', 'otro tenant no cambia el ciclo ajeno');
select throws_ok($$
  select public.record_repair_test(pg_temp.with_repair_version('{"organization_id":"e1100000-0000-4000-8000-000000000001","repair_id":"e1800000-0000-4000-8000-000000000002","test_type":"Operacion","result":"Falso","passed":true}'::jsonb))
$$, '42501', 'REPAIR_FORBIDDEN', 'otro tenant no registra pruebas ajenas');
select is(
  (select count(*) from public.repair_tests where organization_id = 'e1100000-0000-4000-8000-000000000001'),
  0::bigint,
  'RLS oculta el historial de pruebas de otro tenant'
);

reset role;
select throws_ok($$
  insert into public.repair_tests (
    organization_id, repair_id, test_cycle_number, test_type, result, passed,
    performed_by, created_by
  ) values (
    'e1100000-0000-4000-8000-000000000001',
    'e1800000-0000-4000-8000-000000000002', 99,
    'Operacion', 'Ciclo falso', true,
    'e1200000-0000-4000-8000-000000000001',
    'e1200000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'REPAIR_TEST_CYCLE_INVALID', 'el trigger bloquea un ciclo falsificado');

select * from finish();
rollback;
