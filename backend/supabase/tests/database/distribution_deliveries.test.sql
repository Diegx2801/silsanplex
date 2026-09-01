begin;

select plan(41);

select has_table('public', 'distribution_deliveries', 'existe la tabla persistente de distribución');
select has_column('public', 'distribution_deliveries', 'delivery_status', 'existe el estado operativo');
select has_column('public', 'distribution_deliveries', 'direction', 'existe la dirección de entrega');
select has_column('public', 'distribution_deliveries', 'numero_despacho', 'existe el número de despacho');
select has_column('public', 'distribution_deliveries', 'modalidad', 'existe la modalidad');
select has_column('public', 'distribution_deliveries', 'transportista', 'existe el transportista');
select has_column('public', 'distribution_deliveries', 'conductor', 'existe el conductor');
select has_column('public', 'distribution_deliveries', 'vehiculo', 'existe el vehículo');
select has_column('public', 'distribution_deliveries', 'placa', 'existe la placa');
select has_column('public', 'distribution_deliveries', 'evidencia', 'existe la evidencia');
select has_column('public', 'distribution_deliveries', 'incidencias', 'existe el arreglo de incidencias');
select has_function('public', 'save_distribution_delivery', array['jsonb'], 'existe el RPC de persistencia');
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

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111112',
    'order_number', 'PED-N-001',
    'customer_name', 'Cliente nuevo',
    'issue_date', '2026-09-01',
    'delivery_date', '2026-09-02',
    'guide_number', 'g-n-001',
    'transport_type', 'externo',
    'tracking_status', 'en_curso',
    'delivery_status', 'en_curso',
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
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-n', 'cantidad', 2))
  ));
$$, 'el RPC guarda una entrega con todos los campos nuevos');

select is((select count(*) from public.distribution_deliveries where guide_number = 'G-N-001'), 1::bigint, 'la guía nueva se normaliza a mayúsculas');
select is((select delivery_status from public.distribution_deliveries where guide_number = 'G-N-001'), 'en_curso', 'persiste el estado operativo');
select is((select direction from public.distribution_deliveries where guide_number = 'G-N-001'), 'Av. Nueva 123', 'persiste la dirección');
select is((select numero_despacho from public.distribution_deliveries where guide_number = 'G-N-001'), 'DES-N-001', 'persiste el número de despacho');
select is((select modalidad from public.distribution_deliveries where guide_number = 'G-N-001'), 'movilidad_externa', 'persiste la modalidad');
select is((select transportista from public.distribution_deliveries where guide_number = 'G-N-001'), 'Transportes Prueba', 'persiste el transportista');
select is((select conductor from public.distribution_deliveries where guide_number = 'G-N-001'), 'Ana Pérez', 'persiste el conductor');
select is((select vehiculo from public.distribution_deliveries where guide_number = 'G-N-001'), 'Camión', 'persiste el vehículo');
select is((select placa from public.distribution_deliveries where guide_number = 'G-N-001'), 'ABC-123', 'persiste la placa normalizada');
select is((select evidencia from public.distribution_deliveries where guide_number = 'G-N-001'), 'foto-entrega.jpg', 'persiste la evidencia');
select is((select incidencias from public.distribution_deliveries where guide_number = 'G-N-001'), '["Demora de 10 minutos"]'::jsonb, 'persiste las incidencias');

select lives_ok($$
  select public.save_distribution_delivery(jsonb_build_object(
    'id', 'f3111111-1111-4111-8111-111111111111',
    'organization_id', 'd3111111-1111-4111-8111-111111111111',
    'order_id', 'a3111111-1111-4111-8111-111111111111',
    'order_number', 'PED-H-001', 'customer_name', 'Cliente histórico',
    'issue_date', '2026-08-30', 'delivery_date', '2026-08-31',
    'guide_number', 'G-H-001', 'transport_type', 'interno',
    'tracking_status', 'en_destino', 'delivery_status', 'en_destino',
    'direction', '', 'numero_despacho', '', 'modalidad', 'movilidad_propia',
    'transportista', '', 'conductor', '', 'vehiculo', '', 'placa', '',
    'evidencia', '', 'incidencias', '[]'::jsonb, 'observations', '',
    'items', jsonb_build_array(jsonb_build_object('id', 'linea-h', 'cantidad', 1))
  ));
$$, 'una actualización de seguimiento no rompe filas históricas');
select is((select delivery_status from public.distribution_deliveries where id = 'f3111111-1111-4111-8111-111111111111'), 'en_destino', 'actualiza el estado histórico');

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
