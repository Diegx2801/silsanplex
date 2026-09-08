begin;

select plan(29);

select has_column(
  'public', 'purchase_order_items', 'expiration_control',
  'las lineas de compra guardan el snapshot de vencimiento'
);

insert into public.organizations (id, name, slug)
values ('a5000000-0000-4000-8000-000000000001', 'A4 Compras', 'a4-compras');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('a5100000-0000-4000-8000-000000000001', 'a4@test.local', '{"full_name":"A4"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('a5000000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values
  ('a5000000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('a5000000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001', 'ALMACEN');
insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name,
  created_by, updated_by
) values (
  'a5200000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001', 'ruc', '20888888881', 'Proveedor A4',
  'a5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001'
);
insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
) values (
  'a5300000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001', 'A4-ALM', 'Almacen A4',
  'a5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'a5400000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001', 'a5300000-0000-4000-8000-000000000001',
  'GENERAL', 'General A4',
  'a5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control, created_by, updated_by
) values
  (
    'a5500000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001', 'A4-GOOD', 'Bien A4', 'UND', 'good',
    'gravado', true, true,
    'a5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001'
  ),
  (
    'a5500000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000001', 'A4-SERVICE', 'Servicio A4', 'UND', 'service',
    'inafecto', false, false,
    'a5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001'
  ),
  (
    'a5500000-0000-4000-8000-000000000003',
    'a5000000-0000-4000-8000-000000000001', 'A4-PARTIAL', 'Bien parcial A4', 'UND', 'good',
    'gravado', false, false,
    'a5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001'
  ),
  (
    'a5500000-0000-4000-8000-000000000004',
    'a5000000-0000-4000-8000-000000000001', 'A4-INACTIVE', 'Bien inactivo A4', 'UND', 'good',
    'gravado', false, false,
    'a5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5100000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'organization_id', 'a5000000-0000-4000-8000-000000000001',
    'supplier_id', 'a5200000-0000-4000-8000-000000000001',
    'document_type', 'factura', 'series', 'A4', 'document_number', '001',
    'issue_date', current_date, 'warehouse_id', 'a5300000-0000-4000-8000-000000000001',
    'items', jsonb_build_array(
      jsonb_build_object('product_id', 'a5500000-0000-4000-8000-000000000001', 'quantity', 10, 'unit_cost', 10, 'lot', 'A4-L1', 'expiration_date', '2030-01-01'),
      jsonb_build_object('product_id', 'a5500000-0000-4000-8000-000000000002', 'quantity', 1, 'unit_cost', 100, 'lot', '', 'expiration_date', '')
    )
  ))
$$, 'permite una orden activa mixta');

select is((select item.expiration_control from public.purchase_order_items item join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '001' and item.product_id = 'a5500000-0000-4000-8000-000000000001'), true, 'congela expiration_control true');
select is((select item.expiration_control from public.purchase_order_items item join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '001' and item.product_id = 'a5500000-0000-4000-8000-000000000002'), false, 'congela expiration_control false');
set local role postgres;
select throws_ok($$ update public.purchase_order_items set expiration_control = false where product_id = 'a5500000-0000-4000-8000-000000000001' $$, '55000', 'PURCHASE_ORDER_EXPIRATION_CONTROL_IMMUTABLE', 'el snapshot de vencimiento es inmutable');
set local role authenticated;

select public.issue_purchase_order(
  'a5000000-0000-4000-8000-000000000001',
  (select id from public.purchase_orders where document_number = '001')
);

set local role postgres;
update public.products
set is_active = false, product_type = 'service', batch_control = false,
    expiration_control = false, updated_by = 'a5100000-0000-4000-8000-000000000001'
where id = 'a5500000-0000-4000-8000-000000000001';
update public.products
set is_active = false, product_type = 'good', updated_by = 'a5100000-0000-4000-8000-000000000001'
where id = 'a5500000-0000-4000-8000-000000000002';
select is((select item.product_type from public.purchase_order_items item join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '001' and item.product_id = 'a5500000-0000-4000-8000-000000000001'), 'good', 'A2 conserva good aunque el catalogo cambie');
select is((select item.product_type from public.purchase_order_items item join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '001' and item.product_id = 'a5500000-0000-4000-8000-000000000002'), 'service', 'A2 conserva service aunque el catalogo cambie');
set local role authenticated;

select throws_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'a5000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
    'operation_key', 'a5600000-0000-4000-8000-000000000001',
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '001') and item.product_id = 'a5500000-0000-4000-8000-000000000001'),
      'quantity', 10, 'fulfillment_mode', 'physical', 'location_id', 'a5400000-0000-4000-8000-000000000001', 'lot', '', 'expiration_date', '2030-01-01'
    ))
  ))
$$, '22023', 'PURCHASE_RECEIPT_LOT_REQUIRED', 'el lote usa el snapshot aunque el catalogo ya no lo exija');
select throws_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'a5000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
    'operation_key', 'a5600000-0000-4000-8000-000000000002',
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '001') and item.product_id = 'a5500000-0000-4000-8000-000000000001'),
      'quantity', 10, 'fulfillment_mode', 'physical', 'location_id', 'a5400000-0000-4000-8000-000000000001', 'lot', 'A4-L1', 'expiration_date', null
    ))
  ))
$$, '22023', 'PURCHASE_ORDER_EXPIRATION_REQUIRED', 'el vencimiento usa el snapshot aunque el catalogo ya no lo exija');

select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'a5000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
    'operation_key', 'a5600000-0000-4000-8000-000000000003',
    'items', jsonb_build_array(
      jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '001') and item.product_id = 'a5500000-0000-4000-8000-000000000001'), 'quantity', 10, 'fulfillment_mode', 'physical', 'location_id', 'a5400000-0000-4000-8000-000000000001', 'lot', 'A4-L1', 'expiration_date', '2030-01-01'),
      jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '001') and item.product_id = 'a5500000-0000-4000-8000-000000000002'), 'quantity', 1, 'fulfillment_mode', 'administrative')
    )
  ))
$$, 'recibe la orden mixta aunque ambos productos esten inactivos');
select is((select status from public.purchase_orders where document_number = '001'), 'received', 'completa la orden mixta');
select is((select is_active from public.products where id = 'a5500000-0000-4000-8000-000000000001'), false, 'el good permanece inactivo');
select is((select count(*) from public.inventory_movements where source_type = 'purchase-receipt' and product_id = 'a5500000-0000-4000-8000-000000000001'), 1::bigint, 'el good inactivo genera movimiento');
select is((select count(*) from public.inventory_movements where source_type = 'purchase-receipt' and product_id = 'a5500000-0000-4000-8000-000000000002'), 0::bigint, 'el service inactivo no genera movimiento');
select is((select count(*) from public.inventory_kardex where product_id = 'a5500000-0000-4000-8000-000000000002'), 0::bigint, 'el service inactivo no genera Kardex');
select is((select count(*) from public.purchase_receipt_items item join public.purchase_receipts receipt on receipt.id = item.receipt_id where receipt.operation_key = 'a5600000-0000-4000-8000-000000000003'), 2::bigint, 'registra ambas lineas de la orden mixta');
select is((select count(*) from public.purchase_receipt_items item join public.purchase_receipts receipt on receipt.id = item.receipt_id where receipt.operation_key = 'a5600000-0000-4000-8000-000000000003' and item.fulfillment_mode = 'physical'), 1::bigint, 'la linea good queda fisica');
select is((select count(*) from public.purchase_receipt_items item join public.purchase_receipts receipt on receipt.id = item.receipt_id where receipt.operation_key = 'a5600000-0000-4000-8000-000000000003' and item.fulfillment_mode = 'administrative'), 1::bigint, 'la linea service queda administrativa');
set local role postgres;
select is((select count(*) from public.audit_events where action = 'PURCHASE_RECEIPT_CONFIRMED' and entity_id = (select id::text from public.purchase_receipts where operation_key = 'a5600000-0000-4000-8000-000000000003')), 1::bigint, 'la recepcion inactiva conserva la auditoria normal');
set local role authenticated;
select is(public.receive_purchase_order_partial(jsonb_build_object(
  'organization_id', 'a5000000-0000-4000-8000-000000000001',
  'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
  'operation_key', 'a5600000-0000-4000-8000-000000000003',
  'items', jsonb_build_array(
    jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '001') and item.product_id = 'a5500000-0000-4000-8000-000000000001'), 'quantity', 10, 'fulfillment_mode', 'physical', 'location_id', 'a5400000-0000-4000-8000-000000000001', 'lot', 'A4-L1', 'expiration_date', '2030-01-01'),
    jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '001') and item.product_id = 'a5500000-0000-4000-8000-000000000002'), 'quantity', 1, 'fulfillment_mode', 'administrative')
  )
)), (select id from public.purchase_receipts where operation_key = 'a5600000-0000-4000-8000-000000000003'), 'retry exacto devuelve la misma recepcion tras quedar received');
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a5000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '001'),'operation_key','a5600000-0000-4000-8000-000000000003','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '001') and item.product_id = 'a5500000-0000-4000-8000-000000000001'),'quantity',9,'fulfillment_mode','physical','location_id','a5400000-0000-4000-8000-000000000001','lot','A4-L1','expiration_date','2030-01-01'),jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items item where item.purchase_order_id = (select id from public.purchase_orders where document_number = '001') and item.product_id = 'a5500000-0000-4000-8000-000000000002'),'quantity',1,'fulfillment_mode','administrative')))) $$, 'P0001', 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT', 'retry con payload diferente conserva el conflicto A3');

set local role postgres;
update public.products set is_active = false, updated_by = 'a5100000-0000-4000-8000-000000000001' where id = 'a5500000-0000-4000-8000-000000000004';
set local role authenticated;
select throws_ok($$ select public.save_purchase_order(jsonb_build_object('organization_id','a5000000-0000-4000-8000-000000000001','supplier_id','a5200000-0000-4000-8000-000000000001','document_type','factura','series','A4','document_number','002','issue_date',current_date,'warehouse_id','a5300000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('product_id','a5500000-0000-4000-8000-000000000004','quantity',1,'unit_cost',10,'lot','','expiration_date','')))) $$, 'P0001', 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE', 'un producto inactivo no entra a una orden nueva');

select lives_ok($$ select public.save_purchase_order(jsonb_build_object('organization_id','a5000000-0000-4000-8000-000000000001','supplier_id','a5200000-0000-4000-8000-000000000001','document_type','factura','series','A4','document_number','003','issue_date',current_date,'warehouse_id','a5300000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('product_id','a5500000-0000-4000-8000-000000000003','quantity',2,'unit_cost',10,'lot','','expiration_date','')))) $$, 'crea un draft con un producto inicialmente activo');
set local role postgres;
update public.products set is_active = false, updated_by = 'a5100000-0000-4000-8000-000000000001' where id = 'a5500000-0000-4000-8000-000000000003';
set local role authenticated;
select throws_ok($$ select public.issue_purchase_order('a5000000-0000-4000-8000-000000000001',(select id from public.purchase_orders where document_number = '003')) $$, 'P0001', 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE', 'un draft no se emite si el producto se inactivo');
set local role postgres;
update public.products set is_active = true, updated_by = 'a5100000-0000-4000-8000-000000000001' where id = 'a5500000-0000-4000-8000-000000000003';
set local role authenticated;
select public.issue_purchase_order('a5000000-0000-4000-8000-000000000001',(select id from public.purchase_orders where document_number = '003'));
set local role postgres;
update public.products set is_active = false, updated_by = 'a5100000-0000-4000-8000-000000000001' where id = 'a5500000-0000-4000-8000-000000000003';
set local role authenticated;
select lives_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a5000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '003'),'operation_key','a5600000-0000-4000-8000-000000000004','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '003')),'quantity',1,'fulfillment_mode','physical','location_id','a5400000-0000-4000-8000-000000000001')))) $$, 'recibe el saldo parcial con producto inactivo');
select is((select status from public.purchase_orders where document_number = '003'), 'partially_received', 'la orden queda parcialmente recibida');
select lives_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a5000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '003'),'operation_key','a5600000-0000-4000-8000-000000000005','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '003')),'quantity',1,'fulfillment_mode','physical','location_id','a5400000-0000-4000-8000-000000000001')))) $$, 'recibe el saldo restante con producto inactivo');
select is((select status from public.purchase_orders where document_number = '003'), 'received', 'la orden parcial termina recibida');

set local role postgres;
update public.products set is_active = true, updated_by = 'a5100000-0000-4000-8000-000000000001' where id = 'a5500000-0000-4000-8000-000000000003';
set local role authenticated;
select public.save_purchase_order(jsonb_build_object('organization_id','a5000000-0000-4000-8000-000000000001','supplier_id','a5200000-0000-4000-8000-000000000001','document_type','factura','series','A4','document_number','004','issue_date',current_date,'warehouse_id','a5300000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('product_id','a5500000-0000-4000-8000-000000000003','quantity',1,'unit_cost',10,'lot','','expiration_date',''))));
select public.issue_purchase_order('a5000000-0000-4000-8000-000000000001',(select id from public.purchase_orders where document_number = '004'));
set local role postgres;
update public.products set is_active = false, updated_by = 'a5100000-0000-4000-8000-000000000001' where id = 'a5500000-0000-4000-8000-000000000003';
alter table public.purchase_order_items disable trigger purchase_order_items_snapshot_expiration_control;
update public.purchase_order_items
set expiration_control = null
where purchase_order_id = (select id from public.purchase_orders where document_number = '004');
alter table public.purchase_order_items enable trigger purchase_order_items_snapshot_expiration_control;
set local role authenticated;
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a5000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '004'),'operation_key','a5600000-0000-4000-8000-000000000006','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '004')),'quantity',1,'fulfillment_mode','physical','location_id','a5400000-0000-4000-8000-000000000001')))) $$, 'P0001', 'PURCHASE_RECEIPT_EXPIRATION_CONTROL_UNKNOWN', 'historico abierto sin snapshot bloquea la recepcion con error estable');

select * from finish();
rollback;
