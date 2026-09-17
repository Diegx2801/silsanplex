begin;

select plan(49);

select is(
  to_regprocedure('inventory_internal.assert_inventory_read(uuid)') is not null,
  true,
  'existe el helper interno de lectura de Inventario'
);
select is(
  to_regprocedure('inventory_internal.assert_no_incompatible_service_state()') is not null,
  true,
  'existe el guard reusable de estados incompatibles'
);
select is(
  (select prosecdef from pg_catalog.pg_proc where oid = to_regprocedure('public.inventory_product_options(uuid,text,integer,integer)')),
  true,
  'las opciones de producto usan SECURITY DEFINER'
);
select is(
  (select prosecdef from pg_catalog.pg_proc where oid = to_regprocedure('public.inventory_product_stock_summary_read(uuid,text,text,text,integer,integer)')),
  true,
  'el resumen especializado usa SECURITY DEFINER'
);
select is(
  (select prosecdef from pg_catalog.pg_proc where oid = to_regprocedure('public.inventory_low_stock_alerts_read(uuid,text,uuid,text,integer,integer)')),
  true,
  'las alertas especializadas usan SECURITY DEFINER'
);
select is(
  (select proconfig @> array['search_path=""']
   from pg_catalog.pg_proc
   where oid = to_regprocedure('public.inventory_product_options(uuid,text,integer,integer)')),
  true,
  'la RPC de opciones fija search_path vacio'
);
select is(
  (select reloptions @> array['security_invoker=true']
   from pg_catalog.pg_class
   where oid = 'public.inventory_bucket_balances'::regclass),
  true,
  'la vista factual conserva security_invoker'
);
select is(
  has_function_privilege('authenticated', 'inventory_internal.assert_inventory_read(uuid)', 'EXECUTE'),
  false,
  'el helper no se expone directamente a authenticated'
);
select is(
  has_function_privilege('authenticated', 'public.inventory_product_options(uuid,text,integer,integer)', 'EXECUTE'),
  true,
  'authenticated puede ejecutar las opciones especializadas'
);
select is(
  has_function_privilege('anon', 'public.inventory_product_options(uuid,text,integer,integer)', 'EXECUTE'),
  false,
  'anon no puede ejecutar las opciones especializadas'
);
select is(
  has_function_privilege('service_role', 'public.inventory_product_options(uuid,text,integer,integer)', 'EXECUTE'),
  false,
  'service_role no recibe un grant adicional de la RPC'
);

insert into public.organizations (id, name, slug)
values
  ('d1a00000-0000-4000-8000-000000000001', 'D1A Inventario A', 'd1a-inventario-a'),
  ('d1a00000-0000-4000-8000-000000000002', 'D1A Inventario B', 'd1a-inventario-b');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('d1a10000-0000-4000-8000-000000000001', 'd1a-inventory-view@test.local', '{}', now(), now()),
  ('d1a10000-0000-4000-8000-000000000002', 'd1a-other-org@test.local', '{}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('d1a00000-0000-4000-8000-000000000001', 'd1a10000-0000-4000-8000-000000000001'),
  ('d1a00000-0000-4000-8000-000000000002', 'd1a10000-0000-4000-8000-000000000002');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('d1a00000-0000-4000-8000-000000000001', 'd1a10000-0000-4000-8000-000000000001', 'TECNICO_REPARACIONES'),
  ('d1a00000-0000-4000-8000-000000000002', 'd1a10000-0000-4000-8000-000000000002', 'ALMACEN');

insert into public.organization_user_permissions (organization_id, user_id, permission_code)
values (
  'd1a00000-0000-4000-8000-000000000001',
  'd1a10000-0000-4000-8000-000000000001',
  'INVENTORY_VIEW'
);

select is(
  public.has_organization_permission('d1a00000-0000-4000-8000-000000000001', 'INVENTORY_VIEW'),
  false,
  'sin identidad el permiso no se concede'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1a10000-0000-4000-8000-000000000001', true);

select is(
  public.has_organization_permission('d1a00000-0000-4000-8000-000000000001', 'INVENTORY_VIEW'),
  true,
  'el usuario de prueba tiene INVENTORY_VIEW'
);
select is(
  public.has_organization_permission('d1a00000-0000-4000-8000-000000000001', 'PRODUCTS_VIEW'),
  false,
  'el usuario de prueba no tiene PRODUCTS_VIEW'
);

reset role;

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values
  ('d1a20000-0000-4000-8000-000000000001', 'd1a00000-0000-4000-8000-000000000001', 'D1A-A', 'Almacen D1A A', 'd1a10000-0000-4000-8000-000000000001', 'd1a10000-0000-4000-8000-000000000001'),
  ('d1a20000-0000-4000-8000-000000000002', 'd1a00000-0000-4000-8000-000000000002', 'D1A-B', 'Almacen D1A B', 'd1a10000-0000-4000-8000-000000000002', 'd1a10000-0000-4000-8000-000000000002');

insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by)
values
  ('d1a30000-0000-4000-8000-000000000001', 'd1a00000-0000-4000-8000-000000000001', 'd1a20000-0000-4000-8000-000000000001', 'D1A-01', 'Ubicacion D1A A', 'd1a10000-0000-4000-8000-000000000001', 'd1a10000-0000-4000-8000-000000000001'),
  ('d1a30000-0000-4000-8000-000000000002', 'd1a00000-0000-4000-8000-000000000002', 'd1a20000-0000-4000-8000-000000000002', 'D1B-01', 'Ubicacion D1A B', 'd1a10000-0000-4000-8000-000000000002', 'd1a10000-0000-4000-8000-000000000002');

insert into public.products (
  id, organization_id, code, description, barcode, laboratory,
  unit_of_measure, product_type, batch_control, expiration_control, is_active
)
values
  ('d1a40000-0000-4000-8000-000000000001', 'd1a00000-0000-4000-8000-000000000001', 'P-A-STOCK', 'Bien con saldo', 'BAR-A-STOCK', 'Lab A', 'Unidad', 'good', false, false, true),
  ('d1a40000-0000-4000-8000-000000000002', 'd1a00000-0000-4000-8000-000000000001', 'P-A-INACTIVO', 'Bien inactivo con saldo', 'BAR-A-INACT', 'Lab A', 'Unidad', 'good', false, false, false),
  ('d1a40000-0000-4000-8000-000000000003', 'd1a00000-0000-4000-8000-000000000001', 'P-A-VACIO', 'Bien inactivo vacio', null, 'Lab A', 'Unidad', 'good', false, false, false),
  ('d1a40000-0000-4000-8000-000000000004', 'd1a00000-0000-4000-8000-000000000001', 'P-A-RESERVA', 'Bien inactivo reservado', null, 'Lab A', 'Unidad', 'good', false, false, false),
  ('d1a40000-0000-4000-8000-000000000005', 'd1a00000-0000-4000-8000-000000000001', 'P-A-SERVICE', 'Servicio sin stock', null, 'Lab A', 'Unidad', 'service', false, false, true),
  ('d1a40000-0000-4000-8000-000000000006', 'd1a00000-0000-4000-8000-000000000001', 'P-A-CERO', 'Bien activo sin stock', null, 'Lab A', 'Unidad', 'good', false, false, true),
  ('d1a40000-0000-4000-8000-000000000007', 'd1a00000-0000-4000-8000-000000000001', 'P-A-HISTORICO', 'Bien historico', null, 'Lab A', 'Unidad', 'good', false, false, true),
  ('d1a40000-0000-4000-8000-000000000008', 'd1a00000-0000-4000-8000-000000000001', 'P-A-SERVICE-GUARD', 'Servicio incompatible de prueba', null, 'Lab A', 'Unidad', 'service', false, false, true),
  ('d1a40000-0000-4000-8000-000000000009', 'd1a00000-0000-4000-8000-000000000002', 'P-B-STOCK', 'Bien organizacion B', null, 'Lab B', 'Unidad', 'good', false, false, true);

insert into public.products (
  organization_id, code, description, unit_of_measure, product_type,
  batch_control, expiration_control, is_active
)
select
  'd1a00000-0000-4000-8000-000000000001',
  'P-A-' || to_char(series.number, 'FM000'),
  'Bien paginado ' || series.number,
  'Unidad', 'good', false, false, true
from generate_series(1, 55) series(number);

set local session_replication_role = replica;

insert into public.inventory_movements (
  id, organization_id, product_id, product_code, product_description,
  unit_of_measure, movement_type, quantity, warehouse, lot, expiration_date,
  operation_date, reason, source_type, created_by, warehouse_id, location_id,
  stock_status, unit_cost
)
values
  ('d1a50000-0000-4000-8000-000000000001', 'd1a00000-0000-4000-8000-000000000001', 'd1a40000-0000-4000-8000-000000000001', 'P-A-STOCK', 'Bien con saldo', 'Unidad', 'entrada', 10, 'Almacen D1A A', 'A-STOCK', '2027-12-31', '2026-09-01', 'Entrada D1A', 'manual', 'd1a10000-0000-4000-8000-000000000001', 'd1a20000-0000-4000-8000-000000000001', 'd1a30000-0000-4000-8000-000000000001', 'available', 10),
  ('d1a50000-0000-4000-8000-000000000002', 'd1a00000-0000-4000-8000-000000000001', 'd1a40000-0000-4000-8000-000000000002', 'P-A-INACTIVO', 'Bien inactivo con saldo', 'Unidad', 'entrada', 4, 'Almacen D1A A', null, null, '2026-09-01', 'Saldo residual', 'manual', 'd1a10000-0000-4000-8000-000000000001', 'd1a20000-0000-4000-8000-000000000001', 'd1a30000-0000-4000-8000-000000000001', 'available', 5),
  ('d1a50000-0000-4000-8000-000000000003', 'd1a00000-0000-4000-8000-000000000001', 'd1a40000-0000-4000-8000-000000000007', 'P-A-HISTORICO', 'Bien historico', 'Unidad', 'entrada', 3, 'Almacen D1A A', null, null, '2026-09-01', 'Historico entrada', 'manual', 'd1a10000-0000-4000-8000-000000000001', 'd1a20000-0000-4000-8000-000000000001', 'd1a30000-0000-4000-8000-000000000001', 'available', 10),
  ('d1a50000-0000-4000-8000-000000000004', 'd1a00000-0000-4000-8000-000000000001', 'd1a40000-0000-4000-8000-000000000007', 'P-A-HISTORICO', 'Bien historico', 'Unidad', 'salida', 3, 'Almacen D1A A', null, null, '2026-09-02', 'Historico salida', 'manual', 'd1a10000-0000-4000-8000-000000000001', 'd1a20000-0000-4000-8000-000000000001', 'd1a30000-0000-4000-8000-000000000001', 'available', 10),
  ('d1a50000-0000-4000-8000-000000000006', 'd1a00000-0000-4000-8000-000000000001', 'd1a40000-0000-4000-8000-000000000004', 'P-A-RESERVA', 'Bien inactivo reservado', 'Unidad', 'entrada', 2, 'Almacen D1A A', null, null, '2026-09-01', 'Stock reservado D1A', 'manual', 'd1a10000-0000-4000-8000-000000000001', 'd1a20000-0000-4000-8000-000000000001', 'd1a30000-0000-4000-8000-000000000001', 'available', 7);

set local session_replication_role = origin;

insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status,
  quantity, quantity_consumed, status, source_type, source_id, created_by, updated_by
)
values (
  'd1a60000-0000-4000-8000-000000000001',
  'd1a00000-0000-4000-8000-000000000001',
  'd1a40000-0000-4000-8000-000000000004',
  'd1a20000-0000-4000-8000-000000000001',
  'd1a30000-0000-4000-8000-000000000001',
  'available', 2, 0, 'active', 'd1a-test',
  'd1a70000-0000-4000-8000-000000000001',
  'd1a10000-0000-4000-8000-000000000001',
  'd1a10000-0000-4000-8000-000000000001'
);

insert into public.product_warehouse_settings (
  organization_id, product_id, warehouse_id, default_location_id,
  minimum_stock, updated_by
)
values
  ('d1a00000-0000-4000-8000-000000000001', 'd1a40000-0000-4000-8000-000000000001', 'd1a20000-0000-4000-8000-000000000001', 'd1a30000-0000-4000-8000-000000000001', 12, 'd1a10000-0000-4000-8000-000000000001'),
  ('d1a00000-0000-4000-8000-000000000001', 'd1a40000-0000-4000-8000-000000000002', 'd1a20000-0000-4000-8000-000000000001', 'd1a30000-0000-4000-8000-000000000001', 100, 'd1a10000-0000-4000-8000-000000000001'),
  ('d1a00000-0000-4000-8000-000000000001', 'd1a40000-0000-4000-8000-000000000005', 'd1a20000-0000-4000-8000-000000000001', 'd1a30000-0000-4000-8000-000000000001', 100, 'd1a10000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1a10000-0000-4000-8000-000000000001', true);

select is(
  (select count(*) from public.inventory_bucket_balances),
  4::bigint,
  'INVENTORY_VIEW sin PRODUCTS_VIEW puede leer los buckets de su organizacion'
);
select is(
  (select count(*) from public.inventory_bucket_balances where organization_id = 'd1a00000-0000-4000-8000-000000000002'),
  0::bigint,
  'los buckets mantienen aislamiento entre organizaciones'
);
select ok(
  (select count(*) > 0 from public.inventory_fefo_candidates
   where organization_id = 'd1a00000-0000-4000-8000-000000000001'
     and product_id = 'd1a40000-0000-4000-8000-000000000001'),
  'INVENTORY_VIEW puede leer candidatos FEFO factuales'
);
select ok(
  (select count(*) > 0 from public.inventory_stock_summary
   where organization_id = 'd1a00000-0000-4000-8000-000000000001'),
  'INVENTORY_VIEW puede leer el resumen factual'
);

select throws_ok(
  $$select public.inventory_product_options('d1a00000-0000-4000-8000-000000000002', '', 50, 0)$$,
  '42501', null,
  'la RPC bloquea consultar una organizacion ajena'
);
select throws_ok(
  $$select public.record_inventory_movement(jsonb_build_object(
    'organization_id', 'd1a00000-0000-4000-8000-000000000001',
    'product_id', 'd1a40000-0000-4000-8000-000000000006',
    'movement_type', 'entrada', 'quantity', '1', 'warehouse', 'Almacen D1A A',
    'warehouse_id', 'd1a20000-0000-4000-8000-000000000001',
    'location_id', 'd1a30000-0000-4000-8000-000000000001',
    'operation_date', '2026-09-10', 'reason', 'No debe escribir'
  ))$$,
  '42501', 'INVENTORY_FORBIDDEN',
  'INVENTORY_VIEW no habilita escrituras'
);

select is(
  (jsonb_array_length((public.inventory_product_options('d1a00000-0000-4000-8000-000000000001', '', 50, 0) -> 'items'))),
  50,
  'las opciones respetan el maximo de 50 filas'
);
select ok(
  (select count(*) = 1 from jsonb_array_elements(public.inventory_product_options('d1a00000-0000-4000-8000-000000000001', 'P-A-CERO', 50, 0) -> 'items')),
  'la busqueda server-side encuentra el bien activo sin stock'
);
select is(
  (select array_agg(key order by key)
   from jsonb_object_keys((public.inventory_product_options('d1a00000-0000-4000-8000-000000000001', 'P-A-STOCK', 50, 0) -> 'items' -> 0)) key),
  array['barcode','batch_control','expiration_control','product_code','product_description','product_id','unit_of_measure']::text[],
  'las opciones exponen solo el DTO minimo'
);
select is(
  (select (public.inventory_product_options('d1a00000-0000-4000-8000-000000000001', 'P-A-SERVICE', 50, 0) -> 'total_count')::integer),
  0,
  'los servicios quedan fuera del selector'
);
select is(
  (select (public.inventory_product_options('d1a00000-0000-4000-8000-000000000001', '', 50, 0) -> 'items' -> 0 ->> 'product_code')),
  'P-A-001',
  'las opciones tienen orden determinista por codigo'
);

select is(
  (public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', '', 'todos', 'producto-asc', 50, 0) -> 'total_count')::integer > 50,
  true,
  'el total del resumen es global aunque la pagina sea limitada'
);
select is(
  jsonb_array_length(public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', '', 'todos', 'producto-asc', 50, 0) -> 'items'),
  50,
  'el resumen devuelve como maximo 50 filas'
);
select is(
  jsonb_array_length(public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', '', 'todos', 'producto-asc', 50, 1000) -> 'items'),
  0,
  'una pagina vacia del resumen devuelve items vacios'
);
select is(
  (public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', '', 'todos', 'producto-asc', 50, 1000) -> 'total_count')::integer > 50,
  true,
  'una pagina vacia conserva el total global'
);
select throws_ok(
  $$select public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', '', 'todos', 'producto-asc', 51, 0)$$,
  '22023', 'INVENTORY_READ_PAGINATION_INVALID',
  'el resumen rechaza limit mayor que 50'
);
select throws_ok(
  $$select public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', '', 'todos', 'producto-asc', 50, -1)$$,
  '22023', 'INVENTORY_READ_PAGINATION_INVALID',
  'el resumen rechaza offset negativo'
);
select is(
  (public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', 'P-A-INACTIVO', 'todos', 'producto-asc', 50, 0) -> 'total_count')::integer,
  1,
  'la busqueda del resumen encuentra el residual inactivo'
);
select is(
  (public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', 'P-A-VACIO', 'todos', 'producto-asc', 50, 0) -> 'total_count')::integer,
  0,
  'el bien inactivo sin stock ni reserva se excluye'
);
select is(
  (public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', 'P-A-SERVICE', 'todos', 'producto-asc', 50, 0) -> 'total_count')::integer,
  0,
  'los servicios se excluyen del resumen operativo'
);
select is(
  (public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', 'P-A-CERO', 'sin-stock', 'producto-asc', 50, 0) -> 'total_count')::integer,
  1,
  'el bien activo sin stock se incluye en el resumen'
);
select is(
  (public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', 'P-A-RESERVA', 'todos', 'producto-asc', 50, 0) -> 'total_count')::integer,
  1,
  'el bien inactivo con reserva activa se incluye'
);
select is(
  (public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', 'P-A-STOCK', 'todos', 'producto-asc', 50, 0) -> 'items' -> 0 ->> 'physical_quantity')::numeric,
  10::numeric,
  'el resumen usa el fisico factual canonico'
);
select is(
  (public.inventory_product_stock_summary_read('d1a00000-0000-4000-8000-000000000001', 'P-A-INACTIVO', 'con-stock', 'producto-asc', 50, 0) -> 'total_count')::integer,
  1,
  'el residual inactivo conserva su disponibilidad administrable'
);

select is(
  (public.inventory_low_stock_alerts_read('d1a00000-0000-4000-8000-000000000001', '', null::uuid, 'producto-asc', 50, 0) -> 'total_count')::integer,
  1,
  'las alertas contienen solo el bien activo bajo minimo'
);
select is(
  (public.inventory_low_stock_alerts_read('d1a00000-0000-4000-8000-000000000001', 'P-A-SERVICE', null::uuid, 'producto-asc', 50, 0) -> 'total_count')::integer,
  0,
  'las alertas excluyen servicios'
);
select is(
  (public.inventory_low_stock_alerts_read('d1a00000-0000-4000-8000-000000000001', 'P-A-INACTIVO', null::uuid, 'producto-asc', 50, 0) -> 'total_count')::integer,
  0,
  'las alertas excluyen inactivos con residual'
);
select is(
  (public.inventory_low_stock_alerts_read('d1a00000-0000-4000-8000-000000000001', 'P-A-STOCK', null::uuid, 'stock-asc', 50, 0) -> 'items' -> 0 ->> 'assignable_quantity')::numeric,
  10::numeric,
  'la alerta expone el asignable factual'
);
select is(
  (public.inventory_low_stock_alerts_read('d1a00000-0000-4000-8000-000000000001', '', null::uuid, 'producto-asc', 50, 1000) -> 'total_count')::integer,
  1,
  'una pagina vacia de alertas conserva el total global'
);
select throws_ok(
  $$select public.inventory_low_stock_alerts_read('d1a00000-0000-4000-8000-000000000001', '', null::uuid, 'producto-asc', 51, 0)$$,
  '22023', 'INVENTORY_READ_PAGINATION_INVALID',
  'las alertas rechazan limit mayor que 50'
);

reset role;
select lives_ok(
  $$select inventory_internal.assert_no_incompatible_service_state()$$,
  'el guard permite el estado sin servicios incompatibles'
);

update public.products
set product_type = 'service'
where id = 'd1a40000-0000-4000-8000-000000000007';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1a10000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.inventory_kardex where product_id = 'd1a40000-0000-4000-8000-000000000007'),
  2::bigint,
  'good a service con saldo cero conserva el historico C4'
);
select is(
  (select running_quantity from public.inventory_kardex where product_id = 'd1a40000-0000-4000-8000-000000000007' order by ledger_sequence desc limit 1),
  0::numeric,
  'la transicion historica conserva el saldo final cero'
);

reset role;
set local session_replication_role = replica;
insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status,
  quantity, quantity_consumed, status, source_type, source_id
)
values (
  'd1a60000-0000-4000-8000-000000000002',
  'd1a00000-0000-4000-8000-000000000001',
  'd1a40000-0000-4000-8000-000000000008',
  'd1a20000-0000-4000-8000-000000000001',
  'd1a30000-0000-4000-8000-000000000001',
  'available', 1, 0, 'active', 'd1a-guard-test',
  'd1a70000-0000-4000-8000-000000000002'
);
set local session_replication_role = origin;
select throws_ok(
  $$select inventory_internal.assert_no_incompatible_service_state()$$,
  'P0001', 'INVENTORY_READ_MODEL_MIGRATION_BLOCKED_SERVICE_STATE',
  'el guard bloquea una reserva activa de servicio'
);

set local session_replication_role = replica;
insert into public.inventory_movements (
  id, organization_id, product_id, product_code, product_description,
  unit_of_measure, movement_type, quantity, warehouse, operation_date,
  reason, source_type, warehouse_id, location_id, stock_status, unit_cost
)
values (
  'd1a50000-0000-4000-8000-000000000005',
  'd1a00000-0000-4000-8000-000000000001',
  'd1a40000-0000-4000-8000-000000000008',
  'P-A-SERVICE-GUARD', 'Servicio incompatible de prueba', 'Unidad',
  'entrada', 1, 'Almacen D1A A', '2026-09-03', 'Anomalia de guard',
  'manual', 'd1a20000-0000-4000-8000-000000000001',
  'd1a30000-0000-4000-8000-000000000001', 'available', 0
);
set local session_replication_role = origin;
select throws_ok(
  $$select inventory_internal.assert_no_incompatible_service_state()$$,
  'P0001', 'INVENTORY_READ_MODEL_MIGRATION_BLOCKED_SERVICE_STATE',
  'el guard bloquea saldo fisico de servicio por bucket'
);

reset role;
select * from finish();
rollback;
