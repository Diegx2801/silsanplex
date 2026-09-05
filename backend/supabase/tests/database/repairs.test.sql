begin;

select plan(161);

-- ------------------------------------------------------------
-- Estructura, seguridad y matriz de permisos
-- ------------------------------------------------------------

select has_column(
  'public', 'products', 'serial_control',
  'products incorpora serial_control'
);
select has_column(
  'public', 'repairs', 'serial_control_snapshot',
  'repairs conserva la regla de serie historica'
);
select has_column(
  'public', 'repair_parts', 'expiration_date',
  'las reservas conservan el vencimiento'
);
select has_column(
  'public', 'repair_part_consumptions', 'expiration_date',
  'los consumos conservan el vencimiento'
);
select has_table('public', 'repairs', 'existe la cabecera de reparaciones');
select has_table('public', 'repair_diagnostics', 'existe el historial de diagnosticos');
select has_table('public', 'repair_quotes', 'existen cotizaciones de reparacion');
select has_column('public', 'repair_quotes', 'is_current', 'cotizaciones identifican la version vigente');
select has_table('public', 'repair_quote_items', 'existe el detalle de cotizaciones');
select has_table('public', 'repair_parts', 'existen reservas de repuestos');
select has_table('public', 'repair_part_consumptions', 'existen consumos de repuestos');
select has_table('public', 'repair_tests', 'existen pruebas de reparacion');
select has_table('public', 'repair_events', 'existe la linea de tiempo de reparaciones');
select has_view('public', 'repair_list', 'existe la vista paginable de reparaciones');
select has_column(
  'public', 'repairs', 'current_test_cycle_number',
  'repairs conserva el ciclo de pruebas vigente'
);
select has_column(
  'public', 'repair_tests', 'test_cycle_number',
  'cada prueba puede asociarse a un ciclo explicito'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'repairs'
      and column_name = any (array[
        'id', 'organization_id', 'repair_code', 'customer_id', 'product_id',
        'serial_number', 'received_at', 'estimated_delivery_date', 'delivered_at',
         'status', 'priority', 'problem_description', 'diagnosis', 'applied_solution',
         'serial_control_snapshot',
         'notes', 'customer_reference', 'sale_document_id', 'warranty_reference',
        'assigned_technician_id', 'customer_name_snapshot',
        'customer_document_snapshot', 'product_code_snapshot',
         'product_description_snapshot', 'created_by', 'updated_by', 'created_at',
          'updated_at', 'current_test_cycle_number', 'lock_version'
       ])
  ),
   30::bigint,
  'repairs conserva exactamente sus columnas del contrato'
);
select is(
  (
    select count(*)
    from public.permissions
    where code = any (array[
      'REPAIRS_VIEW', 'REPAIRS_CREATE', 'REPAIRS_UPDATE', 'REPAIRS_ASSIGN',
      'REPAIRS_CHANGE_STATUS', 'REPAIRS_APPROVE_QUOTE', 'REPAIRS_USE_PARTS',
      'REPAIRS_DELIVER'
    ])
  ),
  8::bigint,
  'existen exactamente los ocho permisos aprobados'
);
select results_eq(
  $$
    select role_code, permission_code
    from public.role_permissions
    where permission_code like 'REPAIRS_%'
    order by role_code, permission_code
  $$,
  $$
    values
      ('ADMIN'::text, 'REPAIRS_APPROVE_QUOTE'::text),
      ('ADMIN'::text, 'REPAIRS_ASSIGN'::text),
      ('ADMIN'::text, 'REPAIRS_CHANGE_STATUS'::text),
      ('ADMIN'::text, 'REPAIRS_CREATE'::text),
      ('ADMIN'::text, 'REPAIRS_DELIVER'::text),
      ('ADMIN'::text, 'REPAIRS_UPDATE'::text),
      ('ADMIN'::text, 'REPAIRS_USE_PARTS'::text),
      ('ADMIN'::text, 'REPAIRS_VIEW'::text),
      ('ALMACEN'::text, 'REPAIRS_USE_PARTS'::text),
      ('ALMACEN'::text, 'REPAIRS_VIEW'::text),
      ('VENTAS'::text, 'REPAIRS_APPROVE_QUOTE'::text),
      ('VENTAS'::text, 'REPAIRS_CREATE'::text),
      ('VENTAS'::text, 'REPAIRS_UPDATE'::text),
      ('VENTAS'::text, 'REPAIRS_VIEW'::text)
  $$,
  'la matriz solo otorga reparaciones a ADMIN, VENTAS y ALMACEN'
);
select is(
  (select count(*) from public.role_permissions where role_code = 'LOGISTICA' and permission_code like 'REPAIRS_%'),
  0::bigint,
  'LOGISTICA no recibe permisos nuevos de reparaciones'
);
select is(
  (select count(*) from public.roles where code = 'SERVICIO_TECNICO'),
  0::bigint,
  'no se crea el rol SERVICIO_TECNICO'
);

select has_function('public', 'create_repair', array['jsonb'], 'existe create_repair');
select has_function('public', 'update_repair', array['jsonb'], 'existe update_repair');
select has_function('public', 'assign_repair', array['uuid', 'uuid', 'uuid', 'bigint'], 'existe assign_repair con version esperada');
select has_function('public', 'change_repair_status', array['uuid', 'uuid', 'text', 'text', 'bigint'], 'existe change_repair_status con version esperada');
select has_function('public', 'record_repair_diagnosis', array['jsonb'], 'existe record_repair_diagnosis');
select has_function('public', 'save_repair_quote', array['jsonb'], 'existe save_repair_quote');
select has_function('public', 'revise_repair_quote', array['jsonb'], 'existe revise_repair_quote');
select is(
  (select prosecdef from pg_proc where oid = 'public.revise_repair_quote(jsonb)'::regprocedure),
  true,
  'revise_repair_quote es security definer'
);
select is(has_function_privilege('authenticated', 'public.revise_repair_quote(jsonb)', 'EXECUTE'), true, 'authenticated puede ejecutar la revision');
select is(has_function_privilege('service_role', 'public.revise_repair_quote(jsonb)', 'EXECUTE'), true, 'service_role puede ejecutar la revision');
select is(has_function_privilege('anon', 'public.revise_repair_quote(jsonb)', 'EXECUTE'), false, 'anon no puede ejecutar la revision');
select is(
  has_function_privilege(
    'authenticated',
    'public.write_repair_quote(uuid,uuid,uuid,integer,text,text,boolean,numeric,jsonb,uuid)',
    'EXECUTE'
  ),
  false,
  'el escritor interno de cotizaciones no se expone al cliente'
);
select has_function('public', 'approve_repair_quote', array['uuid', 'uuid', 'uuid', 'text', 'bigint'], 'existe approve_repair_quote con version esperada');
select has_function('public', 'reject_repair_quote', array['uuid', 'uuid', 'uuid', 'text', 'bigint'], 'existe reject_repair_quote con version esperada');
select has_function('public', 'reserve_repair_part', array['jsonb'], 'existe reserve_repair_part');
select has_function('public', 'consume_repair_part', array['jsonb'], 'existe consume_repair_part');
select has_function('public', 'cancel_repair_part', array['uuid', 'uuid', 'text', 'bigint'], 'existe cancel_repair_part con version esperada');
select has_function('public', 'record_repair_test', array['jsonb'], 'existe record_repair_test');
select has_function('public', 'deliver_repair', array['uuid', 'uuid', 'text', 'bigint'], 'existe deliver_repair con version esperada');
select has_function('public', 'cancel_repair', array['uuid', 'uuid', 'text', 'bigint'], 'existe cancel_repair con version esperada');
select has_function('public', 'list_repair_technicians', array['uuid', 'text', 'integer'], 'existe list_repair_technicians');

select is((select relrowsecurity from pg_class where oid = 'public.repairs'::regclass), true, 'repairs tiene RLS');
select is((select relrowsecurity from pg_class where oid = 'public.repair_diagnostics'::regclass), true, 'diagnosticos tienen RLS');
select is((select relrowsecurity from pg_class where oid = 'public.repair_quotes'::regclass), true, 'cotizaciones tienen RLS');
select is((select relrowsecurity from pg_class where oid = 'public.repair_quote_items'::regclass), true, 'items tienen RLS');
select is((select relrowsecurity from pg_class where oid = 'public.repair_parts'::regclass), true, 'repuestos tienen RLS');
select is((select relrowsecurity from pg_class where oid = 'public.repair_part_consumptions'::regclass), true, 'consumos tienen RLS');
select is((select relrowsecurity from pg_class where oid = 'public.repair_tests'::regclass), true, 'pruebas tienen RLS');
select is((select relrowsecurity from pg_class where oid = 'public.repair_events'::regclass), true, 'eventos tienen RLS');
select is(has_table_privilege('anon', 'public.repairs', 'SELECT'), false, 'anon no consulta reparaciones');
select is(has_table_privilege('authenticated', 'public.repairs', 'INSERT'), false, 'authenticated no inserta reparaciones directamente');
select is(has_table_privilege('authenticated', 'public.repairs', 'UPDATE'), false, 'authenticated no actualiza reparaciones directamente');
select is(has_table_privilege('authenticated', 'public.repairs', 'DELETE'), false, 'authenticated no elimina reparaciones directamente');
select is(has_table_privilege('service_role', 'public.repairs', 'INSERT'), false, 'service_role no recibe insercion directa del modulo');
select is(
  (select prosecdef from pg_proc where oid = 'public.create_repair(jsonb)'::regprocedure),
  true,
  'create_repair es security definer'
);
select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('public.consume_repair_part(jsonb)'::regprocedure)) > 0,
  'consumo serializa la reserva mediante advisory lock'
);
select ok(
  position('lock_inventory_bucket' in pg_get_functiondef('public.reserve_repair_part_unchecked(jsonb)'::regprocedure)) > 0,
  'reserva delega la serializacion a la primitiva canonica'
);
select is(
  (select count(*) from pg_constraint where conrelid = 'public.repair_part_consumptions'::regclass and conname = 'repair_part_consumptions_operation_key_unique'),
  1::bigint,
  'operation_key es unica por organizacion'
);
select is(
  (select count(*) from pg_constraint where conrelid = 'public.repair_quote_items'::regclass and pg_get_constraintdef(oid) like '%line_subtotal%'),
  0::bigint,
  'line_subtotal no se puede falsear como columna normal'
);
select is(
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'repair_quotes_one_current_idx'),
  1::bigint,
  'la base garantiza como maximo una cotizacion vigente por reparacion'
);
select ok(
  pg_get_functiondef('public.restore_product_version(uuid, uuid, integer)'::regprocedure) like '%serial_control%',
  'restore_product_version conserva serial_control'
);

-- ------------------------------------------------------------
-- Datos fijos multiempresa
-- ------------------------------------------------------------

insert into public.organizations (id, name, slug)
values
  ('f1000000-0000-4000-8000-000000000001', 'Reparaciones uno', 'reparaciones-uno'),
  ('f1000000-0000-4000-8000-000000000002', 'Reparaciones dos', 'reparaciones-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('f2000000-0000-4000-8000-000000000001', 'repair.admin@test.local', '{"full_name":"Repair Admin"}', now(), now()),
  ('f2000000-0000-4000-8000-000000000002', 'repair.sales@test.local', '{"full_name":"Repair Sales"}', now(), now()),
  ('f2000000-0000-4000-8000-000000000003', 'repair.warehouse@test.local', '{"full_name":"Repair Warehouse"}', now(), now()),
  ('f2000000-0000-4000-8000-000000000004', 'repair.technician@test.local', '{"full_name":"Repair Technician"}', now(), now()),
  ('f2000000-0000-4000-8000-000000000005', 'repair.other@test.local', '{"full_name":"Other Organization"}', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', now(), now()),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', now(), now()),
  ('f3000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000003', now(), now()),
  ('f3000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000004', now(), now()),
  ('f3000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000005', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002'),
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000003'),
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000004'),
  ('f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000005');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'ADMIN'),
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', 'VENTAS'),
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000003', 'ALMACEN'),
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000004', 'CONTABILIDAD'),
  ('f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000005', 'ALMACEN');

insert into public.customers (id, organization_id, document_type, document_number, legal_name)
values
  ('f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'DNI', '40000001', 'Cliente Reparacion Uno'),
  ('f4000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'DNI', '40000002', 'Cliente Reparacion Dos'),
  ('f4000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000002', 'DNI', '40000003', 'Cliente Reparacion Dos Org');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, serial_control, created_by, updated_by
)
values
  ('f5000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'REP-PART-001', 'Repuesto de prueba', 'UND', 25, false, false, 'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'REP-SERIAL-001', 'Equipo serializado', 'UND', 100, false, true, 'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000002', 'REP-OTHER-001', 'Producto de otra organizacion', 'UND', 10, false, false, 'f2000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000005'),
  ('f5000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'REP-EXP-001', 'Repuesto con vencimiento', 'UND', 30, false, false, 'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001');

update public.products
set expiration_control = true
where id = 'f5000000-0000-4000-8000-000000000004';

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values (
  'f6000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'REPAIR', 'Almacen reparaciones',
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by)
values (
  'f7000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000001',
  'R-01', 'Ubicacion reparaciones',
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001'
);

create function pg_temp.repair_lock_version(reference_value text)
returns bigint
language sql
stable
as $$
  select repair.lock_version
  from public.repairs repair
  where repair.organization_id = 'f1000000-0000-4000-8000-000000000001'
    and repair.customer_reference = reference_value;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000001"}',
  true
);

select lives_ok($$
  select public.record_inventory_movement(
    '{"organization_id":"f1000000-0000-4000-8000-000000000001","product_id":"f5000000-0000-4000-8000-000000000001","warehouse_id":"f6000000-0000-4000-8000-000000000001","location_id":"f7000000-0000-4000-8000-000000000001","movement_type":"entrada","quantity":10,"unit_cost":8,"stock_status":"available","operation_date":"2026-08-27","reason":"Stock inicial reparaciones"}'::jsonb
  )
$$, 'prepara stock disponible en el libro canonico');
select lives_ok($$
  select public.record_inventory_movement(
    '{"organization_id":"f1000000-0000-4000-8000-000000000001","product_id":"f5000000-0000-4000-8000-000000000004","warehouse_id":"f6000000-0000-4000-8000-000000000001","location_id":"f7000000-0000-4000-8000-000000000001","movement_type":"entrada","quantity":3,"unit_cost":12,"stock_status":"available","expiration_date":"2099-12-31","operation_date":"2026-08-27","reason":"Stock con vencimiento"}'::jsonb
  )
$$, 'prepara stock con vencimiento para reparaciones');

-- ------------------------------------------------------------
-- Regla serial y permisos de creacion/actualizacion/asignacion
-- ------------------------------------------------------------

select is(
  (select serial_control from public.products where id = 'f5000000-0000-4000-8000-000000000001'),
  false,
  'los productos existentes reciben serial_control false'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000002"}',
  true
);

select lives_ok($$
  select public.create_repair('{"organization_id":"f1000000-0000-4000-8000-000000000001","operation_key":"f9100000-0000-4000-8000-000000000001","customer_id":"f4000000-0000-4000-8000-000000000001","product_id":"f5000000-0000-4000-8000-000000000001","problem_description":"No enciende","customer_reference":"SERIAL_FALSE"}'::jsonb)
$$, 'VENTAS puede crear una reparacion sin numero de serie');
select throws_ok($$
  select public.create_repair('{"organization_id":"f1000000-0000-4000-8000-000000000001","operation_key":"f9100000-0000-4000-8000-000000000002","customer_id":"f4000000-0000-4000-8000-000000000001","product_id":"f5000000-0000-4000-8000-000000000002","problem_description":"Falla de equipo","customer_reference":"SERIAL_MISSING"}'::jsonb)
$$, 'P0001', 'REPAIR_SERIAL_NUMBER_RULE_VIOLATION', 'exige serie cuando el producto la controla');
select lives_ok($$
  select public.create_repair('{"organization_id":"f1000000-0000-4000-8000-000000000001","operation_key":"f9100000-0000-4000-8000-000000000003","customer_id":"f4000000-0000-4000-8000-000000000001","product_id":"f5000000-0000-4000-8000-000000000002","serial_number":"SN-0001","problem_description":"Falla de equipo","customer_reference":"SERIAL_OK"}'::jsonb)
$$, 'permite una serie para producto serializado');
select is(
  (select serial_number from public.repairs where customer_reference = 'SERIAL_OK'),
  'SN-0001'::text,
  'persiste el numero de serie'
);

select lives_ok($$
  select public.create_repair('{"organization_id":"f1000000-0000-4000-8000-000000000001","operation_key":"f9100000-0000-4000-8000-000000000004","customer_id":"f4000000-0000-4000-8000-000000000001","product_id":"f5000000-0000-4000-8000-000000000001","problem_description":"No carga","priority":"high","customer_reference":"FLOW"}'::jsonb)
$$, 'VENTAS puede crear la reparacion del flujo principal');
select lives_ok($$
  select public.update_repair(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'id', (select id from public.repairs where customer_reference = 'FLOW'),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'priority', 'urgent',
    'notes', 'Cliente espera diagnostico'
  ));
  /*
  select public.update_repair(('{'"'"'organization_id'"'"':'"'"'f1000000-0000-4000-8000-000000000001'"'"','"'"'id'"'"':'"'"' || (select id::text from public.repairs where customer_reference = 'FLOW') || '"'"','"'"'priority'"'"':'"'"'urgent'"'"','"'"'notes'"'"':'"'"'Cliente espera diagnostico'"'"'}')::jsonb)
  */
$$, 'VENTAS puede actualizar una reparacion');
select throws_ok($$
  select public.assign_repair('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'f2000000-0000-4000-8000-000000000004', pg_temp.repair_lock_version('FLOW'))
$$, '42501', 'REPAIR_FORBIDDEN', 'VENTAS no puede asignar tecnicos');

select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000001"}',
  true
);
select lives_ok($$
  select public.assign_repair('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'f2000000-0000-4000-8000-000000000004', pg_temp.repair_lock_version('FLOW'))
$$, 'ADMIN puede asignar un tecnico activo');
select is(
  (select count(*) from public.list_repair_technicians('f1000000-0000-4000-8000-000000000001', 'technician', 10)),
  1::bigint,
  'la lista devuelve tecnicos activos por busqueda'
);
select throws_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'quote_approved', 'Ruta especializada', pg_temp.repair_lock_version('FLOW'))
$$, 'P0001', 'REPAIR_SPECIALIZED_STATUS_REQUIRED', 'el camino generico no aprueba cotizaciones');

select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'diagnosis', 'Sin permiso', pg_temp.repair_lock_version('FLOW'))
$$, '42501', 'REPAIR_FORBIDDEN', 'VENTAS no cambia estados');
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000001"}',
  true
);
select lives_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'diagnosis', 'Inicio diagnostico', pg_temp.repair_lock_version('FLOW'))
$$, 'received transiciona a diagnosis');
select lives_ok($$
  select public.record_repair_diagnosis(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'FLOW'),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'technician_id', 'f2000000-0000-4000-8000-000000000004'::uuid,
    'symptoms', 'No enciende',
    'cause_found', 'Fuente danada',
    'recommended_solution', 'Cambiar fuente'
  ));
  /*
  select public.record_repair_diagnosis(('{'"'"'organization_id'"'"':'"'"'f1000000-0000-4000-8000-000000000001'"'"','"'"'repair_id'"'"':'"'"' || (select id::text from public.repairs where customer_reference = 'FLOW') || '"'"','"'"'technician_id'"'"':'"'"'f2000000-0000-4000-8000-000000000004'"'"','"'"'symptoms'"'"':'"'"'No enciende'"'"','"'"'cause_found'"'"':'"'"'Fuente danada'"'"','"'"'recommended_solution'"'"':'"'"'Cambiar fuente'"'"'}')::jsonb)
  */
$$, 'diagnosis permite multiples registros con tecnico activo');
select throws_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'delivered', 'Salto no permitido', pg_temp.repair_lock_version('FLOW'))
$$, 'P0001', 'REPAIR_SPECIALIZED_STATUS_REQUIRED', 'el camino generico no entrega reparaciones');

-- ------------------------------------------------------------
-- Cotizacion, impuestos no hardcodeados y aprobacion
-- ------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000002"}',
  true
);
select lives_ok($$
  select public.save_repair_quote(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000005'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'FLOW'),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'currency', 'PEN',
    'prices_include_tax', false,
    'tax_rate', 10,
    'submit', false,
    'items', jsonb_build_array(
      jsonb_build_object('line_type', 'labor', 'description', 'Diagnostico y mano de obra', 'quantity', 2, 'unit_price', 100, 'taxable', true),
      jsonb_build_object('line_type', 'part', 'product_id', 'f5000000-0000-4000-8000-000000000001'::uuid, 'description', 'Repuesto', 'quantity', 1, 'unit_price', 50, 'taxable', true)
    )
  ));
  /*
  select public.save_repair_quote(('{'"'"'organization_id'"'"':'"'"'f1000000-0000-4000-8000-000000000001'"'"','"'"'repair_id'"'"':'"'"' || (select id::text from public.repairs where customer_reference = 'FLOW') || '"'"','"'"'currency'"'"':'"'"'PEN'"'"','"'"'prices_include_tax'"'"':false,"tax_rate":10,"submit":false,"items":[{"line_type":"labor","description":"Diagnostico y mano de obra","quantity":2,"unit_price":100,"taxable":true},{"line_type":"part","product_id":"f5000000-0000-4000-8000-000000000001","description":"Repuesto","quantity":1,"unit_price":50,"taxable":true}]}')::jsonb)
  */
$$, 'guarda una cotizacion en borrador');
select is(
  (select status from public.repairs where customer_reference = 'FLOW'),
  'quote_pending'::text,
  'el borrador deja la reparacion en quote_pending'
);
select throws_ok($$
  select public.save_repair_quote(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000006'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'FLOW'),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'items', jsonb_build_array(
      jsonb_build_object('line_type', 'labor', 'description', 'Borrador duplicado', 'quantity', 1, 'unit_price', 10)
    )
  ))
$$, 'P0001', 'REPAIR_QUOTE_REVISION_REQUIRED', 'no crea un segundo borrador implicito');
select results_eq(
  $$
    select subtotal, tax, total
    from public.repair_quotes
    where repair_id = (select id from public.repairs where customer_reference = 'FLOW')
  $$,
  $$ values (250.00::numeric, 25.00::numeric, 275.00::numeric) $$,
  'calcula totales con tax_rate 10 y no con 18 fijo'
);
select lives_ok($$
  select public.save_repair_quote(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000007'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'FLOW'),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'id', (select id from public.repair_quotes where repair_id = (select id from public.repairs where customer_reference = 'FLOW')),
    'currency', 'PEN',
    'prices_include_tax', false,
    'tax_rate', 10,
    'submit', true,
    'items', jsonb_build_array(
      jsonb_build_object('line_type', 'labor', 'description', 'Diagnostico y mano de obra', 'quantity', 2, 'unit_price', 100, 'taxable', true),
      jsonb_build_object('line_type', 'part', 'product_id', 'f5000000-0000-4000-8000-000000000001'::uuid, 'description', 'Repuesto', 'quantity', 1, 'unit_price', 50, 'taxable', true)
    )
  ));
  /*
  select public.save_repair_quote(('{'"'"'organization_id'"'"':'"'"'f1000000-0000-4000-8000-000000000001'"'"','"'"'repair_id'"'"':'"'"' || (select id::text from public.repairs where customer_reference = 'FLOW') || '"'"','"'"'id'"'"':'"'"' || (select id::text from public.repair_quotes where repair_id = (select id from public.repairs where customer_reference = 'FLOW')) || '"'"','"'"'currency'"'"':'"'"'PEN'"'"','"'"'prices_include_tax'"'"':false,"tax_rate":10,"submit":true,"items":[{"line_type":"labor","description":"Diagnostico y mano de obra","quantity":2,"unit_price":100,"taxable":true},{"line_type":"part","product_id":"f5000000-0000-4000-8000-000000000001","description":"Repuesto","quantity":1,"unit_price":50,"taxable":true}]}')::jsonb)
  */
$$, 'submit cambia la cotizacion a pending');
select results_eq(
  $$
    select repair.status, quote.status
    from public.repairs repair
    join public.repair_quotes quote on quote.repair_id = repair.id
    where repair.customer_reference = 'FLOW'
  $$,
  $$ values ('waiting_customer_approval'::text, 'pending'::text) $$,
  'submit deja la reparacion esperando aprobacion'
);
select lives_ok($$
  select public.approve_repair_quote('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), (select id from public.repair_quotes where repair_id = (select id from public.repairs where customer_reference = 'FLOW')), 'Aprobada por cliente', pg_temp.repair_lock_version('FLOW'))
$$, 'aprueba una cotizacion pending');
select results_eq(
  $$
    select repair.status, quote.status
    from public.repairs repair
    join public.repair_quotes quote on quote.repair_id = repair.id
    where repair.customer_reference = 'FLOW'
  $$,
  $$ values ('quote_approved'::text, 'approved'::text) $$,
  'la aprobacion sincroniza cotizacion y reparacion'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'cancelled', 'Uso generico', pg_temp.repair_lock_version('FLOW'))
$$, 'P0001', 'REPAIR_SPECIALIZED_STATUS_REQUIRED', 'cancelar no usa la ruta generica');

-- ------------------------------------------------------------
-- Reservas, stock insuficiente, consumo atomico e idempotencia
-- ------------------------------------------------------------

select lives_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'in_repair', 'Aprobada para reparar', pg_temp.repair_lock_version('FLOW'))
$$, 'quote_approved transiciona a in_repair');
select lives_ok($$
  select public.reserve_repair_part(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000008'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'FLOW'),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'product_id', 'f5000000-0000-4000-8000-000000000001'::uuid,
    'warehouse_id', 'f6000000-0000-4000-8000-000000000001'::uuid,
    'location_id', 'f7000000-0000-4000-8000-000000000001'::uuid,
    'stock_status', 'available',
    'quantity_requested', 4,
    'notes', 'Repuesto reservado'
  ));
  /*
  select public.reserve_repair_part(('{'"'"'organization_id'"'"':'"'"'f1000000-0000-4000-8000-000000000001'"'"','"'"'repair_id'"'"':'"'"' || (select id::text from public.repairs where customer_reference = 'FLOW') || '"'"','"'"'product_id'"'"':'"'"'f5000000-0000-4000-8000-000000000001'"'"','"'"'warehouse_id'"'"':'"'"'f6000000-0000-4000-8000-000000000001'"'"','"'"'location_id'"'"':'"'"'f7000000-0000-4000-8000-000000000001'"'"','"'"'stock_status'"'"':'"'"'available'"'"','"'"'quantity_requested'"'"':4,"notes":"Repuesto reservado"}')::jsonb)
  */
$$, 'reserva partes sin crear movimiento');
select is(
  (select count(*) from public.inventory_movements where source_type = 'repair-consumption'),
  0::bigint,
  'reservar no escribe inventory_movements'
);
select is(
  (select status from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'FLOW')),
  'reserved'::text,
  'la reserva queda reserved'
);
select throws_ok($$
  select public.reserve_repair_part(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000009'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'FLOW'),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'product_id', 'f5000000-0000-4000-8000-000000000001'::uuid,
    'warehouse_id', 'f6000000-0000-4000-8000-000000000001'::uuid,
    'location_id', 'f7000000-0000-4000-8000-000000000001'::uuid,
    'stock_status', 'available',
    'quantity_requested', 7
  ));
  /*
  select public.reserve_repair_part(('{'"'"'organization_id'"'"':'"'"'f1000000-0000-4000-8000-000000000001'"'"','"'"'repair_id'"'"':'"'"' || (select id::text from public.repairs where customer_reference = 'SERIAL_FALSE') || '"'"','"'"'product_id'"'"':'"'"'f5000000-0000-4000-8000-000000000001'"'"','"'"'warehouse_id'"'"':'"'"'f6000000-0000-4000-8000-000000000001'"'"','"'"'location_id'"'"':'"'"'f7000000-0000-4000-8000-000000000001'"'"','"'"'stock_status'"'"':'"'"'available'"'"','"'"'quantity_requested'"'"':7}')::jsonb)
  */
$$, 'P0001', 'REPAIR_INSUFFICIENT_STOCK', 'reserva descuenta reservas activas del stock disponible');
select lives_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (select id from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'FLOW')),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'quantity', 2,
    'operation_key', 'f9000000-0000-4000-8000-000000000001'::uuid
  ));
  /*
  select public.consume_repair_part(('{'"'"'organization_id'"'"':'"'"'f1000000-0000-4000-8000-000000000001'"'"','"'"'repair_part_id'"'"':'"'"' || (select id::text from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'FLOW')) || '"'"','"'"'quantity'"'"':2,"operation_key":"f9000000-0000-4000-8000-000000000001"}')::jsonb)
  */
$$, 'consume una parte de la reserva');
select is(
  public.consume_repair_part(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (select id from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'FLOW')),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'quantity', 2,
    'operation_key', 'f9000000-0000-4000-8000-000000000001'::uuid
  )),
  /*
  public.consume_repair_part(('{'"'"'organization_id'"'"':'"'"'f1000000-0000-4000-8000-000000000001'"'"','"'"'repair_part_id'"'"':'"'"' || (select id::text from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'FLOW')) || '"'"','"'"'quantity'"'"':2,"operation_key":"f9000000-0000-4000-8000-000000000001"}')::jsonb),
  */
  (select id from public.repair_part_consumptions where operation_key = 'f9000000-0000-4000-8000-000000000001'),
  'repetir operation_key es idempotente'
);
select lives_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (select id from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'FLOW')),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'quantity', 2,
    'operation_key', 'f9000000-0000-4000-8000-000000000002'::uuid
  ));
  /*
  select public.consume_repair_part(('{'"'"'organization_id'"'"':'"'"'f1000000-0000-4000-8000-000000000001'"'"','"'"'repair_part_id'"'"':'"'"' || (select id::text from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'FLOW')) || '"'"','"'"'quantity'"'"':2,"operation_key":"f9000000-0000-4000-8000-000000000002"}')::jsonb)
  */
$$, 'permite consumo parcial repetido con otra operacion');
select is(
  (select status from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'FLOW')),
  'consumed'::text,
  'la reserva pasa a consumed al completar la cantidad'
);
select results_eq(
  $$
    select source_type, source_id, movement_type, reason
    from public.inventory_movements
    where source_type = 'repair-consumption'
    order by created_at, id
  $$,
  $$
    select 'repair-consumption'::text, consumption.id, 'salida'::text, 'Reparacion ' || repair.repair_code
    from public.repair_part_consumptions consumption
    join public.repair_parts part on part.id = consumption.repair_part_id
    join public.repairs repair on repair.id = part.repair_id
    join public.inventory_movements movement
      on movement.organization_id = consumption.organization_id
      and movement.id = consumption.inventory_movement_id
    order by movement.created_at, movement.id
  $$,
  'cada consumo crea salida con source_id y razon exactos'
);
select is(
  (select count(*) from public.repair_events where event_type = 'PART_CONSUMED' and repair_id = (select id from public.repairs where customer_reference = 'FLOW')),
  2::bigint,
  'cada consumo confirmado deja evento de reparacion'
);
select is(
  (select count(*) from public.audit_events where action = 'REPAIR_PART_CONSUMED' and entity_id = (select id::text from public.repairs where customer_reference = 'FLOW')),
  2::bigint,
  'cada consumo confirmado deja auditoria'
);

select lives_ok($$
  select public.create_repair('{"organization_id":"f1000000-0000-4000-8000-000000000001","operation_key":"f9100000-0000-4000-8000-000000000010","customer_id":"f4000000-0000-4000-8000-000000000001","product_id":"f5000000-0000-4000-8000-000000000004","problem_description":"Repuesto con vencimiento","customer_reference":"EXPIRATION"}'::jsonb)
$$, 'crea reparacion para probar vencimiento');
select lives_ok($$ select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'EXPIRATION'), 'diagnosis', null, pg_temp.repair_lock_version('EXPIRATION')) $$, 'vencimiento diagnosis');
select lives_ok($$ select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'EXPIRATION'), 'in_repair', null, pg_temp.repair_lock_version('EXPIRATION')) $$, 'vencimiento in_repair');
select lives_ok($$
  select public.reserve_repair_part(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000011'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'EXPIRATION'),
    'expected_lock_version', pg_temp.repair_lock_version('EXPIRATION'),
    'product_id', 'f5000000-0000-4000-8000-000000000004'::uuid,
    'warehouse_id', 'f6000000-0000-4000-8000-000000000001'::uuid,
    'location_id', 'f7000000-0000-4000-8000-000000000001'::uuid,
    'quantity_requested', 2,
    'expiration_date', '2099-12-31'
  ));
$$, 'reserva conserva el bucket de vencimiento');
select is(
  (select expiration_date from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'EXPIRATION')),
  '2099-12-31'::date,
  'la reserva persiste expiration_date'
);
select lives_ok($$
  select public.consume_repair_part(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_part_id', (select id from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'EXPIRATION')),
    'expected_lock_version', pg_temp.repair_lock_version('EXPIRATION'),
    'quantity', 2,
    'operation_key', 'f9000000-0000-4000-8000-000000000003'::uuid
  ));
$$, 'consumo conserva el bucket de vencimiento');
select results_eq(
  $$
    select part.expiration_date, consumption.expiration_date, movement.expiration_date
    from public.repair_parts part
    join public.repair_part_consumptions consumption
      on consumption.organization_id = part.organization_id
      and consumption.repair_part_id = part.id
    join public.inventory_movements movement
      on movement.organization_id = consumption.organization_id
      and movement.id = consumption.inventory_movement_id
    where part.repair_id = (select id from public.repairs where customer_reference = 'EXPIRATION')
  $$,
  $$ values ('2099-12-31'::date, '2099-12-31'::date, '2099-12-31'::date) $$,
  'reserva, consumo y movimiento comparten expiration_date'
);
select throws_ok($$
  select public.reserve_repair_part(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000012'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'EXPIRATION'),
    'expected_lock_version', pg_temp.repair_lock_version('EXPIRATION'),
    'product_id', 'f5000000-0000-4000-8000-000000000004'::uuid,
    'warehouse_id', 'f6000000-0000-4000-8000-000000000001'::uuid,
    'location_id', 'f7000000-0000-4000-8000-000000000001'::uuid,
    'quantity_requested', 1,
    'expiration_date', '2020-01-01'
  ));
$$, 'P0001', 'REPAIR_PART_EXPIRED', 'no reserva stock vencido');

-- ------------------------------------------------------------
-- Entrega: tecnicos, pruebas, repuestos pendientes y exito
-- ------------------------------------------------------------

select lives_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'testing', 'Pruebas finales', pg_temp.repair_lock_version('FLOW'))
$$, 'in_repair transiciona a testing');
select lives_ok($$
  select public.record_repair_test(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'FLOW'),
    'expected_lock_version', pg_temp.repair_lock_version('FLOW'),
    'test_type', 'Encendido',
    'result', 'Enciende y opera',
    'passed', true,
    'performed_by', 'f2000000-0000-4000-8000-000000000004'::uuid
  ));
  /*
  select public.record_repair_test(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'FLOW'),
    'test_type', 'Encendido',
    'result', 'Enciende y opera',
    'passed', true,
    'performed_by', 'f2000000-0000-4000-8000-000000000004'::uuid
  ));
  /*
  select public.record_repair_test('{"organization_id":"f1000000-0000-4000-8000-000000000001","repair_id":"' || (select id::text from public.repairs where customer_reference = 'FLOW') || '","test_type":"Encendido","result":"Enciende y opera","passed":true,"performed_by":"f2000000-0000-4000-8000-000000000004"}'::jsonb)
  */
  */
$$, 'registra prueba aprobada');
select lives_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'ready_for_delivery', 'Listo', pg_temp.repair_lock_version('FLOW'))
$$, 'testing transiciona a ready_for_delivery');
select lives_ok($$
  select public.deliver_repair('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'FLOW'), 'Entregado', pg_temp.repair_lock_version('FLOW'))
$$, 'entrega valida con tecnico, prueba aprobada y sin partes pendientes');
select is(
  (select status from public.repairs where customer_reference = 'FLOW'),
  'delivered'::text,
  'la reparacion valida queda delivered'
);
select is(
  (select count(*) from public.audit_events where action = 'REPAIR_DELIVERED' and entity_id = (select id::text from public.repairs where customer_reference = 'FLOW')),
  1::bigint,
  'la entrega deja auditoria especifica'
);

select lives_ok($$
  select public.create_repair('{"organization_id":"f1000000-0000-4000-8000-000000000001","operation_key":"f9100000-0000-4000-8000-000000000013","customer_id":"f4000000-0000-4000-8000-000000000002","product_id":"f5000000-0000-4000-8000-000000000001","problem_description":"Prueba de gates","customer_reference":"GATES"}'::jsonb)
$$, 'crea reparacion para gates de entrega');
select lives_ok($$ select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'GATES'), 'diagnosis', null, pg_temp.repair_lock_version('GATES')) $$, 'gates diagnosis');
select lives_ok($$ select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'GATES'), 'in_repair', null, pg_temp.repair_lock_version('GATES')) $$, 'gates in_repair');
select lives_ok($$ select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'GATES'), 'testing', null, pg_temp.repair_lock_version('GATES')) $$, 'gates testing');
select lives_ok($$
  select public.record_repair_test(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'GATES'),
    'expected_lock_version', pg_temp.repair_lock_version('GATES'),
    'test_type', 'Seguridad',
    'result', 'Falla',
    'passed', false,
    'performed_by', 'f2000000-0000-4000-8000-000000000004'::uuid
  ));
  /*
  select public.record_repair_test(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'GATES'),
    'expected_lock_version', pg_temp.repair_lock_version('GATES'),
    'test_type', 'Seguridad',
    'result', 'Falla',
    'passed', false,
    'performed_by', 'f2000000-0000-4000-8000-000000000004'::uuid
  ));
  /*
  select public.record_repair_test('{"organization_id":"f1000000-0000-4000-8000-000000000001","repair_id":"' || (select id::text from public.repairs where customer_reference = 'GATES') || '","test_type":"Seguridad","result":"Falla","passed":false,"performed_by":"f2000000-0000-4000-8000-000000000004"}'::jsonb)
  */
  */
$$, 'registra prueba fallida para gate');
select lives_ok($$
  select public.record_repair_test(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'GATES'),
    'expected_lock_version', pg_temp.repair_lock_version('GATES'),
    'test_type', 'Operacion',
    'result', 'Correcta',
    'passed', true,
    'performed_by', 'f2000000-0000-4000-8000-000000000004'::uuid
  ));
  /*
  select public.record_repair_test(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'GATES'),
    'test_type', 'Operacion',
    'result', 'Correcta',
    'passed', true,
    'performed_by', 'f2000000-0000-4000-8000-000000000004'::uuid
  ));
  /*
  select public.record_repair_test('{"organization_id":"f1000000-0000-4000-8000-000000000001","repair_id":"' || (select id::text from public.repairs where customer_reference = 'GATES') || '","test_type":"Operacion","result":"Correcta","passed":true,"performed_by":"f2000000-0000-4000-8000-000000000004"}'::jsonb)
  */
  */
$$, 'registra prueba aprobada para gate');
select throws_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'GATES'), 'ready_for_delivery', null, pg_temp.repair_lock_version('GATES'))
$$, 'P0001', 'REPAIR_ASSIGNED_TECHNICIAN_REQUIRED', 'ready exige tecnico asignado');
select lives_ok($$ select public.assign_repair('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'GATES'), 'f2000000-0000-4000-8000-000000000004', pg_temp.repair_lock_version('GATES')) $$, 'asigna tecnico al gate');
select throws_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'GATES'), 'ready_for_delivery', null, pg_temp.repair_lock_version('GATES'))
$$, 'P0001', 'REPAIR_FAILED_TEST_PRESENT', 'ready rechaza una prueba fallida del ciclo vigente');

select lives_ok($$
  select public.create_repair('{"organization_id":"f1000000-0000-4000-8000-000000000001","operation_key":"f9100000-0000-4000-8000-000000000014","customer_id":"f4000000-0000-4000-8000-000000000002","product_id":"f5000000-0000-4000-8000-000000000001","problem_description":"Parte pendiente","customer_reference":"PENDING_PART"}'::jsonb)
$$, 'crea reparacion con parte pendiente');
select lives_ok($$ select public.assign_repair('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'PENDING_PART'), 'f2000000-0000-4000-8000-000000000004', pg_temp.repair_lock_version('PENDING_PART')) $$, 'asigna tecnico a reparacion con parte');
select lives_ok($$ select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'PENDING_PART'), 'diagnosis', null, pg_temp.repair_lock_version('PENDING_PART')) $$, 'parte pendiente diagnosis');
select lives_ok($$ select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'PENDING_PART'), 'in_repair', null, pg_temp.repair_lock_version('PENDING_PART')) $$, 'parte pendiente in_repair');
select lives_ok($$
  select public.reserve_repair_part(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000015'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'PENDING_PART'),
    'expected_lock_version', pg_temp.repair_lock_version('PENDING_PART'),
    'product_id', 'f5000000-0000-4000-8000-000000000001'::uuid,
    'warehouse_id', 'f6000000-0000-4000-8000-000000000001'::uuid,
    'location_id', 'f7000000-0000-4000-8000-000000000001'::uuid,
    'quantity_requested', 1
  ));
  /*
  select public.reserve_repair_part('{"organization_id":"f1000000-0000-4000-8000-000000000001","repair_id":"' || (select id::text from public.repairs where customer_reference = 'PENDING_PART') || '","product_id":"f5000000-0000-4000-8000-000000000001","warehouse_id":"f6000000-0000-4000-8000-000000000001","location_id":"f7000000-0000-4000-8000-000000000001","quantity_requested":1}'::jsonb)
  */
$$, 'reserva parte para gate de entrega');
select lives_ok($$ select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'PENDING_PART'), 'testing', null, pg_temp.repair_lock_version('PENDING_PART')) $$, 'parte pendiente testing');
select lives_ok($$
  select public.record_repair_test(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'PENDING_PART'),
    'expected_lock_version', pg_temp.repair_lock_version('PENDING_PART'),
    'test_type', 'Operacion',
    'result', 'Correcta',
    'passed', true,
    'performed_by', 'f2000000-0000-4000-8000-000000000004'::uuid
  ));
  /*
  select public.record_repair_test('{"organization_id":"f1000000-0000-4000-8000-000000000001","repair_id":"' || (select id::text from public.repairs where customer_reference = 'PENDING_PART') || '","test_type":"Operacion","result":"Correcta","passed":true,"performed_by":"f2000000-0000-4000-8000-000000000004"}'::jsonb)
  */
$$, 'parte pendiente prueba aprobada');
select throws_ok($$
  select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'PENDING_PART'), 'ready_for_delivery', null, pg_temp.repair_lock_version('PENDING_PART'))
$$, 'P0001', 'REPAIR_PENDING_PARTS', 'ready rechaza partes reservadas restantes');
select lives_ok($$ select public.cancel_repair_part('f1000000-0000-4000-8000-000000000001', (select id from public.repair_parts where repair_id = (select id from public.repairs where customer_reference = 'PENDING_PART')), 'No requerido', pg_temp.repair_lock_version('PENDING_PART')) $$, 'cancela la reserva pendiente');
select lives_ok($$ select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'PENDING_PART'), 'ready_for_delivery', null, pg_temp.repair_lock_version('PENDING_PART')) $$, 'parte liberada queda ready');
select lives_ok($$ select public.deliver_repair('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'PENDING_PART'), 'Entregado', pg_temp.repair_lock_version('PENDING_PART')) $$, 'entrega luego de liberar la reserva');

-- ------------------------------------------------------------
-- Rechazo y cancelacion
-- ------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000002"}',
  true
);
select lives_ok($$
  select public.create_repair('{"organization_id":"f1000000-0000-4000-8000-000000000001","operation_key":"f9100000-0000-4000-8000-000000000016","customer_id":"f4000000-0000-4000-8000-000000000001","product_id":"f5000000-0000-4000-8000-000000000001","problem_description":"Cotizacion rechazada","customer_reference":"REJECT"}'::jsonb)
$$, 'crea reparacion para rechazo');
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000001"}',
  true
);
select lives_ok($$ select public.change_repair_status('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'REJECT'), 'diagnosis', null, pg_temp.repair_lock_version('REJECT')) $$, 'rechazo diagnosis');
select lives_ok($$
  select public.save_repair_quote(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000017'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'REJECT'),
    'expected_lock_version', pg_temp.repair_lock_version('REJECT'),
    'submit', true,
    'tax_rate', 7,
    'items', jsonb_build_array(
      jsonb_build_object('line_type', 'labor', 'description', 'Revision', 'quantity', 1, 'unit_price', 20)
    )
  ));
  /*
  select public.save_repair_quote('{"organization_id":"f1000000-0000-4000-8000-000000000001","repair_id":"' || (select id::text from public.repairs where customer_reference = 'REJECT') || '","submit":true,"tax_rate":7,"items":[{"line_type":"labor","description":"Revision","quantity":1,"unit_price":20}]}'::jsonb)
  */
$$, 'crea cotizacion para rechazo');
select lives_ok($$
  select public.reject_repair_quote('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'REJECT'), (select id from public.repair_quotes where repair_id = (select id from public.repairs where customer_reference = 'REJECT')), 'Cliente no aprueba', pg_temp.repair_lock_version('REJECT'))
$$, 'rechaza una cotizacion pending');
select results_eq(
  $$
    select repair.status, quote.status
    from public.repairs repair
    join public.repair_quotes quote on quote.repair_id = repair.id
    where repair.customer_reference = 'REJECT'
  $$,
  $$ values ('rejected'::text, 'rejected'::text) $$,
  'el rechazo sincroniza estados'
);
select throws_ok($$
  select public.change_repair_status(
    'f1000000-0000-4000-8000-000000000001',
    (select id from public.repairs where customer_reference = 'REJECT'),
    'quote_pending',
    'Reapertura generica',
    pg_temp.repair_lock_version('REJECT')
  )
$$, 'P0001', 'REPAIR_QUOTE_REVISION_REQUIRED', 'una reparacion rechazada solo reabre por revision');
select lives_ok($$
  select public.revise_repair_quote(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000018'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'REJECT'),
    'expected_lock_version', pg_temp.repair_lock_version('REJECT'),
    'rejected_quote_id', (
      select id from public.repair_quotes
      where repair_id = (select id from public.repairs where customer_reference = 'REJECT')
        and is_current
    ),
    'tax_rate', 7,
    'submit', false,
    'items', jsonb_build_array(
      jsonb_build_object('line_type', 'labor', 'description', 'Revision ajustada', 'quantity', 1, 'unit_price', 18)
    )
  ))
$$, 'crea explicitamente la siguiente version desde la rechazada');
select results_eq(
  $$
    select quote.version_number, quote.status, quote.is_current
    from public.repair_quotes quote
    where quote.repair_id = (select id from public.repairs where customer_reference = 'REJECT')
    order by quote.version_number
  $$,
  $$ values
    (1, 'rejected'::text, false),
    (2, 'draft'::text, true)
  $$,
  'la revision conserva la rechazada historica y deja una sola vigente'
);
select throws_ok($$
  select public.save_repair_quote(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000019'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'REJECT'),
    'expected_lock_version', pg_temp.repair_lock_version('REJECT'),
    'id', (
      select id from public.repair_quotes
      where repair_id = (select id from public.repairs where customer_reference = 'REJECT')
        and version_number = 1
    ),
    'items', jsonb_build_array(
      jsonb_build_object('line_type', 'labor', 'description', 'Version obsoleta', 'quantity', 1, 'unit_price', 1)
    )
  ))
$$, 'P0001', 'REPAIR_QUOTE_STALE_VERSION', 'no edita una version historica');
select throws_ok($$
  select public.save_repair_quote(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000020'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'REJECT'),
    'expected_lock_version', pg_temp.repair_lock_version('REJECT'),
    'items', jsonb_build_array(
      jsonb_build_object('line_type', 'labor', 'description', 'Nueva version implicita', 'quantity', 1, 'unit_price', 1)
    )
  ))
$$, 'P0001', 'REPAIR_QUOTE_REVISION_REQUIRED', 'no omite la ruta explicita despues de revisar');
select lives_ok($$
  select public.save_repair_quote(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'operation_key', 'f9100000-0000-4000-8000-000000000021'::uuid,
    'repair_id', (select id from public.repairs where customer_reference = 'REJECT'),
    'expected_lock_version', pg_temp.repair_lock_version('REJECT'),
    'id', (
      select id from public.repair_quotes
      where repair_id = (select id from public.repairs where customer_reference = 'REJECT')
        and is_current
    ),
    'submit', true,
    'tax_rate', 7,
    'items', jsonb_build_array(
      jsonb_build_object('line_type', 'labor', 'description', 'Revision ajustada', 'quantity', 1, 'unit_price', 18)
    )
  ))
$$, 'envia solamente la revision vigente');
select results_eq(
  $$
    select repair.status, quote.status, quote.version_number
    from public.repairs repair
    join public.repair_quotes quote
      on quote.organization_id = repair.organization_id
     and quote.repair_id = repair.id
     and quote.is_current
    where repair.customer_reference = 'REJECT'
  $$,
  $$ values ('waiting_customer_approval'::text, 'pending'::text, 2) $$,
  'el envio de la revision sincroniza la reparacion y la version vigente'
);
select throws_ok($$
  select public.approve_repair_quote(
    'f1000000-0000-4000-8000-000000000001',
    (select id from public.repairs where customer_reference = 'REJECT'),
    (
      select id from public.repair_quotes
      where repair_id = (select id from public.repairs where customer_reference = 'REJECT')
        and version_number = 1
    ),
    'Aprobacion obsoleta',
    pg_temp.repair_lock_version('REJECT')
  )
$$, 'P0001', 'REPAIR_QUOTE_STALE_VERSION', 'no aprueba una version historica');
select throws_ok($$
  select public.reject_repair_quote(
    'f1000000-0000-4000-8000-000000000001',
    (select id from public.repairs where customer_reference = 'REJECT'),
    (
      select id from public.repair_quotes
      where repair_id = (select id from public.repairs where customer_reference = 'REJECT')
        and version_number = 1
    ),
    'Rechazo obsoleto',
    pg_temp.repair_lock_version('REJECT')
  )
$$, 'P0001', 'REPAIR_QUOTE_STALE_VERSION', 'no rechaza una version historica');
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000002"}',
  true
);
select lives_ok($$ select public.create_repair('{"organization_id":"f1000000-0000-4000-8000-000000000001","operation_key":"f9100000-0000-4000-8000-000000000022","customer_id":"f4000000-0000-4000-8000-000000000002","product_id":"f5000000-0000-4000-8000-000000000001","problem_description":"Se cancela","customer_reference":"CANCEL"}'::jsonb) $$, 'crea reparacion cancelable');
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000001"}',
  true
);
select lives_ok($$ select public.cancel_repair('f1000000-0000-4000-8000-000000000001', (select id from public.repairs where customer_reference = 'CANCEL'), 'Cliente cancela', pg_temp.repair_lock_version('CANCEL')) $$, 'cancela una reparacion activa');
select is((select status from public.repairs where customer_reference = 'CANCEL'), 'cancelled'::text, 'la cancelacion persiste estado terminal');
select is((select count(*) from public.audit_events where action = 'REPAIR_CANCELLED' and entity_id = (select id::text from public.repairs where customer_reference = 'CANCEL')), 1::bigint, 'la cancelacion deja auditoria');
select lives_ok($$ update public.products set serial_control = true where id = 'f5000000-0000-4000-8000-000000000001' $$, 'permite cambiar control de serie del producto');
select lives_ok($$
  select public.update_repair(jsonb_build_object(
    'organization_id', 'f1000000-0000-4000-8000-000000000001'::uuid,
    'id', (select id from public.repairs where customer_reference = 'SERIAL_FALSE'),
    'expected_lock_version', pg_temp.repair_lock_version('SERIAL_FALSE'),
    'notes', 'Actualizada despues del cambio de configuracion'
  ));
$$, 'una reparacion existente conserva su regla de serie');

-- ------------------------------------------------------------
-- Aislamiento por tenant y ausencia de DELETE
-- ------------------------------------------------------------

reset role;
insert into public.repairs (
  id, organization_id, customer_id, product_id, problem_description,
  customer_name_snapshot, customer_document_snapshot, product_code_snapshot,
  product_description_snapshot, created_by, updated_by
)
values (
  'f8000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002',
  'f4000000-0000-4000-8000-000000000003',
  'f5000000-0000-4000-8000-000000000003',
  'Caso de otra organizacion', 'Cliente Reparacion Dos Org', 'DNI 40000003',
  'REP-OTHER-001', 'Producto de otra organizacion',
  'f2000000-0000-4000-8000-000000000005',
  'f2000000-0000-4000-8000-000000000005'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"f3000000-0000-4000-8000-000000000005"}',
  true
);
select is(
  (select count(*) from public.repair_list where organization_id = 'f1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'un tenant no ve reparaciones ajenas'
);
select is(
  (select count(*) from public.repair_list where organization_id = 'f1000000-0000-4000-8000-000000000002'),
  1::bigint,
  'un tenant ve sus reparaciones'
);
select throws_ok($$
  select public.create_repair('{"organization_id":"f1000000-0000-4000-8000-000000000001","operation_key":"f9100000-0000-4000-8000-000000000023","customer_id":"f4000000-0000-4000-8000-000000000001","product_id":"f5000000-0000-4000-8000-000000000001","problem_description":"Intento cruzado"}'::jsonb)
$$, '42501', 'REPAIR_FORBIDDEN', 'un RPC no permite cruzar organizaciones');

reset role;
select is(
  to_regprocedure('public.delete_repair(uuid, uuid)') is null,
  true,
  'no existe RPC de delete para reparaciones'
);
select is(
  has_table_privilege('authenticated', 'public.repair_events', 'DELETE'),
  false,
  'eventos no tienen DELETE directo'
);
select throws_ok($$
  update public.repair_events
  set observation = 'alterado'
  where id = (select min(id) from public.repair_events)
$$, 'P0001', 'REPAIR_EVENT_IMMUTABLE', 'la linea de tiempo es inmutable');
select ok(
  (select count(*) from public.audit_events where action in (
    'REPAIR_CREATED', 'REPAIR_UPDATED', 'REPAIR_STATUS_CHANGED',
    'REPAIR_DIAGNOSIS_CREATED', 'REPAIR_QUOTE_CREATED', 'REPAIR_QUOTE_SUBMITTED',
    'REPAIR_QUOTE_APPROVED', 'REPAIR_QUOTE_REJECTED', 'REPAIR_PART_RESERVED',
    'REPAIR_PART_CONSUMED', 'REPAIR_PART_CANCELLED', 'REPAIR_TEST_COMPLETED',
    'REPAIR_DELIVERED', 'REPAIR_CANCELLED'
  )) > 0,
  'las operaciones de reparaciones escriben acciones de auditoria aprobadas'
);

select * from finish();
rollback;
