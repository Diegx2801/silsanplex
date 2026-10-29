begin;

select plan(32);

select is(
  to_regprocedure('public.inventory_adjustment_warehouses_read(uuid,uuid,text,integer,integer)') is not null,
  true,
  'existe la lectura de almacenes candidatos para ajuste'
);
select is(
  (select prosecdef from pg_catalog.pg_proc where oid = to_regprocedure('public.inventory_adjustment_warehouses_read(uuid,uuid,text,integer,integer)')),
  true,
  'la lectura de almacenes usa SECURITY DEFINER'
);
select is(
  to_regprocedure('public.inventory_movement_warehouses_read(uuid,uuid,text,text,integer,integer)') is not null,
  true,
  'existe la búsqueda paginada de almacenes para movimientos'
);
select is(
  (select prosecdef from pg_catalog.pg_proc where oid = to_regprocedure('public.inventory_movement_warehouses_read(uuid,uuid,text,text,integer,integer)')),
  true,
  'la búsqueda de almacenes para movimientos usa SECURITY DEFINER'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid = to_regprocedure('public.inventory_movement_warehouses_read(uuid,uuid,text,text,integer,integer)')),
  true,
  'la búsqueda de almacenes para movimientos fija search_path vacio'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid = to_regprocedure('public.inventory_adjustment_warehouses_read(uuid,uuid,text,integer,integer)')),
  true,
  'la lectura de almacenes fija search_path vacio'
);
select is(has_function_privilege('authenticated', 'public.inventory_adjustment_warehouses_read(uuid,uuid,text,integer,integer)', 'EXECUTE'), true, 'authenticated puede consultar almacenes para ajuste');
select is(has_function_privilege('anon', 'public.inventory_adjustment_warehouses_read(uuid,uuid,text,integer,integer)', 'EXECUTE'), false, 'anon no puede consultar almacenes para ajuste');
select is(has_function_privilege('service_role', 'public.inventory_adjustment_warehouses_read(uuid,uuid,text,integer,integer)', 'EXECUTE'), false, 'service_role no recibe un grant adicional');
select is(has_function_privilege('authenticated', 'public.inventory_movement_warehouses_read(uuid,uuid,text,text,integer,integer)', 'EXECUTE'), true, 'authenticated puede buscar almacenes para movimientos');
select is(has_function_privilege('anon', 'public.inventory_movement_warehouses_read(uuid,uuid,text,text,integer,integer)', 'EXECUTE'), false, 'anon no puede buscar almacenes para movimientos');
select is(has_function_privilege('service_role', 'public.inventory_movement_warehouses_read(uuid,uuid,text,text,integer,integer)', 'EXECUTE'), false, 'service_role no recibe un grant adicional para movimientos');

insert into public.organizations (id, name, slug)
values
  ('a1400000-0000-4000-8000-000000000001', 'Ajustes Inventario A', 'a14-inventario-a'),
  ('a1400000-0000-4000-8000-000000000002', 'Ajustes Inventario B', 'a14-inventario-b');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('a1410000-0000-4000-8000-000000000001', 'a14-inventory@test.local', '{}', now(), now()),
  ('a1410000-0000-4000-8000-000000000002', 'a14-other@test.local', '{}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('a1400000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001'),
  ('a1400000-0000-4000-8000-000000000002', 'a1410000-0000-4000-8000-000000000002');

insert into public.organization_user_permissions (organization_id, user_id, permission_code)
values ('a1400000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', 'INVENTORY_VIEW');

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by, is_active)
values
  ('a1420000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000001', 'A14-MAIN', 'Almacén principal', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', true),
  ('a1420000-0000-4000-8000-000000000002', 'a1400000-0000-4000-8000-000000000001', 'A14-SEC', 'Almacén secundario', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', true),
  ('a1420000-0000-4000-8000-000000000003', 'a1400000-0000-4000-8000-000000000001', 'A14-RES', 'Almacén reservado', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', true),
  ('a1420000-0000-4000-8000-000000000004', 'a1400000-0000-4000-8000-000000000001', 'A14-EMPTY', 'Almacén sin stock', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', true),
  ('a1420000-0000-4000-8000-000000000005', 'a1400000-0000-4000-8000-000000000001', 'A14-OFF', 'Almacén inactivo', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', false),
  ('a1420000-0000-4000-8000-000000000006', 'a1400000-0000-4000-8000-000000000001', 'A14-LOC', 'Almacén sin ubicación activa', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', true),
  ('a1420000-0000-4000-8000-000000000007', 'a1400000-0000-4000-8000-000000000002', 'A14-OTHER', 'Almacén de otra organización', 'a1410000-0000-4000-8000-000000000002', 'a1410000-0000-4000-8000-000000000002', true);

insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by, is_active)
values
  ('a1430000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000001', 'A14-A', 'Anaquel A', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', true),
  ('a1430000-0000-4000-8000-000000000002', 'a1400000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000002', 'A14-B', 'Anaquel B', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', true),
  ('a1430000-0000-4000-8000-000000000003', 'a1400000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000003', 'A14-R', 'Anaquel reservado', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', true),
  ('a1430000-0000-4000-8000-000000000004', 'a1400000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000004', 'A14-E', 'Anaquel vacío', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', true),
  ('a1430000-0000-4000-8000-000000000005', 'a1400000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000005', 'A14-O', 'Anaquel inactivo', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', true),
  ('a1430000-0000-4000-8000-000000000006', 'a1400000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000006', 'A14-I', 'Anaquel desactivado', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', false),
  ('a1430000-0000-4000-8000-000000000007', 'a1400000-0000-4000-8000-000000000002', 'a1420000-0000-4000-8000-000000000007', 'A14-X', 'Anaquel externo', 'a1410000-0000-4000-8000-000000000002', 'a1410000-0000-4000-8000-000000000002', true);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  batch_control, expiration_control, is_active
)
values
  ('a1440000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000001', 'A14-GOOD', 'Bien activo', 'Unidad', 'good', false, false, true),
  ('a1440000-0000-4000-8000-000000000002', 'a1400000-0000-4000-8000-000000000001', 'A14-SERVICE', 'Servicio', 'Unidad', 'service', false, false, true),
  ('a1440000-0000-4000-8000-000000000003', 'a1400000-0000-4000-8000-000000000001', 'A14-INACTIVE', 'Bien inactivo', 'Unidad', 'good', false, false, false),
  ('a1440000-0000-4000-8000-000000000004', 'a1400000-0000-4000-8000-000000000002', 'A14-OTHER', 'Bien otra organización', 'Unidad', 'good', false, false, true);

set local session_replication_role = replica;
insert into public.inventory_movements (
  id, organization_id, product_id, product_code, product_description,
  unit_of_measure, movement_type, quantity, warehouse, lot, expiration_date,
  operation_date, reason, source_type, created_by, warehouse_id, location_id,
  stock_status, unit_cost
)
values
  ('a1450000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'A14-GOOD', 'Bien activo', 'Unidad', 'entrada', 10, 'Almacén principal', 'L-AVAIL', '2030-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000001', 'a1430000-0000-4000-8000-000000000001', 'available', 1),
  ('a1450000-0000-4000-8000-000000000011', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'A14-GOOD', 'Bien activo', 'Unidad', 'entrada', 2, 'Almacén principal', 'L-EXPIRED', '2020-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000001', 'a1430000-0000-4000-8000-000000000001', 'available', 1),
  ('a1450000-0000-4000-8000-000000000002', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'A14-GOOD', 'Bien activo', 'Unidad', 'entrada', 4, 'Almacén principal', 'L-QUARANTINE', '2020-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000001', 'a1430000-0000-4000-8000-000000000001', 'quarantine', 1),
  ('a1450000-0000-4000-8000-000000000003', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'A14-GOOD', 'Bien activo', 'Unidad', 'entrada', 3, 'Almacén principal', 'L-DAMAGED', '2027-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000001', 'a1430000-0000-4000-8000-000000000001', 'damaged', 1),
  ('a1450000-0000-4000-8000-000000000004', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'A14-GOOD', 'Bien activo', 'Unidad', 'entrada', 2, 'Almacén secundario', 'L-SECONDARY', '2030-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000002', 'a1430000-0000-4000-8000-000000000002', 'available', 1),
  ('a1450000-0000-4000-8000-000000000005', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'A14-GOOD', 'Bien activo', 'Unidad', 'entrada', 5, 'Almacén reservado', 'L-RESERVED', '2030-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000003', 'a1430000-0000-4000-8000-000000000003', 'available', 1),
  ('a1450000-0000-4000-8000-000000000006', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'A14-GOOD', 'Bien activo', 'Unidad', 'entrada', 6, 'Almacén inactivo', 'L-OFF', '2030-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000005', 'a1430000-0000-4000-8000-000000000005', 'available', 1),
  ('a1450000-0000-4000-8000-000000000007', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'A14-GOOD', 'Bien activo', 'Unidad', 'entrada', 7, 'Almacén sin ubicación activa', 'L-LOC-OFF', '2030-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000006', 'a1430000-0000-4000-8000-000000000006', 'available', 1),
  ('a1450000-0000-4000-8000-000000000008', 'a1400000-0000-4000-8000-000000000002', 'a1440000-0000-4000-8000-000000000004', 'A14-OTHER', 'Bien otra organización', 'Unidad', 'entrada', 8, 'Almacén de otra organización', 'L-OTHER', '2030-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000002', 'a1420000-0000-4000-8000-000000000007', 'a1430000-0000-4000-8000-000000000007', 'available', 1),
  ('a1450000-0000-4000-8000-000000000009', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000002', 'A14-SERVICE', 'Servicio', 'Unidad', 'entrada', 9, 'Almacén principal', 'L-SERVICE', '2030-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000001', 'a1430000-0000-4000-8000-000000000001', 'available', 1),
  ('a1450000-0000-4000-8000-000000000010', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000003', 'A14-INACTIVE', 'Bien inactivo', 'Unidad', 'entrada', 10, 'Almacén principal', 'L-INACTIVE', '2030-01-01', '2026-10-01', 'Entrada de prueba', 'manual', 'a1410000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000001', 'a1430000-0000-4000-8000-000000000001', 'available', 1);
set local session_replication_role = origin;

insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status, lot, expiration_date,
  quantity, quantity_consumed, status, source_type, source_id, created_by, updated_by
)
values
  ('a1460000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000001', 'a1430000-0000-4000-8000-000000000001', 'available', 'L-AVAIL', '2030-01-01', 2, 0, 'active', 'a14-test', 'a1470000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001'),
  ('a1460000-0000-4000-8000-000000000002', 'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'a1420000-0000-4000-8000-000000000003', 'a1430000-0000-4000-8000-000000000003', 'available', 'L-RESERVED', '2030-01-01', 5, 0, 'active', 'a14-test', 'a1470000-0000-4000-8000-000000000002', 'a1410000-0000-4000-8000-000000000001', 'a1410000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1410000-0000-4000-8000-000000000001', true);

select is(
  jsonb_array_length((public.inventory_adjustment_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001')->'items')),
  2,
  'solo aparecen almacenes activos con stock fisico no reservado'
);
select is(
  (public.inventory_adjustment_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001')->'items'->0->>'adjustable_quantity')::numeric,
  17::numeric,
  'el total ajustable incluye stock disponible, vencido, en cuarentena y dañado'
);
select is(
  (public.inventory_adjustment_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'secundario')->'items'->0->>'warehouse_code'),
  'A14-SEC',
  'la búsqueda ignora mayúsculas y encuentra código o nombre del almacén'
);
select is(
  (public.inventory_adjustment_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', '', 1, 1)->'items'->0->>'warehouse_code'),
  'A14-SEC',
  'la lista usa paginación determinista y conserva el total elegible'
);
select is(
  (public.inventory_adjustment_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', '', 1, 1)->>'total_count')::integer,
  2,
  'el total informa más resultados que el primer lote de opciones'
);
select is(
  public.inventory_adjustment_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000002')->'total_count',
  '0'::jsonb,
  'los servicios no se ofrecen para ajustes de inventario'
);
select is(
  public.inventory_adjustment_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000003')->'total_count',
  '0'::jsonb,
  'los bienes inactivos no se ofrecen para nuevas operaciones'
);
select throws_ok(
  $$select public.inventory_adjustment_warehouses_read('a1400000-0000-4000-8000-000000000002', 'a1440000-0000-4000-8000-000000000001')$$,
  '42501', 'INVENTORY_READ_FORBIDDEN',
  'la lectura bloquea una organizacion ajena'
);
select throws_ok(
  $$select public.inventory_adjustment_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', '', 51, 0)$$,
  '22023', 'INVENTORY_READ_FILTER_INVALID',
  'la lectura limita la cantidad de resultados por página'
);
select throws_ok(
  $$select public.inventory_adjustment_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', repeat('x', 101))$$,
  '22023', 'INVENTORY_READ_FILTER_INVALID',
  'la lectura limita el tamaño del texto de búsqueda'
);
select is(
  jsonb_array_length(public.inventory_movement_warehouses_read(
    'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', null, '', 50, 0
  )->'items'),
  4,
  'las entradas solo ofrecen almacenes activos con una ubicación activa'
);
select is(
  jsonb_array_length(public.inventory_movement_warehouses_read(
    'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'available', '', 50, 0
  )->'items'),
  2,
  'las salidas disponibles excluyen stock vencido, reservado y almacenes sin stock asignable'
);
select is(
  (public.inventory_movement_warehouses_read(
    'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'available', 'principal', 50, 0
  )->'items'->0->>'eligible_quantity')::numeric,
  8::numeric,
  'la búsqueda devuelve el saldo asignable del producto en el almacén'
);
select is(
  (public.inventory_movement_warehouses_read(
    'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'available', 'A14-SEC', 50, 0
  )->'items'->0->>'warehouse_code'),
  'A14-SEC',
  'la búsqueda por código restringe el almacén según producto y condición'
);
select is(
  jsonb_array_length(public.inventory_movement_warehouses_read(
    'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'quarantine', '', 50, 0
  )->'items'),
  1,
  'las salidas en cuarentena solo ofrecen almacenes con stock no reservado'
);
select is(
  jsonb_array_length(public.inventory_movement_warehouses_read(
    'a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'damaged', '', 50, 0
  )->'items'),
  1,
  'las salidas de producto dañado solo ofrecen almacenes con stock no reservado'
);
select throws_ok(
  $$select public.inventory_movement_warehouses_read('a1400000-0000-4000-8000-000000000002', 'a1440000-0000-4000-8000-000000000001', null, '', 50, 0)$$,
  '42501', 'INVENTORY_READ_FORBIDDEN',
  'la búsqueda de movimientos bloquea una organizacion ajena'
);
select throws_ok(
  $$select public.inventory_movement_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', 'unknown', '', 50, 0)$$,
  '22023', 'INVENTORY_READ_FILTER_INVALID',
  'la búsqueda de movimientos valida las condiciones de stock'
);
select throws_ok(
  $$select public.inventory_movement_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', null, '', 51, 0)$$,
  '22023', 'INVENTORY_READ_FILTER_INVALID',
  'la búsqueda de movimientos limita la cantidad por página'
);
select throws_ok(
  $$select public.inventory_movement_warehouses_read('a1400000-0000-4000-8000-000000000001', 'a1440000-0000-4000-8000-000000000001', null, repeat('x', 101), 50, 0)$$,
  '22023', 'INVENTORY_READ_FILTER_INVALID',
  'la búsqueda de movimientos limita el texto de búsqueda'
);

reset role;
select * from finish();
rollback;
