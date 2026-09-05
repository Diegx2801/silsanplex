begin;

select no_plan();

select has_column('public', 'orders', 'taxable_base', 'los pedidos persisten la base gravada');
select has_column('public', 'orders', 'exempt_amount', 'los pedidos persisten el importe exonerado');
select has_column('public', 'orders', 'unaffected_amount', 'los pedidos persisten el importe inafecto');
select has_column('public', 'orders', 'tax_calculation_status', 'los pedidos persisten el estado fiscal');
select has_column('public', 'sales', 'taxable_base', 'las ventas persisten la base gravada');
select has_column('public', 'sales', 'exempt_amount', 'las ventas persisten el importe exonerado');
select has_column('public', 'sales', 'unaffected_amount', 'las ventas persisten el importe inafecto');
select has_column('public', 'sales', 'tax_calculation_status', 'las ventas persisten el estado fiscal');

insert into public.organizations (id, name, slug) values
  ('a3b10000-0000-4000-8000-000000000001', 'P1B tres', 'a3b-tres'),
  ('a3b10000-0000-4000-8000-000000000002', 'P1B tres otra', 'a3b-tres-otra');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('a3b20000-0000-4000-8000-000000000001', 'p1b3@test.local', '{}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('a3b10000-0000-4000-8000-000000000001', 'a3b20000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('a3b10000-0000-4000-8000-000000000001', 'a3b20000-0000-4000-8000-000000000001', 'ADMIN');
insert into public.customers (
  id, organization_id, document_type, document_number, legal_name,
  created_by, updated_by
) values (
  'a3b30000-0000-4000-8000-000000000001',
  'a3b10000-0000-4000-8000-000000000001', 'RUC', '20990000011',
  'Cliente P1B3', 'a3b20000-0000-4000-8000-000000000001',
  'a3b20000-0000-4000-8000-000000000001'
);
insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
) values (
  'a3b50000-0000-4000-8000-000000000001',
  'a3b10000-0000-4000-8000-000000000001', 'P1B3', 'Almacén P1B3',
  'a3b20000-0000-4000-8000-000000000001',
  'a3b20000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'a3b60000-0000-4000-8000-000000000001',
  'a3b10000-0000-4000-8000-000000000001',
  'a3b50000-0000-4000-8000-000000000001', 'GENERAL', 'General P1B3',
  'a3b20000-0000-4000-8000-000000000001',
  'a3b20000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control, created_by, updated_by
) values
  ('a3b70000-0000-4000-8000-000000000001', 'a3b10000-0000-4000-8000-000000000001', 'P1B3-GOOD', 'Bien gravado', 'UND', 'good', 'gravado', false, false, 'a3b20000-0000-4000-8000-000000000001', 'a3b20000-0000-4000-8000-000000000001'),
  ('a3b70000-0000-4000-8000-000000000002', 'a3b10000-0000-4000-8000-000000000001', 'P1B3-EXON', 'Servicio exonerado', 'UND', 'service', 'exonerado', false, false, 'a3b20000-0000-4000-8000-000000000001', 'a3b20000-0000-4000-8000-000000000001'),
  ('a3b70000-0000-4000-8000-000000000003', 'a3b10000-0000-4000-8000-000000000001', 'P1B3-INAF', 'Servicio inafecto', 'UND', 'service', 'inafecto', false, false, 'a3b20000-0000-4000-8000-000000000001', 'a3b20000-0000-4000-8000-000000000001'),
  ('a3b70000-0000-4000-8000-000000000004', 'a3b10000-0000-4000-8000-000000000001', 'P1B3-GRAV-S', 'Servicio gravado', 'UND', 'service', 'gravado', false, false, 'a3b20000-0000-4000-8000-000000000001', 'a3b20000-0000-4000-8000-000000000001'),
  ('a3b70000-0000-4000-8000-000000000005', 'a3b10000-0000-4000-8000-000000000001', 'P1B3-PENDING', 'Servicio por definir', 'UND', 'service', 'por-definir', false, false, 'a3b20000-0000-4000-8000-000000000001', 'a3b20000-0000-4000-8000-000000000001'),
  ('a3b70000-0000-4000-8000-000000000006', 'a3b10000-0000-4000-8000-000000000002', 'P1B3-OTRA', 'Producto de otra organización', 'UND', 'good', 'gravado', false, false, 'a3b20000-0000-4000-8000-000000000001', 'a3b20000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3b20000-0000-4000-8000-000000000001', true);
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','a3b10000-0000-4000-8000-000000000001',
  'product_id','a3b70000-0000-4000-8000-000000000001',
  'warehouse_id','a3b50000-0000-4000-8000-000000000001',
  'location_id','a3b60000-0000-4000-8000-000000000001',
  'movement_type','entrada','quantity',3,'unit_cost',10,
  'stock_status','available','operation_date','2026-09-05','reason','Stock P1B3'
));

select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a3b10000-0000-4000-8000-000000000001',
    'operation_key','a3b80000-0000-4000-8000-000000000001',
    'customer_id','a3b30000-0000-4000-8000-000000000001',
    'warehouse_id','a3b50000-0000-4000-8000-000000000001',
    'prices_include_tax',true,
    'taxable_base',999,'exempt_amount',999,'unaffected_amount',999,'subtotal',999,'tax',999,'total',999,
    'items',jsonb_build_array(
      jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000001','quantity',1,'unit_price',118,'tax_affectation','inafecto'),
      jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000002','quantity',2,'unit_price',10,'tax_affectation','gravado'),
      jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000003','quantity',3,'unit_price',5,'tax_affectation','gravado'),
      jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000004','quantity',1,'unit_price',59,'tax_affectation','exonerado')
    )
  ))
$$, 'crea un pedido mixto de bienes y servicios');

select results_eq(
  $$select taxable_base, exempt_amount, unaffected_amount, subtotal, tax, total, tax_calculation_status from public.orders where operation_key='a3b80000-0000-4000-8000-000000000001'$$,
  $$values (150.00::numeric,20.00::numeric,15.00::numeric,185.00::numeric,27.00::numeric,212.00::numeric,'calculated'::text)$$,
  'calcula gravado, exonerado e inafecto por línea y redondea a centavos'
);
select results_eq(
  $$select product_id, tax_affectation from public.order_items where order_id=(select id from public.orders where operation_key='a3b80000-0000-4000-8000-000000000001') order by product_id$$,
  $$values
    ('a3b70000-0000-4000-8000-000000000001'::uuid,'gravado'::text),
    ('a3b70000-0000-4000-8000-000000000002'::uuid,'exonerado'::text),
    ('a3b70000-0000-4000-8000-000000000003'::uuid,'inafecto'::text),
    ('a3b70000-0000-4000-8000-000000000004'::uuid,'gravado'::text)$$,
  'el payload no puede falsificar el snapshot tributario'
);

set local role postgres;
update public.products
set tax_affectation = 'inafecto', updated_at = now()
where id = 'a3b70000-0000-4000-8000-000000000001';
set local role authenticated;
select results_eq(
  $$select tax_calculation_status, taxable_base, exempt_amount, unaffected_amount, subtotal, tax, total from public.orders where operation_key='a3b80000-0000-4000-8000-000000000001'$$,
  $$values ('calculated'::text,150.00::numeric,20.00::numeric,15.00::numeric,185.00::numeric,27.00::numeric,212.00::numeric)$$,
  'cambiar el producto después de crear no altera el pedido histórico'
);

select lives_ok($$
  select public.create_sale_from_order(
    'a3b10000-0000-4000-8000-000000000001',
    (select id from public.orders where operation_key='a3b80000-0000-4000-8000-000000000001'),
    jsonb_build_object('operation_key','a3b80000-0000-4000-8000-000000000002','document_type','boleta','series','B001','document_number','P1B3-001','warehouse','Almacén P1B3')
  )
$$, 'convierte el pedido calculado a venta');
select results_eq(
  $$select prices_include_tax, taxable_base, exempt_amount, unaffected_amount, subtotal, tax, total, tax_calculation_status from public.sales where operation_key='a3b80000-0000-4000-8000-000000000002'$$,
  $$values (true,150.00::numeric,20.00::numeric,15.00::numeric,185.00::numeric,27.00::numeric,212.00::numeric,'calculated'::text)$$,
  'la venta hereda precios y desglose calculado del pedido'
);
select results_eq(
  $$select item.tax_affectation, order_item.tax_affectation from public.sale_items item join public.order_items order_item on order_item.id=item.order_item_id order by item.product_id$$,
  $$values
    ('gravado'::text,'gravado'::text),
    ('exonerado'::text,'exonerado'::text),
    ('inafecto'::text,'inafecto'::text),
    ('gravado'::text,'gravado'::text)$$,
  'la venta conserva el snapshot exacto del pedido'
);

select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a3b10000-0000-4000-8000-000000000001',
    'operation_key','a3b80000-0000-4000-8000-000000000003',
    'customer_id','a3b30000-0000-4000-8000-000000000001',
    'warehouse_id','a3b50000-0000-4000-8000-000000000001',
    'prices_include_tax',false,
    'items',jsonb_build_array(jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000004','quantity',1,'unit_price',100))
  ))
$$, 'calcula gravado con precios sin IGV');
select results_eq(
  $$select taxable_base, exempt_amount, unaffected_amount, subtotal, tax, total from public.orders where operation_key='a3b80000-0000-4000-8000-000000000003'$$,
  $$values (100.00::numeric,0.00::numeric,0.00::numeric,100.00::numeric,18.00::numeric,118.00::numeric)$$,
  'precio sin IGV agrega el dieciocho por ciento'
);

select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a3b10000-0000-4000-8000-000000000001',
    'operation_key','a3b80000-0000-4000-8000-000000000004',
    'customer_id','a3b30000-0000-4000-8000-000000000001',
    'warehouse_id','a3b50000-0000-4000-8000-000000000001',
    'prices_include_tax',true,
    'items',jsonb_build_array(
      jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000004','quantity',1,'unit_price',0.05),
      jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000003','quantity',1,'unit_price',0.05)
    )
  ))
$$, 'calcula redondeo determinista por línea');
select results_eq(
  $$select taxable_base, exempt_amount, unaffected_amount, subtotal, tax, total from public.orders where operation_key='a3b80000-0000-4000-8000-000000000004'$$,
  $$values (0.04::numeric,0.00::numeric,0.05::numeric,0.09::numeric,0.01::numeric,0.10::numeric)$$,
  'el redondeo fiscal se hace por línea y no sobre el total bruto'
);

select throws_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a3b10000-0000-4000-8000-000000000001',
    'operation_key','a3b80000-0000-4000-8000-000000000005',
    'customer_id','a3b30000-0000-4000-8000-000000000001',
    'warehouse_id','a3b50000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000005','quantity',1,'unit_price',10))
  ))
$$, 'P0001', 'ORDER_TAX_AFFECTATION_UNDEFINED', 'create_order rechaza por-definir y no crea un borrador normal');
select is((select count(*) from public.orders where operation_key='a3b80000-0000-4000-8000-000000000005'), 0::bigint, 'rechazar por-definir no deja pedido ni reservas parciales');

-- Las operaciones administrativas pueden representar históricos sin snapshot.
set local role postgres;
insert into public.orders (
  id, organization_id, order_number, customer_id, warehouse_id, status,
  prices_include_tax, subtotal, tax, total, operation_key
) values
  ('a3b90000-0000-4000-8000-000000000001', 'a3b10000-0000-4000-8000-000000000001', 'PED-900001', 'a3b30000-0000-4000-8000-000000000001', 'a3b50000-0000-4000-8000-000000000001', 'confirmado', true, 9, 1, 10, 'a3ba0000-0000-4000-8000-000000000001'),
  ('a3b90000-0000-4000-8000-000000000002', 'a3b10000-0000-4000-8000-000000000001', 'PED-900002', 'a3b30000-0000-4000-8000-000000000001', 'a3b50000-0000-4000-8000-000000000001', 'confirmado', true, 9, 1, 10, 'a3ba0000-0000-4000-8000-000000000002');
insert into public.order_items (
  id, organization_id, order_id, product_id, product_code, product_description,
  unit_of_measure, quantity, unit_price
) values (
  'a3bb0000-0000-4000-8000-000000000001', 'a3b10000-0000-4000-8000-000000000001', 'a3b90000-0000-4000-8000-000000000001', 'a3b70000-0000-4000-8000-000000000005', 'P1B3-PENDING', 'Servicio por definir', 'UND', 1, 10
);
alter table public.order_items disable trigger order_items_snapshot_tax_affectation;
insert into public.order_items (
  id, organization_id, order_id, product_id, product_code, product_description,
  unit_of_measure, quantity, unit_price, tax_affectation
) values (
  'a3bb0000-0000-4000-8000-000000000002', 'a3b10000-0000-4000-8000-000000000001', 'a3b90000-0000-4000-8000-000000000002', 'a3b70000-0000-4000-8000-000000000004', 'P1B3-GRAV-S', 'Servicio gravado histórico', 'UND', 1, 10, null
);
alter table public.order_items enable trigger order_items_snapshot_tax_affectation;
set local role authenticated;
select is((select tax_calculation_status from public.orders where id='a3b90000-0000-4000-8000-000000000001'), 'pending', 'por-definir histórico queda pending');
select is((select tax_calculation_status from public.orders where id='a3b90000-0000-4000-8000-000000000002'), 'legacy_unknown', 'snapshot NULL histórico queda legacy_unknown');
select results_eq($$select subtotal, tax, total from public.orders where id in ('a3b90000-0000-4000-8000-000000000001','a3b90000-0000-4000-8000-000000000002') order by id$$, $$values (9.00::numeric,1.00::numeric,10.00::numeric),(9.00::numeric,1.00::numeric,10.00::numeric)$$, 'los históricos conservan sus importes existentes');

select throws_ok($$
  select public.create_sale_from_order('a3b10000-0000-4000-8000-000000000001','a3b90000-0000-4000-8000-000000000001',jsonb_build_object('operation_key','a3bc0000-0000-4000-8000-000000000001','document_type','boleta','series','B001','document_number','P1B3-P','warehouse','P1B3'))
$$, 'P0001', 'SALE_TAX_AFFECTATION_UNDEFINED', 'no convierte una orden pending');
select throws_ok($$
  select public.create_sale_from_order('a3b10000-0000-4000-8000-000000000001','a3b90000-0000-4000-8000-000000000002',jsonb_build_object('operation_key','a3bc0000-0000-4000-8000-000000000002','document_type','boleta','series','B001','document_number','P1B3-L','warehouse','P1B3'))
$$, 'P0001', 'SALE_TAX_AFFECTATION_LEGACY_UNKNOWN', 'no convierte una orden legacy_unknown');

-- Cancelación no depende de la validez fiscal y libera reservas.
select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a3b10000-0000-4000-8000-000000000001',
    'operation_key','a3b80000-0000-4000-8000-000000000006',
    'customer_id','a3b30000-0000-4000-8000-000000000001',
    'warehouse_id','a3b50000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000001','quantity',1,'unit_price',10))
  ))
$$, 'crea pedido con reserva para probar cancelación fiscalmente pendiente');
set local role postgres;
update public.orders
set tax_calculation_status = 'pending'
where operation_key = 'a3b80000-0000-4000-8000-000000000006';
set local role authenticated;
select lives_ok($$
  select public.cancel_order(jsonb_build_object('organization_id','a3b10000-0000-4000-8000-000000000001','order_id',(select id from public.orders where operation_key='a3b80000-0000-4000-8000-000000000006'),'operation_key','a3bd0000-0000-4000-8000-000000000001'))
$$, 'cancel_order permite pending y libera la reserva');
select is((select status from public.orders where operation_key='a3b80000-0000-4000-8000-000000000006'), 'cancelado', 'la cancelación conserva la regla operativa');
select is((select count(*) from public.inventory_reservations reservation join public.order_items item on item.id=reservation.source_id where item.order_id=(select id from public.orders where operation_key='a3b80000-0000-4000-8000-000000000006') and reservation.status='released'), 1::bigint, 'la cancelación pending libera reservas');

-- El despacho bloquea solo la transición abierta; no modifica FEFO ni Kardex.
select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a3b10000-0000-4000-8000-000000000001',
    'operation_key','a3b80000-0000-4000-8000-000000000007',
    'customer_id','a3b30000-0000-4000-8000-000000000001',
    'warehouse_id','a3b50000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000004','quantity',2,'unit_price',10))
  ))
$$, 'crea pedido de servicio para probar bloqueo de despacho');
select lives_ok($$
  select public.create_sale_from_order('a3b10000-0000-4000-8000-000000000001',(select id from public.orders where operation_key='a3b80000-0000-4000-8000-000000000007'),jsonb_build_object('operation_key','a3bc0000-0000-4000-8000-000000000007','document_type','boleta','series','B001','document_number','P1B3-D','warehouse','P1B3'))
$$, 'crea venta de servicio calculada');
set local role postgres;
update public.orders set tax_calculation_status='legacy_unknown' where operation_key='a3b80000-0000-4000-8000-000000000007';
update public.sales set tax_calculation_status='legacy_unknown' where operation_key='a3bc0000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok($$
  select public.dispatch_order_from_reservations(jsonb_build_object('organization_id','a3b10000-0000-4000-8000-000000000001','order_id',(select id from public.orders where operation_key='a3b80000-0000-4000-8000-000000000007'),'sale_id',(select id from public.sales where operation_key='a3bc0000-0000-4000-8000-000000000007'),'operation_key','a3be0000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('order_item_id',(select id from public.order_items where order_id=(select id from public.orders where operation_key='a3b80000-0000-4000-8000-000000000007')),'quantity',2))))
$$, 'P0001', 'ORDER_TAX_CALCULATION_REQUIRED', 'no despacha una venta unresolved');

select throws_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a3b10000-0000-4000-8000-000000000001',
    'operation_key','a3b80000-0000-4000-8000-000000000008',
    'customer_id','a3b30000-0000-4000-8000-000000000001',
    'warehouse_id','a3b50000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(jsonb_build_object('product_id','a3b70000-0000-4000-8000-000000000006','quantity',1,'unit_price',10))
  ))
$$, 'P0001', 'ORDER_PRODUCT_UNAVAILABLE', 'el producto de otra organización no se puede usar');

select * from finish();

rollback;
