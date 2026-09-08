begin;

select plan(42);

select has_column('public', 'purchase_receipts', 'operation_payload_hash', 'receipts persist the operation hash');
select ok((select count(*) from pg_constraint where conrelid = 'public.purchase_receipts'::regclass and conname = 'purchase_receipts_operation_payload_hash_format') = 1, 'hash format constraint exists');
select ok((select count(*) from pg_constraint where conrelid = 'public.purchase_receipts'::regclass and conname = 'purchase_receipts_organization_id_operation_key_key') = 1, 'operation key remains unique by organization');

insert into public.organizations (id, name, slug)
values ('a4000000-0000-4000-8000-000000000001', 'A3 Compras', 'a3-compras');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('a4100000-0000-4000-8000-000000000001', 'a3@test.local', '{"full_name":"A3"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('a4000000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values
  ('a4000000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('a4000000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'ALMACEN');
insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name,
  created_by, updated_by
) values (
  'a4200000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001', 'ruc', '20777777771', 'Proveedor A3',
  'a4100000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001'
);
insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
) values (
  'a4300000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001', 'A3-ALM', 'Almacen A3',
  'a4100000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values
  ('a4400000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a4300000-0000-4000-8000-000000000001', 'GENERAL', 'General A3', 'a4100000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001'),
  ('a4400000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'a4300000-0000-4000-8000-000000000001', 'ALT', 'Alterna A3', 'a4100000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001');
insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control, created_by, updated_by
) values
  ('a4500000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'A3-GOOD', 'Bien A3', 'UND', 'good', 'gravado', false, false, 'a4100000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001'),
  ('a4500000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'A3-SERVICE', 'Servicio A3', 'UND', 'service', 'inafecto', false, false, 'a4100000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4100000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'organization_id', 'a4000000-0000-4000-8000-000000000001',
    'supplier_id', 'a4200000-0000-4000-8000-000000000001',
    'document_type', 'factura', 'series', 'A3', 'document_number', '001',
    'issue_date', current_date, 'warehouse_id', 'a4300000-0000-4000-8000-000000000001',
    'warehouse', 'Almacen A3', 'items', jsonb_build_array(
      jsonb_build_object('product_id', 'a4500000-0000-4000-8000-000000000001', 'quantity', 2, 'unit_cost', 10, 'lot', '', 'expiration_date', ''),
      jsonb_build_object('product_id', 'a4500000-0000-4000-8000-000000000002', 'quantity', 1, 'unit_cost', 100, 'lot', '', 'expiration_date', '')
    )
  ))
$$, 'creates a mixed purchase order');
select lives_ok($$ select public.issue_purchase_order('a4000000-0000-4000-8000-000000000001', (select id from public.purchase_orders where document_number = '001')) $$, 'issues the mixed order');

select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'a4000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
    'operation_key', 'a4600000-0000-4000-8000-000000000001', 'notes', '  Entrega A3  ',
    'items', jsonb_build_array(
      jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'), 'quantity', '1.000', 'fulfillment_mode', 'physical', 'location_id', 'a4400000-0000-4000-8000-000000000001', 'lot', ' L1 ', 'expiration_date', '2027-01-01'),
      jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'service'), 'quantity', '1', 'fulfillment_mode', 'administrative')
    )
  ))
$$, 'creates the first receipt');
select ok((select operation_payload_hash ~ '^[0-9a-f]{64}$' from public.purchase_receipts where operation_key = 'a4600000-0000-4000-8000-000000000001'), 'stores a lowercase SHA-256 hash');
select is((select count(*) from public.purchase_receipts where purchase_order_id = (select id from public.purchase_orders where document_number = '001')), 1::bigint, 'creates one receipt header');
select is((select count(*) from public.purchase_receipt_items where receipt_id = (select id from public.purchase_receipts where operation_key = 'a4600000-0000-4000-8000-000000000001')), 2::bigint, 'creates both receipt lines');
select is((select count(*) from public.inventory_movements where source_type = 'purchase-receipt' and organization_id = 'a4000000-0000-4000-8000-000000000001'), 1::bigint, 'creates movement only for the good');

select is(
  public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'a4000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
    'operation_key', 'a4600000-0000-4000-8000-000000000001', 'notes', 'Entrega A3',
    'items', jsonb_build_array(
      jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'service'), 'quantity', '1.000', 'fulfillment_mode', 'ADMINISTRATIVE', 'location_id', '', 'lot', '', 'expiration_date', ''),
      jsonb_build_object('purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'), 'quantity', '1', 'fulfillment_mode', 'PHYSICAL', 'location_id', 'a4400000-0000-4000-8000-000000000001', 'lot', 'L1', 'expiration_date', '2027-01-01')
    )
  )),
  (select id from public.purchase_receipts where operation_key = 'a4600000-0000-4000-8000-000000000001'),
  'reordered and numerically equivalent lines return the same receipt'
);
select is((select count(*) from public.purchase_receipts where purchase_order_id = (select id from public.purchase_orders where document_number = '001')), 1::bigint, 'retry does not duplicate the header');
select is((select count(*) from public.inventory_movements where source_type = 'purchase-receipt' and organization_id = 'a4000000-0000-4000-8000-000000000001'), 1::bigint, 'retry does not duplicate movement');

select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'a4000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
    'operation_key', 'a4600000-0000-4000-8000-000000000002',
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'),
      'quantity', '1.000', 'fulfillment_mode', 'physical', 'location_id', 'a4400000-0000-4000-8000-000000000001', 'lot', 'L1', 'expiration_date', '2027-01-01'
    ))
  ))
$$, 'receives the remaining good');
select is((select status from public.purchase_orders where document_number = '001'), 'received', 'the order is closed as received');
select is(
  public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'a4000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
    'operation_key', 'a4600000-0000-4000-8000-000000000002',
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'),
      'quantity', 1, 'fulfillment_mode', 'physical', 'location_id', 'a4400000-0000-4000-8000-000000000001', 'lot', 'L1', 'expiration_date', '2027-01-01'
    ))
  )),
  (select id from public.purchase_receipts where operation_key = 'a4600000-0000-4000-8000-000000000002'),
  'retry after received returns the original receipt'
);

select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '001'),'operation_key','a4600000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'),'quantity',2,'fulfillment_mode','physical','location_id','a4400000-0000-4000-8000-000000000001','lot','L1','expiration_date','2027-01-01'),jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'service'),'quantity',1,'fulfillment_mode','administrative')))) $$, 'P0001', 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT', 'different quantity conflicts');
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '001'),'operation_key','a4600000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'),'quantity',1,'fulfillment_mode','physical','location_id','a4400000-0000-4000-8000-000000000002','lot','L1','expiration_date','2027-01-01'),jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'service'),'quantity',1,'fulfillment_mode','administrative')))) $$, 'P0001', 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT', 'different location conflicts');
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '001'),'operation_key','a4600000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'),'quantity',1,'fulfillment_mode','physical','location_id','a4400000-0000-4000-8000-000000000001','lot','L2','expiration_date','2027-01-01'),jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'service'),'quantity',1,'fulfillment_mode','administrative')))) $$, 'P0001', 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT', 'different lot conflicts');
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '001'),'operation_key','a4600000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'),'quantity',1,'fulfillment_mode','physical','location_id','a4400000-0000-4000-8000-000000000001','lot','L1','expiration_date','2028-01-01'),jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'service'),'quantity',1,'fulfillment_mode','administrative')))) $$, 'P0001', 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT', 'different expiration conflicts');
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '001'),'operation_key','a4600000-0000-4000-8000-000000000001','notes','different','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'),'quantity',1,'fulfillment_mode','physical','location_id','a4400000-0000-4000-8000-000000000001','lot','L1','expiration_date','2027-01-01'),jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'service'),'quantity',1,'fulfillment_mode','administrative')))) $$, 'P0001', 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT', 'different notes conflict');
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '001'),'operation_key','a4600000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'),'quantity',1,'fulfillment_mode','physical','location_id','a4400000-0000-4000-8000-000000000001','lot','L1','expiration_date','2027-01-01')))) $$, 'P0001', 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT', 'removed line conflicts');
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '001'),'operation_key','a4600000-0000-4000-8000-000000000002','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'good'),'quantity',1,'fulfillment_mode','physical','location_id','a4400000-0000-4000-8000-000000000001','lot','L1','expiration_date','2027-01-01'),jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and product_type = 'service'),'quantity',1,'fulfillment_mode','administrative')))) $$, 'P0001', 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT', 'added line conflicts');
select is((select count(*) from public.purchase_receipts where organization_id = 'a4000000-0000-4000-8000-000000000001'), 2::bigint, 'conflicts create no extra receipts');

select lives_ok($$ select public.save_purchase_order(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','supplier_id','a4200000-0000-4000-8000-000000000001','document_type','factura','series','A3','document_number','002','issue_date',current_date,'warehouse_id','a4300000-0000-4000-8000-000000000001','warehouse','Almacen A3','items',jsonb_build_array(jsonb_build_object('product_id','a4500000-0000-4000-8000-000000000002','quantity',2,'unit_cost',100,'lot','','expiration_date','')))) $$, 'creates a service-only order');
select lives_ok($$ select public.issue_purchase_order('a4000000-0000-4000-8000-000000000001',(select id from public.purchase_orders where document_number = '002')) $$, 'issues the service-only order');
select lives_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '002'),'operation_key','a4600000-0000-4000-8000-000000000003','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '002')),'quantity',1)))) $$, 'derives administrative mode for service');
select is(public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '002'),'operation_key','a4600000-0000-4000-8000-000000000003','notes','   ','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '002')),'quantity','1.000','fulfillment_mode','ADMINISTRATIVE','location_id',null,'lot',null,'expiration_date',null)))),(select id from public.purchase_receipts where operation_key = 'a4600000-0000-4000-8000-000000000003'),'service retry ignores empty physical fields');
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '002'),'operation_key','a4600000-0000-4000-8000-000000000003','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '002')),'quantity',2,'fulfillment_mode','administrative')))) $$, 'P0001', 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT', 'service quantity conflict');

select lives_ok($$ select public.save_purchase_order(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','supplier_id','a4200000-0000-4000-8000-000000000001','document_type','factura','series','A3','document_number','003','issue_date',current_date,'warehouse_id','a4300000-0000-4000-8000-000000000001','warehouse','Almacen A3','items',jsonb_build_array(jsonb_build_object('product_id','a4500000-0000-4000-8000-000000000001','quantity',1,'unit_cost',10,'lot','','expiration_date','')))) $$, 'creates a legacy-wrapper order');
select lives_ok($$ select public.issue_purchase_order('a4000000-0000-4000-8000-000000000001',(select id from public.purchase_orders where document_number = '003')) $$, 'issues the wrapper order');
select lives_ok($$ select public.receive_purchase_order('a4000000-0000-4000-8000-000000000001',(select id from public.purchase_orders where document_number = '003')) $$, 'legacy wrapper delegates to strict path');
select ok((select operation_payload_hash is not null from public.purchase_receipts where purchase_order_id = (select id from public.purchase_orders where document_number = '003')), 'wrapper-created receipt stores hash');
select throws_ok($$ select public.receive_purchase_order('a4000000-0000-4000-8000-000000000001',(select id from public.purchase_orders where document_number = '003')) $$, 'P0001', 'PURCHASE_ORDER_NOT_RECEIVABLE', 'legacy wrapper keeps generated-key behavior');

select lives_ok($$ select public.save_purchase_order(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','supplier_id','a4200000-0000-4000-8000-000000000001','document_type','factura','series','A3','document_number','004','issue_date',current_date,'warehouse_id','a4300000-0000-4000-8000-000000000001','warehouse','Almacen A3','items',jsonb_build_array(jsonb_build_object('product_id','a4500000-0000-4000-8000-000000000001','quantity',1,'unit_cost',10,'lot','','expiration_date','')))) $$, 'creates a historical-compatibility order');
select lives_ok($$ select public.issue_purchase_order('a4000000-0000-4000-8000-000000000001',(select id from public.purchase_orders where document_number = '004')) $$, 'issues the historical-compatibility order');
set local role postgres;
insert into public.purchase_receipts (organization_id, purchase_order_id, warehouse_id, operation_key, notes)
values ('a4000000-0000-4000-8000-000000000001',(select id from public.purchase_orders where document_number = '004'),'a4300000-0000-4000-8000-000000000001','a4600000-0000-4000-8000-000000000099','historical');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4100000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '004'),'operation_key','a4600000-0000-4000-8000-000000000099','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '004')),'quantity',1,'fulfillment_mode','physical','location_id','a4400000-0000-4000-8000-000000000001')))) $$, 'P0001', 'PURCHASE_RECEIPT_IDEMPOTENCY_LEGACY_UNVERIFIABLE', 'historical receipt cannot be replayed without a hash');

select throws_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000001','purchase_order_id',(select id from public.purchase_orders where document_number = '003'),'operation_key','a4600000-0000-4000-8000-000000000001','items','[]'::jsonb)) $$, '23505', 'PURCHASE_RECEIPT_KEY_CONFLICT', 'same key on another order conflicts');
select is((select count(*) from public.purchase_receipts where organization_id = 'a4000000-0000-4000-8000-000000000001'), 5::bigint, 'conflicts do not add headers');

set local role postgres;
insert into public.organizations (id, name, slug)
values ('a4000000-0000-4000-8000-000000000002', 'A3 Otra Org', 'a3-otra-org');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('a4100000-0000-4000-8000-000000000002', 'a3-otra@test.local', '{"full_name":"A3 Otra"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('a4000000-0000-4000-8000-000000000002', 'a4100000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code)
values ('a4000000-0000-4000-8000-000000000002', 'a4100000-0000-4000-8000-000000000002', 'COMPRAS');
insert into public.suppliers (id, organization_id, document_type, document_number, business_name)
values ('a4200000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002', 'ruc', '20777777772', 'Proveedor A3 Otra');
insert into public.warehouses (id, organization_id, code, name)
values ('a4300000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002', 'A3-O', 'Almacen A3 Otra');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name)
values ('a4400000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000002', 'a4300000-0000-4000-8000-000000000002', 'GENERAL', 'General Otra');
insert into public.products (id, organization_id, code, description, unit_of_measure, product_type, tax_affectation, batch_control, expiration_control, created_by, updated_by)
values ('a4500000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000002', 'A3-OTHER', 'Bien Otra', 'UND', 'good', 'gravado', false, false, 'a4100000-0000-4000-8000-000000000002', 'a4100000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4100000-0000-4000-8000-000000000002', true);
select lives_ok($$ select public.save_purchase_order(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000002','supplier_id','a4200000-0000-4000-8000-000000000002','document_type','factura','series','A3','document_number','001','issue_date',current_date,'warehouse_id','a4300000-0000-4000-8000-000000000002','warehouse','Almacen A3 Otra','items',jsonb_build_array(jsonb_build_object('product_id','a4500000-0000-4000-8000-000000000003','quantity',1,'unit_cost',10,'lot','','expiration_date','')))) $$, 'same key can be used by another organization');
select lives_ok($$ select public.issue_purchase_order('a4000000-0000-4000-8000-000000000002',(select id from public.purchase_orders where organization_id = 'a4000000-0000-4000-8000-000000000002')) $$, 'issues the other organization order');
select lives_ok($$ select public.receive_purchase_order_partial(jsonb_build_object('organization_id','a4000000-0000-4000-8000-000000000002','purchase_order_id',(select id from public.purchase_orders where organization_id = 'a4000000-0000-4000-8000-000000000002'),'operation_key','a4600000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',(select id from public.purchase_order_items where organization_id = 'a4000000-0000-4000-8000-000000000002'),'quantity',1,'fulfillment_mode','physical','location_id','a4400000-0000-4000-8000-000000000003')))) $$, 'same key is isolated by organization');

select * from finish();
rollback;
