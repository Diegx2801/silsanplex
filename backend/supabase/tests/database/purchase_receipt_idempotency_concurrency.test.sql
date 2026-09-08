begin;

select plan(18);
create extension if not exists dblink with schema extensions;
select ok(exists (select 1 from pg_catalog.pg_extension where extname = 'dblink'), 'dblink disponible');

insert into public.organizations (id, name, slug)
values ('a7000000-0000-4000-8000-000000000001', 'A3 Concurrencia', 'a3-concurrencia');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('a7100000-0000-4000-8000-000000000001', 'a3-conc@test.local', '{"full_name":"A3 Conc"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('a7000000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values
  ('a7000000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('a7000000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'ALMACEN');
insert into public.suppliers (id, organization_id, document_type, document_number, business_name)
values ('a7200000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'ruc', '20999999991', 'Proveedor A3 Concurrencia');
insert into public.warehouses (id, organization_id, code, name)
values ('a7300000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'A3-C', 'Almacen A3 Concurrencia');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name)
values ('a7400000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'GENERAL', 'General A3 Concurrencia');
insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control
) values (
  'a7500000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001',
  'A3-CONC-GOOD', 'Bien A3 Concurrencia', 'UND', 'good', 'gravado', false, false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000001', true);
select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'a7000000-0000-4000-8000-000000000001',
  'supplier_id', 'a7200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'A3C', 'document_number', '901',
  'issue_date', current_date, 'warehouse_id', 'a7300000-0000-4000-8000-000000000001',
  'warehouse', 'Almacen A3 Concurrencia',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'a7500000-0000-4000-8000-000000000001',
    'quantity', 1, 'unit_cost', 10, 'lot', '', 'expiration_date', ''
  ))
));
select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'a7000000-0000-4000-8000-000000000001',
  'supplier_id', 'a7200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'A3C', 'document_number', '902',
  'issue_date', current_date, 'warehouse_id', 'a7300000-0000-4000-8000-000000000001',
  'warehouse', 'Almacen A3 Concurrencia',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'a7500000-0000-4000-8000-000000000001',
    'quantity', 2, 'unit_cost', 10, 'lot', '', 'expiration_date', ''
  ))
));
select public.issue_purchase_order('a7000000-0000-4000-8000-000000000001', (select id from public.purchase_orders where document_number = '901'));
select public.issue_purchase_order('a7000000-0000-4000-8000-000000000001', (select id from public.purchase_orders where document_number = '902'));
reset role;
commit;

create schema purchase_receipt_idempotency_concurrency_test;
create function purchase_receipt_idempotency_concurrency_test.receive_and_wait(
  requested_order uuid,
  requested_operation uuid,
  requested_quantity numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_item uuid := (select id from public.purchase_order_items where purchase_order_id = requested_order);
  receipt_id uuid;
begin
  perform set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"a7100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  perform pg_catalog.pg_sleep(0.5);
  receipt_id := public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'a7000000-0000-4000-8000-000000000001',
    'purchase_order_id', requested_order,
    'operation_key', requested_operation,
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', requested_item,
      'quantity', requested_quantity,
      'fulfillment_mode', 'physical',
      'location_id', 'a7400000-0000-4000-8000-000000000001'
    ))
  ));
  return 'ok:' || receipt_id::text;
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;
revoke all on function purchase_receipt_idempotency_concurrency_test.receive_and_wait(uuid, uuid, numeric) from public;

select is(extensions.dblink_connect('a3_idempotency_same_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres'), 'OK', 'abre sesion concurrente A');
select is(extensions.dblink_connect('a3_idempotency_same_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres'), 'OK', 'abre sesion concurrente B');
select is(extensions.dblink_send_query('a3_idempotency_same_a', $$select purchase_receipt_idempotency_concurrency_test.receive_and_wait((select id from public.purchase_orders where document_number = '901'), 'a7600000-0000-4000-8000-000000000001', 1)$$), 1, 'inicia retry concurrente A');
select is(extensions.dblink_send_query('a3_idempotency_same_b', $$select purchase_receipt_idempotency_concurrency_test.receive_and_wait((select id from public.purchase_orders where document_number = '901'), 'a7600000-0000-4000-8000-000000000001', 1)$$), 1, 'inicia retry concurrente B');
create temp table a3_same_results(result text);
insert into a3_same_results select result from extensions.dblink_get_result('a3_idempotency_same_a') as response(result text);
insert into a3_same_results select result from extensions.dblink_get_result('a3_idempotency_same_b') as response(result text);
select is((select count(*) from a3_same_results where result like 'ok:%'), 2::bigint, 'misma clave y payload convergen con exito');
select is((select min(result) from a3_same_results), (select max(result) from a3_same_results), 'misma clave y payload devuelven el mismo receipt_id');
select is((select count(*) from public.purchase_receipts where organization_id = 'a7000000-0000-4000-8000-000000000001' and purchase_order_id = (select id from public.purchase_orders where document_number = '901')), 1::bigint, 'la carrera igual crea una sola cabecera');
select is((select count(*) from public.purchase_receipt_items where organization_id = 'a7000000-0000-4000-8000-000000000001'), 1::bigint, 'la carrera igual crea una sola partida');
select is((select count(*) from public.inventory_movements where organization_id = 'a7000000-0000-4000-8000-000000000001' and source_type = 'purchase-receipt'), 1::bigint, 'la carrera igual crea un movimiento');
select is((select count(*) from public.audit_events where organization_id = 'a7000000-0000-4000-8000-000000000001' and action = 'PURCHASE_RECEIPT_CONFIRMED'), 1::bigint, 'la carrera igual crea una sola auditoria');

select extensions.dblink_disconnect('a3_idempotency_same_a');
select extensions.dblink_disconnect('a3_idempotency_same_b');
select extensions.dblink_connect('a3_idempotency_same_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('a3_idempotency_same_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
select is(extensions.dblink_send_query('a3_idempotency_same_a', $$select purchase_receipt_idempotency_concurrency_test.receive_and_wait((select id from public.purchase_orders where document_number = '902'), 'a7600000-0000-4000-8000-000000000002', 1)$$), 1, 'inicia payload ganador potencial');
select is(extensions.dblink_send_query('a3_idempotency_same_b', $$select purchase_receipt_idempotency_concurrency_test.receive_and_wait((select id from public.purchase_orders where document_number = '902'), 'a7600000-0000-4000-8000-000000000002', 2)$$), 1, 'inicia payload conflictivo potencial');
create temp table a3_different_results(result text);
insert into a3_different_results select result from extensions.dblink_get_result('a3_idempotency_same_a') as response(result text);
insert into a3_different_results select result from extensions.dblink_get_result('a3_idempotency_same_b') as response(result text);
select is((select count(*) from a3_different_results where result like 'ok:%'), 1::bigint, 'payload distinto deja una sola operacion ganadora');
select is((select count(*) from a3_different_results where result like '%PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT%'), 1::bigint, 'payload distinto devuelve conflicto estable');
select is((select count(*) from public.purchase_receipts where organization_id = 'a7000000-0000-4000-8000-000000000001' and purchase_order_id = (select id from public.purchase_orders where document_number = '902')), 1::bigint, 'payload distinto nunca duplica la cabecera');
select is((select count(*) from public.audit_events where organization_id = 'a7000000-0000-4000-8000-000000000001' and action = 'PURCHASE_RECEIPT_CONFIRMED'), 2::bigint, 'el conflicto no crea auditoria adicional');
select is((select count(*) from public.purchase_receipts where organization_id = 'a7000000-0000-4000-8000-000000000001' and operation_key = 'a7600000-0000-4000-8000-000000000002'), 1::bigint, 'la clave conflictiva conserva una sola recepcion');

select extensions.dblink_disconnect('a3_idempotency_same_a');
select extensions.dblink_disconnect('a3_idempotency_same_b');
begin;
drop schema purchase_receipt_idempotency_concurrency_test cascade;
alter table public.purchase_receipt_items disable trigger purchase_receipt_items_immutable;
delete from public.purchase_receipt_items where organization_id = 'a7000000-0000-4000-8000-000000000001';
alter table public.purchase_receipt_items enable trigger purchase_receipt_items_immutable;
alter table public.purchase_receipts disable trigger purchase_receipts_immutable;
delete from public.purchase_receipts where organization_id = 'a7000000-0000-4000-8000-000000000001';
alter table public.purchase_receipts enable trigger purchase_receipts_immutable;
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where organization_id = 'a7000000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.purchase_order_items where organization_id = 'a7000000-0000-4000-8000-000000000001';
delete from public.purchase_orders where organization_id = 'a7000000-0000-4000-8000-000000000001';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'a7000000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'a7000000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'a7000000-0000-4000-8000-000000000001';
delete from public.warehouse_locations where organization_id = 'a7000000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'a7000000-0000-4000-8000-000000000001';
delete from public.suppliers where organization_id = 'a7000000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'a7000000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'a7000000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'a7000000-0000-4000-8000-000000000001';
delete from auth.users where id = 'a7100000-0000-4000-8000-000000000001';
commit;

select * from finish();
