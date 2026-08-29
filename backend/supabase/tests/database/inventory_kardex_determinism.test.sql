begin;

select plan(16);

select has_column(
  'public', 'inventory_movements', 'ledger_sequence',
  'el ledger tiene una secuencia determinista'
);
select is(
  (select count(*) from public.inventory_movements where ledger_sequence is null),
  0::bigint,
  'ningun movimiento carece de secuencia'
);
select is(
  (select count(*) - count(distinct ledger_sequence) from public.inventory_movements),
  0::bigint,
  'la secuencia del ledger no se repite'
);
select ok(
  (select reloptions @> array['security_invoker=true']
   from pg_class where oid = 'public.inventory_kardex'::regclass),
  'inventory_kardex conserva security_invoker'
);

insert into public.organizations (id, name, slug)
values ('d1000000-0000-4000-8000-000000000001', 'Kardex determinista', 'kardex-determinista');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('d2000000-0000-4000-8000-000000000001', 'kardex@test.local', '{}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'ALMACEN');
insert into public.products (
  id, organization_id, code, description, unit_of_measure, batch_control, expiration_control
) values (
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'KARDEX-001', 'Producto para kardex determinista', 'UND', true, true
);
insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values
  ('d4000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'ORIGEN', 'Almacen origen', 'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001'),
  ('d4000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'DESTINO', 'Almacen destino', 'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001');
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values
  ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'A-01', 'Origen A-01', 'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001'),
  ('d5000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'B-01', 'Destino B-01', 'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000001', true);

select lives_ok($$select public.record_inventory_movement('{
  "organization_id":"d1000000-0000-4000-8000-000000000001","product_id":"d3000000-0000-4000-8000-000000000001",
  "warehouse_id":"d4000000-0000-4000-8000-000000000001","location_id":"d5000000-0000-4000-8000-000000000001",
  "movement_type":"entrada","quantity":"3","unit_cost":"10","stock_status":"available",
  "lot":"LOTE-A","expiration_date":"2026-10-15","operation_date":"2026-08-29","reason":"Ingreso lote A"
}'::jsonb)$$, 'registra lote A');
select lives_ok($$select public.record_inventory_movement('{
  "organization_id":"d1000000-0000-4000-8000-000000000001","product_id":"d3000000-0000-4000-8000-000000000001",
  "warehouse_id":"d4000000-0000-4000-8000-000000000001","location_id":"d5000000-0000-4000-8000-000000000001",
  "movement_type":"entrada","quantity":"6","unit_cost":"20","stock_status":"available",
  "lot":"LOTE-B","expiration_date":"2026-11-15","operation_date":"2026-08-29","reason":"Ingreso lote B"
}'::jsonb)$$, 'registra lote B');
select lives_ok($$select public.record_inventory_movement('{
  "organization_id":"d1000000-0000-4000-8000-000000000001","product_id":"d3000000-0000-4000-8000-000000000001",
  "warehouse_id":"d4000000-0000-4000-8000-000000000001","location_id":"d5000000-0000-4000-8000-000000000001",
  "movement_type":"entrada","quantity":"4","unit_cost":"30","stock_status":"available",
  "lot":"LOTE-C","expiration_date":"2026-12-15","operation_date":"2026-08-29","reason":"Ingreso lote C"
}'::jsonb)$$, 'registra lote C');

select lives_ok($$select public.record_inventory_fefo_outbound('{
  "organization_id":"d1000000-0000-4000-8000-000000000001","product_id":"d3000000-0000-4000-8000-000000000001",
  "warehouse_id":"d4000000-0000-4000-8000-000000000001","quantity":"5",
  "operation_date":"2026-08-29","reason":"Salida multilote determinista"
}'::jsonb)$$, 'registra salida multilote');

select results_eq(
  $$select lot, quantity from public.inventory_kardex
    where reason = 'Salida multilote determinista' order by ledger_sequence$$,
  $$values ('LOTE-A'::text, 3.000::numeric), ('LOTE-B'::text, 2.000::numeric)$$,
  'la secuencia conserva el orden FEFO dentro de la operacion'
);
select results_eq(
  $$select running_quantity, running_value from public.inventory_kardex
    where organization_id = 'd1000000-0000-4000-8000-000000000001'
      and product_id = 'd3000000-0000-4000-8000-000000000001'
      and warehouse_id = 'd4000000-0000-4000-8000-000000000001'
    order by ledger_sequence desc limit 1$$,
  $$values (8.000::numeric, 200.0000000::numeric)$$,
  'el saldo posterior a la salida corresponde al almacen origen'
);

select lives_ok($$select public.transfer_inventory_fefo('{
  "organization_id":"d1000000-0000-4000-8000-000000000001","reference":"TR-KARDEX-001",
  "source_warehouse_id":"d4000000-0000-4000-8000-000000000001",
  "destination_warehouse_id":"d4000000-0000-4000-8000-000000000002",
  "destination_location_id":"d5000000-0000-4000-8000-000000000002",
  "product_id":"d3000000-0000-4000-8000-000000000001","quantity":"6"
}'::jsonb)$$, 'registra transferencia multilote');

select results_eq(
  $$select lot, running_quantity, running_value from public.inventory_kardex
    where reason = 'Transferencia TR-KARDEX-001'
      and warehouse_id = 'd4000000-0000-4000-8000-000000000001'
    order by ledger_sequence$$,
  $$values
    ('LOTE-B'::text, 4.000::numeric, 120.0000000::numeric),
    ('LOTE-C'::text, 2.000::numeric, 60.0000000::numeric)$$,
  'el origen reduce su propio saldo en orden determinista'
);
select results_eq(
  $$select lot, running_quantity, running_value from public.inventory_kardex
    where reason = 'Transferencia TR-KARDEX-001'
      and warehouse_id = 'd4000000-0000-4000-8000-000000000002'
    order by ledger_sequence$$,
  $$values
    ('LOTE-B'::text, 4.000::numeric, 80.0000000::numeric),
    ('LOTE-C'::text, 6.000::numeric, 140.0000000::numeric)$$,
  'el destino incrementa su propio saldo en orden determinista'
);
select results_eq(
  $$select warehouse_id, running_quantity, running_value
    from (
      select distinct on (warehouse_id) warehouse_id, running_quantity, running_value
      from public.inventory_kardex
      where organization_id = 'd1000000-0000-4000-8000-000000000001'
        and product_id = 'd3000000-0000-4000-8000-000000000001'
      order by warehouse_id, ledger_sequence desc
    ) latest order by warehouse_id$$,
  $$values
    ('d4000000-0000-4000-8000-000000000001'::uuid, 2.000::numeric, 60.0000000::numeric),
    ('d4000000-0000-4000-8000-000000000002'::uuid, 6.000::numeric, 140.0000000::numeric)$$,
  'los saldos finales quedan separados por almacen'
);

reset role;
select is(has_table_privilege('authenticated', 'public.inventory_kardex', 'SELECT'), true, 'authenticated consulta el kardex');
select is(has_table_privilege('anon', 'public.inventory_kardex', 'SELECT'), false, 'anon no consulta el kardex');

select * from finish();
rollback;
