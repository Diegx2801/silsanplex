begin;

select plan(16);

select has_view(
  'public',
  'inventory_product_stock_summary',
  'existe el resumen paginable por producto'
);
select is(
  (select 'security_invoker=true' = any(coalesce(reloptions, array[]::text[]))
   from pg_class
   where oid = 'public.inventory_product_stock_summary'::regclass),
  true,
  'la vista ejecuta con los permisos y RLS del invocador'
);
select is(
  has_table_privilege('authenticated', 'public.inventory_product_stock_summary', 'SELECT'),
  true,
  'authenticated conserva lectura explicita'
);
select is(
  has_table_privilege('anon', 'public.inventory_product_stock_summary', 'SELECT'),
  false,
  'anon no puede consultar la vista'
);

insert into public.organizations (id, name, slug)
values
  ('a1000000-0000-4000-8000-000000000001', 'Resumen inventario A', 'resumen-inventario-a'),
  ('a1000000-0000-4000-8000-000000000002', 'Resumen inventario B', 'resumen-inventario-b');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('a2000000-0000-4000-8000-000000000001', 'inventario.a@test.local', '{}', now(), now()),
  ('a2000000-0000-4000-8000-000000000002', 'inventario.b@test.local', '{}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'ALMACEN'),
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'ALMACEN');

insert into public.products (
  id, organization_id, code, description, laboratory, unit_of_measure,
  batch_control, expiration_control
)
values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'P-A-01', 'Producto multialmacen', 'Laboratorio A', 'UND', true, true),
  ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'P-A-02', 'Producto sin stock', 'Laboratorio B', 'UND', false, false),
  ('a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'P-A-03', 'Producto inmovilizado', 'Laboratorio C', 'UND', true, true),
  ('a3000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002', 'P-B-01', 'Producto de otra organizacion', 'Laboratorio D', 'UND', false, false);

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
)
values
  ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'CENTRAL-A', 'Central A', 'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'),
  ('a4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'NORTE-A', 'Norte A', 'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'),
  ('a4000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 'CENTRAL-B', 'Central B', 'a2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002');

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values
  ('a5000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'A-01', 'Anaquel A', 'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'B-01', 'Anaquel B', 'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000003', 'C-01', 'Anaquel C', 'a2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);

select public.record_inventory_movement('{"organization_id":"a1000000-0000-4000-8000-000000000001","product_id":"a3000000-0000-4000-8000-000000000001","warehouse_id":"a4000000-0000-4000-8000-000000000001","location_id":"a5000000-0000-4000-8000-000000000001","movement_type":"entrada","quantity":"5","unit_cost":"10","stock_status":"available","lot":"LOTE-1","expiration_date":"2027-06-30","operation_date":"2026-09-01","reason":"Lote uno central"}'::jsonb);
select public.record_inventory_movement('{"organization_id":"a1000000-0000-4000-8000-000000000001","product_id":"a3000000-0000-4000-8000-000000000001","warehouse_id":"a4000000-0000-4000-8000-000000000001","location_id":"a5000000-0000-4000-8000-000000000001","movement_type":"entrada","quantity":"4","unit_cost":"20","stock_status":"available","lot":"LOTE-2","expiration_date":"2028-06-30","operation_date":"2026-09-01","reason":"Lote dos central"}'::jsonb);
select public.record_inventory_movement('{"organization_id":"a1000000-0000-4000-8000-000000000001","product_id":"a3000000-0000-4000-8000-000000000001","warehouse_id":"a4000000-0000-4000-8000-000000000002","location_id":"a5000000-0000-4000-8000-000000000002","movement_type":"entrada","quantity":"3","unit_cost":"30","stock_status":"available","lot":"LOTE-1","expiration_date":"2027-06-30","operation_date":"2026-09-01","reason":"Lote uno norte"}'::jsonb);
select public.record_inventory_movement('{"organization_id":"a1000000-0000-4000-8000-000000000001","product_id":"a3000000-0000-4000-8000-000000000003","warehouse_id":"a4000000-0000-4000-8000-000000000001","location_id":"a5000000-0000-4000-8000-000000000001","movement_type":"entrada","quantity":"2","unit_cost":"7","stock_status":"quarantine","lot":"CUARENTENA","expiration_date":"2027-12-31","operation_date":"2026-09-01","reason":"Cuarentena"}'::jsonb);
select public.record_inventory_movement('{"organization_id":"a1000000-0000-4000-8000-000000000001","product_id":"a3000000-0000-4000-8000-000000000003","warehouse_id":"a4000000-0000-4000-8000-000000000001","location_id":"a5000000-0000-4000-8000-000000000001","movement_type":"entrada","quantity":"1","unit_cost":"9","stock_status":"damaged","lot":"DANADO","expiration_date":"2027-12-31","operation_date":"2026-09-01","reason":"Danado"}'::jsonb);
select public.record_inventory_movement('{"organization_id":"a1000000-0000-4000-8000-000000000001","product_id":"a3000000-0000-4000-8000-000000000003","warehouse_id":"a4000000-0000-4000-8000-000000000001","location_id":"a5000000-0000-4000-8000-000000000001","movement_type":"entrada","quantity":"3","unit_cost":"5","stock_status":"available","lot":"VENCIDO","expiration_date":"2020-01-01","operation_date":"2026-09-01","reason":"Vencido"}'::jsonb);

reset role;

insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status,
  lot, expiration_date, quantity, quantity_consumed, status, source_type,
  source_id, created_by, updated_by
)
values (
  'a6000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'available', 'LOTE-1', '2027-06-30', 4, 0, 'active',
  'test-summary', 'a7000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select public.record_inventory_movement('{"organization_id":"a1000000-0000-4000-8000-000000000002","product_id":"a3000000-0000-4000-8000-000000000004","warehouse_id":"a4000000-0000-4000-8000-000000000003","location_id":"a5000000-0000-4000-8000-000000000003","movement_type":"entrada","quantity":"99","unit_cost":"2","stock_status":"available","operation_date":"2026-09-01","reason":"Otra organizacion"}'::jsonb);

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*) from public.inventory_product_stock_summary),
  3::bigint,
  'incluye exactamente los productos visibles de la organizacion A'
);
select results_eq(
  $$select physical_quantity, sanitary_available_quantity, reserved_quantity,
           assignable_quantity
    from public.inventory_product_stock_summary
    where product_id = 'a3000000-0000-4000-8000-000000000001'$$,
  $$values (12.000::numeric, 12.000::numeric, 4.000::numeric, 8.000::numeric)$$,
  'fisico, reserva y asignable se agregan una sola vez entre almacenes'
);
select results_eq(
  $$select warehouse_count, bucket_count, lot_count
    from public.inventory_product_stock_summary
    where product_id = 'a3000000-0000-4000-8000-000000000001'$$,
  $$values (2::bigint, 3::bigint, 3::bigint)$$,
  'conteos distinguen almacenes y buckets sin duplicar joins'
);
select is(
  (select inventory_value from public.inventory_product_stock_summary
   where product_id = 'a3000000-0000-4000-8000-000000000001'),
  220.0000::numeric,
  'la valorizacion suma cada bucket exactamente una vez'
);
select results_eq(
  $$select physical_quantity, reserved_quantity, assignable_quantity,
           inventory_value, warehouse_count, bucket_count, lot_count
    from public.inventory_product_stock_summary
    where product_id = 'a3000000-0000-4000-8000-000000000002'$$,
  $$values (0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::bigint, 0::bigint, 0::bigint)$$,
  'LEFT JOIN conserva productos sin stock con agregados en cero'
);
select is(
  (select laboratory from public.inventory_product_stock_summary
   where product_id = 'a3000000-0000-4000-8000-000000000002'),
  'Laboratorio B'::text,
  'la vista expone laboratorio para busqueda server-side'
);
select results_eq(
  $$select physical_quantity, sanitary_available_quantity, assignable_quantity,
           quarantine_quantity, damaged_quantity, expired_quantity
    from public.inventory_product_stock_summary
    where product_id = 'a3000000-0000-4000-8000-000000000003'$$,
  $$values (6.000::numeric, 0.000::numeric, 0.000::numeric,
            2.000::numeric, 1.000::numeric, 3.000::numeric)$$,
  'cuarentena, danado y vencido permanecen separados y no asignables'
);
select is(
  (select inventory_value from public.inventory_product_stock_summary
   where product_id = 'a3000000-0000-4000-8000-000000000003'),
  38.0000::numeric,
  'la valorizacion incluye correctamente todos los estados fisicos'
);
select results_eq(
  $$select distinct organization_id
    from public.inventory_product_stock_summary$$,
  $$values ('a1000000-0000-4000-8000-000000000001'::uuid)$$,
  'el usuario A solo observa su organizacion'
);
select is(
  (select count(*) from public.inventory_product_stock_summary
   where organization_id = 'a1000000-0000-4000-8000-000000000002'),
  0::bigint,
  'filtrar directamente otra organizacion no omite RLS'
);

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$select product_id from public.inventory_product_stock_summary$$,
  $$values ('a3000000-0000-4000-8000-000000000004'::uuid)$$,
  'el usuario B solo observa su propio producto'
);
select is(
  (select count(*) from public.inventory_product_stock_summary
   where organization_id = 'a1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'el usuario B no observa productos de la organizacion A'
);

reset role;
select * from finish();
rollback;
