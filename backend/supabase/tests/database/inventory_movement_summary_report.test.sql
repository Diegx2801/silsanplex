begin;

select plan(15);

select is(
  (select prosecdef from pg_catalog.pg_proc
   where oid = to_regprocedure('public.inventory_movement_summary_read(uuid,date,date,text,uuid,integer,integer)')),
  true,
  'el resumen se ejecuta con permisos controlados'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_catalog.pg_proc
   where oid = to_regprocedure('public.inventory_movement_summary_read(uuid,date,date,text,uuid,integer,integer)')),
  true,
  'la RPC fija search_path vacio'
);
select is(
  has_function_privilege('authenticated', 'public.inventory_movement_summary_read(uuid,date,date,text,uuid,integer,integer)', 'EXECUTE'),
  true,
  'authenticated puede ejecutar el reporte'
);
select is(
  has_function_privilege('anon', 'public.inventory_movement_summary_read(uuid,date,date,text,uuid,integer,integer)', 'EXECUTE'),
  false,
  'anon no puede ejecutar el reporte'
);
select is(
  has_function_privilege('service_role', 'public.inventory_movement_summary_read(uuid,date,date,text,uuid,integer,integer)', 'EXECUTE'),
  false,
  'service_role no recibe acceso directo adicional al reporte'
);

insert into public.organizations (id, name, slug)
values
  ('e1a00000-0000-4000-8000-000000000001', 'Reporte inventario A', 'reporte-inventario-a'),
  ('e1a00000-0000-4000-8000-000000000002', 'Reporte inventario B', 'reporte-inventario-b');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('e1a10000-0000-4000-8000-000000000001', 'inventory-report@test.local', '{}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values ('e1a00000-0000-4000-8000-000000000001', 'e1a10000-0000-4000-8000-000000000001');

insert into public.user_roles (organization_id, user_id, role_code)
values ('e1a00000-0000-4000-8000-000000000001', 'e1a10000-0000-4000-8000-000000000001', 'ALMACEN');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  batch_control, expiration_control, is_active
)
values
  ('e1a20000-0000-4000-8000-000000000001', 'e1a00000-0000-4000-8000-000000000001', 'REP-P1', 'Producto reporte uno', 'Caja', 'good', false, false, true),
  ('e1a20000-0000-4000-8000-000000000002', 'e1a00000-0000-4000-8000-000000000001', 'REP-P2', 'Producto reporte dos', 'Unidad', 'good', false, false, true);

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values
  ('e1a30000-0000-4000-8000-000000000001', 'e1a00000-0000-4000-8000-000000000001', 'REP-CEN', 'Central reporte', 'e1a10000-0000-4000-8000-000000000001', 'e1a10000-0000-4000-8000-000000000001'),
  ('e1a30000-0000-4000-8000-000000000002', 'e1a00000-0000-4000-8000-000000000001', 'REP-SEC', 'Secundario reporte', 'e1a10000-0000-4000-8000-000000000001', 'e1a10000-0000-4000-8000-000000000001');

insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by)
values
  ('e1a40000-0000-4000-8000-000000000001', 'e1a00000-0000-4000-8000-000000000001', 'e1a30000-0000-4000-8000-000000000001', 'REP-A01', 'Ubicacion central', 'e1a10000-0000-4000-8000-000000000001', 'e1a10000-0000-4000-8000-000000000001'),
  ('e1a40000-0000-4000-8000-000000000002', 'e1a00000-0000-4000-8000-000000000001', 'e1a30000-0000-4000-8000-000000000002', 'REP-B01', 'Ubicacion secundaria', 'e1a10000-0000-4000-8000-000000000001', 'e1a10000-0000-4000-8000-000000000001');

set local session_replication_role = replica;
insert into public.inventory_movements (
  organization_id, product_id, product_code, product_description, unit_of_measure,
  movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
  unit_cost, operation_date, reason, source_type, created_by
)
values
  ('e1a00000-0000-4000-8000-000000000001', 'e1a20000-0000-4000-8000-000000000001', 'REP-P1', 'Producto reporte uno', 'Caja', 'entrada', 10, 'Central reporte', 'e1a30000-0000-4000-8000-000000000001', 'e1a40000-0000-4000-8000-000000000001', 'available', 5, '2026-09-01', 'Entrada periodo', 'manual', 'e1a10000-0000-4000-8000-000000000001'),
  ('e1a00000-0000-4000-8000-000000000001', 'e1a20000-0000-4000-8000-000000000001', 'REP-P1', 'Producto reporte uno', 'Caja', 'salida', 3, 'Central reporte', 'e1a30000-0000-4000-8000-000000000001', 'e1a40000-0000-4000-8000-000000000001', 'available', 5, '2026-09-03', 'Salida periodo', 'manual', 'e1a10000-0000-4000-8000-000000000001'),
  ('e1a00000-0000-4000-8000-000000000001', 'e1a20000-0000-4000-8000-000000000001', 'REP-P1', 'Producto reporte uno', 'Caja', 'entrada', 2, 'Central reporte', 'e1a30000-0000-4000-8000-000000000001', 'e1a40000-0000-4000-8000-000000000001', 'quarantine', 5, '2026-09-04', 'Entrada cuarentena', 'manual', 'e1a10000-0000-4000-8000-000000000001'),
  ('e1a00000-0000-4000-8000-000000000001', 'e1a20000-0000-4000-8000-000000000001', 'REP-P1', 'Producto reporte uno', 'Caja', 'entrada', 9, 'Secundario reporte', 'e1a30000-0000-4000-8000-000000000002', 'e1a40000-0000-4000-8000-000000000002', 'available', 5, '2026-09-05', 'Entrada otro almacen', 'manual', 'e1a10000-0000-4000-8000-000000000001'),
  ('e1a00000-0000-4000-8000-000000000001', 'e1a20000-0000-4000-8000-000000000002', 'REP-P2', 'Producto reporte dos', 'Unidad', 'entrada', 7, 'Central reporte', 'e1a30000-0000-4000-8000-000000000001', 'e1a40000-0000-4000-8000-000000000001', 'available', 2, '2026-09-05', 'Entrada otra unidad', 'manual', 'e1a10000-0000-4000-8000-000000000001'),
  ('e1a00000-0000-4000-8000-000000000001', 'e1a20000-0000-4000-8000-000000000001', 'REP-P1', 'Producto reporte uno', 'Caja', 'entrada', 999, 'Central reporte', 'e1a30000-0000-4000-8000-000000000001', 'e1a40000-0000-4000-8000-000000000001', 'available', 5, '2026-08-31', 'Fuera de periodo', 'manual', 'e1a10000-0000-4000-8000-000000000001');
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1a10000-0000-4000-8000-000000000001', true);

select is(
  (public.inventory_movement_summary_read('e1a00000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', '', null, 25, 0) ->> 'total_count')::integer,
  4,
  'el reporte agrupa por producto, almacén, condición y unidad'
);
select is(
  (public.inventory_movement_summary_read('e1a00000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', '', null, 25, 0) ->> 'total_movements')::integer,
  5,
  'el resumen cuenta solo movimientos del periodo'
);
select is(
  (public.inventory_movement_summary_read('e1a00000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', '', null, 25, 0) -> 'items' -> 0 ->> 'net_quantity')::numeric,
  7::numeric,
  'la variación neta de entradas menos salidas no se confunde con el saldo actual'
);
select is(
  (public.inventory_movement_summary_read('e1a00000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', '', null, 25, 0) -> 'items' -> 0 ->> 'movement_count')::integer,
  2,
  'el detalle conserva el número de movimientos de cada grupo'
);
select is(
  (public.inventory_movement_summary_read('e1a00000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', '', null, 1, 3) -> 'items' -> 0 ->> 'product_code'),
  'REP-P2',
  'la paginación usa orden determinista y mantiene el conjunto total'
);
select is(
  (public.inventory_movement_summary_read('e1a00000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', 'producto reporte uno', null, 25, 0) ->> 'total_count')::integer,
  3,
  'la búsqueda por descripción filtra en el servidor'
);
select is(
  (public.inventory_movement_summary_read('e1a00000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', '', 'e1a30000-0000-4000-8000-000000000002', 25, 0) ->> 'total_count')::integer,
  1,
  'el filtro de almacén restringe el reporte'
);
select throws_ok(
  $$select public.inventory_movement_summary_read('e1a00000-0000-4000-8000-000000000002', '2026-09-01', '2026-09-30', '', null, 25, 0)$$,
  '42501', null,
  'la RPC bloquea consultar otra organización'
);
select throws_ok(
  $$select public.inventory_movement_summary_read('e1a00000-0000-4000-8000-000000000001', '2026-09-30', '2026-09-01', '', null, 25, 0)$$,
  '22023', 'INVENTORY_REPORT_FILTER_INVALID',
  'la RPC rechaza rangos de fechas invertidos'
);
select throws_ok(
  $$select public.inventory_movement_summary_read('e1a00000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', '', null, 101, 0)$$,
  '22023', 'INVENTORY_REPORT_FILTER_INVALID',
  'la RPC limita el tamaño de página'
);

reset role;
select * from finish();
rollback;
