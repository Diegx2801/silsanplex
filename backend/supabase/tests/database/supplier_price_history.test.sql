begin;

select plan(34);

select has_view('public', 'supplier_price_history', 'existe el detalle de costos por recepcion');
select has_view('public', 'supplier_purchase_price_summary', 'existe el resumen de costos compatible');
select has_function(
  'public', 'get_supplier_purchase_price_history',
  array['uuid', 'uuid', 'uuid', 'timestamptz', 'timestamptz'],
  'existe la lectura parametrizada del detalle'
);
select has_function(
  'public', 'get_supplier_purchase_price_summary',
  array['uuid', 'uuid', 'uuid', 'timestamptz', 'timestamptz'],
  'existe la lectura parametrizada del resumen'
);
select has_column('public', 'supplier_price_history', 'purchase_receipt_id', 'el detalle expone la recepcion real');
select has_column('public', 'supplier_price_history', 'is_inventory_receipt', 'el detalle distingue servicios administrativos');
select has_column('public', 'supplier_purchase_price_summary', 'percentage_variation', 'el resumen expone la variacion porcentual');
select is(has_table_privilege('anon', 'public.supplier_price_history', 'SELECT'), false, 'anon no consulta el detalle');
select is(has_function_privilege('anon', 'public.get_supplier_purchase_price_summary(uuid, uuid, uuid, timestamp with time zone, timestamp with time zone)', 'EXECUTE'), false, 'anon no ejecuta el resumen');

set local role postgres;

insert into public.organizations (id, name, slug) values
  ('e2000000-0000-4000-8000-000000000001', 'E2 empresa uno', 'e2-empresa-uno'),
  ('e2000000-0000-4000-8000-000000000002', 'E2 empresa dos', 'e2-empresa-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('e2100000-0000-4000-8000-000000000001', 'e2.compras@test.local', '{"full_name":"E2 Compras"}', now(), now()),
  ('e2100000-0000-4000-8000-000000000002', 'e2.almacen@test.local', '{"full_name":"E2 Almacen"}', now(), now()),
  ('e2100000-0000-4000-8000-000000000003', 'e2.otra@test.local', '{"full_name":"E2 Otra empresa"}', now(), now()),
  ('e2100000-0000-4000-8000-000000000004', 'e2.ventas@test.local', '{"full_name":"E2 Ventas"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('e2000000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000002'),
  ('e2000000-0000-4000-8000-000000000002', 'e2100000-0000-4000-8000-000000000003'),
  ('e2000000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000004');

insert into public.user_roles (organization_id, user_id, role_code) values
  ('e2000000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('e2000000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000002', 'ALMACEN'),
  ('e2000000-0000-4000-8000-000000000002', 'e2100000-0000-4000-8000-000000000003', 'COMPRAS'),
  ('e2000000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000004', 'VENTAS');

insert into public.measurement_units (id, organization_id, code, name) values
  ('e2350000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'UNIT', 'Unidad'),
  ('e2350000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'SERVICE', 'Servicio'),
  ('e2350000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000002', 'UNIT', 'Unidad')
on conflict (organization_id, code) do nothing;

insert into public.suppliers (id, organization_id, document_type, document_number, business_name) values
  ('e2200000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'ruc', '20600000001', 'Proveedor E2 Uno'),
  ('e2200000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'ruc', '20600000002', 'Proveedor E2 Dos'),
  ('e2200000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000002', 'ruc', '20600000003', 'Proveedor E2 Otra');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control
) values
  ('e2300000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'E2-P1', 'Producto E2 Uno', 'UND', 'good', 'gravado', false, false),
  ('e2300000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'E2-P2', 'Producto E2 Dos', 'UND', 'good', 'exonerado', false, false),
  ('e2300000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'E2-S1', 'Servicio E2', 'Servicio', 'service', 'inafecto', false, false),
  ('e2300000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000002', 'E2-OT', 'Producto E2 Otra', 'UND', 'good', 'gravado', false, false);

insert into public.warehouses (id, organization_id, code, name) values
  ('e2400000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'E2-ALM', 'Almacen E2'),
  ('e2400000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'E2-OTR', 'Almacen E2 Otra');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name) values
  ('e2500000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e2400000-0000-4000-8000-000000000001', 'GENERAL', 'General E2'),
  ('e2500000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'e2400000-0000-4000-8000-000000000002', 'GENERAL', 'General E2 Otra');

-- Orden recibida: se ordenaron 10 pero solo 4 llegaron a la recepcion.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, received_at
) values
  ('e2600000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000001', '20600000001', 'Proveedor E2 Uno', 'factura', 'E201', '001', '2026-01-01', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-01-02 08:00+00', '2026-01-10 08:00+00');
insert into public.purchase_order_items (id, purchase_order_id, organization_id, product_id, product_code, product_description, unit_of_measure, batch_control, quantity, unit_cost)
values ('e2700000-0000-4000-8000-000000000001', 'e2600000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', 'E2-P1', 'Producto E2 Uno', 'UND', false, 10, 10);

-- Orden parcialmente recibida con dos eventos de recepcion.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at
) values
  ('e2600000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000001', '20600000001', 'Proveedor E2 Uno', 'factura', 'E202', '002', '2026-02-01', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'PEN', true, 'partially_received', '2026-02-02 08:00+00');
insert into public.purchase_order_items (id, purchase_order_id, organization_id, product_id, product_code, product_description, unit_of_measure, batch_control, quantity, unit_cost)
values ('e2700000-0000-4000-8000-000000000002', 'e2600000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', 'E2-P1', 'Producto E2 Uno', 'UND', false, 10, 12);

-- Orden cerrada parcialmente.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, closed_at, closed_by, close_reason
) values
  ('e2600000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000001', '20600000001', 'Proveedor E2 Uno', 'factura', 'E203', '003', '2026-03-01', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'PEN', true, 'closed_partial', '2026-03-02 08:00+00', '2026-03-20 08:00+00', 'e2100000-0000-4000-8000-000000000001', 'Saldo no atendido');
insert into public.purchase_order_items (id, purchase_order_id, organization_id, product_id, product_code, product_description, unit_of_measure, batch_control, quantity, unit_cost)
values ('e2700000-0000-4000-8000-000000000003', 'e2600000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', 'E2-P1', 'Producto E2 Uno', 'UND', false, 20, 14);

-- Orden en USD: la moneda genera un resumen separado.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, received_at
) values
  ('e2600000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000001', '20600000001', 'Proveedor E2 Uno', 'factura', 'E204', '004', '2026-04-01', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'USD', true, 'received', '2026-04-02 08:00+00', '2026-04-10 08:00+00');
insert into public.purchase_order_items (id, purchase_order_id, organization_id, product_id, product_code, product_description, unit_of_measure, batch_control, quantity, unit_cost)
values ('e2700000-0000-4000-8000-000000000004', 'e2600000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', 'E2-P1', 'Producto E2 Uno', 'UND', false, 5, 2);

-- Segundo proveedor para el mismo producto.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, received_at
) values
  ('e2600000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000002', '20600000002', 'Proveedor E2 Dos', 'factura', 'E205', '005', '2026-05-01', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-05-02 08:00+00', '2026-05-10 08:00+00');
insert into public.purchase_order_items (id, purchase_order_id, organization_id, product_id, product_code, product_description, unit_of_measure, batch_control, quantity, unit_cost)
values ('e2700000-0000-4000-8000-000000000005', 'e2600000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', 'E2-P1', 'Producto E2 Uno', 'UND', false, 6, 9);

-- Dos ordenes del segundo producto y misma fecha para validar desempate estable.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, received_at
) values
  ('e2600000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000001', '20600000001', 'Proveedor E2 Uno', 'factura', 'E206', '006', '2026-06-01', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'PEN', false, 'received', '2026-06-02 08:00+00', '2026-07-10 08:00+00'),
  ('e2600000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000001', '20600000001', 'Proveedor E2 Uno', 'factura', 'E207', '007', '2026-07-01', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'PEN', false, 'received', '2026-07-02 08:00+00', '2026-07-10 08:00+00');
insert into public.purchase_order_items (id, purchase_order_id, organization_id, product_id, product_code, product_description, unit_of_measure, batch_control, quantity, unit_cost)
values
  ('e2700000-0000-4000-8000-000000000006', 'e2600000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000002', 'E2-P2', 'Producto E2 Dos', 'UND', false, 4, 20),
  ('e2700000-0000-4000-8000-000000000007', 'e2600000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000002', 'E2-P2', 'Producto E2 Dos', 'UND', false, 4, 22);

-- Estados y lineas sin recepcion: nunca aparecen en la lectura.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, received_at,
  cancelled_at, closed_at, closed_by, close_reason
) values
  ('e2600000-0000-4000-8000-000000000008', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000001', '20600000001', 'Proveedor E2 Uno', 'factura', 'E208', '008', '2026-08-01', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'PEN', true, 'draft', null, null, null, null, null, null),
  ('e2600000-0000-4000-8000-000000000009', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000001', '20600000001', 'Proveedor E2 Uno', 'factura', 'E209', '009', '2026-08-02', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'PEN', true, 'issued', '2026-08-02 08:00+00', null, null, null, null, null),
  ('e2600000-0000-4000-8000-000000000010', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000001', '20600000001', 'Proveedor E2 Uno', 'factura', 'E210', '010', '2026-08-03', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'PEN', true, 'cancelled', null, null, '2026-08-04 08:00+00', '2026-08-04 08:00+00', null, 'Anulada sin recepcion');
insert into public.purchase_order_items (id, purchase_order_id, organization_id, product_id, product_code, product_description, unit_of_measure, batch_control, quantity, unit_cost)
values
  ('e2700000-0000-4000-8000-000000000008', 'e2600000-0000-4000-8000-000000000008', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', 'E2-P1', 'Producto E2 Uno', 'UND', false, 2, 99),
  ('e2700000-0000-4000-8000-000000000009', 'e2600000-0000-4000-8000-000000000009', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', 'E2-P1', 'Producto E2 Uno', 'UND', false, 2, 98),
  ('e2700000-0000-4000-8000-000000000010', 'e2600000-0000-4000-8000-000000000010', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', 'E2-P1', 'Producto E2 Uno', 'UND', false, 2, 97);

-- Servicio administrativo: queda visible en el detalle como no inventariable,
-- pero se excluye del resumen de costos de inventario.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, received_at
) values
  ('e2600000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000001', '20600000001', 'Proveedor E2 Uno', 'factura', 'E211', '011', '2026-09-01', 'Almacen E2', 'e2400000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-09-02 08:00+00', '2026-09-03 08:00+00');
insert into public.purchase_order_items (id, purchase_order_id, organization_id, product_id, product_code, product_description, unit_of_measure, batch_control, quantity, unit_cost)
values ('e2700000-0000-4000-8000-000000000011', 'e2600000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000003', 'E2-S1', 'Servicio E2', 'SERV', false, 3, 100);

insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, received_at
) values
  ('e2600000-0000-4000-8000-000000000012', 'e2000000-0000-4000-8000-000000000002', 'e2200000-0000-4000-8000-000000000003', '20600000003', 'Proveedor E2 Otra', 'factura', 'E212', '012', '2026-09-01', 'Almacen E2 Otra', 'e2400000-0000-4000-8000-000000000002', 'PEN', true, 'received', '2026-09-02 08:00+00', '2026-09-03 08:00+00');
insert into public.purchase_order_items (id, purchase_order_id, organization_id, product_id, product_code, product_description, unit_of_measure, batch_control, quantity, unit_cost)
values ('e2700000-0000-4000-8000-000000000012', 'e2600000-0000-4000-8000-000000000012', 'e2000000-0000-4000-8000-000000000002', 'e2300000-0000-4000-8000-000000000004', 'E2-OT', 'Producto E2 Otra', 'UND', false, 1, 50);

insert into public.purchase_receipts (id, organization_id, purchase_order_id, warehouse_id, operation_key, received_at, received_by) values
  ('e2800000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e2600000-0000-4000-8000-000000000001', 'e2400000-0000-4000-8000-000000000001', 'e2810000-0000-4000-8000-000000000001', '2026-01-10 08:00+00', 'e2100000-0000-4000-8000-000000000001'),
  ('e2800000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'e2600000-0000-4000-8000-000000000002', 'e2400000-0000-4000-8000-000000000001', 'e2810000-0000-4000-8000-000000000002', '2026-02-10 08:00+00', 'e2100000-0000-4000-8000-000000000001'),
  ('e2800000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'e2600000-0000-4000-8000-000000000002', 'e2400000-0000-4000-8000-000000000001', 'e2810000-0000-4000-8000-000000000003', '2026-02-11 08:00+00', 'e2100000-0000-4000-8000-000000000001'),
  ('e2800000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'e2600000-0000-4000-8000-000000000003', 'e2400000-0000-4000-8000-000000000001', 'e2810000-0000-4000-8000-000000000004', '2026-03-10 08:00+00', 'e2100000-0000-4000-8000-000000000001'),
  ('e2800000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001', 'e2600000-0000-4000-8000-000000000004', 'e2400000-0000-4000-8000-000000000001', 'e2810000-0000-4000-8000-000000000005', '2026-04-10 08:00+00', 'e2100000-0000-4000-8000-000000000001'),
  ('e2800000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000001', 'e2600000-0000-4000-8000-000000000005', 'e2400000-0000-4000-8000-000000000001', 'e2810000-0000-4000-8000-000000000006', '2026-05-10 08:00+00', 'e2100000-0000-4000-8000-000000000001'),
  ('e2800000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000001', 'e2600000-0000-4000-8000-000000000006', 'e2400000-0000-4000-8000-000000000001', 'e2810000-0000-4000-8000-000000000007', '2026-07-10 10:00+00', 'e2100000-0000-4000-8000-000000000001'),
  ('e2800000-0000-4000-8000-000000000008', 'e2000000-0000-4000-8000-000000000001', 'e2600000-0000-4000-8000-000000000007', 'e2400000-0000-4000-8000-000000000001', 'e2810000-0000-4000-8000-000000000008', '2026-07-10 10:00+00', 'e2100000-0000-4000-8000-000000000001'),
  ('e2800000-0000-4000-8000-000000000009', 'e2000000-0000-4000-8000-000000000001', 'e2600000-0000-4000-8000-000000000011', 'e2400000-0000-4000-8000-000000000001', 'e2810000-0000-4000-8000-000000000009', '2026-09-03 08:00+00', 'e2100000-0000-4000-8000-000000000001'),
  ('e2800000-0000-4000-8000-000000000010', 'e2000000-0000-4000-8000-000000000002', 'e2600000-0000-4000-8000-000000000012', 'e2400000-0000-4000-8000-000000000002', 'e2810000-0000-4000-8000-000000000010', '2026-09-03 08:00+00', 'e2100000-0000-4000-8000-000000000003');

insert into public.purchase_receipt_items (
  id, organization_id, receipt_id, purchase_order_item_id, product_id,
  warehouse_id, location_id, quantity, unit_cost, fulfillment_mode
) values
  ('e2900000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000001', 'e2700000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', 'e2400000-0000-4000-8000-000000000001', 'e2500000-0000-4000-8000-000000000001', 4, 10, 'physical'),
  ('e2900000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000002', 'e2700000-0000-4000-8000-000000000002', 'e2300000-0000-4000-8000-000000000001', 'e2400000-0000-4000-8000-000000000001', 'e2500000-0000-4000-8000-000000000001', 3, 12, 'physical'),
  ('e2900000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000003', 'e2700000-0000-4000-8000-000000000002', 'e2300000-0000-4000-8000-000000000001', 'e2400000-0000-4000-8000-000000000001', 'e2500000-0000-4000-8000-000000000001', 2, 12, 'physical'),
  ('e2900000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000004', 'e2700000-0000-4000-8000-000000000003', 'e2300000-0000-4000-8000-000000000001', 'e2400000-0000-4000-8000-000000000001', 'e2500000-0000-4000-8000-000000000001', 8, 14, 'physical'),
  ('e2900000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000005', 'e2700000-0000-4000-8000-000000000004', 'e2300000-0000-4000-8000-000000000001', 'e2400000-0000-4000-8000-000000000001', 'e2500000-0000-4000-8000-000000000001', 5, 2, 'physical'),
  ('e2900000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000006', 'e2700000-0000-4000-8000-000000000005', 'e2300000-0000-4000-8000-000000000001', 'e2400000-0000-4000-8000-000000000001', 'e2500000-0000-4000-8000-000000000001', 6, 9, 'physical'),
  ('e2900000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000007', 'e2700000-0000-4000-8000-000000000006', 'e2300000-0000-4000-8000-000000000002', 'e2400000-0000-4000-8000-000000000001', 'e2500000-0000-4000-8000-000000000001', 2, 20, 'physical'),
  ('e2900000-0000-4000-8000-000000000008', 'e2000000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000008', 'e2700000-0000-4000-8000-000000000007', 'e2300000-0000-4000-8000-000000000002', 'e2400000-0000-4000-8000-000000000001', 'e2500000-0000-4000-8000-000000000001', 4, 22, 'physical'),
  ('e2900000-0000-4000-8000-000000000009', 'e2000000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000009', 'e2700000-0000-4000-8000-000000000011', 'e2300000-0000-4000-8000-000000000003', null, null, 3, 100, 'administrative'),
  ('e2900000-0000-4000-8000-000000000010', 'e2000000-0000-4000-8000-000000000002', 'e2800000-0000-4000-8000-000000000010', 'e2700000-0000-4000-8000-000000000012', 'e2300000-0000-4000-8000-000000000004', 'e2400000-0000-4000-8000-000000000002', 'e2500000-0000-4000-8000-000000000002', 1, 50, 'physical');

insert into public.supplier_returns (
  id, organization_id, supplier_id, purchase_order_id, purchase_order_item_id,
  purchase_receipt_item_id, product_id, quantity, reason, requested_at,
  responsible_name
) values (
  'e2a00000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e2200000-0000-4000-8000-000000000001',
  'e2600000-0000-4000-8000-000000000003',
  'e2700000-0000-4000-8000-000000000003',
  'e2900000-0000-4000-8000-000000000004',
  'e2300000-0000-4000-8000-000000000001',
  1, 'Devolución de prueba E2', '2026-03-25', 'E2 Compras'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2100000-0000-4000-8000-000000000001', true);

select is((select count(*) from public.supplier_price_history), 9::bigint, 'el detalle cuenta recepciones reales y servicios diferenciados');
select is((select count(*) from public.supplier_purchase_price_summary), 4::bigint, 'el resumen agrupa por proveedor producto moneda y base tributaria');
select is((select quantity from public.supplier_price_history where purchase_receipt_item_id = 'e2900000-0000-4000-8000-000000000001'), 4.000::numeric, 'usa cantidad recibida y no cantidad ordenada');
select is((select received_quantity from public.supplier_purchase_price_summary where supplier_id = 'e2200000-0000-4000-8000-000000000001' and product_id = 'e2300000-0000-4000-8000-000000000001' and currency = 'PEN'), 17.000::numeric, 'las devoluciones no alteran retroactivamente el historico');
select is((select count(*) from public.supplier_price_history where is_inventory_receipt is false), 1::bigint, 'distingue la recepcion administrativa de servicio');
select is((select count(*) from public.supplier_purchase_price_summary where product_id = 'e2300000-0000-4000-8000-000000000003'), 0::bigint, 'excluye servicios del analisis de inventario');
select results_eq(
  $$select purchase_count, receipt_count, received_quantity, latest_unit_cost, previous_unit_cost,
           absolute_variation, percentage_variation, minimum_unit_cost,
           weighted_average_unit_cost, maximum_unit_cost, latest_order_status
      from public.supplier_purchase_price_summary
     where supplier_id = 'e2200000-0000-4000-8000-000000000001'
       and product_id = 'e2300000-0000-4000-8000-000000000001'
       and currency = 'PEN'$$,
  $$values (3, 4, 17.000::numeric, 14.0000::numeric, 12.0000::numeric,
           2.0000::numeric, 16.67::numeric, 10.0000::numeric,
           12.4706::numeric, 14.0000::numeric, 'closed_partial')$$,
  'calcula el resumen PEN con recepciones parciales y promedio ponderado'
);
select results_eq(
  $$select purchase_count, receipt_count, received_quantity, latest_unit_cost, previous_unit_cost
      from public.supplier_purchase_price_summary
     where supplier_id = 'e2200000-0000-4000-8000-000000000001'
       and product_id = 'e2300000-0000-4000-8000-000000000001'
       and currency = 'USD'$$,
  $$values (1, 1, 5.000::numeric, 2.0000::numeric, null::numeric)$$,
  'mantiene USD separado de PEN y no fabrica costo anterior'
);
select results_eq(
  $$select latest_unit_cost, previous_unit_cost, absolute_variation, percentage_variation,
           weighted_average_unit_cost, minimum_unit_cost, maximum_unit_cost
      from public.supplier_purchase_price_summary
     where supplier_id = 'e2200000-0000-4000-8000-000000000001'
       and product_id = 'e2300000-0000-4000-8000-000000000002'$$,
  $$values (22.0000::numeric, 20.0000::numeric, 2.0000::numeric, 10.00::numeric,
           21.3333::numeric, 20.0000::numeric, 22.0000::numeric)$$,
  'resuelve el ultimo costo con desempate determinista'
);
select is((select count(*) from public.supplier_purchase_price_summary where product_id = 'e2300000-0000-4000-8000-000000000001' and supplier_id = 'e2200000-0000-4000-8000-000000000001'), 2::bigint, 'separan las dos monedas del mismo producto y proveedor');
select is((select count(*) from public.supplier_price_history where order_status in ('draft', 'issued', 'cancelled')), 0::bigint, 'excluye estados sin recepcion del detalle');
select results_eq(
  $$select received_quantity, latest_unit_cost, previous_unit_cost
      from public.get_supplier_purchase_price_summary(
        'e2000000-0000-4000-8000-000000000001',
        'e2300000-0000-4000-8000-000000000001',
        'e2200000-0000-4000-8000-000000000001',
        '2026-03-01 00:00+00', null
      )
     where currency = 'PEN'$$,
  $$values (8.000::numeric, 14.0000::numeric, null::numeric)$$,
  'aplica el periodo sobre received_at antes de agregar'
);
select results_eq(
  $$select purchase_receipt_id, unit_cost
      from public.get_supplier_purchase_price_history(
        'e2000000-0000-4000-8000-000000000001',
        'e2300000-0000-4000-8000-000000000002', null, null, null
      )$$,
  $$values ('e2800000-0000-4000-8000-000000000008'::uuid, 22.0000::numeric),
           ('e2800000-0000-4000-8000-000000000007'::uuid, 20.0000::numeric)$$,
  'ordena recepciones empatadas por identificador estable'
);
select is((select unit_cost_with_tax from public.supplier_price_history where purchase_receipt_item_id = 'e2900000-0000-4000-8000-000000000001'), 10.0000::numeric, 'expone costo con IGV cuando la orden incluye IGV');
select is((select unit_cost_without_tax from public.supplier_price_history where purchase_receipt_item_id = 'e2900000-0000-4000-8000-000000000001'), 8.4746::numeric, 'deriva costo sin IGV solo con snapshot gravado compatible');
select is((select count(*) from public.supplier_purchase_price_summary where supplier_id = 'e2200000-0000-4000-8000-000000000002' and product_id = 'e2300000-0000-4000-8000-000000000001'), 1::bigint, 'permite comparar dos proveedores del mismo producto');
select is((select count(*) from public.supplier_purchase_price_summary where supplier_id = 'e2200000-0000-4000-8000-000000000001' and product_id = 'e2300000-0000-4000-8000-000000000002'), 1::bigint, 'permite consultar varios productos del mismo proveedor');
select is((select tax_basis from public.supplier_purchase_price_summary where product_id = 'e2300000-0000-4000-8000-000000000002'), 'not_applicable', 'conserva una base tributaria compatible para exonerados');
select lives_ok(
  $$select public.get_supplier_purchase_price_summary('e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', null, null, null)$$,
  'un usuario con PURCHASES_VIEW puede consultar por producto'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2100000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.get_supplier_purchase_price_summary('e2000000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-000000000001', null, null, null)$$,
  'ALMACEN conserva la lectura de compras por producto'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2100000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.get_supplier_purchase_price_summary('e2000000-0000-4000-8000-000000000001', null, null, null, null)$$,
  '42501', 'E2_PRICE_HISTORY_FORBIDDEN', 'un usuario sin PURCHASES_VIEW no puede consultar precios'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2100000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.get_supplier_purchase_price_summary('e2000000-0000-4000-8000-000000000001', null, 'e2200000-0000-4000-8000-000000000001', null, null)$$,
  '42501', 'E2_SUPPLIER_PRICE_HISTORY_FORBIDDEN', 'la lectura por proveedor exige SUPPLIERS_VIEW'
);
select is((select count(*) from public.supplier_price_history where organization_id = 'e2000000-0000-4000-8000-000000000002'), 0::bigint, 'RLS aisla la otra organizacion');
select throws_ok(
  $$select public.get_supplier_purchase_price_summary('e2000000-0000-4000-8000-000000000002', null, null, null, null)$$,
  '42501', 'E2_PRICE_HISTORY_FORBIDDEN', 'la funcion valida la organizacion solicitada'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2100000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.get_supplier_purchase_price_summary('e2000000-0000-4000-8000-000000000001', null, null, '2026-04-01 00:00+00', '2026-03-01 00:00+00')$$,
  '22023', 'E2_PRICE_HISTORY_PERIOD_INVALID', 'rechaza rangos temporales invertidos'
);

select * from finish();
rollback;
