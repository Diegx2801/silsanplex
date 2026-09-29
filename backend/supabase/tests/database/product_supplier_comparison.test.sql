begin;

select plan(28);

select has_function(
  'public', 'get_product_supplier_comparison',
  array['uuid', 'uuid', 'timestamptz', 'timestamptz'],
  'existe la lectura parametrizada producto-proveedor'
);
select is(
  has_function_privilege(
    'anon',
    'public.get_product_supplier_comparison(uuid, uuid, timestamp with time zone, timestamp with time zone)',
    'EXECUTE'
  ),
  false,
  'anon no ejecuta la comparacion'
);
select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.get_product_supplier_comparison(uuid, uuid, timestamp with time zone, timestamp with time zone)'::regprocedure
  ),
  false,
  'la RPC no usa SECURITY DEFINER'
);

set local role postgres;

insert into public.organizations (id, name, slug) values
  ('e4b00000-0000-4000-8000-000000000001', 'E4B empresa uno', 'e4b-empresa-uno'),
  ('e4b00000-0000-4000-8000-000000000002', 'E4B empresa dos', 'e4b-empresa-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('e4b10000-0000-4000-8000-000000000001', 'e4b.compras@test.local', '{"full_name":"E4B Compras"}', now(), now()),
  ('e4b10000-0000-4000-8000-000000000002', 'e4b.almacen@test.local', '{"full_name":"E4B Almacen"}', now(), now()),
  ('e4b10000-0000-4000-8000-000000000003', 'e4b.otra@test.local', '{"full_name":"E4B Otra empresa"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('e4b00000-0000-4000-8000-000000000001', 'e4b10000-0000-4000-8000-000000000001'),
  ('e4b00000-0000-4000-8000-000000000001', 'e4b10000-0000-4000-8000-000000000002'),
  ('e4b00000-0000-4000-8000-000000000002', 'e4b10000-0000-4000-8000-000000000003');

insert into public.user_roles (organization_id, user_id, role_code) values
  ('e4b00000-0000-4000-8000-000000000001', 'e4b10000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('e4b00000-0000-4000-8000-000000000001', 'e4b10000-0000-4000-8000-000000000002', 'ALMACEN'),
  ('e4b00000-0000-4000-8000-000000000002', 'e4b10000-0000-4000-8000-000000000003', 'COMPRAS');

insert into public.measurement_units (id, organization_id, code, name) values
  ('e4b15000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'UND', 'Unidad'),
  ('e4b15000-0000-4000-8000-000000000002', 'e4b00000-0000-4000-8000-000000000001', 'CAJA', 'Caja'),
  ('e4b15000-0000-4000-8000-000000000003', 'e4b00000-0000-4000-8000-000000000001', 'SERV', 'Servicio'),
  ('e4b15000-0000-4000-8000-000000000004', 'e4b00000-0000-4000-8000-000000000002', 'UND', 'Unidad')
on conflict do nothing;

insert into public.suppliers (id, organization_id, document_type, document_number, business_name) values
  ('e4b20000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'ruc', '20640000001', 'Proveedor E4B A'),
  ('e4b20000-0000-4000-8000-000000000002', 'e4b00000-0000-4000-8000-000000000001', 'ruc', '20640000002', 'Proveedor E4B B'),
  ('e4b20000-0000-4000-8000-000000000003', 'e4b00000-0000-4000-8000-000000000001', 'ruc', '20640000003', 'Proveedor E4B C'),
  ('e4b20000-0000-4000-8000-000000000004', 'e4b00000-0000-4000-8000-000000000001', 'ruc', '20640000004', 'Proveedor E4B D'),
  ('e4b20000-0000-4000-8000-000000000005', 'e4b00000-0000-4000-8000-000000000001', 'ruc', '20640000005', 'Proveedor E4B E'),
  ('e4b20000-0000-4000-8000-000000000006', 'e4b00000-0000-4000-8000-000000000001', 'ruc', '20640000006', 'Proveedor E4B F'),
  ('e4b20000-0000-4000-8000-000000000007', 'e4b00000-0000-4000-8000-000000000002', 'ruc', '20640000007', 'Proveedor E4B Otra');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control
) values
  ('e4b30000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', 'good', 'gravado', false, false),
  ('e4b30000-0000-4000-8000-000000000002', 'e4b00000-0000-4000-8000-000000000001', 'E4B-S1', 'Servicio E4B', 'SERVICIO', 'service', 'inafecto', false, false),
  ('e4b30000-0000-4000-8000-000000000003', 'e4b00000-0000-4000-8000-000000000002', 'E4B-OT', 'Producto otra organizacion', 'UND', 'good', 'gravado', false, false);

insert into public.warehouses (id, organization_id, code, name) values
  ('e4b40000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'E4B-ALM', 'Almacen E4B'),
  ('e4b40000-0000-4000-8000-000000000002', 'e4b00000-0000-4000-8000-000000000002', 'E4B-OTR', 'Almacen E4B Otra');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name) values
  ('e4b50000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'e4b40000-0000-4000-8000-000000000001', 'GENERAL', 'General E4B'),
  ('e4b50000-0000-4000-8000-000000000002', 'e4b00000-0000-4000-8000-000000000002', 'e4b40000-0000-4000-8000-000000000002', 'GENERAL', 'General E4B Otra');

-- A: varias compras PEN/UND/gravado, parcial, cerrada parcial e issued.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date,
  received_at, closed_at, closed_by, close_reason, cancelled_at
) values
  ('e4b60000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4B A', 'factura', 'E4BA', '001', '2026-01-01', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-01-01 08:00+00', '2026-01-06', '2026-01-05 08:00+00', null, null, null, null),
  ('e4b60000-0000-4000-8000-000000000002', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4B A', 'factura', 'E4BA', '002', '2026-02-01', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', true, 'partially_received', '2026-02-01 08:00+00', '2026-02-06', null, null, null, null, null),
  ('e4b60000-0000-4000-8000-000000000003', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4B A', 'factura', 'E4BA', '003', '2026-03-01', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', true, 'closed_partial', '2026-03-01 08:00+00', '2026-03-05', null, '2026-03-20 08:00+00', 'e4b10000-0000-4000-8000-000000000001', 'Saldo no atendido', null),
  ('e4b60000-0000-4000-8000-000000000004', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4B A', 'factura', 'E4BA', '004', '2026-04-01', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', true, 'issued', '2026-04-01 08:00+00', '2026-04-05', null, null, null, null, null),
  ('e4b60000-0000-4000-8000-000000000005', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4B A', 'factura', 'E4BA', '005', '2026-05-01', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', true, 'draft', null, null, null, null, null, null, null),
  ('e4b60000-0000-4000-8000-000000000006', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4B A', 'factura', 'E4BA', '006', '2026-06-01', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', true, 'cancelled', null, null, null, '2026-06-02 08:00+00', 'e4b10000-0000-4000-8000-000000000001', 'Anulada', '2026-06-02 08:00+00');

-- B: una compra comparable en PEN/UND/gravado.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date, received_at
) values
  ('e4b60000-0000-4000-8000-000000000007', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000002', '20640000002', 'Proveedor E4B B', 'factura', 'E4BB', '001', '2026-01-15', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-01-15 08:00+00', '2026-01-20', '2026-01-19 08:00+00');

-- C: misma ficha pero USD, no fusionable con PEN.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date, received_at
) values
  ('e4b60000-0000-4000-8000-000000000008', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000003', '20640000003', 'Proveedor E4B C', 'factura', 'E4BC', '001', '2026-02-15', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'USD', true, 'received', '2026-02-15 08:00+00', '2026-02-20', '2026-02-19 08:00+00');

-- D: misma moneda/unidad, pero base tributaria incompatible.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date, received_at
) values
  ('e4b60000-0000-4000-8000-000000000009', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000004', '20640000004', 'Proveedor E4B D', 'factura', 'E4BD', '001', '2026-03-15', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', false, 'received', '2026-03-15 08:00+00', '2026-03-20', '2026-03-25 08:00+00');

-- E: unidad distinta, no se mezcla con UND.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date, received_at
) values
  ('e4b60000-0000-4000-8000-000000000010', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000005', '20640000005', 'Proveedor E4B E', 'factura', 'E4BE', '001', '2026-03-20', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-03-20 08:00+00', '2026-03-22', '2026-03-22 08:00+00');

-- F: una orden issued sin recepcion; aparece sin precio comparable.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date
) values
  ('e4b60000-0000-4000-8000-000000000011', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000006', '20640000006', 'Proveedor E4B F', 'factura', 'E4BF', '001', '2026-04-10', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', true, 'issued', '2026-04-10 08:00+00', null);

-- Servicio administrativo: no contamina la comparacion fisica del producto.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, received_at
) values
  ('e4b60000-0000-4000-8000-000000000012', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4B A', 'factura', 'E4BS', '001', '2026-04-15', 'Almacen E4B', 'e4b40000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-04-15 08:00+00', '2026-04-16 08:00+00');

insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date, received_at
) values
  ('e4b60000-0000-4000-8000-000000000013', 'e4b00000-0000-4000-8000-000000000002', 'e4b20000-0000-4000-8000-000000000007', '20640000007', 'Proveedor E4B Otra', 'factura', 'E4BO', '001', '2026-01-01', 'Almacen E4B Otra', 'e4b40000-0000-4000-8000-000000000002', 'PEN', true, 'received', '2026-01-01 08:00+00', '2026-01-03', '2026-01-03 08:00+00');

insert into public.purchase_order_items (
  id, purchase_order_id, organization_id, product_id, product_code,
  product_description, unit_of_measure, batch_control, quantity, unit_cost
) values
  ('e4b70000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', false, 10, 8),
  ('e4b70000-0000-4000-8000-000000000002', 'e4b60000-0000-4000-8000-000000000002', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', false, 10, 9),
  ('e4b70000-0000-4000-8000-000000000003', 'e4b60000-0000-4000-8000-000000000003', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', false, 5, 11),
  ('e4b70000-0000-4000-8000-000000000004', 'e4b60000-0000-4000-8000-000000000004', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', false, 4, 12),
  ('e4b70000-0000-4000-8000-000000000005', 'e4b60000-0000-4000-8000-000000000005', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', false, 4, 99),
  ('e4b70000-0000-4000-8000-000000000006', 'e4b60000-0000-4000-8000-000000000006', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', false, 4, 98),
  ('e4b70000-0000-4000-8000-000000000007', 'e4b60000-0000-4000-8000-000000000007', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', false, 5, 7),
  ('e4b70000-0000-4000-8000-000000000008', 'e4b60000-0000-4000-8000-000000000008', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', false, 5, 2),
  ('e4b70000-0000-4000-8000-000000000009', 'e4b60000-0000-4000-8000-000000000009', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', false, 5, 6),
  ('e4b70000-0000-4000-8000-000000000010', 'e4b60000-0000-4000-8000-000000000010', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'CAJA', false, 5, 30),
  ('e4b70000-0000-4000-8000-000000000011', 'e4b60000-0000-4000-8000-000000000011', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'E4B-P1', 'Producto comparado E4B', 'UND', false, 3, 13),
  ('e4b70000-0000-4000-8000-000000000012', 'e4b60000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000002', 'E4B-S1', 'Servicio E4B', 'SERV', false, 3, 100),
  ('e4b70000-0000-4000-8000-000000000013', 'e4b60000-0000-4000-8000-000000000013', 'e4b00000-0000-4000-8000-000000000002', 'e4b30000-0000-4000-8000-000000000003', 'E4B-OT', 'Producto otra organizacion', 'UND', false, 2, 4);

insert into public.purchase_receipts (
  id, organization_id, purchase_order_id, warehouse_id, operation_key, received_at, received_by
) values
  ('e4b80000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000001', 'e4b40000-0000-4000-8000-000000000001', 'e4b81000-0000-4000-8000-000000000001', '2026-01-05 08:00+00', 'e4b10000-0000-4000-8000-000000000001'),
  ('e4b80000-0000-4000-8000-000000000002', 'e4b00000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000002', 'e4b40000-0000-4000-8000-000000000001', 'e4b81000-0000-4000-8000-000000000002', '2026-02-05 08:00+00', 'e4b10000-0000-4000-8000-000000000001'),
  ('e4b80000-0000-4000-8000-000000000003', 'e4b00000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000002', 'e4b40000-0000-4000-8000-000000000001', 'e4b81000-0000-4000-8000-000000000003', '2026-02-07 08:00+00', 'e4b10000-0000-4000-8000-000000000001'),
  ('e4b80000-0000-4000-8000-000000000004', 'e4b00000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000003', 'e4b40000-0000-4000-8000-000000000001', 'e4b81000-0000-4000-8000-000000000004', '2026-03-10 08:00+00', 'e4b10000-0000-4000-8000-000000000001'),
  ('e4b80000-0000-4000-8000-000000000005', 'e4b00000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000007', 'e4b40000-0000-4000-8000-000000000001', 'e4b81000-0000-4000-8000-000000000005', '2026-01-19 08:00+00', 'e4b10000-0000-4000-8000-000000000001'),
  ('e4b80000-0000-4000-8000-000000000006', 'e4b00000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000008', 'e4b40000-0000-4000-8000-000000000001', 'e4b81000-0000-4000-8000-000000000006', '2026-02-19 08:00+00', 'e4b10000-0000-4000-8000-000000000001'),
  ('e4b80000-0000-4000-8000-000000000007', 'e4b00000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000009', 'e4b40000-0000-4000-8000-000000000001', 'e4b81000-0000-4000-8000-000000000007', '2026-03-25 08:00+00', 'e4b10000-0000-4000-8000-000000000001'),
  ('e4b80000-0000-4000-8000-000000000008', 'e4b00000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000010', 'e4b40000-0000-4000-8000-000000000001', 'e4b81000-0000-4000-8000-000000000008', '2026-03-22 08:00+00', 'e4b10000-0000-4000-8000-000000000001'),
  ('e4b80000-0000-4000-8000-000000000009', 'e4b00000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000012', 'e4b40000-0000-4000-8000-000000000001', 'e4b81000-0000-4000-8000-000000000009', '2026-04-16 08:00+00', 'e4b10000-0000-4000-8000-000000000001'),
  ('e4b80000-0000-4000-8000-000000000010', 'e4b00000-0000-4000-8000-000000000002', 'e4b60000-0000-4000-8000-000000000013', 'e4b40000-0000-4000-8000-000000000002', 'e4b81000-0000-4000-8000-000000000010', '2026-01-03 08:00+00', 'e4b10000-0000-4000-8000-000000000003');

insert into public.purchase_receipt_items (
  id, organization_id, receipt_id, purchase_order_item_id, product_id,
  warehouse_id, location_id, quantity, unit_cost, fulfillment_mode, tax_affectation
) values
  ('e4b90000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'e4b80000-0000-4000-8000-000000000001', 'e4b70000-0000-4000-8000-000000000001', 'e4b30000-0000-4000-8000-000000000001', 'e4b40000-0000-4000-8000-000000000001', 'e4b50000-0000-4000-8000-000000000001', 10, 8, 'physical', 'gravado'),
  ('e4b90000-0000-4000-8000-000000000002', 'e4b00000-0000-4000-8000-000000000001', 'e4b80000-0000-4000-8000-000000000002', 'e4b70000-0000-4000-8000-000000000002', 'e4b30000-0000-4000-8000-000000000001', 'e4b40000-0000-4000-8000-000000000001', 'e4b50000-0000-4000-8000-000000000001', 4, 9, 'physical', 'gravado'),
  ('e4b90000-0000-4000-8000-000000000003', 'e4b00000-0000-4000-8000-000000000001', 'e4b80000-0000-4000-8000-000000000003', 'e4b70000-0000-4000-8000-000000000002', 'e4b30000-0000-4000-8000-000000000001', 'e4b40000-0000-4000-8000-000000000001', 'e4b50000-0000-4000-8000-000000000001', 3, 10, 'physical', 'gravado'),
  ('e4b90000-0000-4000-8000-000000000004', 'e4b00000-0000-4000-8000-000000000001', 'e4b80000-0000-4000-8000-000000000004', 'e4b70000-0000-4000-8000-000000000003', 'e4b30000-0000-4000-8000-000000000001', 'e4b40000-0000-4000-8000-000000000001', 'e4b50000-0000-4000-8000-000000000001', 2, 11, 'physical', 'gravado'),
  ('e4b90000-0000-4000-8000-000000000005', 'e4b00000-0000-4000-8000-000000000001', 'e4b80000-0000-4000-8000-000000000005', 'e4b70000-0000-4000-8000-000000000007', 'e4b30000-0000-4000-8000-000000000001', 'e4b40000-0000-4000-8000-000000000001', 'e4b50000-0000-4000-8000-000000000001', 5, 7, 'physical', 'gravado'),
  ('e4b90000-0000-4000-8000-000000000006', 'e4b00000-0000-4000-8000-000000000001', 'e4b80000-0000-4000-8000-000000000006', 'e4b70000-0000-4000-8000-000000000008', 'e4b30000-0000-4000-8000-000000000001', 'e4b40000-0000-4000-8000-000000000001', 'e4b50000-0000-4000-8000-000000000001', 5, 2, 'physical', 'gravado'),
  ('e4b90000-0000-4000-8000-000000000007', 'e4b00000-0000-4000-8000-000000000001', 'e4b80000-0000-4000-8000-000000000007', 'e4b70000-0000-4000-8000-000000000009', 'e4b30000-0000-4000-8000-000000000001', 'e4b40000-0000-4000-8000-000000000001', 'e4b50000-0000-4000-8000-000000000001', 5, 6, 'physical', 'gravado'),
  ('e4b90000-0000-4000-8000-000000000008', 'e4b00000-0000-4000-8000-000000000001', 'e4b80000-0000-4000-8000-000000000008', 'e4b70000-0000-4000-8000-000000000010', 'e4b30000-0000-4000-8000-000000000001', 'e4b40000-0000-4000-8000-000000000001', 'e4b50000-0000-4000-8000-000000000001', 5, 30, 'physical', 'gravado'),
  ('e4b90000-0000-4000-8000-000000000009', 'e4b00000-0000-4000-8000-000000000001', 'e4b80000-0000-4000-8000-000000000009', 'e4b70000-0000-4000-8000-000000000012', 'e4b30000-0000-4000-8000-000000000002', null, null, 3, 100, 'administrative', 'inafecto'),
  ('e4b90000-0000-4000-8000-000000000010', 'e4b00000-0000-4000-8000-000000000002', 'e4b80000-0000-4000-8000-000000000010', 'e4b70000-0000-4000-8000-000000000013', 'e4b30000-0000-4000-8000-000000000003', 'e4b40000-0000-4000-8000-000000000002', 'e4b50000-0000-4000-8000-000000000002', 2, 4, 'physical', 'gravado');

insert into public.supplier_returns (
  id, organization_id, supplier_id, purchase_order_id, purchase_order_item_id,
  purchase_receipt_item_id, product_id, quantity, reason, status, requested_at,
  completed_at, responsible_name
) values
  ('e4ba0000-0000-4000-8000-000000000001', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000001', 'e4b60000-0000-4000-8000-000000000002', 'e4b70000-0000-4000-8000-000000000002', 'e4b90000-0000-4000-8000-000000000002', 'e4b30000-0000-4000-8000-000000000001', 1, 'Devolucion completada E4B', 'completed', '2026-02-10', '2026-02-11 08:00+00', 'E4B Compras'),
  ('e4ba0000-0000-4000-8000-000000000002', 'e4b00000-0000-4000-8000-000000000001', 'e4b20000-0000-4000-8000-000000000002', 'e4b60000-0000-4000-8000-000000000007', 'e4b70000-0000-4000-8000-000000000007', 'e4b90000-0000-4000-8000-000000000005', 'e4b30000-0000-4000-8000-000000000001', 1, 'Devolucion registrada E4B', 'registered', '2026-02-10', null, 'E4B Compras');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4b10000-0000-4000-8000-000000000001', true);

select is(
  (select count(*) from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001',
    null, null
  )),
  6::bigint,
  'devuelve cinco dimensiones con precio y un proveedor issued sin precio'
);
select results_eq(
  $$select price_receipt_count, price_purchase_count, price_received_quantity,
           latest_unit_cost, previous_unit_cost, weighted_average_unit_cost,
           minimum_unit_cost, maximum_unit_cost, percentage_variation
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001', null, null
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000001'
       and currency = 'PEN' and unit_of_measure = 'UND'$$,
  $$values (4, 3, 19.000::numeric, 11.0000::numeric, 10.0000::numeric,
           8.8421::numeric, 8.0000::numeric, 11.0000::numeric, 10.00::numeric)$$,
  'reutiliza E2 para precio, promedio ponderado y variacion'
);
select results_eq(
  $$select total_orders, total_order_lines, ordered_quantity, received_quantity,
           fulfillment_percentage, complete_lines, incomplete_lines,
           received_orders, partially_received_orders, closed_partial_orders,
           operational_receipt_count, sample_size
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001', null, null
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000001'
       and currency = 'PEN' and unit_of_measure = 'UND'$$,
  $$values (4, 4, 29.000::numeric, 19.000::numeric, 65.52::numeric,
           1, 3, 1, 1, 1, 4, 4)$$,
  'calcula cumplimiento por producto con cantidades reales y estados separados'
);
select results_eq(
  $$select first_receipt_sample_size, last_receipt_sample_size,
           complete_delivery_sample_size, avg_days_to_first_receipt,
           avg_days_to_last_receipt, avg_days_to_complete,
           orders_with_expected_delivery, on_time_orders, late_orders,
           on_time_percentage
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001', null, null
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000001'
       and currency = 'PEN' and unit_of_measure = 'UND'$$,
  $$values (3, 3, 1, 5.67::numeric, 6.33::numeric, 4.00::numeric, 1, 1, 0, 100.00::numeric)$$,
  'calcula primera recepcion, ultima recepcion, recepcion completa y puntualidad'
);
select results_eq(
  $$select completed_returns_count, affected_receipts_count,
           returned_quantity, returned_quantity_percentage
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001', null, null
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000001'
       and currency = 'PEN' and unit_of_measure = 'UND'$$,
  $$values (1, 1, 1.000::numeric, 5.26::numeric)$$,
  'filtra devoluciones por producto y considera solo completed'
);
select is(
  (select total_orders from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001', null, null
  ) where supplier_id = 'e4b20000-0000-4000-8000-000000000002' and currency = 'PEN'),
  1,
  'un proveedor con una sola compra conserva su muestra'
);
select is(
  (select price_received_quantity from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001', null, null
  ) where supplier_id = 'e4b20000-0000-4000-8000-000000000003' and currency = 'USD'),
  5.000::numeric,
  'separa USD de PEN'
);
select is(
  (select prices_include_tax from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001', null, null
  ) where supplier_id = 'e4b20000-0000-4000-8000-000000000004'),
  false,
  'conserva separada la base de precios sin IGV'
);
select is(
  (select unit_of_measure from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001', null, null
  ) where supplier_id = 'e4b20000-0000-4000-8000-000000000005'),
  'CAJA',
  'conserva separada la unidad historica del proveedor'
);
select results_eq(
  $$select comparison_status, currency, price_receipt_count, total_orders,
           received_quantity, orders_with_expected_delivery
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001', null, null
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000006'$$,
  $$values ('no_comparable', null::text, null::integer, 1,
            0.000::numeric, 0)$$,
  'expone un proveedor sin recepcion como no comparable y no convierte NULL de precio a cero'
);
select is(
  (select max(comparison_dimension_count) from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001', null, null
  )),
  4,
  'cuenta dimensiones de comparacion sin fusionarlas'
);
select is(
  (select count(*) from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001', null, null
  ) where currency = 'PEN' and unit_of_measure = 'UND'
      and prices_include_tax = true and tax_affectation = 'gravado'),
  2::bigint,
  'mantiene comparables juntos a los dos proveedores PEN UND gravado'
);
select is(
  (select count(*) from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001', null, null
  ) where currency = 'USD'),
  1::bigint,
  'mantiene USD como dimension independiente'
);
select is(
  (select count(*) from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000002', null, null
  )),
  0::bigint,
  'no mezcla un servicio administrativo con la comparacion fisica'
);
select is(
  (select count(*) from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000003', null, null
  )),
  0::bigint,
  'no devuelve el producto de otra organizacion'
);
select results_eq(
  $$select price_receipt_count, price_received_quantity, total_orders,
           ordered_quantity, received_quantity, fulfillment_percentage,
           completed_returns_count
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001',
        '2026-02-01 00:00+00', '2026-03-01 00:00+00'
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000001'$$,
  $$values (2, 7.000::numeric, 1, 10.000::numeric, 7.000::numeric, 70.00::numeric, 1)$$,
  'aplica periodo de recepcion para E2 y de emision para desempeño'
);
select results_eq(
  $$select orders_with_expected_delivery, on_time_orders, late_orders, on_time_percentage
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001', null, null
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000004'$$,
  $$values (1, 0, 1, 0.00::numeric)$$,
  'clasifica una entrega tardia sin mezclar monedas ni fechas prometidas nulas'
);
select results_eq(
  $$select completed_returns_count, affected_receipts_count, returned_quantity
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001', null, null
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000002'$$,
  $$values (0, 0, 0.000::numeric)$$,
  'ignora una devolucion no completada'
);
select results_eq(
  $$select price_receipt_count, operational_receipt_count, received_quantity
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001', null, null
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000005'$$,
  $$values (1, 1, 5.000::numeric)$$,
  'mantiene separadas las recepciones y la cantidad de la unidad CAJA'
);
select results_eq(
  $$select comparison_status, comparison_key, tax_affectation
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001', null, null
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000001'$$,
  $$values ('comparable', 'PEN|UND|true|gravado', 'gravado')$$,
  'expone la clave explicita de comparabilidad'
);
select results_eq(
  $$select ordered_quantity, received_quantity, first_receipt_sample_size,
           orders_with_expected_delivery
      from public.get_product_supplier_comparison(
        'e4b00000-0000-4000-8000-000000000001',
        'e4b30000-0000-4000-8000-000000000001', null, null
      )
     where supplier_id = 'e4b20000-0000-4000-8000-000000000006'$$,
  $$values (3.000::numeric, 0.000::numeric, 0, 0)$$,
  'conserva la orden issued y no inventa recepcion ni puntualidad'
);
select is(
  (select count(*) from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001', null, null
  ) where comparison_status = 'no_comparable'),
  1::bigint,
  'distingue la fila sin precio comparable'
);
select throws_ok(
  $$select * from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001',
    '2026-04-01 00:00+00', '2026-03-01 00:00+00'
  )$$,
  '22023',
  'E4B_PRODUCT_SUPPLIER_COMPARISON_PERIOD_INVALID',
  'rechaza periodos invertidos'
);

select set_config('request.jwt.claim.sub', 'e4b10000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select * from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001', null, null
  )$$,
  '42501',
  'E4B_PRODUCT_SUPPLIER_COMPARISON_FORBIDDEN',
  'PURCHASES_VIEW sin SUPPLIERS_VIEW no expone precios por proveedor'
);

select set_config('request.jwt.claim.sub', 'e4b10000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.get_product_supplier_comparison(
    'e4b00000-0000-4000-8000-000000000001',
    'e4b30000-0000-4000-8000-000000000001', null, null
  )$$,
  '42501',
  'E4B_PRODUCT_SUPPLIER_COMPARISON_FORBIDDEN',
  'otro tenant no puede consultar la organizacion solicitada'
);

select * from finish();
rollback;
