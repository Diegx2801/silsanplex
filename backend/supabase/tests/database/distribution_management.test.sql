begin;

select plan(43);

-- Contrato y superficie segura.
select has_table('public', 'distribution_orders', 'existen órdenes logísticas persistidas');
select has_table('public', 'distribution_order_items', 'existe detalle persistido de la orden');
select has_table('public', 'distribution_deliveries', 'existen cabeceras de entrega');
select has_table('public', 'distribution_delivery_items', 'existen cantidades por entrega');
select has_table('public', 'distribution_delivery_events', 'existe bitácora de seguimiento');
select has_table('public', 'distribution_incidents', 'existen incidencias');
select has_table('public', 'distribution_evidence', 'existen metadatos de evidencia');
select has_table('public', 'distribution_returns', 'existen devoluciones');
select has_function('public', 'save_distribution_delivery', array['jsonb'], 'existe guardado transaccional');
select has_function('public', 'transition_distribution_delivery', array['jsonb'], 'existe transición controlada');
select has_function('public', 'save_distribution_incident', array['jsonb'], 'existe gestión de incidencias');
select has_function('public', 'register_distribution_return', array['jsonb'], 'existe registro de devoluciones');
select has_function('public', 'register_distribution_evidence', array['jsonb'], 'existe registro de evidencias');
select ok((select relrowsecurity from pg_class where oid = 'public.distribution_orders'::regclass), 'órdenes tienen RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.distribution_delivery_events'::regclass), 'eventos tienen RLS');
select is(has_table_privilege('anon', 'public.distribution_orders', 'SELECT'), false, 'anon no consulta distribución');
select is(has_table_privilege('authenticated', 'public.distribution_orders', 'INSERT'), false, 'órdenes solo se crean mediante RPC');
select is((select count(*) from public.permissions where code like 'DISTRIBUTION_%'), 4::bigint, 'existen cuatro permisos granulares');
select is((select count(*) from public.role_permissions where role_code = 'LOGISTICA' and permission_code like 'DISTRIBUTION_%'), 4::bigint, 'LOGISTICA recibe capacidades completas');
select is((select public from storage.buckets where id = 'distribution-evidence'), false, 'el bucket de evidencias es privado');

-- Dos empresas, un operador logístico y productos trazables.
insert into public.organizations (id, name, slug) values
  ('d8111111-1111-4111-8111-111111111111', 'Distribución uno', 'distribucion-prueba-uno'),
  ('d8222222-2222-4222-8222-222222222222', 'Distribución dos', 'distribucion-prueba-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('e8111111-1111-4111-8111-111111111111', 'logistica.distribucion@test.local', '{"full_name":"Operador logístico"}', now(), now()),
  ('e8222222-2222-4222-8222-222222222222', 'logistica.otra@test.local', '{"full_name":"Operador otra empresa"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('d8111111-1111-4111-8111-111111111111', 'e8111111-1111-4111-8111-111111111111'),
  ('d8222222-2222-4222-8222-222222222222', 'e8222222-2222-4222-8222-222222222222');

insert into public.user_roles (organization_id, user_id, role_code) values
  ('d8111111-1111-4111-8111-111111111111', 'e8111111-1111-4111-8111-111111111111', 'LOGISTICA'),
  ('d8222222-2222-4222-8222-222222222222', 'e8222222-2222-4222-8222-222222222222', 'LOGISTICA');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, batch_control, created_by, updated_by
) values (
  'f8111111-1111-4111-8111-111111111111', 'd8111111-1111-4111-8111-111111111111',
  'DIST-001', 'Producto para entrega parcial', 'UND', true,
  'e8111111-1111-4111-8111-111111111111', 'e8111111-1111-4111-8111-111111111111'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8111111-1111-4111-8111-111111111111', true);

select ok(public.has_organization_permission('d8111111-1111-4111-8111-111111111111', 'DISTRIBUTION_TRACK'), 'LOGISTICA actualiza seguimiento');

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd8111111-1111-4111-8111-111111111111',
    'delivery_date', (current_date + 1)::text,
    'guide_number', 'T001-000001',
    'transport_type', 'interno',
    'driver_name', 'Ana Conductora',
    'driver_document', '45678901',
    'driver_license', 'Q45678901',
    'vehicle_plate', 'ABC-123',
    'destination_address', 'Av. Principal 123, Lima',
    'destination_reference', 'Puerta de recepción',
    'observations', 'Primera salida parcial',
    'order', jsonb_build_object(
      'id', 'a8111111-1111-4111-8111-111111111111',
      'number', 'PED-900001',
      'customer_id', 'c8111111-1111-4111-8111-111111111111',
      'customer_name', 'Cliente de distribución SAC',
      'customer_document', '20111111111',
      'order_date', current_date::text,
      'delivery_address', 'Av. Principal 123, Lima',
      'items', jsonb_build_array(jsonb_build_object(
        'id', 'linea-1',
        'product_id', 'f8111111-1111-4111-8111-111111111111',
        'product_code', 'DIST-001',
        'product_description', 'Producto para entrega parcial',
        'unit_of_measure', 'UND',
        'ordered_quantity', 10
      ))
    ),
    'delivery_items', jsonb_build_array(jsonb_build_object(
      'source_item_id', 'linea-1', 'shipped_quantity', 6, 'lot_number', 'L-001',
      'expiration_date', '2028-12-31'
    ))
  ))
$$, 'programa la primera entrega parcial');

select is((select count(*) from public.distribution_orders), 1::bigint, 'la orden queda persistida una sola vez');
select is((select customer_id from public.distribution_orders limit 1), null::uuid, 'una referencia histórica inexistente no bloquea la instantánea logística');
select is((select count(*) from public.distribution_delivery_items), 1::bigint, 'la entrega conserva su detalle normalizado');
select is((select tracking_status from public.distribution_deliveries where guide_number = 'T001-000001'), 'programada', 'la entrega inicia programada');
select is((select status from public.distribution_orders where order_number = 'PED-900001'), 'parcial', 'la orden refleja una asignación parcial');

select lives_ok($$
  select public.transition_distribution_delivery(jsonb_build_object(
    'organization_id', 'd8111111-1111-4111-8111-111111111111',
    'delivery_id', (select id from public.distribution_deliveries where guide_number = 'T001-000001'),
    'status', 'en_transito', 'description', 'Unidad salió del almacén'
  ))
$$, 'registra la salida a ruta');

select lives_ok($$
  select public.transition_distribution_delivery(jsonb_build_object(
    'organization_id', 'd8111111-1111-4111-8111-111111111111',
    'delivery_id', (select id from public.distribution_deliveries where guide_number = 'T001-000001'),
    'status', 'entrega_parcial', 'description', 'Cliente recibió cuatro unidades',
    'items', jsonb_build_array(jsonb_build_object(
      'id', (select id from public.distribution_delivery_items limit 1),
      'delivered_quantity', 4, 'rejected_quantity', 2
    ))
  ))
$$, 'registra resultado parcial por producto');

select results_eq(
  $$select delivered_quantity, rejected_quantity from public.distribution_delivery_items limit 1$$,
  $$values (4.000::numeric, 2.000::numeric)$$,
  'las cantidades entregadas y rechazadas quedan separadas'
);

select lives_ok($$
  select public.save_distribution_incident(jsonb_build_object(
    'organization_id', 'd8111111-1111-4111-8111-111111111111',
    'delivery_id', (select id from public.distribution_deliveries where guide_number = 'T001-000001'),
    'incident_type', 'danio', 'severity', 'alta',
    'description', 'Dos unidades llegaron con embalaje deteriorado'
  ))
$$, 'registra una incidencia operativa');

select is((select status from public.distribution_incidents limit 1), 'abierta', 'la incidencia inicia abierta');

select lives_ok($$
  select public.register_distribution_return(jsonb_build_object(
    'organization_id', 'd8111111-1111-4111-8111-111111111111',
    'delivery_id', (select id from public.distribution_deliveries where guide_number = 'T001-000001'),
    'reason', 'Cliente devuelve una unidad recibida',
    'items', jsonb_build_array(jsonb_build_object(
      'delivery_item_id', (select id from public.distribution_delivery_items limit 1),
      'quantity', 1, 'item_condition', 'danado'
    ))
  ))
$$, 'registra una devolución parcial');

select is((select returned_quantity from public.distribution_delivery_items limit 1), 1.000::numeric, 'la devolución actualiza la cantidad devuelta');
select is((select tracking_status from public.distribution_deliveries where guide_number = 'T001-000001'), 'entrega_parcial', 'una devolución parcial no marca todo el despacho como devuelto');

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd8111111-1111-4111-8111-111111111111',
    'delivery_date', (current_date + 2)::text,
    'guide_number', 'T001-000002', 'transport_type', 'externo',
    'carrier_name', 'Transportes Seguros SAC', 'carrier_document', '20999999991',
    'driver_name', 'Luis Transportista', 'vehicle_plate', 'XYZ-789',
    'destination_address', 'Av. Principal 123, Lima',
    'order', jsonb_build_object(
      'id', 'a8111111-1111-4111-8111-111111111111', 'number', 'PED-900001',
      'customer_name', 'Cliente de distribución SAC', 'order_date', current_date::text,
      'delivery_address', 'Av. Principal 123, Lima',
      'items', jsonb_build_array(jsonb_build_object(
        'id', 'linea-1', 'product_id', 'f8111111-1111-4111-8111-111111111111',
        'product_code', 'DIST-001', 'product_description', 'Producto para entrega parcial',
        'unit_of_measure', 'UND', 'ordered_quantity', 10
      ))
    ),
    'delivery_items', jsonb_build_array(jsonb_build_object('source_item_id', 'linea-1', 'shipped_quantity', 7))
  ))
$$, 'reprograma en otro despacho las cantidades todavía pendientes');

select is((select count(*) from public.distribution_deliveries), 2::bigint, 'un pedido admite múltiples entregas');
select throws_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd8111111-1111-4111-8111-111111111111',
    'delivery_date', (current_date + 3)::text,
    'guide_number', 'T001-000003', 'transport_type', 'interno',
    'driver_name', 'Conductor extra', 'vehicle_plate', 'AAA-111',
    'destination_address', 'Av. Principal 123, Lima',
    'order', jsonb_build_object(
      'id', 'a8111111-1111-4111-8111-111111111111', 'number', 'PED-900001',
      'customer_name', 'Cliente de distribución SAC', 'order_date', current_date::text,
      'delivery_address', 'Av. Principal 123, Lima',
      'items', jsonb_build_array(jsonb_build_object(
        'id', 'linea-1', 'product_id', 'f8111111-1111-4111-8111-111111111111',
        'product_code', 'DIST-001', 'product_description', 'Producto para entrega parcial',
        'unit_of_measure', 'UND', 'ordered_quantity', 10
      ))
    ),
    'delivery_items', jsonb_build_array(jsonb_build_object('source_item_id', 'linea-1', 'shipped_quantity', 1))
  ))
$$, '22023', 'DISTRIBUTION_QUANTITY_EXCEEDED', 'impide sobreasignar cantidades del pedido');

select cmp_ok((select count(*) from public.distribution_delivery_events), '>=', 5::bigint, 'la bitácora conserva los eventos operativos');
reset role;
select cmp_ok((select count(*) from public.audit_events where entity_type like 'distribution_%'), '>=', 3::bigint, 'las operaciones sensibles dejan auditoría global');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8222222-2222-4222-8222-222222222222', true);
select is((select count(*) from public.distribution_orders), 0::bigint, 'otra empresa no consulta órdenes ajenas');
select is((select count(*) from public.distribution_deliveries), 0::bigint, 'otra empresa no consulta entregas ajenas');
select throws_ok($$
  select public.transition_distribution_delivery(jsonb_build_object(
    'organization_id', 'd8111111-1111-4111-8111-111111111111',
    'delivery_id', (select id from public.distribution_deliveries limit 1),
    'status', 'en_transito'
  ))
$$, '42501', 'DISTRIBUTION_FORBIDDEN', 'otra empresa no modifica entregas ajenas');

reset role;
select * from finish();
rollback;
