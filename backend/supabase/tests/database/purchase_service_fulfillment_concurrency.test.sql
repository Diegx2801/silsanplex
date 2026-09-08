begin;

select plan(8);
select 1 from pg_catalog.pg_extension where extname = 'dblink';
create extension if not exists dblink with schema extensions;

insert into public.organizations (id, name, slug)
values ('a3000000-0000-4000-8000-000000000001', 'A2 Concurrencia', 'a2-concurrencia');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('a3100000-0000-4000-8000-000000000001', 'a2-conc@test.local', '{"full_name":"A2 Conc"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('a3000000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values
  ('a3000000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('a3000000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'ALMACEN');
insert into public.suppliers (id, organization_id, document_type, document_number, business_name)
values ('a3200000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'ruc', '20888888881', 'Proveedor conc');
insert into public.warehouses (id, organization_id, code, name)
values ('a3300000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'A2-C', 'Almacen conc');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name)
values ('a3400000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a3300000-0000-4000-8000-000000000001', 'GENERAL', 'General conc');
insert into public.products (id, organization_id, code, description, unit_of_measure, product_type, tax_affectation, batch_control, expiration_control)
values ('a3500000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'A2-CONC-GOOD', 'Bien conc', 'UND', 'good', 'gravado', false, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000001', true);
select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'a3000000-0000-4000-8000-000000000001', 'supplier_id', 'a3200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'A2C', 'document_number', '001', 'issue_date', current_date,
  'warehouse_id', 'a3300000-0000-4000-8000-000000000001', 'warehouse', 'Almacen conc',
  'items', jsonb_build_array(jsonb_build_object('product_id', 'a3500000-0000-4000-8000-000000000001', 'quantity', 1, 'unit_cost', 10, 'lot', '', 'expiration_date', ''))
));
select public.issue_purchase_order('a3000000-0000-4000-8000-000000000001', (select id from public.purchase_orders where document_number = '001'));

reset role;
commit;
create schema purchase_service_fulfillment_concurrency_test;
create function purchase_service_fulfillment_concurrency_test.receive_and_wait(requested_operation uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_order uuid := (select id from public.purchase_orders where document_number = '001');
begin
  perform set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  perform 1 from public.purchase_orders where id = requested_order for update;
  perform pg_catalog.pg_sleep(0.5);
  perform public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'a3000000-0000-4000-8000-000000000001',
    'purchase_order_id', requested_order, 'operation_key', requested_operation,
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = requested_order),
      'quantity', 1, 'fulfillment_mode', 'physical',
      'location_id', 'a3400000-0000-4000-8000-000000000001'
    ))
  ));
  return 'ok';
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;
revoke all on function purchase_service_fulfillment_concurrency_test.receive_and_wait(uuid) from public;

select is(extensions.dblink_connect('purchase_fulfillment_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres'), 'OK', 'abre la sesion concurrente A');
select is(extensions.dblink_connect('purchase_fulfillment_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres'), 'OK', 'abre la sesion concurrente B');
select is(extensions.dblink_send_query('purchase_fulfillment_a', $$select purchase_service_fulfillment_concurrency_test.receive_and_wait('a3600000-0000-4000-8000-000000000001')$$), 1, 'inicia la recepcion concurrente A');
select is(extensions.dblink_send_query('purchase_fulfillment_b', $$select purchase_service_fulfillment_concurrency_test.receive_and_wait('a3600000-0000-4000-8000-000000000002')$$), 1, 'inicia la recepcion concurrente B');
select ok((select result = 'ok' from extensions.dblink_get_result('purchase_fulfillment_a') as response(result text)), 'una sesion confirma exactamente una recepcion');
select ok((select result like 'error:%PURCHASE_ORDER_NOT_RECEIVABLE%' from extensions.dblink_get_result('purchase_fulfillment_b') as response(result text)), 'la sesion concurrente restante observa el estado ya recibido');
select is((select count(*) from public.purchase_receipt_items), 1::bigint, 'el bloqueo de orden evita duplicar partidas');
select is((select count(*) from public.inventory_movements where source_type = 'purchase-receipt'), 1::bigint, 'el bloqueo de orden evita duplicar movimientos');

select extensions.dblink_disconnect('purchase_fulfillment_a');
select extensions.dblink_disconnect('purchase_fulfillment_b');
begin;
drop schema purchase_service_fulfillment_concurrency_test cascade;
alter table public.purchase_receipt_items disable trigger purchase_receipt_items_immutable;
delete from public.purchase_receipt_items where organization_id = 'a3000000-0000-4000-8000-000000000001';
alter table public.purchase_receipt_items enable trigger purchase_receipt_items_immutable;
alter table public.purchase_receipts disable trigger purchase_receipts_immutable;
delete from public.purchase_receipts where organization_id = 'a3000000-0000-4000-8000-000000000001';
alter table public.purchase_receipts enable trigger purchase_receipts_immutable;
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where organization_id = 'a3000000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.purchase_order_items where organization_id = 'a3000000-0000-4000-8000-000000000001';
delete from public.purchase_orders where organization_id = 'a3000000-0000-4000-8000-000000000001';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'a3000000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'a3000000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'a3000000-0000-4000-8000-000000000001';
delete from public.warehouse_locations where organization_id = 'a3000000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'a3000000-0000-4000-8000-000000000001';
delete from public.suppliers where organization_id = 'a3000000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'a3000000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'a3000000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'a3000000-0000-4000-8000-000000000001';
delete from auth.users where id = 'a3100000-0000-4000-8000-000000000001';
commit;
