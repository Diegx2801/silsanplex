begin;

select plan(16);

select ok(
  (select reloptions @> array['security_invoker=true']
   from pg_class where oid = 'public.inventory_kardex'::regclass),
  'inventory_kardex conserva security_invoker'
);
select ok(
  position('products' in lower(pg_get_viewdef('public.inventory_kardex'::regclass, true))) = 0,
  'inventory_kardex no reinterpreta el histórico mediante el catálogo actual'
);
select is(
  (
    select array_agg(column_name || ':' || udt_name order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_kardex'
  ),
  array[
    'id:uuid', 'organization_id:uuid', 'product_id:uuid', 'product_code:text',
    'product_description:text', 'unit_of_measure:text', 'movement_type:text',
    'quantity:numeric', 'warehouse:text', 'lot:text', 'expiration_date:date',
    'operation_date:date', 'reason:text', 'source_type:text', 'source_id:uuid',
    'created_by:uuid', 'created_at:timestamptz', 'warehouse_id:uuid',
    'location_id:uuid', 'stock_status:text', 'unit_cost:numeric', 'transfer_id:uuid',
    'inbound_quantity:numeric', 'outbound_quantity:numeric', 'inbound_value:numeric',
    'outbound_value:numeric', 'running_quantity:numeric', 'running_value:numeric',
    'ledger_sequence:int8'
  ]::text[],
  'inventory_kardex conserva exactamente nombres, orden y tipos de sus 29 columnas'
);

insert into public.organizations (id, name, slug) values
  ('c4100000-0000-4000-8000-000000000001', 'Kardex histórico A', 'kardex-historico-a'),
  ('c4100000-0000-4000-8000-000000000002', 'Kardex histórico B', 'kardex-historico-b');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('c4200000-0000-4000-8000-000000000001', 'writer.c4@test.local', '{}', now(), now()),
  ('c4200000-0000-4000-8000-000000000002', 'reader.c4@test.local', '{}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('c4100000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000001'),
  ('c4100000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code)
values ('c4100000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000001', 'ALMACEN');
insert into public.organization_user_permissions (organization_id, user_id, permission_code)
values ('c4100000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000002', 'INVENTORY_VIEW');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  batch_control, expiration_control
) values
  (
    'c4300000-0000-4000-8000-000000000001',
    'c4100000-0000-4000-8000-000000000001',
    'HIST-C4', 'Producto histórico C4', 'UND', 'good', false, false
  ),
  (
    'c4300000-0000-4000-8000-000000000002',
    'c4100000-0000-4000-8000-000000000001',
    'SERV-C4', 'Servicio nuevo C4', 'UND', 'service', false, false
  ),
  (
    'c4300000-0000-4000-8000-000000000003',
    'c4100000-0000-4000-8000-000000000002',
    'OTHER-C4', 'Producto de otra organización', 'UND', 'good', false, false
  );

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by) values
  (
    'c4400000-0000-4000-8000-000000000001',
    'c4100000-0000-4000-8000-000000000001', 'CENTRAL', 'Central C4',
    'c4200000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000001'
  ),
  (
    'c4400000-0000-4000-8000-000000000002',
    'c4100000-0000-4000-8000-000000000002', 'OTHER', 'Otra organización C4',
    null, null
  );
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values
  (
    'c4500000-0000-4000-8000-000000000001',
    'c4100000-0000-4000-8000-000000000001',
    'c4400000-0000-4000-8000-000000000001', 'A-01', 'Ubicación C4',
    'c4200000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000001'
  ),
  (
    'c4500000-0000-4000-8000-000000000002',
    'c4100000-0000-4000-8000-000000000002',
    'c4400000-0000-4000-8000-000000000002', 'B-01', 'Ubicación ajena C4',
    null, null
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4200000-0000-4000-8000-000000000001', true);

select lives_ok($$select public.record_inventory_movement('{
  "organization_id":"c4100000-0000-4000-8000-000000000001",
  "product_id":"c4300000-0000-4000-8000-000000000001",
  "warehouse_id":"c4400000-0000-4000-8000-000000000001",
  "location_id":"c4500000-0000-4000-8000-000000000001",
  "movement_type":"entrada","quantity":"5","unit_cost":"10",
  "stock_status":"available","operation_date":"2026-09-01",
  "reason":"Entrada histórica C4"
}'::jsonb)$$, 'el producto físico recibe una entrada válida');
select lives_ok($$select public.record_inventory_movement('{
  "organization_id":"c4100000-0000-4000-8000-000000000001",
  "product_id":"c4300000-0000-4000-8000-000000000001",
  "warehouse_id":"c4400000-0000-4000-8000-000000000001",
  "location_id":"c4500000-0000-4000-8000-000000000001",
  "movement_type":"salida","quantity":"5","unit_cost":"10",
  "stock_status":"available","operation_date":"2026-09-02",
  "reason":"Salida histórica C4"
}'::jsonb)$$, 'el producto físico puede quedar con saldo cero');

reset role;

select lives_ok($$
  update public.products
  set product_type = 'service'
  where id = 'c4300000-0000-4000-8000-000000000001'
$$, 'good con saldo cero cambia legítimamente a service');
select is(
  (select product_type from public.products where id = 'c4300000-0000-4000-8000-000000000001'),
  'service',
  'el catálogo conserva la transición válida'
);

insert into public.inventory_movements (
  organization_id, product_id, product_code, product_description,
  unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
  location_id, stock_status, unit_cost, operation_date, reason
) values (
  'c4100000-0000-4000-8000-000000000002',
  'c4300000-0000-4000-8000-000000000003', 'OTHER-C4',
  'Producto de otra organización', 'UND', 'entrada', 2, 'Otra organización C4',
  'c4400000-0000-4000-8000-000000000002',
  'c4500000-0000-4000-8000-000000000002', 'available', 7,
  '2026-09-01', 'Movimiento ajeno C4'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4200000-0000-4000-8000-000000000002', true);

select ok(
  public.has_organization_permission(
    'c4100000-0000-4000-8000-000000000001', 'INVENTORY_VIEW'
  ),
  'el lector posee INVENTORY_VIEW en la organización A'
);
select ok(
  not public.has_organization_permission(
    'c4100000-0000-4000-8000-000000000001', 'PRODUCTS_VIEW'
  ),
  'el lector no posee PRODUCTS_VIEW'
);
select is(
  (select count(*) from public.products
   where organization_id = 'c4100000-0000-4000-8000-000000000001'),
  0::bigint,
  'RLS de products no expone el catálogo al lector'
);
select results_eq(
  $$select movement_type, inbound_quantity, outbound_quantity,
      running_quantity, inbound_value, outbound_value, running_value
    from public.inventory_kardex
    where organization_id = 'c4100000-0000-4000-8000-000000000001'
      and product_id = 'c4300000-0000-4000-8000-000000000001'
    order by operation_date, ledger_sequence$$,
  $$values
    ('entrada'::text, 5::numeric, 0::numeric, 5::numeric,
      50::numeric, 0::numeric, 50::numeric),
    ('salida'::text, 0::numeric, 5::numeric, 0::numeric,
      0::numeric, 50::numeric, 0::numeric)$$,
  'INVENTORY_VIEW conserva cantidades y saldos del histórico good a service'
);
select is(
  (select count(*) from public.inventory_kardex
   where organization_id = 'c4100000-0000-4000-8000-000000000002'),
  0::bigint,
  'el Kardex mantiene aislamiento entre organizaciones'
);

select set_config('request.jwt.claim.sub', 'c4200000-0000-4000-8000-000000000001', true);
select throws_ok($$select public.record_inventory_movement('{
  "organization_id":"c4100000-0000-4000-8000-000000000001",
  "product_id":"c4300000-0000-4000-8000-000000000002",
  "warehouse_id":"c4400000-0000-4000-8000-000000000001",
  "location_id":"c4500000-0000-4000-8000-000000000001",
  "movement_type":"entrada","quantity":"1","unit_cost":"25",
  "stock_status":"available","operation_date":"2026-09-03",
  "reason":"Entrada inválida de servicio C4"
}'::jsonb)$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio nuevo sigue bloqueado por la ruta protegida');
select is(
  (select count(*) from public.inventory_movements
   where product_id = 'c4300000-0000-4000-8000-000000000002'),
  0::bigint,
  'el rechazo no crea movimientos físicos para el servicio nuevo'
);

reset role;
select is(
  has_table_privilege('anon', 'public.inventory_kardex', 'SELECT'),
  false,
  'anon no tiene grant de lectura sobre Kardex'
);
set local role anon;
select throws_ok(
  $$select count(*) from public.inventory_kardex$$,
  '42501', null,
  'anon no puede consultar Kardex'
);

reset role;
select * from finish();
rollback;
