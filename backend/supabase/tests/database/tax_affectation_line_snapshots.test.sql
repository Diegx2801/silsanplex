begin;

select no_plan();

select has_column('public', 'purchase_order_items', 'tax_affectation', 'las compras guardan afectación tributaria por línea');
select has_column('public', 'purchase_receipt_items', 'tax_affectation', 'las recepciones guardan afectación tributaria por línea');
select has_column('public', 'order_items', 'tax_affectation', 'los pedidos guardan afectación tributaria por línea');
select has_column('public', 'sale_items', 'tax_affectation', 'las ventas guardan afectación tributaria por línea');
select is((select attnotnull from pg_attribute where attrelid = 'public.order_items'::regclass and attname = 'tax_affectation'), false, 'el snapshot no inventa datos para históricos');
select is((select attnotnull from pg_attribute where attrelid = 'public.purchase_order_items'::regclass and attname = 'tax_affectation'), false, 'el snapshot de compras no inventa datos para históricos');

insert into public.organizations (id, name, slug) values
  ('a1b10000-0000-4000-8000-000000000001', 'P1B uno', 'a1b-uno'),
  ('a1b10000-0000-4000-8000-000000000002', 'P1B dos', 'a1b-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('a1b20000-0000-4000-8000-000000000001', 'a1b.uno@test.local', '{}', now(), now()),
  ('a1b20000-0000-4000-8000-000000000002', 'a1b.dos@test.local', '{}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('a1b10000-0000-4000-8000-000000000001', 'a1b20000-0000-4000-8000-000000000001'),
  ('a1b10000-0000-4000-8000-000000000002', 'a1b20000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('a1b10000-0000-4000-8000-000000000001', 'a1b20000-0000-4000-8000-000000000001', 'ADMIN'),
  ('a1b10000-0000-4000-8000-000000000002', 'a1b20000-0000-4000-8000-000000000002', 'ADMIN');

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name,
  created_by, updated_by
) values (
  'a1b30000-0000-4000-8000-000000000001',
  'a1b10000-0000-4000-8000-000000000001', 'RUC', '20990000001',
  'Cliente P1B', 'a1b20000-0000-4000-8000-000000000001',
  'a1b20000-0000-4000-8000-000000000001'
);

insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name,
  created_by, updated_by
) values (
  'a1b40000-0000-4000-8000-000000000001',
  'a1b10000-0000-4000-8000-000000000001', 'ruc', '20990000002',
  'Proveedor P1B', 'a1b20000-0000-4000-8000-000000000001',
  'a1b20000-0000-4000-8000-000000000001'
);

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
) values (
  'a1b50000-0000-4000-8000-000000000001',
  'a1b10000-0000-4000-8000-000000000001', 'P1B', 'Almacén P1B',
  'a1b20000-0000-4000-8000-000000000001', 'a1b20000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'a1b60000-0000-4000-8000-000000000001',
  'a1b10000-0000-4000-8000-000000000001',
  'a1b50000-0000-4000-8000-000000000001', 'GENERAL', 'General P1B',
  'a1b20000-0000-4000-8000-000000000001', 'a1b20000-0000-4000-8000-000000000001'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control, created_by, updated_by
) values
  (
    'a1b70000-0000-4000-8000-000000000001',
    'a1b10000-0000-4000-8000-000000000001', 'P1B-GRAV', 'Producto gravado P1B',
    'UND', 'good', 'gravado', false, false,
    'a1b20000-0000-4000-8000-000000000001', 'a1b20000-0000-4000-8000-000000000001'
  ),
  (
    'a1b70000-0000-4000-8000-000000000002',
    'a1b10000-0000-4000-8000-000000000001', 'P1B-EXON', 'Producto exonerado P1B',
    'UND', 'good', 'exonerado', false, false,
    'a1b20000-0000-4000-8000-000000000001', 'a1b20000-0000-4000-8000-000000000001'
  ),
  (
    'a1b70000-0000-4000-8000-000000000003',
    'a1b10000-0000-4000-8000-000000000001', 'P1B-INAF', 'Servicio inafecto P1B',
    'UND', 'service', 'inafecto', false, false,
    'a1b20000-0000-4000-8000-000000000001', 'a1b20000-0000-4000-8000-000000000001'
  ),
  (
    'a1b70000-0000-4000-8000-000000000004',
    'a1b10000-0000-4000-8000-000000000002', 'P1B-OTRA', 'Producto otra organización',
    'UND', 'good', 'gravado', false, false,
    'a1b20000-0000-4000-8000-000000000002', 'a1b20000-0000-4000-8000-000000000002'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1b20000-0000-4000-8000-000000000001', true);

select public.record_inventory_movement(jsonb_build_object(
  'organization_id','a1b10000-0000-4000-8000-000000000001',
  'product_id','a1b70000-0000-4000-8000-000000000001',
  'warehouse_id','a1b50000-0000-4000-8000-000000000001',
  'location_id','a1b60000-0000-4000-8000-000000000001',
  'movement_type','entrada','quantity',20,'unit_cost',10,
  'stock_status','available','operation_date','2026-09-05','reason','Stock P1B gravado'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','a1b10000-0000-4000-8000-000000000001',
  'product_id','a1b70000-0000-4000-8000-000000000002',
  'warehouse_id','a1b50000-0000-4000-8000-000000000001',
  'location_id','a1b60000-0000-4000-8000-000000000001',
  'movement_type','entrada','quantity',20,'unit_cost',10,
  'stock_status','available','operation_date','2026-09-05','reason','Stock P1B exonerado'
));

select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a1b10000-0000-4000-8000-000000000001',
    'operation_key','a1b80000-0000-4000-8000-000000000001',
    'customer_id','a1b30000-0000-4000-8000-000000000001',
    'warehouse_id','a1b50000-0000-4000-8000-000000000001',
    'order_date','2026-09-05','prices_include_tax',true,
    'items',jsonb_build_array(
      jsonb_build_object('product_id','a1b70000-0000-4000-8000-000000000001','quantity',1,'unit_price',10,'tax_affectation','inafecto'),
      jsonb_build_object('product_id','a1b70000-0000-4000-8000-000000000002','quantity',1,'unit_price',10,'tax_affectation','gravado'),
      jsonb_build_object('product_id','a1b70000-0000-4000-8000-000000000003','quantity',1,'unit_price',10,'tax_affectation','gravado')
    )
  ))
$$, 'crea pedido con bienes y servicio sin confiar en afectación del payload');

select results_eq(
  $$select product_id, tax_affectation from public.order_items where organization_id = 'a1b10000-0000-4000-8000-000000000001' order by product_id$$,
  $$values
    ('a1b70000-0000-4000-8000-000000000001'::uuid, 'gravado'::text),
    ('a1b70000-0000-4000-8000-000000000002'::uuid, 'exonerado'::text),
    ('a1b70000-0000-4000-8000-000000000003'::uuid, 'inafecto'::text)$$,
  'gravado, exonerado e inafecto se capturan desde products');

select lives_ok($$
  select public.create_sale_from_order(
    'a1b10000-0000-4000-8000-000000000001',
    (select id from public.orders where operation_key = 'a1b80000-0000-4000-8000-000000000001'),
    jsonb_build_object(
      'operation_key','a1b80000-0000-4000-8000-000000000002',
      'document_type','boleta','series','B001','document_number','P1B-001',
      'warehouse','Almacén P1B'
    )
  )
$$, 'convierte pedido a venta');

select results_eq(
  $$select product_id, tax_affectation from public.sale_items where organization_id = 'a1b10000-0000-4000-8000-000000000001' order by product_id$$,
  $$values
    ('a1b70000-0000-4000-8000-000000000001'::uuid, 'gravado'::text),
    ('a1b70000-0000-4000-8000-000000000002'::uuid, 'exonerado'::text),
    ('a1b70000-0000-4000-8000-000000000003'::uuid, 'inafecto'::text)$$,
  'pedido y venta conservan el mismo snapshot tributario');

select lives_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'organization_id','a1b10000-0000-4000-8000-000000000001',
    'supplier_id','a1b40000-0000-4000-8000-000000000001',
    'document_type','factura','series','F001','document_number','P1B-001',
    'issue_date','2026-09-05','warehouse_id','a1b50000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(
      jsonb_build_object('product_id','a1b70000-0000-4000-8000-000000000001','quantity',2,'unit_cost',8,'tax_affectation','inafecto'),
      jsonb_build_object('product_id','a1b70000-0000-4000-8000-000000000002','quantity',2,'unit_cost',8,'tax_affectation','gravado')
    )
  ))
$$, 'crea compra ignorando afectación enviada por el cliente');

select results_eq(
  $$select product_id, tax_affectation from public.purchase_order_items order by product_id$$,
  $$values
    ('a1b70000-0000-4000-8000-000000000001'::uuid, 'gravado'::text),
    ('a1b70000-0000-4000-8000-000000000002'::uuid, 'exonerado'::text)$$,
  'la compra guarda el snapshot tomado del producto');

select public.issue_purchase_order(
  'a1b10000-0000-4000-8000-000000000001',
  (select id from public.purchase_orders where document_number = 'P1B-001')
);
select public.receive_purchase_order(
  'a1b10000-0000-4000-8000-000000000001',
  (select id from public.purchase_orders where document_number = 'P1B-001')
);

select results_eq(
  $$select item.product_id, receipt_item.tax_affectation
    from public.purchase_receipt_items receipt_item
    join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id
    order by item.product_id$$,
  $$values
    ('a1b70000-0000-4000-8000-000000000001'::uuid, 'gravado'::text),
    ('a1b70000-0000-4000-8000-000000000002'::uuid, 'exonerado'::text)$$,
  'la recepción hereda el snapshot de la línea de compra');

set local role postgres;
update public.products
set tax_affectation = case when code = 'P1B-GRAV' then 'inafecto' else 'gravado' end,
    updated_at = now()
where organization_id = 'a1b10000-0000-4000-8000-000000000001'
  and code in ('P1B-GRAV', 'P1B-EXON');

select results_eq(
  $$select product_id, tax_affectation from public.order_items where organization_id = 'a1b10000-0000-4000-8000-000000000001' order by product_id$$,
  $$values
    ('a1b70000-0000-4000-8000-000000000001'::uuid, 'gravado'::text),
    ('a1b70000-0000-4000-8000-000000000002'::uuid, 'exonerado'::text),
    ('a1b70000-0000-4000-8000-000000000003'::uuid, 'inafecto'::text)$$,
  'cambiar products no altera pedidos históricos');
select results_eq(
  $$select product_id, tax_affectation from public.sale_items where organization_id = 'a1b10000-0000-4000-8000-000000000001' order by product_id$$,
  $$values
    ('a1b70000-0000-4000-8000-000000000001'::uuid, 'gravado'::text),
    ('a1b70000-0000-4000-8000-000000000002'::uuid, 'exonerado'::text),
    ('a1b70000-0000-4000-8000-000000000003'::uuid, 'inafecto'::text)$$,
  'cambiar products no altera ventas históricas');
select results_eq(
  $$select item.product_id, receipt_item.tax_affectation
    from public.purchase_receipt_items receipt_item
    join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id
    order by item.product_id$$,
  $$values
    ('a1b70000-0000-4000-8000-000000000001'::uuid, 'gravado'::text),
    ('a1b70000-0000-4000-8000-000000000002'::uuid, 'exonerado'::text)$$,
  'cambiar products no altera recepciones históricas');
select throws_ok($$
  update public.order_items set tax_affectation = 'inafecto'
  where product_id = 'a1b70000-0000-4000-8000-000000000001'
$$, '55000', 'ORDER_TAX_AFFECTATION_IMMUTABLE', 'la línea no permite mutar su snapshot');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1b20000-0000-4000-8000-000000000001', true);
select throws_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a1b10000-0000-4000-8000-000000000002',
    'operation_key','a1b80000-0000-4000-8000-000000000003',
    'customer_id','a1b30000-0000-4000-8000-000000000001',
    'warehouse_id','a1b50000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(jsonb_build_object('product_id','a1b70000-0000-4000-8000-000000000004','quantity',1,'unit_price',1))
  ))
$$, '42501', 'ORDER_FORBIDDEN', 'una organización no puede crear líneas en otra organización');
select is((select count(*) from public.order_items where organization_id = 'a1b10000-0000-4000-8000-000000000002'), 0::bigint, 'el aislamiento multi-organización evita líneas ajenas');

select * from finish();

rollback;
