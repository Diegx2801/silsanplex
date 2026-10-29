begin;

select plan(24);

select is(
  (select prosecdef from pg_catalog.pg_proc
   where oid = to_regprocedure('public.inventory_kardex_report_read(uuid,uuid,date,date,uuid,text,integer,integer,boolean)')),
  true,
  'el read model del Kardex se ejecuta con permisos controlados'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_catalog.pg_proc
   where oid = to_regprocedure('public.inventory_kardex_report_read(uuid,uuid,date,date,uuid,text,integer,integer,boolean)')),
  true,
  'la RPC fija un search_path vacío'
);
select is(
  has_function_privilege('authenticated', 'public.inventory_kardex_report_read(uuid,uuid,date,date,uuid,text,integer,integer,boolean)', 'EXECUTE'),
  true,
  'authenticated puede ejecutar el reporte y la autorización se valida dentro de la RPC'
);
select is(
  has_function_privilege('anon', 'public.inventory_kardex_report_read(uuid,uuid,date,date,uuid,text,integer,integer,boolean)', 'EXECUTE'),
  false,
  'anon no puede ejecutar el reporte'
);
select is(
  has_function_privilege('service_role', 'public.inventory_kardex_report_read(uuid,uuid,date,date,uuid,text,integer,integer,boolean)', 'EXECUTE'),
  false,
  'service_role no recibe acceso directo adicional al reporte'
);
select is(
  (select is_directly_assignable from public.permissions where code = 'INVENTORY_EXPORT'),
  true,
  'exportar inventario es una capacidad directa e independiente'
);
select is(
  (select required_permission_code from public.permission_dependencies where permission_code = 'INVENTORY_EXPORT'),
  'INVENTORY_VIEW',
  'exportar inventario también exige consultar inventario'
);

insert into public.organizations (id, name, slug)
values ('e2a00000-0000-4000-8000-000000000001', 'Kardex reportes', 'kardex-reportes');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('e2a10000-0000-4000-8000-000000000001', 'kardex-export@test.local', '{"full_name":"Almacenero de prueba"}', now(), now()),
  ('e2a10000-0000-4000-8000-000000000002', 'kardex-view@test.local', '{"full_name":"Consulta de prueba"}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('e2a00000-0000-4000-8000-000000000001', 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a00000-0000-4000-8000-000000000001', 'e2a10000-0000-4000-8000-000000000002');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('e2a00000-0000-4000-8000-000000000001', 'e2a10000-0000-4000-8000-000000000001', 'ALMACEN'),
  ('e2a00000-0000-4000-8000-000000000001', 'e2a10000-0000-4000-8000-000000000002', 'VENTAS');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  batch_control, expiration_control, is_active
)
values
  ('e2a20000-0000-4000-8000-000000000001', 'e2a00000-0000-4000-8000-000000000001', 'KDX-01', 'Producto Kardex', 'Caja', 'good', true, true, true),
  ('e2a20000-0000-4000-8000-000000000002', 'e2a00000-0000-4000-8000-000000000001', 'KDX-02', 'Otro producto', 'Unidad', 'good', false, false, true);

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values
  ('e2a30000-0000-4000-8000-000000000001', 'e2a00000-0000-4000-8000-000000000001', 'KDX-A', 'Almacén A', 'e2a10000-0000-4000-8000-000000000001', 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a30000-0000-4000-8000-000000000002', 'e2a00000-0000-4000-8000-000000000001', 'KDX-B', 'Almacén B', 'e2a10000-0000-4000-8000-000000000001', 'e2a10000-0000-4000-8000-000000000001');

insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by)
values
  ('e2a40000-0000-4000-8000-000000000001', 'e2a00000-0000-4000-8000-000000000001', 'e2a30000-0000-4000-8000-000000000001', 'A-01', 'Anaquel A-01', 'e2a10000-0000-4000-8000-000000000001', 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a40000-0000-4000-8000-000000000002', 'e2a00000-0000-4000-8000-000000000001', 'e2a30000-0000-4000-8000-000000000001', 'A-02', 'Anaquel A-02', 'e2a10000-0000-4000-8000-000000000001', 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a40000-0000-4000-8000-000000000003', 'e2a00000-0000-4000-8000-000000000001', 'e2a30000-0000-4000-8000-000000000002', 'B-01', 'Anaquel B-01', 'e2a10000-0000-4000-8000-000000000001', 'e2a10000-0000-4000-8000-000000000001');

set local session_replication_role = replica;
insert into public.inventory_movements (
  id, organization_id, product_id, product_code, product_description, unit_of_measure,
  movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
  unit_cost, lot, expiration_date, operation_date, reason, source_type, source_id, document_reference, created_by
)
values
  ('e2a50000-0000-4000-8000-000000000001', 'e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', 'KDX-01', 'Producto Kardex', 'Caja', 'entrada', 8, 'Almacén A', 'e2a30000-0000-4000-8000-000000000001', 'e2a40000-0000-4000-8000-000000000001', 'available', 99, 'LOTE-A', '2030-12-31', '2026-08-31', 'Saldo anterior al periodo', 'manual', null, 'REF-APERTURA', 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a50000-0000-4000-8000-000000000002', 'e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', 'KDX-01', 'Producto Kardex', 'Caja', 'entrada', 10, 'Almacén A', 'e2a30000-0000-4000-8000-000000000001', 'e2a40000-0000-4000-8000-000000000001', 'available', 99, 'LOTE-A', '2030-12-31', '2026-09-01', 'Recepción del periodo', 'purchase-receipt', 'e2a60000-0000-4000-8000-000000000001', 'COMPRA-01', 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a50000-0000-4000-8000-000000000003', 'e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', 'KDX-01', 'Producto Kardex', 'Caja', 'salida', 3, 'Almacén A', 'e2a30000-0000-4000-8000-000000000001', 'e2a40000-0000-4000-8000-000000000001', 'available', 99, 'LOTE-A', '2030-12-31', '2026-09-03', 'Despacho del periodo', 'manual', null, null, 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a50000-0000-4000-8000-000000000004', 'e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', 'KDX-01', 'Producto Kardex', 'Caja', 'ajuste-negativo', 2, 'Almacén A', 'e2a30000-0000-4000-8000-000000000001', 'e2a40000-0000-4000-8000-000000000001', 'available', 99, 'LOTE-A', '2030-12-31', '2026-09-04', 'Ajuste del periodo', 'manual', null, null, 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a50000-0000-4000-8000-000000000005', 'e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', 'KDX-01', 'Producto Kardex', 'Caja', 'entrada', 4, 'Almacén A', 'e2a30000-0000-4000-8000-000000000001', 'e2a40000-0000-4000-8000-000000000002', 'quarantine', 99, 'LOTE-A', '2030-12-31', '2026-09-02', 'Entrada en cuarentena', 'manual', null, null, 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a50000-0000-4000-8000-000000000006', 'e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', 'KDX-01', 'Producto Kardex', 'Caja', 'entrada', 20, 'Almacén B', 'e2a30000-0000-4000-8000-000000000002', 'e2a40000-0000-4000-8000-000000000003', 'available', 99, 'LOTE-A', '2030-12-31', '2026-09-02', 'Entrada en otro almacén', 'manual', null, null, 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a50000-0000-4000-8000-000000000007', 'e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', 'KDX-01', 'Producto Kardex', 'Caja', 'entrada', 7, 'Almacén A', 'e2a30000-0000-4000-8000-000000000001', 'e2a40000-0000-4000-8000-000000000001', 'available', 99, 'LOTE-B', '2031-12-31', '2026-09-05', 'Entrada en lote distinto', 'manual', null, null, 'e2a10000-0000-4000-8000-000000000001'),
  ('e2a50000-0000-4000-8000-000000000008', 'e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000002', 'KDX-02', 'Otro producto', 'Unidad', 'entrada', 50, 'Almacén A', 'e2a30000-0000-4000-8000-000000000001', 'e2a40000-0000-4000-8000-000000000001', 'available', 1, null, null, '2026-09-02', 'Otro producto no debe mezclarse', 'manual', null, null, 'e2a10000-0000-4000-8000-000000000001');
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2a10000-0000-4000-8000-000000000001', true);

select is(
  (public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-04', 'e2a30000-0000-4000-8000-000000000001', 'LOTE-A', 25, 0, false) ->> 'total_count')::integer,
  4,
  'el informe filtra por producto, almacén, lote y periodo inclusivo'
);
select is(
  (public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-04', 'e2a30000-0000-4000-8000-000000000001', 'LOTE-A', 25, 0, false) -> 'items' -> 0 ->> 'opening_quantity')::numeric,
  8::numeric,
  'el primer saldo del periodo incluye el historial anterior y se limita al lote/ubicación'
);
select is(
  (public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-04', 'e2a30000-0000-4000-8000-000000000001', 'LOTE-A', 25, 0, false) -> 'items' -> 3 ->> 'closing_quantity')::numeric,
  13::numeric,
  'el saldo posterior refleja entradas, salidas y ajustes negativos'
);
select is(
  (public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', null, '', 25, 0, false) ->> 'total_count')::integer,
  6,
  'el reporte distingue ubicaciones, condición de stock, almacenes y lotes'
);
select is(
  (public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', null, '', 25, 0, false) -> 'items' -> 0 ->> 'responsible'),
  'Almacenero de prueba',
  'el reporte incluye el responsable sin exponer su correo'
);
select is(
  (public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', 'e2a30000-0000-4000-8000-000000000002', '', 25, 0, false) -> 'items' -> 0 ->> 'closing_quantity')::numeric,
  20::numeric,
  'el saldo del otro almacén no se mezcla con el principal'
);
select is(
  (public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', 'e2a30000-0000-4000-8000-000000000001', 'LOTE-A', 1, 2, false) ->> 'total_count')::integer,
  4,
  'la paginación mantiene el total estable aunque recorra una página parcial'
);
select is(
  (public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', 'e2a30000-0000-4000-8000-000000000001', 'LOTE-A', 25, 0, false) -> 'items' -> 0 ->> 'document_reference'),
  'COMPRA-01',
  'el detalle conserva la referencia documental del movimiento'
);
select is(
  (select running_quantity::numeric from public.inventory_kardex where id = 'e2a50000-0000-4000-8000-000000000005'),
  4::numeric,
  'la vista canónica conserva saldo independiente para cuarentena'
);
select is(
  (select running_quantity::numeric from public.inventory_kardex where id = 'e2a50000-0000-4000-8000-000000000007'),
  7::numeric,
  'la vista canónica conserva saldo independiente por lote'
);
select is(
  (public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', null, '', 10000, 0, true) ->> 'total_count')::integer,
  6,
  'el rol de almacén puede exportar el conjunto filtrado completo'
);
select throws_ok(
  $$select public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000002', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', null, '', 25, 0, false)$$,
  '42501', null,
  'la RPC bloquea consultar otra organización'
);
select throws_ok(
  $$select public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-30', '2026-09-01', null, '', 25, 0, false)$$,
  '22023', 'INVENTORY_REPORT_FILTER_INVALID',
  'la RPC rechaza periodos invertidos'
);
select throws_ok(
  $$select public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', null, '2026-09-01', '2026-09-30', null, '', 25, 0, false)$$,
  '22023', 'INVENTORY_REPORT_FILTER_INVALID',
  'la RPC exige producto para mantener acotado el Kardex detallado'
);
select throws_ok(
  $$select public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', null, '', 101, 0, false)$$,
  '22023', 'INVENTORY_REPORT_FILTER_INVALID',
  'la consulta de pantalla limita el tamaño de página'
);
select throws_ok(
  $$select public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', null, '', 25, 0, true)$$,
  '22023', 'INVENTORY_REPORT_FILTER_INVALID',
  'la exportación no permite descargar una página parcial'
);

select set_config('request.jwt.claim.sub', 'e2a10000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.inventory_kardex_report_read('e2a00000-0000-4000-8000-000000000001', 'e2a20000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', null, '', 10000, 0, true)$$,
  '42501', null,
  'tener INVENTORY_VIEW no concede exportar sin INVENTORY_EXPORT'
);

reset role;
select * from finish();
rollback;
