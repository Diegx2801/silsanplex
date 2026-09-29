begin;

select plan(16);
create extension if not exists dblink with schema extensions;
select ok(exists (select 1 from pg_catalog.pg_extension where extname = 'dblink'), 'dblink disponible');

insert into public.organizations (id, name, slug)
values ('e4c00000-0000-4000-8000-000000000001', 'E4C Concurrencia', 'e4c-concurrencia');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('e4c10000-0000-4000-8000-000000000001', 'e4c-conc@test.local', '{"full_name":"E4C Conc"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('e4c00000-0000-4000-8000-000000000001', 'e4c10000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values
  ('e4c00000-0000-4000-8000-000000000001', 'e4c10000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('e4c00000-0000-4000-8000-000000000001', 'e4c10000-0000-4000-8000-000000000001', 'ALMACEN');
insert into public.suppliers (id, organization_id, document_type, document_number, business_name)
values ('e4c20000-0000-4000-8000-000000000001', 'e4c00000-0000-4000-8000-000000000001', 'ruc', '20999999992', 'Proveedor E4C Concurrencia');
insert into public.warehouses (id, organization_id, code, name)
values ('e4c30000-0000-4000-8000-000000000001', 'e4c00000-0000-4000-8000-000000000001', 'E4C-C', 'Almacen E4C Concurrencia');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name)
values ('e4c40000-0000-4000-8000-000000000001', 'e4c00000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000001', 'GENERAL', 'General E4C Concurrencia');
insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control
) values (
  'e4c50000-0000-4000-8000-000000000001', 'e4c00000-0000-4000-8000-000000000001',
  'E4C-CONC-GOOD', 'Bien E4C Concurrencia', 'UND', 'good', 'gravado', false, false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4c10000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4c10000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'e4c00000-0000-4000-8000-000000000001',
  'supplier_id', 'e4c20000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'E4CC', 'document_number', '001',
  'issue_date', current_date, 'warehouse_id', 'e4c30000-0000-4000-8000-000000000001',
  'warehouse', 'Almacen E4C Concurrencia',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'e4c50000-0000-4000-8000-000000000001',
    'quantity', 5, 'unit_cost', 10, 'lot', '', 'expiration_date', ''
  ))
));
select public.issue_purchase_order(
  'e4c00000-0000-4000-8000-000000000001',
  (select id from public.purchase_orders where document_number = '001')
);
reset role;
commit;

create schema purchase_receipt_inspection_concurrency_test;
create function purchase_receipt_inspection_concurrency_test.receive_and_wait(
  requested_order uuid,
  requested_operation uuid
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
  perform set_config('request.jwt.claim.sub', 'e4c10000-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"e4c10000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  perform pg_catalog.pg_sleep(0.5);
  receipt_id := public.receive_purchase_order_partial_inspected(jsonb_build_object(
    'organization_id', 'e4c00000-0000-4000-8000-000000000001',
    'purchase_order_id', requested_order,
    'operation_key', requested_operation,
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', requested_item,
      'quantity', 5,
      'fulfillment_mode', 'physical',
      'location_id', 'e4c40000-0000-4000-8000-000000000001',
      'lot', 'LOTE-E4C-CONC',
      'expiration_date', '2028-12-31',
      'inspection', jsonb_build_object(
        'inspected_quantity', 5,
        'accepted_quantity', 4,
        'rejected_quantity', 1,
        'observation', 'Rechazo concurrente controlado',
        'findings', jsonb_build_array(jsonb_build_object(
          'reason_code', 'quality',
          'quantity', 1
        ))
      )
    ))
  ));
  return 'ok:' || receipt_id::text;
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;
revoke all on function purchase_receipt_inspection_concurrency_test.receive_and_wait(uuid, uuid) from public;

select is(extensions.dblink_connect('e4c_inspection_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres'), 'OK', 'abre la sesion concurrente A');
select is(extensions.dblink_connect('e4c_inspection_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres'), 'OK', 'abre la sesion concurrente B');
select is(extensions.dblink_send_query('e4c_inspection_a', $$select purchase_receipt_inspection_concurrency_test.receive_and_wait((select id from public.purchase_orders where document_number = '001'), 'e4c60000-0000-4000-8000-000000000001')$$), 1, 'inicia la inspeccion concurrente A');
select is(extensions.dblink_send_query('e4c_inspection_b', $$select purchase_receipt_inspection_concurrency_test.receive_and_wait((select id from public.purchase_orders where document_number = '001'), 'e4c60000-0000-4000-8000-000000000001')$$), 1, 'inicia la inspeccion concurrente B');
create temp table e4c_inspection_results(result text);
insert into e4c_inspection_results
select result from extensions.dblink_get_result('e4c_inspection_a') as response(result text)
union all
select result from extensions.dblink_get_result('e4c_inspection_b') as response(result text);
select is((select count(*) from e4c_inspection_results where result like 'ok:%'), 2::bigint, 'las dos sesiones convergen con exito');
select is((select min(result) from e4c_inspection_results), (select max(result) from e4c_inspection_results), 'las dos sesiones devuelven el mismo receipt_id');
select is((select count(*) from public.purchase_receipts where organization_id = 'e4c00000-0000-4000-8000-000000000001'), 1::bigint, 'la concurrencia crea una sola cabecera');
select is((select count(*) from public.purchase_receipt_items where organization_id = 'e4c00000-0000-4000-8000-000000000001'), 1::bigint, 'la concurrencia crea una sola partida');
select is((select count(*) from public.purchase_receipt_inspections where organization_id = 'e4c00000-0000-4000-8000-000000000001' and status = 'completed'), 1::bigint, 'la concurrencia crea una sola inspeccion efectiva');
select is((select inspected_quantity from public.purchase_receipt_inspections where organization_id = 'e4c00000-0000-4000-8000-000000000001'), 5::numeric, 'la inspeccion conserva la cantidad fisica');
select is((select sum(quantity) from public.inventory_movements where organization_id = 'e4c00000-0000-4000-8000-000000000001' and source_type = 'purchase-receipt'), 4::numeric, 'la concurrencia ingresa solo la cantidad aceptada');
select is((select count(*) from public.supplier_returns where organization_id = 'e4c00000-0000-4000-8000-000000000001'), 0::bigint, 'la concurrencia no crea devolucion por rechazo');
select is((select count(*) from public.audit_events where organization_id = 'e4c00000-0000-4000-8000-000000000001' and action = 'PURCHASE_RECEIPT_INSPECTION_COMPLETED'), 1::bigint, 'la concurrencia crea una sola auditoria de inspeccion');
select is((select count(*) from public.audit_events where organization_id = 'e4c00000-0000-4000-8000-000000000001' and action = 'PURCHASE_RECEIPT_CONFIRMED'), 1::bigint, 'la concurrencia crea una sola auditoria de recepcion');
select is((select status from public.purchase_orders where organization_id = 'e4c00000-0000-4000-8000-000000000001' and document_number = '001'), 'received', 'la orden termina recibida una sola vez');

select extensions.dblink_disconnect('e4c_inspection_a');
select extensions.dblink_disconnect('e4c_inspection_b');

begin;
drop schema purchase_receipt_inspection_concurrency_test cascade;
alter table public.purchase_receipt_inspection_reasons disable trigger purchase_receipt_inspection_reasons_immutable;
update public.purchase_receipt_inspections
set status = 'voided',
    voided_by = 'e4c10000-0000-4000-8000-000000000001',
    voided_at = now(),
    void_reason = 'Limpieza de prueba de concurrencia'
where organization_id = 'e4c00000-0000-4000-8000-000000000001';
delete from public.purchase_receipt_inspection_reasons where organization_id = 'e4c00000-0000-4000-8000-000000000001';
set constraints all immediate;
alter table public.purchase_receipt_inspection_reasons enable trigger purchase_receipt_inspection_reasons_immutable;
alter table public.purchase_receipt_inspections disable trigger purchase_receipt_inspections_immutable;
delete from public.purchase_receipt_inspections where organization_id = 'e4c00000-0000-4000-8000-000000000001';
set constraints all immediate;
alter table public.purchase_receipt_inspections enable trigger purchase_receipt_inspections_immutable;
alter table public.purchase_receipt_items disable trigger purchase_receipt_items_immutable;
delete from public.purchase_receipt_items where organization_id = 'e4c00000-0000-4000-8000-000000000001';
alter table public.purchase_receipt_items enable trigger purchase_receipt_items_immutable;
alter table public.purchase_receipts disable trigger purchase_receipts_immutable;
delete from public.purchase_receipts where organization_id = 'e4c00000-0000-4000-8000-000000000001';
alter table public.purchase_receipts enable trigger purchase_receipts_immutable;
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where organization_id = 'e4c00000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.purchase_order_items where organization_id = 'e4c00000-0000-4000-8000-000000000001';
delete from public.purchase_orders where organization_id = 'e4c00000-0000-4000-8000-000000000001';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'e4c00000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'e4c00000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'e4c00000-0000-4000-8000-000000000001';
delete from public.warehouse_locations where organization_id = 'e4c00000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'e4c00000-0000-4000-8000-000000000001';
delete from public.suppliers where organization_id = 'e4c00000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'e4c00000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'e4c00000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'e4c00000-0000-4000-8000-000000000001';
delete from auth.users where id = 'e4c10000-0000-4000-8000-000000000001';
commit;

select * from finish();
