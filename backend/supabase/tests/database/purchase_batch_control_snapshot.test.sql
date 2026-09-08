begin;

select no_plan();

select has_trigger(
  'public', 'purchase_order_items', 'purchase_order_items_snapshot_product_type',
  'batch_control reutiliza el guard de snapshots de la linea'
);

insert into public.organizations (id, name, slug) values
  ('b1000000-0000-4000-8000-000000000001', 'B1 Compras', 'b1-compras'),
  ('b1000000-0000-4000-8000-000000000002', 'B1 Otra', 'b1-otra');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('b1100000-0000-4000-8000-000000000001', 'b1@test.local', '{"full_name":"B1"}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values ('b1000000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001');

insert into public.user_roles (organization_id, user_id, role_code) values
  ('b1000000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('b1000000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001', 'ALMACEN');

insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name,
  created_by, updated_by
) values
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001', 'ruc', '20777777771', 'Proveedor B1',
    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'
  ),
  (
    'b1200000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002', 'ruc', '20777777772', 'Proveedor B1 Otra',
    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'
  );

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
) values
  (
    'b1300000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001', 'B1-ALM', 'Almacen B1',
    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'
  ),
  (
    'b1300000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002', 'B1-OTRO', 'Almacen B1 Otra',
    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'
  );

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'b1400000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001', 'b1300000-0000-4000-8000-000000000001',
  'GENERAL', 'General B1',
  'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control, created_by, updated_by
) values
  (
    'b1500000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001', 'B1-TRUE', 'Bien con lote B1', 'UND', 'good',
    'gravado', true, false,
    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'
  ),
  (
    'b1500000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001', 'B1-FALSE', 'Bien sin lote B1', 'UND', 'good',
    'gravado', false, false,
    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'
  ),
  (
    'b1500000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000001', 'B1-SERVICE', 'Servicio B1', 'UND', 'service',
    'inafecto', false, false,
    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'
  ),
  (
    'b1500000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000002', 'B1-OTHER', 'Bien otra organizacion', 'UND', 'good',
    'gravado', false, false,
    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1100000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'organization_id', 'b1000000-0000-4000-8000-000000000001',
    'supplier_id', 'b1200000-0000-4000-8000-000000000001',
    'document_type', 'factura', 'series', 'B1', 'document_number', '001',
    'issue_date', current_date, 'warehouse_id', 'b1300000-0000-4000-8000-000000000001',
    'warehouse', 'Almacen B1',
    'items', jsonb_build_array(
      jsonb_build_object('product_id', 'b1500000-0000-4000-8000-000000000001', 'quantity', 2, 'unit_cost', 10, 'lot', 'B1-L1', 'expiration_date', ''),
      jsonb_build_object('product_id', 'b1500000-0000-4000-8000-000000000002', 'quantity', 2, 'unit_cost', 20, 'lot', '', 'expiration_date', '')
    )
  ))
$$, 'una orden draft captura controles de lote true y false');

select is(
  (select item.batch_control from public.purchase_order_items item
   join public.purchase_orders purchase on purchase.id = item.purchase_order_id
   where purchase.document_number = '001' and item.product_id = 'b1500000-0000-4000-8000-000000000001'),
  true, 'una nueva linea captura batch_control=true'
);
select is(
  (select item.batch_control from public.purchase_order_items item
   join public.purchase_orders purchase on purchase.id = item.purchase_order_id
   where purchase.document_number = '001' and item.product_id = 'b1500000-0000-4000-8000-000000000002'),
  false, 'una nueva linea captura batch_control=false'
);

reset role;
update public.products set batch_control = false
where id = 'b1500000-0000-4000-8000-000000000001';
update public.products set batch_control = true
where id = 'b1500000-0000-4000-8000-000000000002';

select is(
  (select batch_control from public.purchase_order_items where product_id = 'b1500000-0000-4000-8000-000000000001'),
  true, 'true permanece congelado cuando cambia products.batch_control'
);
select is(
  (select batch_control from public.purchase_order_items where product_id = 'b1500000-0000-4000-8000-000000000002'),
  false, 'false permanece congelado cuando cambia products.batch_control'
);

select throws_ok($$
  update public.purchase_order_items set batch_control = false
  where product_id = 'b1500000-0000-4000-8000-000000000001'
$$, '55000', 'PURCHASE_ORDER_BATCH_CONTROL_IMMUTABLE', 'UPDATE privilegiado true a false es rechazado');

set local role service_role;
select throws_ok($$
  update public.purchase_order_items set batch_control = true
  where product_id = 'b1500000-0000-4000-8000-000000000002'
$$, '55000', 'PURCHASE_ORDER_BATCH_CONTROL_IMMUTABLE', 'service_role no evita el trigger en false a true');
reset role;

select throws_ok($$
  update public.purchase_order_items set batch_control = null
  where product_id = 'b1500000-0000-4000-8000-000000000001'
$$, '55000', 'PURCHASE_ORDER_BATCH_CONTROL_IMMUTABLE', 'un valor conocido no puede cambiar a NULL');

create function pg_temp.b1_security_definer_batch_update(requested_item_id uuid, requested_value boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.purchase_order_items
  set batch_control = requested_value
  where id = requested_item_id
$$;

set local role authenticated;
select throws_ok($$
  select pg_temp.b1_security_definer_batch_update(
    (select id from public.purchase_order_items where product_id = 'b1500000-0000-4000-8000-000000000002'),
    true
  )
$$, '55000', 'PURCHASE_ORDER_BATCH_CONTROL_IMMUTABLE', 'una funcion SECURITY DEFINER tampoco evita el trigger');
reset role;

select lives_ok($$
  update public.purchase_order_items set quantity = 3
  where product_id = 'b1500000-0000-4000-8000-000000000001'
$$, 'UPDATE de otro campo legitimo sigue permitido');

alter table public.purchase_order_items alter column batch_control drop not null;
alter table public.purchase_order_items disable trigger purchase_order_items_snapshot_product_type;
update public.purchase_order_items set batch_control = null
where product_id = 'b1500000-0000-4000-8000-000000000002';
alter table public.purchase_order_items enable trigger purchase_order_items_snapshot_product_type;

select throws_ok($$
  update public.purchase_order_items set batch_control = false
  where product_id = 'b1500000-0000-4000-8000-000000000002'
$$, '55000', 'PURCHASE_ORDER_BATCH_CONTROL_IMMUTABLE', 'una linea historica NULL no puede adquirir un valor');
select is(
  (select batch_control from public.purchase_order_items where product_id = 'b1500000-0000-4000-8000-000000000002'),
  null::boolean, 'la linea historica permanece NULL sin backfill'
);

create temporary table b1_original_items as
select id from public.purchase_order_items
where purchase_order_id = (select id from public.purchase_orders where document_number = '001');
grant select on b1_original_items to authenticated;

set local role authenticated;
select lives_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'id', (select id from public.purchase_orders where document_number = '001'),
    'organization_id', 'b1000000-0000-4000-8000-000000000001',
    'supplier_id', 'b1200000-0000-4000-8000-000000000001',
    'document_type', 'factura', 'series', 'B1', 'document_number', '001',
    'issue_date', current_date, 'warehouse_id', 'b1300000-0000-4000-8000-000000000001',
    'warehouse', 'Almacen B1',
    'items', jsonb_build_array(
      jsonb_build_object('product_id', 'b1500000-0000-4000-8000-000000000001', 'quantity', 4, 'unit_cost', 11, 'lot', '', 'expiration_date', ''),
      jsonb_build_object('product_id', 'b1500000-0000-4000-8000-000000000002', 'quantity', 5, 'unit_cost', 21, 'lot', 'B1-L2', 'expiration_date', '')
    )
  ))
$$, 'la edicion normal del draft por delete e insert sigue funcionando');
select is(
  (select count(*) from public.purchase_order_items where id in (select id from b1_original_items)),
  0::bigint, 'la edicion draft recrea las lineas en vez de mutar snapshots'
);
select lives_ok($$
  select public.issue_purchase_order(
    'b1000000-0000-4000-8000-000000000001',
    (select id from public.purchase_orders where document_number = '001')
  )
$$, 'la emision de la orden editada sigue funcionando');

reset role;
update public.products set batch_control = true, is_active = true
where id = 'b1500000-0000-4000-8000-000000000001';
set local role authenticated;
select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'b1000000-0000-4000-8000-000000000001',
  'supplier_id', 'b1200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'B1', 'document_number', '002',
  'issue_date', current_date, 'warehouse_id', 'b1300000-0000-4000-8000-000000000001',
  'warehouse', 'Almacen B1',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'b1500000-0000-4000-8000-000000000001',
    'quantity', 1, 'unit_cost', 10, 'lot', 'B1-A4', 'expiration_date', ''
  ))
));
select public.issue_purchase_order(
  'b1000000-0000-4000-8000-000000000001',
  (select id from public.purchase_orders where document_number = '002')
);
reset role;
update public.products set batch_control = false
where id = 'b1500000-0000-4000-8000-000000000001';
set local role authenticated;
select is(
  (select item.batch_control from public.purchase_order_items item
   join public.purchase_orders purchase on purchase.id = item.purchase_order_id
   where purchase.document_number = '002'),
  true, 'A4 conserva true aunque el producto cambie a false'
);
select throws_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'b1000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '002'),
    'operation_key', 'b1600000-0000-4000-8000-000000000001',
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', (select item.id from public.purchase_order_items item
        join public.purchase_orders purchase on purchase.id = item.purchase_order_id
        where purchase.document_number = '002'),
      'quantity', 1, 'fulfillment_mode', 'physical',
      'location_id', 'b1400000-0000-4000-8000-000000000001'
    ))
  ))
$$, '22023', 'PURCHASE_RECEIPT_LOT_REQUIRED', 'A4 exige lote segun el snapshot true original');
select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'b1000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '002'),
    'operation_key', 'b1600000-0000-4000-8000-000000000002',
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', (select item.id from public.purchase_order_items item
        join public.purchase_orders purchase on purchase.id = item.purchase_order_id
        where purchase.document_number = '002'),
      'quantity', 1, 'fulfillment_mode', 'physical',
      'location_id', 'b1400000-0000-4000-8000-000000000001', 'lot', 'B1-RECEIPT'
    ))
  ))
$$, 'A4 recibe con lote segun el snapshot original');

reset role;
update public.products set batch_control = false, is_active = true
where id = 'b1500000-0000-4000-8000-000000000002';
set local role authenticated;
select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'b1000000-0000-4000-8000-000000000001',
  'supplier_id', 'b1200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'B1', 'document_number', '003',
  'issue_date', current_date, 'warehouse_id', 'b1300000-0000-4000-8000-000000000001',
  'warehouse', 'Almacen B1',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'b1500000-0000-4000-8000-000000000002',
    'quantity', 1, 'unit_cost', 20, 'lot', '', 'expiration_date', ''
  ))
));
select public.issue_purchase_order(
  'b1000000-0000-4000-8000-000000000001',
  (select id from public.purchase_orders where document_number = '003')
);
reset role;
update public.products set batch_control = true, is_active = false
where id = 'b1500000-0000-4000-8000-000000000002';
set local role authenticated;
select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'b1000000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '003'),
    'operation_key', 'b1600000-0000-4000-8000-000000000003',
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', (select item.id from public.purchase_order_items item
        join public.purchase_orders purchase on purchase.id = item.purchase_order_id
        where purchase.document_number = '003'),
      'quantity', 1, 'fulfillment_mode', 'physical',
      'location_id', 'b1400000-0000-4000-8000-000000000001'
    ))
  ))
$$, 'A4 recibe un producto inactivo sin lote segun el snapshot false original');

select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'b1000000-0000-4000-8000-000000000001',
  'supplier_id', 'b1200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'B1', 'document_number', '004',
  'issue_date', current_date, 'warehouse_id', 'b1300000-0000-4000-8000-000000000001',
  'warehouse', 'Almacen B1',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'b1500000-0000-4000-8000-000000000003',
    'quantity', 1, 'unit_cost', 30, 'lot', '', 'expiration_date', ''
  ))
));
select public.issue_purchase_order(
  'b1000000-0000-4000-8000-000000000001',
  (select id from public.purchase_orders where document_number = '004')
);
select lives_ok($$
  select public.receive_purchase_order(
    'b1000000-0000-4000-8000-000000000001',
    (select id from public.purchase_orders where document_number = '004')
  )
$$, 'A2 mantiene la recepcion administrativa de servicios');
select is(
  (select count(*) from public.inventory_movements movement
   where movement.organization_id = 'b1000000-0000-4000-8000-000000000001'
     and movement.product_id = 'b1500000-0000-4000-8000-000000000003'),
  0::bigint, 'A2 no crea inventario para servicios'
);

select throws_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'organization_id', 'b1000000-0000-4000-8000-000000000002',
    'supplier_id', 'b1200000-0000-4000-8000-000000000002',
    'document_type', 'factura', 'series', 'B1', 'document_number', '005',
    'issue_date', current_date, 'warehouse_id', 'b1300000-0000-4000-8000-000000000002',
    'warehouse', 'Almacen B1 Otra',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', 'b1500000-0000-4000-8000-000000000004',
      'quantity', 1, 'unit_cost', 40, 'lot', '', 'expiration_date', ''
    ))
  ))
$$, '42501', 'PURCHASE_ORDER_FORBIDDEN', 'Compras conserva aislamiento entre organizaciones');

select * from finish();
rollback;
