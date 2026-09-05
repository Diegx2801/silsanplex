begin;

select no_plan();

insert into public.organizations (id, name, slug) values
  ('c1b20000-0000-4000-8000-000000000001', 'Compras tributarias', 'compras-tributarias-p1b2'),
  ('c1b20000-0000-4000-8000-000000000002', 'Otra organización', 'compras-tributarias-otra');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('c1b21000-0000-4000-8000-000000000001', 'p1b2.compras@test.local', '{"full_name":"Compras P1B2"}', now(), now()),
  ('c1b21000-0000-4000-8000-000000000002', 'p1b2.otra@test.local', '{"full_name":"Otra organización"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('c1b20000-0000-4000-8000-000000000001', 'c1b21000-0000-4000-8000-000000000001'),
  ('c1b20000-0000-4000-8000-000000000002', 'c1b21000-0000-4000-8000-000000000002');

insert into public.user_roles (organization_id, user_id, role_code) values
  ('c1b20000-0000-4000-8000-000000000001', 'c1b21000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('c1b20000-0000-4000-8000-000000000002', 'c1b21000-0000-4000-8000-000000000002', 'COMPRAS');

insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name,
  created_by, updated_by
) values (
  'c1b22000-0000-4000-8000-000000000001',
  'c1b20000-0000-4000-8000-000000000001',
  'ruc', '20999999991', 'Proveedor tributario SAC',
  'c1b21000-0000-4000-8000-000000000001',
  'c1b21000-0000-4000-8000-000000000001'
);

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
) values (
  'c1b23000-0000-4000-8000-000000000001',
  'c1b20000-0000-4000-8000-000000000001',
  'P1B2', 'Almacén tributario',
  'c1b21000-0000-4000-8000-000000000001',
  'c1b21000-0000-4000-8000-000000000001'
);

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'c1b24000-0000-4000-8000-000000000001',
  'c1b20000-0000-4000-8000-000000000001',
  'c1b23000-0000-4000-8000-000000000001',
  'GENERAL', 'Ubicación general',
  'c1b21000-0000-4000-8000-000000000001',
  'c1b21000-0000-4000-8000-000000000001'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  base_unit_id, product_type, tax_affectation, batch_control, expiration_control,
  created_by, updated_by
) values
  ('c1b25000-0000-4000-8000-000000000001', 'c1b20000-0000-4000-8000-000000000001', 'P1B2-GRAV', 'Producto gravado', 'UND', (select id from public.measurement_units where organization_id = 'c1b20000-0000-4000-8000-000000000001' and code = 'UNIT'), 'good', 'gravado', false, false, 'c1b21000-0000-4000-8000-000000000001', 'c1b21000-0000-4000-8000-000000000001'),
  ('c1b25000-0000-4000-8000-000000000002', 'c1b20000-0000-4000-8000-000000000001', 'P1B2-EXON', 'Producto exonerado', 'UND', (select id from public.measurement_units where organization_id = 'c1b20000-0000-4000-8000-000000000001' and code = 'UNIT'), 'good', 'exonerado', false, false, 'c1b21000-0000-4000-8000-000000000001', 'c1b21000-0000-4000-8000-000000000001'),
  ('c1b25000-0000-4000-8000-000000000003', 'c1b20000-0000-4000-8000-000000000001', 'P1B2-INAF', 'Servicio inafecto', 'SERV', (select id from public.measurement_units where organization_id = 'c1b20000-0000-4000-8000-000000000001' and code = 'UNIT'), 'service', 'inafecto', false, false, 'c1b21000-0000-4000-8000-000000000001', 'c1b21000-0000-4000-8000-000000000001'),
  ('c1b25000-0000-4000-8000-000000000004', 'c1b20000-0000-4000-8000-000000000001', 'P1B2-PEND', 'Producto por definir', 'UND', (select id from public.measurement_units where organization_id = 'c1b20000-0000-4000-8000-000000000001' and code = 'UNIT'), 'good', 'por-definir', false, false, 'c1b21000-0000-4000-8000-000000000001', 'c1b21000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1b21000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.save_purchase_order($payload$
    {
      "organization_id":"c1b20000-0000-4000-8000-000000000001",
      "supplier_id":"c1b22000-0000-4000-8000-000000000001",
      "document_type":"factura","series":"P1B2","document_number":"001",
      "issue_date":"2026-09-05","warehouse_id":"c1b23000-0000-4000-8000-000000000001",
      "prices_include_tax":true,
      "items":[
        {"product_id":"c1b25000-0000-4000-8000-000000000001","quantity":1,"unit_cost":118},
        {"product_id":"c1b25000-0000-4000-8000-000000000002","quantity":2,"unit_cost":10},
        {"product_id":"c1b25000-0000-4000-8000-000000000003","quantity":3,"unit_cost":5}
      ]
    }
  $payload$::jsonb)
$$, 'calcula una orden mixta incluida con snapshot de línea');

select results_eq($$
  select taxable_base, exempt_amount, unaffected_amount, subtotal, tax, total, tax_calculation_status
  from public.purchase_orders where document_number = '001'
$$, $$values (100.00::numeric, 20.00::numeric, 15.00::numeric, 135.00::numeric, 18.00::numeric, 153.00::numeric, 'calculated'::text)$$,
  'persiste desglose gravado, exonerado, inafecto, IGV y total');

select results_eq($$
  select item.tax_affectation
  from public.purchase_order_items item
  join public.purchase_orders purchase on purchase.id = item.purchase_order_id
  where purchase.document_number = '001'
  order by item.product_id
$$, $$values ('gravado'::text), ('exonerado'::text), ('inafecto'::text)$$,
  'las líneas conservan la afectación del producto');

select lives_ok($$
  select public.save_purchase_order($payload$
    {
      "organization_id":"c1b20000-0000-4000-8000-000000000001",
      "supplier_id":"c1b22000-0000-4000-8000-000000000001",
      "document_type":"factura","series":"P1B2","document_number":"002",
      "issue_date":"2026-09-05","warehouse_id":"c1b23000-0000-4000-8000-000000000001",
      "prices_include_tax":false,
      "items":[
        {"product_id":"c1b25000-0000-4000-8000-000000000001","quantity":1,"unit_cost":100},
        {"product_id":"c1b25000-0000-4000-8000-000000000002","quantity":1,"unit_cost":20},
        {"product_id":"c1b25000-0000-4000-8000-000000000003","quantity":1,"unit_cost":10}
      ]
    }
  $payload$::jsonb)
$$, 'calcula una orden mixta sin IGV incluido');

select results_eq($$
  select taxable_base, exempt_amount, unaffected_amount, subtotal, tax, total
  from public.purchase_orders where document_number = '002'
$$, $$values (100.00::numeric, 20.00::numeric, 10.00::numeric, 130.00::numeric, 18.00::numeric, 148.00::numeric)$$,
  'agrega IGV solo a la línea gravada');

select lives_ok($$
  select public.save_purchase_order($payload$
    {
      "organization_id":"c1b20000-0000-4000-8000-000000000001",
      "supplier_id":"c1b22000-0000-4000-8000-000000000001",
      "document_type":"factura","series":"P1B2","document_number":"003",
      "issue_date":"2026-09-05","warehouse_id":"c1b23000-0000-4000-8000-000000000001",
      "prices_include_tax":true,
      "items":[{"product_id":"c1b25000-0000-4000-8000-000000000004","quantity":1,"unit_cost":10}]
    }
  $payload$::jsonb)
$$, 'permite guardar borrador por definir');

select results_eq($$
  select subtotal, tax, total, tax_calculation_status
  from public.purchase_orders where document_number = '003'
$$, $$values (null::numeric, null::numeric, null::numeric, 'pending'::text)$$,
  'por definir deja pendiente el cálculo sin inventar IGV');

select throws_ok($$
  select public.issue_purchase_order(
    'c1b20000-0000-4000-8000-000000000001',
    (select id from public.purchase_orders where document_number = '003')
  )
$$, 'P0001', 'PURCHASE_ORDER_TAX_AFFECTATION_UNDEFINED',
  'por definir impide emitir la orden');

select lives_ok($$
  select public.save_purchase_order($payload$
    {
      "organization_id":"c1b20000-0000-4000-8000-000000000001",
      "supplier_id":"c1b22000-0000-4000-8000-000000000001",
      "document_type":"factura","series":"P1B2","document_number":"004",
      "issue_date":"2026-09-05","warehouse_id":"c1b23000-0000-4000-8000-000000000001",
      "prices_include_tax":true,
      "items":[{"product_id":"c1b25000-0000-4000-8000-000000000001","quantity":1,"unit_cost":10}]
    }
  $payload$::jsonb)
$$, 'guarda una orden para verificar el snapshot histórico');

set local role postgres;
update public.products
set tax_affectation = 'inafecto', updated_at = now()
where id = 'c1b25000-0000-4000-8000-000000000001';

select is((select tax_affectation from public.purchase_order_items item join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '004'), 'gravado', 'cambiar el producto no altera el snapshot de compras');
select results_eq($$
  select taxable_base, exempt_amount, unaffected_amount, subtotal, tax, total
  from public.purchase_orders where document_number = '004'
$$, $$values (8.47::numeric, 0.00::numeric, 0.00::numeric, 8.47::numeric, 1.53::numeric, 10.00::numeric)$$,
  'el total permanece calculado con el snapshot original');

select lives_ok($$
  select public.issue_purchase_order(
    'c1b20000-0000-4000-8000-000000000001',
    (select id from public.purchase_orders where document_number = '004')
  )
$$, 'la emisión usa la disponibilidad del producto pero no su afectación actual');

select lives_ok($$
  select public.save_purchase_order(jsonb_build_object(
    'organization_id', 'c1b20000-0000-4000-8000-000000000001',
    'supplier_id', 'c1b22000-0000-4000-8000-000000000001',
    'document_type', 'factura', 'series', 'P1B2', 'document_number', '005',
    'issue_date', '2026-09-05', 'warehouse_id', 'c1b23000-0000-4000-8000-000000000001',
    'prices_include_tax', true,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', 'c1b25000-0000-4000-8000-000000000002',
      'quantity', 1, 'unit_cost', 10, 'tax_affectation', 'inafecto'
    ))
  ))
$$, 'el payload fiscal no se usa para falsificar una línea');

select is((select tax_affectation from public.purchase_order_items item join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '005'), 'exonerado', 'la afectación la determina el producto en PostgreSQL');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1b21000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'c1b20000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '004'),
    'operation_key', 'c1b26000-0000-4000-8000-000000000001',
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', (select item.id from public.purchase_order_items item join public.purchase_orders purchase on purchase.id = item.purchase_order_id where purchase.document_number = '004'),
      'quantity', 1, 'location_id', 'c1b24000-0000-4000-8000-000000000001'
    ))
  ))
$$, 'recibe la orden sin recalcular sus importes');

select results_eq($$
  select taxable_base, exempt_amount, unaffected_amount, subtotal, tax, total
  from public.purchase_orders where document_number = '004'
$$, $$values (8.47::numeric, 0.00::numeric, 0.00::numeric, 8.47::numeric, 1.53::numeric, 10.00::numeric)$$,
  'la recepción parcial no cambia los totales fiscales de la orden');

reset role;
set local role postgres;
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  prices_include_tax, subtotal, tax, total, status
) values (
  'c1b27000-0000-4000-8000-000000000001',
  'c1b20000-0000-4000-8000-000000000001',
  'c1b22000-0000-4000-8000-000000000001', '20999999991', 'Proveedor tributario SAC',
  'factura', 'P1B2', '006', '2026-09-05', 'Almacén tributario',
  'c1b23000-0000-4000-8000-000000000001', true, 50, 9, 59, 'draft'
);
alter table public.purchase_order_items disable trigger purchase_order_items_snapshot_tax_affectation;
insert into public.purchase_order_items (
  purchase_order_id, organization_id, product_id, product_code, product_description,
  unit_of_measure, batch_control, quantity, unit_cost, tax_affectation
) values (
  'c1b27000-0000-4000-8000-000000000001',
  'c1b20000-0000-4000-8000-000000000001',
  'c1b25000-0000-4000-8000-000000000001', 'P1B2-GRAV', 'Histórico sin afectación',
  'UND', false, 1, 50, null
);
alter table public.purchase_order_items enable trigger purchase_order_items_snapshot_tax_affectation;

select is((select tax_calculation_status from public.purchase_orders where document_number = '006'), 'legacy_unknown', 'los históricos se marcan sin alterar sus totales');
select results_eq($$
  select subtotal, tax, total, taxable_base, exempt_amount, unaffected_amount
  from public.purchase_orders where document_number = '006'
$$, $$values (50.00::numeric, 9.00::numeric, 59.00::numeric, null::numeric, null::numeric, null::numeric)$$,
  'los totales históricos se conservan y el desglose queda desconocido');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1b21000-0000-4000-8000-000000000001', true);
select throws_ok($$
  select public.issue_purchase_order(
    'c1b20000-0000-4000-8000-000000000001',
    'c1b27000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'PURCHASE_ORDER_TAX_AFFECTATION_LEGACY_UNKNOWN',
  'un histórico sin snapshot no se emite con una afectación inventada');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1b21000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.purchase_orders), 0::bigint, 'otra organización no ve órdenes tributarias');

select * from finish();
rollback;
