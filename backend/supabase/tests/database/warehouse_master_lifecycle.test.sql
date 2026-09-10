begin;

select plan(42);

select has_column('public', 'warehouses', 'lock_version', 'almacenes usa version optimista');
select has_column('public', 'warehouse_locations', 'lock_version', 'ubicaciones usa version optimista');
select has_table('public', 'warehouse_master_operations', 'existe registro idempotente de comandos');
select has_function('public', 'save_warehouse', array['jsonb'], 'existe comando para guardar almacenes');
select has_function('public', 'save_warehouse_location', array['jsonb'], 'existe comando para guardar ubicaciones');
select has_function('public', 'set_warehouse_status', array['jsonb'], 'existe comando de estado del almacen');
select has_function('public', 'set_warehouse_location_status', array['jsonb'], 'existe comando de estado de la ubicacion');
select is(
  has_function_privilege('anon', 'public.save_warehouse(jsonb)', 'EXECUTE'),
  false,
  'anon no ejecuta comandos de almacenes'
);
select is(
  has_table_privilege('authenticated', 'public.warehouses', 'INSERT'),
  false,
  'authenticated no evita el contrato insertando almacenes directamente'
);
select is(
  has_table_privilege('authenticated', 'public.warehouse_locations', 'UPDATE'),
  false,
  'authenticated no evita el contrato actualizando ubicaciones directamente'
);

insert into public.organizations (id, name, slug) values
  ('91000000-0000-4000-8000-000000000001', 'Ciclo almacenes', 'ciclo-almacenes'),
  ('91000000-0000-4000-8000-000000000002', 'Empresa ajena', 'empresa-ajena-almacenes');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('92000000-0000-4000-8000-000000000001', 'ciclo.almacen@test.local', '{"full_name":"Ciclo Almacen"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'ALMACEN');

insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  batch_control, expiration_control
) values (
  '93000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'ALM-TEST-01', 'Producto para ciclo de almacenes', 'UND', false, false
);

insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name
) values (
  '97000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'ruc', '20123456789', 'Proveedor para ciclo de almacenes'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);

select is(
  public.save_warehouse(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000001","code":"CENTRAL","name":"Almacen central","address":"Trujillo"}'::jsonb
  ),
  '94000000-0000-4000-8000-000000000001'::uuid,
  'crea un almacen mediante el comando'
);
select is(
  (select count(*) from public.warehouse_locations
   where warehouse_id = '94000000-0000-4000-8000-000000000001' and code = 'GENERAL'),
  1::bigint,
  'crea la ubicacion GENERAL en la misma transaccion'
);
select is(
  public.save_warehouse(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000001","code":"CENTRAL","name":"Almacen central","address":"Trujillo"}'::jsonb
  ),
  '94000000-0000-4000-8000-000000000001'::uuid,
  'reintentar la misma creacion devuelve el mismo almacen'
);
select is(
  (select count(*) from public.warehouses
   where organization_id = '91000000-0000-4000-8000-000000000001' and code = 'CENTRAL'),
  1::bigint,
  'el reintento no duplica el almacen'
);
select throws_ok(
  $$select public.save_warehouse(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000001","code":"CENTRAL","name":"Datos diferentes"}'::jsonb
  )$$,
  'P0001', 'WAREHOUSE_OPERATION_KEY_REUSED',
  'una clave idempotente no se reutiliza con otros datos'
);
select is(
  public.save_warehouse(
    '{"id":"94000000-0000-4000-8000-000000000002","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000002","code":"NORTE","name":"Almacen norte"}'::jsonb
  ),
  '94000000-0000-4000-8000-000000000002'::uuid,
  'crea un segundo almacen para conservar continuidad operativa'
);
select is(
  public.save_warehouse_location(
    '{"id":"95000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000003","warehouse_id":"94000000-0000-4000-8000-000000000001","code":"A-01","name":"Anaquel uno"}'::jsonb
  ),
  '95000000-0000-4000-8000-000000000001'::uuid,
  'crea una ubicacion dentro del almacen'
);
select is(
  public.save_warehouse(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000004","expected_lock_version":1,"code":"CENTRAL","name":"Central actualizado","address":"Nueva direccion"}'::jsonb
  ),
  '94000000-0000-4000-8000-000000000001'::uuid,
  'actualiza los datos editables del almacen'
);
select results_eq(
  $$select name, address, lock_version from public.warehouses
    where id = '94000000-0000-4000-8000-000000000001'$$,
  $$values ('Central actualizado'::text, 'Nueva direccion'::text, 2::bigint)$$,
  'actualizar incrementa la version del almacen'
);
select throws_ok(
  $$select public.save_warehouse(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000005","expected_lock_version":1,"code":"CENTRAL","name":"Cambio obsoleto"}'::jsonb
  )$$,
  '40001', 'WAREHOUSE_STALE_WRITE',
  'rechaza una edicion basada en una version obsoleta'
);
select is(
  public.save_warehouse_location(
    '{"id":"95000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000006","expected_lock_version":1,"warehouse_id":"94000000-0000-4000-8000-000000000001","code":"A-01","name":"Anaquel principal","description":"Nivel uno"}'::jsonb
  ),
  '95000000-0000-4000-8000-000000000001'::uuid,
  'actualiza los datos editables de la ubicacion'
);
select results_eq(
  $$select name, description, lock_version from public.warehouse_locations
    where id = '95000000-0000-4000-8000-000000000001'$$,
  $$values ('Anaquel principal'::text, 'Nivel uno'::text, 2::bigint)$$,
  'actualizar incrementa la version de la ubicacion'
);
select throws_ok(
  $$select public.save_warehouse_location(
    '{"id":"95000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000007","expected_lock_version":2,"warehouse_id":"94000000-0000-4000-8000-000000000001","code":"OTRO","name":"Anaquel principal"}'::jsonb
  )$$,
  'P0001', 'WAREHOUSE_LOCATION_CODE_IMMUTABLE',
  'el codigo de una ubicacion no cambia'
);

insert into public.product_warehouse_settings (
  organization_id, product_id, warehouse_id, default_location_id,
  minimum_stock, expiration_alert_days, updated_by
) values (
  '91000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  0, 30, '92000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$select public.set_warehouse_location_status(
    '{"id":"95000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000008","expected_lock_version":2,"is_active":false}'::jsonb
  )$$,
  'P0001', 'WAREHOUSE_LOCATION_IS_DEFAULT',
  'no desactiva una ubicacion predeterminada'
);

reset role;
delete from public.product_warehouse_settings
where organization_id = '91000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.record_inventory_movement(
    '{"organization_id":"91000000-0000-4000-8000-000000000001","product_id":"93000000-0000-4000-8000-000000000001","warehouse_id":"94000000-0000-4000-8000-000000000001","location_id":"95000000-0000-4000-8000-000000000001","movement_type":"entrada","quantity":"5","unit_cost":"10","stock_status":"available","operation_date":"2026-09-07","reason":"Stock de prueba"}'::jsonb
  )$$,
  'prepara stock mediante el contrato autoritativo'
);
select throws_ok(
  $$select public.set_warehouse_status(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000009","expected_lock_version":2,"is_active":false}'::jsonb
  )$$,
  'P0001', 'WAREHOUSE_HAS_STOCK',
  'no desactiva un almacen con stock'
);
select throws_ok(
  $$select public.set_warehouse_location_status(
    '{"id":"95000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000010","expected_lock_version":2,"is_active":false}'::jsonb
  )$$,
  'P0001', 'WAREHOUSE_LOCATION_HAS_STOCK',
  'no desactiva una ubicacion con stock'
);
select lives_ok(
  $$select public.record_inventory_movement(
    '{"organization_id":"91000000-0000-4000-8000-000000000001","product_id":"93000000-0000-4000-8000-000000000001","warehouse_id":"94000000-0000-4000-8000-000000000001","location_id":"95000000-0000-4000-8000-000000000001","movement_type":"ajuste-negativo","quantity":"5","unit_cost":"10","stock_status":"available","operation_date":"2026-09-07","reason":"Retiro de stock de prueba"}'::jsonb
  )$$,
  'deja el bucket sin saldo antes de desactivar'
);

reset role;
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  status, issued_at
) values (
  '98000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001', '20123456789',
  'Proveedor para ciclo de almacenes', 'factura', 'F001', 'ALM-001',
  '2026-09-07', 'Central actualizado',
  '94000000-0000-4000-8000-000000000001', 'partially_received', now()
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.set_warehouse_status(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000011","expected_lock_version":2,"is_active":false}'::jsonb
  )$$,
  'P0001', 'WAREHOUSE_HAS_OPEN_PURCHASES',
  'no desactiva un almacen con una compra parcialmente recibida'
);

reset role;
delete from public.purchase_orders
where id = '98000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.set_warehouse_status(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000012","expected_lock_version":2,"is_active":false}'::jsonb
  )$$,
  'desactiva un almacen sin dependencias operativas'
);
select results_eq(
  $$select is_active, lock_version from public.warehouses
    where id = '94000000-0000-4000-8000-000000000001'$$,
  $$values (false, 3::bigint)$$,
  'desactivar conserva el registro e incrementa su version'
);
select is(
  public.set_warehouse_status(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000012","expected_lock_version":2,"is_active":false}'::jsonb
  ),
  '94000000-0000-4000-8000-000000000001'::uuid,
  'reintentar el cambio de estado devuelve el resultado original'
);
select lives_ok(
  $$select public.set_warehouse_status(
    '{"id":"94000000-0000-4000-8000-000000000002","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000013","expected_lock_version":1,"is_active":false}'::jsonb
  )$$,
  'permite desactivar el ultimo almacen cuando no tiene dependencias'
);
select lives_ok(
  $$select public.set_warehouse_location_status(
    '{"id":"95000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000014","expected_lock_version":2,"is_active":false}'::jsonb
  )$$,
  'permite desactivar ubicaciones cuando el almacen ya esta inactivo'
);
select lives_ok(
  $$select public.set_warehouse_location_status(
    jsonb_build_object(
      'id', (select id from public.warehouse_locations
             where warehouse_id = '94000000-0000-4000-8000-000000000001' and code = 'GENERAL'),
      'organization_id', '91000000-0000-4000-8000-000000000001',
      'operation_key', '96000000-0000-4000-8000-000000000015',
      'expected_lock_version', 1,
      'is_active', false
    )
  )$$,
  'permite apagar la ubicacion restante de un almacen inactivo'
);
select throws_ok(
  $$select public.set_warehouse_status(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000016","expected_lock_version":3,"is_active":true}'::jsonb
  )$$,
  'P0001', 'WAREHOUSE_ACTIVE_LOCATION_REQUIRED',
  'no reactiva un almacen sin ubicaciones activas'
);
select lives_ok(
  $$select public.set_warehouse_location_status(
    jsonb_build_object(
      'id', (select id from public.warehouse_locations
             where warehouse_id = '94000000-0000-4000-8000-000000000001' and code = 'GENERAL'),
      'organization_id', '91000000-0000-4000-8000-000000000001',
      'operation_key', '96000000-0000-4000-8000-000000000017',
      'expected_lock_version', 2,
      'is_active', true
    )
  )$$,
  'reactiva una ubicacion antes de habilitar el almacen'
);
select lives_ok(
  $$select public.set_warehouse_status(
    '{"id":"94000000-0000-4000-8000-000000000001","organization_id":"91000000-0000-4000-8000-000000000001","operation_key":"96000000-0000-4000-8000-000000000018","expected_lock_version":3,"is_active":true}'::jsonb
  )$$,
  'reactiva un almacen que vuelve a tener una ubicacion activa'
);
select throws_ok(
  $$select public.save_warehouse(
    '{"id":"94000000-0000-4000-8000-000000000099","organization_id":"91000000-0000-4000-8000-000000000002","operation_key":"96000000-0000-4000-8000-000000000019","code":"AJENO","name":"Almacen ajeno"}'::jsonb
  )$$,
  '42501', 'WAREHOUSE_FORBIDDEN',
  'un usuario no administra almacenes de otra organizacion'
);

reset role;
select cmp_ok(
  (select count(*) from public.warehouse_master_operations
   where organization_id = '91000000-0000-4000-8000-000000000001'),
  '>=', 10::bigint,
  'los comandos completados quedan registrados para reintentos'
);
select cmp_ok(
  (select count(*) from public.audit_events
   where organization_id = '91000000-0000-4000-8000-000000000001'
     and entity_type in ('warehouses', 'warehouse_locations')),
  '>=', 10::bigint,
  'creaciones, ediciones y cambios de estado dejan auditoria'
);
select throws_ok(
  $$update public.warehouse_master_operations
    set request_payload = '{}'::jsonb
    where organization_id = '91000000-0000-4000-8000-000000000001'$$,
  'P0001', 'WAREHOUSE_OPERATION_IMMUTABLE',
  'el registro de idempotencia es inmutable'
);

select * from finish();
rollback;
