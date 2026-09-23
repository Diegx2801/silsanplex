begin;

select plan(117);

select has_table('public', 'distribution_deliveries', 'existe la tabla persistente de distribución');
select has_table('public', 'distribution_command_operations', 'existe el registro de operaciones idempotentes');
select has_column('public', 'distribution_deliveries', 'delivery_status', 'existe el estado operativo');
select has_column('public', 'distribution_deliveries', 'scheduled_date', 'existe la fecha programada');
select has_column('public', 'distribution_deliveries', 'actual_delivery_date', 'existe la fecha real de entrega');
select has_column('public', 'distribution_deliveries', 'lock_version', 'existe la versión de concurrencia');
select has_column('public', 'distribution_deliveries', 'direction', 'existe la dirección de entrega');
select has_column('public', 'distribution_deliveries', 'numero_despacho', 'existe el número de despacho');
select has_column('public', 'distribution_deliveries', 'modalidad', 'existe la modalidad');
select has_column('public', 'distribution_deliveries', 'transportista', 'existe el transportista');
select has_column('public', 'distribution_deliveries', 'conductor', 'existe el conductor');
select has_column('public', 'distribution_deliveries', 'vehiculo', 'existe el vehículo');
select has_column('public', 'distribution_deliveries', 'placa', 'existe la placa');
select has_column('public', 'distribution_deliveries', 'evidencia', 'existe la evidencia');
select has_column('public', 'distribution_deliveries', 'incidencias', 'existe el arreglo de incidencias');
select has_column('public', 'distribution_deliveries', 'sale_id', 'existe el vínculo persistente con la venta');
select has_column('public', 'distribution_deliveries', 'sale_number', 'existe el número de venta persistente');
select has_function('public', 'save_distribution_delivery', array['jsonb'], 'existe el RPC de persistencia');
select has_function('public', 'record_distribution_status_transition', '{}', 'existe la auditoría de transiciones');
select has_function('public', 'list_distribution_delivery_status_history', array['uuid', 'uuid'], 'existe la lectura acotada del historial');
select has_function('public', 'validate_distribution_rescheduled_date', '{}', 'existe la validación de fecha al reprogramar');
select is(has_function_privilege('anon', 'public.list_distribution_delivery_status_history(uuid, uuid)', 'EXECUTE'), false, 'anon no puede leer el historial de distribución');
select is((select count(*) from pg_constraint where conname = 'distribution_deliveries_order_same_organization'), 1::bigint, 'la FK pedido-distribución conserva la organización');
select ok((select relrowsecurity from pg_class where oid = 'public.distribution_deliveries'::regclass), 'la tabla mantiene RLS');
select is(has_table_privilege('authenticated', 'public.distribution_deliveries', 'SELECT'), true, 'authenticated consulta distribución');
select is(has_table_privilege('authenticated', 'public.distribution_deliveries', 'INSERT'), false, 'authenticated no inserta directamente');

insert into public.organizations (id, name, slug)
values ('d3111111-1111-4111-8111-111111111111', 'Distribución de prueba', 'distribucion-prueba');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'e3111111-1111-4111-8111-111111111111',
  'distribucion.prueba@test.local',
  '{"full_name":"Operador distribución"}',
  now(),
  now()
);

insert into public.organization_memberships (organization_id, user_id)
values ('d3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111');
insert into public.user_roles (organization_id, user_id, role_code)
values ('d3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111', 'LOGISTICA');

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name, created_by, updated_by
) values (
  'c3111111-1111-4111-8111-111111111111',
  'd3111111-1111-4111-8111-111111111111',
  'RUC', '20111111111', 'Cliente persistente distribución',
  'e3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure, tax_affectation, batch_control, created_by, updated_by
) values (
  'b3111111-1111-4111-8111-111111111111',
  'd3111111-1111-4111-8111-111111111111',
  'DIST-001', 'Producto persistente distribución', 'UND', 'gravado', false,
  'e3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111'
);
insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
) values (
  'a3111111-1111-4111-8111-111111111121',
  'd3111111-1111-4111-8111-111111111111',
  'DIST', 'Almacén distribución',
  'e3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'a3111111-1111-4111-8111-111111111123',
  'd3111111-1111-4111-8111-111111111111',
  'a3111111-1111-4111-8111-111111111121',
  'GENERAL', 'Ubicación general',
  'e3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111'
);

insert into public.orders (
  id, organization_id, order_number, customer_id, warehouse_id, order_date,
  status, operation_key, created_by, updated_by
) values
  (
    'a3111111-1111-4111-8111-111111111111',
    'd3111111-1111-4111-8111-111111111111', 'PED-000001',
    'c3111111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111121',
    '2026-08-30', 'confirmado', 'a3111111-1111-4111-8111-111111111131',
    'e3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111'
  ),
  (
    'a3111111-1111-4111-8111-111111111112',
    'd3111111-1111-4111-8111-111111111111', 'PED-000002',
    'c3111111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111121',
    '2026-09-01', 'confirmado', 'a3111111-1111-4111-8111-111111111132',
    'e3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111'
  );
insert into public.order_items (
  id, organization_id, order_id, product_id, product_code, product_description,
  unit_of_measure, quantity, unit_price
) values
  (
    'a3111111-1111-4111-8111-111111111141',
    'd3111111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111111',
    'b3111111-1111-4111-8111-111111111111', 'DIST-001', 'Producto persistente distribución', 'UND', 2, 10
  ),
  (
    'a3111111-1111-4111-8111-111111111142',
    'd3111111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111112',
    'b3111111-1111-4111-8111-111111111111', 'DIST-001', 'Producto persistente distribución', 'UND', 3, 10
  );
insert into public.sales (
  id, organization_id, order_id, customer_id, internal_number, document_type,
  series, document_number, sale_date, warehouse, operation_key, created_by, updated_by
) values
  (
    'a3111111-1111-4111-8111-111111111151',
    'd3111111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111111',
    'c3111111-1111-4111-8111-111111111111', 'VEN-000001', 'factura', 'F001', '1',
    '2026-08-30', 'Almacén distribución', 'a3111111-1111-4111-8111-111111111161',
    'e3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111'
  ),
  (
    'a3111111-1111-4111-8111-111111111152',
    'd3111111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111112',
    'c3111111-1111-4111-8111-111111111111', 'VEN-000002', 'factura', 'F001', '2',
    '2026-09-01', 'Almacén distribución', 'a3111111-1111-4111-8111-111111111162',
    'e3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111'
  );
insert into public.sale_items (
  id, organization_id, sale_id, order_id, order_item_id, product_id,
  product_code, product_description, unit_of_measure, quantity, unit_price
) values
  (
    'a3111111-1111-4111-8111-111111111171',
    'd3111111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111151',
    'a3111111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111141',
    'b3111111-1111-4111-8111-111111111111', 'DIST-001', 'Producto persistente distribución', 'UND', 2, 10
  ),
  (
    'a3111111-1111-4111-8111-111111111172',
    'd3111111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111152',
    'a3111111-1111-4111-8111-111111111112', 'a3111111-1111-4111-8111-111111111142',
    'b3111111-1111-4111-8111-111111111111', 'DIST-001', 'Producto persistente distribución', 'UND', 3, 10
  );

-- Representa una salida física completa del primer pedido y una salida parcial
-- del segundo. La venta del segundo permanece registrada, como ocurre si aún
-- tiene servicios pendientes, para verificar que Distribución evalúa bienes.
insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status,
  quantity, quantity_consumed, status, source_type, source_id,
  created_by, updated_by
) values
  (
    'a3111111-1111-4111-8111-111111111181',
    'd3111111-1111-4111-8111-111111111111', 'b3111111-1111-4111-8111-111111111111',
    'a3111111-1111-4111-8111-111111111121',
    (select id from public.warehouse_locations where organization_id = 'd3111111-1111-4111-8111-111111111111' and warehouse_id = 'a3111111-1111-4111-8111-111111111121' and code = 'GENERAL'),
    'available', 2, 2, 'consumed', 'order-item', 'a3111111-1111-4111-8111-111111111141',
    'e3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111'
  ),
  (
    'a3111111-1111-4111-8111-111111111182',
    'd3111111-1111-4111-8111-111111111111', 'b3111111-1111-4111-8111-111111111111',
    'a3111111-1111-4111-8111-111111111121',
    (select id from public.warehouse_locations where organization_id = 'd3111111-1111-4111-8111-111111111111' and warehouse_id = 'a3111111-1111-4111-8111-111111111121' and code = 'GENERAL'),
    'available', 3, 1, 'released', 'order-item', 'a3111111-1111-4111-8111-111111111142',
    'e3111111-1111-4111-8111-111111111111', 'e3111111-1111-4111-8111-111111111111'
  );

-- Simula una fila creada antes de que existieran las columnas nuevas.
insert into public.distribution_deliveries (
  id, organization_id, order_id, order_number, customer_name, issue_date,
  delivery_date, guide_number, transport_type, tracking_status, observations,
  order_items, created_by, updated_by
) values (
  'f3111111-1111-4111-8111-111111111111',
  'd3111111-1111-4111-8111-111111111111',
  'a3111111-1111-4111-8111-111111111111',
  'PED-H-001', 'Cliente histórico', '2026-08-30', '2026-08-31',
  'G-H-001', 'interno', 'en_curso', '',
  '[{"id":"linea-h","productoDescripcion":"Producto histórico","cantidad":1,"unidadMedida":"UND"}]'::jsonb,
  'e3111111-1111-4111-8111-111111111111',
  'e3111111-1111-4111-8111-111111111111'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e3111111-1111-4111-8111-111111111111', true);

select is((select count(*) from public.distribution_deliveries), 1::bigint, 'se puede leer la entrega histórica');
select is((select delivery_status from public.distribution_deliveries where id = 'f3111111-1111-4111-8111-111111111111'), 'programado', 'la fila histórica recibe estado por defecto');
select is((select direction from public.distribution_deliveries where id = 'f3111111-1111-4111-8111-111111111111'), '', 'la fila histórica conserva dirección vacía');
select is((select numero_despacho from public.distribution_deliveries where id = 'f3111111-1111-4111-8111-111111111111'), '', 'la fila histórica conserva despacho vacío');
select is((select modalidad from public.distribution_deliveries where id = 'f3111111-1111-4111-8111-111111111111'), 'movilidad_propia', 'la fila histórica recibe modalidad por defecto');
select is((select incidencias from public.distribution_deliveries where id = 'f3111111-1111-4111-8111-111111111111'), '[]'::jsonb, 'la fila histórica recibe incidencias vacías');

reset role;
update public.orders
set fulfillment_mode = 'pickup'
where id = 'a3111111-1111-4111-8111-111111111111';
set local role authenticated;

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111111',
    'order_number', 'PED-PICKUP', 'customer_name', 'Cliente recojo',
    'issue_date', '2026-08-30', 'delivery_date', '2026-09-02',
    'guide_number', 'G-PICKUP', 'transport_type', 'interno',
    'direction', 'Av. Prueba', 'numero_despacho', 'DES-PICKUP',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-pickup', 'cantidad', 1))
  ));
$$, 'P0001', 'DISTRIBUTION_PICKUP_NOT_SUPPORTED', 'rechaza pedidos de recojo en una programación de ruta');

reset role;
update public.orders
set fulfillment_mode = 'delivery'
where id = 'a3111111-1111-4111-8111-111111111111';
set local role authenticated;

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-N-001', 'customer_name', 'Cliente nuevo',
    'issue_date', '2026-09-01', 'delivery_date', '2026-09-02',
    'guide_number', 'G-N-PENDING', 'transport_type', 'interno',
    'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-PENDING',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'P0001', 'DISTRIBUTION_ORDER_NOT_DISPATCHED', 'rechaza una venta con despacho pendiente o parcial');

reset role;
update public.inventory_reservations
set quantity_consumed = quantity,
    status = 'consumed'
where source_type = 'order-item'
  and source_id = 'a3111111-1111-4111-8111-111111111142';
set local role authenticated;

select is((select sum(quantity_consumed) from public.inventory_reservations where source_type = 'order-item' and source_id = 'a3111111-1111-4111-8111-111111111142'), 3::numeric, 'la salida física queda completa sin forzar el estado global de la venta');

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-N-001',
    'customer_name', 'Cliente nuevo',
    'issue_date', '2026-09-01',
    'delivery_date', '2026-09-02',
    'guide_number', 'g-n-001',
    'transport_type', 'externo',
    'tracking_status', 'en_curso',
    'delivery_status', 'programado',
    'operation_key', '31111111-1111-4111-8111-111111111111',
    'direction', 'Av. Nueva 123',
    'numero_despacho', 'DES-N-001',
    'modalidad', 'movilidad_externa',
    'transportista', 'Transportes Prueba',
    'conductor', 'Ana Pérez',
    'vehiculo', 'Camión',
    'placa', 'ABC-123',
    'evidencia', 'foto-entrega.jpg',
    'incidencias', jsonb_build_array('Demora de 10 minutos'),
    'observations', 'Entrega de prueba',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'el RPC guarda una entrega con todos los campos nuevos');

select is((select count(*) from public.distribution_deliveries where guide_number = 'G-N-001'), 1::bigint, 'la guía nueva se normaliza a mayúsculas');
select is((select scheduled_date from public.distribution_deliveries where guide_number = 'G-N-001'), '2026-09-02'::date, 'la fecha programada se separa de la fecha real');
select ok((select actual_delivery_date is null from public.distribution_deliveries where guide_number = 'G-N-001'), 'una entrega programada no tiene fecha real');
select is((select delivery_status from public.distribution_deliveries where guide_number = 'G-N-001'), 'programado', 'una entrega nueva inicia programada');
select is((select fulfillment_status from public.orders where id = 'a3111111-1111-4111-8111-111111111112'), 'dispatched', 'programar la entrega conserva el despacho físico confirmado');
select is((select direction from public.distribution_deliveries where guide_number = 'G-N-001'), 'Av. Nueva 123', 'persiste la dirección');
select is((select numero_despacho from public.distribution_deliveries where guide_number = 'G-N-001'), 'DES-N-001', 'persiste el número de despacho');
select is((select modalidad from public.distribution_deliveries where guide_number = 'G-N-001'), 'movilidad_externa', 'persiste la modalidad');
select is((select transportista from public.distribution_deliveries where guide_number = 'G-N-001'), 'Transportes Prueba', 'persiste el transportista');
select is((select conductor from public.distribution_deliveries where guide_number = 'G-N-001'), 'Ana Pérez', 'persiste el conductor');
select is((select vehiculo from public.distribution_deliveries where guide_number = 'G-N-001'), 'Camión', 'persiste el vehículo');
select is((select placa from public.distribution_deliveries where guide_number = 'G-N-001'), 'ABC-123', 'persiste la placa normalizada');
select is((select evidencia from public.distribution_deliveries where guide_number = 'G-N-001'), 'foto-entrega.jpg', 'persiste la evidencia');
select is((select incidencias from public.distribution_deliveries where guide_number = 'G-N-001'), '["Demora de 10 minutos"]'::jsonb, 'persiste las incidencias');
select is((select sale_id from public.distribution_deliveries where guide_number = 'G-N-001'), 'a3111111-1111-4111-8111-111111111152'::uuid, 'la entrega queda ligada a la venta real');
select is((select sale_number from public.distribution_deliveries where guide_number = 'G-N-001'), 'VEN-000002', 'persiste el número real de venta');
select is((select order_items -> 0 ->> 'id' from public.distribution_deliveries where guide_number = 'G-N-001'), 'a3111111-1111-4111-8111-111111111142', 'las líneas se reconstruyen desde order_items y no desde el payload');

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-N-001', 'customer_name', 'Cliente nuevo',
    'issue_date', '2026-09-01', 'delivery_date', '2026-09-02', 'guide_number', 'g-n-001',
    'transport_type', 'externo', 'tracking_status', 'en_curso', 'delivery_status', 'programado',
    'operation_key', '31111111-1111-4111-8111-111111111111',
    'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001', 'modalidad', 'movilidad_externa',
    'transportista', 'Transportes Prueba', 'conductor', 'Ana Pérez', 'vehiculo', 'Camión',
    'placa', 'ABC-123', 'evidencia', 'foto-entrega.jpg',
    'incidencias', jsonb_build_array('Demora de 10 minutos'), 'observations', 'Entrega de prueba',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'repite sin duplicar una operación equivalente');
select is((select count(*) from public.distribution_deliveries where guide_number = 'G-N-001'), 1::bigint, 'el retry idempotente conserva una sola entrega');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-N-001', 'customer_name', 'Cliente cambiado',
    'issue_date', '2026-09-01', 'delivery_date', '2026-09-02', 'guide_number', 'g-n-001',
    'transport_type', 'externo', 'tracking_status', 'en_curso', 'delivery_status', 'programado',
    'operation_key', '31111111-1111-4111-8111-111111111111',
    'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001', 'modalidad', 'movilidad_externa',
    'transportista', 'Transportes Prueba', 'conductor', 'Ana Pérez', 'vehiculo', 'Camión',
    'placa', 'ABC-123', 'evidencia', 'foto-entrega.jpg',
    'incidencias', jsonb_build_array('Demora de 10 minutos'), 'observations', 'Entrega de prueba',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'P0001', 'DISTRIBUTION_OPERATION_KEY_REUSED', 'rechaza reutilizar la clave con otro payload');

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expected_lock_version', 1,
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-000002', 'customer_name', 'Cliente persistente distribución',
    'issue_date', '2026-09-01', 'delivery_date', '2026-09-02', 'guide_number', 'G-N-001',
    'transport_type', 'externo', 'tracking_status', 'en_curso', 'delivery_status', 'preparando',
    'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001', 'modalidad', 'movilidad_externa',
    'transportista', 'Transportes Prueba', 'conductor', 'Ana Pérez', 'vehiculo', 'Camión',
    'placa', 'ABC-123', 'evidencia', 'foto-entrega.jpg',
    'incidencias', jsonb_build_array('Demora de 10 minutos'), 'observations', 'Entrega de prueba',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'permite una transición válida de programado a preparando');
select is((select delivery_status from public.distribution_deliveries where guide_number = 'G-N-001'), 'preparando', 'persiste la transición a preparación');
select is((select fulfillment_status from public.orders where id = 'a3111111-1111-4111-8111-111111111112'), 'preparing', 'la preparación logística no vuelve el pedido a pendiente');
select is((select lock_version from public.distribution_deliveries where guide_number = 'G-N-001'), 2::bigint, 'incrementa la versión al actualizar');

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expected_lock_version', 2,
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-000002', 'customer_name', 'Cliente persistente distribución',
    'issue_date', '2026-09-01', 'delivery_date', '2026-09-02', 'guide_number', 'G-N-001',
    'transport_type', 'externo', 'tracking_status', 'en_curso', 'delivery_status', 'en_curso',
    'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001', 'modalidad', 'movilidad_externa',
    'transportista', 'Transportes Prueba', 'conductor', 'Ana Pérez', 'vehiculo', 'Camión',
    'placa', 'ABC-123', 'evidencia', 'foto-entrega.jpg',
    'incidencias', jsonb_build_array('Demora de 10 minutos'), 'observations', 'Entrega de prueba',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'permite una transición válida de preparando a en curso');
select is((select delivery_status from public.distribution_deliveries where guide_number = 'G-N-001'), 'en_curso', 'persiste la transición a en curso');
select is((select fulfillment_status from public.orders where id = 'a3111111-1111-4111-8111-111111111112'), 'dispatched', 'iniciar la ruta refleja que los bienes siguen fuera del almacén');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expected_lock_version', 3,
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-000002', 'customer_name', 'Cliente persistente distribución',
    'issue_date', '2026-09-01', 'delivery_date', '2026-09-04', 'scheduled_date', '2026-09-04', 'guide_number', 'G-N-001',
    'transport_type', 'externo', 'tracking_status', 'en_curso', 'delivery_status', 'en_curso',
    'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001', 'modalidad', 'movilidad_externa',
    'transportista', 'Transportes Prueba', 'conductor', 'Ana Pérez', 'vehiculo', 'Camión',
    'placa', 'ABC-123', 'evidencia', 'foto-entrega.jpg',
    'incidencias', jsonb_build_array('Demora de 10 minutos'), 'observations', 'Entrega de prueba',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'P0001', 'DISTRIBUTION_ROUTE_ALREADY_STARTED', 'impide reprogramar una entrega que ya está en ruta');

select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd3111111-1111-4111-8111-111111111111',
    'entregaId', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expectedLockVersion', 3,
    'operationKey', '41111111-1111-4111-8111-111111111115',
    'resultado', 'rechazado', 'fecha', '2026-09-02',
    'incidencias', jsonb_build_array('Cliente ausente'), 'lineas', '[]'::jsonb
  ));
$$, '22023', 'DISTRIBUTION_OUTCOME_FAILURE_CATEGORY_REQUIRED', 'exige clasificar un intento sin entrega');

select lives_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd3111111-1111-4111-8111-111111111111',
    'entregaId', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expectedLockVersion', 3,
    'operationKey', '41111111-1111-4111-8111-111111111116',
    'resultado', 'rechazado', 'fecha', '2026-09-02',
    'categoriaIncidencia', 'cliente_ausente',
    'incidencias', jsonb_build_array('El cliente no estaba disponible'), 'lineas', '[]'::jsonb
  ));
$$, 'registra un intento fallido con categoría y motivo');
select is((select delivery_status from public.distribution_deliveries where guide_number = 'G-N-001'), 'rechazado', 'el intento fallido deja la entrega lista para reprogramarse');
select is((select failure_category from public.distribution_delivery_outcomes where operation_key = '41111111-1111-4111-8111-111111111116'), 'cliente_ausente', 'conserva la categoría estructurada del intento');

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expected_lock_version', 4,
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-000002', 'customer_name', 'Cliente persistente distribución',
    'issue_date', '2026-09-01',
    'delivery_date', pg_catalog.timezone('America/Lima', pg_catalog.now())::date,
    'scheduled_date', pg_catalog.timezone('America/Lima', pg_catalog.now())::date,
    'guide_number', 'G-N-001', 'transport_type', 'externo', 'tracking_status', 'en_curso',
    'delivery_status', 'reprogramado', 'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001',
    'modalidad', 'movilidad_externa', 'transportista', 'Transportes Prueba',
    'conductor', 'Ana Pérez', 'vehiculo', 'Camión', 'placa', 'ABC-123',
    'evidencia', 'foto-entrega.jpg', 'incidencias', jsonb_build_array('El cliente no estaba disponible'),
    'observations', 'Reprogramado luego del intento fallido',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'reprograma atómicamente un intento fallido con nueva fecha');
select is((select delivery_status from public.distribution_deliveries where guide_number = 'G-N-001'), 'reprogramado', 'persiste el estado reprogramado');
select is((select fulfillment_status from public.orders where id = 'a3111111-1111-4111-8111-111111111112'), 'dispatched', 'reprogramar la entrega no deshace el despacho de Ventas');
select is((select scheduled_date from public.distribution_deliveries where guide_number = 'G-N-001'), pg_catalog.timezone('America/Lima', pg_catalog.now())::date, 'persiste la fecha nueva en la reprogramación');
select is((select lock_version from public.distribution_deliveries where guide_number = 'G-N-001'), 5::bigint, 'la reprogramación incrementa la versión una sola vez');

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expected_lock_version', 5, 'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112', 'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-000002', 'customer_name', 'Cliente persistente distribución',
    'issue_date', '2026-09-01', 'delivery_date', pg_catalog.timezone('America/Lima', pg_catalog.now())::date,
    'scheduled_date', pg_catalog.timezone('America/Lima', pg_catalog.now())::date,
    'guide_number', 'G-N-001', 'transport_type', 'externo', 'tracking_status', 'en_curso',
    'delivery_status', 'preparando', 'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001',
    'modalidad', 'movilidad_externa', 'transportista', 'Transportes Prueba', 'conductor', 'Ana Pérez',
    'vehiculo', 'Camión', 'placa', 'ABC-123', 'evidencia', 'foto-entrega.jpg',
    'incidencias', jsonb_build_array('El cliente no estaba disponible'), 'observations', 'Nuevo intento',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'permite preparar nuevamente una entrega reprogramada');
select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expected_lock_version', 6, 'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112', 'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-000002', 'customer_name', 'Cliente persistente distribución',
    'issue_date', '2026-09-01', 'delivery_date', pg_catalog.timezone('America/Lima', pg_catalog.now())::date,
    'scheduled_date', pg_catalog.timezone('America/Lima', pg_catalog.now())::date,
    'guide_number', 'G-N-001', 'transport_type', 'externo', 'tracking_status', 'en_curso',
    'delivery_status', 'en_curso', 'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001',
    'modalidad', 'movilidad_externa', 'transportista', 'Transportes Prueba', 'conductor', 'Ana Pérez',
    'vehiculo', 'Camión', 'placa', 'ABC-123', 'evidencia', 'foto-entrega.jpg',
    'incidencias', jsonb_build_array('El cliente no estaba disponible'), 'observations', 'Nuevo intento en ruta',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'permite iniciar la ruta del nuevo intento');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expected_lock_version', 7,
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-000002', 'customer_name', 'Cliente persistente distribución',
    'issue_date', '2026-09-01', 'delivery_date', '2026-09-02', 'guide_number', 'G-N-001',
    'transport_type', 'externo', 'tracking_status', 'en_curso', 'delivery_status', 'entrega_parcial',
    'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001', 'modalidad', 'movilidad_externa',
    'transportista', 'Transportes Prueba', 'conductor', 'Ana Pérez', 'vehiculo', 'Camión',
    'placa', 'ABC-123', 'evidencia', 'firma.jpg', 'incidencias', '[]'::jsonb,
    'observations', '', 'items', jsonb_build_array(jsonb_build_object('id', 'a3111111-1111-4111-8111-111111111142', 'cantidad', 3))
  ));
$$, 'P0001', 'DISTRIBUTION_OUTCOME_REQUIRED', 'impide cerrar la entrega cambiando solo el estado');

select lives_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd3111111-1111-4111-8111-111111111111',
    'entregaId', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expectedLockVersion', 7,
    'operationKey', '41111111-1111-4111-8111-111111111111',
    'resultado', 'entrega_parcial', 'fecha', '2026-09-02', 'evidencia', 'firma parcial',
    'incidencias', '[]'::jsonb,
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a3111111-1111-4111-8111-111111111142', 'cantidad', 1))
  ));
$$, 'registra atómicamente una recepción parcial por producto');
select is((select delivery_status from public.distribution_deliveries where guide_number = 'G-N-001'), 'entrega_parcial', 'la recepción parcial deja la entrega abierta');
select is((select lock_version from public.distribution_deliveries where guide_number = 'G-N-001'), 8::bigint, 'el resultado parcial avanza la versión de concurrencia');
select is((select quantity_delivered from public.distribution_delivery_outcome_lines where order_line_id = 'a3111111-1111-4111-8111-111111111142'), 1::numeric, 'conserva la cantidad recibida por línea');
select is((select fulfillment_status from public.orders where id = 'a3111111-1111-4111-8111-111111111112'), 'partially_fulfilled', 'proyecta la recepción parcial al cumplimiento del pedido');

select is(public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd3111111-1111-4111-8111-111111111111',
    'entregaId', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expectedLockVersion', 7,
    'operationKey', '41111111-1111-4111-8111-111111111111',
    'resultado', 'entrega_parcial', 'fecha', '2026-09-02', 'evidencia', 'firma parcial',
    'incidencias', '[]'::jsonb,
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a3111111-1111-4111-8111-111111111142', 'cantidad', 1))
  )), (select id from public.distribution_delivery_outcomes where operation_key = '41111111-1111-4111-8111-111111111111'), 'un reintento idempotente devuelve el mismo resultado');
select is((select count(*) from public.distribution_delivery_outcomes where delivery_id = (select id from public.distribution_deliveries where guide_number = 'G-N-001')), 2::bigint, 'el reintento no duplica la recepción');

select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd3111111-1111-4111-8111-111111111111',
    'entregaId', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expectedLockVersion', 8,
    'operationKey', '41111111-1111-4111-8111-111111111112',
    'resultado', 'entrega_parcial', 'fecha', '2026-09-03', 'evidencia', 'segunda visita',
    'incidencias', '[]'::jsonb,
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a3111111-1111-4111-8111-111111111142', 'cantidad', 3))
  ));
$$, '22023', 'DISTRIBUTION_OUTCOME_QUANTITY_EXCEEDED', 'rechaza recibir más que el saldo de la línea');

select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd3111111-1111-4111-8111-111111111111',
    'entregaId', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expectedLockVersion', 8,
    'operationKey', '41111111-1111-4111-8111-111111111113',
    'resultado', 'entregado', 'fecha', '2026-09-03', 'evidencia', 'firma final',
    'incidencias', '[]'::jsonb,
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a3111111-1111-4111-8111-111111111142', 'cantidad', 1))
  ));
$$, '22023', 'DISTRIBUTION_OUTCOME_TOTAL_INCOMPLETE', 'no permite marcar completa una recepción con saldo pendiente');

select lives_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd3111111-1111-4111-8111-111111111111',
    'entregaId', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'expectedLockVersion', 8,
    'operationKey', '41111111-1111-4111-8111-111111111114',
    'resultado', 'entregado', 'fecha', '2026-09-03', 'evidencia', 'firma final',
    'incidencias', '[]'::jsonb,
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a3111111-1111-4111-8111-111111111142', 'cantidad', 2))
  ));
$$, 'permite cerrar el saldo con una segunda recepción completa');
select is((select delivery_status from public.distribution_deliveries where guide_number = 'G-N-001'), 'entregado', 'la segunda recepción cierra la entrega');
select is((select sum(quantity_delivered) from public.distribution_delivery_outcome_lines where order_line_id = 'a3111111-1111-4111-8111-111111111142'), 3::numeric, 'el historial acumula exactamente la cantidad pedida');
select is((select fulfillment_status from public.orders where id = 'a3111111-1111-4111-8111-111111111112'), 'delivered', 'proyecta el cierre al cumplimiento del pedido');
select is((select count(*) from public.distribution_delivery_outcomes where delivery_id = (select id from public.distribution_deliveries where guide_number = 'G-N-001')), 3::bigint, 'conserva el intento fallido y las recepciones parciales y finales');

reset role;
select is((select count(*) from public.audit_events where action = 'DISTRIBUTION_STATUS_CHANGED' and entity_id = (select id::text from public.distribution_deliveries where guide_number = 'G-N-001')), 8::bigint, 'registra cada transición válida una sola vez');
select is((select old_values ->> 'delivery_status' from public.audit_events where action = 'DISTRIBUTION_STATUS_CHANGED' and entity_id = (select id::text from public.distribution_deliveries where guide_number = 'G-N-001') order by id desc limit 1), 'entrega_parcial', 'audita el estado anterior');
select is((select new_values ->> 'delivery_status' from public.audit_events where action = 'DISTRIBUTION_STATUS_CHANGED' and entity_id = (select id::text from public.distribution_deliveries where guide_number = 'G-N-001') order by id desc limit 1), 'entregado', 'audita el estado nuevo');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e3111111-1111-4111-8111-111111111111', true);

select is((select count(*) from public.list_distribution_delivery_status_history('d3111111-1111-4111-8111-111111111111', (select id from public.distribution_deliveries where guide_number = 'G-N-001'))), 10::bigint, 'presenta cronológicamente los intentos, la reprogramación y todas las etapas');
select is((select actor_name from public.list_distribution_delivery_status_history('d3111111-1111-4111-8111-111111111111', (select id from public.distribution_deliveries where guide_number = 'G-N-001')) order by occurred_at desc limit 1), 'Operador distribución', 'muestra quién realizó la última transición');
select throws_ok($$
  select * from public.list_distribution_delivery_status_history(
    'd3111111-1111-4111-8111-111111111111',
    'f3111111-1111-4111-8111-111111111199'
  )
$$, 'P0001', 'DISTRIBUTION_NOT_FOUND', 'no expone el historial de una entrega inexistente');
select throws_ok($$
  select * from public.list_distribution_delivery_status_history('d3111111-1111-4111-8111-111111111112', (select id from public.distribution_deliveries where guide_number = 'G-N-001'))
$$, '42501', 'DISTRIBUTION_FORBIDDEN', 'no expone historial de entregas de otra organización');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'expected_lock_version', 1,
    'order_number', 'PED-000002', 'customer_name', 'Cliente persistente distribución',
    'issue_date', '2026-09-01', 'delivery_date', '2026-09-02', 'guide_number', 'G-N-001',
    'transport_type', 'externo', 'tracking_status', 'en_curso', 'delivery_status', 'en_curso',
    'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001', 'modalidad', 'movilidad_externa',
    'transportista', 'Transportes Prueba', 'conductor', 'Ana Pérez', 'vehiculo', 'Camión',
    'placa', 'ABC-123', 'evidencia', 'foto-entrega.jpg',
    'incidencias', jsonb_build_array('Demora de 10 minutos'), 'observations', 'Entrega de prueba',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'P0001', 'DISTRIBUTION_VERSION_CONFLICT', 'rechaza una versión obsoleta');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', (select id from public.distribution_deliveries where guide_number = 'G-N-001'),
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'expected_lock_version', 9,
    'order_number', 'PED-000002', 'customer_name', 'Cliente persistente distribución',
    'issue_date', '2026-09-01', 'delivery_date', '2026-09-02', 'guide_number', 'G-N-001',
    'transport_type', 'externo', 'tracking_status', 'en_curso', 'delivery_status', 'devuelto',
    'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001', 'modalidad', 'movilidad_externa',
    'transportista', 'Transportes Prueba', 'conductor', 'Ana Pérez', 'vehiculo', 'Camión',
    'placa', 'ABC-123', 'evidencia', 'foto-entrega.jpg',
    'incidencias', jsonb_build_array('Demora de 10 minutos'), 'observations', 'Entrega de prueba',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, 'P0001', 'DISTRIBUTION_INVALID_TRANSITION', 'rechaza saltar de en curso a devuelto');
select is((select delivery_status from public.distribution_deliveries where guide_number = 'G-N-001'), 'entregado', 'una transición inválida no modifica la entrega');

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', 'f3111111-1111-4111-8111-111111111111',
    'expected_lock_version', 1,
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111111',
    'order_number', 'PED-H-001', 'customer_name', 'Cliente histórico',
    'issue_date', '2026-08-30', 'delivery_date', '2026-08-31',
    'guide_number', 'G-H-001', 'transport_type', 'interno',
    'tracking_status', 'en_curso', 'delivery_status', 'preparando',
    'direction', '', 'numero_despacho', '', 'modalidad', 'movilidad_propia',
    'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '',
    'evidencia', '', 'incidencias', '[]'::jsonb, 'observations', '',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-h', 'cantidad', 1))
  ));
$$, 'una actualización de seguimiento no rompe filas históricas');
select is((select delivery_status from public.distribution_deliveries where id = 'f3111111-1111-4111-8111-111111111111'), 'preparando', 'actualiza el estado histórico mediante una transición válida');

reset role;
update public.distribution_deliveries
set scheduled_date = '2026-09-01'
where id = 'f3111111-1111-4111-8111-111111111111';
select is((select count(*) from public.audit_events where action = 'DISTRIBUTION_SCHEDULE_CHANGED' and entity_id = 'f3111111-1111-4111-8111-111111111111'), 1::bigint, 'audita el cambio de fecha programada');
select is((select to_scheduled_date from public.list_distribution_delivery_status_history('d3111111-1111-4111-8111-111111111111', 'f3111111-1111-4111-8111-111111111111') where event_type = 'schedule'), '2026-09-01'::date, 'expone en el historial la nueva fecha programada');
select throws_ok($$
  update public.distribution_deliveries
  set delivery_status = 'reprogramado',
      scheduled_date = pg_catalog.timezone('America/Lima', pg_catalog.now())::date - 1
  where id = 'f3111111-1111-4111-8111-111111111111'
$$, 'P0001', 'DISTRIBUTION_RESCHEDULE_DATE_IN_PAST', 'la base de datos rechaza reprogramar una entrega a una fecha pasada');
update public.distribution_deliveries
set quantity_reconciliation_required = true
where id = 'f3111111-1111-4111-8111-111111111111';
set local role authenticated;

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', 'f3111111-1111-4111-8111-111111111111',
    'expected_lock_version', 2,
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111111',
    'order_number', 'PED-H-001', 'customer_name', 'Cliente histórico',
    'issue_date', '2026-08-30', 'delivery_date', '2026-09-02', 'guide_number', 'G-H-001',
    'transport_type', 'interno', 'tracking_status', 'en_curso', 'delivery_status', 'en_curso',
    'direction', 'Av. Histórica 1', 'numero_despacho', 'DES-H-001', 'modalidad', 'movilidad_propia',
    'transportista', '', 'conductor', 'Conductor', 'vehiculo', 'Camión', 'placa', 'HIS-001',
    'evidencia', '', 'incidencias', '[]'::jsonb, 'observations', '',
    'items', jsonb_build_array(jsonb_build_object('id', 'a3111111-1111-4111-8111-111111111141', 'cantidad', 2))
  ));
$$, 'P0001', 'DISTRIBUTION_OUTCOME_RECONCILIATION_REQUIRED', 'bloquea avanzar un estado histórico con cantidades no conciliadas');
select is((select delivery_status from public.distribution_deliveries where id = 'f3111111-1111-4111-8111-111111111111'), 'preparando', 'conserva intacto el estado histórico que requiere conciliación');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111113', 'order_number', 'PED-000003',
    'customer_name', 'Pedido inexistente', 'issue_date', '2026-09-01', 'delivery_date', '2026-09-02',
    'guide_number', 'G-NOT-FOUND', 'transport_type', 'interno', 'direction', 'Av. Prueba',
    'numero_despacho', 'DES-NOT-FOUND', 'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 1))
  ));
$$, 'P0001', 'DISTRIBUTION_ORDER_NOT_FOUND', 'rechaza pedido persistente inexistente');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111112',
    'order_id', 'a3111111-1111-4111-8111-111111111112', 'order_number', 'PED-000002',
    'customer_name', 'Cruce de organización', 'issue_date', '2026-09-01', 'delivery_date', '2026-09-02',
    'guide_number', 'G-CROSS-ORG', 'transport_type', 'interno', 'direction', 'Av. Prueba',
    'numero_despacho', 'DES-CROSS-ORG', 'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 1))
  ));
$$, '42501', 'DISTRIBUTION_FORBIDDEN', 'rechaza operación de otra organización');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112', 'sale_id', 'a3111111-1111-4111-8111-111111111152',
    'order_number', 'PED-000002', 'customer_name', 'Cliente persistente distribución',
    'issue_date', '2026-09-01', 'delivery_date', '2026-09-02', 'guide_number', 'G-N-001',
    'transport_type', 'externo', 'direction', 'Av. Nueva 123', 'numero_despacho', 'DES-N-001',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-falsa', 'cantidad', 999))
  ));
$$, '23505', 'DISTRIBUTION_DUPLICATE_GUIDE_OR_ORDER', 'un retry no duplica la entrega');
select is((select count(*) from public.distribution_deliveries where order_id = 'a3111111-1111-4111-8111-111111111112'), 1::bigint, 'el retry conserva una sola entrega');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111113', 'order_number', 'PED-I-001',
    'customer_name', 'Cliente inválido', 'issue_date', '2026-09-01', 'delivery_date', '2026-09-02',
    'guide_number', 'G-I-001', 'transport_type', 'cliente', 'direction', 'Av. Prueba',
    'numero_despacho', 'DES-I-001', 'items', jsonb_build_array(jsonb_build_object('id', 'linea-i'))
  ));
$$, '22023', 'DISTRIBUTION_TRANSPORT_INVALID', 'rechaza cliente como tipo de transporte');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111114', 'order_number', 'PED-I-002',
    'customer_name', 'Cliente inválido', 'issue_date', '2026-09-01', 'delivery_date', '2026-09-02',
    'guide_number', 'G-I-002', 'transport_type', 'interno', 'numero_despacho', 'DES-I-002',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-i'))
  ));
$$, '22023', 'DISTRIBUTION_DIRECTION_REQUIRED', 'exige dirección en nuevas entregas');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111115', 'order_number', 'PED-I-003',
    'customer_name', 'Cliente inválido', 'issue_date', '2026-09-01', 'delivery_date', '2026-09-02',
    'guide_number', 'G-I-003', 'transport_type', 'interno', 'direction', 'Av. Prueba',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-i'))
  ));
$$, '22023', 'DISTRIBUTION_DISPATCH_NUMBER_REQUIRED', 'exige número de despacho en nuevas entregas');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111116', 'order_number', 'PED-I-004',
    'customer_name', 'Cliente inválido', 'issue_date', '2026-09-01', 'delivery_date', '2026-09-02',
    'guide_number', '', 'transport_type', 'interno', 'direction', 'Av. Prueba',
    'numero_despacho', 'DES-I-004', 'items', jsonb_build_array(jsonb_build_object('id', 'linea-i'))
  ));
$$, '22023', 'DISTRIBUTION_GUIDE_REQUIRED', 'exige guía en nuevas entregas');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111117', 'order_number', 'PED-I-005',
    'customer_name', 'Cliente inválido', 'issue_date', '2026-09-01', 'delivery_date', '2026-09-02',
    'guide_number', 'G-I-005', 'transport_type', 'interno', 'direction', 'Av. Prueba',
    'numero_despacho', 'DES-I-005', 'modalidad', 'otra_modalidad',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-i'))
  ));
$$, '22023', 'DISTRIBUTION_MODALITY_INVALID', 'rechaza modalidades desconocidas');

select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111118', 'order_number', 'PED-I-006',
    'customer_name', 'Cliente inválido', 'issue_date', '2026-09-01', 'delivery_date', '2026-09-02',
    'guide_number', 'G-I-006', 'transport_type', 'interno', 'direction', 'Av. Prueba',
    'numero_despacho', 'DES-I-006', 'incidencias', '{}'::jsonb,
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-i'))
  ));
$$, '22023', 'DISTRIBUTION_INCIDENTS_INVALID', 'rechaza incidencias que no sean arreglo');

reset role;
select * from finish();
rollback;
