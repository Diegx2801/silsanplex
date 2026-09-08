begin;

select plan(33);

select has_column('public', 'purchase_order_items', 'product_type', 'las lineas congelan el tipo de producto');
select has_column('public', 'purchase_receipt_items', 'fulfillment_mode', 'las recepciones declaran el modo de atencion');

insert into public.organizations (id, name, slug)
values ('a2000000-0000-4000-8000-000000000001', 'A2 Compras', 'a2-compras');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('a2100000-0000-4000-8000-000000000001', 'a2@test.local', '{"full_name":"A2"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('a2000000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values
  ('a2000000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('a2000000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000001', 'ALMACEN');
insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name,
  created_by, updated_by
) values (
  'a2200000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001', 'ruc', '20999999991', 'Proveedor A2',
  'a2100000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000001'
);
insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
) values (
  'a2300000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001', 'A2-ALM', 'Almacen A2',
  'a2100000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'a2400000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001', 'a2300000-0000-4000-8000-000000000001',
  'GENERAL', 'General A2', 'a2100000-0000-4000-8000-000000000001',
  'a2100000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control, created_by, updated_by
) values
  (
    'a2500000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 'A2-GOOD', 'Bien A2', 'UND', 'good',
    'gravado', false, false, 'a2100000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000001'
  ),
  (
    'a2500000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001', 'A2-SERVICE', 'Servicio A2', 'UND', 'service',
    'inafecto', false, false, 'a2100000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2100000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'organization_id', 'a2000000-0000-4000-8000-000000000001',
    'supplier_id', 'a2200000-0000-4000-8000-000000000001',
    'document_type', 'factura', 'series', 'A2', 'document_number', '001',
    'issue_date', current_date, 'warehouse_id', 'a2300000-0000-4000-8000-000000000001',
    'warehouse', 'Almacen A2', 'prices_include_tax', false,
    'items', jsonb_build_array(
      jsonb_build_object('product_id', 'a2500000-0000-4000-8000-000000000001', 'quantity', 10, 'unit_cost', 10, 'lot', '', 'expiration_date', ''),
      jsonb_build_object('product_id', 'a2500000-0000-4000-8000-000000000002', 'quantity', 1, 'unit_cost', 100, 'lot', '', 'expiration_date', '')
    )
  ))
$$, 'guarda una orden mixta good + service');

select is(
  (select product_type from public.purchase_order_items item
   join public.purchase_orders purchase on purchase.id = item.purchase_order_id
   where purchase.document_number = '001' and item.product_id = 'a2500000-0000-4000-8000-000000000001'),
  'good', 'congela good en la linea');
select is(
  (select product_type from public.purchase_order_items item
   join public.purchase_orders purchase on purchase.id = item.purchase_order_id
   where purchase.document_number = '001' and item.product_id = 'a2500000-0000-4000-8000-000000000002'),
  'service', 'congela service en la linea');
reset role;
select throws_ok($$
  update public.purchase_order_items set product_type = 'service'
  where product_type = 'good'
$$, '55000', 'PURCHASE_ORDER_PRODUCT_TYPE_IMMUTABLE', 'el snapshot de tipo es inmutable');
set local role authenticated;

update public.products set product_type = 'good'
where id = 'a2500000-0000-4000-8000-000000000002';
select is(
  (select product_type from public.purchase_order_items item
   join public.purchase_orders purchase on purchase.id = item.purchase_order_id
   where purchase.document_number = '001' and item.product_id = 'a2500000-0000-4000-8000-000000000002'),
  'service', 'cambiar el producto no altera el snapshot');
update public.products set product_type = 'service'
where id = 'a2500000-0000-4000-8000-000000000002';

select public.issue_purchase_order(
  'a2000000-0000-4000-8000-000000000001',
  (select id from public.purchase_orders where document_number = '001')
);

select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'a2000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
    'operation_key', 'a2600000-0000-4000-8000-000000000001',
    'items', jsonb_build_array(
      jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '001') and item.product_id = 'a2500000-0000-4000-8000-000000000001'), 'quantity', 10, 'fulfillment_mode', 'physical', 'location_id', 'a2400000-0000-4000-8000-000000000001', 'lot', '', 'expiration_date', ''),
      jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '001') and item.product_id = 'a2500000-0000-4000-8000-000000000002'), 'quantity', 1, 'fulfillment_mode', 'administrative', 'location_id', null, 'lot', null, 'expiration_date', null)
    )
  ))
$$, 'recibe atomicamente las lineas fisica y administrativa');
select is((select status from public.purchase_orders where document_number = '001'), 'received', 'una orden mixta completa queda recibida');
select is((select count(*) from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = '001' and receipt_item.fulfillment_mode = 'physical'), 1::bigint, 'registra la partida fisica');
select is((select count(*) from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = '001' and receipt_item.fulfillment_mode = 'administrative'), 1::bigint, 'registra la partida administrativa');
select is((select count(*) from public.inventory_movements movement join public.purchase_receipt_items receipt_item on receipt_item.id = movement.source_id where receipt_item.fulfillment_mode = 'physical' and receipt_item.organization_id = 'a2000000-0000-4000-8000-000000000001'), 1::bigint, 'solo good crea movimiento');
select is((select count(*) from public.inventory_movements movement join public.purchase_receipt_items receipt_item on receipt_item.id = movement.source_id where receipt_item.fulfillment_mode = 'administrative' and receipt_item.organization_id = 'a2000000-0000-4000-8000-000000000001'), 0::bigint, 'service no crea movimiento');
select is((select count(*) from public.inventory_kardex where organization_id = 'a2000000-0000-4000-8000-000000000001' and product_id = 'a2500000-0000-4000-8000-000000000002'), 0::bigint, 'service no aparece en Kardex');
select is((select count(*) from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = '001' and receipt_item.fulfillment_mode = 'administrative' and receipt_item.warehouse_id is null and receipt_item.location_id is null and receipt_item.lot is null and receipt_item.expiration_date is null), 1::bigint, 'la atención administrativa no guarda campos físicos');
reset role;
select ok((select (metadata ->> 'physical_quantity')::numeric = 10 and (metadata ->> 'administrative_quantity')::numeric = 1 from public.audit_events where action = 'PURCHASE_RECEIPT_CONFIRMED' order by created_at desc, id desc limit 1), 'la auditoría separa cantidades físicas y administrativas');

select throws_ok($$
  insert into public.purchase_receipt_items (organization_id, receipt_id, purchase_order_item_id, product_id, warehouse_id, location_id, quantity, unit_cost, fulfillment_mode)
  values ('a2000000-0000-4000-8000-000000000001', (select id from public.purchase_receipts limit 1), (select id from public.purchase_order_items item where item.product_id = 'a2500000-0000-4000-8000-000000000002'), 'a2500000-0000-4000-8000-000000000002', 'a2300000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 1, 100, 'physical')
$$, 'P0001', 'PURCHASE_RECEIPT_SERVICE_PHYSICAL_FORBIDDEN', 'un service no acepta recepcion fisica directa');
select throws_ok($$
  insert into public.purchase_receipt_items (organization_id, receipt_id, purchase_order_item_id, product_id, quantity, unit_cost, fulfillment_mode)
  values ('a2000000-0000-4000-8000-000000000001', (select id from public.purchase_receipts limit 1), (select id from public.purchase_order_items item where item.product_id = 'a2500000-0000-4000-8000-000000000001'), 'a2500000-0000-4000-8000-000000000001', 1, 10, 'administrative')
$$, 'P0001', 'PURCHASE_RECEIPT_GOOD_ADMINISTRATIVE_FORBIDDEN', 'un good no acepta atencion administrativa directa');

set local role authenticated;
select lives_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'organization_id', 'a2000000-0000-4000-8000-000000000001', 'supplier_id', 'a2200000-0000-4000-8000-000000000001',
    'document_type', 'factura', 'series', 'A2', 'document_number', '002', 'issue_date', current_date,
    'warehouse_id', 'a2300000-0000-4000-8000-000000000001', 'warehouse', 'Almacen A2',
    'items', jsonb_build_array(jsonb_build_object('product_id', 'a2500000-0000-4000-8000-000000000002', 'quantity', 1, 'unit_cost', 20, 'lot', '', 'expiration_date', ''))
  ))
$$, 'permite crear una orden solo de servicios');
select lives_ok($$ select public.issue_purchase_order('a2000000-0000-4000-8000-000000000001', (select id from public.purchase_orders where document_number = '002')) $$, 'emite la orden solo de servicios');
select lives_ok($$ select public.receive_purchase_order('a2000000-0000-4000-8000-000000000001', (select id from public.purchase_orders where document_number = '002')) $$, 'el wrapper recibe administrativamente servicios');
select is((select status from public.purchase_orders where document_number = '002'), 'received', 'la orden solo de servicios queda recibida');
select is((select count(*) from public.inventory_movements movement where movement.reason like '%-002%'), 0::bigint, 'la orden solo de servicios no crea movimientos');

select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'a2000000-0000-4000-8000-000000000001', 'supplier_id', 'a2200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'A2', 'document_number', '003', 'issue_date', current_date,
  'warehouse_id', 'a2300000-0000-4000-8000-000000000001', 'warehouse', 'Almacen A2',
  'items', jsonb_build_array(
    jsonb_build_object('product_id', 'a2500000-0000-4000-8000-000000000001', 'quantity', 1, 'unit_cost', 10, 'lot', '', 'expiration_date', ''),
    jsonb_build_object('product_id', 'a2500000-0000-4000-8000-000000000002', 'quantity', 1, 'unit_cost', 20, 'lot', '', 'expiration_date', '')
  )
));
select public.issue_purchase_order('a2000000-0000-4000-8000-000000000001', (select id from public.purchase_orders where document_number = '003'));
select lives_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id', 'a2000000-0000-4000-8000-000000000001', 'purchase_order_id', (select id from public.purchase_orders where document_number = '003'), 'operation_key', 'a2600000-0000-4000-8000-000000000002', 'items', jsonb_build_array(jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '003') and item.product_type = 'good'), 'quantity', 1, 'fulfillment_mode', 'physical', 'location_id', 'a2400000-0000-4000-8000-000000000001', 'lot', '', 'expiration_date', '')))) $$, 'permite recepcion parcial fisica');
select is((select status from public.purchase_orders where document_number = '003'), 'partially_received', 'la orden mixta conserva pendientes');
select is((select quantity - coalesce((select sum(quantity) from public.purchase_receipt_items receipt_item where receipt_item.purchase_order_item_id = item.id), 0) from public.purchase_order_items item join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '003' and item.product_type = 'service'), 1::numeric, 'el servicio sigue pendiente tras recepcion fisica parcial');
select lives_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id', 'a2000000-0000-4000-8000-000000000001', 'purchase_order_id', (select id from public.purchase_orders where document_number = '003'), 'operation_key', 'a2600000-0000-4000-8000-000000000003', 'items', jsonb_build_array(jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '003') and item.product_type = 'service'), 'quantity', 1, 'fulfillment_mode', 'administrative')))) $$, 'permite completar luego el servicio');
select is((select status from public.purchase_orders where document_number = '003'), 'received', 'la orden mixta cierra cuando no quedan saldos');

select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'a2000000-0000-4000-8000-000000000001', 'supplier_id', 'a2200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'A2', 'document_number', '004', 'issue_date', current_date,
  'warehouse_id', 'a2300000-0000-4000-8000-000000000001', 'warehouse', 'Almacen A2',
  'items', jsonb_build_array(
    jsonb_build_object('product_id', 'a2500000-0000-4000-8000-000000000001', 'quantity', 1, 'unit_cost', 10, 'lot', '', 'expiration_date', ''),
    jsonb_build_object('product_id', 'a2500000-0000-4000-8000-000000000002', 'quantity', 1, 'unit_cost', 20, 'lot', '', 'expiration_date', '')
  )
));
select public.issue_purchase_order('a2000000-0000-4000-8000-000000000001', (select id from public.purchase_orders where document_number = '004'));
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id', 'a2000000-0000-4000-8000-000000000001', 'purchase_order_id', (select id from public.purchase_orders where document_number = '004'), 'operation_key', 'a2600000-0000-4000-8000-000000000004', 'items', jsonb_build_array(jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '004') and item.product_type = 'good'), 'quantity', 1, 'fulfillment_mode', 'physical', 'location_id', 'a2400000-0000-4000-8000-000000000001'), jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '004') and item.product_type = 'service'), 'quantity', 1, 'fulfillment_mode', 'physical', 'location_id', 'a2400000-0000-4000-8000-000000000001')))) $$, 'P0001', 'PURCHASE_RECEIPT_SERVICE_PHYSICAL_FORBIDDEN', 'una recepcion mixta incompatible revierte completa');
select is((select count(*) from public.purchase_receipts receipt join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = '004'), 0::bigint, 'el rollback no deja cabecera');
select is((select count(*) from public.inventory_movements movement where movement.source_type = 'purchase-receipt' and movement.reason like '%-004%'), 0::bigint, 'el rollback no deja movimiento fisico');

select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'a2000000-0000-4000-8000-000000000001', 'supplier_id', 'a2200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'A2', 'document_number', '005', 'issue_date', current_date,
  'warehouse_id', 'a2300000-0000-4000-8000-000000000001', 'warehouse', 'Almacen A2',
  'items', jsonb_build_array(jsonb_build_object('product_id', 'a2500000-0000-4000-8000-000000000001', 'quantity', 1, 'unit_cost', 10, 'lot', '', 'expiration_date', ''))
));
select public.issue_purchase_order('a2000000-0000-4000-8000-000000000001', (select id from public.purchase_orders where document_number = '005'));
reset role;
alter table public.purchase_order_items disable trigger purchase_order_items_snapshot_product_type;
update public.purchase_order_items set product_type = null
where purchase_order_id = (select id from public.purchase_orders where document_number = '005');
alter table public.purchase_order_items enable trigger purchase_order_items_snapshot_product_type;
set local role authenticated;
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id', 'a2000000-0000-4000-8000-000000000001', 'purchase_order_id', (select id from public.purchase_orders where document_number = '005'), 'operation_key', 'a2600000-0000-4000-8000-000000000005', 'items', jsonb_build_array(jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '005')), 'quantity', 1, 'fulfillment_mode', 'physical', 'location_id', 'a2400000-0000-4000-8000-000000000001')))) $$, 'P0001', 'PURCHASE_RECEIPT_PRODUCT_TYPE_UNKNOWN', 'una linea historica desconocida requiere regularizacion');

reset role;
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id', 'a2999999-9999-4999-8999-999999999999', 'purchase_order_id', (select id from public.purchase_orders where document_number = '001'), 'operation_key', gen_random_uuid(), 'items', '[]'::jsonb)) $$, '42501', 'PURCHASE_RECEIPT_FORBIDDEN', 'el RPC respeta el aislamiento de organizacion');

select * from finish();
rollback;
